import { describe, expect, test } from "bun:test";
import { effect, flush, root, signal } from "@barqjs/core";
import { debounce, leading, leadingAndTrailing, scheduled, throttle } from "./scheduled.ts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Wait for a condition rather than a duration.
 *
 * A fixed nap sized to a window measures the machine's scheduler as much as
 * the primitive: under load a `sleep(30)` can take 60ms, and an assertion
 * written against "the window has not closed yet" then reads the wrong side of
 * it. Waiting on the observation itself only ever gets slower, never wrong.
 */
async function eventually(predicate: () => boolean, what: string, deadline = 2000): Promise<void> {
  const until = Date.now() + deadline;
  while (Date.now() < until) {
    if (predicate()) return;
    await sleep(5);
  }
  throw new Error(`timed out after ${deadline}ms waiting for ${what}`);
}

describe("debounce", () => {
  test("runs once, on the trailing edge, with the last arguments", async () => {
    const seen: number[] = [];
    const fn = debounce((n: number) => seen.push(n), 10);
    fn(1);
    fn(2);
    fn(3);
    expect(seen).toEqual([]);
    await eventually(() => seen.length > 0, "the debounced call");
    expect(seen).toEqual([3]);
  });

  test("clear drops the pending call", async () => {
    const seen: number[] = [];
    const fn = debounce((n: number) => seen.push(n), 10);
    fn(1);
    expect(fn.pending()).toBe(true);
    fn.clear();
    expect(fn.pending()).toBe(false);
    await sleep(50);
    expect(seen).toEqual([]);
  });

  test("flush runs the pending call now", async () => {
    const seen: number[] = [];
    const fn = debounce((n: number) => seen.push(n), 50);
    fn(7);
    fn.flush();
    expect(seen).toEqual([7]);
    expect(fn.pending()).toBe(false);
    await sleep(70);
    expect(seen).toEqual([7]);
  });

  test("flush on an idle scheduler does nothing", () => {
    const seen: number[] = [];
    const fn = debounce((n: number) => seen.push(n), 10);
    fn.flush();
    expect(seen).toEqual([]);
  });

  test("is cleared when its owner disposes", async () => {
    const seen: number[] = [];
    const dispose = root((d) => {
      const fn = debounce((n: number) => seen.push(n), 10);
      fn(1);
      return d;
    });
    dispose();
    await sleep(50);
    expect(seen).toEqual([]);
  });
});

describe("throttle", () => {
  test("collapses a burst into one trailing call", async () => {
    const seen: number[] = [];
    const fn = throttle((n: number) => seen.push(n), 20);
    fn(1);
    fn(2);
    fn(3);
    expect(seen).toEqual([]);
    await eventually(() => seen.length > 0, "the first throttled call");
    expect(seen).toEqual([3]);
    fn(4);
    await eventually(() => seen.length > 1, "the second throttled call");
    expect(seen).toEqual([3, 4]);
  });

  test("does not extend its window the way debounce does", async () => {
    // Called continuously, faster than the window: a throttle keeps firing and
    // a debounce never does. Asserted by counting calls rather than by
    // sleeping past a boundary, so a slow machine delays the answer instead of
    // changing it.
    const throttled: number[] = [];
    const debounced: number[] = [];
    const fast = throttle((n: number) => throttled.push(n), 20);
    const never = debounce((n: number) => debounced.push(n), 20);

    const pump = setInterval(() => {
      fast(throttled.length);
      never(debounced.length);
    }, 4);
    try {
      await eventually(() => throttled.length >= 3, "three throttled calls");
      expect(debounced, "a debounce fired while it was still being called").toEqual([]);
    } finally {
      clearInterval(pump);
      fast.clear();
      never.clear();
    }
  });

  test("flush delivers the held arguments", () => {
    const seen: number[] = [];
    const fn = throttle((n: number) => seen.push(n), 50);
    fn(1);
    fn(2);
    fn.flush();
    expect(seen).toEqual([2]);
    expect(fn.pending()).toBe(false);
  });
});

describe("leading", () => {
  test("runs on the first call and swallows the window", async () => {
    const seen: number[] = [];
    const fn = leading(debounce, (n: number) => seen.push(n), 20);
    fn(1);
    expect(seen).toEqual([1]);
    fn(2);
    fn(3);
    expect(seen).toEqual([1]);
    await eventually(() => !fn.pending(), "the window to close");
    expect(seen).toEqual([1]);
    fn(4);
    expect(seen).toEqual([1, 4]);
  });

  test("flush closes the window early", async () => {
    const seen: number[] = [];
    const fn = leading(debounce, (n: number) => seen.push(n), 50);
    fn(1);
    fn(2);
    expect(seen).toEqual([1]);
    fn.flush();
    fn(3);
    expect(seen).toEqual([1, 3]);
    await sleep(70);
    expect(seen).toEqual([1, 3]);
  });

  test("clear reopens the window immediately", () => {
    const seen: number[] = [];
    const fn = leading(throttle, (n: number) => seen.push(n), 50);
    fn(1);
    fn(2);
    expect(seen).toEqual([1]);
    fn.clear();
    fn(3);
    expect(seen).toEqual([1, 3]);
  });
});

describe("leadingAndTrailing", () => {
  test("first call now, last call at the end of the window", async () => {
    const seen: number[] = [];
    const fn = leadingAndTrailing(debounce, (n: number) => seen.push(n), 20);
    fn(1);
    expect(seen).toEqual([1]);
    fn(2);
    fn(3);
    await eventually(() => seen.length > 1, "the trailing call");
    expect(seen).toEqual([1, 3]);
  });

  test("a lone call does not fire twice", async () => {
    const seen: number[] = [];
    const fn = leadingAndTrailing(debounce, (n: number) => seen.push(n), 20);
    fn(1);
    await sleep(60);
    expect(seen, "a lone call fired on both edges").toEqual([1]);
  });
});

describe("scheduled", () => {
  test("gates a computation until the schedule lets it through", async () => {
    const query = signal("a");
    const runs: string[] = [];
    const dispose = root((d) => {
      const settled = scheduled((fire) => debounce(fire, 20));
      effect(() => {
        const q = query();
        if (settled()) runs.push(q);
      });
      return d;
    });

    expect(runs).toEqual([]);
    query.set("b");
    flush();
    query.set("c");
    flush();
    expect(runs).toEqual([]);
    await eventually(() => {
      flush();
      return runs.length > 0;
    }, "the gated computation to run");
    expect(runs).toEqual(["c"]);
    dispose();
  });

  test("two readers in one flush both see the flag raised", async () => {
    const source = signal(0);
    let a = 0;
    let b = 0;
    const dispose = root((d) => {
      const settled = scheduled((fire) => debounce(fire, 10));
      effect(() => {
        source();
        if (settled()) a++;
      });
      effect(() => {
        source();
        if (settled()) b++;
      });
      return d;
    });
    await eventually(() => {
      flush();
      return a > 0 && b > 0;
    }, "both readers to see the flag");
    expect(a).toBe(1);
    expect(b).toBe(1);
    dispose();
  });
});
