import { describe, expect, test } from "bun:test";
import { createEffect, flush, createRoot, createSignal } from "@barqjs/core";
import { debounced, every, not, previous, selector, some, throttled, whenever } from "./derived.ts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Wait for a condition rather than a duration; a loaded machine runs timers late. */
async function eventually(predicate: () => boolean, what: string, deadline = 2000): Promise<void> {
  const until = Date.now() + deadline;
  while (Date.now() < until) {
    if (predicate()) return;
    await sleep(5);
  }
  throw new Error(`timed out after ${deadline}ms waiting for ${what}`);
}

describe("debounced", () => {
  test("starts at the source value and settles on the last one", async () => {
    const [source, setSource] = createSignal("a");
    const dispose = createRoot((d) => {
      const out = debounced(source, 20);
      expect(out()).toBe("a");
      return [d, out] as const;
    });
    setSource("b");
    flush();
    setSource("c");
    flush();
    expect(dispose[1]()).toBe("a");
    await eventually(() => {
      flush();
      return dispose[1]() === "c";
    }, "the debounced value to settle");
    dispose[0]();
  });

  test("stops publishing after its owner disposes", async () => {
    const [source, setSource] = createSignal(0);
    let out!: () => number;
    const dispose = createRoot((d) => {
      out = debounced(source, 20);
      return d;
    });
    setSource(1);
    flush();
    dispose();
    await sleep(60);
    expect(out(), "a disposed debounce still published").toBe(0);
  });
});

describe("throttled", () => {
  test("publishes at most once per window", async () => {
    const [source, setSource] = createSignal(0);
    const seen: number[] = [];
    const dispose = createRoot((d) => {
      const out = throttled(source, 30);
      createEffect(out, (value) => {
        seen.push(value);
      });
      flush();
      return d;
    });
    expect(seen).toEqual([0]);
    setSource(1);
    flush();
    setSource(2);
    flush();
    expect(seen).toEqual([0]);
    await eventually(() => {
      flush();
      return seen.length > 1;
    }, "the throttled value to publish");
    expect(seen).toEqual([0, 2]);
    dispose();
  });
});

describe("previous", () => {
  test("holds the value from before the current one", () => {
    const [source, setSource] = createSignal(1);
    const [dispose, prev] = createRoot((d) => {
      const earlier = previous(source);
      expect(earlier()).toBeUndefined();
      return [d, earlier] as const;
    });
    setSource(2);
    flush();
    expect(prev()).toBe(1);
    setSource(3);
    flush();
    expect(prev()).toBe(2);
    dispose();
  });

  test("advances even when nobody reads it", () => {
    const [source, setSource] = createSignal(1);
    const [dispose, prev] = createRoot((d) => [d, previous(source)] as const);
    setSource(2);
    flush();
    setSource(3);
    flush();
    expect(prev()).toBe(2);
    dispose();
  });

  test("takes an initial value", () => {
    const [source] = createSignal(1);
    createRoot((d) => {
      expect(previous(source, 0)()).toBe(0);
      d();
    });
  });
});

describe("whenever", () => {
  test("runs only while the condition is truthy, and cleans up on the way out", () => {
    const [value, setValue] = createSignal<string | null>(null);
    const log: string[] = [];
    const dispose = createRoot((d) => {
      whenever(value, (v) => {
        log.push(`in:${v}`);
        return () => log.push(`out:${v}`);
      });
      return d;
    });

    expect(log).toEqual([]);
    setValue("a");
    flush();
    expect(log).toEqual(["in:a"]);
    setValue("b");
    flush();
    expect(log).toEqual(["in:a", "out:a", "in:b"]);
    setValue(null);
    flush();
    expect(log).toEqual(["in:a", "out:a", "in:b", "out:b"]);
    dispose();
    expect(log).toEqual(["in:a", "out:a", "in:b", "out:b"]);
  });

  test("cleans up when its owner disposes", () => {
    const [value] = createSignal(1);
    const log: string[] = [];
    const dispose = createRoot((d) => {
      whenever(value, () => () => log.push("out"));
      return d;
    });
    dispose();
    expect(log).toEqual(["out"]);
  });
});

describe("every / some / not", () => {
  test("combine sources and values", () => {
    const [a, setA] = createSignal(true);
    const [b, setB] = createSignal(false);
    const [dispose, all, any] = createRoot((d) => {
      const both = every(a, b, true);
      const either = some(a, b);
      expect(both()).toBe(false);
      expect(either()).toBe(true);
      return [d, both, either] as const;
    });
    setB(true);
    flush();
    expect(all()).toBe(true);
    setA(false);
    flush();
    expect(all()).toBe(false);
    expect(any()).toBe(true);
    expect(not(a)()).toBe(true);
    dispose();
  });
});

describe("selector", () => {
  test("wakes only the rows that changed", () => {
    const [selected, setSelected] = createSignal(1);
    const runs: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    const dispose = createRoot((d) => {
      const isSelected = selector(selected);
      for (const id of [1, 2, 3]) {
        createEffect(
          () => isSelected(id),
          () => {
            runs[id]!++;
          },
        );
        flush();
      }
      return d;
    });

    expect(runs).toEqual({ 1: 1, 2: 1, 3: 1 });
    setSelected(2);
    flush();
    expect(runs).toEqual({ 1: 2, 2: 2, 3: 1 });
    setSelected(3);
    flush();
    expect(runs).toEqual({ 1: 2, 2: 3, 3: 2 });
    dispose();
  });

  test("reports the right answer for a key subscribed after the fact", () => {
    const [selected, setSelected] = createSignal(2);
    const [dispose, isSelected] = createRoot((d) => {
      const isCurrent = selector(selected);
      expect(isCurrent(1)).toBe(false);
      expect(isCurrent(2)).toBe(true);
      return [d, isCurrent] as const;
    });
    setSelected(1);
    flush();
    expect(isSelected(1)).toBe(true);
    expect(isSelected(2)).toBe(false);
    expect(isSelected(3)).toBe(false);
    dispose();
  });

  test("supports a custom comparison", () => {
    const [range, setRange] = createSignal(5);
    const [dispose, below] = createRoot((d) => {
      const isBelow = selector<number, number>(range, (key, value) => key < value);
      expect(isBelow(1)).toBe(true);
      expect(isBelow(9)).toBe(false);
      return [d, isBelow] as const;
    });
    setRange(0);
    flush();
    expect(below(1)).toBe(false);
    dispose();
  });

  test("drops a key once nothing observes it", () => {
    const [selected, setSelected] = createSignal(1);
    const [dispose, isSelected, inner] = createRoot((d) => {
      const isCurrent = selector(selected);
      const stopObserving = createRoot((innerDispose) => {
        createEffect(
          () => isCurrent(42),
          () => {},
        );
        return innerDispose;
      });
      return [d, isCurrent, stopObserving] as const;
    });
    setSelected(42);
    flush();
    inner();
    setSelected(1);
    flush();
    // Nothing observes 42 any more; asking again must still be correct.
    expect(isSelected(42)).toBe(false);
    dispose();
  });
});
