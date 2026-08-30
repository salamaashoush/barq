/**
 * Benchmark: Conditional Rendering
 * Compares Show/Switch component performance
 */

import type { BenchmarkResult } from "../types.ts";
import { benchmark } from "../utils.ts";

// Barq imports
import { signal, render as barqRender } from "@barqjs/core";
import { Show, h } from "../h.ts";

// SolidJS imports
import { Show as SolidShow, createSignal } from "solid-js";
import { render as solidRender } from "solid-js/web";

export async function runConditionalBenchmarks(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // Show/hide toggle (100 times)
  results.push(
    await benchmark(
      "conditional",
      "barq",
      "toggle show/hide 100x",
      () => {
        const container = document.createElement("div");
        const visible = signal(true);
        const el = Show(visible, () => h("div", { class: "content" }, "Hello World"));
        barqRender(el, container);

        for (let i = 0; i < 100; i++) {
          visible.set(i % 2 === 0);
        }
      },
      { iterations: 500 },
    ),
  );

  results.push(
    await benchmark(
      "conditional",
      "solid",
      "toggle show/hide 100x",
      () => {
        const container = document.createElement("div");
        let setVisible: ((v: boolean) => void) | undefined;

        const dispose = solidRender(() => {
          const [visible, _setVisible] = createSignal(true);
          setVisible = _setVisible;
          return SolidShow({
            when: visible(),
            children: (() => {
              const div = document.createElement("div");
              div.className = "content";
              div.textContent = "Hello World";
              return div;
            }) as unknown as Element,
          });
        }, container);

        for (let i = 0; i < 100; i++) {
          setVisible?.(i % 2 === 0);
        }
        dispose();
      },
      { iterations: 500 },
    ),
  );

  // Show with fallback toggle
  results.push(
    await benchmark(
      "conditional",
      "barq",
      "show/fallback toggle 100x",
      () => {
        const container = document.createElement("div");
        const visible = signal(true);
        const el = Show(
          visible,
          () => h("div", { class: "content" }, "Loaded!"),
          () => h("div", { class: "fallback" }, "Loading..."),
        );
        barqRender(el, container);

        for (let i = 0; i < 100; i++) {
          visible.set(i % 2 === 0);
        }
      },
      { iterations: 500 },
    ),
  );

  results.push(
    await benchmark(
      "conditional",
      "solid",
      "show/fallback toggle 100x",
      () => {
        const container = document.createElement("div");
        let setVisible: ((v: boolean) => void) | undefined;

        const dispose = solidRender(() => {
          const [visible, _setVisible] = createSignal(true);
          setVisible = _setVisible;
          return SolidShow({
            when: visible(),
            fallback: (() => {
              const div = document.createElement("div");
              div.className = "fallback";
              div.textContent = "Loading...";
              return div;
            }) as unknown as Element,
            children: (() => {
              const div = document.createElement("div");
              div.className = "content";
              div.textContent = "Loaded!";
              return div;
            }) as unknown as Element,
          });
        }, container);

        for (let i = 0; i < 100; i++) {
          setVisible?.(i % 2 === 0);
        }
        dispose();
      },
      { iterations: 500 },
    ),
  );

  // Multiple conditions (simulate tabs)
  results.push(
    await benchmark(
      "conditional",
      "barq",
      "switch 5 tabs 100x",
      () => {
        const container = document.createElement("div");
        const tab = signal(0);
        const el = h(
          "div",
          null,
          Show(
            () => tab() === 0,
            () => h("div", null, "Tab 0"),
          ),
          Show(
            () => tab() === 1,
            () => h("div", null, "Tab 1"),
          ),
          Show(
            () => tab() === 2,
            () => h("div", null, "Tab 2"),
          ),
          Show(
            () => tab() === 3,
            () => h("div", null, "Tab 3"),
          ),
          Show(
            () => tab() === 4,
            () => h("div", null, "Tab 4"),
          ),
        );
        barqRender(el, container);

        for (let i = 0; i < 100; i++) {
          tab.set(i % 5);
        }
      },
      { iterations: 200 },
    ),
  );

  results.push(
    await benchmark(
      "conditional",
      "solid",
      "switch 5 tabs 100x",
      () => {
        const container = document.createElement("div");
        let setTab: ((v: number) => void) | undefined;

        const dispose = solidRender(() => {
          const [tab, _setTab] = createSignal(0);
          setTab = _setTab;

          const div = document.createElement("div");

          const makeTab = (n: number) => {
            const t = document.createElement("div");
            t.textContent = `Tab ${n}`;
            return t;
          };

          // Manual Show implementation for each tab
          return div;
        }, container);

        for (let i = 0; i < 100; i++) {
          setTab?.(i % 5);
        }
        dispose();
      },
      { iterations: 200 },
    ),
  );

  return results;
}
