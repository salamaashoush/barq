import { areaY, defineChart, lineY, stack } from "@tanstack/charts";
import { d3Curve } from "@tanstack/charts/d3/shape";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { curveNatural, curveStep } from "d3-shape";
import { ChartLegend, type ChartConfig, type ChartDefinition } from "@barqjs/ui";

import { BARE_AXIS, ChartCard, DESKTOP, DESKTOP_MOBILE, MONTH_AXIS, MONTHS } from "./shared.tsx";

import type { Child } from "@barqjs/core";

const NATURAL = d3Curve(curveNatural);
const STEP = d3Curve(curveStep);

interface Row {
  readonly month: string;
  readonly series: string;
  readonly value: number;
}

/** The wide months as one row per series, which is the shape a mark groups by. */
function rows(keys: readonly string[], data: readonly Record<string, unknown>[] = MONTHS): Row[] {
  return data.flatMap((row) =>
    keys.map((key) => ({
      month: String(row["month"]),
      series: key,
      value: Number(row[key] ?? 0),
    })),
  );
}

function palette(config: ChartConfig): { domain: readonly string[]; range: readonly string[] } {
  return {
    domain: config.map((series) => series.key),
    range: config.map((series) => `var(--color-${series.key})`),
  };
}

const X = { scale: scalePoint, axis: MONTH_AXIS } as const;
const Y_HIDDEN = { scale: scaleLinear, nice: true, grid: true, axis: false } as const;

/**
 * One area chart, in the shape every one of upstream's is.
 *
 * `areaY` does not draw its own upper line — the grammar keeps the band and the
 * path apart — so each series is two marks. Upstream gets the same picture from
 * one `<Area>` with both `fill` and `stroke`, which is recharts deciding for
 * you; here the layering is written down.
 */
function areaChart(options: {
  config: ChartConfig;
  data?: readonly Record<string, unknown>[];
  curve?: typeof NATURAL;
  fillOpacity?: number;
  stacked?: boolean;
  expand?: boolean;
  yAxis?: boolean;
}): ChartDefinition {
  const keys = options.config.map((series) => series.key);
  const data = rows(keys, options.data);
  const shared = {
    x: "month" as const,
    y: "value" as const,
    z: "series" as const,
    color: "series" as const,
    ...(options.curve === undefined ? {} : { curve: options.curve }),
  };

  return defineChart({
    marks: [
      areaY(data, {
        ...shared,
        fillOpacity: options.fillOpacity ?? 0.4,
        ...(options.expand === true ? { layout: stack({ offset: "normalize" }) } : {}),
      }),
      lineY(data, { ...shared, strokeWidth: 2 }),
    ],
    scales: {
      x: X,
      y:
        options.yAxis === true
          ? {
              scale: scaleLinear,
              nice: true,
              grid: true,
              axis: BARE_AXIS,
            }
          : Y_HIDDEN,
    },
    color: palette(options.config),
    theme: {
      foreground: "var(--foreground)",
      muted: "var(--muted-foreground)",
      grid: "var(--border)",
      background: "transparent",
    },
  });
}

const EXPAND = [
  { month: "January", desktop: 186, mobile: 80, other: 45 },
  { month: "February", desktop: 305, mobile: 200, other: 100 },
  { month: "March", desktop: 237, mobile: 120, other: 150 },
  { month: "April", desktop: 73, mobile: 190, other: 50 },
  { month: "May", desktop: 209, mobile: 130, other: 100 },
  { month: "June", desktop: 214, mobile: 140, other: 160 },
];

const THREE: ChartConfig = [
  { key: "desktop", label: "Desktop", color: "var(--chart-1)" },
  { key: "mobile", label: "Mobile", color: "var(--chart-2)" },
  { key: "other", label: "Other", color: "var(--chart-3)" },
];

const RANGE = "January - June 2024";
const TREND = "Trending up by 5.2% this month";

export const AREA_CHARTS: readonly { name: string; description: string; component: () => Child }[] =
  [
    {
      name: "chart-area-default",
      description: "A simple area chart",
      component: () => (
        <ChartCard
          title="Area Chart"
          description="Showing total visitors for the last 6 months"
          config={DESKTOP}
          definition={areaChart({ config: DESKTOP, curve: NATURAL })}
          ariaLabel="Visitors for the last six months"
          trend={TREND}
          footnote={RANGE}
        />
      ),
    },
    {
      name: "chart-area-linear",
      description: "A linear area chart",
      component: () => (
        <ChartCard
          title="Area Chart - Linear"
          description="Showing total visitors for the last 6 months"
          config={DESKTOP}
          definition={areaChart({ config: DESKTOP })}
          ariaLabel="Visitors for the last six months"
          trend={TREND}
          footnote={RANGE}
        />
      ),
    },
    {
      name: "chart-area-step",
      description: "A step area chart",
      component: () => (
        <ChartCard
          title="Area Chart - Step"
          description="Showing total visitors for the last 6 months"
          config={DESKTOP}
          definition={areaChart({ config: DESKTOP, curve: STEP })}
          ariaLabel="Visitors for the last six months"
          trend={TREND}
          footnote={RANGE}
        />
      ),
    },
    {
      name: "chart-area-stacked",
      description: "A stacked area chart",
      component: () => (
        <ChartCard
          title="Area Chart - Stacked"
          description="Showing total visitors for the last 6 months"
          config={DESKTOP_MOBILE}
          definition={areaChart({ config: DESKTOP_MOBILE, curve: NATURAL, stacked: true })}
          ariaLabel="Desktop and mobile visitors, stacked"
          trend={TREND}
          footnote={RANGE}
        />
      ),
    },
    {
      name: "chart-area-stacked-expand",
      description: "A stacked area chart with expand stacking",
      component: () => (
        <ChartCard
          title="Area Chart - Stacked Expanded"
          description="Showing total visitors for the last 6 months"
          config={THREE}
          definition={areaChart({
            config: THREE,
            data: EXPAND,
            curve: NATURAL,
            stacked: true,
            expand: true,
            fillOpacity: 0.4,
          })}
          ariaLabel="Share of visitors by device"
          trend={TREND}
          footnote={RANGE}
        />
      ),
    },
    {
      name: "chart-area-legend",
      description: "An area chart with a legend",
      component: () => (
        <ChartCard
          title="Area Chart - Legend"
          description="Showing total visitors for the last 6 months"
          config={DESKTOP_MOBILE}
          definition={areaChart({ config: DESKTOP_MOBILE, curve: NATURAL, stacked: true })}
          ariaLabel="Desktop and mobile visitors, stacked"
          trend={TREND}
          footnote={RANGE}
        >
          <ChartLegend />
        </ChartCard>
      ),
    },
    {
      name: "chart-area-axes",
      description: "An area chart with axes",
      component: () => (
        <ChartCard
          title="Area Chart - Axes"
          description="Showing total visitors for the last 6 months"
          config={DESKTOP_MOBILE}
          definition={areaChart({
            config: DESKTOP_MOBILE,
            curve: NATURAL,
            stacked: true,
            yAxis: true,
          })}
          ariaLabel="Desktop and mobile visitors, with both axes"
          trend={TREND}
          footnote={RANGE}
        />
      ),
    },
    {
      name: "chart-area-gradient",
      description: "An area chart with gradient fill",
      component: () => (
        <ChartCard
          title="Area Chart - Gradient"
          description="Showing total visitors for the last 6 months"
          config={DESKTOP_MOBILE}
          definition={gradientArea()}
          ariaLabel="Desktop and mobile visitors, filled with a gradient"
          trend={TREND}
          footnote={RANGE}
        />
      ),
    },
    {
      name: "chart-area-icons",
      description: "An area chart with icons",
      component: () => (
        <ChartCard
          title="Area Chart - Icons"
          description="Showing total visitors for the last 6 months"
          config={DESKTOP_MOBILE}
          definition={areaChart({ config: DESKTOP_MOBILE, curve: NATURAL, stacked: true })}
          ariaLabel="Desktop and mobile visitors, stacked"
          trend={TREND}
          footnote={RANGE}
        >
          <ChartLegend />
        </ChartCard>
      ),
    },
    {
      name: "chart-area-interactive",
      description: "An interactive area chart",
      component: () => (
        <ChartCard
          title="Area Chart - Interactive"
          description="Showing total visitors for the last 6 months"
          config={DESKTOP_MOBILE}
          definition={areaChart({ config: DESKTOP_MOBILE, curve: NATURAL, stacked: true })}
          ariaLabel="Desktop and mobile visitors, stacked"
          height={300}
          trend={TREND}
          footnote={RANGE}
        />
      ),
    },
  ];

/**
 * The gradient fill, as a resource the spec declares.
 *
 * Upstream writes a `<defs><linearGradient>` into the chart's own SVG and
 * points `fill` at `url(#fillDesktop)`. The renderer owns the SVG here, so the
 * gradient is declared on the spec instead and the mark names it: the same two
 * stops, and no id anybody has to keep unique across a page of sixty charts.
 */
function gradientArea(): ChartDefinition {
  const keys = DESKTOP_MOBILE.map((series) => series.key);
  const data = rows(keys);

  return defineChart({
    marks: [
      areaY(data, {
        x: "month",
        y: "value",
        z: "series",
        color: "series",
        curve: NATURAL,
        fill: (row: Row) => `url(#fill-${row.series})`,
        fillOpacity: 0.4,
      }),
      lineY(data, {
        x: "month",
        y: "value",
        z: "series",
        color: "series",
        curve: NATURAL,
        strokeWidth: 2,
      }),
    ],
    scales: { x: X, y: Y_HIDDEN },
    color: palette(DESKTOP_MOBILE),
    gradients: DESKTOP_MOBILE.map((series) => ({
      id: `fill-${series.key}`,
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 1,
      stops: [
        { offset: 0.05, color: `var(--color-${series.key})`, opacity: 0.8 },
        { offset: 0.95, color: `var(--color-${series.key})`, opacity: 0.1 },
      ],
    })),
    theme: {
      foreground: "var(--foreground)",
      muted: "var(--muted-foreground)",
      grid: "var(--border)",
      background: "transparent",
    },
  });
}
