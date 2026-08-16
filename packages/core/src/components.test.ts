/**
 * Component Tests - Edge cases for Show, For, Switch components
 * Tests for rendering, reactivity, and memory leak scenarios
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { For, Fragment, Match, Show, Switch } from "./components.ts";
import { childToNodes, insert } from "./dom.ts";
import type { Child } from "./dom.ts";
import { signal, effect, createScope, batch, onCleanup, flush } from "./signals.ts";
import type { Scope } from "./scope.ts";

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
    const frag = Fragment(null, {
      children: [
        document.createTextNode("hello"),
        document.createTextNode(" "),
        document.createTextNode("world"),
      ],
    });

    insert(null, container, frag as Child);
    expect(container.textContent).toBe("hello world");
  });

  test("handles null and undefined children", () => {
    const frag = Fragment(null, { children: [null, "text", undefined, 42] as Child[] });

    insert(null, container, frag as Child);
    expect(container.textContent).toBe("text42");
  });

  test("handles boolean children (should be ignored)", () => {
    const frag = Fragment(null, { children: [true, "visible", false] as Child[] });

    insert(null, container, frag as Child);
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
    const on = signal(true);
    const body = document.createDocumentFragment();
    body.appendChild(document.createElement("i"));
    body.appendChild(document.createElement("u"));

    container.appendChild(Show(null, { when: on, children: body }) as Node);
    flush();
    expect(container.querySelectorAll("i, u").length).toBe(2);

    on.set(false);
    flush();
    expect(container.querySelectorAll("i, u").length).toBe(0);

    on.set(true);
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
    const show = signal(true);
    const node = Show(null, {
      when: show,
      children: () => document.createTextNode("visible"),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("visible");
  });

  test("renders fallback when condition is falsy", () => {
    const show = signal(false);
    const node = Show(null, {
      when: show,
      fallback: document.createTextNode("fallback"),
      children: () => document.createTextNode("visible"),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("fallback");
  });

  test("toggles between children and fallback", () => {
    const show = signal(true);
    const node = Show(null, {
      when: show,
      fallback: document.createTextNode("hidden"),
      children: () => document.createTextNode("shown"),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("shown");

    show.set(false);
    flush();
    expect(container.textContent).toContain("hidden");

    show.set(true);
    flush();
    expect(container.textContent).toContain("shown");
  });

  test("passes truthy value to render function", () => {
    const value = signal<string | null>("hello");
    let receivedValue: string | null = null;

    const node = Show(null, {
      when: value,
      children: (_s: unknown, v: string) => {
        receivedValue = v;
        return document.createTextNode(v);
      },
    });

    container.appendChild(node as Node);
    expect(receivedValue).toBe("hello");
    expect(container.textContent).toContain("hello");
  });

  test("handles rapid condition changes", () => {
    const show = signal(true);
    const node = Show(null, {
      when: show,
      fallback: document.createTextNode("off"),
      children: () => document.createTextNode("on"),
    });

    container.appendChild(node as Node);

    // Rapid toggling
    for (let i = 0; i < 10; i++) {
      show.set(i % 2 === 0);
    }
    flush();

    // Should end with "off" (last was false)
    expect(container.textContent).toContain("off");
  });

  test("handles children as direct value (not function)", () => {
    const show = signal(true);
    const node = Show(null, {
      when: show,
      children: document.createTextNode("direct"),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("direct");
  });

  test("disposes inner effects when condition changes", () => {
    const show = signal(true);
    const innerSignal = signal(0);
    let effectRunCount = 0;

    const node = Show(null, {
      when: show,
      children: () => {
        effect(() => {
          innerSignal();
          effectRunCount++;
        });
        return document.createTextNode("content");
      },
    });

    container.appendChild(node as Node);
    expect(effectRunCount).toBe(1);

    innerSignal.set(1);
    flush();
    expect(effectRunCount).toBe(2);

    // Hide - should dispose inner effect
    show.set(false);
    flush();

    // Inner effect should not run anymore
    innerSignal.set(2);
    flush();
    expect(effectRunCount).toBe(2);
  });

  test("EDGE CASE: handles condition returning 0 (falsy but valid)", () => {
    const count = signal(0);
    const node = Show(null, {
      when: count,
      fallback: document.createTextNode("empty"),
      children: (_s: unknown, n: number) => document.createTextNode(`count: ${n}`),
    });

    container.appendChild(node as Node);
    // 0 is falsy, should show fallback
    expect(container.textContent).toContain("empty");

    count.set(5);
    flush();
    expect(container.textContent).toContain("count: 5");
  });

  test("EDGE CASE: handles condition returning empty string (falsy)", () => {
    const text = signal("");
    const node = Show(null, {
      when: text,
      fallback: document.createTextNode("empty"),
      children: (_s: unknown, t: string) => document.createTextNode(t),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("empty");

    text.set("hello");
    flush();
    expect(container.textContent).toContain("hello");
  });

  test("EDGE CASE: children function with default parameters", () => {
    // Function.length is 0 for functions with default params
    const show = signal({ name: "test" });
    let receivedValue: unknown = null;

    const node = Show(null, {
      when: show,
      // This function has default param, so .length === 0
      children: (_s: unknown, item = { name: "default" }) => {
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
    const show = signal(true);
    const innerSignal = signal(0);
    let effectRunCount = 0;
    let cleanupCalled = false;

    let disposeParent: (() => void) | undefined;

    createScope((dispose, scope) => {
      disposeParent = dispose;

      const node = Show(scope, {
        when: show,
        children: () => {
          effect(() => {
            innerSignal();
            effectRunCount++;
          });
          onCleanup(() => {
            cleanupCalled = true;
          });
          return document.createTextNode("content");
        },
      });

      container.appendChild(node as Node);
    });

    expect(effectRunCount).toBe(1);

    // Dispose parent scope (simulating unmount)
    disposeParent!();

    // Inner effect should be disposed
    innerSignal.set(1);
    expect(effectRunCount).toBe(1); // Should not increase

    // Cleanup should have been called
    expect(cleanupCalled).toBe(true);
  });
});

describe("For component", () => {
  test("renders list of items", () => {
    const items = signal(["a", "b", "c"]);
    const node = For(null, {
      each: items,
      children: (_s: unknown, item: string) => document.createTextNode(item),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("abc");
  });

  test("updates when items change", () => {
    const items = signal(["a", "b"]);
    const node = For(null, {
      each: items,
      children: (_s: unknown, item: string) => document.createTextNode(item),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("ab");

    items.set(["x", "y", "z"]);
    flush();
    expect(container.textContent).toContain("xyz");
  });

  test("renders fallback for empty array", () => {
    const items = signal<string[]>([]);
    const node = For(null, {
      each: items,
      fallback: document.createTextNode("empty"),
      children: (_s: unknown, item: string) => document.createTextNode(item),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("empty");
  });

  test("switches between items and fallback", () => {
    const items = signal<string[]>([]);
    const node = For(null, {
      each: items,
      fallback: document.createTextNode("empty"),
      children: (_s: unknown, item: string) => document.createTextNode(item),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("empty");

    items.set(["a"]);
    flush();
    expect(container.textContent).toContain("a");
    expect(container.textContent).not.toContain("empty");

    items.set([]);
    flush();
    expect(container.textContent).toContain("empty");
  });

  test("provides reactive index signal", () => {
    const items = signal(["a", "b", "c"]);
    const indices: number[] = [];

    const node = For(null, {
      each: items,
      children: (_s: unknown, item: string, index: () => number) => {
        effect(() => {
          indices.push(index());
        });
        return document.createTextNode(item);
      },
    });

    container.appendChild(node as Node);
    expect(indices).toEqual([0, 1, 2]);

    // Reverse the array - indices should update
    items.set(["c", "b", "a"]);
    flush();
    // New indices should be pushed
    expect(indices.length).toBeGreaterThan(3);
  });

  test("uses custom key function", () => {
    const items = signal([
      { id: 1, name: "one" },
      { id: 2, name: "two" },
    ]);
    let renderCount = 0;

    const node = For(null, {
      each: items,
      children: (_s: unknown, item: { id: number; name: string }) => {
        renderCount++;
        return document.createTextNode(item.name);
      },
    });

    container.appendChild(node as Node);
    expect(renderCount).toBe(2);
    expect(container.textContent).toContain("onetwo");

    // Reorder - should reuse existing nodes
    items.set([
      { id: 2, name: "two" },
      { id: 1, name: "one" },
    ]);
    flush();

    // Items reordered, not re-rendered
    expect(container.textContent).toContain("twoone");
  });

  test("handles items added at beginning", () => {
    const items = signal(["b", "c"]);
    const node = For(null, {
      each: items,
      children: (_s: unknown, item: string) => {
        const span = document.createElement("span");
        span.textContent = item;
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("bc");

    items.set(["a", "b", "c"]);
    flush();
    expect(container.textContent).toBe("abc");
  });

  test("handles items added at end", () => {
    const items = signal(["a", "b"]);
    const node = For(null, {
      each: items,
      children: (_s: unknown, item: string) => {
        const span = document.createElement("span");
        span.textContent = item;
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("ab");

    items.set(["a", "b", "c"]);
    flush();
    expect(container.textContent).toBe("abc");
  });

  test("handles items removed from middle", () => {
    const items = signal(["a", "b", "c"]);
    const node = For(null, {
      each: items,
      children: (_s: unknown, item: string) => {
        const span = document.createElement("span");
        span.textContent = item;
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("abc");

    items.set(["a", "c"]);
    flush();
    expect(container.textContent).toBe("ac");
  });

  test("handles complete replacement", () => {
    const items = signal(["a", "b", "c"]);
    const node = For(null, {
      each: items,
      children: (_s: unknown, item: string) => {
        const span = document.createElement("span");
        span.textContent = item;
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("abc");

    items.set(["x", "y"]);
    flush();
    expect(container.textContent).toBe("xy");
  });

  test("disposes removed item effects", () => {
    const items = signal(["a", "b"]);
    const effectCounts: Record<string, number> = { a: 0, b: 0 };
    const trigger = signal(0);

    const node = For(null, {
      each: items,
      children: (_s: unknown, item: string) => {
        effect(() => {
          trigger();
          effectCounts[item]++;
        });
        return document.createTextNode(item);
      },
    });

    container.appendChild(node as Node);
    expect(effectCounts).toEqual({ a: 1, b: 1 });

    trigger.set(1);
    flush();
    expect(effectCounts).toEqual({ a: 2, b: 2 });

    // Remove 'b'
    items.set(["a"]);
    flush();

    // Trigger again - only 'a' should update
    trigger.set(2);
    flush();
    expect(effectCounts.a).toBe(3);
    expect(effectCounts.b).toBe(2); // Should not increase
  });

  test("EDGE CASE: handles null/undefined each", () => {
    const items = signal<string[] | null>(null);
    const node = For(null, {
      each: items,
      fallback: document.createTextNode("empty"),
      children: (_s: unknown, item: string) => document.createTextNode(item),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("empty");
  });

  test("EDGE CASE: handles getter function for each", () => {
    const items = signal(["a", "b"]);
    const node = For(null, {
      each: () => items(),
      children: (_s: unknown, item: string) => document.createTextNode(item),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("ab");

    items.set(["x", "y", "z"]);
    flush();
    expect(container.textContent).toContain("xyz");
  });

  test("EDGE CASE: handles duplicate keys", () => {
    // With duplicate keys, only unique keys are rendered (Map-based cache)
    // This is a known limitation - use unique keys for correct behavior
    const items = signal(["a", "a", "b"]);
    const node = For(null, {
      each: items,
      children: (_s: unknown, item: string) => document.createTextNode(item),
    });

    container.appendChild(node as Node);
    // Only renders unique keys: "a" and "b"
    expect(container.textContent).toContain("ab");
  });

  test("EDGE CASE: LIS algorithm with reversal", () => {
    const items = signal([
      { id: 1, v: "a" },
      { id: 2, v: "b" },
      { id: 3, v: "c" },
      { id: 4, v: "d" },
    ]);
    let renderCount = 0;

    const node = For(null, {
      each: items,
      children: (_s: unknown, item: { id: number; v: string }) => {
        renderCount++;
        const span = document.createElement("span");
        span.textContent = item.v;
        span.setAttribute("data-id", String(item.id));
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("abcd");
    expect(renderCount).toBe(4);

    // Reverse with new object references - triggers re-render because items changed
    // (Object.is() returns false for new objects even with same content)
    items.set([
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
    const items = signal([a, b, c, d]);
    let renderCount = 0;

    const node = For(null, {
      each: items,
      children: (_s: unknown, item: { id: number; v: string }) => {
        renderCount++;
        const span = document.createElement("span");
        span.textContent = item.v;
        span.setAttribute("data-id", String(item.id));
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("abcd");
    expect(renderCount).toBe(4);

    // Reverse using SAME object references - should reorder, not re-render
    items.set([d, c, b, a]);
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
    const items = signal(["a", "c", "e"]);
    const node = For(null, {
      each: items,
      children: (_s: unknown, item: string) => {
        const span = document.createElement("span");
        span.textContent = item;
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("ace");

    // Insert b and d
    items.set(["a", "b", "c", "d", "e"]);
    flush();
    expect(container.textContent).toBe("abcde");

    // Remove b and d
    items.set(["a", "c", "e"]);
    flush();
    expect(container.textContent).toBe("ace");
  });

  test("handles batch updates", () => {
    const items = signal(["a"]);
    let effectRuns = 0;

    const node = For(null, {
      each: items,
      children: (_s: unknown, item: string) => {
        effect(() => {
          void item; // track
          effectRuns++;
        });
        return document.createTextNode(item);
      },
    });

    container.appendChild(node as Node);
    expect(effectRuns).toBe(1);

    batch(() => {
      items.set(["b"]);
      items.set(["c"]);
      items.set(["d"]);
    });

    // Should only process final value
    expect(container.textContent).toContain("d");
  });
});

describe("For keyed={false} — the positional mode", () => {
  test("renders list with static indices", () => {
    const items = signal(["a", "b", "c"]);
    const receivedIndices: number[] = [];

    const node = For(null, {
      each: items,
      keyed: false,
      children: (_s: Scope | null, item: () => string, index: number) => {
        receivedIndices.push(index);
        return document.createTextNode(item());
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("abc");
    expect(receivedIndices).toEqual([0, 1, 2]);
  });

  test("item signal updates when value changes", () => {
    const items = signal(["a", "b", "c"]);
    let updateCount = 0;

    const node = For(null, {
      each: items,
      keyed: false,
      children: (_s: Scope | null, item: () => string, _index: number) => {
        effect(() => {
          item(); // subscribe
          updateCount++;
        });
        const span = document.createElement("span");
        effect(() => {
          span.textContent = item();
        });
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("abc");
    expect(updateCount).toBe(3);

    // Update value at index 1
    items.set(["a", "X", "c"]);
    flush();
    expect(container.textContent).toBe("aXc");
    // Only index 1's item signal should trigger
    expect(updateCount).toBe(4);
  });

  test("handles array shrinking", () => {
    const items = signal(["a", "b", "c", "d"]);
    const node = For(null, {
      each: items,
      keyed: () => false,
      children: (_s: Scope | null, item: () => string) => {
        const span = document.createElement("span");
        effect(() => {
          span.textContent = item();
        });
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("abcd");

    items.set(["a", "b"]);
    flush();
    expect(container.textContent).toBe("ab");
  });

  test("handles array growing", () => {
    const items = signal(["a"]);
    const node = For(null, {
      each: items,
      keyed: () => false,
      children: (_s: Scope | null, item: () => string) => {
        const span = document.createElement("span");
        effect(() => {
          span.textContent = item();
        });
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("a");

    items.set(["a", "b", "c"]);
    flush();
    expect(container.textContent).toBe("abc");
  });

  test("disposes effects when items are removed", () => {
    const items = signal(["a", "b", "c"]);
    const trigger = signal(0);
    const effectCounts = [0, 0, 0];

    const node = For(null, {
      each: items,
      keyed: false,
      children: (_s: Scope | null, item: () => string, index: number) => {
        effect(() => {
          item();
          trigger();
          effectCounts[index]++;
        });
        return document.createTextNode(item());
      },
    });

    container.appendChild(node as Node);
    expect(effectCounts).toEqual([1, 1, 1]);

    trigger.set(1);
    flush();
    expect(effectCounts).toEqual([2, 2, 2]);

    // Shrink to 1 item
    items.set(["x"]);
    flush();

    trigger.set(2);
    flush();
    // Only index 0 should update
    expect(effectCounts[0]).toBe(4); // +1 for value change, +1 for trigger
    expect(effectCounts[1]).toBe(2); // disposed
    expect(effectCounts[2]).toBe(2); // disposed
  });

  test("EDGE CASE: empty to non-empty transition", () => {
    const items = signal<string[]>([]);
    const node = For(null, {
      each: items,
      keyed: () => false,
      fallback: document.createTextNode("empty"),
      children: (_s: Scope | null, item: () => string) => document.createTextNode(item()),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("empty");

    items.set(["first"]);
    flush();
    expect(container.textContent).toContain("first");
    expect(container.textContent).not.toContain("empty");
  });
});

describe("Switch/Match components", () => {
  test("renders first matching condition", () => {
    const value = signal(1);
    const node = Switch(null, {
      children: [
        Match(null, { when: () => value() === 1, children: () => document.createTextNode("one") }),
        Match(null, { when: () => value() === 2, children: () => document.createTextNode("two") }),
      ],
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("one");
  });

  test("updates when condition changes", () => {
    const value = signal(1);
    const node = Switch(null, {
      children: [
        Match(null, { when: () => value() === 1, children: () => document.createTextNode("one") }),
        Match(null, { when: () => value() === 2, children: () => document.createTextNode("two") }),
        Match(null, {
          when: () => value() === 3,
          children: () => document.createTextNode("three"),
        }),
      ],
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("one");

    value.set(2);
    flush();
    expect(container.textContent).toContain("two");
    expect(container.textContent).not.toContain("one");

    value.set(3);
    flush();
    expect(container.textContent).toContain("three");
  });

  test("renders fallback when no match", () => {
    const value = signal(99);
    const node = Switch(null, {
      fallback: document.createTextNode("default"),
      children: [
        Match(null, { when: () => value() === 1, children: () => document.createTextNode("one") }),
        Match(null, { when: () => value() === 2, children: () => document.createTextNode("two") }),
      ],
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("default");
  });

  test("keyed match re-renders on value change", () => {
    const user = signal({ id: 1, name: "Alice" });
    let renderCount = 0;

    const node = Switch(null, {
      children: [
        Match(null, {
          when: user,
          keyed: true,
          children: (_s: unknown, u: { id: number; name: string }) => {
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
    user.set({ id: 2, name: "Bob" });
    flush();
    expect(container.textContent).toContain("Bob");
    expect(renderCount).toBe(2);
  });

  test("non-keyed match does not re-render on value change", () => {
    const user = signal({ id: 1, name: "Alice" });
    let renderCount = 0;

    const node = Switch(null, {
      children: [
        Match(null, {
          when: user,
          keyed: () => false,
          children: () => {
            renderCount++;
            const span = document.createElement("span");
            effect(() => {
              span.textContent = user().name;
            });
            return span;
          },
        }),
      ],
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("Alice");
    expect(renderCount).toBe(1);

    // Change value - should NOT re-render, just update via effect
    user.set({ id: 2, name: "Bob" });
    flush();
    expect(container.textContent).toContain("Bob");
    expect(renderCount).toBe(1); // Still 1
  });

  test("disposes previous match effects", () => {
    const value = signal(1);
    const trigger = signal(0);
    let effect1Runs = 0;
    let effect2Runs = 0;

    const node = Switch(null, {
      children: [
        Match(null, {
          when: () => value() === 1,
          children: () => {
            effect(() => {
              trigger();
              effect1Runs++;
            });
            return document.createTextNode("one");
          },
        }),
        Match(null, {
          when: () => value() === 2,
          children: () => {
            effect(() => {
              trigger();
              effect2Runs++;
            });
            return document.createTextNode("two");
          },
        }),
      ],
    });

    container.appendChild(node as Node);
    expect(effect1Runs).toBe(1);
    expect(effect2Runs).toBe(0);

    trigger.set(1);
    flush();
    expect(effect1Runs).toBe(2);

    // Switch to second match
    value.set(2);
    flush();
    expect(effect2Runs).toBe(1);

    // Trigger should only affect second match now
    trigger.set(2);
    flush();
    expect(effect1Runs).toBe(2); // Should not increase
    expect(effect2Runs).toBe(2);
  });

  test("EDGE CASE: multiple matches with same condition", () => {
    const show = signal(true);
    const node = Switch(null, {
      children: [
        Match(null, { when: show, children: () => document.createTextNode("first") }),
        Match(null, { when: show, children: () => document.createTextNode("second") }),
      ],
    });

    container.appendChild(node as Node);
    // Should render first match only
    expect(container.textContent).toContain("first");
    expect(container.textContent).not.toContain("second");
  });
});

// `describe("Marker utilities")` was deleted at M9 with `markers.ts` (§4.1).
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
    const outer = signal(true);
    const inner = signal(true);
    let outerEffectRuns = 0;
    let innerEffectRuns = 0;
    const trigger = signal(0);

    const node = createScope((_dispose, scope) =>
      Show(scope, {
        when: outer,
        children: (inner$: Scope | null) => {
          effect(() => {
            trigger();
            outerEffectRuns++;
          });
          return Show(inner$, {
            when: inner,
            children: () => {
              effect(() => {
                trigger();
                innerEffectRuns++;
              });
              return document.createTextNode("nested");
            },
          });
        },
      }),
    ) as Node;

    container.appendChild(node);
    expect(outerEffectRuns).toBe(1);
    expect(innerEffectRuns).toBe(1);

    trigger.set(1);
    flush();
    expect(outerEffectRuns).toBe(2);
    expect(innerEffectRuns).toBe(2);

    // Hide outer - should dispose both
    outer.set(false);
    flush();

    trigger.set(2);
    flush();
    expect(outerEffectRuns).toBe(2); // Should not increase
    expect(innerEffectRuns).toBe(2); // Should not increase
  });

  test("For inside Show disposes item effects", () => {
    const show = signal(true);
    const items = signal(["a", "b"]);
    const trigger = signal(0);
    let totalEffectRuns = 0;

    const node = createScope((_dispose, scope) =>
      Show(scope, {
        when: show,
        children: (row$: Scope | null) =>
          For(row$, {
            each: items,
            children: (_s: unknown, item: string) => {
              effect(() => {
                trigger();
                totalEffectRuns++;
              });
              return document.createTextNode(item);
            },
          }),
      }),
    ) as Node;

    container.appendChild(node);
    expect(totalEffectRuns).toBe(2);

    trigger.set(1);
    flush();
    expect(totalEffectRuns).toBe(4);

    // Hide - should dispose all item effects
    show.set(false);
    flush();

    trigger.set(2);
    flush();
    expect(totalEffectRuns).toBe(4); // Should not increase
  });
});
