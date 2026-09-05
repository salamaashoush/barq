import { describe, expect, test } from "bun:test";
import { render } from "@barqjs/testing";

import {
  AXIS_FONT_SIZE,
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

const svg = (root: ParentNode): SVGSVGElement => {
  const found = root.querySelector<SVGSVGElement>("svg");
  if (found === null) throw new Error("no chart was drawn");
  return found;
};

describe("Chart", () => {
  test("a series becomes a custom property, which is how a theme reaches it", () => {
    const { container } = render(() => (
      <ChartContainer config={CONFIG}>
        <ChartBars data={DATA} x="month" />
      </ChartContainer>
    ));
    const box = container.querySelector('[data-slot="chart"]') as HTMLElement;
    // Handing each mark a colour would work and would put the theme inside the
    // chart. One property per series is what lets the ramp change underneath it.
    expect(box.style.getPropertyValue("--color-desktop")).toBe("var(--chart-1)");
    expect(box.style.getPropertyValue("--color-mobile")).toBe("var(--chart-2)");
  });

  // The library's own palette is what a mark that names no series paints with,
  // so a chart written against `--ts-chart-N` gets this theme's ramp too.
  test("the same colours are published under the library's palette names", () => {
    const { container } = render(() => (
      <ChartContainer config={CONFIG}>
        <ChartBars data={DATA} x="month" />
      </ChartContainer>
    ));
    const box = container.querySelector('[data-slot="chart"]') as HTMLElement;
    expect(box.style.getPropertyValue("--ts-chart-1")).toBe("var(--chart-1)");
    expect(box.style.getPropertyValue("--ts-chart-2")).toBe("var(--chart-2)");
  });

  test("every mark reads --color-<series> rather than a colour of its own", () => {
    const { container } = render(() => (
      <ChartContainer config={CONFIG}>
        <ChartBars data={DATA} x="month" />
      </ChartContainer>
    ));
    const fills = [...container.querySelectorAll("rect")].map((r) => r.getAttribute("fill"));
    // A colour scale of NAMES, not colours: `var()` resolves in a presentation
    // attribute, so the ramp changes under a scene nobody rebuilt.
    expect(new Set(fills)).toEqual(new Set(["var(--color-desktop)", "var(--color-mobile)"]));
  });

  test("a bar per datum per series, side by side rather than stacked", () => {
    const { container } = render(() => (
      <ChartContainer config={CONFIG}>
        <ChartBars data={DATA} x="month" height={160} />
      </ChartContainer>
    ));
    const rects = [...container.querySelectorAll("rect")];
    expect(rects).toHaveLength(4);
    // Repeated positions STACK by default in this grammar. Grouped is the
    // explicit opt-in, and without it two series share one column and the
    // second is drawn on top of the first at the same x.
    const columns = new Set(rects.map((r) => r.getAttribute("x")));
    expect(columns.size).toBe(4);
  });

  test("the taller value draws the taller bar", () => {
    const { container } = render(() => (
      <ChartContainer config={CONFIG}>
        <ChartBars data={DATA} x="month" height={160} />
      </ChartContainer>
    ));
    const heights = [...container.querySelectorAll("rect")].map((r) =>
      Number(r.getAttribute("height")),
    );
    expect(Math.max(...heights)).toBeGreaterThan(Math.min(...heights));
    for (const height of heights) expect(Number.isFinite(height)).toBe(true);
  });

  test("a column with no value draws nothing rather than throwing", () => {
    const { container } = render(() => (
      <ChartContainer config={CONFIG}>
        <ChartBars data={[{ month: "Jan" }]} x="month" />
      </ChartContainer>
    ));
    const heights = [...container.querySelectorAll("rect")].map((r) =>
      Number(r.getAttribute("height")),
    );
    expect(heights.every((height) => height === 0)).toBe(true);
  });

  test("all-zero data does not divide by zero", () => {
    const { container } = render(() => (
      <ChartContainer config={CONFIG}>
        <ChartBars data={[{ month: "Jan", desktop: 0, mobile: 0 }]} x="month" />
      </ChartContainer>
    ));
    for (const rect of container.querySelectorAll("rect")) {
      expect(Number.isNaN(Number(rect.getAttribute("y")))).toBe(false);
    }
  });

  test("a line is one path per series, and the area is filled under it", () => {
    const { container } = render(() => (
      <ChartContainer config={CONFIG}>
        <ChartLines data={DATA} x="month" area />
      </ChartContainer>
    ));
    const paths = [...container.querySelectorAll("path")];
    // Two areas and two lines: an area mark and a line mark per series.
    expect(paths.length).toBeGreaterThanOrEqual(4);
    const filled = paths.filter((p) => (p.getAttribute("fill") ?? "none") !== "none");
    const stroked = paths.filter((p) => (p.getAttribute("stroke") ?? "none") !== "none");
    expect(filled).toHaveLength(2);
    expect(stroked).toHaveLength(2);
    expect(paths[0]?.getAttribute("d")?.startsWith("M")).toBe(true);
  });

  test("a line without `area` fills nothing", () => {
    const { container } = render(() => (
      <ChartContainer config={CONFIG}>
        <ChartLines data={DATA} x="month" />
      </ChartContainer>
    ));
    const filled = [...container.querySelectorAll("path")].filter(
      (p) => (p.getAttribute("fill") ?? "none") !== "none",
    );
    expect(filled).toHaveLength(0);
  });

  test("the drawing names itself, which is all a screen reader gets from SVG", () => {
    const { container } = render(() => (
      <ChartContainer config={CONFIG}>
        <ChartBars data={DATA} x="month" aria-label="Revenue by month" />
      </ChartContainer>
    ));
    expect(svg(container).getAttribute("role")).toBe("img");
    expect(svg(container).getAttribute("aria-label")).toBe("Revenue by month");
  });

  /**
   * The markup exists before any script runs.
   *
   * The host is a browser object and mounting is a browser event, so a chart
   * that only drew on mount would leave a hole the size of the plot in every
   * server-rendered page. The adapter's `prerender` is what fills it, and the
   * same bytes are what the client adopts.
   */
  test("the scene is in the markup rather than waiting for a mount", () => {
    const { container } = render(() => (
      <ChartContainer config={CONFIG}>
        <ChartBars data={DATA} x="month" aria-label="Visitors" />
      </ChartContainer>
    ));
    expect(container.querySelectorAll("rect").length).toBe(4);
  });

  test("the axis draws its labels at the size this package asks for", () => {
    const { container } = render(() => (
      <ChartContainer config={CONFIG}>
        <ChartBars data={DATA} x="month" aria-label="Visitors" />
      </ChartContainer>
    ));
    const labels = [...container.querySelectorAll("text")];
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label.getAttribute("font-size")).toBe(String(AXIS_FONT_SIZE));
    }
  });

  test("the grid and the tick labels are this package's own tokens", () => {
    const { container } = render(() => (
      <ChartContainer config={CONFIG}>
        <ChartBars data={DATA} x="month" />
      </ChartContainer>
    ));
    const grid = container.querySelector('[data-ts-key="grid"]');
    expect(grid?.getAttribute("stroke")).toBe("var(--border)");
    expect(container.querySelector("text")?.getAttribute("fill")).toBe("var(--muted-foreground)");
  });

  test("the legend names every series and swatches it", () => {
    const { container } = render(() => (
      <ChartContainer config={CONFIG}>
        <ChartLegend />
      </ChartContainer>
    ));
    const items = [...container.querySelectorAll('[data-slot="chart-legend-item"]')];
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
