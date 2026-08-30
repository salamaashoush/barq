import { describe, expect, test } from "bun:test";
import { effect, flush, getOwner, root, signal } from "@barqjs/core";
import {
  access,
  arrayEquals,
  asAccessor,
  asArray,
  chain,
  clamp,
  microtask,
  owned,
  shared,
  tryCleanup,
} from "./utils.ts";

describe("access", () => {
  test("reads an accessor and passes a value through", () => {
    expect(access(1)).toBe(1);
    expect(access(() => 1)).toBe(1);
    expect(access("a")).toBe("a");
  });

  test("leaves a function that declares parameters alone", () => {
    const handler = (e: unknown) => e;
    expect(access(handler)).toBe(handler);
  });

  test("reads a signal reactively", () => {
    const count = signal(0);
    const seen: number[] = [];
    root(() => {
      effect(() => seen.push(access(count)));
      count.set(1);
      flush();
    });
    expect(seen).toEqual([0, 1]);
  });
});

describe("asAccessor", () => {
  test("does not wrap what is already an accessor", () => {
    const fn = () => 1;
    expect(asAccessor(fn)).toBe(fn);
  });

  test("wraps a value", () => {
    expect(asAccessor(1)()).toBe(1);
  });
});

describe("asArray", () => {
  test("normalises", () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray(undefined)).toEqual([]);
    expect(asArray(1)).toEqual([1]);
    expect(asArray([1, 2])).toEqual([1, 2]);
    expect(asArray(0)).toEqual([0]);
    expect(asArray("")).toEqual([""]);
  });
});

describe("clamp / arrayEquals", () => {
  test("clamp", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  test("arrayEquals", () => {
    expect(arrayEquals([1, 2], [1, 2])).toBe(true);
    expect(arrayEquals([1, 2], [1, 3])).toBe(false);
    expect(arrayEquals([1], [1, 2])).toBe(false);
    expect(arrayEquals([Number.NaN], [Number.NaN])).toBe(true);
  });
});

describe("chain", () => {
  test("calls every function in order with the same arguments", () => {
    const calls: string[] = [];
    const fn = chain(
      (a: number) => calls.push(`a${a}`),
      undefined,
      (a: number) => calls.push(`b${a}`),
    );
    fn(1);
    expect(calls).toEqual(["a1", "b1"]);
  });
});

describe("tryCleanup", () => {
  test("registers with an owner", () => {
    let cleaned = false;
    const dispose = root((d) => {
      expect(tryCleanup(() => (cleaned = true))).toBe(true);
      return d;
    });
    expect(cleaned).toBe(false);
    dispose();
    expect(cleaned).toBe(true);
  });

  test("reports that there was no owner instead of orphaning the cleanup", () => {
    expect(tryCleanup(() => {})).toBe(false);
  });
});

describe("owned", () => {
  test("runs the callback under the owner that created it", () => {
    let inner: unknown;
    let cleaned = false;
    const [dispose, call] = root((d) => {
      const cb = owned(() => {
        inner = getOwner();
        tryCleanup(() => (cleaned = true));
      });
      return [d, cb] as const;
    });
    expect(getOwner()).toBe(null);
    call();
    expect(inner).not.toBe(null);
    dispose();
    expect(cleaned).toBe(true);
  });
});

describe("microtask", () => {
  test("coalesces calls in a tick and delivers the last arguments", async () => {
    const seen: number[] = [];
    const fn = microtask((n: number) => seen.push(n));
    fn(1);
    fn(2);
    fn(3);
    expect(seen).toEqual([]);
    await Promise.resolve();
    expect(seen).toEqual([3]);
  });

  test("does not fire after its owner disposes", async () => {
    const seen: number[] = [];
    const dispose = root((d) => {
      const fn = microtask((n: number) => seen.push(n));
      fn(1);
      return d;
    });
    dispose();
    await Promise.resolve();
    expect(seen).toEqual([]);
  });
});

describe("shared", () => {
  test("builds once for many consumers and disposes with the last", async () => {
    let built = 0;
    let disposed = 0;
    const use = shared(() => {
      built++;
      tryCleanup(() => disposed++);
      return signal(1);
    });

    const a = root((d) => [use(), d] as const);
    const b = root((d) => [use(), d] as const);
    expect(built).toBe(1);
    expect(a[0]).toBe(b[0]);

    a[1]();
    await Promise.resolve();
    expect(disposed).toBe(0);

    b[1]();
    await Promise.resolve();
    expect(disposed).toBe(1);
  });

  test("rebuilds after every consumer is gone", async () => {
    let built = 0;
    const use = shared(() => {
      built++;
      return built;
    });
    const dispose = root((d) => {
      use();
      return d;
    });
    dispose();
    await Promise.resolve();
    root((d) => {
      expect(use()).toBe(2);
      d();
    });
    expect(built).toBe(2);
  });

  test("a consumer with no owner pins the root open", async () => {
    let disposed = 0;
    const use = shared(() => {
      tryCleanup(() => disposed++);
      return 1;
    });
    use();
    const dispose = root((d) => {
      use();
      return d;
    });
    dispose();
    await Promise.resolve();
    expect(disposed).toBe(0);
  });
});
