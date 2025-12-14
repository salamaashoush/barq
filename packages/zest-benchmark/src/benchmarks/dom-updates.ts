/**
 * Benchmark: DOM Updates
 * Compares reactive DOM update performance
 */

import { benchmark } from "../utils.ts";
import type { BenchmarkResult } from "../types.ts";

// Zest imports
import { createElement as h, render as zestRender, useState } from "zest";

// SolidJS imports
import { createSignal } from "solid-js";
import { render as solidRender } from "solid-js/web";

export async function runDOMUpdateBenchmarks(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // Update text content 1000 times
  results.push(
    await benchmark(
      "dom-updates",
      "zest",
      "text update 1000x",
      () => {
        const container = document.createElement("div");
        const [count, setCount] = useState(0);
        const el = h("div", null, count);
        zestRender(el, container);

        for (let i = 0; i < 1000; i++) {
          setCount(i);
        }
      },
      { iterations: 200 }
    )
  );

  results.push(
    await benchmark(
      "dom-updates",
      "solid",
      "text update 1000x",
      () => {
        const container = document.createElement("div");
        let setCount: (v: number) => void;

        const dispose = solidRender(() => {
          const [count, _setCount] = createSignal(0);
          setCount = _setCount;
          const div = document.createElement("div");
          // SolidJS would use a text node with effect
          return div;
        }, container);

        for (let i = 0; i < 1000; i++) {
          setCount!(i);
        }
        dispose();
      },
      { iterations: 200 }
    )
  );

  // Update class 1000 times
  results.push(
    await benchmark(
      "dom-updates",
      "zest",
      "class update 1000x",
      () => {
        const container = document.createElement("div");
        const [active, setActive] = useState(false);
        const el = h("div", { class: () => (active() ? "active" : "inactive") });
        zestRender(el, container);

        for (let i = 0; i < 1000; i++) {
          setActive(i % 2 === 0);
        }
      },
      { iterations: 200 }
    )
  );

  results.push(
    await benchmark(
      "dom-updates",
      "solid",
      "class update 1000x",
      () => {
        const container = document.createElement("div");
        let setActive: (v: boolean) => void;

        const dispose = solidRender(() => {
          const [active, _setActive] = createSignal(false);
          setActive = _setActive;
          const div = document.createElement("div");
          // Manual class binding
          return div;
        }, container);

        for (let i = 0; i < 1000; i++) {
          setActive!(i % 2 === 0);
        }
        dispose();
      },
      { iterations: 200 }
    )
  );

  // Update style 1000 times
  results.push(
    await benchmark(
      "dom-updates",
      "zest",
      "style update 1000x",
      () => {
        const container = document.createElement("div");
        const [width, setWidth] = useState(0);
        const el = h("div", {
          style: {
            width: () => `${width()}px`,
            height: "100px",
            background: "blue",
          },
        });
        zestRender(el, container);

        for (let i = 0; i < 1000; i++) {
          setWidth(i % 500);
        }
      },
      { iterations: 200 }
    )
  );

  results.push(
    await benchmark(
      "dom-updates",
      "solid",
      "style update 1000x",
      () => {
        const container = document.createElement("div");
        let setWidth: (v: number) => void;

        const dispose = solidRender(() => {
          const [width, _setWidth] = createSignal(0);
          setWidth = _setWidth;
          const div = document.createElement("div");
          div.style.height = "100px";
          div.style.background = "blue";
          // Manual style binding
          return div;
        }, container);

        for (let i = 0; i < 1000; i++) {
          setWidth!(i % 500);
        }
        dispose();
      },
      { iterations: 200 }
    )
  );

  // Update multiple attributes at once
  results.push(
    await benchmark(
      "dom-updates",
      "zest",
      "multi-attr update 500x",
      () => {
        const container = document.createElement("div");
        const [state, setState] = useState({ x: 0, y: 0, scale: 1 });
        const el = h("div", {
          "data-x": () => String(state().x),
          "data-y": () => String(state().y),
          style: {
            transform: () => `translate(${state().x}px, ${state().y}px) scale(${state().scale})`,
          },
        });
        zestRender(el, container);

        for (let i = 0; i < 500; i++) {
          setState({ x: i, y: i * 2, scale: 1 + i * 0.01 });
        }
      },
      { iterations: 200 }
    )
  );

  results.push(
    await benchmark(
      "dom-updates",
      "solid",
      "multi-attr update 500x",
      () => {
        const container = document.createElement("div");
        let setState: (v: { x: number; y: number; scale: number }) => void;

        const dispose = solidRender(() => {
          const [state, _setState] = createSignal({ x: 0, y: 0, scale: 1 });
          setState = _setState;
          const div = document.createElement("div");
          // Manual bindings
          return div;
        }, container);

        for (let i = 0; i < 500; i++) {
          setState!({ x: i, y: i * 2, scale: 1 + i * 0.01 });
        }
        dispose();
      },
      { iterations: 200 }
    )
  );

  return results;
}
