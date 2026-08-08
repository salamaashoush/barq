import { afterEach, describe, expect, test } from "bun:test";
import { action, affects } from "./actions.ts";
import {
  computed,
  createScope,
  effect,
  enableExternalSource,
  flush,
  isPending,
  latest,
  markInMotion,
  resetExternalSource,
  signal,
  untrack,
} from "./signals.ts";

afterEach(() => {
  resetExternalSource();
});

describe("markInMotion", () => {
  test("a marked derived value reads as pending until released", () => {
    const dispose = createScope((d) => {
      const a = signal(1);
      const c = computed(() => a() * 2);
      expect(untrack(() => c())).toBe(2);

      const release = markInMotion(c);
      expect(isPending(() => c())).toBe(true);
      expect(untrack(() => latest(() => c()))).toBe(2);

      release();
      expect(isPending(() => c())).toBe(false);
      expect(untrack(() => c())).toBe(2);
      return d;
    }, true);
    dispose();
  });

  test("the mark survives a recompute", () => {
    const dispose = createScope((d) => {
      const a = signal(1);
      const c = computed(() => a() * 2);
      untrack(() => c());
      const release = markInMotion(c);
      a.set(5);
      flush();
      expect(isPending(() => c())).toBe(true);
      release();
      expect(untrack(() => c())).toBe(10);
      return d;
    }, true);
    dispose();
  });

  test("marks stack and each needs its own release", () => {
    const dispose = createScope((d) => {
      const c = computed(() => 1);
      untrack(() => c());
      const r1 = markInMotion(c);
      const r2 = markInMotion(c);
      r1();
      expect(isPending(() => c())).toBe(true);
      r2();
      expect(isPending(() => c())).toBe(false);
      return d;
    }, true);
    dispose();
  });

  test("releasing twice is harmless", () => {
    const dispose = createScope((d) => {
      const c = computed(() => 1);
      untrack(() => c());
      const release = markInMotion(c);
      release();
      release();
      expect(isPending(() => c())).toBe(false);
      return d;
    }, true);
    dispose();
  });

  test("pending flows downstream", () => {
    const dispose = createScope((d) => {
      const a = signal(1);
      const c = computed(() => a() * 2);
      const downstream = computed(() => c() + 1);
      expect(untrack(() => downstream())).toBe(3);
      const release = markInMotion(c);
      expect(isPending(() => downstream())).toBe(true);
      release();
      expect(untrack(() => downstream())).toBe(3);
      return d;
    }, true);
    dispose();
  });

  test("works on plain signals too", () => {
    const dispose = createScope((d) => {
      const a = signal(1);
      expect(untrack(() => a())).toBe(1);

      const release = markInMotion(a);
      expect(isPending(() => a())).toBe(true);
      expect(untrack(() => latest(() => a()))).toBe(1);

      release();
      expect(isPending(() => a())).toBe(false);
      expect(untrack(() => a())).toBe(1);
      return d;
    }, true);
    dispose();
  });

  test("a marked signal makes its readers pending", () => {
    const dispose = createScope((d) => {
      const a = signal(2);
      const double = computed(() => a() * 2);
      expect(untrack(() => double())).toBe(4);

      const release = markInMotion(a);
      expect(isPending(() => double())).toBe(true);
      release();
      expect(untrack(() => double())).toBe(4);
      return d;
    }, true);
    dispose();
  });

  test("rejects things this runtime did not create", () => {
    expect(() => markInMotion(() => 1)).toThrow(/created by this runtime/);
  });
});

describe("affects", () => {
  test("holds a derived value pending for the life of the action", async () => {
    const dispose = createScope((d) => {
      const a = signal(1);
      const c = computed(() => a() * 2);
      untrack(() => c());

      let duringAction = false;
      const run = action(function* () {
        affects(c);
        duringAction = isPending(() => c());
        yield Promise.resolve();
      });

      return [d, run, () => duringAction, c] as const;
    }, true);

    const [d, run, wasPending, c] = dispose;
    await run();
    expect(wasPending()).toBe(true);
    expect(isPending(() => c())).toBe(false);
    d();
  });

  test("releases even when the action throws", async () => {
    const dispose = createScope((d) => {
      const c = computed(() => 1);
      untrack(() => c());
      const run = action(async () => {
        affects(c);
        throw new Error("failed");
      });
      return [d, run, c] as const;
    }, true);

    const [d, run, c] = dispose;
    await expect(run()).rejects.toThrow("failed");
    expect(isPending(() => c())).toBe(false);
    d();
  });

  test("outside an action it is a no-op", () => {
    const dispose = createScope((d) => {
      const c = computed(() => 1);
      untrack(() => c());
      affects(c);
      expect(isPending(() => c())).toBe(false);
      return d;
    }, true);
    dispose();
  });
});

describe("enableExternalSource", () => {
  test("external change re-runs a computation", () => {
    let trigger: (() => void) | undefined;
    let external = 10;
    enableExternalSource({
      factory: (fn, notify) => {
        trigger = notify;
        return {
          track: (prev) => fn(prev),
          dispose: () => {},
        };
      },
    });

    const dispose = createScope((d) => {
      const seen: number[] = [];
      effect(() => {
        seen.push(external);
      });
      flush();
      expect(seen).toEqual([10]);

      external = 20;
      trigger!();
      flush();
      expect(seen).toEqual([10, 20]);
      return d;
    }, true);
    dispose();
  });

  test("dispose is called when the owner goes away", () => {
    let disposed = 0;
    enableExternalSource({
      factory: (fn) => ({
        track: (prev) => fn(prev),
        dispose: () => {
          disposed++;
        },
      }),
    });

    const dispose = createScope((d) => {
      computed(() => 1);
      return d;
    }, true);
    expect(disposed).toBe(0);
    dispose();
    expect(disposed).toBe(1);
  });

  test("untrack routes through the bridge", () => {
    let untrackCalls = 0;
    enableExternalSource({
      factory: (fn) => ({ track: (prev) => fn(prev), dispose: () => {} }),
      untrack: (fn) => {
        untrackCalls++;
        return fn();
      },
    });
    const a = signal(1);
    expect(untrack(() => a())).toBe(1);
    expect(untrackCalls).toBe(1);
  });

  test("repeat calls compose both factories", () => {
    const order: string[] = [];
    enableExternalSource({
      factory: (fn) => ({
        track: (prev) => {
          order.push("outer");
          return fn(prev);
        },
        dispose: () => {},
      }),
    });
    enableExternalSource({
      factory: (fn) => ({
        track: (prev) => {
          order.push("inner");
          return fn(prev);
        },
        dispose: () => {},
      }),
    });

    const dispose = createScope((d) => {
      const c = computed(() => 1);
      untrack(() => c());
      return d;
    }, true);
    expect(order).toEqual(["inner", "outer"]);
    dispose();
  });

  test("computations still track normal signals through the bridge", () => {
    enableExternalSource({
      factory: (fn) => ({ track: (prev) => fn(prev), dispose: () => {} }),
    });
    const dispose = createScope((d) => {
      const a = signal(1);
      const c = computed(() => a() * 3);
      expect(untrack(() => c())).toBe(3);
      a.set(4);
      expect(untrack(() => c())).toBe(12);
      return d;
    }, true);
    dispose();
  });
});
