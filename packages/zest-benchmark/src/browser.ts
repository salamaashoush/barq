/**
 * Browser-based benchmark runner
 * Runs all benchmarks in actual browser environment
 */

import type { BenchmarkResult } from "./types.ts";
import { benchmark, generateItems } from "./utils.ts";

// Zest imports
import {
  createElement as h,
  render as zestRender,
  useState,
  useMemo,
  useEffect,
  For,
  Show,
  createScope,
} from "zest";

// SolidJS imports
import {
  createSignal,
  createMemo,
  createEffect,
  createRoot,
  For as SolidFor,
  Show as SolidShow,
} from "solid-js";
import { render as solidRender, template } from "solid-js/web";

interface BenchmarkSuite {
  name: string;
  benchmarks: Array<{
    operation: string;
    zest: () => void | Promise<void>;
    solid: () => void | Promise<void>;
    iterations?: number;
  }>;
}

// Pre-generate items for list benchmarks
const items100 = generateItems(100);
const items1000 = generateItems(1000);
const items10000 = generateItems(10000);

const suites: BenchmarkSuite[] = [
  {
    name: "Signals/Reactivity",
    benchmarks: [
      {
        operation: "create signal",
        zest: () => {
          createScope(() => {
            useState(0);
          });
        },
        solid: () => {
          createRoot(() => {
            createSignal(0);
          });
        },
      },
      {
        operation: "1000 signal updates",
        iterations: 500,
        zest: () => {
          createScope((dispose) => {
            const [count, setCount] = useState(0);
            for (let i = 0; i < 1000; i++) {
              setCount(i);
            }
            dispose();
          });
        },
        solid: () => {
          createRoot((dispose) => {
            const [count, setCount] = createSignal(0);
            for (let i = 0; i < 1000; i++) {
              setCount(i);
            }
            dispose();
          });
        },
      },
      {
        operation: "create computed",
        zest: () => {
          createScope((dispose) => {
            const [count] = useState(0);
            useMemo(() => count() * 2);
            dispose();
          });
        },
        solid: () => {
          createRoot((dispose) => {
            const [count] = createSignal(0);
            createMemo(() => count() * 2);
            dispose();
          });
        },
      },
      {
        operation: "effect with 100 updates",
        iterations: 500,
        zest: () => {
          createScope((dispose) => {
            let effectRuns = 0;
            const [count, setCount] = useState(0);
            useEffect(() => {
              const _ = count();
              effectRuns++;
            });
            for (let i = 0; i < 100; i++) {
              setCount(i);
            }
            dispose();
          });
        },
        solid: () => {
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
      },
      {
        operation: "computed chain (5 deep)",
        iterations: 500,
        zest: () => {
          createScope((dispose) => {
            const [a, setA] = useState(1);
            const b = useMemo(() => a() * 2);
            const c = useMemo(() => b() + 1);
            const d = useMemo(() => c() * 3);
            const e = useMemo(() => d() - 2);
            const f = useMemo(() => e() + a());

            for (let i = 0; i < 100; i++) {
              setA(i);
              f();
            }
            dispose();
          });
        },
        solid: () => {
          createRoot((dispose) => {
            const [a, setA] = createSignal(1);
            const b = createMemo(() => a() * 2);
            const c = createMemo(() => b() + 1);
            const d = createMemo(() => c() * 3);
            const e = createMemo(() => d() - 2);
            const f = createMemo(() => e() + a());

            for (let i = 0; i < 100; i++) {
              setA(i);
              f();
            }
            dispose();
          });
        },
      },
      {
        operation: "wide deps (10 signals)",
        iterations: 500,
        zest: () => {
          createScope((dispose) => {
            const signals = Array.from({ length: 10 }, (_, i) => useState(i));
            const sum = useMemo(() => signals.reduce((acc, [s]) => acc + s(), 0));

            for (let i = 0; i < 100; i++) {
              signals[i % 10][1](i);
              sum();
            }
            dispose();
          });
        },
        solid: () => {
          createRoot((dispose) => {
            const signals = Array.from({ length: 10 }, (_, i) =>
              createSignal(i)
            );
            const sum = createMemo(() =>
              signals.reduce((acc, [s]) => acc + s(), 0)
            );

            for (let i = 0; i < 100; i++) {
              signals[i % 10][1](i);
              sum();
            }
            dispose();
          });
        },
      },
    ],
  },
  {
    name: "Element Creation",
    benchmarks: [
      {
        operation: "create div (simple)",
        zest: () => {
          h("div", { class: "test" }, "Hello");
        },
        solid: () => {
          const t = template("<div class=test>Hello</div>");
          t();
        },
      },
      {
        operation: "create nested (3 levels)",
        zest: () => {
          h(
            "div",
            { class: "container" },
            h(
              "div",
              { class: "row" },
              h("span", { class: "cell" }, "Content")
            )
          );
        },
        solid: () => {
          const t = template(
            "<div class=container><div class=row><span class=cell>Content</span></div></div>"
          );
          t();
        },
      },
      {
        operation: "create 100 divs",
        iterations: 500,
        zest: () => {
          for (let i = 0; i < 100; i++) {
            h("div", { class: "item", "data-id": String(i) }, `Item ${i}`);
          }
        },
        solid: () => {
          const t = template("<div class=item></div>");
          for (let i = 0; i < 100; i++) {
            const el = t() as HTMLElement;
            el.dataset.id = String(i);
            el.textContent = `Item ${i}`;
          }
        },
      },
      {
        operation: "create with 10 attrs",
        zest: () => {
          h("div", {
            id: "test",
            class: "foo bar baz",
            "data-a": "1",
            "data-b": "2",
            "data-c": "3",
            "data-d": "4",
            "data-e": "5",
            title: "tooltip",
            tabIndex: 0,
            role: "button",
          });
        },
        solid: () => {
          const t = template(
            "<div id=test class='foo bar baz' data-a=1 data-b=2 data-c=3 data-d=4 data-e=5 title=tooltip tabindex=0 role=button></div>"
          );
          t();
        },
      },
    ],
  },
  {
    name: "List Rendering",
    benchmarks: [
      {
        operation: "render 100 items",
        iterations: 500,
        zest: () => {
          createScope((dispose) => {
            const container = document.createElement("div");
            const el = h(For, {
              each: items100,
              children: (item: { id: number; name: string }) =>
                h("div", { class: "item", "data-id": String(item.id) }, item.name),
            });
            zestRender(el, container);
            dispose();
          });
        },
        solid: () => {
          const container = document.createElement("div");
          const dispose = solidRender(
            () =>
              SolidFor({
                each: items100,
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
      },
      {
        operation: "render 1000 items",
        iterations: 100,
        zest: () => {
          createScope((dispose) => {
            const container = document.createElement("div");
            const el = h(For, {
              each: items1000,
              children: (item: { id: number; name: string }) =>
                h("div", { class: "item", "data-id": String(item.id) }, item.name),
            });
            zestRender(el, container);
            dispose();
          });
        },
        solid: () => {
          const container = document.createElement("div");
          const dispose = solidRender(
            () =>
              SolidFor({
                each: items1000,
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
      },
      {
        operation: "render 10000 items",
        iterations: 20,
        zest: () => {
          createScope((dispose) => {
            const container = document.createElement("div");
            const el = h(For, {
              each: items10000,
              children: (item: { id: number; name: string }) =>
                h("div", { class: "item", "data-id": String(item.id) }, item.name),
            });
            zestRender(el, container);
            dispose();
          });
        },
        solid: () => {
          const container = document.createElement("div");
          const dispose = solidRender(
            () =>
              SolidFor({
                each: items10000,
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
      },
    ],
  },
  {
    name: "Conditional Rendering",
    benchmarks: [
      {
        operation: "toggle show/hide 100x",
        iterations: 500,
        zest: () => {
          createScope((dispose) => {
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
            dispose();
          });
        },
        solid: () => {
          const container = document.createElement("div");
          let setVisible: (v: boolean) => void;

          const dispose = solidRender(() => {
            const [visible, _setVisible] = createSignal(true);
            setVisible = _setVisible;
            return SolidShow({
              get when() {
                return visible();
              },
              get children() {
                const div = document.createElement("div");
                div.className = "content";
                div.textContent = "Hello World";
                return div;
              },
            });
          }, container);

          for (let i = 0; i < 100; i++) {
            setVisible!(i % 2 === 0);
          }
          dispose();
        },
      },
      {
        operation: "show/fallback toggle 100x",
        iterations: 500,
        zest: () => {
          createScope((dispose) => {
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
            dispose();
          });
        },
        solid: () => {
          const container = document.createElement("div");
          let setVisible: (v: boolean) => void;

          const dispose = solidRender(() => {
            const [visible, _setVisible] = createSignal(true);
            setVisible = _setVisible;
            return SolidShow({
              get when() {
                return visible();
              },
              get fallback() {
                const div = document.createElement("div");
                div.className = "fallback";
                div.textContent = "Loading...";
                return div;
              },
              get children() {
                const div = document.createElement("div");
                div.className = "content";
                div.textContent = "Loaded!";
                return div;
              },
            });
          }, container);

          for (let i = 0; i < 100; i++) {
            setVisible!(i % 2 === 0);
          }
          dispose();
        },
      },
    ],
  },
  {
    name: "DOM Updates",
    benchmarks: [
      {
        operation: "text update 1000x",
        iterations: 200,
        zest: () => {
          createScope((dispose) => {
            const container = document.createElement("div");
            const [count, setCount] = useState(0);
            const el = h("div", null, count);
            zestRender(el, container);

            for (let i = 0; i < 1000; i++) {
              setCount(i);
            }
            dispose();
          });
        },
        solid: () => {
          const container = document.createElement("div");
          let setCount: (v: number) => void;

          const dispose = solidRender(() => {
            const [count, _setCount] = createSignal(0);
            setCount = _setCount;
            const div = document.createElement("div");
            createEffect(() => {
              div.textContent = String(count());
            });
            return div;
          }, container);

          for (let i = 0; i < 1000; i++) {
            setCount!(i);
          }
          dispose();
        },
      },
      {
        operation: "class update 1000x",
        iterations: 200,
        zest: () => {
          createScope((dispose) => {
            const container = document.createElement("div");
            const [active, setActive] = useState(false);
            const el = h("div", {
              class: () => (active() ? "active" : "inactive"),
            });
            zestRender(el, container);

            for (let i = 0; i < 1000; i++) {
              setActive(i % 2 === 0);
            }
            dispose();
          });
        },
        solid: () => {
          const container = document.createElement("div");
          let setActive: (v: boolean) => void;

          const dispose = solidRender(() => {
            const [active, _setActive] = createSignal(false);
            setActive = _setActive;
            const div = document.createElement("div");
            createEffect(() => {
              div.className = active() ? "active" : "inactive";
            });
            return div;
          }, container);

          for (let i = 0; i < 1000; i++) {
            setActive!(i % 2 === 0);
          }
          dispose();
        },
      },
      {
        operation: "style update 1000x",
        iterations: 200,
        zest: () => {
          createScope((dispose) => {
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
            dispose();
          });
        },
        solid: () => {
          const container = document.createElement("div");
          let setWidth: (v: number) => void;

          const dispose = solidRender(() => {
            const [width, _setWidth] = createSignal(0);
            setWidth = _setWidth;
            const div = document.createElement("div");
            div.style.height = "100px";
            div.style.background = "blue";
            createEffect(() => {
              div.style.width = `${width()}px`;
            });
            return div;
          }, container);

          for (let i = 0; i < 1000; i++) {
            setWidth!(i % 500);
          }
          dispose();
        },
      },
      {
        operation: "multi-attr update 500x",
        iterations: 200,
        zest: () => {
          createScope((dispose) => {
            const container = document.createElement("div");
            const [state, setState] = useState({ x: 0, y: 0, scale: 1 });
            const el = h("div", {
              "data-x": () => String(state().x),
              "data-y": () => String(state().y),
              style: {
                transform: () =>
                  `translate(${state().x}px, ${state().y}px) scale(${state().scale})`,
              },
            });
            zestRender(el, container);

            for (let i = 0; i < 500; i++) {
              setState({ x: i, y: i * 2, scale: 1 + i * 0.01 });
            }
            dispose();
          });
        },
        solid: () => {
          const container = document.createElement("div");
          let setState: (v: { x: number; y: number; scale: number }) => void;

          const dispose = solidRender(() => {
            const [state, _setState] = createSignal({ x: 0, y: 0, scale: 1 });
            setState = _setState;
            const div = document.createElement("div");
            createEffect(() => {
              const s = state();
              div.dataset.x = String(s.x);
              div.dataset.y = String(s.y);
              div.style.transform = `translate(${s.x}px, ${s.y}px) scale(${s.scale})`;
            });
            return div;
          }, container);

          for (let i = 0; i < 500; i++) {
            setState!({ x: i, y: i * 2, scale: 1 + i * 0.01 });
          }
          dispose();
        },
      },
    ],
  },
];

// UI Elements
const runAllBtn = document.getElementById("run-all") as HTMLButtonElement;
const runSignalsBtn = document.getElementById("run-signals") as HTMLButtonElement;
const runDomBtn = document.getElementById("run-dom") as HTMLButtonElement;
const progressDiv = document.getElementById("progress") as HTMLDivElement;
const progressText = document.getElementById("progress-text") as HTMLDivElement;
const progressFill = document.getElementById("progress-fill") as HTMLDivElement;
const resultsDiv = document.getElementById("results") as HTMLDivElement;
const summaryDiv = document.getElementById("summary") as HTMLDivElement;
const zestWinsEl = document.getElementById("zest-wins") as HTMLDivElement;
const solidWinsEl = document.getElementById("solid-wins") as HTMLDivElement;
const tiesEl = document.getElementById("ties") as HTMLDivElement;

function setButtonsDisabled(disabled: boolean) {
  runAllBtn.disabled = disabled;
  runSignalsBtn.disabled = disabled;
  runDomBtn.disabled = disabled;
}

function updateProgress(current: number, total: number, text: string) {
  progressText.textContent = text;
  progressFill.style.width = `${(current / total) * 100}%`;
}

function renderResults(
  results: Map<string, { zest?: BenchmarkResult; solid?: BenchmarkResult }[]>
) {
  let html = "";

  for (const [suiteName, benchmarks] of results) {
    html += `<div class="suite">`;
    html += `<div class="suite-header">${suiteName}</div>`;
    html += `<div class="benchmark-row header">
      <div>Operation</div>
      <div>Zest</div>
      <div>Solid</div>
      <div>Winner</div>
    </div>`;

    for (const { zest, solid } of benchmarks) {
      const operation = zest?.operation || solid?.operation || "";
      const zestMs = zest ? (zest.avgMs < 0 ? "ERROR" : `${zest.avgMs.toFixed(3)} ms`) : "-";
      const solidMs = solid ? (solid.avgMs < 0 ? "ERROR" : `${solid.avgMs.toFixed(3)} ms`) : "-";

      let winner = "";
      let winnerClass = "";
      if (zest && solid) {
        const ratio = solid.avgMs / zest.avgMs;
        if (Math.abs(ratio - 1) < 0.05) {
          winner = "Tie";
          winnerClass = "tie";
        } else if (ratio > 1) {
          const pct = ((ratio - 1) * 100).toFixed(0);
          winner = `Zest +${pct}%`;
          winnerClass = "zest";
        } else {
          const pct = ((1 / ratio - 1) * 100).toFixed(0);
          winner = `Solid +${pct}%`;
          winnerClass = "solid";
        }
      }

      html += `<div class="benchmark-row">
        <div class="operation">${operation}</div>
        <div class="metric zest">${zestMs}</div>
        <div class="metric solid">${solidMs}</div>
        <div class="winner ${winnerClass}">${winner}</div>
      </div>`;
    }

    html += `</div>`;
  }

  resultsDiv.innerHTML = html;
}

function updateSummary(
  results: Map<string, { zest?: BenchmarkResult; solid?: BenchmarkResult }[]>
) {
  let zestWins = 0;
  let solidWins = 0;
  let ties = 0;

  for (const [, benchmarks] of results) {
    for (const { zest, solid } of benchmarks) {
      if (zest && solid) {
        const ratio = solid.avgMs / zest.avgMs;
        if (Math.abs(ratio - 1) < 0.05) {
          ties++;
        } else if (ratio > 1) {
          zestWins++;
        } else {
          solidWins++;
        }
      }
    }
  }

  zestWinsEl.textContent = String(zestWins);
  solidWinsEl.textContent = String(solidWins);
  tiesEl.textContent = String(ties);
  summaryDiv.style.display = "block";
}

async function runBenchmarks(suitesToRun: BenchmarkSuite[]) {
  setButtonsDisabled(true);
  progressDiv.style.display = "block";
  summaryDiv.style.display = "none";
  resultsDiv.innerHTML = "";

  const results = new Map<
    string,
    { zest?: BenchmarkResult; solid?: BenchmarkResult }[]
  >();

  let totalBenchmarks = 0;
  for (const suite of suitesToRun) {
    totalBenchmarks += suite.benchmarks.length * 2; // zest + solid
  }

  let completed = 0;

  for (const suite of suitesToRun) {
    const suiteResults: { zest?: BenchmarkResult; solid?: BenchmarkResult }[] =
      [];

    for (const bench of suite.benchmarks) {
      const pair: { zest?: BenchmarkResult; solid?: BenchmarkResult } = {};

      // Run zest
      updateProgress(
        completed,
        totalBenchmarks,
        `${suite.name}: ${bench.operation} (zest)`
      );
      await new Promise((r) => setTimeout(r, 10)); // Let UI update

      try {
        pair.zest = await benchmark(
          suite.name.toLowerCase().replace(/\//g, "-"),
          "zest",
          bench.operation,
          bench.zest,
          { iterations: bench.iterations }
        );
      } catch (e) {
        console.error(`Zest ${bench.operation} failed:`, e);
        // Show error in UI for debugging
        pair.zest = {
          name: "error",
          framework: "zest",
          operation: bench.operation,
          iterations: 0,
          totalMs: 0,
          avgMs: -1,
          minMs: 0,
          maxMs: 0,
          opsPerSecond: 0,
        };
      }
      completed++;

      // Run solid
      updateProgress(
        completed,
        totalBenchmarks,
        `${suite.name}: ${bench.operation} (solid)`
      );
      await new Promise((r) => setTimeout(r, 10)); // Let UI update

      try {
        pair.solid = await benchmark(
          suite.name.toLowerCase().replace(/\//g, "-"),
          "solid",
          bench.operation,
          bench.solid,
          { iterations: bench.iterations }
        );
      } catch (e) {
        console.error(`Solid ${bench.operation} failed:`, e);
      }
      completed++;

      suiteResults.push(pair);
      results.set(suite.name, suiteResults);
      renderResults(results);
    }
  }

  updateProgress(totalBenchmarks, totalBenchmarks, "Complete!");
  updateSummary(results);
  setButtonsDisabled(false);

  // Hide progress after a moment
  setTimeout(() => {
    progressDiv.style.display = "none";
  }, 1000);
}

// Event listeners
runAllBtn.addEventListener("click", () => runBenchmarks(suites));

runSignalsBtn.addEventListener("click", () =>
  runBenchmarks(suites.filter((s) => s.name === "Signals/Reactivity"))
);

runDomBtn.addEventListener("click", () =>
  runBenchmarks(
    suites.filter((s) =>
      ["Element Creation", "List Rendering", "Conditional Rendering", "DOM Updates"].includes(
        s.name
      )
    )
  )
);

console.log("Benchmark ready. Click a button to start.");
