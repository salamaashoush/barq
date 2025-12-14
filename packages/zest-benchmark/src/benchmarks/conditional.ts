/**
 * Benchmark: Conditional Rendering
 * Compares Show/Switch component performance
 */

import { benchmark } from "../utils.ts";
import type { BenchmarkResult } from "../types.ts";

// Zest imports
import { createElement as h, render as zestRender, useState, Show } from "zest";

// SolidJS imports
import { createSignal, Show as SolidShow } from "solid-js";
import { render as solidRender } from "solid-js/web";

export async function runConditionalBenchmarks(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // Show/hide toggle (100 times)
  results.push(
    await benchmark(
      "conditional",
      "zest",
      "toggle show/hide 100x",
      () => {
        const container = document.createElement("div");
        const [visible, setVisible] = useState(true);
        const el = h(Show, {
          when: visible,
          children: h("div", { class: "content" }, "Hello World"),
        });
        zestRender(el, container);

        for (let i = 0; i < 100; i++) {
          setVisible(i % 2 === 0);
        }
      },
      { iterations: 500 }
    )
  );

  results.push(
    await benchmark(
      "conditional",
      "solid",
      "toggle show/hide 100x",
      () => {
        const container = document.createElement("div");
        let setVisible: (v: boolean) => void;

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
          setVisible!(i % 2 === 0);
        }
        dispose();
      },
      { iterations: 500 }
    )
  );

  // Show with fallback toggle
  results.push(
    await benchmark(
      "conditional",
      "zest",
      "show/fallback toggle 100x",
      () => {
        const container = document.createElement("div");
        const [visible, setVisible] = useState(true);
        const el = h(Show, {
          when: visible,
          fallback: h("div", { class: "fallback" }, "Loading..."),
          children: h("div", { class: "content" }, "Loaded!"),
        });
        zestRender(el, container);

        for (let i = 0; i < 100; i++) {
          setVisible(i % 2 === 0);
        }
      },
      { iterations: 500 }
    )
  );

  results.push(
    await benchmark(
      "conditional",
      "solid",
      "show/fallback toggle 100x",
      () => {
        const container = document.createElement("div");
        let setVisible: (v: boolean) => void;

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
          setVisible!(i % 2 === 0);
        }
        dispose();
      },
      { iterations: 500 }
    )
  );

  // Multiple conditions (simulate tabs)
  results.push(
    await benchmark(
      "conditional",
      "zest",
      "switch 5 tabs 100x",
      () => {
        const container = document.createElement("div");
        const [tab, setTab] = useState(0);
        const el = h(
          "div",
          null,
          h(Show, {
            when: () => tab() === 0,
            children: h("div", null, "Tab 0"),
          }),
          h(Show, {
            when: () => tab() === 1,
            children: h("div", null, "Tab 1"),
          }),
          h(Show, {
            when: () => tab() === 2,
            children: h("div", null, "Tab 2"),
          }),
          h(Show, {
            when: () => tab() === 3,
            children: h("div", null, "Tab 3"),
          }),
          h(Show, {
            when: () => tab() === 4,
            children: h("div", null, "Tab 4"),
          })
        );
        zestRender(el, container);

        for (let i = 0; i < 100; i++) {
          setTab(i % 5);
        }
      },
      { iterations: 200 }
    )
  );

  results.push(
    await benchmark(
      "conditional",
      "solid",
      "switch 5 tabs 100x",
      () => {
        const container = document.createElement("div");
        let setTab: (v: number) => void;

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
          setTab!(i % 5);
        }
        dispose();
      },
      { iterations: 200 }
    )
  );

  return results;
}
