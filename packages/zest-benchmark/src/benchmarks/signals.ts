/**
 * Benchmark: Signal/Reactivity Performance
 * Compares signal creation, updates, and propagation
 */

import { benchmark } from "../utils.ts";
import type { BenchmarkResult } from "../types.ts";

// Zest imports
import { useState, useMemo, useEffect } from "zest";

// SolidJS imports
import { createSignal, createMemo, createEffect, createRoot } from "solid-js";

export async function runSignalBenchmarks(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // Signal creation
  results.push(
    await benchmark("signals", "zest", "create signal", () => {
      useState(0);
    })
  );

  results.push(
    await benchmark("signals", "solid", "create signal", () => {
      createRoot(() => {
        createSignal(0);
      });
    })
  );

  // Signal update (1000 updates)
  results.push(
    await benchmark(
      "signals",
      "zest",
      "1000 signal updates",
      () => {
        const [count, setCount] = useState(0);
        for (let i = 0; i < 1000; i++) {
          setCount(i);
        }
      },
      { iterations: 500 }
    )
  );

  results.push(
    await benchmark(
      "signals",
      "solid",
      "1000 signal updates",
      () => {
        createRoot((dispose) => {
          const [count, setCount] = createSignal(0);
          for (let i = 0; i < 1000; i++) {
            setCount(i);
          }
          dispose();
        });
      },
      { iterations: 500 }
    )
  );

  // Computed/Memo creation
  results.push(
    await benchmark("signals", "zest", "create computed", () => {
      const [count] = useState(0);
      useMemo(() => count() * 2);
    })
  );

  results.push(
    await benchmark("signals", "solid", "create computed", () => {
      createRoot((dispose) => {
        const [count] = createSignal(0);
        createMemo(() => count() * 2);
        dispose();
      });
    })
  );

  // Effect creation and trigger
  results.push(
    await benchmark(
      "signals",
      "zest",
      "effect with 100 updates",
      () => {
        let effectRuns = 0;
        const [count, setCount] = useState(0);
        useEffect(() => {
          const _ = count();
          effectRuns++;
        });
        for (let i = 0; i < 100; i++) {
          setCount(i);
        }
      },
      { iterations: 500 }
    )
  );

  results.push(
    await benchmark(
      "signals",
      "solid",
      "effect with 100 updates",
      () => {
        createRoot((dispose) => {
          let effectRuns = 0;
          const [count, setCount] = createSignal(0);
          createEffect(() => {
            const _ = count();
            effectRuns++;
          });
          for (let i = 0; i < 100; i++) {
            setCount(i);
          }
          dispose();
        });
      },
      { iterations: 500 }
    )
  );

  // Chain of computed values (dependency graph)
  results.push(
    await benchmark(
      "signals",
      "zest",
      "computed chain (5 deep)",
      () => {
        const [a, setA] = useState(1);
        const b = useMemo(() => a() * 2);
        const c = useMemo(() => b() + 1);
        const d = useMemo(() => c() * 3);
        const e = useMemo(() => d() - 2);
        const f = useMemo(() => e() + a());

        for (let i = 0; i < 100; i++) {
          setA(i);
          f(); // read final value
        }
      },
      { iterations: 500 }
    )
  );

  results.push(
    await benchmark(
      "signals",
      "solid",
      "computed chain (5 deep)",
      () => {
        createRoot((dispose) => {
          const [a, setA] = createSignal(1);
          const b = createMemo(() => a() * 2);
          const c = createMemo(() => b() + 1);
          const d = createMemo(() => c() * 3);
          const e = createMemo(() => d() - 2);
          const f = createMemo(() => e() + a());

          for (let i = 0; i < 100; i++) {
            setA(i);
            f(); // read final value
          }
          dispose();
        });
      },
      { iterations: 500 }
    )
  );

  // Wide dependency graph (many signals -> one computed)
  results.push(
    await benchmark(
      "signals",
      "zest",
      "wide deps (10 signals)",
      () => {
        const signals = Array.from({ length: 10 }, (_, i) => useState(i));
        const sum = useMemo(() => signals.reduce((acc, [s]) => acc + s(), 0));

        for (let i = 0; i < 100; i++) {
          signals[i % 10][1](i);
          sum();
        }
      },
      { iterations: 500 }
    )
  );

  results.push(
    await benchmark(
      "signals",
      "solid",
      "wide deps (10 signals)",
      () => {
        createRoot((dispose) => {
          const signals = Array.from({ length: 10 }, (_, i) => createSignal(i));
          const sum = createMemo(() => signals.reduce((acc, [s]) => acc + s(), 0));

          for (let i = 0; i < 100; i++) {
            signals[i % 10][1](i);
            sum();
          }
          dispose();
        });
      },
      { iterations: 500 }
    )
  );

  return results;
}
