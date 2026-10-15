/**
 * The runtime facts the compiler's render-scope diagnostics (BARQ018 to
 * BARQ021) state as their reason. Each source here is compiled twice: once in
 * development to show the code the compiler reports, and once to run, to show
 * that what the message says happens does happen. If the renderer or the
 * engine stops behaving this way, the message is wrong and this fails.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { DEV as ENGINE_DEV } from "@solidjs/signals";
import { transform } from "@barqjs/compiler-rs";

import { createRoot, flush, render, type JSXElement } from "./index.ts";
import { compileModule } from "./test-compile.ts";

afterEach(() => {
  document.body.textContent = "";
});

const host = (): HTMLElement => {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
};

function reported(source: string): string[] {
  return transform(source, { filename: "/app/src/view.tsx", dev: true })
    .diagnostics.map((diagnostic) => diagnostic.code ?? "")
    .filter((code) => code !== "");
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

interface Toggle {
  View: () => JSXElement;
  setOn: (on: boolean) => void;
}

describe("BARQ018: a component body decides once", () => {
  const body = (choice: string): string => `import { Show, createSignal } from "@barqjs/core";
const [on, setOn] = createSignal(false);
export { setOn };
export function View() {
  ${choice}
}`;
  const once = body("if (!on()) return <p>off</p>;\n  return <p>on</p>;");
  const live = body("return <Show when={on()} fallback={<p>off</p>}><p>on</p></Show>;");

  test("the compiler reports the early return and not the <Show>", () => {
    expect(reported(once)).toEqual(["BARQ018"]);
    expect(reported(live)).toEqual([]);
  });

  test("the early return keeps its first choice and the <Show> follows the signal", async () => {
    for (const [source, after] of [
      [once, "<p>off</p>"],
      [live, "<p>on</p>"],
    ] as const) {
      const { View, setOn } = await compileModule<Toggle>(source, "choice");
      const element = host();
      const dispose = render(() => View(), element);
      flush();
      expect(element.textContent).toBe("off");
      setOn(true);
      flush();
      expect(element.innerHTML).toContain(after);
      dispose();
    }
  });
});

describe("BARQ020: a destructured store is a snapshot", () => {
  interface Cart {
    View: () => JSXElement;
    add: () => void;
  }
  const body = (read: string): string => `import { createStore } from "@barqjs/core";
const [cart, setCart] = createStore({ count: 0 });
export const add = () => setCart((draft) => { draft.count += 1; });
export function View() {
  ${read}
}`;
  const snapshot = body("const { count } = cart;\n  return <p>{count}</p>;");
  const live = body("return <p>{cart.count}</p>;");

  test("the compiler reports the destructuring and not the read in JSX", () => {
    expect(reported(snapshot)).toEqual(["BARQ020"]);
    expect(reported(live)).toEqual([]);
  });

  test("the destructured name keeps the first value and the JSX read follows the store", async () => {
    for (const [source, after] of [
      [snapshot, "0"],
      [live, "1"],
    ] as const) {
      const { View, add } = await compileModule<Cart>(source, "cart");
      const element = host();
      const dispose = render(() => View(), element);
      flush();
      add();
      flush();
      expect(element.textContent).toBe(after);
      dispose();
    }
  });
});

describe("BARQ021: an async computation tracks only what it reads before its first await", () => {
  interface Weight {
    View: () => JSXElement;
    setUnit: (unit: string) => void;
  }
  const body = (
    compute: string,
  ): string => `import { Loading, createMemo, createSignal } from "@barqjs/core";
const [unit, setUnit] = createSignal("kg");
export { setUnit };
const load = () => new Promise<number>((resolve) => setTimeout(() => resolve(5), 0));
export function View() {
  const weight = createMemo(async () => { ${compute} });
  return <Loading fallback={<i>…</i>}><p>{weight()}</p></Loading>;
}`;
  const late = body("const n = await load(); return `${n} ${unit()}`;");
  const early = body("const u = unit(); const n = await load(); return `${n} ${u}`;");

  test("the compiler reports the late read and not the early one", () => {
    expect(reported(late)).toEqual(["BARQ021"]);
    expect(reported(early)).toEqual([]);
  });

  test("a change to a source read after the await does not re-run the computation", async () => {
    for (const [source, after] of [
      [late, "5 kg"],
      [early, "5 lb"],
    ] as const) {
      const { View, setUnit } = await compileModule<Weight>(source, "weight");
      const element = host();
      const dispose = render(() => View(), element);
      flush();
      await tick();
      await tick();
      flush();
      expect(element.textContent).toBe("5 kg");
      setUnit("lb");
      flush();
      await tick();
      await tick();
      flush();
      expect(element.textContent).toBe(after);
      dispose();
    }
  });
});

describe("BARQ019: a write while a component body runs", () => {
  interface Counter {
    View: () => JSXElement;
  }
  const source = `import { createSignal } from "@barqjs/core";
export function View() {
  const [count, setCount] = createSignal(0);
  setCount(1);
  return <p>{count()}</p>;
}`;

  test("the compiler reports it", () => {
    expect(reported(source)).toEqual(["BARQ019"]);
  });

  test("the development engine throws where the production one lets it through", async () => {
    const { View } = await compileModule<Counter>(source, "counter");
    // Under a root this test disposes either way, so a body that throws half
    // way leaves nothing behind for the next file.
    const mount = (): string =>
      createRoot((dispose) => {
        try {
          const element = View() as unknown as HTMLElement;
          flush();
          return element.textContent ?? "";
        } finally {
          dispose();
        }
      });
    if (ENGINE_DEV === undefined) {
      expect(mount()).toBe("1");
      return;
    }
    expect(mount).toThrow("REACTIVE_WRITE_IN_OWNED_SCOPE");
  });
});
