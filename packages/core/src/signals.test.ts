import { describe, expect, test } from "bun:test";
import {
  batch,
  computed,
  scope,
  effect,
  flush,
  linked,
  onCleanup,
  signal,
  untrack,
} from "./signals.ts";

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
    flush();
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
    flush();
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

  test("computes lazily on first read (like Solid 2.0)", () => {
    const count = signal(0);
    let computeCount = 0;

    const doubled = computed(() => {
      computeCount++;
      return count() * 2;
    });

    expect(computeCount).toBe(0); // Lazy: not computed at creation
    doubled();
    expect(computeCount).toBe(1); // Computed on first read
    doubled();
    expect(computeCount).toBe(1); // Cached, no recompute
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

  test("does not recompute unobserved computeds on write", () => {
    const count = signal(0);
    let computeCount = 0;

    const doubled = computed(() => {
      computeCount++;
      return count() * 2;
    });

    doubled();
    expect(computeCount).toBe(1);

    // No observers: writes alone must not recompute (lazy pull)
    count.set(1);
    count.set(2);
    flush();
    expect(computeCount).toBe(1);

    expect(doubled()).toBe(4);
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
    flush();
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
    flush();
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
    flush();
    expect(cleanedUp).toBe(true);
  });

  test("split form: apply runs untracked with value and prev", () => {
    const count = signal(1);
    const log: Array<[number, number | undefined]> = [];
    let cleanups = 0;

    effect(
      () => count() * 2,
      (value, prev) => {
        log.push([value, prev]);
        return () => {
          cleanups++;
        };
      },
    );

    expect(log).toEqual([[2, undefined]]);

    count.set(5);
    flush();
    expect(log).toEqual([
      [2, undefined],
      [10, 2],
    ]);
    expect(cleanups).toBe(1); // cleanup from first apply ran before second
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
    flush();
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
    flush();
    expect(value).toBe(10);

    b.set(20); // Should not trigger since we're tracking a
    flush();
    expect(value).toBe(10);

    useA.set(false); // Now track b
    flush();
    expect(value).toBe(20);

    a.set(100); // Should not trigger since we're now tracking b
    flush();
    expect(value).toBe(20);

    b.set(200);
    flush();
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
    flush();
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

  test("writes that revert within a batch do not re-trigger effects", () => {
    const a = signal(0);
    let effectCount = 0;

    effect(() => {
      a();
      effectCount++;
    });
    expect(effectCount).toBe(1);

    batch(() => {
      a.set(5);
      a.set(0);
    });
    expect(effectCount).toBe(1); // value reverted: no run
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
    flush();
    expect(effectCount).toBe(1); // Should not re-run

    tracked.set(1);
    flush();
    expect(effectCount).toBe(2); // Should re-run
  });
});

describe("scope", () => {
  test("disposes effects when scope is disposed", () => {
    const count = signal(0);
    let effectCount = 0;

    const result = scope((dispose) => {
      effect(() => {
        count();
        effectCount++;
      });
      return dispose;
    });

    expect(effectCount).toBe(1);
    count.set(1);
    flush();
    expect(effectCount).toBe(2);

    result(); // Dispose scope
    count.set(2);
    flush();
    expect(effectCount).toBe(2); // Should not run after dispose
  });

  test("runs cleanup functions on dispose", () => {
    let cleaned = false;

    scope((dispose) => {
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

    scope((disposeOuter) => {
      effect(() => {
        count();
        outerEffectCount++;
      });

      scope((disposeInner) => {
        effect(() => {
          count();
          innerEffectCount++;
        });

        count.set(1);
        flush();
        expect(innerEffectCount).toBe(2);
        expect(outerEffectCount).toBe(2);

        disposeInner();
      });

      count.set(2);
      flush();
      expect(innerEffectCount).toBe(2); // Inner disposed
      expect(outerEffectCount).toBe(3); // Outer still running

      disposeOuter();
    });

    count.set(3);
    flush();
    expect(innerEffectCount).toBe(2);
    expect(outerEffectCount).toBe(3); // Both disposed
  });

  test("disposes computeds in scope", () => {
    const count = signal(0);
    let computeCount = 0;

    let computedRef: ReturnType<typeof computed<number>> | null = null;

    scope((dispose) => {
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
    flush();
    expect(cleanupCount).toBe(1);
    count.set(2);
    flush();
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

  test("multiple cleanups run in reverse order (LIFO)", () => {
    const order: number[] = [];

    const stop = effect(() => {
      onCleanup(() => order.push(1));
      onCleanup(() => order.push(2));
      onCleanup(() => order.push(3));
    });

    stop();
    // Cleanups run in LIFO order (like SolidJS)
    expect(order).toEqual([3, 2, 1]);
  });
});

describe("writable derived signals", () => {
  test("signal(fn) derives from dependencies and accepts writes", () => {
    const source = signal(1);
    const derived = signal((_prev?: number) => source() * 10);

    expect(derived()).toBe(10);

    derived.set(99);
    expect(derived()).toBe(99);

    // A dependency change recomputes over the manual write
    source.set(2);
    expect(derived()).toBe(20);
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
    flush();

    expect(effectRuns).toBe(1); // Effect never ran again
  });

  test("computed does not leak when disposed via scope", () => {
    const count = signal(0);
    let computeRuns = 0;

    let c: ReturnType<typeof computed<number>> | null = null;

    scope((dispose) => {
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
    flush();
    expect(effectRuns).toBe(2);

    // a should no longer be tracked
    a.set(100);
    flush();
    expect(effectRuns).toBe(2); // No change

    // b should be tracked
    b.set(200);
    flush();
    expect(effectRuns).toBe(3);
  });
});

/**
 * R7. `linked` is `signal(fn)` with the source split out of the closure, and
 * the split is the point: as `signal(() => f(source()))` the re-seed is an
 * emergent property of whatever the closure happened to read, and nothing
 * names it.
 */
describe("linked — writable derived state that re-seeds", () => {
  test("seeds from the source", () => {
    const source = signal("ada");
    const cell = linked(source, (name) => name.toUpperCase());
    expect(cell()).toBe("ADA");
  });

  test("a write holds while the source is unchanged", () => {
    const source = signal("ada");
    const cell = linked(source, (name) => name);
    cell.set("edited");
    expect(cell()).toBe("edited");
    expect(cell.peek()).toBe("edited");
    // Including a write of the value the source would have produced anyway.
    source.set("ada");
    expect(cell()).toBe("edited");
  });

  test("the source moving discards the write — the read-copy trap, closed", () => {
    const source = signal("ada");
    const cell = linked(source, (name) => name);
    cell.set("edited");
    source.set("grace");
    expect(cell()).toBe("grace");
  });

  test("compute is handed the previous value, so a re-seed can keep a choice", () => {
    const options = signal(["a", "b", "c"]);
    const chosen = linked(options, (list, previous) =>
      previous !== undefined && list.includes(previous) ? previous : list[0],
    );
    expect(chosen()).toBe("a");
    chosen.set("c");
    options.set(["c", "d"]);
    expect(chosen()).toBe("c");
    options.set(["e", "f"]);
    expect(chosen()).toBe("e");
  });

  test("`update` reads the current value, written or derived", () => {
    const source = signal(1);
    const cell = linked(source, (n) => n * 10);
    cell.update((n) => n + 1);
    expect(cell()).toBe(11);
    source.set(2);
    expect(cell()).toBe(20);
  });

  test("an effect over it sees the write and the re-seed alike", () => {
    const source = signal("ada");
    const cell = linked(source, (name) => name);
    const seen: string[] = [];
    effect(() => {
      seen.push(cell());
    });
    flush();
    cell.set("edited");
    flush();
    source.set("grace");
    flush();
    expect(seen).toEqual(["ada", "edited", "grace"]);
  });

  test("`equals: false` publishes every re-seed, including an equal one", () => {
    const source = signal(1);
    let runs = 0;
    const cell = linked(source, (n) => n, { equals: false });
    effect(() => {
      cell();
      runs++;
    });
    flush();
    expect(runs).toBe(1);
    source.set(2);
    flush();
    expect(runs).toBe(2);
  });
});

describe("propagation cost in graph depth", () => {
  interface Stack {
    heads: Array<() => number>;
    sources: Array<{ (): number; set(v: number): void }>;
    computedRuns: () => number;
    effectRuns: () => number;
    dispose: () => void;
  }

  /**
   * cellx's stacked-diamond shape, the one `tier2/jrb.ts` sweeps: four sources,
   * then `layers` bands of four computeds that read across the band below, each
   * with an effect on it.
   */
  const stack = (layers: number): Stack => {
    let computedRuns = 0;
    let effectRuns = 0;
    let sources: Array<{ (): number; set(v: number): void }> = [];
    let heads: Array<() => number> = [];
    let dispose = () => {};
    scope((d) => {
      dispose = d;
      sources = [signal(1), signal(2), signal(3), signal(4)];
      let band: Array<() => number> = sources;
      for (let i = 0; i < layers; i++) {
        const m = band;
        band = [
          computed(() => (computedRuns++, m[1]())),
          computed(() => (computedRuns++, m[0]() - m[2]())),
          computed(() => (computedRuns++, m[1]() + m[3]())),
          computed(() => (computedRuns++, m[2]())),
        ];
        for (const c of band) {
          effect(() => {
            effectRuns++;
            c();
          });
        }
      }
      heads = band;
    }, true);
    flush();
    return {
      heads,
      sources,
      computedRuns: () => computedRuns,
      effectRuns: () => effectRuns,
      dispose,
    };
  };

  const drive = (s: Stack, iterations: number): void => {
    for (let k = 0; k < iterations; k++) {
      batch(() => {
        s.sources[0].set(4 + k);
        s.sources[1].set(3 + k);
        s.sources[2].set(2 + k);
        s.sources[3].set(1 + k);
      });
      flush();
      s.heads[0]();
    }
  };

  test("a deep stack settles on the values an eager evaluation gives", () => {
    const layers = 40;
    const s = stack(layers);
    drive(s, 4);

    let band = [7, 6, 5, 4];
    for (let i = 0; i < layers; i++) {
      band = [band[1], band[0] - band[2], band[1] + band[3], band[2]];
    }
    expect(s.heads.map((c) => c())).toEqual(band);
    s.dispose();
  });

  test("a write wave runs each layer a bounded number of times", () => {
    const layers = 40;
    const iterations = 5;
    const s = stack(layers);
    const builtComputeds = s.computedRuns();
    const builtEffects = s.effectRuns();
    drive(s, iterations);

    // Four computeds and four effects a layer. Nothing may run more than once
    // per wave, so the whole drive is bounded by one pass a layer a iteration —
    // a re-walk that scales with depth cannot hide under this.
    const budget = 4 * layers * iterations;
    expect(s.computedRuns() - builtComputeds).toBeLessThanOrEqual(budget);
    expect(s.effectRuns() - builtEffects).toBeLessThanOrEqual(budget);
    s.dispose();
  });

  /**
   * M7c F1. Propagation was quadratic in depth: every recompute re-walked its
   * whole descendant closure to re-place marks that were already standing, so
   * the cost of ONE layer grew with how many layers sat below it. It was
   * invisible at the depths the rest of this file exercises — the next-deepest
   * chain here is five — and cost 94x on cellx1000 and 294x on cellx2500.
   *
   * The assertion is on ms PER LAYER, which is flat when propagation is linear
   * in depth and rises when it is not. Measured: 10.8x before the fix, 0.8x
   * after, against a gate of 4x.
   */
  test("per-layer propagation cost does not grow with depth", () => {
    const perLayer = (layers: number): number => {
      let best = Number.POSITIVE_INFINITY;
      for (let trial = 0; trial < 3; trial++) {
        const s = stack(layers);
        drive(s, 2);
        const start = performance.now();
        drive(s, 10);
        best = Math.min(best, (performance.now() - start) / layers);
        s.dispose();
      }
      return best;
    };

    const shallow = perLayer(100);
    const deep = perLayer(800);
    expect(deep / shallow).toBeLessThan(4);
  });
});
