/**
 * Solid 2.0 control-flow parity: For keyed unification, Repeat,
 * Show non-keyed accessor children, dynamic() factory, ref arrays.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { For, Repeat, Show, dynamic } from "./components.ts";
import { createElement, render } from "./dom.ts";
import { createScope, flush, signal } from "./signals.ts";

let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

describe("For keyed unification", () => {
  test("keyed={false} behaves like Index (item accessor, static index)", () => {
    const items = signal(["a", "b"]);
    let renders = 0;

    createScope(() => {
      const el = For({
        each: () => items(),
        keyed: false,
        children: (item: () => string, index: number) => {
          renders++;
          return createElement("li", null, () => `${index}:${item()}`) as Node;
        },
      });
      render(el, container);
    });
    flush();

    expect(container.textContent).toBe("0:a1:b");
    expect(renders).toBe(2);

    // Value change at an index updates in place without re-rendering the row
    items.set(["a", "c"]);
    flush();
    expect(container.textContent).toBe("0:a1:c");
    expect(renders).toBe(2);
  });

  test("keyed function: rows keyed by it, children get item accessor", () => {
    const items = signal([
      { id: 1, text: "one" },
      { id: 2, text: "two" },
    ]);
    let renders = 0;

    createScope(() => {
      const el = For({
        each: () => items(),
        keyed: (item: { id: number; text: string }) => item.id,
        children: (item: () => { id: number; text: string }) => {
          renders++;
          return createElement("li", null, () => item().text) as Node;
        },
      });
      render(el, container);
    });
    flush();
    expect(renders).toBe(2);

    // Reorder by key with fresh objects: rows move and update, no re-render
    items.set([
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
    const count = signal(3);

    createScope(() => {
      const el = Repeat({
        count: () => count(),
        children: (i) => createElement("span", null, String(i)) as Node,
      });
      render(el, container);
    });
    flush();
    expect(container.textContent).toBe("012");

    count.set(5);
    flush();
    expect(container.textContent).toBe("01234");

    count.set(2);
    flush();
    expect(container.textContent).toBe("01");
  });

  test("from offsets indices; fallback for zero", () => {
    const count = signal(0);

    createScope(() => {
      const el = Repeat({
        count: () => count(),
        from: 10,
        fallback: document.createTextNode("empty"),
        children: (i) => createElement("span", null, String(i)) as Node,
      });
      render(el, container);
    });
    flush();
    expect(container.textContent).toBe("empty");

    count.set(2);
    flush();
    expect(container.textContent).toBe("1011");
  });
});

describe("Show keyed semantics", () => {
  test("keyed={false}: children get an accessor; no re-render on truthy value change", () => {
    const user = signal<{ name: string } | null>({ name: "John" });
    let renders = 0;

    createScope(() => {
      const el = Show({
        when: () => user(),
        keyed: false,
        children: (u: () => { name: string }) => {
          renders++;
          return createElement("div", null, () => u().name) as Node;
        },
      });
      render(el, container);
    });
    flush();
    expect(container.textContent).toBe("John");
    expect(renders).toBe(1);

    // Truthy -> truthy: content updates reactively, block does NOT re-render
    user.set({ name: "Jane" });
    flush();
    expect(container.textContent).toBe("Jane");
    expect(renders).toBe(1);

    // Truthiness flip re-renders
    user.set(null);
    flush();
    expect(container.textContent).toBe("");
    user.set({ name: "Joe" });
    flush();
    expect(container.textContent).toBe("Joe");
    expect(renders).toBe(2);
  });

  test("default (keyed): children get the raw value and re-render on change", () => {
    const user = signal<{ name: string } | null>({ name: "John" });
    let renders = 0;

    createScope(() => {
      const el = Show({
        when: () => user(),
        children: (u: { name: string }) => {
          renders++;
          return createElement("div", null, u.name) as Node;
        },
      });
      render(el, container);
    });
    flush();
    expect(container.textContent).toBe("John");

    user.set({ name: "Jane" });
    flush();
    expect(container.textContent).toBe("Jane");
    expect(renders).toBe(2);
  });
});

describe("dynamic() factory", () => {
  test("returns a stable component driven by the source", () => {
    const which = signal<"div" | "span">("div");
    const Dyn = dynamic(() => which());

    createScope(() => {
      const el = Dyn({ class: "x", children: "hi" });
      render(el, container);
    });
    flush();
    expect(container.querySelector("div.x")?.textContent).toBe("hi");

    which.set("span");
    flush();
    expect(container.querySelector("div.x")).toBeNull();
    expect(container.querySelector("span.x")?.textContent).toBe("hi");
  });
});

describe("ref arrays", () => {
  test("ref={[a, b]} runs every ref with the element", () => {
    const seen: string[] = [];
    const el = createElement("div", {
      ref: [
        (node: Element) => seen.push(`a:${node.tagName}`),
        (node: Element) => seen.push(`b:${node.tagName}`),
      ],
    });
    expect(el).toBeInstanceOf(HTMLDivElement);
    expect(seen).toEqual(["a:DIV", "b:DIV"]);
  });
});
