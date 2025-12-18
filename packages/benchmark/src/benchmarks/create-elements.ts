/**
 * Benchmark: Element Creation
 * Compares raw element creation speed
 */

import type { BenchmarkResult } from "../types.ts";
import { benchmark, generateItems } from "../utils.ts";

// Barq imports
import { createElement as barqCreate } from "@barqjs/core";

// SolidJS imports - we'll use the raw h function equivalent
import { createComponent, mergeProps } from "solid-js";
import { insert, createComponent as solidCreateComponent, template } from "solid-js/web";

export async function runCreateElementBenchmarks(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  // Simple div creation
  results.push(
    await benchmark("create-elements", "barq", "create div (simple)", () => {
      barqCreate("div", { class: "test" }, "Hello");
    }),
  );

  results.push(
    await benchmark("create-elements", "solid", "create div (simple)", () => {
      const t = template("<div class=test>Hello</div>");
      t();
    }),
  );

  // Nested structure
  results.push(
    await benchmark("create-elements", "barq", "create nested (3 levels)", () => {
      barqCreate(
        "div",
        { class: "container" },
        barqCreate("div", { class: "row" }, barqCreate("span", { class: "cell" }, "Content")),
      );
    }),
  );

  results.push(
    await benchmark("create-elements", "solid", "create nested (3 levels)", () => {
      const t = template(
        "<div class=container><div class=row><span class=cell>Content</span></div></div>",
      );
      t();
    }),
  );

  // Create 100 elements
  results.push(
    await benchmark(
      "create-elements",
      "barq",
      "create 100 divs",
      () => {
        for (let i = 0; i < 100; i++) {
          barqCreate("div", { class: "item", "data-id": String(i) }, `Item ${i}`);
        }
      },
      { iterations: 500 },
    ),
  );

  results.push(
    await benchmark(
      "create-elements",
      "solid",
      "create 100 divs",
      () => {
        const t = template("<div class=item></div>");
        for (let i = 0; i < 100; i++) {
          const el = t() as HTMLElement;
          el.dataset.id = String(i);
          el.textContent = `Item ${i}`;
        }
      },
      { iterations: 500 },
    ),
  );

  // Complex element with many attributes
  results.push(
    await benchmark("create-elements", "barq", "create with 10 attrs", () => {
      barqCreate("div", {
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

  results.push(
    await benchmark("create-elements", "solid", "create with 10 attrs", () => {
      const t = template(
        "<div id=test class='foo bar baz' data-a=1 data-b=2 data-c=3 data-d=4 data-e=5 title=tooltip tabindex=0 role=button></div>",
      );
      t();
    }),
  );

  return results;
}
