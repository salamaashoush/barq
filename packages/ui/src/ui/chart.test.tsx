import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, tick, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";
import {
  AXIS_FONT_SIZE,
  ChartBars,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartLines,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
  type ChartConfigRecord,
  type ChartPayloadItem,
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

function Globe() {
  return <svg data-testid="globe" aria-hidden="true" />;
}

const KEYED: ChartConfigRecord = {
  desktop: { label: "Desktop", color: "var(--chart-1)" },
  mobile: { label: "Mobile", color: "var(--chart-2)" },
};

const THEMED: ChartConfigRecord = {
  desktop: { label: "Desktop", theme: { light: "#2563eb", dark: "#60a5fa" } },
  mobile: { label: "Mobile", color: "var(--chart-2)", icon: Globe },
};

const chartOf = (root: ParentNode): HTMLElement =>
  root.querySelector('[data-slot="chart"]') as HTMLElement;

describe("ChartConfig", () => {
  test("shadcn's keyed shape is taken as readily as the list", () => {
    const { container } = render(() => (
      <ChartContainer config={KEYED}>
        <ChartBars data={DATA} x="month" />
        <ChartLegend />
      </ChartContainer>
    ));
    const box = chartOf(container);
    expect(box.style.getPropertyValue("--color-desktop")).toBe("var(--chart-1)");
    expect(box.style.getPropertyValue("--color-mobile")).toBe("var(--chart-2)");
    expect(container.querySelectorAll("rect")).toHaveLength(4);
    const items = [...container.querySelectorAll('[data-slot="chart-legend-item"]')];
    expect(items.map((item) => item.textContent?.trim())).toEqual(["Desktop", "Mobile"]);
  });

  test("a colour per theme is a rule per theme, because an inline style cannot change with one", () => {
    const { container } = render(() => (
      <ChartContainer config={THEMED} id="visitors">
        <ChartBars data={DATA} x="month" />
      </ChartContainer>
    ));
    const box = chartOf(container);
    expect(box.getAttribute("data-chart")).toBe("chart-visitors");
    const sheet = box.querySelector("style")?.textContent ?? "";
    expect(sheet).toContain("[data-chart=chart-visitors] {");
    expect(sheet).toContain("--color-desktop: #2563eb;");
    expect(sheet).toContain(".dark [data-chart=chart-visitors] {");
    expect(sheet).toContain("--color-desktop: #60a5fa;");
    // The themed series is left to the rule; an inline value would beat both.
    expect(box.style.getPropertyValue("--color-desktop")).toBe("");
    expect(box.style.getPropertyValue("--color-mobile")).toBe("var(--chart-2)");
    // The library's palette follows the series through the same name.
    expect(box.style.getPropertyValue("--ts-chart-1")).toBe("var(--color-desktop)");
  });

  test("every chart has a name of its own for those rules, given or not", () => {
    const { container } = render(() => (
      <div>
        <ChartContainer config={THEMED}>
          <ChartLegend />
        </ChartContainer>
        <ChartContainer config={THEMED}>
          <ChartLegend />
        </ChartContainer>
      </div>
    ));
    const names = [...container.querySelectorAll("[data-chart]")].map((box) =>
      box.getAttribute("data-chart"),
    );
    expect(names).toHaveLength(2);
    expect(names[0]).toMatch(/^chart-[\w-]+$/);
    expect(names[0]).not.toBe(names[1]);
  });

  test("ChartStyle writes both themes, and nothing at all for a config without colours", () => {
    const { container } = render(() => (
      <div>
        <ChartStyle id="chart-a" config={THEMED} />
        <ChartStyle id="chart-b" config={{ visitors: { label: "Visitors" } }} />
      </div>
    ));
    const sheets = [...container.querySelectorAll("style")];
    expect(sheets).toHaveLength(1);
    const text = sheets[0]?.textContent ?? "";
    expect(text).toContain("[data-chart=chart-a] {");
    expect(text).toContain("--color-mobile: var(--chart-2);");
    expect(text).toContain(".dark [data-chart=chart-a] {");
  });
});

describe("ChartLegendContent", () => {
  test("a series with an icon shows it instead of the swatch", () => {
    const { container } = render(() => (
      <ChartContainer config={THEMED}>
        <ChartLegend />
      </ChartContainer>
    ));
    const [desktop, mobile] = [...container.querySelectorAll('[data-slot="chart-legend-item"]')];
    expect(desktop?.querySelector('[data-slot="chart-legend-swatch"]')).not.toBeNull();
    expect(mobile?.querySelector('[data-testid="globe"]')).not.toBeNull();
    expect(mobile?.querySelector('[data-slot="chart-legend-swatch"]')).toBeNull();
  });

  test("hideIcon goes back to the swatch", () => {
    const { container } = render(() => (
      <ChartContainer config={THEMED}>
        <ChartLegend content={<ChartLegendContent hideIcon />} />
      </ChartContainer>
    ));
    expect(container.querySelector('[data-testid="globe"]')).toBeNull();
    expect(container.querySelectorAll('[data-slot="chart-legend-swatch"]')).toHaveLength(2);
  });

  test("it goes above the plot when asked, with the gap on the other side", () => {
    const { container } = render(() => (
      <ChartContainer config={KEYED}>
        <ChartLegend verticalAlign="top" />
      </ChartContainer>
    ));
    const legend = container.querySelector('[data-slot="chart-legend"]') as HTMLElement;
    expect(legend.getAttribute("data-align")).toBe("top");
    const rules = rulesFor(legend.className);
    expect(rules).toMatch(/\[data-align="top"\]\{order: -1\}/);
    expect(rules).toMatch(/\[data-align="top"\]\{padding-bottom: calc\(var\(--spacing\) \* 3\)\}/);
  });

  test("a payload of categories is named through nameKey", () => {
    const browsers: ChartConfigRecord = {
      chrome: { label: "Chrome", color: "var(--chart-1)" },
      safari: { label: "Safari", color: "var(--chart-2)" },
    };
    const payload: ChartPayloadItem[] = [
      { value: "chrome", color: "var(--color-chrome)", payload: { browser: "chrome" } },
      { value: "safari", color: "var(--color-safari)", payload: { browser: "safari" } },
    ];
    const { container } = render(() => (
      <ChartContainer config={browsers}>
        <ChartLegendContent nameKey="browser" payload={payload} />
      </ChartContainer>
    ));
    const items = [...container.querySelectorAll('[data-slot="chart-legend-item"]')];
    expect(items.map((item) => item.textContent?.trim())).toEqual(["Chrome", "Safari"]);
    const swatch = items[1]?.querySelector<HTMLElement>('[data-slot="chart-legend-swatch"]');
    expect(swatch?.style.background).toBe("var(--color-safari)");
  });

  test("a legend with no entries is not rendered", () => {
    const { container } = render(() => (
      <ChartContainer config={KEYED}>
        <ChartLegendContent payload={[]} />
      </ChartContainer>
    ));
    expect(container.querySelector('[data-slot="chart-legend"]')).toBeNull();
  });
});

describe("ChartTooltipContent", () => {
  const PAYLOAD: ChartPayloadItem[] = [
    {
      dataKey: "desktop",
      name: "desktop",
      value: 1204,
      color: "var(--color-desktop)",
      payload: { month: "March", desktop: 1204, mobile: 80, browser: "chrome" },
    },
    {
      dataKey: "mobile",
      name: "mobile",
      value: 80,
      color: "var(--color-mobile)",
      payload: { month: "March", desktop: 1204, mobile: 80, browser: "chrome" },
    },
  ];

  const tip = (): HTMLElement | null => document.querySelector('[data-slot="chart-tooltip"]');
  const rows = (): HTMLElement[] => [
    ...document.querySelectorAll<HTMLElement>('[data-slot="chart-tooltip-row"]'),
  ];

  test("a payload is named from the config and its numbers are written for a reader", () => {
    render(() => (
      <ChartContainer config={KEYED}>
        <ChartTooltipContent active label="March" payload={PAYLOAD} />
      </ChartContainer>
    ));
    expect(tip()?.querySelector('[data-slot="chart-tooltip-label"]')?.textContent).toBe("March");
    expect(rows().map((row) => row.textContent)).toEqual(["Desktop1,204", "Mobile80"]);
    const dot = rows()[0]?.querySelector<HTMLElement>('[data-slot="chart-tooltip-indicator"]');
    expect(dot?.getAttribute("data-indicator")).toBe("dot");
    expect(dot?.style.background).toBe("var(--color-desktop)");
  });

  test("inactive, or with nothing to say, it is not there", () => {
    render(() => (
      <ChartContainer config={KEYED}>
        <ChartTooltipContent active={false} payload={PAYLOAD} />
        <ChartTooltipContent active payload={[]} />
      </ChartContainer>
    ));
    expect(tip()).toBeNull();
  });

  test("the indicator is a dot, a line or a dashed rule", () => {
    render(() => (
      <ChartContainer config={KEYED}>
        <ChartTooltipContent active indicator="line" payload={PAYLOAD} />
        <ChartTooltipContent active indicator="dashed" payload={PAYLOAD} />
      </ChartContainer>
    ));
    const marks = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="chart-tooltip-indicator"]'),
    ];
    expect(marks[0]?.getAttribute("data-indicator")).toBe("line");
    expect(rulesFor(marks[0]?.className ?? "")).toMatch(/\[data-indicator="line"\]\{width: 4px\}/);
    expect(marks[2]?.getAttribute("data-indicator")).toBe("dashed");
    const dashed = rulesFor(marks[2]?.className ?? "");
    expect(dashed).toMatch(/\[data-indicator="dashed"\]\{border-top-style: dashed\}/);
    // Drawn with its border, so the colour goes there rather than behind it.
    expect(marks[2]?.style.borderColor).toBe("var(--color-desktop)");
    expect(marks[2]?.style.background).toBe("");
  });

  test("hideIndicator and hideLabel each take theirs away", () => {
    render(() => (
      <ChartContainer config={KEYED}>
        <ChartTooltipContent active hideIndicator hideLabel label="March" payload={PAYLOAD} />
      </ChartContainer>
    ));
    expect(document.querySelector('[data-slot="chart-tooltip-indicator"]')).toBeNull();
    expect(document.querySelector('[data-slot="chart-tooltip-label"]')).toBeNull();
    expect(rows()).toHaveLength(2);
  });

  test("a series with an icon shows it where the indicator would be", () => {
    render(() => (
      <ChartContainer config={THEMED}>
        <ChartTooltipContent active payload={PAYLOAD} />
      </ChartContainer>
    ));
    expect(rows()[0]?.querySelector('[data-slot="chart-tooltip-indicator"]')).not.toBeNull();
    expect(rows()[1]?.querySelector('[data-testid="globe"]')).not.toBeNull();
    expect(rows()[1]?.querySelector('[data-slot="chart-tooltip-indicator"]')).toBeNull();
  });

  test("labelFormatter writes the heading, and is handed the payload it heads", () => {
    const seen: number[] = [];
    render(() => (
      <ChartContainer config={KEYED}>
        <ChartTooltipContent
          active
          label="March"
          payload={PAYLOAD}
          labelFormatter={(value, payload) => {
            seen.push(payload.length);
            return `Month of ${String(value)}`;
          }}
        />
      </ChartContainer>
    ));
    expect(document.querySelector('[data-slot="chart-tooltip-label"]')?.textContent).toBe(
      "Month of March",
    );
    expect(seen).toEqual([2]);
  });

  test("a label that is a config key reads as that series' label", () => {
    render(() => (
      <ChartContainer config={KEYED}>
        <ChartTooltipContent active label="desktop" payload={PAYLOAD} />
      </ChartContainer>
    ));
    expect(document.querySelector('[data-slot="chart-tooltip-label"]')?.textContent).toBe(
      "Desktop",
    );
  });

  test("labelKey takes the heading from the config entry a field of the datum names", () => {
    const config: ChartConfigRecord = {
      ...KEYED,
      chrome: { label: "Chrome" },
    };
    render(() => (
      <ChartContainer config={config}>
        <ChartTooltipContent active label="March" labelKey="browser" payload={PAYLOAD} />
      </ChartContainer>
    ));
    expect(document.querySelector('[data-slot="chart-tooltip-label"]')?.textContent).toBe("Chrome");
  });

  test("nameKey names each row from the config entry a field of the datum names", () => {
    const config: ChartConfigRecord = {
      chrome: { label: "Chrome", color: "var(--chart-1)" },
    };
    render(() => (
      <ChartContainer config={config}>
        <ChartTooltipContent active hideLabel nameKey="browser" payload={PAYLOAD.slice(0, 1)} />
      </ChartContainer>
    ));
    expect(rows()[0]?.textContent).toBe("Chrome1,204");
  });

  test("formatter replaces a row's contents and is told which row it is", () => {
    render(() => (
      <ChartContainer config={KEYED}>
        <ChartTooltipContent
          active
          payload={PAYLOAD}
          formatter={(value, name, _item, index) => `${String(index)}:${name}=${String(value)}`}
        />
      </ChartContainer>
    ));
    expect(rows().map((row) => row.textContent)).toEqual(["0:desktop=1204", "1:mobile=80"]);
    expect(document.querySelector('[data-slot="chart-tooltip-indicator"]')).toBeNull();
  });

  test("one row with a line beside it carries the heading inside the row", () => {
    render(() => (
      <ChartContainer config={KEYED}>
        <ChartTooltipContent active indicator="line" label="March" payload={PAYLOAD.slice(0, 1)} />
      </ChartContainer>
    ));
    const label = document.querySelector('[data-slot="chart-tooltip-label"]');
    expect(label?.closest('[data-slot="chart-tooltip-row"]')).not.toBeNull();
  });

  test("a colour of the caller's own paints every indicator", () => {
    render(() => (
      <ChartContainer config={KEYED}>
        <ChartTooltipContent active color="var(--primary)" payload={PAYLOAD} />
      </ChartContainer>
    ));
    const marks = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="chart-tooltip-indicator"]'),
    ];
    expect(marks.map((mark) => mark.style.background)).toEqual([
      "var(--primary)",
      "var(--primary)",
    ]);
  });

  test("a row whose type is none is left out", () => {
    render(() => (
      <ChartContainer config={KEYED}>
        <ChartTooltipContent
          active
          payload={[
            { ...(PAYLOAD[0] as ChartPayloadItem), type: "none" },
            PAYLOAD[1] as ChartPayloadItem,
          ]}
        />
      </ChartContainer>
    ));
    expect(rows().map((row) => row.textContent)).toEqual(["Mobile80"]);
  });
});

describe("ChartTooltip", () => {
  const popup = (): HTMLElement | null =>
    document.querySelector('[data-slot="chart-tooltip-popup"]');

  async function mounted(): Promise<SVGSVGElement> {
    await tick();
    flush();
    return document.querySelector("svg") as SVGSVGElement;
  }

  test("nothing is shown until a point has the focus", async () => {
    render(() => (
      <ChartContainer config={KEYED}>
        <ChartBars data={DATA} x="month" aria-label="Visitors" />
        <ChartTooltip />
      </ChartContainer>
    ));
    await mounted();
    expect(popup()?.getAttribute("data-state")).toBe("closed");
    expect(document.querySelector('[data-slot="chart-tooltip"]')).toBeNull();
  });

  test("the keyboard walks the columns, and each one is read out", async () => {
    render(() => (
      <ChartContainer config={KEYED}>
        <ChartBars data={DATA} x="month" aria-label="Visitors" />
        <ChartTooltip />
      </ChartContainer>
    ));
    const drawing = await mounted();
    drawing.focus();
    flush();

    expect(popup()?.getAttribute("data-state")).toBe("open");
    // A live region, so the column the arrow keys land on is announced.
    expect(popup()?.getAttribute("role")).toBe("status");
    const body = document.querySelector('[data-slot="chart-tooltip"]');
    expect(body?.querySelector('[data-slot="chart-tooltip-label"]')?.textContent).toBe("Jan");
    const rows = [...(body?.querySelectorAll('[data-slot="chart-tooltip-row"]') ?? [])];
    expect(rows.map((row) => row.textContent)).toEqual(["Desktop100", "Mobile50"]);

    user.keyDown("ArrowRight", { target: drawing });
    flush();
    expect(document.querySelector('[data-slot="chart-tooltip-label"]')?.textContent).toBe("Feb");
    expect(
      [...document.querySelectorAll('[data-slot="chart-tooltip-row"]')].map(
        (row) => row.textContent,
      ),
    ).toEqual(["Desktop200", "Mobile150"]);

    drawing.blur();
    flush();
    expect(popup()?.getAttribute("data-state")).toBe("closed");
  });

  test("the content is the caller's to choose, and is handed the same payload", async () => {
    render(() => (
      <ChartContainer config={KEYED}>
        <ChartLines data={DATA} x="month" aria-label="Visitors" />
        <ChartTooltip content={<ChartTooltipContent indicator="line" hideLabel />} />
      </ChartContainer>
    ));
    const drawing = await mounted();
    drawing.focus();
    flush();
    expect(document.querySelector('[data-slot="chart-tooltip-label"]')).toBeNull();
    const mark = document.querySelector('[data-slot="chart-tooltip-indicator"]');
    expect(mark?.getAttribute("data-indicator")).toBe("line");
  });

  test("it never takes the pointer from the plot it describes", async () => {
    render(() => (
      <ChartContainer config={KEYED}>
        <ChartBars data={DATA} x="month" />
        <ChartTooltip />
      </ChartContainer>
    ));
    await mounted();
    const rules = rulesFor(popup()?.className ?? "");
    expect(rules).toContain("pointer-events: none");
    expect(rules).toContain("position: absolute");
  });

  test("outside a container it says what is wrong", () => {
    expect(() => render(() => <ChartTooltip />)).toThrow("inside a <ChartContainer>");
  });
});
