/**
 * Solid 2.0 control-flow parity: For keyed unification, Repeat,
 * Show non-keyed accessor children, the dynamic() factory, ref arrays.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { For, Repeat, Show } from "./components.ts";
import { cell } from "./props.ts";
import { dynamic } from "./components.ts";
import { element, render } from "./dom.ts";
import { createRoot, flush, createSignal, onCleanup } from "./signals.ts";

let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

describe("For keyed unification", () => {
  test("keyed={false} is positional (null keyOf, item accessor, static index)", () => {
    const [items, setItems] = createSignal(["a", "b"]);
    let renders = 0;

    createRoot(() => {
      const el = For({
        each: () => items(),
        keyed: false,
        children: (item: () => string, index: number) => {
          renders++;
          return element("li", { children: () => `${index}:${item()}` }) as Node;
        },
      });
      render(el, container);
    });
    flush();

    expect(container.textContent).toBe("0:a1:b");
    expect(renders).toBe(2);

    // Value change at an index updates in place without re-rendering the row
    setItems(["a", "c"]);
    flush();
    expect(container.textContent).toBe("0:a1:c");
    expect(renders).toBe(2);
  });

  test("keyed function: rows keyed by it, children get item accessor", () => {
    const [items, setItems] = createSignal([
      { id: 1, text: "one" },
      { id: 2, text: "two" },
    ]);
    let renders = 0;

    createRoot(() => {
      const el = For({
        each: () => items(),
        keyed: cell((item: { id: number; text: string }) => item.id),
        children: (item: () => { id: number; text: string }) => {
          renders++;
          return element("li", { children: () => item().text }) as Node;
        },
      });
      render(el, container);
    });
    flush();
    expect(renders).toBe(2);

    // Reorder by key with fresh objects: rows move and update, no re-render
    setItems([
      { id: 2, text: "TWO" },
      { id: 1, text: "one" },
    ]);
    flush();
    expect(container.textContent).toBe("TWOone");
    expect(renders).toBe(2);
  });
});

describe("Repeat", () => {
  test("renders count blocks with stable indices", () => {
    const [count, setCount] = createSignal(3);

    createRoot(() => {
      const el = Repeat({
        count: () => count(),
        children: (i: number) => element("span", { children: String(i) }),
      });
      render(el, container);
    });
    flush();
    expect(container.textContent).toBe("012");

    setCount(5);
    flush();
    expect(container.textContent).toBe("01234");

    setCount(2);
    flush();
    expect(container.textContent).toBe("01");
  });

  test("from offsets indices; fallback for zero", () => {
    const [count, setCount] = createSignal(0);

    createRoot(() => {
      const el = Repeat({
        count: () => count(),
        from: 10,
        fallback: document.createTextNode("empty"),
        children: (i: number) => element("span", { children: String(i) }),
      });
      render(el, container);
    });
    flush();
    expect(container.textContent).toBe("empty");

    setCount(2);
    flush();
    expect(container.textContent).toBe("1011");
  });
});

describe("Show keyed semantics", () => {
  test("default (non-keyed): children get an accessor; no re-render on truthy value change", () => {
    const [user, setUser] = createSignal<{ name: string } | null>({ name: "John" });
    let renders = 0;

    createRoot(() => {
      const el = Show({
        when: () => user(),
        children: (u: () => { name: string }) => {
          renders++;
          return element("div", { children: () => u().name });
        },
      });
      render(el, container);
    });
    flush();
    expect(container.textContent).toBe("John");
    expect(renders).toBe(1);

    // Truthy -> truthy: content updates reactively, block does NOT re-render
    setUser({ name: "Jane" });
    flush();
    expect(container.textContent).toBe("Jane");
    expect(renders).toBe(1);

    // Truthiness flip re-renders
    setUser(null);
    flush();
    expect(container.textContent).toBe("");
    setUser({ name: "Joe" });
    flush();
    expect(container.textContent).toBe("Joe");
    expect(renders).toBe(2);
  });

  test("keyed: children get the raw value and re-render on every value change", () => {
    const [user, setUser] = createSignal<{ name: string } | null>({ name: "John" });
    let renders = 0;

    createRoot(() => {
      const el = Show({
        when: () => user(),
        keyed: true,
        children: (u: { name: string }) => {
          renders++;
          return element("div", { children: u.name });
        },
      });
      render(el, container);
    });
    flush();
    expect(container.textContent).toBe("John");

    setUser({ name: "Jane" });
    flush();
    expect(container.textContent).toBe("Jane");
    expect(renders).toBe(2);
  });
});

describe("dynamic — a component chosen at run time", () => {
  test("swaps the element when the source moves, keeping the props", () => {
    const [which, setWhich] = createSignal<"div" | "span">("div");
    const Tagged = dynamic(() => which());

    const dispose = render(() => Tagged({ class: "x", children: "hi" }), container);
    expect(container.querySelector("div.x")?.textContent).toBe("hi");

    setWhich("span");
    flush();
    expect(container.querySelector("div.x")).toBeNull();
    expect(container.querySelector("span.x")?.textContent).toBe("hi");
    dispose();
  });

  test("answers with a component, then nothing, and tears down what it built", () => {
    const cleanups: string[] = [];
    const Badge = (props: Record<string, unknown>): Node => {
      onCleanup(() => cleanups.push("badge"));
      return element("b", { children: props.label });
    };
    const [which, setWhich] = createSignal<"badge" | "i" | "none">("badge");
    const Chosen = dynamic(() => (which() === "badge" ? Badge : which() === "i" ? "i" : null));

    const dispose = render(() => Chosen({ label: "salama" }), container);
    expect(container.innerHTML).toContain("<b>salama</b>");

    setWhich("none");
    flush();
    expect(container.querySelector("b")).toBeNull();
    expect(cleanups).toEqual(["badge"]);

    setWhich("i");
    flush();
    expect(container.querySelector("i")).not.toBeNull();
    dispose();
  });
});

describe("ref arrays", () => {
  test("ref={[a, b]} runs every ref with the element", () => {
    const seen: string[] = [];
    const el = element("div", {
      ref: [
        (node: Element) => seen.push(`a:${node.tagName}`),
        (node: Element) => seen.push(`b:${node.tagName}`),
      ],
    });
    expect(el).toBeInstanceOf(HTMLDivElement);
    expect(seen).toEqual(["a:DIV", "b:DIV"]);
  });
});
