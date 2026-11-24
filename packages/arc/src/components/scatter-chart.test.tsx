import { describe, expect, test } from "bun:test";
import { type Child, flush } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, tick, user } from "@barqjs/testing";

import { hydrates, wears } from "../test-arc.ts";
import { ScatterChart, scatterChartStyles } from "./scatter-chart.tsx";

const DATA = [
  { route: "/a", method: "GET", duration: 12, bytes: 300, count: 4 },
  { route: "/b", method: "POST", duration: 40, bytes: 900, count: 16 },
  { route: "/c", method: "GET", duration: 25, bytes: 100, count: 1 },
];

const SERIES = [
  { key: "GET", label: "GET" },
  { key: "POST", label: "POST", tone: "warning" as const },
];

async function drawn(): Promise<SVGSVGElement> {
  await tick();
  flush();
  return document.querySelector('[data-slot="scatter-chart"] svg') as SVGSVGElement;
}

const circles = (svg: SVGSVGElement): SVGCircleElement[] => [...svg.querySelectorAll("circle")];

describe("ScatterChart", () => {
  test("draws a point per record in its series' colour", async () => {
    render(() => (
      <ScatterChart
        label="Requests"
        data={DATA}
        x="duration"
        y="bytes"
        group="method"
        series={SERIES}
      />
    ));
    const svg = await drawn();
    const fills = circles(svg).map((circle) => circle.getAttribute("fill"));
    expect(fills.filter((fill) => fill === "var(--color-GET)").length).toBe(2);
    expect(fills.filter((fill) => fill === "var(--color-POST)").length).toBe(1);
    const chart = document.querySelector('[data-slot="chart"]') as HTMLElement;
    expect(chart.style.getPropertyValue("--color-POST")).toBe("var(--warning)");
    expect(document.querySelector('[data-slot="chart-legend"]')).not.toBeNull();
  });

  test("a bubble's area follows its value", async () => {
    render(() => <ScatterChart label="Requests" data={DATA} x="duration" y="bytes" size="count" />);
    const svg = await drawn();
    const radii = circles(svg)
      .map((circle) => Number(circle.getAttribute("r")))
      .filter((radius) => radius > 0);
    const [small, large] = [Math.min(...radii.slice(0, 3)), Math.max(...radii.slice(0, 3))];
    expect(large).toBe(18);
    expect(small).toBeCloseTo(3 + 15 * Math.sqrt(1 / 16), 1);
    expect(document.querySelector('[data-slot="chart-legend"]')).toBeNull();
  });

  test("its numbers are a table, a row per point", async () => {
    render(() => (
      <ScatterChart
        label="Requests"
        data={DATA}
        x="duration"
        y="bytes"
        size="count"
        name="route"
        xLabel="Duration"
      />
    ));
    await drawn();
    const table = screen.getByRole("table", { name: "Requests" });
    expect([...table.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual([
      "Category",
      "Duration",
      "bytes",
      "count",
    ]);
    expect(table.querySelector("tbody tr")?.textContent).toBe("/a123004");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the arrow keys walk the points and the tooltip reads each one's measures", async () => {
    render(() => <ScatterChart label="Requests" data={DATA} x="duration" y="bytes" name="route" />);
    const svg = await drawn();
    svg.focus();
    flush();
    const label = () => document.querySelector('[data-slot="chart-tooltip-label"]')?.textContent;
    const rows = () =>
      [...document.querySelectorAll('[data-slot="chart-tooltip-row"]')].map(
        (row) => row.textContent,
      );
    expect(label()).toBe("/a");
    expect(rows()).toEqual(["duration12", "bytes300"]);
    user.keyDown("ArrowRight", { target: svg });
    flush();
    expect(label()).toBe("/c");
  });

  test("writes its numbers in the reader's locale, right to left", async () => {
    function Arabic(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <ScatterChart label="الطلبات" data={DATA} x="duration" y="bytes" />
      </Arabic>
    ));
    await drawn();
    expect(document.querySelector('[data-slot="chart-table-cell"]')?.textContent).toBe("١٢");
  });

  test("takes a class per part and a slot on every part", async () => {
    render(() => (
      <ScatterChart
        label="Requests"
        data={DATA}
        x="duration"
        y="bytes"
        class="mine"
        table="toggle"
        classes={{ root: "r", chart: "c", plot: "p", toggle: "t", table: "b", caption: "a" }}
      />
    ));
    await drawn();
    const pairs: [string, string][] = [
      ["scatter-chart", "r"],
      ["chart", "c"],
      ["scatter-chart-plot", "p"],
      ["scatter-chart-toggle", "t"],
      ["chart-table", "b"],
      ["chart-table-caption", "a"],
    ];
    for (const [slot, name] of pairs) {
      expect(document.querySelector(`[data-slot="${slot}"]`)?.classList.contains(name)).toBe(true);
    }
    const root = document.querySelector('[data-slot="scatter-chart"]');
    expect(root?.classList.contains("mine")).toBe(true);
    expect(wears(root, scatterChartStyles().root)).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { ScatterChart } from "<arc>";
      export function Page() {
        return (
          <ScatterChart
            label="Requests"
            data={[{ a: 1, b: 2, c: 3 }, { a: 2, b: 1, c: 1 }]}
            x="a"
            y="b"
            size="c"
          />
        );
      }
    `);
    expect(result.container.querySelectorAll("circle").length).toBeGreaterThan(1);
    result.unmount();
  });
});
