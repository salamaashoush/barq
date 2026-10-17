import { describe, expect, test } from "bun:test";

import { compileSource, loadModule } from "./harness.ts";

/**
 * SEMANTICS X2: a provided value is a Cell. A provider whose value changes
 * does not rebuild its children, so every node under it survives and only the
 * consumer's own read moves, whether the value is written as an expression or
 * as an accessor. Every write site stores a Cell, so one key read through
 * `getContext` and through `useContext` gives the same answer.
 */
const SOURCE = `
import { createContext, createSignal, getContext, setContext, useContext } from "@barqjs/core";
export const Theme = createContext<string>();
export const [theme, setTheme] = createSignal("light");
function Label() {
  const value = useContext(Theme);
  return <p class="label"><b>theme</b> <span>{value()}</span></p>;
}
export function Expression() {
  return <div><Theme value={theme()}><Label /><i>static</i></Theme></div>;
}
export function Accessor() {
  return <div><Theme value={() => theme()}><Label /><i>static</i></Theme></div>;
}
export const reads: unknown[] = [];
function Reader() {
  reads.push(getContext(Theme), useContext(Theme)());
  return <i />;
}
export const marker = () => "a function stored as a value";
export function Provided() {
  return <Theme value="plain"><Reader /></Theme>;
}
export function Set() {
  setContext(Theme, marker as never);
  return <Reader />;
}
`;

async function mount(name: string) {
  const core = await import("@barqjs/core");
  const web = await import("@barqjs/web");
  const module = (await loadModule(
    compileSource(SOURCE, "context-value-live.tsx"),
    `context-value-live-${name}`,
  )) as unknown as Record<string, unknown> & {
    setTheme: (value: string) => void;
    reads: unknown[];
    marker: () => string;
  };
  module.setTheme("light");
  module.reads.length = 0;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = web.render(() => (module[name] as () => never)(), host);
  return {
    core,
    module,
    host,
    dispose: () => {
      dispose();
      host.remove();
    },
  };
}

function nodes(root: Node): Node[] {
  const out: Node[] = [];
  const walk = (node: Node): void => {
    out.push(node);
    for (const child of node.childNodes) walk(child);
  };
  walk(root);
  return out;
}

describe("X2, a provided value is a Cell", () => {
  for (const form of ["Expression", "Accessor"]) {
    test(`${form}: the consumer's text follows the value and every node survives`, async () => {
      const view = await mount(form);
      try {
        const before = nodes(view.host);
        expect(view.host.querySelector("span")?.textContent).toBe("light");
        view.module.setTheme("dark");
        view.core.flush();
        expect(view.host.querySelector("span")?.textContent).toBe("dark");
        const after = nodes(view.host);
        expect(after.length).toBe(before.length);
        expect(after.every((node, i) => node === before[i])).toBe(true);
      } finally {
        view.dispose();
      }
    });
  }

  test("a provided plain value reads the same through getContext and useContext", async () => {
    const view = await mount("Provided");
    try {
      expect(view.module.reads).toEqual(["plain", "plain"]);
    } finally {
      view.dispose();
    }
  });

  test("a function set as a value is returned by both readers, not invoked", async () => {
    const view = await mount("Set");
    try {
      expect(view.module.reads).toEqual([view.module.marker, view.module.marker]);
    } finally {
      view.dispose();
    }
  });
});
