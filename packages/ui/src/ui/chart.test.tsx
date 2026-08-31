import { describe, expect, test } from "bun:test";
import { render } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import {
  ChartBars,
  ChartContainer,
  ChartLegend,
  ChartLines,
  ChartTooltipContent,
  type ChartConfig,
} from "./chart.tsx";

const CONFIG: ChartConfig = [
  { key: "desktop", label: "Desktop", color: "var(--chart-1)" },
  { key: "mobile", label: "Mobile", color: "var(--chart-2)" },
];

const DATA = [
  { month: "Jan", desktop: 100, mobile: 50 },
  { month: "Feb", desktop: 200, mobile: 150 },
];

describe("Chart", () => {
  test("a series becomes a custom property, which is how a theme reaches it", () => {
    render(() => (
      <ChartContainer config={CONFIG}>
        <ChartBars data={DATA} x="month" />
      </ChartContainer>
    ));
    const container = document.querySelector('[data-slot="chart"]') as HTMLElement;
    // Handing each mark a colour would work and would put the theme inside the
    // chart. One property per series is what lets the ramp change underneath it.
    expect(container.style.getPropertyValue("--color-desktop")).toBe("var(--chart-1)");
    expect(container.style.getPropertyValue("--color-mobile")).toBe("var(--chart-2)");
  });

  test("every mark reads --color-series rather than a colour of its own", () => {
    render(() => (
      <ChartContainer config={CONFIG}>
        <ChartBars data={DATA} x="month" />
      </ChartContainer>
    ));
    const groups = [...document.querySelectorAll<SVGElement>('[data-slot="chart-bar"]')];
    expect(groups).toHaveLength(2);
    expect(groups[0]?.style.getPropertyValue("--color-series")).toBe("var(--color-desktop)");
    const rect = groups[0]?.querySelector("rect");
    expect(rulesFor([...(rect?.classList ?? [])].join(" "))).toContain("fill: var(--color-series)");
  });

  test("a bar per datum per series, and the tallest fills the plot", () => {
    render(() => (
      <ChartContainer config={CONFIG}>
        <ChartBars data={DATA} x="month" height={160} />
      </ChartContainer>
    ));
    const rects = [...document.querySelectorAll("rect")];
    expect(rects).toHaveLength(4);
    // 160 tall, 24 of padding each end, so the plot is 112 and the maximum
    // value gets all of it. A bar taller than the plot means the scale is off.
    const heights = rects.map((r) => Number(r.getAttribute("height")));
    expect(Math.max(...heights)).toBeCloseTo(112, 0);
    for (const height of heights) expect(height).toBeLessThanOrEqual(112);
  });

  test("a column with no value sits on the axis rather than throwing", () => {
    render(() => (
      <ChartContainer config={CONFIG}>
        <ChartBars data={[{ month: "Jan" }]} x="month" />
      </ChartContainer>
    ));
    const rects = [...document.querySelectorAll("rect")];
    expect(rects.every((r) => Number(r.getAttribute("height")) === 0)).toBe(true);
  });

  test("all-zero data does not divide by zero", () => {
    // The maximum is clamped to 1, or every mark lands at NaN and disappears.
    render(() => (
      <ChartContainer config={CONFIG}>
        <ChartBars data={[{ month: "Jan", desktop: 0, mobile: 0 }]} x="month" />
      </ChartContainer>
    ));
    for (const rect of document.querySelectorAll("rect")) {
      expect(Number.isNaN(Number(rect.getAttribute("y")))).toBe(false);
    }
  });

  test("a line is one path per series, and the area closes back to the axis", () => {
    render(() => (
      <ChartContainer config={CONFIG}>
        <ChartLines data={DATA} x="month" area />
      </ChartContainer>
    ));
    const lines = [...document.querySelectorAll('[data-slot="chart-line"] path')];
    const areas = [...document.querySelectorAll('[data-slot="chart-area"] path')];
    expect(lines).toHaveLength(2);
    expect(areas).toHaveLength(2);
    expect(lines[0]?.getAttribute("d")?.startsWith("M")).toBe(true);
    // A closed path, or the fill spills to the shape's own bounding box.
    expect(areas[0]?.getAttribute("d")?.endsWith("Z")).toBe(true);
    expect(lines[0]?.getAttribute("d")?.endsWith("Z")).toBe(false);
  });

  test("the drawing names itself, which is all a screen reader gets from SVG", () => {
    render(() => (
      <ChartContainer config={CONFIG}>
        <ChartBars data={DATA} x="month" aria-label="Revenue by month" />
      </ChartContainer>
    ));
    const svg = document.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe("Revenue by month");
  });

  test("the legend names every series and swatches it", () => {
    render(() => (
      <ChartContainer config={CONFIG}>
        <ChartLegend />
      </ChartContainer>
    ));
    const items = [...document.querySelectorAll('[data-slot="chart-legend-item"]')];
    expect(items.map((i) => i.textContent?.trim())).toEqual(["Desktop", "Mobile"]);
    const swatch = items[0]?.querySelector<HTMLElement>('[data-slot="chart-legend-swatch"]');
    expect(swatch?.style.background).toBe("var(--color-desktop)");
  });

  test("a tooltip row is an indicator, a name and a value", () => {
    render(() => (
      <ChartTooltipContent
        label="March"
        items={[{ key: "desktop", label: "Desktop", value: "1,204" }]}
      />
    ));
    const row = document.querySelector('[data-slot="chart-tooltip-row"]');
    expect(row?.textContent).toContain("Desktop");
    expect(row?.textContent).toContain("1,204");
    const dot = row?.querySelector<HTMLElement>('[data-slot="chart-tooltip-indicator"]');
    expect(dot?.style.background).toBe("var(--color-desktop)");
  });

  test("a plot outside a container says what is wrong", () => {
    expect(() => render(() => <ChartBars data={DATA} x="month" />)).toThrow(
      "inside a <ChartContainer>",
    );
  });
});
