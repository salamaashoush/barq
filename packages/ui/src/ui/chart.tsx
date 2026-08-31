import {
  context,
  For,
  getContext,
  getOwner,
  provide,
  signal,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { layer } from "@barqjs/css";

import "../theme/layers.ts";
import { uiProps } from "../lib/slot.ts";

import type { UiProps } from "../lib/props.ts";

const ui = layer("barq.ui");

const chart = ui({
  display: "flex",
  aspectRatio: "var(--aspect-video)",
  justifyContent: "center",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  // shadcn's is a row because recharts fills it alone and draws its own legend
  // inside the plot. Here the legend is a sibling, so a row halves the drawing
  // and puts the key beside it; a column is the same box with the parts stacked.
  flexDirection: "column",
});

const tooltip = ui({
  display: "grid",
  minWidth: "8rem",
  alignItems: "flex-start",
  gap: "calc(var(--spacing) * 1.5)",
  borderRadius: "var(--radius)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  borderColor: "var(--border)",
  "@supports (color: color-mix(in lab, red, red))": {
    borderColor: "color-mix(in oklab, var(--border) 50%, transparent)",
  },
  backgroundColor: "var(--background)",
  paddingInline: "calc(var(--spacing) * 2.5)",
  paddingBlock: "calc(var(--spacing) * 1.5)",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
  "--ui-shadow":
    "0 20px 25px -5px var(--ui-shadow-color, rgb(0 0 0 / 0.1)), 0 8px 10px -6px var(--ui-shadow-color, rgb(0 0 0 / 0.1))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
});

const tooltipRow = ui({
  display: "flex",
  width: "100%",
  flexWrap: "wrap",
  alignItems: "stretch",
  gap: "calc(var(--spacing) * 2)",
});

const tooltipIndicator = ui({
  flexShrink: "0",
  borderRadius: "2px",
  width: "10px",
  height: "10px",
});

const tooltipName = ui({ color: "var(--muted-foreground)" });

const tooltipValue = ui({
  fontFamily: "var(--font-mono)",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  color: "var(--foreground)",
  "--ui-numeric-spacing": "tabular-nums",
  fontVariantNumeric:
    "var(--ui-ordinal,) var(--ui-slashed-zero,) var(--ui-numeric-figure,) var(--ui-numeric-spacing,) var(--ui-numeric-fraction,)",
});

const legend = ui({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "calc(var(--spacing) * 4)",
  paddingTop: "calc(var(--spacing) * 3)",
});

const legendItem = ui({ display: "flex", alignItems: "center", gap: "calc(var(--spacing) * 1.5)" });

const legendSwatch = ui({
  height: "calc(var(--spacing) * 2)",
  width: "calc(var(--spacing) * 2)",
  flexShrink: "0",
  borderRadius: "2px",
});

/**
 * The marks, as atoms on the elements rather than descendant rules.
 *
 * `fill` and `stroke` are properties like any other, so there is no reason for a
 * chart to be the one place in this package that reaches for a global block. A
 * mark reads `--color-series`, which the group around it sets from the config,
 * so one custom property restyles a whole series and a theme's ramp reaches the
 * chart without the chart knowing anything about the theme. That indirection is
 * what shadcn's `<ChartStyle>` emits, kept exactly.
 *
 * shadcn's container also carries a dozen `[&_.recharts-…]` rules that reach
 * into recharts' own markup. There is no recharts here, so there is nothing for
 * them to select and they are not transcribed.
 */
const gridLine = ui({ stroke: "var(--border)", strokeWidth: "1" });

const axisText = ui({ fill: "var(--muted-foreground)", fontSize: "10px" });

const barMark = ui({ fill: "var(--color-series)" });

const lineMark = ui({
  fill: "none",
  stroke: "var(--color-series)",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

const areaMark = ui({ fill: "var(--color-series)", opacity: "0.2" });

export interface ChartSeries {
  /** The key of the value this series reads out of each datum. */
  readonly key: string;
  readonly label: string;
  /** Any colour. `var(--chart-1)` is what a theme's own ramp is called. */
  readonly color: string;
}

export type ChartConfig = readonly ChartSeries[];

interface ChartValue {
  readonly config: () => ChartConfig;
}

const ChartContext = context<ChartValue | null>(null);

function useChart(): ChartValue {
  const value = getContext(ChartContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <ChartContainer>.");
  }
  return value;
}

export interface ChartContainerProps extends UiProps {
  config: ChartConfig;
}

/**
 * ```tsx
 * <ChartContainer config={[{ key: "sales", label: "Sales", color: "var(--chart-1)" }]}>
 *   <ChartBars data={rows} x="month" />
 *   <ChartLegend />
 * </ChartContainer>
 * ```
 *
 * shadcn's chart is a recharts wrapper. recharts is React to its foundations —
 * hooks, context and `cloneElement` over its own children — so there is nothing
 * of it to take, and this draws SVG instead. That is not a smaller answer than
 * wrapping one: a chart IS SVG, and the marks below are a few dozen lines
 * against a dependency measured in hundreds of kilobytes.
 *
 * What is kept exactly is the CONFIG shape and what it produces: a series
 * becomes `--color-<key>`, and every mark reads that rather than being handed a
 * colour, so one rule restyles a whole series and a theme's ramp reaches the
 * chart without the chart knowing about the theme.
 */
export function ChartContainer(props: Incoming<ChartContainerProps>) {
  return (
    <div
      {...uiProps("chart", chart, props)}
      style={() =>
        Object.fromEntries(props.config().map((series) => [`--color-${series.key}`, series.color]))
      }
    >
      <ChartProvider config={props.config()}>{props.children}</ChartProvider>
    </div>
  );
}

/**
 * The context, and nothing else.
 *
 * `provide`'s callback must build NO JSX. One that does is built eagerly at the
 * call site and closes over the scope there, so the children go up beside the
 * context rather than under it: every plot then threw `props.config is not a
 * function`, because it was reading a `props` the provider never gave it.
 */
function ChartProvider(props: Incoming<{ config: ChartConfig; children?: Child }>) {
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    ChartContext,
    () => ({ config: () => props.config() }),
    () => props.children,
  ) as never;
}

export interface ChartPlotProps extends UiProps {
  /** One object per column, each holding `x` and every series key. */
  data: readonly Record<string, string | number>[];
  /** Which field labels the column. */
  x: string;
  /** @default 320 */
  width?: number;
  /** @default 160 */
  height?: number;
}

interface Geometry {
  readonly w: number;
  readonly h: number;
  readonly pad: number;
  readonly max: number;
}

function geometryOf(props: {
  data: readonly Record<string, string | number>[];
  config: ChartConfig;
  width: number;
  height: number;
}): Geometry {
  const values = props.data.flatMap((row) =>
    props.config.map((series) => Number(row[series.key] ?? 0)),
  );
  // A zero maximum would divide by zero and put every mark on the axis.
  const max = Math.max(1, ...values);
  return { w: props.width, h: props.height, pad: 24, max };
}

/** The horizontal rules and the labels along the bottom, shared by every mark. */
function Frame(props: Incoming<{ geometry: Geometry; labels: readonly string[] }>) {
  const lines = (): number[] => [0, 0.25, 0.5, 0.75, 1];
  return (
    <>
      <g data-slot="chart-grid">
        <For each={() => lines()}>
          {(at: number) => (
            <line
              class={gridLine}
              x1={props.geometry().pad}
              x2={props.geometry().w - 4}
              y1={props.geometry().pad + (props.geometry().h - props.geometry().pad * 2) * at}
              y2={props.geometry().pad + (props.geometry().h - props.geometry().pad * 2) * at}
            />
          )}
        </For>
      </g>
      <g data-slot="chart-axis">
        <For each={() => props.labels().map((label, index) => ({ label, index }))}>
          {(entry: { label: string; index: number }) => (
            <text
              class={axisText}
              x={
                props.geometry().pad +
                ((props.geometry().w - props.geometry().pad - 4) / props.labels().length) *
                  (entry.index + 0.5)
              }
              y={props.geometry().h - 6}
              text-anchor="middle"
            >
              {entry.label}
            </text>
          )}
        </For>
      </g>
    </>
  );
}

/** A column per datum, one bar per series. */
export function ChartBars(props: Incoming<ChartPlotProps>) {
  const { config } = useChart();
  const geometry = (): Geometry =>
    geometryOf({
      data: props.data(),
      config: config(),
      width: props.width?.() ?? 320,
      height: props.height?.() ?? 160,
    });

  const bars = (): {
    key: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[] => {
    const g = geometry();
    const rows = props.data();
    const series = config();
    const plot = g.h - g.pad * 2;
    const step = (g.w - g.pad - 4) / Math.max(1, rows.length);
    const bandwidth = (step * 0.7) / Math.max(1, series.length);
    return rows.flatMap((row, column) =>
      series.map((each, index) => {
        const value = Number(row[each.key] ?? 0);
        const height = (value / g.max) * plot;
        return {
          key: `${String(column)}-${each.key}`,
          x: g.pad + step * column + step * 0.15 + bandwidth * index,
          y: g.pad + plot - height,
          width: Math.max(1, bandwidth - 2),
          height,
        };
      }),
    );
  };

  return (
    <svg
      {...uiProps("chart-plot", "", props)}
      viewBox={() => `0 0 ${String(geometry().w)} ${String(geometry().h)}`}
      width="100%"
      // The plot takes the space the legend does not, and `min-height: 0` is
      // what stops a flex child refusing to shrink below its content.
      style={{ flex: "1", "min-height": "0" }}
      preserveAspectRatio="none"
      role="img"
      aria-label={() => props["aria-label"]?.() ?? "Chart"}
    >
      <Frame
        geometry={geometry()}
        labels={props.data().map((row) => String(row[props.x()] ?? ""))}
      />
      <For each={() => config()}>
        {(series: ChartSeries) => (
          <g data-slot="chart-bar" style={{ "--color-series": `var(--color-${series.key})` }}>
            <For each={() => bars().filter((bar) => bar.key.endsWith(series.key))}>
              {(bar: { x: number; y: number; width: number; height: number }) => (
                <rect
                  class={barMark}
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  rx="2"
                />
              )}
            </For>
          </g>
        )}
      </For>
    </svg>
  );
}

/** A line per series, with the area beneath it. */
export function ChartLines(props: Incoming<ChartPlotProps & { area?: boolean }>) {
  const { config } = useChart();
  const geometry = (): Geometry =>
    geometryOf({
      data: props.data(),
      config: config(),
      width: props.width?.() ?? 320,
      height: props.height?.() ?? 160,
    });

  const pathOf = (key: string, closed: boolean): string => {
    const g = geometry();
    const rows = props.data();
    const plot = g.h - g.pad * 2;
    const step = (g.w - g.pad - 4) / Math.max(1, rows.length);
    const points = rows.map((row, index) => {
      const value = Number(row[key] ?? 0);
      return [g.pad + step * (index + 0.5), g.pad + plot - (value / g.max) * plot] as const;
    });
    if (points.length === 0) return "";
    const line = points
      .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");
    if (!closed) return line;
    const first = points[0];
    const last = points.at(-1);
    if (first === undefined || last === undefined) return line;
    return `${line} L${last[0].toFixed(1)},${(g.pad + plot).toFixed(1)} L${first[0].toFixed(1)},${(g.pad + plot).toFixed(1)} Z`;
  };

  return (
    <svg
      {...uiProps("chart-plot", "", props)}
      viewBox={() => `0 0 ${String(geometry().w)} ${String(geometry().h)}`}
      width="100%"
      // The plot takes the space the legend does not, and `min-height: 0` is
      // what stops a flex child refusing to shrink below its content.
      style={{ flex: "1", "min-height": "0" }}
      preserveAspectRatio="none"
      role="img"
      aria-label={() => props["aria-label"]?.() ?? "Chart"}
    >
      <Frame
        geometry={geometry()}
        labels={props.data().map((row) => String(row[props.x()] ?? ""))}
      />
      <For each={() => config()}>
        {(series: ChartSeries) => (
          <g style={{ "--color-series": `var(--color-${series.key})` }}>
            {props.area?.() === true ? (
              <g data-slot="chart-area">
                <path class={areaMark} d={pathOf(series.key, true)} />
              </g>
            ) : null}
            <g data-slot="chart-line">
              <path class={lineMark} d={pathOf(series.key, false)} />
            </g>
          </g>
        )}
      </For>
    </svg>
  );
}

export function ChartLegend(props: Incoming<UiProps>) {
  const { config } = useChart();
  return (
    <div {...uiProps("chart-legend", legend, props)}>
      <For each={() => config()}>
        {(series: ChartSeries) => (
          <div class={legendItem} data-slot="chart-legend-item">
            <span
              class={legendSwatch}
              data-slot="chart-legend-swatch"
              style={{ background: `var(--color-${series.key})` }}
            />
            {series.label}
          </div>
        )}
      </For>
    </div>
  );
}

export interface ChartTooltipProps extends UiProps {
  label?: string;
  items: readonly { key: string; label: string; value: string | number }[];
}

/**
 * The panel a chart shows beside the pointer.
 *
 * A component rather than something the plot renders, because what a tooltip
 * says is the application's decision: shadcn's takes a formatter for the same
 * reason and this takes the rows already formatted.
 */
export function ChartTooltipContent(props: Incoming<ChartTooltipProps>) {
  return (
    <div {...uiProps("chart-tooltip", tooltip, props)}>
      {props.label?.() === undefined ? null : (
        <div class={tooltipValue} data-slot="chart-tooltip-label">
          {props.label()}
        </div>
      )}
      <For each={() => props.items()}>
        {(item: { key: string; label: string; value: string | number }) => (
          <div class={tooltipRow} data-slot="chart-tooltip-row">
            <span
              class={tooltipIndicator}
              data-slot="chart-tooltip-indicator"
              style={{ background: `var(--color-${item.key})` }}
            />
            <span class={tooltipName}>{item.label}</span>
            <span class={tooltipValue}>{item.value}</span>
          </div>
        )}
      </For>
    </div>
  );
}

/** The state a chart with a live tooltip keeps, for an application that wants one. */
export function chartHover(): {
  at: () => number | null;
  set: (index: number | null) => void;
} {
  const at = signal<number | null>(null);
  return { at, set: (index) => at.set(index) };
}
