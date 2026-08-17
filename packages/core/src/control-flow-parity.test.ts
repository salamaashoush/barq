/**
 * Solid 2.0 control-flow parity: For keyed unification, Repeat,
 * Show non-keyed accessor children, dynamic() factory, ref arrays.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { For, Repeat, Show } from "./components.ts";
import { cell } from "./props.ts";
import type { JSXElement } from "./dom.ts";
import { dynamic, element, render } from "./dom.ts";
import { branch } from "./flow.ts";
import type { Scope } from "./scope.ts";
import { scope, flush, signal } from "./signals.ts";

let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

describe("For keyed unification", () => {
  test("keyed={false} is positional (null keyOf, item accessor, static index)", () => {
    const items = signal(["a", "b"]);
    let renders = 0;

    scope(() => {
      const el = For(null, {
        each: () => items(),
        keyed: false,
        children: (_s: unknown, item: () => string, index: number) => {
          renders++;
          return element(null, "li", { children: () => `${index}:${item()}` }) as Node;
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

    scope(() => {
      const el = For(null, {
        each: () => items(),
        keyed: cell((item: { id: number; text: string }) => item.id),
        children: (_s: unknown, item: () => { id: number; text: string }) => {
          renders++;
          return element(null, "li", { children: () => item().text }) as Node;
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

    scope(() => {
      const el = Repeat(null, {
        count: () => count(),
        children: (_s, i) => element(null, "span", { children: String(i) }) as Node,
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

    scope(() => {
      const el = Repeat(null, {
        count: () => count(),
        from: 10,
        fallback: document.createTextNode("empty"),
        children: (_s, i) => element(null, "span", { children: String(i) }) as Node,
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
  test("default (non-keyed): children get an accessor; no re-render on truthy value change", () => {
    const user = signal<{ name: string } | null>({ name: "John" });
    let renders = 0;

    scope(() => {
      const el = Show(null, {
        when: () => user(),
        children: (_s: unknown, u: () => { name: string }) => {
          renders++;
          return element(null, "div", { children: () => u().name }) as Node;
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

  test("keyed: children get the raw value and re-render on every value change", () => {
    const user = signal<{ name: string } | null>({ name: "John" });
    let renders = 0;

    scope(() => {
      const el = Show(null, {
        when: () => user(),
        keyed: true,
        children: (_s: unknown, u: { name: string }) => {
          renders++;
          return element(null, "div", { children: u.name }) as Node;
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

describe("dynamic — a tag chosen at run time (§3.13 item 4)", () => {
  test("swaps the element when the source moves, keeping the props", () => {
    // M9 deleted the `dynamic(source)` FACTORY along with `<Dynamic>`. What it
    // did — return a component whose tag a signal drives — is what the compiler
    // emits directly: a `branch` keyed on the component value, whose body is
    // `dynamic`. The branch is the compiler's; `dynamic`'s only question is whether the
    // resolved value is a tag or a component, and only the value can answer it.
    const which = signal<"div" | "span">("div");
    const props = { class: "x", children: "hi" };

    scope((_dispose, scope) => {
      const el = branch(scope, null, null, which, (s: Scope | null) => dynamic(s, which, props));
      render(el as JSXElement, container);
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
    const el = element(null, "div", {
      ref: [
        (node: Element) => seen.push(`a:${node.tagName}`),
        (node: Element) => seen.push(`b:${node.tagName}`),
      ],
    });
    expect(el).toBeInstanceOf(HTMLDivElement);
    expect(seen).toEqual(["a:DIV", "b:DIV"]);
  });
});
