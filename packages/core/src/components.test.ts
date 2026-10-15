/**
 * Component Tests - Edge cases for Show, For, Switch components
 * Tests for rendering, reactivity, and memory leak scenarios
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { For, Fragment, Match, Show, Switch } from "./components.ts";
import { childToNodes, insert } from "./dom.ts";
import type { Child } from "./dom.ts";
import { createSignal, createEffect, createRoot, onCleanup, onSettled, flush } from "./signals.ts";

// Simple DOM setup for testing
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

describe("Fragment — an ARRAY of its parts (C8)", () => {
  // M9: `Fragment` builds no DocumentFragment. A fragment is a compile-time
  // multi-root unit, so what the lowering hands back is the array, and it is
  // `insert` that flattens it — dropping null, undefined and booleans — exactly
  // as it does for any other child value. Asserting through `insert` is what
  // makes these claims about the path a compiled module actually takes; the old
  // spelling asserted them about `appendChild` on a fragment nothing emits.
  test("renders multiple children", () => {
    const frag = Fragment({
      children: [
        document.createTextNode("hello"),
        document.createTextNode(" "),
        document.createTextNode("world"),
      ],
    });

    insert(container, frag);
    expect(container.textContent).toBe("hello world");
  });

  test("handles null and undefined children", () => {
    const frag = Fragment({ children: [null, "text", undefined, 42] as Child[] });

    insert(container, frag);
    expect(container.textContent).toBe("text42");
  });

  test("handles boolean children (should be ignored)", () => {
    const frag = Fragment({ children: [true, "visible", false] as Child[] });

    insert(container, frag);
    expect(container.textContent).toBe("visible");
  });
});

describe("childToNodes", () => {
  test("handles null and undefined", () => {
    expect(childToNodes(null)).toEqual([]);
    expect(childToNodes(undefined)).toEqual([]);
  });

  test("handles booleans", () => {
    expect(childToNodes(true)).toEqual([]);
    expect(childToNodes(false)).toEqual([]);
  });

  test("handles DocumentFragment", () => {
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode("a"));
    frag.appendChild(document.createTextNode("b"));

    const nodes = childToNodes(frag);
    expect(nodes.length).toBe(2);
  });

  test("a drained DocumentFragment still yields its nodes", () => {
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode("a"));
    frag.appendChild(document.createTextNode("b"));

    // Reading is destructive for every real caller: it inserts what it got,
    // which moves the nodes out and leaves the fragment empty.
    const first = childToNodes(frag);
    const holder = document.createElement("div");
    for (const node of first) holder.appendChild(node);
    expect(frag.childNodes.length).toBe(0);

    const second = childToNodes(frag);
    expect(second.length).toBe(2);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
  });

  test("Show keeps a multi-node eager body across a hide/show cycle", () => {
    const [on, setOn] = createSignal(true);
    const body = document.createDocumentFragment();
    body.appendChild(document.createElement("i"));
    body.appendChild(document.createElement("u"));

    container.appendChild(Show({ when: on, children: body }) as Node);
    flush();
    expect(container.querySelectorAll("i, u").length).toBe(2);

    setOn(false);
    flush();
    expect(container.querySelectorAll("i, u").length).toBe(0);

    setOn(true);
    flush();
    expect(container.querySelectorAll("i, u").length).toBe(2);
  });

  test("handles nested arrays", () => {
    const nodes = childToNodes([["a", "b"], ["c"]]);
    expect(nodes.length).toBe(3);
    expect(nodes[0].textContent).toBe("a");
    expect(nodes[1].textContent).toBe("b");
    expect(nodes[2].textContent).toBe("c");
  });

  test("handles functions (reactive children)", () => {
    const nodes = childToNodes(() => "dynamic");
    expect(nodes.length).toBe(1);
    expect(nodes[0].textContent).toBe("dynamic");
  });

  test("handles deeply nested functions", () => {
    const nodes = childToNodes(() => () => () => "deep");
    expect(nodes.length).toBe(1);
    expect(nodes[0].textContent).toBe("deep");
  });
});

describe("Show component", () => {
  test("renders children when condition is truthy", () => {
    const [show] = createSignal(true);
    const node = Show({
      when: show,
      children: () => document.createTextNode("visible"),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("visible");
  });

  test("renders fallback when condition is falsy", () => {
    const [show] = createSignal(false);
    const node = Show({
      when: show,
      fallback: document.createTextNode("fallback"),
      children: () => document.createTextNode("visible"),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("fallback");
  });

  test("toggles between children and fallback", () => {
    const [show, setShow] = createSignal(true);
    const node = Show({
      when: show,
      fallback: document.createTextNode("hidden"),
      children: () => document.createTextNode("shown"),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("shown");

    setShow(false);
    flush();
    expect(container.textContent).toContain("hidden");

    setShow(true);
    flush();
    expect(container.textContent).toContain("shown");
  });

  test("passes truthy value to render function", () => {
    const [value] = createSignal<string | null>("hello");
    let receivedValue: string | null = null;

    const node = Show({
      when: value,
      // The raw value is the KEYED arm; non-keyed is the default since M10 and
      // hands over a narrowed accessor instead.
      keyed: true,
      children: (v: string) => {
        receivedValue = v;
        return document.createTextNode(v);
      },
    });

    container.appendChild(node as Node);
    expect(receivedValue as string | null).toBe("hello");
    expect(container.textContent).toContain("hello");
  });

  test("handles rapid condition changes", () => {
    const [show, setShow] = createSignal(true);
    const node = Show({
      when: show,
      fallback: document.createTextNode("off"),
      children: () => document.createTextNode("on"),
    });

    container.appendChild(node as Node);

    // Rapid toggling
    for (let i = 0; i < 10; i++) {
      setShow(i % 2 === 0);
    }
    flush();

    // Should end with "off" (last was false)
    expect(container.textContent).toContain("off");
  });

  test("handles children as direct value (not function)", () => {
    const [show] = createSignal(true);
    const node = Show({
      when: show,
      children: document.createTextNode("direct"),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("direct");
  });

  test("disposes inner effects when condition changes", () => {
    const [show, setShow] = createSignal(true);
    const [innerSignal, setInnerSignal] = createSignal(0);
    let effectRunCount = 0;

    const node = Show({
      when: show,
      children: () => {
        createEffect(innerSignal, () => {
          effectRunCount++;
        });
        flush();
        return document.createTextNode("content");
      },
    });

    container.appendChild(node as Node);
    flush();
    expect(effectRunCount).toBe(1);

    setInnerSignal(1);
    flush();
    expect(effectRunCount).toBe(2);

    // Hide - should dispose inner effect
    setShow(false);
    flush();

    // Inner effect should not run anymore
    setInnerSignal(2);
    flush();
    expect(effectRunCount).toBe(2);
  });

  test("EDGE CASE: handles condition returning 0 (falsy but valid)", () => {
    const [count, setCount] = createSignal(0);
    const node = Show({
      when: count,
      keyed: true,
      fallback: document.createTextNode("empty"),
      children: (n: number) => document.createTextNode(`count: ${n}`),
    });

    container.appendChild(node as Node);
    // 0 is falsy, should show fallback
    expect(container.textContent).toContain("empty");

    setCount(5);
    flush();
    expect(container.textContent).toContain("count: 5");
  });

  test("EDGE CASE: handles condition returning empty string (falsy)", () => {
    const [text, setText] = createSignal("");
    const node = Show({
      when: text,
      keyed: true,
      fallback: document.createTextNode("empty"),
      children: (t: string) => document.createTextNode(t),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("empty");

    setText("hello");
    flush();
    expect(container.textContent).toContain("hello");
  });

  test("EDGE CASE: children function with default parameters", () => {
    // Function.length is 0 for functions with default params
    const [show] = createSignal({ name: "test" });
    let receivedValue: unknown = null;

    const node = Show({
      when: show,
      keyed: true,
      // This function has default param, so .length === 0
      children: (item = { name: "default" }) => {
        receivedValue = item;
        return document.createTextNode(item.name);
      },
    });

    container.appendChild(node as Node);
    // BUG: Due to .length check, this might get called without the value
    // Expected: receivedValue should be { name: "test" }
    expect(receivedValue).toEqual({ name: "test" });
  });

  test("MEMORY LEAK: disposes content scope on unmount", () => {
    const [show] = createSignal(true);
    const [innerSignal, setInnerSignal] = createSignal(0);
    let effectRunCount = 0;
    let cleanupCalled = false;

    let disposeParent: (() => void) | undefined;

    createRoot((dispose) => {
      disposeParent = dispose;

      const node = Show({
        when: show,
        children: () => {
          createEffect(innerSignal, () => {
            effectRunCount++;
          });
          flush();
          onCleanup(() => {
            cleanupCalled = true;
          });
          return document.createTextNode("content");
        },
      });

      container.appendChild(node as Node);
    });

    flush();
    expect(effectRunCount).toBe(1);

    // Dispose parent scope (simulating unmount)
    disposeParent!();

    // Inner effect should be disposed
    setInnerSignal(1);
    flush();
    expect(effectRunCount).toBe(1); // Should not increase

    // Cleanup should have been called
    expect(cleanupCalled).toBe(true);
  });
});

describe("For component", () => {
  test("renders list of items", () => {
    const [items] = createSignal(["a", "b", "c"]);
    const node = For({
      each: items,
      children: (item: string) => document.createTextNode(item),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("abc");
  });

  test("updates when items change", () => {
    const [items, setItems] = createSignal(["a", "b"]);
    const node = For({
      each: items,
      children: (item: string) => document.createTextNode(item),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("ab");

    setItems(["x", "y", "z"]);
    flush();
    expect(container.textContent).toContain("xyz");
  });

  test("renders fallback for empty array", () => {
    const [items] = createSignal<string[]>([]);
    const node = For({
      each: items,
      fallback: document.createTextNode("empty"),
      children: (item: string) => document.createTextNode(item),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("empty");
  });

  test("switches between items and fallback", () => {
    const [items, setItems] = createSignal<string[]>([]);
    const node = For({
      each: items,
      fallback: document.createTextNode("empty"),
      children: (item: string) => document.createTextNode(item),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("empty");

    setItems(["a"]);
    flush();
    expect(container.textContent).toContain("a");
    expect(container.textContent).not.toContain("empty");

    setItems([]);
    flush();
    expect(container.textContent).toContain("empty");
  });

  test("provides reactive index signal", () => {
    const [items, setItems] = createSignal(["a", "b", "c"]);
    const indices: number[] = [];

    const node = For({
      each: items,
      children: (item: string, index: () => number) => {
        createEffect(index, (value) => {
          indices.push(value);
        });
        flush();
        return document.createTextNode(item);
      },
    });

    container.appendChild(node as Node);
    flush();
    expect(indices).toEqual([0, 1, 2]);

    // Reverse the array - indices should update
    setItems(["c", "b", "a"]);
    flush();
    // New indices should be pushed
    expect(indices.length).toBeGreaterThan(3);
  });

  test("uses custom key function", () => {
    const [items, setItems] = createSignal([
      { id: 1, name: "one" },
      { id: 2, name: "two" },
    ]);
    let renderCount = 0;

    const node = For({
      each: items,
      children: (item: { id: number; name: string }) => {
        renderCount++;
        return document.createTextNode(item.name);
      },
    });

    container.appendChild(node as Node);
    expect(renderCount).toBe(2);
    expect(container.textContent).toContain("onetwo");

    // Reorder - should reuse existing nodes
    setItems([
      { id: 2, name: "two" },
      { id: 1, name: "one" },
    ]);
    flush();

    // Items reordered, not re-rendered
    expect(container.textContent).toContain("twoone");
  });

  test("handles items added at beginning", () => {
    const [items, setItems] = createSignal(["b", "c"]);
    const node = For({
      each: items,
      children: (item: string) => {
        const span = document.createElement("span");
        span.textContent = item;
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("bc");

    setItems(["a", "b", "c"]);
    flush();
    expect(container.textContent).toBe("abc");
  });

  test("handles items added at end", () => {
    const [items, setItems] = createSignal(["a", "b"]);
    const node = For({
      each: items,
      children: (item: string) => {
        const span = document.createElement("span");
        span.textContent = item;
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("ab");

    setItems(["a", "b", "c"]);
    flush();
    expect(container.textContent).toBe("abc");
  });

  test("handles items removed from middle", () => {
    const [items, setItems] = createSignal(["a", "b", "c"]);
    const node = For({
      each: items,
      children: (item: string) => {
        const span = document.createElement("span");
        span.textContent = item;
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("abc");

    setItems(["a", "c"]);
    flush();
    expect(container.textContent).toBe("ac");
  });

  test("handles complete replacement", () => {
    const [items, setItems] = createSignal(["a", "b", "c"]);
    const node = For({
      each: items,
      children: (item: string) => {
        const span = document.createElement("span");
        span.textContent = item;
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("abc");

    setItems(["x", "y"]);
    flush();
    expect(container.textContent).toBe("xy");
  });

  test("disposes removed item effects", () => {
    const [items, setItems] = createSignal(["a", "b"]);
    const effectCounts: Record<string, number> = { a: 0, b: 0 };
    const [trigger, setTrigger] = createSignal(0);

    const node = For({
      each: items,
      children: (item: string) => {
        createEffect(trigger, () => {
          effectCounts[item]++;
        });
        flush();
        return document.createTextNode(item);
      },
    });

    container.appendChild(node as Node);
    flush();
    expect(effectCounts).toEqual({ a: 1, b: 1 });

    setTrigger(1);
    flush();
    expect(effectCounts).toEqual({ a: 2, b: 2 });

    // Remove 'b'
    setItems(["a"]);
    flush();

    // Trigger again - only 'a' should update
    setTrigger(2);
    flush();
    expect(effectCounts.a).toBe(3);
    expect(effectCounts.b).toBe(2); // Should not increase
  });

  test("EDGE CASE: handles null/undefined each", () => {
    const [items] = createSignal<string[] | null>(null);
    const node = For({
      each: items,
      fallback: document.createTextNode("empty"),
      children: (item: string) => document.createTextNode(item),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("empty");
  });

  test("EDGE CASE: handles getter function for each", () => {
    const [items, setItems] = createSignal(["a", "b"]);
    const node = For({
      each: () => items(),
      children: (item: string) => document.createTextNode(item),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("ab");

    setItems(["x", "y", "z"]);
    flush();
    expect(container.textContent).toContain("xyz");
  });

  test("EDGE CASE: handles duplicate keys", () => {
    // With duplicate keys, only unique keys are rendered (Map-based cache)
    // This is a known limitation - use unique keys for correct behavior
    const [items] = createSignal(["a", "a", "b"]);
    const node = For({
      each: items,
      children: (item: string) => document.createTextNode(item),
    });

    container.appendChild(node as Node);
    // Only renders unique keys: "a" and "b"
    expect(container.textContent).toContain("ab");
  });

  test("EDGE CASE: LIS algorithm with reversal", () => {
    const [items, setItems] = createSignal([
      { id: 1, v: "a" },
      { id: 2, v: "b" },
      { id: 3, v: "c" },
      { id: 4, v: "d" },
    ]);
    let renderCount = 0;

    const node = For({
      each: items,
      children: (item: { id: number; v: string }) => {
        renderCount++;
        const span = document.createElement("span");
        span.textContent = item.v;
        span.setAttribute("data-id", String(item.id));
        return span;
      },
    });

    container.appendChild(node as Node);
    flush();
    expect(container.textContent).toBe("abcd");
    expect(renderCount).toBe(4);

    // Reverse with new object references - triggers re-render because items changed
    // (Object.is() returns false for new objects even with same content)
    setItems([
      { id: 4, v: "d" },
      { id: 3, v: "c" },
      { id: 2, v: "b" },
      { id: 1, v: "a" },
    ]);
    flush();

    expect(container.textContent).toBe("dcba");
    // New objects = new renders (4 initial + 4 reversed)
    expect(renderCount).toBe(8);

    // Verify order by data-id
    const spans = container.querySelectorAll("span");
    expect(spans[0].getAttribute("data-id")).toBe("4");
    expect(spans[1].getAttribute("data-id")).toBe("3");
    expect(spans[2].getAttribute("data-id")).toBe("2");
    expect(spans[3].getAttribute("data-id")).toBe("1");
  });

  test("EDGE CASE: reordering with same object references does not re-render", () => {
    const a = { id: 1, v: "a" };
    const b = { id: 2, v: "b" };
    const c = { id: 3, v: "c" };
    const d = { id: 4, v: "d" };
    const [items, setItems] = createSignal([a, b, c, d]);
    let renderCount = 0;

    const node = For({
      each: items,
      children: (item: { id: number; v: string }) => {
        renderCount++;
        const span = document.createElement("span");
        span.textContent = item.v;
        span.setAttribute("data-id", String(item.id));
        return span;
      },
    });

    container.appendChild(node as Node);
    flush();
    expect(container.textContent).toBe("abcd");
    expect(renderCount).toBe(4);

    // Reverse using SAME object references - should reorder, not re-render
    setItems([d, c, b, a]);
    flush();

    expect(container.textContent).toBe("dcba");
    // Should still be 4 - reused existing elements (same object references)
    expect(renderCount).toBe(4);

    // Verify order by data-id
    const spans = container.querySelectorAll("span");
    expect(spans[0].getAttribute("data-id")).toBe("4");
    expect(spans[1].getAttribute("data-id")).toBe("3");
    expect(spans[2].getAttribute("data-id")).toBe("2");
    expect(spans[3].getAttribute("data-id")).toBe("1");
  });

  test("EDGE CASE: interleaved insert and remove", () => {
    const [items, setItems] = createSignal(["a", "c", "e"]);
    const node = For({
      each: items,
      children: (item: string) => {
        const span = document.createElement("span");
        span.textContent = item;
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("ace");

    // Insert b and d
    setItems(["a", "b", "c", "d", "e"]);
    flush();
    expect(container.textContent).toBe("abcde");

    // Remove b and d
    setItems(["a", "c", "e"]);
    flush();
    expect(container.textContent).toBe("ace");
  });

  test("handles batch updates", () => {
    const [items, setItems] = createSignal(["a"]);
    let effectRuns = 0;

    const node = For({
      each: items,
      children: (item: string) => {
        onSettled(() => {
          effectRuns++;
        });
        flush();
        return document.createTextNode(item);
      },
    });

    container.appendChild(node as Node);
    flush();
    expect(effectRuns).toBe(1);

    flush(() => {
      setItems(["b"]);
      setItems(["c"]);
      setItems(["d"]);
    });

    // Should only process final value
    flush();
    expect(container.textContent).toContain("d");
  });
});

describe("For keyed={false} — the positional mode", () => {
  test("renders list with static indices", () => {
    const [items] = createSignal(["a", "b", "c"]);
    const receivedIndices: number[] = [];

    const node = For({
      each: items,
      keyed: false,
      children: (item: () => string, index: number) => {
        receivedIndices.push(index);
        return document.createTextNode(item());
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("abc");
    expect(receivedIndices).toEqual([0, 1, 2]);
  });

  test("item signal updates when value changes", () => {
    const [items, setItems] = createSignal(["a", "b", "c"]);
    let updateCount = 0;

    const node = For({
      each: items,
      keyed: false,
      children: (item: () => string, _index: number) => {
        createEffect(item, () => {
          updateCount++;
        });
        flush();
        const span = document.createElement("span");
        createEffect(item, (text) => {
          span.textContent = text;
        });
        flush();
        return span;
      },
    });

    container.appendChild(node as Node);
    flush();
    expect(container.textContent).toBe("abc");
    expect(updateCount).toBe(3);

    // Update value at index 1
    setItems(["a", "X", "c"]);
    flush();
    expect(container.textContent).toBe("aXc");
    // Only index 1's item signal should trigger
    expect(updateCount).toBe(4);
  });

  test("handles array shrinking", () => {
    const [items, setItems] = createSignal(["a", "b", "c", "d"]);
    const node = For({
      each: items,
      keyed: () => false,
      children: (item: () => string) => {
        const span = document.createElement("span");
        createEffect(item, (text) => {
          span.textContent = text;
        });
        flush();
        return span;
      },
    });

    container.appendChild(node as Node);
    flush();
    expect(container.textContent).toBe("abcd");

    setItems(["a", "b"]);
    flush();
    expect(container.textContent).toBe("ab");
  });

  test("handles array growing", () => {
    const [items, setItems] = createSignal(["a"]);
    const node = For({
      each: items,
      keyed: () => false,
      children: (item: () => string) => {
        const span = document.createElement("span");
        createEffect(item, (text) => {
          span.textContent = text;
        });
        flush();
        return span;
      },
    });

    container.appendChild(node as Node);
    flush();
    expect(container.textContent).toBe("a");

    setItems(["a", "b", "c"]);
    flush();
    expect(container.textContent).toBe("abc");
  });

  test("disposes effects when items are removed", () => {
    const [items, setItems] = createSignal(["a", "b", "c"]);
    const [trigger, setTrigger] = createSignal(0);
    const effectCounts = [0, 0, 0];

    const node = For({
      each: items,
      keyed: false,
      children: (item: () => string, index: number) => {
        createEffect(
          () => [item(), trigger()],
          () => {
            effectCounts[index]++;
          },
        );
        flush();
        return document.createTextNode(item());
      },
    });

    container.appendChild(node as Node);
    flush();
    expect(effectCounts).toEqual([1, 1, 1]);

    setTrigger(1);
    flush();
    expect(effectCounts).toEqual([2, 2, 2]);

    // Shrink to 1 item
    setItems(["x"]);
    flush();

    setTrigger(2);
    flush();
    // Only index 0 should update
    expect(effectCounts[0]).toBe(4); // +1 for value change, +1 for trigger
    expect(effectCounts[1]).toBe(2); // disposed
    expect(effectCounts[2]).toBe(2); // disposed
  });

  test("EDGE CASE: empty to non-empty transition", () => {
    const [items, setItems] = createSignal<string[]>([]);
    const node = For({
      each: items,
      keyed: () => false,
      fallback: document.createTextNode("empty"),
      children: (item: () => string) => document.createTextNode(item()),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("empty");

    setItems(["first"]);
    flush();
    expect(container.textContent).toContain("first");
    expect(container.textContent).not.toContain("empty");
  });
});

describe("Switch/Match components", () => {
  test("renders first matching condition", () => {
    const [value] = createSignal(1);
    const node = Switch({
      children: [
        Match({ when: () => value() === 1, children: () => document.createTextNode("one") }),
        Match({ when: () => value() === 2, children: () => document.createTextNode("two") }),
      ],
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("one");
  });

  test("updates when condition changes", () => {
    const [value, setValue] = createSignal(1);
    const node = Switch({
      children: [
        Match({ when: () => value() === 1, children: () => document.createTextNode("one") }),
        Match({ when: () => value() === 2, children: () => document.createTextNode("two") }),
        Match({
          when: () => value() === 3,
          children: () => document.createTextNode("three"),
        }),
      ],
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("one");

    setValue(2);
    flush();
    expect(container.textContent).toContain("two");
    expect(container.textContent).not.toContain("one");

    setValue(3);
    flush();
    expect(container.textContent).toContain("three");
  });

  test("renders fallback when no match", () => {
    const [value] = createSignal(99);
    const node = Switch({
      fallback: document.createTextNode("default"),
      children: [
        Match({ when: () => value() === 1, children: () => document.createTextNode("one") }),
        Match({ when: () => value() === 2, children: () => document.createTextNode("two") }),
      ],
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("default");
  });

  test("keyed match re-renders on value change", () => {
    const [user, setUser] = createSignal({ id: 1, name: "Alice" });
    let renderCount = 0;

    const node = Switch({
      children: [
        Match({
          when: user,
          keyed: true,
          children: (u: { id: number; name: string }) => {
            renderCount++;
            return document.createTextNode(u.name);
          },
        }),
      ],
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("Alice");
    expect(renderCount).toBe(1);

    // Change value - should re-render because keyed
    setUser({ id: 2, name: "Bob" });
    flush();
    expect(container.textContent).toContain("Bob");
    expect(renderCount).toBe(2);
  });

  test("non-keyed match does not re-render on value change", () => {
    const [user, setUser] = createSignal({ id: 1, name: "Alice" });
    let renderCount = 0;

    const node = Switch({
      children: [
        Match({
          when: user,
          keyed: () => false,
          children: () => {
            renderCount++;
            const span = document.createElement("span");
            createEffect(
              () => user().name,
              (name) => {
                span.textContent = name;
              },
            );
            flush();
            return span;
          },
        }),
      ],
    });

    container.appendChild(node as Node);
    flush();
    expect(container.textContent).toContain("Alice");
    expect(renderCount).toBe(1);

    // Change value - should NOT re-render, just update via effect
    setUser({ id: 2, name: "Bob" });
    flush();
    expect(container.textContent).toContain("Bob");
    expect(renderCount).toBe(1); // Still 1
  });

  test("disposes previous match effects", () => {
    const [value, setValue] = createSignal(1);
    const [trigger, setTrigger] = createSignal(0);
    let effect1Runs = 0;
    let effect2Runs = 0;

    const node = Switch({
      children: [
        Match({
          when: () => value() === 1,
          children: () => {
            createEffect(trigger, () => {
              effect1Runs++;
            });
            flush();
            return document.createTextNode("one");
          },
        }),
        Match({
          when: () => value() === 2,
          children: () => {
            createEffect(trigger, () => {
              effect2Runs++;
            });
            flush();
            return document.createTextNode("two");
          },
        }),
      ],
    });

    container.appendChild(node as Node);
    flush();
    expect(effect1Runs).toBe(1);
    expect(effect2Runs).toBe(0);

    setTrigger(1);
    flush();
    expect(effect1Runs).toBe(2);

    // Switch to second match
    setValue(2);
    flush();
    expect(effect2Runs).toBe(1);

    // Trigger should only affect second match now
    setTrigger(2);
    flush();
    expect(effect1Runs).toBe(2); // Should not increase
    expect(effect2Runs).toBe(2);
  });

  test("EDGE CASE: multiple matches with same condition", () => {
    const [show] = createSignal(true);
    const node = Switch({
      children: [
        Match({ when: show, children: () => document.createTextNode("first") }),
        Match({ when: show, children: () => document.createTextNode("second") }),
      ],
    });

    container.appendChild(node as Node);
    // Should render first match only
    expect(container.textContent).toContain("first");
    expect(container.textContent).not.toContain("second");
  });
});

// `describe("Marker utilities")` was deleted at M9 with `markers.ts`.
//
// Its four tests drove `createMarkerPair`/`clearRange`/`insertNodes` directly.
// Anchor identity is a compile-time ADDRESS now: the compiler bakes a `<!---->`
// into the template at the position it computed and hands the node to the
// primitive, so there is no pair, no range to clear and no process-global
// counter — which is what made two renders of one tree differ byte-for-byte and
// hydration impossible. What replaced the claims: `flow.test.ts` ("a region
// with no parent carries its own anchor and no comment node"), and the
// compiler's marker channel, which asserts per fixture that the anchors in the
// DOM are exactly the ones the template clones baked in.

describe("Memory and cleanup", () => {
  test("nested Show components dispose correctly", () => {
    const [outer, setOuter] = createSignal(true);
    const [inner] = createSignal(true);
    let outerEffectRuns = 0;
    let innerEffectRuns = 0;
    const [trigger, setTrigger] = createSignal(0);

    const node = createRoot((_dispose) =>
      Show({
        when: outer,
        children: () => {
          createEffect(trigger, () => {
            outerEffectRuns++;
          });
          flush();
          return Show({
            when: inner,
            children: () => {
              createEffect(trigger, () => {
                innerEffectRuns++;
              });
              flush();
              return document.createTextNode("nested");
            },
          });
        },
      }),
    ) as Node;

    container.appendChild(node);
    flush();
    expect(outerEffectRuns).toBe(1);
    expect(innerEffectRuns).toBe(1);

    setTrigger(1);
    flush();
    expect(outerEffectRuns).toBe(2);
    expect(innerEffectRuns).toBe(2);

    // Hide outer - should dispose both
    setOuter(false);
    flush();

    setTrigger(2);
    flush();
    expect(outerEffectRuns).toBe(2); // Should not increase
    expect(innerEffectRuns).toBe(2); // Should not increase
  });

  test("For inside Show disposes item effects", () => {
    const [show, setShow] = createSignal(true);
    const [items] = createSignal(["a", "b"]);
    const [trigger, setTrigger] = createSignal(0);
    let totalEffectRuns = 0;

    const node = createRoot((_dispose) =>
      Show({
        when: show,
        children: () =>
          For({
            each: items,
            children: (item: string) => {
              createEffect(trigger, () => {
                totalEffectRuns++;
              });
              flush();
              return document.createTextNode(item);
            },
          }),
      }),
    ) as Node;

    container.appendChild(node);
    flush();
    expect(totalEffectRuns).toBe(2);

    setTrigger(1);
    flush();
    expect(totalEffectRuns).toBe(4);

    // Hide - should dispose all item effects
    setShow(false);
    flush();

    setTrigger(2);
    flush();
    expect(totalEffectRuns).toBe(4); // Should not increase
  });
});
