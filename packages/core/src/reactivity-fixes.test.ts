/**
 * Regression tests for reactivity bugs found during the audit.
 *
 * 1. Feedback writes (a computation writing a signal that feeds a
 *    lower-height node) used to strand that node in the global heap with
 *    REACTIVE_IN_HEAP set, permanently breaking it and poisoning every
 *    later flush. The heap now drains fully (re-scan) and self-writes
 *    are dropped after the run (suite semantics: an effect's write to
 *    its own dependency does not re-trigger that effect).
 * 2. runWithOwner used to swallow thrown errors.
 * 3. context Provider used to create a DETACHED scope, leaking its
 *    effects/cleanups when the parent owner disposed.
 */

import { describe, expect, test } from "bun:test";
import {
  computed,
  context,
  scope,
  effect,
  flush,
  getOwner,
  onCleanup,
  runWithOwner,
  signal,
  type Scope,
} from "./signals.ts";

describe("feedback writes do not strand heap nodes", () => {
  test("write inside an effect propagates through a computed to its observer", () => {
    const x = signal(0);
    const xd = computed(() => x() * 2);
    let obs = -1;
    let runs = 0;
    effect(() => {
      runs++;
      obs = xd();
    });
    expect(runs).toBe(1);
    expect(obs).toBe(0);

    const trigger = signal(0);
    effect(() => {
      trigger();
      x.set(5);
    });
    flush();

    expect(xd()).toBe(10);
    expect(obs).toBe(10);
    expect(runs).toBe(2);
  });

  test("effect writing its own lower-height dependency does not loop; external writes still propagate", () => {
    const a = signal(0);
    const b = computed(() => a() * 10);
    const seen: number[] = [];
    effect(() => {
      seen.push(b());
      if (a() < 3) a.set(a() + 1);
    });
    flush();
    // Self-write is swallowed: exactly one run, write applied once
    expect(seen).toEqual([0]);
    expect(a()).toBe(1);

    // External writes still reach the effect through the computed
    a.set(5);
    flush();
    expect(seen).toEqual([0, 50]);
    expect(b()).toBe(50);
  });

  test("heap is not globally corrupted by a feedback write (next flush still works)", () => {
    const x = signal(0);
    const xd = computed(() => x() * 2);
    let obs1 = -1;
    effect(() => {
      obs1 = xd();
    });
    const t = signal(0);
    effect(() => {
      t();
      x.set(5);
    });
    flush();
    expect(obs1).toBe(10);

    const y = signal(1);
    const yd = computed(() => y() + 100);
    let obs2 = -1;
    effect(() => {
      obs2 = yd();
    });
    expect(obs2).toBe(101);
    y.set(2);
    flush();
    expect(obs2).toBe(102);
  });
});

describe("runWithOwner error propagation", () => {
  test("propagates thrown errors instead of swallowing them", () => {
    const owner = getOwner();
    expect(() => {
      runWithOwner(owner, () => {
        throw new Error("explode");
      });
    }).toThrow("explode");
  });

  test("restores the previous owner after a throw", () => {
    scope((dispose) => {
      const before = getOwner();
      try {
        runWithOwner(null, () => {
          throw new Error("x");
        });
      } catch {
        // ignore
      }
      expect(getOwner()).toBe(before);
      dispose();
    });
  });

  test("returns the callback value on success", () => {
    expect(runWithOwner(null, () => 42)).toBe(42);
  });
});

describe("context provider disposal", () => {
  test("provider scope is disposed when the parent scope disposes", () => {
    const Ctx = context<number>(0);
    let cleaned = false;
    const dispose = scope((d) => {
      Ctx.Provider(getOwner() as Scope, {
        value: 42,
        children: () => {
          onCleanup(() => {
            cleaned = true;
          });
          return null;
        },
      });
      return d;
    });
    expect(cleaned).toBe(false);
    dispose();
    expect(cleaned).toBe(true);
  });
});

describe("dependency read order", () => {
  test("a dep read in a different order on a later run stays subscribed", () => {
    const dispose = scope((d) => {
      const flip = signal(false);
      const a = signal(1);
      const b = signal(2);
      const c = computed(() => (flip() ? b() + a() : a() + b()));
      const seen: number[] = [];
      effect(() => {
        seen.push(c());
      });
      flush();
      expect(seen).toEqual([3]);

      flip.set(true); // reads b before a from now on
      flush();
      expect(seen).toEqual([3]);

      b.set(10);
      flush();
      expect(seen).toEqual([3, 11]);

      a.set(100);
      flush();
      expect(seen).toEqual([3, 11, 110]);
      return d;
    }, true);
    dispose();
  });

  test("repeated non-consecutive reads keep every dep", () => {
    const dispose = scope((d) => {
      const a = signal(1);
      const b = signal(10);
      const c = computed(() => a() + b() + a() + b());
      const seen: number[] = [];
      effect(() => {
        seen.push(c());
      });
      flush();
      a.set(2);
      flush();
      b.set(20);
      flush();
      expect(seen).toEqual([22, 24, 44]);
      return d;
    }, true);
    dispose();
  });

  test("three deps rotated across runs", () => {
    const dispose = scope((d) => {
      const order = signal(0);
      const x = signal(1);
      const y = signal(2);
      const z = signal(4);
      const c = computed(() => {
        const o = order();
        if (o === 0) return x() + y() + z();
        if (o === 1) return z() + x() + y();
        return y() + z() + x();
      });
      const seen: number[] = [];
      effect(() => {
        seen.push(c());
      });
      flush();
      for (let round = 1; round <= 2; round++) {
        order.set(round);
        flush();
        x.set(x.peek() * 10);
        flush();
        y.set(y.peek() * 10);
        flush();
        z.set(z.peek() * 10);
        flush();
      }
      expect(seen.at(-1)).toBe(x.peek() + y.peek() + z.peek());
      return d;
    }, true);
    dispose();
  });
});
