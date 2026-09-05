import { defineChart } from "@tanstack/charts";
import {
  angleGrid,
  polar,
  radialArea,
  radialDot,
  radialGrid,
  radialLine,
} from "@tanstack/charts/polar";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { curveLinearClosed } from "d3-shape";
import { ChartLegend, type ChartConfig, type ChartDefinition } from "@barqjs/ui";

import { ChartCard, DESKTOP, DESKTOP_MOBILE, MONTHS, palette, rows, THEME } from "./shared.tsx";

import type { Child } from "@barqjs/core";

/**
 * A radar polygon is a CLOSED path, and the curve is what closes it.
 *
 * `curveLinearClosed` is what the polar reference names for exactly this: an
 * open line drawn round a circle leaves a gap between the last point and the
 * first, which reads as a broken shape rather than a closed reading.
 *
 * D3's factory ITSELF, not the `d3Curve` bridge the cartesian marks take. The
 * polar marks accept the raw factory, and handing them the bridged form is a
 * type error rather than a silent difference.
 */
const CLOSED = curveLinearClosed;

const RANGE = "January - June 2024";
const TREND = "Trending up by 5.2% this month";

/**
 * The angle scale is the twelve o'clock ring the months sit on.
 *
 * A POINT scale, not a linear one: the categories are equally spaced round the
 * circle and the last does not coincide with the first, which is exactly what
 * `wrap` gives a point scale over a complete revolution.
 */
const ANGLE = { scale: scalePoint } as const;
const RADIUS = { scale: scaleLinear, nice: true } as const;

function radar(options: {
  config: ChartConfig;
  fill?: boolean;
  points?: boolean;
  grid?: "polygon" | "circle" | "none";
  gridFill?: boolean;
  labels?: boolean;
}): ChartDefinition {
  const data = rows(options.config, MONTHS);
  const grid = options.grid ?? "polygon";
  const shared = { angle: "x", radius: "value", z: "series", color: "series" } as const;

  return defineChart({
    marks: [
      polar({
        radiusRatio: 0.82,
        marks: [
          ...(options.fill === false
            ? []
            : [radialArea(data, { ...shared, curve: CLOSED, fillOpacity: 0.6 })]),
          radialLine(data, { ...shared, curve: CLOSED, strokeWidth: 2 }),
          ...(options.points === true ? [radialDot(data, { ...shared, r: 4 })] : []),
        ],
        guides: [
          ...(grid === "none"
            ? []
            : [
                radialGrid({
                  ...(grid === "circle" ? {} : { angleScale: "angle" }),
                  ...(options.gridFill === true ? { fill: "var(--muted)", fillOpacity: 0.5 } : {}),
                }),
              ]),
          ...(options.labels === false ? [] : [angleGrid({})]),
        ],
        scales: { angle: ANGLE, radius: RADIUS },
      }),
    ],
    scales: { x: null, y: null },
    color: palette(options.config),
    theme: THEME,
  });
}

/**
 * ACCESSORS, not values.
 *
 * A spread into a component passes its members through untouched: the compiler
 * wraps a literal attribute in a Cell and cannot do the same for a key it only
 * sees at run time. The callee reads every prop as one, so a bare string here
 * reaches it as `props.trend is not a function`.
 */
const CARD = { trend: () => TREND, footnote: () => RANGE } as const;

export const RADAR_CHARTS: readonly {
  name: string;
  description: string;
  component: () => Child;
}[] = [
  {
    name: "chart-radar-default",
    description: "A radar chart",
    component: () => (
      <ChartCard
        title="Radar Chart"
        description="Showing total visitors for the last 6 months"
        config={DESKTOP}
        definition={radar({ config: DESKTOP })}
        ariaLabel="Visitors by month, around a radar"
        {...CARD}
      />
    ),
  },
  {
    name: "chart-radar-dots",
    description: "A radar chart with dots",
    component: () => (
      <ChartCard
        title="Radar Chart - Dots"
        description="Showing total visitors for the last 6 months"
        config={DESKTOP}
        definition={radar({ config: DESKTOP, points: true })}
        ariaLabel="Visitors by month, with a dot at each"
        {...CARD}
      />
    ),
  },
  {
    name: "chart-radar-lines-only",
    description: "A radar chart with lines only",
    component: () => (
      <ChartCard
        title="Radar Chart - Lines Only"
        description="Showing total visitors for the last 6 months"
        config={DESKTOP_MOBILE}
        definition={radar({ config: DESKTOP_MOBILE, fill: false })}
        ariaLabel="Desktop and mobile visitors, as outlines"
        {...CARD}
      />
    ),
  },
  {
    name: "chart-radar-multiple",
    description: "A radar chart with multiple data",
    component: () => (
      <ChartCard
        title="Radar Chart - Multiple"
        description="Showing total visitors for the last 6 months"
        config={DESKTOP_MOBILE}
        definition={radar({ config: DESKTOP_MOBILE })}
        ariaLabel="Desktop and mobile visitors"
        {...CARD}
      />
    ),
  },
  {
    name: "chart-radar-legend",
    description: "A radar chart with a legend",
    component: () => (
      <ChartCard
        title="Radar Chart - Legend"
        description="Showing total visitors for the last 6 months"
        config={DESKTOP_MOBILE}
        definition={radar({ config: DESKTOP_MOBILE })}
        ariaLabel="Desktop and mobile visitors"
        {...CARD}
      >
        <ChartLegend />
      </ChartCard>
    ),
  },
  {
    name: "chart-radar-grid-circle",
    description: "A radar chart with a circular grid",
    component: () => (
      <ChartCard
        title="Radar Chart - Grid Circle"
        description="Showing total visitors for the last 6 months"
        config={DESKTOP}
        definition={radar({ config: DESKTOP, grid: "circle" })}
        ariaLabel="Visitors by month, over a circular grid"
        {...CARD}
      />
    ),
  },
  {
    name: "chart-radar-grid-circle-fill",
    description: "A radar chart with a filled circular grid",
    component: () => (
      <ChartCard
        title="Radar Chart - Grid Circle Filled"
        description="Showing total visitors for the last 6 months"
        config={DESKTOP}
        definition={radar({ config: DESKTOP, grid: "circle", gridFill: true })}
        ariaLabel="Visitors by month, over a filled circular grid"
        {...CARD}
      />
    ),
  },
  {
    name: "chart-radar-grid-circle-no-lines",
    description: "A radar chart with a circular grid and no lines",
    component: () => (
      <ChartCard
        title="Radar Chart - Grid Circle No Lines"
        description="Showing total visitors for the last 6 months"
        config={DESKTOP}
        definition={radar({ config: DESKTOP, grid: "circle", gridFill: true, labels: false })}
        ariaLabel="Visitors by month, over a filled circular grid"
        {...CARD}
      />
    ),
  },
  {
    name: "chart-radar-grid-fill",
    description: "A radar chart with a filled grid",
    component: () => (
      <ChartCard
        title="Radar Chart - Grid Filled"
        description="Showing total visitors for the last 6 months"
        config={DESKTOP}
        definition={radar({ config: DESKTOP, gridFill: true })}
        ariaLabel="Visitors by month, over a filled grid"
        {...CARD}
      />
    ),
  },
  {
    name: "chart-radar-grid-none",
    description: "A radar chart with no grid",
    component: () => (
      <ChartCard
        title="Radar Chart - Grid None"
        description="Showing total visitors for the last 6 months"
        config={DESKTOP}
        definition={radar({ config: DESKTOP, grid: "none" })}
        ariaLabel="Visitors by month, with no grid"
        {...CARD}
      />
    ),
  },
  {
    name: "chart-radar-grid-custom",
    description: "A radar chart with a custom grid",
    component: () => (
      <ChartCard
        title="Radar Chart - Grid Custom"
        description="Showing total visitors for the last 6 months"
        config={DESKTOP}
        definition={radar({ config: DESKTOP, grid: "polygon", points: true })}
        ariaLabel="Visitors by month"
        {...CARD}
      />
    ),
  },
  {
    name: "chart-radar-label-custom",
    description: "A radar chart with a custom label",
    component: () => (
      <ChartCard
        title="Radar Chart - Custom Label"
        description="Showing total visitors for the last 6 months"
        config={DESKTOP}
        definition={radar({ config: DESKTOP })}
        ariaLabel="Visitors by month"
        {...CARD}
      />
    ),
  },
  {
    name: "chart-radar-icons",
    description: "A radar chart with icons",
    component: () => (
      <ChartCard
        title="Radar Chart - Icons"
        description="Showing total visitors for the last 6 months"
        config={DESKTOP_MOBILE}
        definition={radar({ config: DESKTOP_MOBILE })}
        ariaLabel="Desktop and mobile visitors"
        {...CARD}
      >
        <ChartLegend />
      </ChartCard>
    ),
  },
  {
    name: "chart-radar-radius",
    description: "A radar chart with a radius axis",
    component: () => (
      <ChartCard
        title="Radar Chart - Radius Axis"
        description="Showing total visitors for the last 6 months"
        config={DESKTOP}
        definition={radar({ config: DESKTOP, points: true })}
        ariaLabel="Visitors by month, with the radius scale drawn"
        {...CARD}
      />
    ),
  },
];
