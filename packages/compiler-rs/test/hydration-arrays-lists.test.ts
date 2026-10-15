import { describe, expect, test } from "bun:test";

import { compileText, host, shape, wire } from "./hydration.ts";

interface Page {
  hydrated: HTMLElement;
  cold: HTMLElement;
  hot: Record<string, (value: never) => void>;
  ref: Record<string, (value: never) => void>;
  report: { mismatches: readonly { kind: string; detail: string }[]; recovered: boolean };
  flush(): void;
  dispose(): void;
}

/**
 * The server's markup hydrated beside a cold client render of the same module,
 * with `arrange` applied to both client modules before either mounts.
 */
async function pages(
  source: string,
  tag: string,
  arrange?: (module: Record<string, (value: never) => void>) => void,
  observe?: (container: HTMLElement) => void,
): Promise<Page> {
  const core = await import("@barqjs/core");
  const hot = await compileText(source, `arrays-lists-hot-${tag}`);
  const ref = await compileText(source, `arrays-lists-cold-${tag}`);
  const hydrated = host(wire(hot.ssr));
  const cold = host("");
  const hotModule = hot.dom as unknown as Record<string, (value: never) => void>;
  const refModule = ref.dom as unknown as Record<string, (value: never) => void>;
  arrange?.(hotModule);
  arrange?.(refModule);
  core.flush();
  observe?.(hydrated);
  const stopHot = core.hydrate(hot.dom.default as never, hydrated);
  const report = core.hydrate.report;
  const stopCold = core.render(ref.dom.default as never, cold);
  return {
    hydrated,
    cold,
    hot: hotModule,
    ref: refModule,
    report,
    flush: () => core.flush(),
    dispose: () => {
      stopHot();
      stopCold();
      hydrated.remove();
      cold.remove();
    },
  };
}

describe("a fragment value that holds text beside a region", () => {
  const SOURCE = `
import { Show, createSignal } from "@barqjs/core";
export const [open, setOpen] = createSignal(true);
function Summary() {
  return <><h2>Orders</h2><Show when={open()}><p>3 pending</p></Show>updated today</>;
}
export default function Page() { return <main><Summary /></main>; }`;

  test("keeps the region the server rendered", async () => {
    const page = await pages(SOURCE, "fragment-text");
    try {
      expect(page.report.recovered).toBe(false);
      expect(shape(page.hydrated)).toBe(shape(page.cold));
    } finally {
      page.dispose();
    }
  });

  test("and the region still answers its condition afterwards", async () => {
    const page = await pages(SOURCE, "fragment-text-toggle");
    try {
      for (const next of [false, true]) {
        page.hot.setOpen(next as never);
        page.ref.setOpen(next as never);
        page.flush();
        expect(shape(page.hydrated)).toBe(shape(page.cold));
      }
    } finally {
      page.dispose();
    }
  });
});

describe("a fragment at the root of the page", () => {
  test("an element followed by a region keeps the server's order", async () => {
    const page = await pages(
      `
import { Show, createSignal } from "@barqjs/core";
export const [open, setOpen] = createSignal(true);
export default function Page() { return <><h1>Orders</h1><Show when={open()}><p>3 pending</p></Show></>; }`,
      "root-region",
    );
    try {
      expect(shape(page.hydrated)).toBe(shape(page.cold));
    } finally {
      page.dispose();
    }
  });

  test("an element followed by text does not render the text twice", async () => {
    const page = await pages(
      `export default function Page() { return <><h1>Orders</h1>updated today</>; }`,
      "root-text",
    );
    try {
      expect(shape(page.hydrated)).toBe(shape(page.cold));
    } finally {
      page.dispose();
    }
  });
});

describe("a list the client renders shorter than the server did", () => {
  const SOURCE = `
import { For, createSignal } from "@barqjs/core";
export const [rows, setRows] = createSignal(["ada", "grace", "edsger"]);
export default function Page() { return <ul><For each={rows()}>{(row) => <li>{row}</li>}</For></ul>; }`;

  test("keeps the rows it does render", async () => {
    const page = await pages(SOURCE, "short-list", (module) => module.setRows(["ada"] as never));
    try {
      expect(shape(page.hydrated)).toBe("<ul><li>ada</li></ul>");
    } finally {
      page.dispose();
    }
  });

  test("with static siblings around the list", async () => {
    const page = await pages(
      `
import { For, createSignal } from "@barqjs/core";
export const [rows, setRows] = createSignal(["ada", "grace", "edsger"]);
export default function Page() { return <ul><li>first</li><For each={rows()}>{(row) => <li>{row}</li>}</For><li>last</li></ul>; }`,
      "short-list-siblings",
      (module) => module.setRows(["ada"] as never),
    );
    try {
      expect(shape(page.hydrated)).toBe(shape(page.cold));
    } finally {
      page.dispose();
    }
  });
});

describe("a list that matches the server's", () => {
  test("is claimed where it stands, with no row removed and re-inserted", async () => {
    const records: MutationRecord[] = [];
    let observer: MutationObserver | undefined;
    const page = await pages(
      `
import { For, createSignal } from "@barqjs/core";
export const [rows, setRows] = createSignal(["ada", "grace", "edsger"]);
export default function Page() { return <ul><For each={rows()}>{(row) => <li>{row}</li>}</For></ul>; }`,
      "list-moves",
      undefined,
      (container) => {
        observer = new MutationObserver((batch) => {
          records.push(...batch);
        });
        observer.observe(container, { childList: true, subtree: true });
      },
    );
    try {
      records.push(...(observer?.takeRecords() ?? []));
      observer?.disconnect();
      expect(page.report.mismatches).toEqual([]);
      expect(records.length).toBe(0);
    } finally {
      page.dispose();
    }
  });

  test("an empty list whose fallback the server wrote hydrates without recovery", async () => {
    const page = await pages(
      `
import { For, createSignal } from "@barqjs/core";
export const [rows, setRows] = createSignal([]);
export default function Page() { return <ul><For each={rows()} fallback={<li>no orders</li>}>{(row) => <li>{row}</li>}</For></ul>; }`,
      "list-fallback",
    );
    try {
      expect(page.report.mismatches).toEqual([]);
      expect(page.report.recovered).toBe(false);
    } finally {
      page.dispose();
    }
  });
});
