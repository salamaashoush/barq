import { barX, barY, defineChart, group, text } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { ChartLegend, type ChartConfig, type ChartDefinition } from "@barqjs/ui";

import {
  ChartCard,
  DESKTOP,
  DESKTOP_MOBILE,
  MONTH_AXIS,
  MONTHS,
  palette,
  rows,
  THEME,
  type Row,
} from "./shared.tsx";

import type { Child } from "@barqjs/core";

/** `radius={8}` on every one of upstream's single-series bars. */
const RADIUS = 8;

const X_BAND = { scale: scaleBand, axis: MONTH_AXIS } as const;
const Y_HIDDEN = { scale: scaleLinear, nice: true, grid: true, axis: false } as const;

const RANGE = "January - June 2024";
const TREND = "Trending up by 5.2% this month";
const VISITORS = "Showing total visitors for the last 6 months";

/**
 * The browsers every one of upstream's per-datum charts is drawn from.
 *
 * Their rows carry a `fill: "var(--color-chrome)"` each, which is recharts'
 * way of colouring a datum rather than a series. Here the colour scale takes
 * the browser as its domain, so the same five names produce the same five
 * colours without a paint string in the data.
 */
const BROWSERS = [
  { browser: "chrome", visitors: 275 },
  { browser: "safari", visitors: 200 },
  { browser: "firefox", visitors: 187 },
  { browser: "edge", visitors: 173 },
  { browser: "other", visitors: 90 },
];

const ACTIVE_BROWSERS = [
  { browser: "chrome", visitors: 187 },
  { browser: "safari", visitors: 200 },
  { browser: "firefox", visitors: 275 },
  { browser: "edge", visitors: 173 },
  { browser: "other", visitors: 90 },
];

const BROWSER_CONFIG: ChartConfig = [
  { key: "chrome", label: "Chrome", color: "var(--chart-1)" },
  { key: "safari", label: "Safari", color: "var(--chart-2)" },
  { key: "firefox", label: "Firefox", color: "var(--chart-3)" },
  { key: "edge", label: "Edge", color: "var(--chart-4)" },
  { key: "other", label: "Other", color: "var(--chart-5)" },
];

const SIGNED = [
  { month: "January", visitors: 186 },
  { month: "February", visitors: 205 },
  { month: "March", visitors: -207 },
  { month: "April", visitors: 173 },
  { month: "May", visitors: -209 },
  { month: "June", visitors: 214 },
];

/** One series, one column each, with upstream's corner. */
function simpleBars(options: { config: ChartConfig; radius?: number }): ChartDefinition {
  const data = rows(options.config, MONTHS);
  return defineChart({
    marks: [
      barY(data, {
        x: "x",
        y: "value",
        color: "series",
        radius: options.radius ?? RADIUS,
      }),
    ],
    scales: { x: X_BAND, y: Y_HIDDEN },
    color: palette(options.config),
    theme: THEME,
  });
}

/** Two series side by side: `layout: group()` is the explicit opt-in. */
function groupedBars(radius: number): ChartDefinition {
  const data = rows(DESKTOP_MOBILE, MONTHS);
  return defineChart({
    marks: [barY(data, { x: "x", y: "value", color: "series", layout: group(), radius })],
    scales: { x: X_BAND, y: Y_HIDDEN },
    color: palette(DESKTOP_MOBILE),
    theme: THEME,
  });
}

/** Two series in one column: repeated positions stack by default. */
function stackedBars(): ChartDefinition {
  const data = rows(DESKTOP_MOBILE, MONTHS);
  return defineChart({
    marks: [barY(data, { x: "x", y: "value", color: "series", radius: 4 })],
    scales: { x: X_BAND, y: Y_HIDDEN },
    color: palette(DESKTOP_MOBILE),
    theme: THEME,
  });
}

/**
 * The bars on their side, which is `layout="vertical"` upstream.
 *
 * `barX` rather than a flag: the transposed mark is its own thing in this
 * grammar, so the value channel is `x` and the category is `y`, and nothing has
 * to work out which of the two a `layout` prop meant.
 *
 * The channels are spelled LITERALLY in each of these rather than passed in.
 * A helper taking the field names has to widen them to reach the mark, and a
 * widened channel is a cast — which both this library's authoring rules and
 * this repository's forbid, for the same reason: the inference is the check.
 */
function horizontalMonths(): ChartDefinition {
  const data = MONTHS.map((row) => ({ ...row, short: row.month.slice(0, 3) }));
  return defineChart({
    marks: [barX(data, { x: "desktop", y: "short", color: "short", radius: 5 })],
    scales: {
      x: { scale: scaleLinear, nice: true, axis: false },
      y: {
        scale: scaleBand,
        axis: { line: false, ticks: { size: 0, padding: 10 }, tickLabels: { fontSize: 12 } },
      },
    },
    color: {
      domain: data.map((row) => row.short),
      range: data.map(() => "var(--color-desktop)"),
    },
    theme: THEME,
  });
}

function mixedBrowsers(): ChartDefinition {
  return defineChart({
    marks: [barX(BROWSERS, { x: "visitors", y: "browser", color: "browser", radius: 5 })],
    scales: {
      x: { scale: scaleLinear, nice: true, axis: false },
      y: {
        scale: scaleBand,
        axis: {
          line: false,
          ticks: {
            size: 0,
            padding: 10,
            format: (value: string) => BROWSER_LABELS[value] ?? value,
          },
          tickLabels: { fontSize: 12 },
        },
      },
    },
    color: palette(BROWSER_CONFIG),
    theme: THEME,
  });
}

const BROWSER_LABELS: Record<string, string> = Object.fromEntries(
  BROWSER_CONFIG.map((series) => [series.key, series.label]),
);

export const BAR_CHARTS: readonly { name: string; description: string; component: () => Child }[] =
  [
    {
      name: "chart-bar-default",
      description: "A bar chart",
      component: () => (
        <ChartCard
          title="Bar Chart"
          description={RANGE}
          config={DESKTOP}
          definition={simpleBars({ config: DESKTOP })}
          ariaLabel="Visitors by month"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-bar-horizontal",
      description: "A horizontal bar chart",
      component: () => (
        <ChartCard
          title="Bar Chart - Horizontal"
          description={RANGE}
          config={DESKTOP}
          definition={horizontalMonths()}
          ariaLabel="Visitors by month, horizontally"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-bar-multiple",
      description: "A multiple bar chart",
      component: () => (
        <ChartCard
          title="Bar Chart - Multiple"
          description={RANGE}
          config={DESKTOP_MOBILE}
          definition={groupedBars(4)}
          ariaLabel="Desktop and mobile visitors, side by side"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-bar-stacked",
      description: "A stacked bar chart with a legend",
      component: () => (
        <ChartCard
          title="Bar Chart - Stacked + Legend"
          description={RANGE}
          config={DESKTOP_MOBILE}
          definition={stackedBars()}
          ariaLabel="Desktop and mobile visitors, stacked"
          trend={TREND}
          footnote={VISITORS}
        >
          <ChartLegend />
        </ChartCard>
      ),
    },
    {
      name: "chart-bar-label",
      description: "A bar chart with a label",
      component: () => (
        <ChartCard
          title="Bar Chart - Label"
          description={RANGE}
          config={DESKTOP}
          definition={labelledBars()}
          ariaLabel="Visitors by month, with each value written above its bar"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-bar-label-custom",
      description: "A bar chart with a custom label",
      component: () => (
        <ChartCard
          title="Bar Chart - Custom Label"
          description={RANGE}
          config={DESKTOP_MOBILE}
          definition={customLabelBars()}
          ariaLabel="Visitors by month, labelled inside each bar"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-bar-mixed",
      description: "A mixed bar chart",
      component: () => (
        <ChartCard
          title="Bar Chart - Mixed"
          description={RANGE}
          config={BROWSER_CONFIG}
          definition={mixedBrowsers()}
          ariaLabel="Visitors by browser"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-bar-active",
      description: "A bar chart with an active bar",
      component: () => (
        <ChartCard
          title="Bar Chart - Active"
          description={RANGE}
          config={BROWSER_CONFIG}
          definition={activeBars()}
          ariaLabel="Visitors by browser, with the largest called out"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-bar-negative",
      description: "A bar chart with negative values",
      component: () => (
        <ChartCard
          title="Bar Chart - Negative"
          description={RANGE}
          config={DESKTOP_MOBILE}
          definition={negativeBars()}
          ariaLabel="Change in visitors by month, above and below zero"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-bar-interactive",
      description: "An interactive bar chart",
      component: () => (
        <ChartCard
          title="Bar Chart - Interactive"
          description="Showing total visitors for the last 3 months"
          config={DESKTOP_MOBILE}
          definition={groupedBars(4)}
          ariaLabel="Desktop and mobile visitors"
          height={250}
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
  ];

/** `<LabelList position="top" offset={12} className="fill-foreground" />`. */
function labelledBars(): ChartDefinition {
  const data = rows(DESKTOP, MONTHS);
  return defineChart({
    marks: [
      barY(data, { x: "x", y: "value", color: "series", radius: RADIUS }),
      text(data, {
        x: "x",
        y: "value",
        text: (row: Row) => String(row.value),
        dy: -12,
        fontSize: 12,
        fill: "var(--foreground)",
        anchor: "middle",
      }),
    ],
    scales: { x: X_BAND, y: Y_HIDDEN },
    color: palette(DESKTOP),
    theme: THEME,
  });
}

/**
 * The label INSIDE the bar, which upstream draws in `var(--background)`.
 *
 * Their `chartConfig` carries a `label` entry whose only member is a colour,
 * which is how a recharts `<LabelList>` finds one. A mark takes its own paint
 * here, so the colour is on the mark and the config stays a list of series.
 */
function customLabelBars(): ChartDefinition {
  return defineChart({
    marks: [
      barX(MONTHS, { x: "desktop", y: "month", color: "month", radius: 4 }),
      text(MONTHS, {
        x: () => 0,
        y: "month",
        text: (row: { month: string }) => row.month.slice(0, 3),
        dx: 8,
        fontSize: 12,
        fill: "var(--background)",
        anchor: "start",
      }),
    ],
    scales: {
      x: { scale: scaleLinear, nice: true, axis: false },
      y: { scale: scaleBand, axis: false },
    },
    color: {
      domain: MONTHS.map((row) => row.month),
      range: MONTHS.map(() => "var(--color-desktop)"),
    },
    theme: THEME,
  });
}

/**
 * One bar called out from the rest.
 *
 * Upstream swaps in a `<Rectangle>` with a dashed stroke for the index it wants
 * to highlight, which is a custom `shape` prop. A mark's paint is a channel
 * here, so the same picture is an accessor per bar and no second component.
 */
function activeBars(): ChartDefinition {
  const largest = ACTIVE_BROWSERS.reduce((most, row) =>
    row.visitors > most.visitors ? row : most,
  );
  return defineChart({
    marks: [
      barY(ACTIVE_BROWSERS, {
        x: "browser",
        y: "visitors",
        color: "browser",
        radius: RADIUS,
        // `fillOpacity` is one number for the whole mark, so the called-out bar
        // mixes its own colour with the surface instead: same picture, and the
        // paint stays a per-datum channel the way upstream's `shape` prop is.
        fill: (row: { browser: string }) =>
          row.browser === largest.browser
            ? `color-mix(in oklab, var(--color-${row.browser}) 80%, transparent)`
            : `var(--color-${row.browser})`,
        stroke: (row: { browser: string }) =>
          row.browser === largest.browser ? `var(--color-${row.browser})` : "none",
        strokeWidth: 2,
        strokeDasharray: "4",
      }),
    ],
    scales: {
      x: {
        scale: scaleBand,
        axis: {
          line: false,
          ticks: {
            size: 0,
            padding: 10,
            format: (value: string) => BROWSER_LABELS[value] ?? value,
          },
          tickLabels: { fontSize: 12 },
        },
      },
      y: Y_HIDDEN,
    },
    color: palette(BROWSER_CONFIG),
    theme: THEME,
  });
}

/**
 * Above and below zero, coloured by sign.
 *
 * The two colours are a scale over the SIGN rather than a `<Cell>` per row:
 * "positive" and "negative" are the two things being distinguished, and naming
 * them is what makes the legend and the tooltip say so too.
 */
function negativeBars(): ChartDefinition {
  const data = SIGNED.map((row) => ({ ...row, sign: row.visitors > 0 ? "up" : "down" }));
  return defineChart({
    marks: [
      barY(data, { x: "month", y: "visitors", color: "sign", radius: 4 }),
      text(data, {
        x: "month",
        y: "visitors",
        text: (row: { month: string }) => row.month.slice(0, 3),
        dy: (row: { visitors: number }) => (row.visitors > 0 ? -8 : 16),
        fontSize: 12,
        fill: "var(--foreground)",
        anchor: "middle",
      }),
    ],
    scales: {
      x: { scale: scaleBand, axis: false },
      y: { scale: scaleLinear, nice: true, grid: true, axis: false },
    },
    color: { domain: ["up", "down"], range: ["var(--chart-1)", "var(--chart-2)"] },
    theme: THEME,
  });
}
