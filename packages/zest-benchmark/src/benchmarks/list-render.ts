/**
 * Benchmark: List Rendering
 * Compares rendering lists of items
 */

import { benchmark, generateItems, shuffle } from "../utils.ts";
import type { BenchmarkResult } from "../types.ts";

// Zest imports
import { createElement as h, render as zestRender, useState, For } from "zest";

// SolidJS imports
import { createSignal, For as SolidFor } from "solid-js";
import { render as solidRender } from "solid-js/web";

export async function runListRenderBenchmarks(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // Initial render of 100 items
  const items100 = generateItems(100);

  results.push(
    await benchmark(
      "list-render",
      "zest",
      "render 100 items",
      () => {
        const container = document.createElement("div");
        const [items] = useState(items100);
        const el = h(For, {
          each: items,
          children: (item: { id: number; name: string }) =>
            h("div", { class: "item", "data-id": String(item.id) }, item.name),
        });
        zestRender(el, container);
      },
      { iterations: 500 }
    )
  );

  results.push(
    await benchmark(
      "list-render",
      "solid",
      "render 100 items",
      () => {
        const container = document.createElement("div");
        const [items] = createSignal(items100);
        const dispose = solidRender(
          () =>
            SolidFor({
              each: items(),
              children: (item: { id: number; name: string }) => {
                const div = document.createElement("div");
                div.className = "item";
                div.dataset.id = String(item.id);
                div.textContent = item.name;
                return div;
              },
            }),
          container
        );
        dispose();
      },
      { iterations: 500 }
    )
  );

  // Initial render of 1000 items
  const items1000 = generateItems(1000);

  results.push(
    await benchmark(
      "list-render",
      "zest",
      "render 1000 items",
      () => {
        const container = document.createElement("div");
        const [items] = useState(items1000);
        const el = h(For, {
          each: items,
          children: (item: { id: number; name: string }) =>
            h("div", { class: "item", "data-id": String(item.id) }, item.name),
        });
        zestRender(el, container);
      },
      { iterations: 100 }
    )
  );

  results.push(
    await benchmark(
      "list-render",
      "solid",
      "render 1000 items",
      () => {
        const container = document.createElement("div");
        const [items] = createSignal(items1000);
        const dispose = solidRender(
          () =>
            SolidFor({
              each: items(),
              children: (item: { id: number; name: string }) => {
                const div = document.createElement("div");
                div.className = "item";
                div.dataset.id = String(item.id);
                div.textContent = item.name;
                return div;
              },
            }),
          container
        );
        dispose();
      },
      { iterations: 100 }
    )
  );

  return results;
}
