/**
 * Rendering and Reactivity Tests - Edge cases and SolidJS comparison
 * Tests for issues found during deep framework analysis
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { element, render } from "./dom.ts";
import {
  block,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  createEffect,
  flush,
  onCleanup,
  runWithOwner,
} from "./signals.ts";
import { Errored, For, Loading, Match, Portal, Show, Switch, dynamic } from "./components.ts";
import { merge, omit } from "./props.ts";

// The container is a render root, as every element an application shows is
// under one: a delegated handler outside a root has nothing listening for it.
let container: HTMLDivElement;
let unmount: () => void;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  unmount = render(() => null, container);
});

afterEach(() => {
  unmount();
  container.remove();
});

// ============================================================================
// Issue 1: For component doesn't update item when value changes (only index)
// ============================================================================
describe("For component item updates", () => {
  test("ISSUE: For should provide reactive item access", () => {
    const [items, setItems] = createSignal([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);

    let renderCount = 0;
    const renderedNames: string[] = [];

    const node = For({
      each: items,
      children: (item: { id: number; name: string }, _index: () => number) => {
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
    setItems([
      { id: 1, name: "ALICE" }, // Changed name
      { id: 2, name: "Bob" },
    ]);
    flush();

    // The item with id=1 should be re-rendered with new name
    // This is the expected SolidJS behavior for keyed lists
    expect(container.textContent).toBe("ALICEBob");
  });

  test("For should handle items with same key but different values", () => {
    const [items, setItems] = createSignal([{ id: 1, value: "a" }]);

    const node = For({
      each: items,
      children: (item: { value: string }) => {
        const span = document.createElement("span");
        span.textContent = item.value;
        return span;
      },
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("a");

    // Same key, different value
    setItems([{ id: 1, value: "b" }]);
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
    const [items, setItems] = createSignal(initialItems);

    const node = For({
      each: items,
      children: (item: { value: string }) => {
        const div = document.createElement("div");
        div.textContent = item.value;
        return div;
      },
    });

    container.appendChild(node as Node);

    // Reverse the list - this should use LIS for minimal moves
    const start = performance.now();
    setItems(initialItems.toReversed());
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
    const [items, setItems] = createSignal(Array.from({ length: size }, (_, i) => ({ id: i })));

    const node = For({
      each: items,
      children: (item: { id: number }) => {
        const div = document.createElement("div");
        div.dataset.id = String(item.id);
        return div;
      },
    });

    container.appendChild(node as Node);

    // Shuffle
    const shuffled = items().toSorted(() => Math.random() - 0.5);
    const start = performance.now();
    setItems(shuffled);
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
    const [items, setItems] = createSignal(["a", "b", "c"]);
    const observedValues: string[] = [];

    const node = For({
      each: items,
      keyed: false,
      children: (itemAccessor: () => string, idx: number) => {
        const span = document.createElement("span");
        // itemAccessor is a signal that should update when items[idx] changes
        createEffect(itemAccessor, (value) => {
          observedValues.push(`${idx}:${value}`);
          span.textContent = value;
        });
        flush();
        return span;
      },
    });

    container.appendChild(node as Node);
    flush();
    expect(container.textContent).toBe("abc");
    expect(observedValues).toEqual(["0:a", "1:b", "2:c"]);

    // Change value at index 1
    setItems(["a", "B", "c"]);
    flush();
    expect(container.textContent).toBe("aBc");
    expect(observedValues).toContain("1:B");
  });

  test("positional rows handle value updates without rebuilding", () => {
    const [items, setItems] = createSignal([1, 2, 3, 4, 5]);
    let effectRuns = 0;

    const node = For({
      each: items,
      keyed: false,
      children: (itemAccessor: () => number, _idx: number) => {
        const span = document.createElement("span");
        createEffect(itemAccessor, (value) => {
          effectRuns++;
          span.textContent = String(value);
        });
        flush();
        return span;
      },
    });

    container.appendChild(node as Node);
    flush();
    expect(effectRuns).toBe(5); // Initial render

    // Update only one value
    setItems([1, 2, 30, 4, 5]); // Changed index 2
    flush();
    expect(effectRuns).toBe(6); // Only one effect should re-run
  });
});

// ============================================================================
// Issue 4: the loading boundary
// ============================================================================
describe("Loading component", () => {
  test("Loading shows its fallback until the value settles", async () => {
    let resolvePromise!: (value: string) => void;
    const promise = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });

    const r = createMemo(() => promise);

    // Reading an async value before it settles throws `NotReady`, so the
    // boundary IS the loading state and the read is the body.
    const node = Loading({
      fallback: element("div", { children: "Loading..." }),
      children: () => element("div", { children: r() }),
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
    const node = createRoot(() =>
      Errored({
        fallback: (error: () => Error, _reset: () => void) =>
          element("div", { children: `Error: ${error().message}` }),
        children: ThrowingComponent,
      }),
    );

    container.appendChild(node as Node);

    // Should show error fallback
    expect(container.textContent).toContain("Error: Test error");
  });

  test("Errored reset should re-render children", () => {
    const [throwSignal, setThrowSignal] = createSignal(true);
    let resetFn: (() => void) | null = null;

    const MaybeThrow = () => {
      if (throwSignal()) throw new Error("Intentional error");
      return element("div", { children: "Success" });
    };

    const node = createRoot(() =>
      Errored({
        fallback: (error: () => Error, reset: () => void) => {
          resetFn = reset;
          return element("div", { children: `Error: ${error().message}` });
        },
        children: MaybeThrow,
      }),
    );

    container.appendChild(node as Node);
    expect(container.textContent).toContain("Error");

    // Fix the error and reset
    setThrowSignal(false);
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
      const node = Portal({
        mount: "#portal-target",
        children: element("span", { children: "Portal content" }),
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

      createRoot((dispose) => {
        disposeScope = dispose;

        const node = Portal({
          mount: "#portal-cleanup-target",
          children: () => {
            onCleanup(() => {
              disposed = true;
            });
            return element("span", { children: "Content" });
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
    const [width, setWidth] = createSignal(100);
    const [height, setHeight] = createSignal(100);
    let styleUpdates = 0;

    const node = element("div", {
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
    flush(() => {
      setWidth(200);
      setHeight(200);
    });

    // Should update both but efficiently
    flush();
    expect((node as HTMLElement).style.width).toBe("200px");
    expect((node as HTMLElement).style.height).toBe("200px");
  });
});

// ============================================================================
// Issue 8: Show component with keyed rendering
// ============================================================================
describe("Show keyed rendering", () => {
  test("Show should dispose effects when condition changes", () => {
    const [show, setShow] = createSignal(true);
    const [counter, setCounter] = createSignal(0);
    let effectRuns = 0;

    const node = Show({
      when: show,
      children: () => {
        createEffect(counter, () => {
          effectRuns++;
        });
        flush();
        return element("div", { children: "Content" });
      },
    });

    container.appendChild(node as Node);
    flush();
    expect(effectRuns).toBe(1);

    // Update counter - effect should run
    setCounter(1);
    flush();
    expect(effectRuns).toBe(2);

    // Hide - effect should be disposed
    setShow(false);
    flush();

    // Update counter - effect should NOT run (disposed)
    setCounter(2);
    flush();
    expect(effectRuns).toBe(2);

    // Show again - new effect created
    setShow(true);
    flush();
    expect(effectRuns).toBe(3);
  });
});

// ============================================================================
// Issue 9: Computed should not recompute if dependencies haven't changed
// ============================================================================
describe("Computed memoization", () => {
  test("Computed should cache value when dependencies unchanged", () => {
    const [a, setA] = createSignal(1);
    const [b] = createSignal(2);
    let computeCount = 0;

    const sum = createMemo(() => {
      computeCount++;
      return a() + b();
    });

    expect(sum()).toBe(3);
    expect(computeCount).toBe(1);

    // Read again without changes
    expect(sum()).toBe(3);
    expect(computeCount).toBe(1); // Should not recompute

    // Change dependency
    setA(2);
    flush();
    expect(sum()).toBe(4);
    expect(computeCount).toBe(2);
  });

  test("Computed should handle diamond dependencies", () => {
    const [source, setSource] = createSignal(1);
    let leftCount = 0;
    let rightCount = 0;
    let bottomCount = 0;

    const left = createMemo(() => {
      leftCount++;
      return source() * 2;
    });

    const right = createMemo(() => {
      rightCount++;
      return source() * 3;
    });

    const bottom = createMemo(() => {
      bottomCount++;
      return left() + right();
    });

    expect(bottom()).toBe(5); // 2 + 3
    expect(leftCount).toBe(1);
    expect(rightCount).toBe(1);
    expect(bottomCount).toBe(1);

    // Update source - all should recompute once
    setSource(2);
    flush();
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
    const [a, setA] = createSignal(1);
    const [b, setB] = createSignal(2);
    const values: number[] = [];

    createEffect(
      () => a() + b(),
      (sum) => {
        values.push(sum);
      },
    );
    flush();

    flush();
    expect(values).toEqual([3]);

    flush(() => {
      setA(10);
      setB(20);
    });

    // Should only see final value, not intermediate
    flush();
    expect(values).toEqual([3, 30]);
  });

  test("Nested batches work correctly", () => {
    const [s, setS] = createSignal(0);
    const values: number[] = [];

    createEffect(s, (value) => {
      values.push(value);
    });
    flush();

    flush();
    expect(values).toEqual([0]);

    flush(() => {
      setS(1);
      flush(() => {
        setS(2);
        flush(() => {
          setS(3);
        });
      });
    });

    // Should only see final value after outermost batch
    flush();
    expect(values).toEqual([0, 3]);
  });
});

// ============================================================================
// Issue 11: Switch/Match edge cases
// ============================================================================
describe("Switch/Match edge cases", () => {
  test("Switch handles dynamic match order", () => {
    const [value, setValue] = createSignal<"a" | "b" | "c">("a");

    const node = Switch({
      children: [
        Match({
          when: () => value() === "a",
          children: () => element("span", { children: "A" }),
        }),
        Match({
          when: () => value() === "b",
          children: () => element("span", { children: "B" }),
        }),
        Match({
          when: () => value() === "c",
          children: () => element("span", { children: "C" }),
        }),
      ],
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("A");

    setValue("b");
    flush();
    expect(container.textContent).toBe("B");

    setValue("c");
    flush();
    expect(container.textContent).toBe("C");

    setValue("a");
    flush();
    expect(container.textContent).toBe("A");
  });

  test("Switch fallback when no match", () => {
    const [value, setValue] = createSignal<string | null>(null);

    const node = Switch({
      fallback: element("span", { children: "No match" }),
      children: [
        Match({
          when: () => value() === "a",
          children: () => element("span", { children: "A" }),
        }),
      ],
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("No match");

    setValue("a");
    flush();
    expect(container.textContent).toBe("A");

    setValue(null);
    flush();
    expect(container.textContent).toBe("No match");
  });
});

// ============================================================================
// Issue 12: Event handler removal
// ============================================================================
describe("Event handler lifecycle", () => {
  test("Event handlers should work with reactive conditions", () => {
    const [show, setShow] = createSignal(true);
    let clickCount = 0;

    const node = Show({
      when: show,
      children: element("button", { onClick: () => clickCount++, children: "Click me" }),
    });

    container.appendChild(node as Node);

    const button = container.querySelector("button");
    button?.click();
    expect(clickCount).toBe(1);

    // Hide and show again
    setShow(false);
    setShow(true);

    const newButton = container.querySelector("button");
    newButton?.click();
    flush();
    expect(clickCount).toBe(2);
  });
});

// ============================================================================
// Issue 13: Deep nested reactivity
// ============================================================================
describe("Deep nested reactivity", () => {
  test("Deeply nested Show/For should work correctly", () => {
    const [level1, setLevel1] = createSignal(true);
    const [level2, setLevel2] = createSignal(true);
    const [items, setItems] = createSignal([1, 2, 3]);

    // O2/C6: a nested region runs under the scope its enclosing Block was
    // GIVEN, so the inner instance is a kid of the outer one and dies with it.
    // Dropping the scope on the way down (`() => Show(…)`) leaves the
    // inner region owned by nobody, and the only thing that used to hide that
    // was the marker pair M4 deletes.
    const node = Show({
      when: level1,
      children: () =>
        Show({
          when: level2,
          children: () =>
            For({
              each: items,
              children: (item: unknown) => element("span", { children: String(item) }),
            }),
        }),
    });

    container.appendChild(node as Node);
    expect(container.textContent).toBe("123");

    setLevel2(false);
    flush();
    expect(container.textContent).toBe("");

    setLevel2(true);
    flush();
    expect(container.textContent).toBe("123");

    setItems([4, 5]);
    flush();
    expect(container.textContent).toBe("45");

    setLevel1(false);
    flush();
    expect(container.textContent).toBe("");
  });
});

// ============================================================================
// Issue 14: Effect cleanup order
// ============================================================================
describe("Effect cleanup order", () => {
  test("Cleanup runs before next effect execution", () => {
    const [trigger, setTrigger] = createSignal(0);
    const log: string[] = [];

    createRoot(() => {
      createEffect(trigger, (current) => {
        log.push(`run:${current}`);
        return () => {
          log.push(`cleanup:${current}`);
        };
      });
    });
    flush();

    flush();
    expect(log).toEqual(["run:0"]);

    setTrigger(1);
    flush();
    expect(log).toEqual(["run:0", "cleanup:0", "run:1"]);

    setTrigger(2);
    flush();
    expect(log).toEqual(["run:0", "cleanup:0", "run:1", "cleanup:1", "run:2"]);
  });

  test("Nested effect cleanup order", () => {
    const [outer, setOuter] = createSignal(true);
    const [inner, setInner] = createSignal(0);
    const log: string[] = [];

    // An effect that owns another does so through its compute, which is the
    // half that may have children.
    createRoot(() => {
      createRenderEffect(
        () => {
          if (outer()) {
            log.push("outer:run");
            onCleanup(() => log.push("outer:cleanup"));

            createRenderEffect(
              () => {
                const val = inner();
                log.push(`inner:run:${val}`);
                onCleanup(() => log.push(`inner:cleanup:${val}`));
              },
              () => {},
            );
          }
        },
        () => {},
      );
    });

    flush();
    expect(log).toEqual(["outer:run", "inner:run:0"]);

    setInner(1);
    flush();
    expect(log).toContain("inner:cleanup:0");
    expect(log).toContain("inner:run:1");

    // Hide outer - should dispose inner too
    setOuter(false);
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
    const [trigger, setTrigger] = createSignal(0);
    let effectRuns = 0;
    let dispose!: () => void;

    createRoot((d) => {
      dispose = d;
      createEffect(trigger, () => {
        effectRuns++;
      });
      flush();
    });

    flush();
    expect(effectRuns).toBe(1);

    setTrigger(1);
    flush();
    expect(effectRuns).toBe(2);

    dispose();

    setTrigger(2);
    flush();
    expect(effectRuns).toBe(2); // Should not run after dispose
  });

  test("Detached scope is not disposed with parent", () => {
    const [trigger, setTrigger] = createSignal(0);
    let outerRuns = 0;
    let innerRuns = 0;
    let disposeOuter!: () => void;
    let disposeInner!: () => void;

    createRoot((d) => {
      disposeOuter = d;
      createEffect(trigger, () => {
        outerRuns++;
      });
      flush();

      // Detached scope
      runWithOwner(null, () =>
        createRoot((dInner) => {
          disposeInner = dInner;
          createEffect(trigger, () => {
            innerRuns++;
          });
          flush();
        }),
      ); // detached = true
    });

    flush();
    expect(outerRuns).toBe(1);
    expect(innerRuns).toBe(1);

    setTrigger(1);
    flush();
    expect(outerRuns).toBe(2);
    expect(innerRuns).toBe(2);

    // Dispose outer - inner should still work (detached)
    disposeOuter();

    setTrigger(2);
    flush();
    expect(outerRuns).toBe(2); // Disposed
    expect(innerRuns).toBe(3); // Still running

    // Manually dispose inner
    disposeInner();

    setTrigger(3);
    flush();
    expect(innerRuns).toBe(3); // Now disposed
  });
});

// ============================================================================
// New Utilities: dynamic, omit, merge, children
// ============================================================================
describe("dynamic component", () => {
  test("renders intrinsic elements dynamically", () => {
    const [tag, setTag] = createSignal<"div" | "span">("div");

    const Tagged = dynamic(() => tag());
    const node = Tagged({ class: "test", children: "Hello" });

    container.appendChild(node as Node);

    let el = container.querySelector(".test");
    expect(el?.tagName).toBe("DIV");
    expect(el?.textContent).toBe("Hello");

    setTag("span");
    flush();
    el = container.querySelector(".test");
    expect(el?.tagName).toBe("SPAN");
    expect(el?.textContent).toBe("Hello");
  });

  test("renders function components dynamically", () => {
    const ComponentA = (props: { text: string }) =>
      element("div", { class: "a", children: props.text });
    const ComponentB = (props: { text: string }) =>
      element("span", { class: "b", children: props.text });

    // signal(fn) creates a writable derived signal; wrap to store a function value
    const [current, setCurrent] = createSignal<typeof ComponentA>(() => ComponentA);

    const Current = dynamic(() => current());
    const node = Current({ text: "Hello" });

    container.appendChild(node as Node);

    expect(container.querySelector(".a")?.textContent).toBe("Hello");
    expect(container.querySelector(".b")).toBeNull();

    setCurrent(() => ComponentB);
    flush();

    expect(container.querySelector(".a")).toBeNull();
    expect(container.querySelector(".b")?.textContent).toBe("Hello");
  });

  /**
   * A compiled component IS a Block, and `dynamic` exists to render one held
   * in data.
   *
   * Each `dynamic` instance is a branch keyed on the component, and the key's
   * VALUE was guarded against Blocks the way a Cell slot is. A key is only
   * compared with `===` — never invoked, never stringified — so the guard
   * protected nothing and made a registry of components, which is the whole
   * use, throw from inside the construct itself.
   */
  test("renders a branded Block component, which is what the compiler emits", () => {
    const Compiled = block((props: { text: string }) =>
      element("div", { class: "compiled", children: props.text }),
    );
    const [current] = createSignal<typeof Compiled>(() => Compiled);

    const Current = dynamic(() => current());
    const node = Current({ text: "Hello" });

    container.appendChild(node as Node);
    expect(container.querySelector(".compiled")?.textContent).toBe("Hello");
  });

  test("handles null component gracefully", () => {
    const [comp, setComp] = createSignal<"div" | null>("div");

    const Chosen = dynamic(() => comp());
    const node = Chosen({ children: "Content" });

    container.appendChild(node as Node);
    expect(container.textContent).toContain("Content");

    setComp(null);
    flush();
    expect(container.textContent).toBe("");
  });
});

describe("omit", () => {
  test("leaves out the named keys", () => {
    const props = { a: 1, b: 2, c: 3, d: 4 };
    const rest = omit(props, "a", "c");

    expect(rest).toEqual({ b: 2, d: 4 });
  });

  test("handles missing keys", () => {
    const props = { a: 1, b: 2 };
    const rest = omit(props, ...(["a", "c"] as (keyof typeof props)[]));

    expect(rest).toEqual({ b: 2 } as never);
  });

  test("handles no keys", () => {
    const props = { a: 1, b: 2 };
    const rest = omit(props);

    expect(rest).toEqual({ a: 1, b: 2 });
  });
});

describe("merge", () => {
  test("merges multiple props objects", () => {
    const a = { x: 1, y: 2 };
    const b = { y: 3, z: 4 };
    const result = merge(a, b);

    expect(result).toEqual({ x: 1, y: 3, z: 4 });
  });

  test("later props override earlier ones", () => {
    const a = { value: "a" };
    const b = { value: "b" };
    const c = { value: "c" };
    const result = merge(a, b, c);

    expect(result.value).toBe("c");
  });

  test("handles undefined props gracefully", () => {
    const a = { x: 1 };
    const b = undefined as { y: number } | undefined;
    const c = { z: 3 };
    const result = merge(a, b, c);

    expect(result).toEqual({ x: 1, z: 3 });
  });

  // `children` is not special. It is a Block like any other slot, and a Block
  // is not an array a merge can concatenate. Last source wins, exactly as for
  // every other key, which is what makes `merge` one line over the source
  // list instead of a `for…in` body with a special case.
  test("children is an ordinary key: the last source wins", () => {
    const a = { children: ["a", "b"] };
    const b = { children: ["c"] };
    const result = merge(a, b);

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
