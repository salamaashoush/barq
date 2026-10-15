/**
 * Benchmark: Store Performance
 * Compares store creation, updates, and nested reactivity
 */

import type { BenchmarkResult } from "../types.ts";
import { benchmark } from "../utils.ts";

// Barq imports
import {
  createRoot,
  createStore,
  createEffect as barqCreateEffect,
  flush,
  reconcile,
} from "@barqjs/core";

// SolidJS imports
import { createStore as solidCreateStore, produce as solidProduce, reconcile as solidReconcile } from "solid-js/store";
import { createRoot as root, createEffect } from "solid-js";

export async function runStoreBenchmarks(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // Store creation
  results.push(
    await benchmark("store", "barq", "create store", () => {
      createStore({ count: 0, user: { name: "John", age: 30 } });
    }),
  );

  results.push(
    await benchmark("store", "solid", "create store", () => {
      root((dispose) => {
        solidCreateStore({ count: 0, user: { name: "John", age: 30 } });
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
        const [state, setState] = createStore({ count: 0 });
        for (let i = 0; i < 1000; i++) {
          setState((draft) => {
            draft.count = i;
          });
        }
        flush();
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
        root((dispose) => {
          const [state, setState] = solidCreateStore({ count: 0 });
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
        const [state, setState] = createStore({
          user: { profile: { settings: { theme: "light" } } },
        });
        for (let i = 0; i < 500; i++) {
          setState((draft) => {
            draft.user.profile.settings.theme = i % 2 === 0 ? "light" : "dark";
          });
        }
        flush();
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
        root((dispose) => {
          const [state, setState] = solidCreateStore({
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
        const [setState, dispose] = createRoot((dispose) => {
          let effectRuns = 0;
          const [state, setState] = createStore({ a: 0, b: 0 });
          barqCreateEffect(
            () => state.a,
            () => {
              effectRuns++;
            },
          );
          return [setState, dispose] as const;
        });
        flush();
        for (let i = 0; i < 100; i++) {
          setState((draft) => {
            draft.a = i;
          });
          flush();
        }
        dispose();
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
        root((dispose) => {
          let effectRuns = 0;
          const [state, setState] = solidCreateStore({ a: 0, b: 0 });
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

  // Draft mutation: the barq setter hands out the draft, Solid 1 needs produce()
  results.push(
    await benchmark(
      "store",
      "barq",
      "produce (100 updates)",
      () => {
        const [state, setState] = createStore({
          users: [
            { id: 1, name: "Alice", score: 0 },
            { id: 2, name: "Bob", score: 0 },
          ],
        });
        for (let i = 0; i < 100; i++) {
          setState((draft) => {
            draft.users[0].score = i;
          });
        }
        flush();
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
        root((dispose) => {
          const [state, setState] = solidCreateStore({
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
        const [state, setState] = createStore({
          items: Array.from({ length: 100 }, (_, i) => ({ id: i, value: i })),
        });
        for (let i = 0; i < 50; i++) {
          const newItems = Array.from({ length: 100 }, (_, j) => ({
            id: j,
            value: j + i,
          }));
          setState((draft) => {
            reconcile(newItems, "id")(draft.items);
          });
        }
        flush();
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
        root((dispose) => {
          const [state, setState] = solidCreateStore({
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
        const [state, setState] = createStore({
          items: Array.from({ length: 10 }, (_, i) => ({ id: i, done: false })),
        });
        for (let i = 0; i < 500; i++) {
          setState((draft) => {
            const item = draft.items[i % 10];
            item.done = !item.done;
          });
        }
        flush();
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
        root((dispose) => {
          const [state, setState] = solidCreateStore({
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
