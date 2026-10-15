import { describe, expect, test } from "bun:test";

import { compileText, host, shape, wire } from "./hydration.ts";

/**
 * The server writes a portal as an empty range where the portal is declared,
 * because its content belongs somewhere the string has no way to reach. That
 * range is the portal's own to claim, whatever stands around it.
 */
const SHAPES: Record<string, string> = {
  "inside a condition": `
import { Show, Portal, createSignal } from "@barqjs/core";
export const [open, setOpen] = createSignal(true);
export default function Page() {
  return <main><Show when={open()}><Portal><div class="dialog">saved</div></Portal></Show><p>after</p></main>;
}`,
  "as a component's whole value": `
import { Show, Portal, createSignal } from "@barqjs/core";
export const [open, setOpen] = createSignal(true);
function Dialog() { return <Show when={open()}><Portal><div class="dialog">saved</div></Portal></Show>; }
export default function Page() { return <main><h1>Orders</h1><Dialog /><p>after</p></main>; }`,
  "beside its trigger in a fragment": `
import { Show, Portal, createSignal } from "@barqjs/core";
export const [open, setOpen] = createSignal(true);
function Dialog() {
  return <><button>open</button><Show when={open()}><Portal><div class="dialog">saved</div></Portal></Show></>;
}
export default function Page() { return <main><Dialog /><p>after</p></main>; }`,
};

async function hydrated(source: string, tag: string) {
  const core = await import("@barqjs/core");
  const compiled = await compileText(source, `portal-hydration-${tag}`);
  const page = host(wire(compiled.ssr));
  const stop = core.hydrate(compiled.dom.default as never, page);
  core.flush();
  return {
    page,
    report: core.hydrate.report,
    setOpen: (compiled.dom as unknown as { setOpen: (value: boolean) => void }).setOpen,
    flush: () => core.flush(),
    dispose: () => {
      stop();
      page.remove();
    },
  };
}

const dialogs = (): number => document.querySelectorAll(".dialog").length;

describe("a portal the server declared", () => {
  let index = 0;
  for (const [name, source] of Object.entries(SHAPES)) {
    const tag = `shape-${index++}`;

    test(`${name}: hydrates without a mismatch and mounts once`, async () => {
      const view = await hydrated(source, tag);
      try {
        expect(view.report.mismatches).toEqual([]);
        expect(view.report.recovered).toBe(false);
        expect(dialogs()).toBe(1);
      } finally {
        view.dispose();
      }
      expect(dialogs()).toBe(0);
    });

    test(`${name}: closes and reopens where it was declared`, async () => {
      const view = await hydrated(source, `${tag}-toggle`);
      try {
        const before = shape(view.page);
        view.setOpen(false);
        view.flush();
        expect(dialogs()).toBe(0);
        view.setOpen(true);
        view.flush();
        expect(dialogs()).toBe(1);
        expect(shape(view.page)).toBe(before);
        expect(view.page.querySelector("main")?.lastElementChild?.textContent).toBe("after");
      } finally {
        view.dispose();
      }
    });
  }
});
