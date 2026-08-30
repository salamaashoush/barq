import { describe, expect, test } from "bun:test";
import { effect, flush, root, signal } from "@barqjs/core";
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
    const source = signal("a");
    const dispose = root((d) => {
      const out = debounced(source, 20);
      expect(out()).toBe("a");
      source.set("b");
      flush();
      source.set("c");
      flush();
      expect(out()).toBe("a");
      return [d, out] as const;
    });
    await eventually(() => {
      flush();
      return dispose[1]() === "c";
    }, "the debounced value to settle");
    dispose[0]();
  });

  test("stops publishing after its owner disposes", async () => {
    const source = signal(0);
    let out!: () => number;
    const dispose = root((d) => {
      out = debounced(source, 20);
      return d;
    });
    source.set(1);
    flush();
    dispose();
    await sleep(60);
    expect(out(), "a disposed debounce still published").toBe(0);
  });
});

describe("throttled", () => {
  test("publishes at most once per window", async () => {
    const source = signal(0);
    const seen: number[] = [];
    const dispose = root((d) => {
      const out = throttled(source, 30);
      effect(() => seen.push(out()));
      return d;
    });
    expect(seen).toEqual([0]);
    source.set(1);
    flush();
    source.set(2);
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
    const source = signal(1);
    const dispose = root((d) => {
      const prev = previous(source);
      expect(prev()).toBeUndefined();
      source.set(2);
      flush();
      expect(prev()).toBe(1);
      source.set(3);
      flush();
      expect(prev()).toBe(2);
      return d;
    });
    dispose();
  });

  test("advances even when nobody reads it", () => {
    const source = signal(1);
    const dispose = root((d) => {
      const prev = previous(source);
      source.set(2);
      flush();
      source.set(3);
      flush();
      expect(prev()).toBe(2);
      return d;
    });
    dispose();
  });

  test("takes an initial value", () => {
    const source = signal(1);
    root((d) => {
      expect(previous(source, 0)()).toBe(0);
      d();
    });
  });
});

describe("whenever", () => {
  test("runs only while the condition is truthy, and cleans up on the way out", () => {
    const value = signal<string | null>(null);
    const log: string[] = [];
    const dispose = root((d) => {
      whenever(value, (v) => {
        log.push(`in:${v}`);
        return () => log.push(`out:${v}`);
      });
      return d;
    });

    expect(log).toEqual([]);
    value.set("a");
    flush();
    expect(log).toEqual(["in:a"]);
    value.set("b");
    flush();
    expect(log).toEqual(["in:a", "out:a", "in:b"]);
    value.set(null);
    flush();
    expect(log).toEqual(["in:a", "out:a", "in:b", "out:b"]);
    dispose();
    expect(log).toEqual(["in:a", "out:a", "in:b", "out:b"]);
  });

  test("cleans up when its owner disposes", () => {
    const value = signal(1);
    const log: string[] = [];
    const dispose = root((d) => {
      whenever(value, () => () => log.push("out"));
      return d;
    });
    dispose();
    expect(log).toEqual(["out"]);
  });
});

describe("every / some / not", () => {
  test("combine sources and values", () => {
    const a = signal(true);
    const b = signal(false);
    const dispose = root((d) => {
      const all = every(a, b, true);
      const any = some(a, b);
      expect(all()).toBe(false);
      expect(any()).toBe(true);
      b.set(true);
      flush();
      expect(all()).toBe(true);
      a.set(false);
      flush();
      expect(all()).toBe(false);
      expect(any()).toBe(true);
      expect(not(a)()).toBe(true);
      return d;
    });
    dispose();
  });
});

describe("selector", () => {
  test("wakes only the rows that changed", () => {
    const selected = signal(1);
    const runs: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    const dispose = root((d) => {
      const isSelected = selector(selected);
      for (const id of [1, 2, 3]) {
        effect(() => {
          isSelected(id);
          runs[id]!++;
        });
      }
      return d;
    });

    expect(runs).toEqual({ 1: 1, 2: 1, 3: 1 });
    selected.set(2);
    flush();
    expect(runs).toEqual({ 1: 2, 2: 2, 3: 1 });
    selected.set(3);
    flush();
    expect(runs).toEqual({ 1: 2, 2: 3, 3: 2 });
    dispose();
  });

  test("reports the right answer for a key subscribed after the fact", () => {
    const selected = signal(2);
    const dispose = root((d) => {
      const isSelected = selector(selected);
      expect(isSelected(1)).toBe(false);
      expect(isSelected(2)).toBe(true);
      selected.set(1);
      flush();
      expect(isSelected(1)).toBe(true);
      expect(isSelected(2)).toBe(false);
      expect(isSelected(3)).toBe(false);
      return d;
    });
    dispose();
  });

  test("supports a custom comparison", () => {
    const range = signal(5);
    const dispose = root((d) => {
      const below = selector<number, number>(range, (key, value) => key < value);
      expect(below(1)).toBe(true);
      expect(below(9)).toBe(false);
      range.set(0);
      flush();
      expect(below(1)).toBe(false);
      return d;
    });
    dispose();
  });

  test("drops a key once nothing observes it", () => {
    const selected = signal(1);
    const dispose = root((d) => {
      const isSelected = selector(selected);
      const inner = root((innerDispose) => {
        effect(() => isSelected(42));
        return innerDispose;
      });
      selected.set(42);
      flush();
      inner();
      selected.set(1);
      flush();
      // Nothing observes 42 any more; asking again must still be correct.
      expect(isSelected(42)).toBe(false);
      return d;
    });
    dispose();
  });
});
