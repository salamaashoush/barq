/**
 * Benchmark: Signal/Reactivity Performance
 * Compares signal creation, updates, and propagation
 */

import type { BenchmarkResult } from "../types.ts";
import { benchmark } from "../utils.ts";

// Barq imports - use raw signals for fair comparison
import {
  createSignal,
  createMemo,
  createEffect as barqCreateEffect,
  flush,
  createRoot,
} from "@barqjs/core";

// SolidJS imports
import {
  createEffect,
  createMemo as solidCreateMemo,
  createRoot as root,
  createSignal as solidCreateSignal,
  batch as solidBatch,
} from "solid-js";

export async function runSignalBenchmarks(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // Signal creation
  results.push(
    await benchmark("signals", "barq", "create signal", () => {
      createSignal(0);
    }),
  );

  results.push(
    await benchmark("signals", "solid", "create signal", () => {
      root(() => {
        solidCreateSignal(0);
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
        const [count, writeCount] = createSignal(0);
        flush(() => {
          for (let i = 0; i < 1000; i++) {
            writeCount(i);
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
          const [count, setCount] = solidCreateSignal(0);
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
      createRoot(() => {
        const [count] = createSignal(0);
        createMemo(() => count() * 2);
      });
    }),
  );

  results.push(
    await benchmark("signals", "solid", "create computed", () => {
      root((dispose) => {
        const [count] = solidCreateSignal(0);
        solidCreateMemo(() => count() * 2);
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
        const [writeCount, dispose] = createRoot((dispose) => {
          let effectRuns = 0;
          const [count, writeCount] = createSignal(0);
          barqCreateEffect(
            () => count(),
            () => {
              effectRuns++;
            },
          );
          return [writeCount, dispose] as const;
        });
        flush();
        flush(() => {
          for (let i = 0; i < 100; i++) {
            writeCount(i);
          }
        });
        dispose();
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
          const [count, setCount] = solidCreateSignal(0);
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
        const [writeA, f, dispose] = createRoot((dispose) => {
          const [a, writeA] = createSignal(1);
          const b = createMemo(() => a() * 2);
          const c = createMemo(() => b() + 1);
          const d = createMemo(() => c() * 3);
          const e = createMemo(() => d() - 2);
          const f = createMemo(() => e() + a());
          return [writeA, f, dispose] as const;
        });
        flush(() => {
          for (let i = 0; i < 100; i++) {
            writeA(i);
          }
        });
        f(); // read final value
        dispose();
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
          const [a, setA] = solidCreateSignal(1);
          const b = solidCreateMemo(() => a() * 2);
          const c = solidCreateMemo(() => b() + 1);
          const d = solidCreateMemo(() => c() * 3);
          const e = solidCreateMemo(() => d() - 2);
          const f = solidCreateMemo(() => e() + a());

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
        const [signals, sum, dispose] = createRoot((dispose) => {
          const signals = Array.from({ length: 10 }, (_, i) => createSignal(i));
          const sum = createMemo(() => signals.reduce((acc, [s]) => acc + s(), 0));
          return [signals, sum, dispose] as const;
        });
        flush(() => {
          for (let i = 0; i < 100; i++) {
            signals[i % 10][1](i);
          }
        });
        sum();
        dispose();
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
          const signals = Array.from({ length: 10 }, (_, i) => solidCreateSignal(i));
          const sum = solidCreateMemo(() => signals.reduce((acc, [s]) => acc + s(), 0));

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
        const [writeX, c, dispose] = createRoot((dispose) => {
          const [x, writeX] = createSignal(1);
          const a = createMemo(() => x() * 2);
          const b = createMemo(() => x() * 3);
          const c = createMemo(() => a() + b());
          return [writeX, c, dispose] as const;
        });
        flush(() => {
          for (let i = 0; i < 100; i++) {
            writeX(i);
          }
        });
        c();
        dispose();
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
          const [x, setX] = solidCreateSignal(1);
          const a = solidCreateMemo(() => x() * 2);
          const b = solidCreateMemo(() => x() * 3);
          const c = solidCreateMemo(() => a() + b());

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
