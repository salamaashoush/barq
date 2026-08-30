/**
 * Rendering and Reactivity Tests - Edge cases and SolidJS comparison
 * Tests for issues found during deep framework analysis
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { element } from "./dom.ts";
import { signal, effect, computed, scope, batch, onCleanup, flush } from "./signals.ts";
import { Dynamic, Errored, For, Loading, Match, Portal, Show, Switch } from "./components.ts";
import { mergeProps, splitProps } from "./props.ts";
import type { Scope } from "./scope.ts";
import { resource } from "./async.ts";

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

// ============================================================================
// Issue 1: For component doesn't update item when value changes (only index)
// ============================================================================
describe("For component item updates", () => {
  test("ISSUE: For should provide reactive item access", () => {
    const items = signal([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);

    let renderCount = 0;
    const renderedNames: string[] = [];

    const node = For(null, {
      each: items,
      children: (_s: unknown, item: { id: number; name: string }, _index: () => number) => {
        renderCount++;
        // In SolidJS, `item` is the actual value, not reactive
        // But the component should re-render when the item changes
        const div = document.createElement("div");
        div.textContent = item.name;
        renderedNames.push(item.name);
        return div;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("AliceBob");
    expect(renderCount).toBe(2);

    // Update an item's name while keeping same key
    items.set([
      { id: 1, name: "ALICE" }, // Changed name
      { id: 2, name: "Bob" },
    ]);
    flush();

    // The item with id=1 should be re-rendered with new name
    // This is the expected SolidJS behavior for keyed lists
    expect(container.textContent).toBe("ALICEBob");
  });

  test("For should handle items with same key but different values", () => {
    const items = signal([{ id: 1, value: "a" }]);

    const node = For(null, {
      each: items,
      children: (_s: unknown, item: { value: string }) => {
        const span = document.createElement("span");
        span.textContent = item.value;
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("a");

    // Same key, different value
    items.set([{ id: 1, value: "b" }]);
    flush();
    expect(container.textContent).toBe("b");
  });
});

// ============================================================================
// Issue 2: LIS algorithm performance - should be O(n log n) not O(n²)
// ============================================================================
describe("LIS algorithm performance", () => {
  test("For should handle large list reordering efficiently", () => {
    // Create a large list
    const size = 1000;
    const initialItems = Array.from({ length: size }, (_, i) => ({ id: i, value: `item-${i}` }));
    const items = signal(initialItems);

    const node = For(null, {
      each: items,
      children: (_s: unknown, item: { value: string }) => {
        const div = document.createElement("div");
        div.textContent = item.value;
        return div;
      },
    });

    container.appendChild(node as Node);

    // Reverse the list - this should use LIS for minimal moves
    const start = performance.now();
    items.set(initialItems.toReversed());
    flush();
    const elapsed = performance.now() - start;

    // With O(n log n) LIS, this should be fast
    // With O(n²), this would be noticeably slow
    expect(elapsed).toBeLessThan(100); // Should complete quickly

    // Verify correct order
    const divs = container.querySelectorAll("div");
    expect(divs[0].textContent).toBe("item-999");
    expect(divs[999].textContent).toBe("item-0");
  });

  test("For should handle shuffle efficiently", () => {
    const size = 500;
    const items = signal(Array.from({ length: size }, (_, i) => ({ id: i })));

    const node = For(null, {
      each: items,
      children: (_s: unknown, item: { id: number }) => {
        const div = document.createElement("div");
        div.dataset.id = String(item.id);
        return div;
      },
    });

    container.appendChild(node as Node);

    // Shuffle
    const shuffled = items().toSorted(() => Math.random() - 0.5);
    const start = performance.now();
    items.set(shuffled);
    flush();
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });
});

// ============================================================================
// Issue 3: positional rows - the item signal should track value changes
// ============================================================================
describe("For keyed={false} reactivity", () => {
  test("the row item signal updates when the array value at that index changes", () => {
    const items = signal(["a", "b", "c"]);
    const observedValues: string[] = [];

    const node = For(null, {
      each: items,
      keyed: false,
      children: (_s: Scope | null, itemAccessor: () => string, idx: number) => {
        const span = document.createElement("span");
        // itemAccessor is a signal that should update when items[idx] changes
        effect(() => {
          const value = itemAccessor();
          observedValues.push(`${idx}:${value}`);
          span.textContent = value;
        });
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("abc");
    expect(observedValues).toEqual(["0:a", "1:b", "2:c"]);

    // Change value at index 1
    items.set(["a", "B", "c"]);
    flush();
    expect(container.textContent).toBe("aBc");
    expect(observedValues).toContain("1:B");
  });

  test("positional rows handle value updates without rebuilding", () => {
    const items = signal([1, 2, 3, 4, 5]);
    let effectRuns = 0;

    const node = For(null, {
      each: items,
      keyed: false,
      children: (_s: Scope | null, itemAccessor: () => number, _idx: number) => {
        const span = document.createElement("span");
        effect(() => {
          effectRuns++;
          span.textContent = String(itemAccessor());
        });
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(effectRuns).toBe(5); // Initial render

    // Update only one value
    items.set([1, 2, 30, 4, 5]); // Changed index 2
    flush();
    expect(effectRuns).toBe(6); // Only one effect should re-run
  });
});

// ============================================================================
// Issue 4: the loading boundary
// ============================================================================
describe("Loading component", () => {
  test("Loading shows its fallback until the resource settles", async () => {
    let resolvePromise!: (value: string) => void;
    const promise = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });

    const r = resource(
      () => null,
      async () => {
        return await promise;
      },
    );

    // `Await` was this, and went at M10: reading a resource throws `NotReady`
    // before it settles, so the boundary IS the loading state and the read is
    // the body. Solid 2.0 ships no `Await`.
    const node = Loading(null, {
      fallback: element(null, "div", { children: "Loading..." }),
      children: (_s: unknown) => element(null, "div", { children: r() }),
    });

    container.appendChild(node as Node);

    // Should show loading initially
    await new Promise((wake) => setTimeout(wake, 10));
    expect(container.textContent).toContain("Loading");

    // Resolve the promise
    resolvePromise("Data loaded");
    await new Promise((wake) => setTimeout(wake, 50));
    expect(container.textContent).toContain("Data loaded");
  });
});

// ============================================================================
// Issue 5: the error boundary should catch errors in effects
// ============================================================================
describe("Errored", () => {
  test("Errored catches synchronous errors", () => {
    const ThrowingComponent = () => {
      throw new Error("Test error");
    };

    // The error arrives as an ACCESSOR, which is `Errored`'s signature and
    // Solid 2.0's. `ErrorBoundary` handed it over by value and went at M10.
    const node = Errored(null, {
      fallback: (_s: unknown, error: () => Error, _reset: () => void) =>
        element(null, "div", { children: `Error: ${error().message}` }),
      children: ThrowingComponent,
    });

    container.appendChild(node as Node);

    // Should show error fallback
    expect(container.textContent).toContain("Error: Test error");
  });

  test("Errored reset should re-render children", () => {
    const throwSignal = signal(true);
    let resetFn: (() => void) | null = null;

    const MaybeThrow = () => {
      if (throwSignal()) throw new Error("Intentional error");
      return element(null, "div", { children: "Success" });
    };

    const node = Errored(null, {
      fallback: (_s: unknown, error: () => Error, reset: () => void) => {
        resetFn = reset;
        return element(null, "div", { children: `Error: ${error().message}` });
      },
      children: MaybeThrow,
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("Error");

    // Fix the error and reset
    throwSignal.set(false);
    flush();
    (resetFn as (() => void) | null)?.();
    flush();

    // Wait for re-render
    expect(container.textContent).toContain("Success");
  });
});

// ============================================================================
// Issue 6: Portal cleanup
// ============================================================================
describe("Portal component", () => {
  test("Portal renders children to target", async () => {
    const target = document.createElement("div");
    target.id = "portal-target";
    document.body.appendChild(target);

    try {
      const node = Portal(null, {
        mount: "#portal-target",
        children: element(null, "span", { children: "Portal content" }),
      });

      container.appendChild(node as Node);

      await new Promise((wake) => setTimeout(wake, 10));

      expect(target.textContent).toContain("Portal content");
    } finally {
      target.remove();
    }
  });

  test("Portal cleans up when scope is disposed", async () => {
    const target = document.createElement("div");
    target.id = "portal-cleanup-target";
    document.body.appendChild(target);

    try {
      let disposed = false;
      let disposeScope!: () => void;

      scope((dispose, scope) => {
        disposeScope = dispose;

        const node = Portal(scope, {
          mount: "#portal-cleanup-target",
          children: () => {
            onCleanup(() => {
              disposed = true;
            });
            return element(null, "span", { children: "Content" });
          },
        });

        container.appendChild(node as Node);
      });

      await new Promise((wake) => setTimeout(wake, 10));
      expect(target.textContent).toContain("Content");

      // Dispose the scope - this should clean up the portal
      disposeScope();
      await new Promise((wake) => setTimeout(wake, 10));

      // Portal content should be cleaned up
      expect(target.textContent).toBe("");
      expect(disposed).toBe(true);
    } finally {
      target.remove();
    }
  });
});

// ============================================================================
// Issue 7: Reactive styles efficiency
// ============================================================================
describe("Reactive styles", () => {
  test("Multiple reactive style properties should batch updates", () => {
    const width = signal(100);
    const height = signal(100);
    let styleUpdates = 0;

    const node = element(null, "div", {
      style: {
        width: () => {
          styleUpdates++;
          return `${width()}px`;
        },
        height: () => {
          styleUpdates++;
          return `${height()}px`;
        },
      },
    }) as HTMLDivElement;

    container.appendChild(node);
    expect(styleUpdates).toBe(2); // Initial

    // Batch update both
    batch(() => {
      width.set(200);
      height.set(200);
    });

    // Should update both but efficiently
    expect((node as HTMLElement).style.width).toBe("200px");
    expect((node as HTMLElement).style.height).toBe("200px");
  });
});

// ============================================================================
// Issue 8: Show component with keyed rendering
// ============================================================================
describe("Show keyed rendering", () => {
  test("Show should dispose effects when condition changes", () => {
    const show = signal(true);
    const counter = signal(0);
    let effectRuns = 0;

    const node = Show(null, {
      when: show,
      children: () => {
        effect(() => {
          counter();
          effectRuns++;
        });
        return element(null, "div", { children: "Content" });
      },
    });

    container.appendChild(node as Node);
    expect(effectRuns).toBe(1);

    // Update counter - effect should run
    counter.set(1);
    flush();
    expect(effectRuns).toBe(2);

    // Hide - effect should be disposed
    show.set(false);
    flush();

    // Update counter - effect should NOT run (disposed)
    counter.set(2);
    flush();
    expect(effectRuns).toBe(2);

    // Show again - new effect created
    show.set(true);
    flush();
    expect(effectRuns).toBe(3);
  });
});

// ============================================================================
// Issue 9: Computed should not recompute if dependencies haven't changed
// ============================================================================
describe("Computed memoization", () => {
  test("Computed should cache value when dependencies unchanged", () => {
    const a = signal(1);
    const b = signal(2);
    let computeCount = 0;

    const sum = computed(() => {
      computeCount++;
      return a() + b();
    });

    expect(sum()).toBe(3);
    expect(computeCount).toBe(1);

    // Read again without changes
    expect(sum()).toBe(3);
    expect(computeCount).toBe(1); // Should not recompute

    // Change dependency
    a.set(2);
    expect(sum()).toBe(4);
    expect(computeCount).toBe(2);
  });

  test("Computed should handle diamond dependencies", () => {
    const source = signal(1);
    let leftCount = 0;
    let rightCount = 0;
    let bottomCount = 0;

    const left = computed(() => {
      leftCount++;
      return source() * 2;
    });

    const right = computed(() => {
      rightCount++;
      return source() * 3;
    });

    const bottom = computed(() => {
      bottomCount++;
      return left() + right();
    });

    expect(bottom()).toBe(5); // 2 + 3
    expect(leftCount).toBe(1);
    expect(rightCount).toBe(1);
    expect(bottomCount).toBe(1);

    // Update source - all should recompute once
    source.set(2);
    expect(bottom()).toBe(10); // 4 + 6
    expect(leftCount).toBe(2);
    expect(rightCount).toBe(2);
    expect(bottomCount).toBe(2);
  });
});

// ============================================================================
// Issue 10: Batch should prevent intermediate renders
// ============================================================================
describe("Batch behavior", () => {
  test("Batch prevents intermediate effect runs", () => {
    const a = signal(1);
    const b = signal(2);
    const values: number[] = [];

    effect(() => {
      values.push(a() + b());
    });

    expect(values).toEqual([3]);

    batch(() => {
      a.set(10);
      b.set(20);
    });

    // Should only see final value, not intermediate
    expect(values).toEqual([3, 30]);
  });

  test("Nested batches work correctly", () => {
    const s = signal(0);
    const values: number[] = [];

    effect(() => {
      values.push(s());
    });

    expect(values).toEqual([0]);

    batch(() => {
      s.set(1);
      batch(() => {
        s.set(2);
        batch(() => {
          s.set(3);
        });
      });
    });

    // Should only see final value after outermost batch
    expect(values).toEqual([0, 3]);
  });
});

// ============================================================================
// Issue 11: Switch/Match edge cases
// ============================================================================
describe("Switch/Match edge cases", () => {
  test("Switch handles dynamic match order", () => {
    const value = signal<"a" | "b" | "c">("a");

    const node = Switch(null, {
      children: [
        Match(null, {
          when: () => value() === "a",
          children: () => element(null, "span", { children: "A" }),
        }),
        Match(null, {
          when: () => value() === "b",
          children: () => element(null, "span", { children: "B" }),
        }),
        Match(null, {
          when: () => value() === "c",
          children: () => element(null, "span", { children: "C" }),
        }),
      ],
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("A");

    value.set("b");
    flush();
    expect(container.textContent).toBe("B");

    value.set("c");
    flush();
    expect(container.textContent).toBe("C");

    value.set("a");
    flush();
    expect(container.textContent).toBe("A");
  });

  test("Switch fallback when no match", () => {
    const value = signal<string | null>(null);

    const node = Switch(null, {
      fallback: element(null, "span", { children: "No match" }),
      children: [
        Match(null, {
          when: () => value() === "a",
          children: () => element(null, "span", { children: "A" }),
        }),
      ],
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("No match");

    value.set("a");
    flush();
    expect(container.textContent).toBe("A");

    value.set(null);
    flush();
    expect(container.textContent).toBe("No match");
  });
});

// ============================================================================
// Issue 12: Event handler removal
// ============================================================================
describe("Event handler lifecycle", () => {
  test("Event handlers should work with reactive conditions", () => {
    const show = signal(true);
    let clickCount = 0;

    const node = Show(null, {
      when: show,
      children: element(null, "button", { onClick: () => clickCount++, children: "Click me" }),
    });

    container.appendChild(node as Node);

    const button = container.querySelector("button");
    button?.click();
    expect(clickCount).toBe(1);

    // Hide and show again
    show.set(false);
    show.set(true);

    const newButton = container.querySelector("button");
    newButton?.click();
    expect(clickCount).toBe(2);
  });
});

// ============================================================================
// Issue 13: Deep nested reactivity
// ============================================================================
describe("Deep nested reactivity", () => {
  test("Deeply nested Show/For should work correctly", () => {
    const level1 = signal(true);
    const level2 = signal(true);
    const items = signal([1, 2, 3]);

    // O2/C6: a nested region runs under the scope its enclosing Block was
    // GIVEN, so the inner instance is a kid of the outer one and dies with it.
    // Dropping the scope on the way down (`() => Show(null, …)`) leaves the
    // inner region owned by nobody, and the only thing that used to hide that
    // was the marker pair M4 deletes.
    const node = Show(null, {
      when: level1,
      children: (outer: Scope | null) =>
        Show(outer, {
          when: level2,
          children: (inner: Scope | null) =>
            For(inner, {
              each: items,
              children: (_s: unknown, item: unknown) =>
                element(null, "span", { children: String(item) }),
            }),
        }),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("123");

    level2.set(false);
    flush();
    expect(container.textContent).toBe("");

    level2.set(true);
    flush();
    expect(container.textContent).toBe("123");

    items.set([4, 5]);
    flush();
    expect(container.textContent).toBe("45");

    level1.set(false);
    flush();
    expect(container.textContent).toBe("");
  });
});

// ============================================================================
// Issue 14: Effect cleanup order
// ============================================================================
describe("Effect cleanup order", () => {
  test("Cleanup runs before next effect execution", () => {
    const trigger = signal(0);
    const log: string[] = [];

    effect(() => {
      const current = trigger();
      log.push(`run:${current}`);
      onCleanup(() => {
        log.push(`cleanup:${current}`);
      });
    });

    expect(log).toEqual(["run:0"]);

    trigger.set(1);
    flush();
    expect(log).toEqual(["run:0", "cleanup:0", "run:1"]);

    trigger.set(2);
    flush();
    expect(log).toEqual(["run:0", "cleanup:0", "run:1", "cleanup:1", "run:2"]);
  });

  test("Nested effect cleanup order", () => {
    const outer = signal(true);
    const inner = signal(0);
    const log: string[] = [];

    scope(() => {
      effect(() => {
        if (outer()) {
          log.push("outer:run");
          onCleanup(() => log.push("outer:cleanup"));

          effect(() => {
            const val = inner();
            log.push(`inner:run:${val}`);
            onCleanup(() => log.push(`inner:cleanup:${val}`));
          });
        }
      });
    });

    expect(log).toEqual(["outer:run", "inner:run:0"]);

    inner.set(1);
    flush();
    expect(log).toContain("inner:cleanup:0");
    expect(log).toContain("inner:run:1");

    // Hide outer - should dispose inner too
    outer.set(false);
    flush();
    expect(log).toContain("outer:cleanup");
    expect(log).toContain("inner:cleanup:1");
  });
});

// ============================================================================
// Issue 15: scope disposal
// ============================================================================
describe("scope disposal", () => {
  test("scope disposes all children on dispose", () => {
    const trigger = signal(0);
    let effectRuns = 0;
    let dispose!: () => void;

    scope((d) => {
      dispose = d;
      effect(() => {
        trigger();
        effectRuns++;
      });
    });

    expect(effectRuns).toBe(1);

    trigger.set(1);
    flush();
    expect(effectRuns).toBe(2);

    dispose();

    trigger.set(2);
    flush();
    expect(effectRuns).toBe(2); // Should not run after dispose
  });

  test("Detached scope is not disposed with parent", () => {
    const trigger = signal(0);
    let outerRuns = 0;
    let innerRuns = 0;
    let disposeOuter!: () => void;
    let disposeInner!: () => void;

    scope((d) => {
      disposeOuter = d;
      effect(() => {
        trigger();
        outerRuns++;
      });

      // Detached scope
      scope((dInner) => {
        disposeInner = dInner;
        effect(() => {
          trigger();
          innerRuns++;
        });
      }, true); // detached = true
    });

    expect(outerRuns).toBe(1);
    expect(innerRuns).toBe(1);

    trigger.set(1);
    flush();
    expect(outerRuns).toBe(2);
    expect(innerRuns).toBe(2);

    // Dispose outer - inner should still work (detached)
    disposeOuter();

    trigger.set(2);
    flush();
    expect(outerRuns).toBe(2); // Disposed
    expect(innerRuns).toBe(3); // Still running

    // Manually dispose inner
    disposeInner();

    trigger.set(3);
    flush();
    expect(innerRuns).toBe(3); // Now disposed
  });
});

// ============================================================================
// New Utilities: Dynamic, splitProps, mergeProps, children
// ============================================================================
describe("Dynamic component", () => {
  test("renders intrinsic elements dynamically", () => {
    const tag = signal<"div" | "span">("div");

    const node = Dynamic(null, {
      component: () => tag(),
      class: "test",
      children: "Hello",
    });

    container.appendChild(node as Node);

    let el = container.querySelector(".test");
    expect(el?.tagName).toBe("DIV");
    expect(el?.textContent).toBe("Hello");

    tag.set("span");
    flush();
    el = container.querySelector(".test");
    expect(el?.tagName).toBe("SPAN");
    expect(el?.textContent).toBe("Hello");
  });

  test("renders function components dynamically", () => {
    const ComponentA = (_s: unknown, props: { text: string }) =>
      element(null, "div", { class: "a", children: props.text });
    const ComponentB = (_s: unknown, props: { text: string }) =>
      element(null, "span", { class: "b", children: props.text });

    // signal(fn) creates a writable derived signal; wrap to store a function value
    const current = signal<typeof ComponentA>(() => ComponentA);

    const node = Dynamic(null, {
      component: () => current(),
      text: "Hello",
    });

    container.appendChild(node as Node);

    expect(container.querySelector(".a")?.textContent).toBe("Hello");
    expect(container.querySelector(".b")).toBeNull();

    current.set(ComponentB);
    flush();

    expect(container.querySelector(".a")).toBeNull();
    expect(container.querySelector(".b")?.textContent).toBe("Hello");
  });

  test("handles null component gracefully", () => {
    const comp = signal<"div" | null>("div");

    const node = Dynamic(null, {
      component: () => comp() as "div",
      children: "Content",
    });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("Content");

    comp.set(null);
    flush();
    expect(container.textContent).toBe("");
  });
});

describe("splitProps", () => {
  test("splits props into two objects", () => {
    const props = { a: 1, b: 2, c: 3, d: 4 };
    const [picked, rest] = splitProps(props, ["a", "c"]);

    expect(picked).toEqual({ a: 1, c: 3 });
    expect(rest).toEqual({ b: 2, d: 4 });
  });

  test("handles missing keys", () => {
    const props = { a: 1, b: 2 };
    const [picked, rest] = splitProps(props, ["a", "c"] as (keyof typeof props)[]);

    expect(picked).toEqual({ a: 1 } as never);
    expect(rest).toEqual({ b: 2 } as never);
  });

  test("handles empty keys array", () => {
    const props = { a: 1, b: 2 };
    const [picked, rest] = splitProps(props, []);

    expect(picked).toEqual({});
    expect(rest).toEqual({ a: 1, b: 2 });
  });
});

describe("mergeProps", () => {
  test("merges multiple props objects", () => {
    const a = { x: 1, y: 2 };
    const b = { y: 3, z: 4 };
    const result = mergeProps(a, b);

    expect(result).toEqual({ x: 1, y: 3, z: 4 });
  });

  test("later props override earlier ones", () => {
    const a = { value: "a" };
    const b = { value: "b" };
    const c = { value: "c" };
    const result = mergeProps(a, b, c);

    expect(result.value).toBe("c");
  });

  test("handles undefined props gracefully", () => {
    const a = { x: 1 };
    const b = undefined as unknown as { y: number };
    const c = { z: 3 };
    const result = mergeProps(a, b, c);

    expect(result).toEqual({ x: 1, z: 3 });
  });

  // `children` is not special. It is a Block like any other slot, and a Block
  // is not an array a merge can concatenate. Last source wins, exactly as for
  // every other key, which is what makes `mergeProps` one line over the source
  // list instead of a `for…in` body with a special case.
  test("children is an ordinary key: the last source wins", () => {
    const a = { children: ["a", "b"] };
    const b = { children: ["c"] };
    const result = mergeProps(a, b);

    expect(result.children).toEqual(["c"]);
  });
});

// `describe("children helper")` was deleted at M9 with `components.ts`.
//
// `children(fn)` resolved a slot to a Node[] and memoised it — an artefact of
// the EAGER-children convention, where a child arrived as a built subtree and
// something had to flatten it. Under C6 a child is a Block, `insert` owns the
// position it lands in, and `childToNodes` is internal to that. What the three
// tests claimed — a slot resolves to nodes, re-resolves when its signal moves,
// and flattens an array — is what `components.test.ts`'s `childToNodes` block
// asserts directly and what every `insert` test in `dom.test.ts` drives.
