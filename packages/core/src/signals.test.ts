import { describe, expect, test } from "bun:test";
import { batch, computed, createScope, effect, onCleanup, signal, untrack } from "./signals.ts";

describe("signal", () => {
  test("creates a signal with initial value", () => {
    const count = signal(0);
    expect(count()).toBe(0);
  });

  test("updates value with set", () => {
    const count = signal(0);
    count.set(5);
    expect(count()).toBe(5);
  });

  test("updates value with update function", () => {
    const count = signal(10);
    count.update((n) => n + 5);
    expect(count()).toBe(15);
  });

  test("peek reads without tracking", () => {
    const count = signal(42);
    expect(count.peek()).toBe(42);
  });

  test("does not trigger effect when value is same (Object.is)", () => {
    const count = signal(0);
    let effectCount = 0;

    effect(() => {
      count();
      effectCount++;
    });

    expect(effectCount).toBe(1);
    count.set(0); // Same value
    expect(effectCount).toBe(1); // Should not re-run
  });

  test("handles NaN correctly", () => {
    const num = signal(NaN);
    let effectCount = 0;

    effect(() => {
      num();
      effectCount++;
    });

    expect(effectCount).toBe(1);
    num.set(NaN);
    expect(effectCount).toBe(1); // NaN === NaN with Object.is
  });
});

describe("computed", () => {
  test("derives value from signals", () => {
    const count = signal(5);
    const doubled = computed(() => count() * 2);
    expect(doubled()).toBe(10);
  });

  test("updates when dependency changes", () => {
    const count = signal(3);
    const tripled = computed(() => count() * 3);

    expect(tripled()).toBe(9);
    count.set(4);
    expect(tripled()).toBe(12);
  });

  test("peek reads without tracking", () => {
    const count = signal(7);
    const squared = computed(() => count() ** 2);
    expect(squared.peek()).toBe(49);
  });

  test("is lazy - only computes when read", () => {
    const count = signal(0);
    let computeCount = 0;

    const doubled = computed(() => {
      computeCount++;
      return count() * 2;
    });

    expect(computeCount).toBe(0); // Not computed yet
    doubled();
    expect(computeCount).toBe(1);
    doubled();
    expect(computeCount).toBe(1); // Cached
  });

  test("recomputes when dependency changes", () => {
    const count = signal(0);
    let computeCount = 0;

    const doubled = computed(() => {
      computeCount++;
      return count() * 2;
    });

    doubled();
    expect(computeCount).toBe(1);

    count.set(1);
    doubled();
    expect(computeCount).toBe(2);
  });

  test("handles diamond dependencies (glitch-free)", () => {
    const a = signal(1);
    const b = computed(() => a() * 2);
    const c = computed(() => a() * 3);
    const d = computed(() => b() + c());

    expect(d()).toBe(5); // 2 + 3

    let effectCount = 0;
    effect(() => {
      d();
      effectCount++;
    });

    expect(effectCount).toBe(1);
    a.set(2);
    expect(d()).toBe(10); // 4 + 6
    expect(effectCount).toBe(2); // Effect runs once, not twice
  });

  test("handles chained computeds", () => {
    const a = signal(1);
    const b = computed(() => a() + 1);
    const c = computed(() => b() + 1);
    const d = computed(() => c() + 1);

    expect(d()).toBe(4);
    a.set(10);
    expect(d()).toBe(13);
  });
});

describe("effect", () => {
  test("runs immediately", () => {
    let ran = false;
    effect(() => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  test("runs when dependencies change", () => {
    const count = signal(0);
    let effectCount = 0;

    effect(() => {
      count(); // Subscribe
      effectCount++;
    });

    expect(effectCount).toBe(1);
    count.set(1);
    expect(effectCount).toBe(2);
  });

  test("cleanup function is called", () => {
    let cleanedUp = false;
    const count = signal(0);

    effect(() => {
      count();
      return () => {
        cleanedUp = true;
      };
    });

    expect(cleanedUp).toBe(false);
    count.set(1);
    expect(cleanedUp).toBe(true);
  });

  test("returns stop function", () => {
    const count = signal(0);
    let effectCount = 0;

    const stop = effect(() => {
      count();
      effectCount++;
    });

    expect(effectCount).toBe(1);
    stop();
    count.set(1);
    expect(effectCount).toBe(1); // Should not run after stop
  });

  test("cleanup is called on dispose", () => {
    let cleanedUp = false;

    const stop = effect(() => {
      return () => {
        cleanedUp = true;
      };
    });

    expect(cleanedUp).toBe(false);
    stop();
    expect(cleanedUp).toBe(true);
  });

  test("handles dynamic dependencies", () => {
    const a = signal(1);
    const b = signal(2);
    const useA = signal(true);
    let value = 0;

    effect(() => {
      value = useA() ? a() : b();
    });

    expect(value).toBe(1);

    a.set(10);
    expect(value).toBe(10);

    b.set(20); // Should not trigger since we're tracking a
    expect(value).toBe(10);

    useA.set(false); // Now track b
    expect(value).toBe(20);

    a.set(100); // Should not trigger since we're now tracking b
    expect(value).toBe(20);

    b.set(200);
    expect(value).toBe(200);
  });

  test("nested effects work correctly", () => {
    const outer = signal(0);
    const inner = signal(0);
    let outerCount = 0;
    let innerCount = 0;

    effect(() => {
      outer();
      outerCount++;

      effect(() => {
        inner();
        innerCount++;
      });
    });

    expect(outerCount).toBe(1);
    expect(innerCount).toBe(1);

    inner.set(1);
    expect(innerCount).toBe(2);
    expect(outerCount).toBe(1); // Outer should not re-run
  });
});

describe("batch", () => {
  test("batches multiple updates", () => {
    const a = signal(0);
    const b = signal(0);
    let effectCount = 0;

    effect(() => {
      a();
      b();
      effectCount++;
    });

    expect(effectCount).toBe(1);

    batch(() => {
      a.set(1);
      b.set(1);
    });

    // Effect should run once more after batch
    expect(effectCount).toBe(2);
  });

  test("nested batches work correctly", () => {
    const count = signal(0);
    let effectCount = 0;

    effect(() => {
      count();
      effectCount++;
    });

    expect(effectCount).toBe(1);

    batch(() => {
      count.set(1);
      batch(() => {
        count.set(2);
        count.set(3);
      });
      count.set(4);
    });

    expect(effectCount).toBe(2);
    expect(count()).toBe(4);
  });
});

describe("untrack", () => {
  test("reads without creating dependencies", () => {
    const tracked = signal(0);
    const untracked = signal(0);
    let effectCount = 0;

    effect(() => {
      tracked();
      untrack(() => untracked());
      effectCount++;
    });

    expect(effectCount).toBe(1);

    untracked.set(1);
    expect(effectCount).toBe(1); // Should not re-run

    tracked.set(1);
    expect(effectCount).toBe(2); // Should re-run
  });
});

describe("createScope", () => {
  test("disposes effects when scope is disposed", () => {
    const count = signal(0);
    let effectCount = 0;

    const result = createScope((dispose) => {
      effect(() => {
        count();
        effectCount++;
      });
      return dispose;
    });

    expect(effectCount).toBe(1);
    count.set(1);
    expect(effectCount).toBe(2);

    result(); // Dispose scope
    count.set(2);
    expect(effectCount).toBe(2); // Should not run after dispose
  });

  test("runs cleanup functions on dispose", () => {
    let cleaned = false;

    createScope((dispose) => {
      onCleanup(() => {
        cleaned = true;
      });
      dispose();
    });

    expect(cleaned).toBe(true);
  });

  test("nested scopes dispose correctly", () => {
    const count = signal(0);
    let innerEffectCount = 0;
    let outerEffectCount = 0;

    createScope((disposeOuter) => {
      effect(() => {
        count();
        outerEffectCount++;
      });

      createScope((disposeInner) => {
        effect(() => {
          count();
          innerEffectCount++;
        });

        count.set(1);
        expect(innerEffectCount).toBe(2);
        expect(outerEffectCount).toBe(2);

        disposeInner();
      });

      count.set(2);
      expect(innerEffectCount).toBe(2); // Inner disposed
      expect(outerEffectCount).toBe(3); // Outer still running

      disposeOuter();
    });

    count.set(3);
    expect(innerEffectCount).toBe(2);
    expect(outerEffectCount).toBe(3); // Both disposed
  });

  test("disposes computeds in scope", () => {
    const count = signal(0);
    let computeCount = 0;

    let computedRef: ReturnType<typeof computed<number>> | null = null;

    createScope((dispose) => {
      computedRef = computed(() => {
        computeCount++;
        return count() * 2;
      });

      // Read to initialize
      computedRef();
      expect(computeCount).toBe(1);

      dispose();
    });

    // After dispose, computed still returns last value but doesn't recompute
    count.set(1);
    expect(computedRef!()).toBe(0); // Returns cached value
    expect(computeCount).toBe(1); // Did not recompute
  });
});

describe("onCleanup", () => {
  test("runs when effect re-runs", () => {
    const count = signal(0);
    let cleanupCount = 0;

    effect(() => {
      count();
      onCleanup(() => {
        cleanupCount++;
      });
    });

    expect(cleanupCount).toBe(0);
    count.set(1);
    expect(cleanupCount).toBe(1);
    count.set(2);
    expect(cleanupCount).toBe(2);
  });

  test("runs when effect is disposed", () => {
    let cleanupCount = 0;

    const stop = effect(() => {
      onCleanup(() => {
        cleanupCount++;
      });
    });

    expect(cleanupCount).toBe(0);
    stop();
    expect(cleanupCount).toBe(1);
  });

  test("multiple cleanups run in order", () => {
    const order: number[] = [];

    const stop = effect(() => {
      onCleanup(() => order.push(1));
      onCleanup(() => order.push(2));
      onCleanup(() => order.push(3));
    });

    stop();
    expect(order).toEqual([1, 2, 3]);
  });
});

describe("memory and reactivity leaks", () => {
  test("effect does not leak when disposed", () => {
    const count = signal(0);
    let effectRuns = 0;

    const stop = effect(() => {
      count();
      effectRuns++;
    });

    expect(effectRuns).toBe(1);
    stop();

    // Update signal many times
    for (let i = 0; i < 100; i++) {
      count.set(i);
    }

    expect(effectRuns).toBe(1); // Effect never ran again
  });

  test("computed does not leak when disposed via scope", () => {
    const count = signal(0);
    let computeRuns = 0;

    let c: ReturnType<typeof computed<number>> | null = null;

    createScope((dispose) => {
      c = computed(() => {
        computeRuns++;
        return count();
      });

      c(); // Initialize
      expect(computeRuns).toBe(1);

      dispose();
    });

    count.set(1);
    c!(); // Read after dispose
    expect(computeRuns).toBe(1); // Did not recompute
  });

  test("dependencies are cleaned up on effect re-run", () => {
    const a = signal(1);
    const b = signal(2);
    const useA = signal(true);

    let effectRuns = 0;

    effect(() => {
      effectRuns++;
      if (useA()) {
        a();
      } else {
        b();
      }
    });

    expect(effectRuns).toBe(1);

    // Switch to using b
    useA.set(false);
    expect(effectRuns).toBe(2);

    // a should no longer be tracked
    a.set(100);
    expect(effectRuns).toBe(2); // No change

    // b should be tracked
    b.set(200);
    expect(effectRuns).toBe(3);
  });
});
