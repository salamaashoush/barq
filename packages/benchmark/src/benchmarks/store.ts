/**
 * Benchmark: Store Performance
 * Compares store creation, updates, and nested reactivity
 */

import type { BenchmarkResult } from "../types.ts";
import { benchmark } from "../utils.ts";

// Barq imports
import { useStore, produce, reconcile, useEffect } from "@barqjs/core";

// SolidJS imports
import { createStore, produce as solidProduce, reconcile as solidReconcile } from "solid-js/store";
import { createRoot, createEffect } from "solid-js";

export async function runStoreBenchmarks(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // Store creation
  results.push(
    await benchmark("store", "barq", "create store", () => {
      useStore({ count: 0, user: { name: "John", age: 30 } });
    }),
  );

  results.push(
    await benchmark("store", "solid", "create store", () => {
      createRoot((dispose) => {
        createStore({ count: 0, user: { name: "John", age: 30 } });
        dispose();
      });
    }),
  );

  // Simple property update (1000 updates)
  results.push(
    await benchmark(
      "store",
      "barq",
      "1000 property updates",
      () => {
        const [state, setState] = useStore({ count: 0 });
        for (let i = 0; i < 1000; i++) {
          setState("count", i);
        }
      },
      { iterations: 500 },
    ),
  );

  results.push(
    await benchmark(
      "store",
      "solid",
      "1000 property updates",
      () => {
        createRoot((dispose) => {
          const [state, setState] = createStore({ count: 0 });
          for (let i = 0; i < 1000; i++) {
            setState("count", i);
          }
          dispose();
        });
      },
      { iterations: 500 },
    ),
  );

  // Deep path updates
  results.push(
    await benchmark(
      "store",
      "barq",
      "500 deep path updates",
      () => {
        const [state, setState] = useStore({
          user: { profile: { settings: { theme: "light" } } },
        });
        for (let i = 0; i < 500; i++) {
          setState("user", "profile", "settings", "theme", i % 2 === 0 ? "light" : "dark");
        }
      },
      { iterations: 500 },
    ),
  );

  results.push(
    await benchmark(
      "store",
      "solid",
      "500 deep path updates",
      () => {
        createRoot((dispose) => {
          const [state, setState] = createStore({
            user: { profile: { settings: { theme: "light" } } },
          });
          for (let i = 0; i < 500; i++) {
            setState("user", "profile", "settings", "theme", i % 2 === 0 ? "light" : "dark");
          }
          dispose();
        });
      },
      { iterations: 500 },
    ),
  );

  // Store with effect (fine-grained updates)
  results.push(
    await benchmark(
      "store",
      "barq",
      "store + effect (100 updates)",
      () => {
        let effectRuns = 0;
        const [state, setState] = useStore({ a: 0, b: 0 });
        useEffect(() => {
          state.a;
          effectRuns++;
        });
        for (let i = 0; i < 100; i++) {
          setState("a", i);
        }
      },
      { iterations: 500 },
    ),
  );

  results.push(
    await benchmark(
      "store",
      "solid",
      "store + effect (100 updates)",
      () => {
        createRoot((dispose) => {
          let effectRuns = 0;
          const [state, setState] = createStore({ a: 0, b: 0 });
          createEffect(() => {
            state.a;
            effectRuns++;
          });
          for (let i = 0; i < 100; i++) {
            setState("a", i);
          }
          dispose();
        });
      },
      { iterations: 500 },
    ),
  );

  // produce() for immutable updates
  results.push(
    await benchmark(
      "store",
      "barq",
      "produce (100 updates)",
      () => {
        const [state, setState] = useStore({
          users: [
            { id: 1, name: "Alice", score: 0 },
            { id: 2, name: "Bob", score: 0 },
          ],
        });
        for (let i = 0; i < 100; i++) {
          setState(
            "users",
            produce((draft) => {
              draft[0].score = i;
            }),
          );
        }
      },
      { iterations: 300 },
    ),
  );

  results.push(
    await benchmark(
      "store",
      "solid",
      "produce (100 updates)",
      () => {
        createRoot((dispose) => {
          const [state, setState] = createStore({
            users: [
              { id: 1, name: "Alice", score: 0 },
              { id: 2, name: "Bob", score: 0 },
            ],
          });
          for (let i = 0; i < 100; i++) {
            setState(
              "users",
              solidProduce((draft: { id: number; name: string; score: number }[]) => {
                draft[0].score = i;
              }),
            );
          }
          dispose();
        });
      },
      { iterations: 300 },
    ),
  );

  // reconcile() for array diffing
  results.push(
    await benchmark(
      "store",
      "barq",
      "reconcile (50 array updates)",
      () => {
        const [state, setState] = useStore({
          items: Array.from({ length: 100 }, (_, i) => ({ id: i, value: i })),
        });
        for (let i = 0; i < 50; i++) {
          const newItems = Array.from({ length: 100 }, (_, j) => ({
            id: j,
            value: j + i,
          }));
          setState("items", reconcile(newItems, "id"));
        }
      },
      { iterations: 200 },
    ),
  );

  results.push(
    await benchmark(
      "store",
      "solid",
      "reconcile (50 array updates)",
      () => {
        createRoot((dispose) => {
          const [state, setState] = createStore({
            items: Array.from({ length: 100 }, (_, i) => ({ id: i, value: i })),
          });
          for (let i = 0; i < 50; i++) {
            const newItems = Array.from({ length: 100 }, (_, j) => ({
              id: j,
              value: j + i,
            }));
            setState("items", solidReconcile(newItems, { key: "id" }));
          }
          dispose();
        });
      },
      { iterations: 200 },
    ),
  );

  // Array index updates
  results.push(
    await benchmark(
      "store",
      "barq",
      "array index updates (500)",
      () => {
        const [state, setState] = useStore({
          items: Array.from({ length: 10 }, (_, i) => ({ id: i, done: false })),
        });
        for (let i = 0; i < 500; i++) {
          setState("items", i % 10, "done", (prev: boolean) => !prev);
        }
      },
      { iterations: 500 },
    ),
  );

  results.push(
    await benchmark(
      "store",
      "solid",
      "array index updates (500)",
      () => {
        createRoot((dispose) => {
          const [state, setState] = createStore({
            items: Array.from({ length: 10 }, (_, i) => ({ id: i, done: false })),
          });
          for (let i = 0; i < 500; i++) {
            setState("items", i % 10, "done", (prev: boolean) => !prev);
          }
          dispose();
        });
      },
      { iterations: 500 },
    ),
  );

  return results;
}
