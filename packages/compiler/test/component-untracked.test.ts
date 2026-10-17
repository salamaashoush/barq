import { describe, expect, test } from "bun:test";

import { compileSource, loadModule } from "./harness.ts";

/**
 * SEMANTICS R1: a component's setup runs once. A signal it reads while it sets
 * up is read untracked, wherever the component is called from, so the read
 * never rebuilds it.
 */
const SOURCE = `
import { createSignal } from "@barqjs/core";
export const [vis, setVis] = createSignal(true);
export const [on, setOn] = createSignal(false);
export const [items] = createSignal([1, 2]);
export const setups = { count: 0 };
function Gate(props) {
  setups.count++;
  const first = on();
  return <b>{first ? "salama" : "example.com"}</b>;
}
export function Chosen() {
  return <div>{vis() ? <Gate on={() => on()} /> : null}</div>;
}
export function Listed() {
  return <div>{items().map(() => <Gate />)}</div>;
}
export function Branched() {
  return <div>{() => { if (vis()) return <Gate />; return null; }}</div>;
}
export function Direct() {
  return <div><Gate /></div>;
}
`;

async function mounted(name: string) {
  const core = await import("@barqjs/core");
  const web = await import("@barqjs/web");
  const module = (await loadModule(
    compileSource(SOURCE, "component-untracked.tsx"),
    `component-untracked-${name}`,
  )) as unknown as {
    setVis: (v: boolean) => void;
    setOn: (v: boolean) => void;
    setups: { count: number };
  } & Record<string, () => unknown>;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = web.render(() => module[name]() as never, host);
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

describe("a component called inside a reactive expression", () => {
  test("is not rebuilt by a signal its setup read", async () => {
    const view = await mounted("Chosen");
    try {
      const built = view.host.querySelector("b");
      expect(built?.textContent).toBe("example.com");
      expect(view.module.setups.count).toBe(1);
      view.module.setOn(true);
      view.core.flush();
      expect(view.module.setups.count).toBe(1);
      expect(view.host.querySelector("b")).toBe(built);
      view.module.setVis(false);
      view.core.flush();
      expect(view.host.querySelector("b")).toBeNull();
      view.module.setVis(true);
      view.core.flush();
      expect(view.module.setups.count).toBe(2);
      expect(view.host.querySelector("b")?.textContent).toBe("salama");
    } finally {
      view.dispose();
    }
  });

  test("is not rebuilt when it is built inside a mapped list", async () => {
    const view = await mounted("Listed");
    try {
      expect(view.module.setups.count).toBe(2);
      view.module.setOn(true);
      view.core.flush();
      expect(view.module.setups.count).toBe(2);
    } finally {
      view.dispose();
    }
  });

  test("is not rebuilt when a thunk at the hole branches to it", async () => {
    const view = await mounted("Branched");
    try {
      const built = view.host.querySelector("b");
      expect(view.module.setups.count).toBe(1);
      view.module.setOn(true);
      view.core.flush();
      expect(view.module.setups.count).toBe(1);
      expect(view.host.querySelector("b")).toBe(built);
    } finally {
      view.dispose();
    }
  });

  test("is wrapped where it may run under a compute, and only there", () => {
    const code = compileSource(SOURCE, "component-untracked.tsx");
    expect(code).toContain("vis() ? _$untrack(() => Gate({ on }))");
    expect(code).toContain("_$untrack(() => Gate({}))");
    expect(code).toContain("_$insert(_el$");
    expect(code.match(/_\$untrack\(/g)?.length).toBe(3);
  });
});
