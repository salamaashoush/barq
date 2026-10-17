import { describe, expect, test } from "bun:test";

import { compileSource, loadModule } from "./harness.ts";

/**
 * An element whose only binding is `class` hands its effect the class STRING,
 * so the value the effect compares is the value the element shows.
 */
const SOURCE = `
import { createSignal, createStore } from "@barqjs/core";
export const [state, setState] = createStore({ cls: { active: false, salama: true } });
export const [count, setCount] = createSignal(1);
export function FromStore() {
  return <p class={state.cls} />;
}
export function Settled() {
  return <p class={count() > 0 ? "positive" : "negative"} />;
}
`;

async function mounted(name: string) {
  const core = await import("@barqjs/core");
  const web = await import("@barqjs/web");
  const module = (await loadModule(
    compileSource(SOURCE, "class-binding.tsx"),
    `class-binding-${name}`,
  )) as unknown as Record<string, (value?: never) => unknown>;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = web.render(() => module[name]() as never, host);
  return {
    core,
    module,
    element: host.firstElementChild as HTMLElement,
    dispose: () => {
      dispose();
      host.remove();
    },
  };
}

describe("a lone class binding", () => {
  test("a class map held in a store follows a key written inside it", async () => {
    const view = await mounted("FromStore");
    try {
      expect(view.element.className).toBe("salama");
      (view.module.setState as unknown as (fn: (draft: never) => void) => void)(
        (draft: { cls: { active: boolean } }) => {
          draft.cls.active = true;
        },
      );
      view.core.flush();
      expect(view.element.className).toBe("active salama");
    } finally {
      view.dispose();
    }
  });

  test("a token another hand added survives an update that leaves the class unchanged", async () => {
    const view = await mounted("Settled");
    try {
      expect(view.element.className).toBe("positive");
      view.element.classList.add("example");
      (view.module.setCount as unknown as (n: number) => void)(2);
      view.core.flush();
      expect(view.element.className).toBe("positive example");
      (view.module.setCount as unknown as (n: number) => void)(-1);
      view.core.flush();
      expect(view.element.className).toBe("example negative");
    } finally {
      view.dispose();
    }
  });

  test("is emitted as a scalar effect over the class string", () => {
    const code = compileSource(SOURCE, "class-binding.tsx");
    expect(code).toContain("_$classToString(state.cls)");
    expect(code).toContain('_$bindEffect(() => count() > 0 ? "positive" : "negative", (_v$, _p$)');
    expect(code).not.toContain("_v$.a");
  });
});
