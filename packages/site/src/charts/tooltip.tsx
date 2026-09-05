import { barY, defineChart } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { ChartLegend, type ChartDefinition } from "@barqjs/ui";

import { ChartCard, DESKTOP_MOBILE, MONTH_AXIS, MONTHS, palette, rows, THEME } from "./shared.tsx";

import type { Child } from "@barqjs/core";

const RANGE = "January - June 2024";
const TREND = "Trending up by 5.2% this month";
const VISITORS = "Showing total visitors for the last 6 months";

const LABELS: Record<string, string> = Object.fromEntries(
  DESKTOP_MOBILE.map((series) => [series.key, series.label]),
);

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * Every one of upstream's nine tooltip pages is the same stacked bar chart.
 *
 * `chart-tooltip-*` differ only in what the panel says and how it is marked —
 * an indicator or none, a label or none, a formatter on the value or on the
 * label. So the chart is written once and the nine are nine tooltip
 * configurations, which is what the difference actually is.
 *
 * The tooltip is on the DEFINITION rather than a child element. A tooltip needs
 * the focused points, and the points come from the scene: a component nested in
 * the markup would have to be handed them, which is why upstream's takes a
 * `content` render prop and a pile of `hideLabel` / `hideIndicator` /
 * `indicator="line"` flags to reach the same nine.
 */
function stacked(options: {
  format?: (value: number, series: string) => string;
  label?: ((x: string) => string) | false;
  indicator?: boolean;
}): ChartDefinition {
  const data = rows(DESKTOP_MOBILE, MONTHS);
  const label = options.label;

  return defineChart({
    marks: [barY(data, { x: "x", y: "value", color: "series", radius: 4 })],
    scales: {
      x: { scale: scaleBand, axis: MONTH_AXIS },
      y: { scale: scaleLinear, nice: true, grid: true, axis: false },
    },
    color: palette(DESKTOP_MOBILE),
    theme: THEME,
    // `{ use: tooltip, ...options }` is how a chart extension is CONFIGURED:
    // the bare token is the default, and an options object carries the token
    // beside them. So there is one shape whether or not anything is configured.
    tooltip: {
      use: tooltip,
      ...(options.indicator === false ? { className: "no-indicator" } : {}),
      format: (point: { datum: unknown }) => {
        const row = point.datum as { series: string; value: number };
        const name = LABELS[row.series] ?? row.series;
        return options.format === undefined
          ? `${name}: ${String(row.value)}`
          : `${name}: ${options.format(row.value, row.series)}`;
      },
      ...(label === false
        ? { formatGroup: () => "" }
        : label === undefined
          ? {}
          : {
              formatGroup: (points) => {
                const row = points[0]?.datum as { x?: string } | undefined;
                return label(row?.x ?? "");
              },
            }),
    },
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

const MONTH_NAMES: Record<string, string> = Object.fromEntries(
  MONTHS.map((row) => [row.month, row.month]),
);

function card(title: string, definition: ChartDefinition): Child {
  return (
    <ChartCard
      title={title}
      description={RANGE}
      config={DESKTOP_MOBILE}
      definition={definition}
      ariaLabel="Desktop and mobile visitors, stacked"
      {...CARD}
    >
      <ChartLegend />
    </ChartCard>
  );
}

export const TOOLTIP_CHARTS: readonly {
  name: string;
  description: string;
  component: () => Child;
}[] = [
  {
    name: "chart-tooltip-default",
    description: "The default tooltip",
    component: () => card("Tooltip - Default", stacked({})),
  },
  {
    name: "chart-tooltip-indicator-line",
    description: "A tooltip with a line indicator",
    component: () => card("Tooltip - Line Indicator", stacked({ indicator: true })),
  },
  {
    name: "chart-tooltip-indicator-none",
    description: "A tooltip with no indicator",
    component: () => card("Tooltip - No Indicator", stacked({ indicator: false })),
  },
  {
    name: "chart-tooltip-label-none",
    description: "A tooltip with no label",
    component: () => card("Tooltip - No Label", stacked({ label: false })),
  },
  {
    name: "chart-tooltip-label-custom",
    description: "A tooltip with a custom label",
    component: () =>
      card("Tooltip - Custom Label", stacked({ label: (x) => `${MONTH_NAMES[x] ?? x} 2024` })),
  },
  {
    name: "chart-tooltip-label-formatter",
    description: "A tooltip with a label formatter",
    component: () => card("Tooltip - Label Formatter", stacked({ label: (x) => x.toUpperCase() })),
  },
  {
    name: "chart-tooltip-formatter",
    description: "A tooltip with a value formatter",
    component: () =>
      card("Tooltip - Formatter", stacked({ format: (value) => MONEY.format(value) })),
  },
  {
    name: "chart-tooltip-icons",
    description: "A tooltip with icons",
    component: () =>
      card(
        "Tooltip - Icons",
        stacked({
          format: (value, series) => `${series === "desktop" ? "▲" : "▼"} ${String(value)}`,
        }),
      ),
  },
  {
    name: "chart-tooltip-advanced",
    description: "An advanced tooltip",
    component: () =>
      card(
        "Tooltip - Advanced",
        stacked({
          label: (x) => `${MONTH_NAMES[x] ?? x} 2024`,
          format: (value) => `${MONEY.format(value)} in revenue`,
        }),
      ),
  },
];
