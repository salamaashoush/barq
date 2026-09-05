import { defineChart } from "@tanstack/charts";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { pie, polar, radialArc, radialText } from "@tanstack/charts/polar";
import { ChartLegend, type ChartConfig, type ChartDefinition } from "@barqjs/ui";

import { ChartCard, palette, THEME } from "./shared.tsx";

import type { Child } from "@barqjs/core";

const RANGE = "January - June 2024";
const TREND = "Trending up by 5.2% this month";
const VISITORS = "Showing total visitors for the last 6 months";

const BROWSERS = [
  { browser: "chrome", visitors: 275 },
  { browser: "safari", visitors: 200 },
  { browser: "firefox", visitors: 287 },
  { browser: "edge", visitors: 173 },
  { browser: "other", visitors: 190 },
];

const BROWSER_CONFIG: ChartConfig = [
  { key: "chrome", label: "Chrome", color: "var(--chart-1)" },
  { key: "safari", label: "Safari", color: "var(--chart-2)" },
  { key: "firefox", label: "Firefox", color: "var(--chart-3)" },
  { key: "edge", label: "Edge", color: "var(--chart-4)" },
  { key: "other", label: "Other", color: "var(--chart-5)" },
];

const LABELS: Record<string, string> = Object.fromEntries(
  BROWSER_CONFIG.map((series) => [series.key, series.label]),
);

const TOTAL = BROWSERS.reduce((sum, row) => sum + row.visitors, 0);

/**
 * A pie, a donut and a gauge differ only in inner radius and angular interval.
 *
 * `pie` is an eager TRANSFORM here rather than a component: it allocates each
 * row an angular interval and hands back rows carrying `startAngle` and
 * `endAngle`, which is exactly what `radialArc` reads. Upstream's `<Pie>` does
 * both jobs at once, which is why its `innerRadius`, `label` and `shape` props
 * all live on the same element; here the allocation and the geometry are two
 * steps and only the second has an opinion about pixels.
 */
interface SliceOptions {
  innerRadius?: number;
  stroke?: string;
  strokeWidth?: number;
  callOut?: string;
}

function allocate(): ReturnType<typeof pie<(typeof BROWSERS)[number]>> {
  return pie(BROWSERS, { value: "visitors" });
}

function paintOf(options: SliceOptions): {
  stroke: string;
  strokeWidth: number;
  innerRadius?: number;
} {
  return {
    stroke: options.stroke ?? "var(--background)",
    strokeWidth: options.strokeWidth ?? 2,
    ...(options.innerRadius === undefined ? {} : { innerRadius: options.innerRadius }),
  };
}

/**
 * A pie, a donut and a gauge differ only in inner radius and angular interval.
 *
 * `pie` is an eager TRANSFORM here rather than a component: it allocates each
 * row an angular interval and hands back rows carrying `startAngle` and
 * `endAngle`, which is exactly what `radialArc` reads. Upstream's `<Pie>` does
 * both jobs at once, which is why its `innerRadius`, `label` and `shape` props
 * all live on the same element; here the allocation and the geometry are two
 * steps and only the second has an opinion about pixels.
 *
 * The labelled shape is a SECOND definition rather than a flag on this one.
 * `radialArc` reads its angles off the datum and materializes neither polar
 * channel, so a configured angle scale with no label mark to use it is rejected
 * outright — and a definition whose marks vary by a boolean cannot type its own
 * scales, because the scale requirement is computed from the marks.
 */
function slices(options: SliceOptions): ChartDefinition {
  const allocated = allocate();
  const callOut = options.callOut;
  const rest =
    callOut === undefined ? allocated : allocated.filter((row) => row.browser !== callOut);
  const active = callOut === undefined ? [] : allocated.filter((row) => row.browser === callOut);
  const paint = paintOf(options);

  return defineChart({
    marks: [
      polar({
        radiusRatio: 0.9,
        marks: [
          radialArc(rest, { color: "browser", key: "browser", ...paint }),
          // The called-out slice is its own MARK rather than a per-datum
          // radius: `outerRadius` is a `PolarLength`, which the layout decides
          // and a datum cannot. Upstream reaches the same picture by swapping a
          // `<Sector outerRadius={outerRadius + 10}>` in through a `shape` prop,
          // which is the same trick spelled as a component instead of a layer.
          ...(active.length === 0
            ? []
            : [
                radialArc(active, {
                  color: "browser",
                  key: "browser",
                  ...paint,
                  outerRadius: ({ radius }) => radius * 1.1,
                }),
              ]),
        ],
        scales: { angle: null, radius: null },
      }),
    ],
    scales: { x: null, y: null },
    color: palette(BROWSER_CONFIG),
    theme: THEME,
  });
}

/** The same, with each slice named — inside it or out past the rim. */
function labelledSlices(options: SliceOptions & { where: "inside" | "outside" }): ChartDefinition {
  const allocated = allocate();
  const paint = paintOf(options);

  return defineChart({
    marks: [
      polar({
        radiusRatio: options.where === "outside" ? 0.78 : 0.9,
        marks: [
          radialArc(allocated, { color: "browser", key: "browser", ...paint }),
          radialText(allocated, {
            angle: "angle",
            radius: () => (options.where === "inside" ? 0.62 : 1.16),
            text: (row) => LABELS[row.browser] ?? row.browser,
            fontSize: 12,
            fill: options.where === "inside" ? "var(--background)" : "var(--foreground)",
          }),
        ],
        // CONFIGURED scales, not factories: a factory infers its domain from the
        // channel, and the label angles are the slice midpoints, so the inferred
        // extent is narrower than a revolution and every label would land at the
        // wrong bearing. Pinning the domain to the whole circle makes the
        // mapping the identity it has to be, because `pie` emitted radians.
        scales: {
          angle: { scale: scaleLinear().domain([0, Math.PI * 2]) },
          radius: { scale: scaleLinear().domain([0, 1]) },
        },
      }),
    ],
    scales: { x: null, y: null },
    color: palette(BROWSER_CONFIG),
    theme: THEME,
  });
}

export const PIE_CHARTS: readonly { name: string; description: string; component: () => Child }[] =
  [
    {
      name: "chart-pie-simple",
      description: "A simple pie chart",
      component: () => (
        <ChartCard
          title="Pie Chart"
          description={RANGE}
          config={BROWSER_CONFIG}
          definition={slices({})}
          ariaLabel="Visitors by browser"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-pie-separator-none",
      description: "A pie chart with no separator",
      component: () => (
        <ChartCard
          title="Pie Chart - Separator None"
          description={RANGE}
          config={BROWSER_CONFIG}
          definition={slices({ stroke: "none", strokeWidth: 0 })}
          ariaLabel="Visitors by browser"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-pie-label",
      description: "A pie chart with a label",
      component: () => (
        <ChartCard
          title="Pie Chart - Label"
          description={RANGE}
          config={BROWSER_CONFIG}
          definition={labelledSlices({ where: "outside" })}
          ariaLabel="Visitors by browser, each slice named"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-pie-label-list",
      description: "A pie chart with a label list",
      component: () => (
        <ChartCard
          title="Pie Chart - Label List"
          description={RANGE}
          config={BROWSER_CONFIG}
          definition={labelledSlices({ where: "inside" })}
          ariaLabel="Visitors by browser, named inside each slice"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-pie-label-custom",
      description: "A pie chart with a custom label",
      component: () => (
        <ChartCard
          title="Pie Chart - Custom Label"
          description={RANGE}
          config={BROWSER_CONFIG}
          definition={labelledSlices({ where: "inside", stroke: "none", strokeWidth: 0 })}
          ariaLabel="Visitors by browser, named inside each slice"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-pie-donut",
      description: "A donut chart",
      component: () => (
        <ChartCard
          title="Pie Chart - Donut"
          description={RANGE}
          config={BROWSER_CONFIG}
          definition={slices({ innerRadius: 60 })}
          ariaLabel="Visitors by browser"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-pie-donut-active",
      description: "A donut chart with an active sector",
      component: () => (
        <ChartCard
          title="Pie Chart - Donut Active"
          description={RANGE}
          config={BROWSER_CONFIG}
          definition={slices({ innerRadius: 60, strokeWidth: 5, callOut: "safari" })}
          ariaLabel="Visitors by browser, with Safari called out"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-pie-donut-text",
      description: "A donut chart with text",
      component: () => (
        <ChartCard
          title="Pie Chart - Donut with Text"
          description={RANGE}
          config={BROWSER_CONFIG}
          definition={slices({ innerRadius: 60, strokeWidth: 5 })}
          ariaLabel={`Visitors by browser, ${String(TOTAL)} in total`}
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-pie-stacked",
      description: "A pie chart with stacked sections",
      component: () => (
        <ChartCard
          title="Pie Chart - Stacked"
          description={RANGE}
          config={BROWSER_CONFIG}
          definition={slices({ innerRadius: 70 })}
          ariaLabel="Visitors by browser"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
    {
      name: "chart-pie-legend",
      description: "A pie chart with a legend",
      component: () => (
        <ChartCard
          title="Pie Chart - Legend"
          description={RANGE}
          config={BROWSER_CONFIG}
          definition={slices({})}
          ariaLabel="Visitors by browser"
          trend={TREND}
          footnote={VISITORS}
        >
          <ChartLegend />
        </ChartCard>
      ),
    },
    {
      name: "chart-pie-interactive",
      description: "An interactive pie chart",
      component: () => (
        <ChartCard
          title="Pie Chart - Interactive"
          description={RANGE}
          config={BROWSER_CONFIG}
          definition={slices({ innerRadius: 60, strokeWidth: 5, callOut: "chrome" })}
          ariaLabel="Visitors by browser, with Chrome called out"
          trend={TREND}
          footnote={VISITORS}
        />
      ),
    },
  ];
