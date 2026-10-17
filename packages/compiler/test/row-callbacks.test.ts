import { describe, expect, test } from "bun:test";

import { join } from "node:path";

import { compileSource, loadModule } from "./harness.ts";

/**
 * A flow construct's callback written by name, as a `function` declaration or a
 * `const`, is the same callback written inline: it is handed the row or the
 * narrowed value, and its reads of that value are as live as the inline one's.
 * A `<Match>` hands the narrowed accessor unless it is keyed, at every level,
 * as `<Show>` does.
 */
const IMPORTS = join(import.meta.dir, "row-callbacks-imports.ts");

const SOURCE = `
import { For, Match, Repeat, Show, Switch, createStore } from "@barqjs/core";
import { count, describePick, labels, renderRow } from ${JSON.stringify(IMPORTS)};
export const [state, setState] = createStore({
  rows: [{ id: 1, label: "salama", done: false }],
  picked: { name: "salama" } as { name: string } | null,
});

function declaredRow(row) { return <li class={row.done ? "done" : "open"}>{row.label}</li>; }
const namedRow = (row) => <li class={row.done ? "done" : "open"}>{row.label}</li>;
function declaredPick(picked) { return <b>{picked().name}</b>; }

export function DeclaredFor() { return <ul><For each={state.rows}>{declaredRow}</For></ul>; }
export function NamedFor() { return <ul><For each={state.rows}>{namedRow}</For></ul>; }
export function DeclaredShow() { return <p><Show when={state.picked}>{declaredPick}</Show></p>; }
export function DeclaredMatch() {
  return <p><Switch><Match when={state.picked}>{declaredPick}</Match></Switch></p>;
}
export function InlineMatch() {
  return <p><Switch><Match when={state.picked}>{(picked) => <b>{picked().name}</b>}</Match></Switch></p>;
}
let reassigned = (row) => null;
reassigned = renderRow;
function rows(render) { return <ul><For each={state.rows}>{render}</For></ul>; }

export function ImportedFor() { return <ul><For each={state.rows}>{renderRow}</For></ul>; }
export function MemberFor() { return <ul><For each={state.rows}>{labels.renderRow}</For></ul>; }
export function ReassignedFor() { return <ul><For each={state.rows}>{reassigned}</For></ul>; }
export function ParameterFor() { return rows(renderRow); }
export function AttributeFor() { return <ul><For each={state.rows} children={renderRow} /></ul>; }
export function ImportedRepeat() {
  return <ul><Repeat count={2}>{(index) => <li>{index}</li>}</Repeat><Repeat count={1} from={4}>{labels.index}</Repeat></ul>;
}
export function ImportedShowCallback() { return <p><Show when={state.picked}>{describePick}</Show></p>; }
export function ImportedMatchCallback() {
  return <p><Switch><Match when={state.picked}>{describePick}</Match></Switch></p>;
}
export function ImportedShowValue() { return <p><Show when={state.picked}>{count}</Show></p>; }
export function KeyedMatch() {
  return <p><Switch><Match when={state.picked} keyed>{(picked) => <b>{picked.name}</b>}</Match></Switch></p>;
}
`;

type Module = Record<string, () => unknown> & {
  setState: (change: (draft: never) => void) => void;
};

async function mounted(name: string, optimize: number) {
  const core = await import("@barqjs/core");
  const code = compileSource(SOURCE, "row-callbacks.tsx", { optimize });
  const module = (await loadModule(code, `row-callbacks-${name}-${optimize}`)) as unknown as Module;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = core.render(() => module[name]!() as never, host);
  return {
    host,
    write: (change: (draft: never) => void): void => {
      module.setState(change);
      core.flush();
    },
    dispose: () => {
      dispose();
      host.remove();
    },
  };
}

for (const optimize of [0, 2]) {
  describe(`a callback passed by name, at -O${optimize}`, () => {
    for (const name of ["DeclaredFor", "NamedFor"]) {
      test(`${name}: each row is handed to it and follows a write in place`, async () => {
        const view = await mounted(name, optimize);
        try {
          const row = view.host.querySelector("li");
          expect(row?.textContent).toBe("salama");
          expect(row?.className).toBe("open");
          view.write((draft: { rows: { label: string; done: boolean }[] }) => {
            draft.rows[0]!.label = "salama ashoush";
            draft.rows[0]!.done = true;
          });
          expect(view.host.querySelector("li")).toBe(row);
          expect(row?.textContent).toBe("salama ashoush");
          expect(row?.className).toBe("done");
          view.write((draft: { rows: { id: number; label: string; done: boolean }[] }) => {
            draft.rows.push({ id: 2, label: "example.com", done: false });
          });
          expect([...view.host.querySelectorAll("li")].map((node) => node.textContent)).toEqual([
            "salama ashoush",
            "example.com",
          ]);
        } finally {
          view.dispose();
        }
      });
    }

    for (const name of ["DeclaredShow", "DeclaredMatch", "InlineMatch", "KeyedMatch"]) {
      test(`${name}: the narrowed value is handed to it`, async () => {
        const view = await mounted(name, optimize);
        try {
          expect(view.host.querySelector("b")?.textContent).toBe("salama");
          view.write((draft: { picked: { name: string } | null }) => {
            draft.picked!.name = "salama ashoush";
          });
          expect(view.host.querySelector("b")?.textContent).toBe("salama ashoush");
          view.write((draft: { picked: { name: string } | null }) => {
            draft.picked = null;
          });
          expect(view.host.querySelector("b")).toBeNull();
        } finally {
          view.dispose();
        }
      });
    }
  });
}

/**
 * A child the compiler cannot see the kind of goes to the construct as written,
 * which decides it by Solid 2.0's rule: `For` calls it with each row
 * (`solid/src/client/flow.ts:96`), `Repeat` calls any function with the index
 * (`:140`), and `Show` and `Match` call a function that declares a parameter,
 * untracked, and render anything else, so a signal handed to them stays live
 * (`:232`, `:323`).
 */
for (const optimize of [0, 2]) {
  describe(`a child of unknown kind, at -O${optimize}`, () => {
    for (const name of [
      "ImportedFor",
      "MemberFor",
      "ReassignedFor",
      "ParameterFor",
      "AttributeFor",
    ]) {
      test(`${name}: For calls it with each row`, async () => {
        const view = await mounted(name, optimize);
        try {
          expect([...view.host.querySelectorAll("li")].map((node) => node.textContent)).toEqual([
            "salama",
          ]);
          view.write((draft: { rows: { id: number; label: string; done: boolean }[] }) => {
            draft.rows.push({ id: 2, label: "example.com", done: false });
          });
          expect([...view.host.querySelectorAll("li")].map((node) => node.textContent)).toEqual([
            "salama",
            "example.com",
          ]);
        } finally {
          view.dispose();
        }
      });
    }

    test("Repeat calls a function child with the shifted index", async () => {
      const view = await mounted("ImportedRepeat", optimize);
      try {
        expect(view.host.textContent).toBe("014");
      } finally {
        view.dispose();
      }
    });

    for (const name of ["ImportedShowCallback", "ImportedMatchCallback"]) {
      test(`${name}: a function that declares a parameter is called with the narrowed value`, async () => {
        const view = await mounted(name, optimize);
        try {
          expect(view.host.querySelector("p")?.textContent).toBe("picked salama");
          view.write((draft: { picked: { name: string } | null }) => {
            draft.picked = null;
          });
          expect(view.host.querySelector("p")?.textContent).toBe("");
        } finally {
          view.dispose();
        }
      });
    }

    test("Show renders a zero-arity function child as a live value", async () => {
      const { setCount } = await import(IMPORTS);
      const core = await import("@barqjs/core");
      setCount(1);
      core.flush();
      const view = await mounted("ImportedShowValue", optimize);
      try {
        expect(view.host.querySelector("p")?.textContent).toBe("1");
        setCount(2);
        core.flush();
        expect(view.host.querySelector("p")?.textContent).toBe("2");
      } finally {
        view.dispose();
      }
    });
  });
}
