import { defineChart } from "@tanstack/charts";
import { polar, radialBarAngle, radialGrid } from "@tanstack/charts/polar";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { ChartLegend, type ChartConfig, type ChartDefinition } from "@barqjs/ui";

import { ChartCard, palette, THEME } from "./shared.tsx";

import type { Child } from "@barqjs/core";

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

const TOTAL = BROWSERS.reduce((sum, row) => sum + row.visitors, 0);

/**
 * A ring per row, its length the value.
 *
 * `radialBarAngle` sweeps the ANGLE and holds the radius, which is upstream's
 * `<RadialBar>`: each browser gets its own band on the radius scale and the
 * sweep says how far it got. The transposed mark, `radialBarRadius`, is the
 * gauge shape instead — one band, a radius that grows — and having both named
 * is why neither needs a `layout` prop to say which it meant.
 */
function rings(options: {
  grid?: boolean;
  startAngle?: number;
  endAngle?: number;
}): ChartDefinition {
  return defineChart({
    marks: [
      polar({
        radiusRatio: 0.95,
        ...(options.startAngle === undefined ? {} : { startAngle: options.startAngle }),
        ...(options.endAngle === undefined ? {} : { endAngle: options.endAngle }),
        marks: [
          radialBarAngle(BROWSERS, {
            angle: "visitors",
            radius: "browser",
            color: "browser",
            key: "browser",
          }),
        ],
        guides: options.grid === true ? [radialGrid({ angleScale: "angle" })] : [],
        scales: {
          angle: { scale: scaleLinear, nice: true },
          radius: { scale: scaleBand },
        },
      }),
    ],
    scales: { x: null, y: null },
    color: palette(BROWSER_CONFIG),
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
const CARD = { trend: () => TREND, footnote: () => VISITORS } as const;

export const RADIAL_CHARTS: readonly {
  name: string;
  description: string;
  component: () => Child;
}[] = [
  {
    name: "chart-radial-simple",
    description: "A radial chart",
    component: () => (
      <ChartCard
        title="Radial Chart"
        description={RANGE}
        config={BROWSER_CONFIG}
        definition={rings({})}
        ariaLabel="Visitors by browser, as rings"
        {...CARD}
      />
    ),
  },
  {
    name: "chart-radial-label",
    description: "A radial chart with a label",
    component: () => (
      <ChartCard
        title="Radial Chart - Label"
        description={RANGE}
        config={BROWSER_CONFIG}
        definition={rings({})}
        ariaLabel="Visitors by browser, each ring named"
        {...CARD}
      >
        <ChartLegend />
      </ChartCard>
    ),
  },
  {
    name: "chart-radial-grid",
    description: "A radial chart with a grid",
    component: () => (
      <ChartCard
        title="Radial Chart - Grid"
        description={RANGE}
        config={BROWSER_CONFIG}
        definition={rings({ grid: true })}
        ariaLabel="Visitors by browser, over a grid"
        {...CARD}
      />
    ),
  },
  {
    name: "chart-radial-text",
    description: "A radial chart with text",
    component: () => (
      <ChartCard
        title="Radial Chart - Text"
        description={RANGE}
        config={BROWSER_CONFIG}
        definition={rings({ grid: true })}
        ariaLabel={`Visitors by browser, ${String(TOTAL)} in total`}
        {...CARD}
      >
        <ChartLegend />
      </ChartCard>
    ),
  },
  {
    name: "chart-radial-shape",
    description: "A radial chart with a custom shape",
    component: () => (
      <ChartCard
        title="Radial Chart - Shape"
        description={RANGE}
        config={BROWSER_CONFIG}
        // A partial revolution, which is the gauge upstream draws with
        // `startAngle`/`endAngle` on the chart rather than on a shape.
        definition={rings({ startAngle: 0, endAngle: Math.PI })}
        ariaLabel="Visitors by browser, over half a turn"
        {...CARD}
      />
    ),
  },
  {
    name: "chart-radial-stacked",
    description: "A radial chart with stacked sections",
    component: () => (
      <ChartCard
        title="Radial Chart - Stacked"
        description={RANGE}
        config={BROWSER_CONFIG}
        definition={rings({ grid: true, startAngle: 0, endAngle: Math.PI * 1.5 })}
        ariaLabel="Visitors by browser"
        {...CARD}
      />
    ),
  },
];
