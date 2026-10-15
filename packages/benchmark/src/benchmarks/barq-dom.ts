/**
 * Benchmark: Barq DOM Performance
 * Measures barq-specific DOM operations (no solid comparison needed)
 */

import type { BenchmarkResult } from "../types.ts";
import { benchmark, generateItems } from "../utils.ts";

import {
  type Child,
  type Component,
  render,
  createMemo,
  createSignal,
  flush,
} from "@barqjs/core";
import { For, Show, h } from "../h.ts";

type Item = { id: number; name: string; value: number };

export async function runBarqDOMBenchmarks(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // Simple element creation
  results.push(
    await benchmark("barq-dom", "barq", "create div (simple)", () => {
      h("div", { class: "test" }, "Hello");
    }),
  );

  // Nested structure (3 levels)
  results.push(
    await benchmark("barq-dom", "barq", "create nested (3 levels)", () => {
      h(
        "div",
        { class: "container" },
        h("div", { class: "row" }, h("span", { class: "cell" }, "Content")),
      );
    }),
  );

  // Deep nesting (10 levels)
  results.push(
    await benchmark("barq-dom", "barq", "create nested (10 levels)", () => {
      let el = h("span", null, "deep");
      for (let i = 0; i < 10; i++) {
        el = h("div", { class: `level-${i}` }, el);
      }
    }),
  );

  // Create 100 elements
  results.push(
    await benchmark(
      "barq-dom",
      "barq",
      "create 100 divs",
      () => {
        for (let i = 0; i < 100; i++) {
          h("div", { class: "item", "data-id": String(i) }, `Item ${i}`);
        }
      },
      { iterations: 500 },
    ),
  );

  // Create 1000 elements
  results.push(
    await benchmark(
      "barq-dom",
      "barq",
      "create 1000 divs",
      () => {
        for (let i = 0; i < 1000; i++) {
          h("div", { class: "item", "data-id": String(i) }, `Item ${i}`);
        }
      },
      { iterations: 100 },
    ),
  );

  // Element with many attributes
  results.push(
    await benchmark("barq-dom", "barq", "create with 10 attrs", () => {
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
    }),
  );

  // Render and mount
  results.push(
    await benchmark(
      "barq-dom",
      "barq",
      "render + mount",
      () => {
        const container = document.createElement("div");
        const el = h("div", { class: "app" }, h("span", null, "Hello"));
        render(el, container);
      },
      { iterations: 500 },
    ),
  );

  // Render with reactive text
  results.push(
    await benchmark(
      "barq-dom",
      "barq",
      "reactive text (1000 updates)",
      () => {
        const container = document.createElement("div");
        const [count, setCount] = createSignal(0);
        const el = h("div", null, count);
        render(el, container);
        for (let i = 0; i < 1000; i++) {
          setCount(i);
          flush();
        }
      },
      { iterations: 100 },
    ),
  );

  // Render with reactive class
  results.push(
    await benchmark(
      "barq-dom",
      "barq",
      "reactive class (1000 updates)",
      () => {
        const container = document.createElement("div");
        const [active, setActive] = createSignal(false);
        const el = h("div", { class: () => (active() ? "active" : "inactive") });
        render(el, container);
        for (let i = 0; i < 1000; i++) {
          setActive(i % 2 === 0);
          flush();
        }
      },
      { iterations: 100 },
    ),
  );

  // Render with reactive style
  results.push(
    await benchmark(
      "barq-dom",
      "barq",
      "reactive style (1000 updates)",
      () => {
        const container = document.createElement("div");
        const [width, setWidth] = createSignal(0);
        const el = h("div", {
          style: {
            width: () => `${width()}px`,
            height: "100px",
          },
        });
        render(el, container);
        for (let i = 0; i < 1000; i++) {
          setWidth(i);
          flush();
        }
      },
      { iterations: 100 },
    ),
  );

  // Show component toggle
  results.push(
    await benchmark(
      "barq-dom",
      "barq",
      "Show toggle (100 times)",
      () => {
        const container = document.createElement("div");
        const [visible, setVisible] = createSignal(true);
        const el = Show(visible, () => h("div", { class: "content" }, "Visible"));
        render(el, container);
        for (let i = 0; i < 100; i++) {
          setVisible(i % 2 === 0);
          flush();
        }
      },
      { iterations: 200 },
    ),
  );

  // Show with fallback
  results.push(
    await benchmark(
      "barq-dom",
      "barq",
      "Show with fallback (100 times)",
      () => {
        const container = document.createElement("div");
        const [visible, setVisible] = createSignal(true);
        const el = Show(
          visible,
          () => h("div", null, "Loaded!"),
          () => h("div", null, "Loading..."),
        );
        render(el, container);
        for (let i = 0; i < 100; i++) {
          setVisible(i % 2 === 0);
          flush();
        }
      },
      { iterations: 200 },
    ),
  );

  // For component render
  const items100 = generateItems(100);
  results.push(
    await benchmark(
      "barq-dom",
      "barq",
      "For render (100 items)",
      () => {
        const container = document.createElement("div");
        const [items] = createSignal(items100);
        const el = For(items, (item: Item) =>
          h("div", { "data-id": String(item.id) }, item.name),
        );
        render(el, container);
      },
      { iterations: 200 },
    ),
  );

  const items1000 = generateItems(1000);
  results.push(
    await benchmark(
      "barq-dom",
      "barq",
      "For render (1000 items)",
      () => {
        const container = document.createElement("div");
        const [items] = createSignal(items1000);
        const el = For(items, (item: Item) =>
          h("div", { "data-id": String(item.id) }, item.name),
        );
        render(el, container);
      },
      { iterations: 50 },
    ),
  );

  // Component render
  // C1: a component takes its props as Cells and nothing else. The benchmark
  // calls it the way compiled code calls it, because there is no other way.
  function Card(props: { title: () => string; children: () => Child }): Node {
    return h(
      "div",
      { class: "card" },
      h("h2", { class: "card-title" }, props.title()),
      h("div", { class: "card-body" }, props.children()),
    );
  }

  results.push(
    await benchmark(
      "barq-dom",
      "barq",
      "component render (100 cards)",
      () => {
        const container = document.createElement("div");
        const cards = [];
        for (let i = 0; i < 100; i++) {
          cards.push(Card({ title: () => `Card ${i}`, children: () => `Content ${i}` }));
        }
        const el = h("div", null, ...cards);
        render(el, container);
      },
      { iterations: 100 },
    ),
  );

  return results;
}
