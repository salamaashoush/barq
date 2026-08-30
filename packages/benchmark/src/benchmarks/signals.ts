/**
 * Benchmark: Signal/Reactivity Performance
 * Compares signal creation, updates, and propagation
 */

import type { BenchmarkResult } from "../types.ts";
import { benchmark } from "../utils.ts";

// Barq imports - use raw signals for fair comparison
import { signal, computed, effect, batch, scope } from "@barqjs/core";

// SolidJS imports
import { createEffect, createMemo, createRoot as root, createSignal, batch as solidBatch } from "solid-js";

export async function runSignalBenchmarks(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // Signal creation
  results.push(
    await benchmark("signals", "barq", "create signal", () => {
      signal(0);
    }),
  );

  results.push(
    await benchmark("signals", "solid", "create signal", () => {
      root(() => {
        createSignal(0);
      });
    }),
  );

  // Signal update (1000 updates) - BATCHED for fair comparison
  results.push(
    await benchmark(
      "signals",
      "barq",
      "1000 signal updates (batched)",
      () => {
        const count = signal(0);
        batch(() => {
          for (let i = 0; i < 1000; i++) {
            count.set(i);
          }
        });
      },
      { iterations: 500 },
    ),
  );

  results.push(
    await benchmark(
      "signals",
      "solid",
      "1000 signal updates (batched)",
      () => {
        root((dispose) => {
          const [count, setCount] = createSignal(0);
          solidBatch(() => {
            for (let i = 0; i < 1000; i++) {
              setCount(i);
            }
          });
          dispose();
        });
      },
      { iterations: 500 },
    ),
  );

  // Computed/Memo creation
  results.push(
    await benchmark("signals", "barq", "create computed", () => {
      scope(() => {
        const count = signal(0);
        computed(() => count() * 2);
      }, true);
    }),
  );

  results.push(
    await benchmark("signals", "solid", "create computed", () => {
      root((dispose) => {
        const [count] = createSignal(0);
        createMemo(() => count() * 2);
        dispose();
      });
    }),
  );

  // Effect creation and trigger - BATCHED
  results.push(
    await benchmark(
      "signals",
      "barq",
      "effect with 100 updates (batched)",
      () => {
        scope((dispose) => {
          let effectRuns = 0;
          const count = signal(0);
          effect(() => {
            const _ = count();
            effectRuns++;
          });
          batch(() => {
            for (let i = 0; i < 100; i++) {
              count.set(i);
            }
          });
          dispose();
        }, true);
      },
      { iterations: 500 },
    ),
  );

  results.push(
    await benchmark(
      "signals",
      "solid",
      "effect with 100 updates (batched)",
      () => {
        root((dispose) => {
          let effectRuns = 0;
          const [count, setCount] = createSignal(0);
          createEffect(() => {
            const _ = count();
            effectRuns++;
          });
          solidBatch(() => {
            for (let i = 0; i < 100; i++) {
              setCount(i);
            }
          });
          dispose();
        });
      },
      { iterations: 500 },
    ),
  );

  // Chain of computed values (dependency graph) - BATCHED
  results.push(
    await benchmark(
      "signals",
      "barq",
      "computed chain (5 deep)",
      () => {
        scope((dispose) => {
          const a = signal(1);
          const b = computed(() => a() * 2);
          const c = computed(() => b() + 1);
          const d = computed(() => c() * 3);
          const e = computed(() => d() - 2);
          const f = computed(() => e() + a());

          batch(() => {
            for (let i = 0; i < 100; i++) {
              a.set(i);
            }
          });
          f(); // read final value
          dispose();
        }, true);
      },
      { iterations: 500 },
    ),
  );

  results.push(
    await benchmark(
      "signals",
      "solid",
      "computed chain (5 deep)",
      () => {
        root((dispose) => {
          const [a, setA] = createSignal(1);
          const b = createMemo(() => a() * 2);
          const c = createMemo(() => b() + 1);
          const d = createMemo(() => c() * 3);
          const e = createMemo(() => d() - 2);
          const f = createMemo(() => e() + a());

          solidBatch(() => {
            for (let i = 0; i < 100; i++) {
              setA(i);
            }
          });
          f(); // read final value
          dispose();
        });
      },
      { iterations: 500 },
    ),
  );

  // Wide dependency graph (many signals -> one computed) - BATCHED
  results.push(
    await benchmark(
      "signals",
      "barq",
      "wide deps (10 signals)",
      () => {
        scope((dispose) => {
          const signals = Array.from({ length: 10 }, (_, i) => signal(i));
          const sum = computed(() => signals.reduce((acc, s) => acc + s(), 0));

          batch(() => {
            for (let i = 0; i < 100; i++) {
              signals[i % 10].set(i);
            }
          });
          sum();
          dispose();
        }, true);
      },
      { iterations: 500 },
    ),
  );

  results.push(
    await benchmark(
      "signals",
      "solid",
      "wide deps (10 signals)",
      () => {
        root((dispose) => {
          const signals = Array.from({ length: 10 }, (_, i) => createSignal(i));
          const sum = createMemo(() => signals.reduce((acc, [s]) => acc + s(), 0));

          solidBatch(() => {
            for (let i = 0; i < 100; i++) {
              signals[i % 10][1](i);
            }
          });
          sum();
          dispose();
        });
      },
      { iterations: 500 },
    ),
  );

  // Diamond dependency pattern (glitch-free test)
  results.push(
    await benchmark(
      "signals",
      "barq",
      "diamond pattern (100 updates)",
      () => {
        scope((dispose) => {
          const x = signal(1);
          const a = computed(() => x() * 2);
          const b = computed(() => x() * 3);
          const c = computed(() => a() + b());

          batch(() => {
            for (let i = 0; i < 100; i++) {
              x.set(i);
            }
          });
          c();
          dispose();
        }, true);
      },
      { iterations: 500 },
    ),
  );

  results.push(
    await benchmark(
      "signals",
      "solid",
      "diamond pattern (100 updates)",
      () => {
        root((dispose) => {
          const [x, setX] = createSignal(1);
          const a = createMemo(() => x() * 2);
          const b = createMemo(() => x() * 3);
          const c = createMemo(() => a() + b());

          solidBatch(() => {
            for (let i = 0; i < 100; i++) {
              setX(i);
            }
          });
          c();
          dispose();
        });
      },
      { iterations: 500 },
    ),
  );

  return results;
}
