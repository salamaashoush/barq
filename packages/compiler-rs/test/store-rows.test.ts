import { describe, expect, test } from "bun:test";

import { compileSource, loadModule } from "./harness.ts";

/**
 * A member read off a value the compiler knows nothing about may be a store's
 * read. A list row is the case that decides it: the row is the same object when
 * one of its fields is written in place, so nothing rebuilds the row and the
 * field has to be read where it is shown.
 */
const SOURCE = `
import { For, Show, createSignal, createStore } from "@barqjs/core";
export const [state, setState] = createStore({
  title: "orders",
  rows: [{ id: 1, label: "ada", done: false }, { id: 2, label: "grace", done: true }],
  picked: { name: "ada" } as { name: string } | null,
});
function useOrders() { return { state }; }
const labels = { open: "open", done: "done" };

export function Rows() {
  return <ul><For each={state.rows}>{(row) => <li class={row.done ? labels.done : labels.open} title={row.label}>{row.label}</li>}</For></ul>;
}
export function Mapped() {
  return <ul>{state.rows.map((row) => <li>{row.label}</li>)}</ul>;
}
export function Hooked() {
  const orders = useOrders();
  return <h1 title={orders.state.title}>{orders.state.title}</h1>;
}
export function Keyed() {
  return <Show when={state.picked} keyed>{(picked) => <b title={picked.name}>{picked.name}</b>}</Show>;
}
export function Table() { return <p class={labels.open}>{labels.done}</p>; }
`;

async function mounted(name: string) {
  const core = await import("@barqjs/core");
  const code = compileSource(SOURCE, "store-rows.tsx");
  const module = (await loadModule(code, `store-rows-${name}`)) as unknown as Record<
    string,
    (value?: never) => unknown
  >;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = core.render(() => module[name]() as never, host);
  const write = (change: (draft: Record<string, never>) => void): void => {
    (module.setState as unknown as (fn: typeof change) => void)(change);
    core.flush();
  };
  return {
    host,
    code,
    write,
    dispose: () => {
      dispose();
      host.remove();
    },
  };
}

describe("a field of a store read through a value the compiler cannot name", () => {
  test("a list row follows a write to its own field, and stays the same node", async () => {
    const view = await mounted("Rows");
    try {
      const first = view.host.querySelector("li");
      view.write((draft) => {
        const rows = draft.rows as unknown as { label: string; done: boolean }[];
        rows[0]!.label = "ada lovelace";
        rows[0]!.done = true;
      });
      expect(view.host.querySelector("li")).toBe(first);
      expect(first?.textContent).toBe("ada lovelace");
      expect(first?.title).toBe("ada lovelace");
      expect(first?.className).toBe("done");
    } finally {
      view.dispose();
    }
  });

  test("a row built by map follows it too", async () => {
    const view = await mounted("Mapped");
    try {
      view.write((draft) => {
        (draft.rows as unknown as { label: string }[])[1]!.label = "grace hopper";
      });
      expect([...view.host.querySelectorAll("li")].map((node) => node.textContent)).toEqual([
        "ada",
        "grace hopper",
      ]);
    } finally {
      view.dispose();
    }
  });

  test("a store handed back by a function is followed in an attribute and in text", async () => {
    const view = await mounted("Hooked");
    try {
      view.write((draft) => {
        (draft as unknown as { title: string }).title = "invoices";
      });
      const heading = view.host.querySelector("h1");
      expect(heading?.textContent).toBe("invoices");
      expect(heading?.title).toBe("invoices");
    } finally {
      view.dispose();
    }
  });

  test("the value a keyed <Show> hands its body is followed the same way", async () => {
    const view = await mounted("Keyed");
    try {
      const shown = view.host.querySelector("b");
      view.write((draft) => {
        (draft.picked as unknown as { name: string }).name = "edsger";
      });
      expect(view.host.querySelector("b")).toBe(shown);
      expect(shown?.textContent).toBe("edsger");
      expect(shown?.title).toBe("edsger");
    } finally {
      view.dispose();
    }
  });

  test("a table of constants is still read once, with no effect behind it", async () => {
    const view = await mounted("Table");
    try {
      expect(view.code).toContain('"class", labels.open)');
      expect(view.code).toContain("_$insert(_el$4, labels.done)");
      expect(view.host.querySelector("p")?.className).toBe("open");
    } finally {
      view.dispose();
    }
  });
});
