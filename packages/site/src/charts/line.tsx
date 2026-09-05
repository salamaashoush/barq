import { defineChart, dot, lineY, text } from "@tanstack/charts";
import { d3Curve } from "@tanstack/charts/d3/shape";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { curveMonotoneX, curveNatural, curveStep } from "d3-shape";
import { type ChartConfig, type ChartDefinition } from "@barqjs/ui";

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

const NATURAL = d3Curve(curveNatural);
const STEP = d3Curve(curveStep);
const MONOTONE = d3Curve(curveMonotoneX);

const X = { scale: scalePoint, axis: MONTH_AXIS } as const;
const Y_HIDDEN = { scale: scaleLinear, nice: true, grid: true, axis: false } as const;

const RANGE = "January - June 2024";
const TREND = "Trending up by 5.2% this month";
const VISITORS = "Showing total visitors for the last 6 months";

const BROWSERS = [
  { browser: "chrome", visitors: 275 },
  { browser: "safari", visitors: 200 },
  { browser: "firefox", visitors: 187 },
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

/**
 * One path per series, at upstream's own curve and weight.
 *
 * `strokeWidth={2}` and `dot={false}` are on every one of theirs, and a dot is
 * a separate MARK here rather than a prop: the points are their own layer with
 * their own radius and paint, which is what makes `dots-custom` a fourth line
 * of code rather than a component swapped into a prop.
 */
function lines(options: {
  config: ChartConfig;
  curve?: typeof NATURAL;
  points?: "none" | "filled" | "hollow";
}): ChartDefinition {
  const data = rows(options.config, MONTHS);
  const shared = {
    x: "x" as const,
    y: "value" as const,
    z: "series" as const,
    color: "series" as const,
    ...(options.curve === undefined ? {} : { curve: options.curve }),
  };

  const points = options.points ?? "none";
  return defineChart({
    marks: [
      lineY(data, { ...shared, strokeWidth: 2 }),
      ...(points === "none"
        ? []
        : [
            dot(data, {
              x: "x",
              y: "value",
              color: "series",
              r: 4,
              // A dot's fill and stroke are CONSTANTS, not channels: the
              // colour channel already decides the paint per datum, and these
              // two are the override. So a hollow dot names the one series it
              // belongs to, which is all upstream's `dots-custom` has as well.
              ...(points === "hollow"
                ? {
                    fill: "var(--background)",
                    stroke: `var(--color-${options.config[0]?.key ?? "desktop"})`,
                    strokeWidth: 2,
                  }
                : {}),
            }),
          ]),
    ],
    scales: { x: X, y: Y_HIDDEN },
    color: palette(options.config),
    theme: THEME,
  });
}

/** Every value written above its point, which is upstream's `<LabelList>`. */
function labelledLine(): ChartDefinition {
  const data = rows(DESKTOP, MONTHS);
  return defineChart({
    marks: [
      lineY(data, {
        x: "x",
        y: "value",
        z: "series",
        color: "series",
        curve: NATURAL,
        strokeWidth: 2,
      }),
      dot(data, { x: "x", y: "value", color: "series", r: 4 }),
      text(data, {
        x: "x",
        y: "value",
        text: (row: Row) => String(row.value),
        dy: -14,
        fontSize: 12,
        fill: "var(--foreground)",
        anchor: "middle",
      }),
    ],
    scales: { x: X, y: Y_HIDDEN },
    color: palette(DESKTOP),
    theme: THEME,
  });
}

/**
 * A dot per browser, each in its own colour.
 *
 * Upstream passes a `dot` render function that reads `payload.browser` and
 * paints from it. Here the dot mark's colour channel IS the browser, so the
 * same five colours come out of the same scale the rest of the page uses.
 */
function colouredDots(): ChartDefinition {
  return defineChart({
    marks: [
      lineY(BROWSERS, {
        x: "browser",
        y: "visitors",
        curve: NATURAL,
        strokeWidth: 2,
        stroke: "var(--color-chrome)",
      }),
      dot(BROWSERS, { x: "browser", y: "visitors", color: "browser", r: 5, strokeWidth: 2 }),
    ],
    scales: {
      x: { scale: scalePoint, axis: false },
      y: { scale: scaleLinear, nice: true, grid: true, axis: false },
    },
    color: palette(BROWSER_CONFIG),
    theme: THEME,
  });
}

export const LINE_CHARTS: readonly { name: string; description: string; component: () => Child }[] =
  [
    {
      name: "chart-line-default",
      description: "A line chart",
      component: () => (
        <ChartCard
          title="Line Chart"
          description={RANGE}
          config={DESKTOP}
          definition={lines({ config: DESKTOP, curve: NATURAL })}
          ariaLabel="Visitors by month"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-line-linear",
      description: "A linear line chart",
      component: () => (
        <ChartCard
          title="Line Chart - Linear"
          description={RANGE}
          config={DESKTOP}
          definition={lines({ config: DESKTOP })}
          ariaLabel="Visitors by month"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-line-step",
      description: "A step line chart",
      component: () => (
        <ChartCard
          title="Line Chart - Step"
          description={RANGE}
          config={DESKTOP}
          definition={lines({ config: DESKTOP, curve: STEP })}
          ariaLabel="Visitors by month"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-line-multiple",
      description: "A multiple line chart",
      component: () => (
        <ChartCard
          title="Line Chart - Multiple"
          description={RANGE}
          config={DESKTOP_MOBILE}
          definition={lines({ config: DESKTOP_MOBILE, curve: MONOTONE })}
          ariaLabel="Desktop and mobile visitors"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-line-dots",
      description: "A line chart with dots",
      component: () => (
        <ChartCard
          title="Line Chart - Dots"
          description={RANGE}
          config={DESKTOP}
          definition={lines({ config: DESKTOP, curve: NATURAL, points: "filled" })}
          ariaLabel="Visitors by month, with a dot at each"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-line-dots-custom",
      description: "A line chart with custom dots",
      component: () => (
        <ChartCard
          title="Line Chart - Custom Dots"
          description={RANGE}
          config={DESKTOP}
          definition={lines({ config: DESKTOP, curve: NATURAL, points: "hollow" })}
          ariaLabel="Visitors by month, with a hollow dot at each"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-line-dots-colors",
      description: "A line chart with dots and colors",
      component: () => (
        <ChartCard
          title="Line Chart - Dots Colors"
          description={RANGE}
          config={BROWSER_CONFIG}
          definition={colouredDots()}
          ariaLabel="Visitors by browser, one colour each"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-line-label",
      description: "A line chart with labels",
      component: () => (
        <ChartCard
          title="Line Chart - Label"
          description={RANGE}
          config={DESKTOP}
          definition={labelledLine()}
          ariaLabel="Visitors by month, with each value written above its point"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-line-label-custom",
      description: "A line chart with custom labels",
      component: () => (
        <ChartCard
          title="Line Chart - Custom Label"
          description={RANGE}
          config={DESKTOP}
          definition={labelledLine()}
          ariaLabel="Visitors by month, with each value written above its point"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-line-interactive",
      description: "An interactive line chart",
      component: () => (
        <ChartCard
          title="Line Chart - Interactive"
          description="Showing total visitors for the last 3 months"
          config={DESKTOP_MOBILE}
          definition={lines({ config: DESKTOP_MOBILE, curve: MONOTONE })}
          ariaLabel="Desktop and mobile visitors"
          height={250}
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
  ];
