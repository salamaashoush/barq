import {
  context,
  effect,
  For,
  getContext,
  getOwner,
  onCleanup,
  onMount,
  provide,
  signal,
  type Child,
  type Incoming,
} from "@barqjs/core";
import { layer } from "@barqjs/css";
import { resizeObserver } from "@barqjs/primitives/observers";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { createChartAdapter } from "@tanstack/charts/adapter";
import { areaY, barY, defineChart, group, lineY } from "@tanstack/charts";

import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";

import type { DomChartDefinition } from "@tanstack/charts/types";

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

/**
 * The box the scene fills, and the scene taken out of the flow to fill it.
 *
 * The host writes the measured size onto the SVG, so an SVG in the flow is what
 * decides the box that was supposed to decide the SVG: the first frame's
 * default 320 made the container 320 tall, which measured as 320, which kept
 * the default forever. Positioning the scene absolutely breaks the loop — the
 * box is the flex remainder and nothing else — and `height: 0` is what makes
 * `flex-grow` mean "the remainder" rather than "the remainder plus my content".
 */
const surface = ui({ position: "relative", width: "100%", flexGrow: "1", height: "0" });

const scene = ui({ position: "absolute", inset: "0" });

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

/** The axis type size, in scene units, which the guides are told directly. */
export const AXIS_FONT_SIZE = 10;

/**
 * What the scene paints with, in this package's own tokens.
 *
 * A theme colour reaches the renderer as a paint string and lands on the node
 * as a presentation attribute or a style, and `var()` resolves in both, so a
 * token survives the trip intact. That is the whole reason a chart can follow a
 * style switch without being rebuilt: nothing here holds a colour, only the
 * name of one.
 */
const THEME = {
  foreground: "var(--foreground)",
  muted: "var(--muted-foreground)",
  grid: "var(--border)",
  background: "transparent",
} as const;

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
 * shadcn's chart is a recharts wrapper and recharts is React to its
 * foundations — hooks, context and `cloneElement` over its own children — so
 * there is nothing of it to take. The engine here is TanStack Charts, whose DOM
 * host is framework-neutral by construction: it takes a container and a
 * definition and owns measurement, scene updates, interaction and teardown.
 *
 * What is kept exactly is the CONFIG shape and what it produces: a series
 * becomes `--color-<key>`, and the scene's colour scale reads those names
 * rather than colours, so one rule restyles a whole series and a theme's ramp
 * reaches the chart without the chart knowing about the theme. The same names
 * are published as `--ts-chart-N`, which is what the library's own palette
 * reads when a mark does not name a series.
 */
export function ChartContainer(props: Incoming<ChartContainerProps>) {
  return (
    <div
      {...uiProps("chart", chart, props)}
      style={() =>
        Object.fromEntries(
          props.config().flatMap((series, at) => [
            [`--color-${series.key}`, series.color],
            [`--ts-chart-${at + 1}`, series.color],
          ]),
        )
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

/**
 * What a `<Chart>` mounts.
 *
 * The host's own definition type rather than `ReturnType<typeof defineChart>`:
 * `defineChart` is generic in the datum and both coordinates, so its return
 * type is a different type per call and nothing could be assigned to a prop
 * declared as one of them. This is the type the DOM host accepts, which is
 * exactly the contract a caller has to meet.
 */
export type ChartDefinition = DomChartDefinition;

export interface ChartProps extends UiProps {
  /** A `defineChart(...)` result. Its IDENTITY is the update boundary. */
  definition: ChartDefinition;
  /** Names the chart for a screen reader. Required, as the host requires it. */
  ariaLabel: string;
  /** @default the container's own height */
  height?: number;
  aspectRatio?: number;
  /** The width the server and the first frame draw at, before measurement. */
  initialWidth?: number;
}

/**
 * One chart, mounted.
 *
 * The markup is the host's own `prerender()` on both sides, so the server
 * writes the scene it would draw and the client adopts those exact bytes rather
 * than replacing them: `dangerouslySetInnerHTML` skips its write while
 * hydrating when the html already matches, and `mount` takes over the shell the
 * renderer finds. A chart that rendered client-side only would leave a hole in
 * the document the size of the plot until JavaScript arrived.
 *
 * The definition's IDENTITY is the update boundary the library documents, so
 * the effect below reads `props.definition()` and nothing else: a new
 * definition updates the live host, and everything a definition captured stays
 * captured.
 */
export function Chart(props: Incoming<ChartProps>) {
  const node = makeRef<HTMLDivElement>();

  /**
   * The box's own height, because the host has no "follow the container" mode.
   *
   * It observes WIDTH and takes a height or an aspect ratio, which is right for
   * a chart the page sizes and wrong for one in a card that sizes itself: a
   * fixed 320 in a 190px slot drew a scene taller than its box and the axis
   * labels fell out of the bottom. Measuring here is the same answer the width
   * already gets, and `height` from the caller still wins.
   */
  const measured = signal(0);
  resizeObserver(
    () => node() as Element | null,
    () => {
      const element = node();
      if (element === null || element === undefined) return;
      const height = Math.round(element.getBoundingClientRect().height);
      if (height > 0) measured.set(height);
    },
  );

  const heightOf = (): number | undefined =>
    props.height?.() ?? (measured() > 0 ? measured() : undefined);

  const optionsOf = (): Parameters<typeof createChartAdapter>[0] => ({
    definition: props.definition(),
    ariaLabel: props.ariaLabel(),
    ...(heightOf() === undefined ? {} : { height: heightOf() }),
    ...(props.aspectRatio?.() === undefined ? {} : { aspectRatio: props.aspectRatio?.() }),
    initialWidth: props.initialWidth?.() ?? 640,
    className: scene,
  });

  const adapter = createChartAdapter(optionsOf());
  const markup = adapter.prerender();

  let mounted = false;
  onMount(() => {
    const element = node();
    if (element === null || element === undefined) return;
    adapter.mount(element);
    mounted = true;
  });

  // Only after the mount: an update before it re-runs `prerender` work the
  // markup above already holds, and the first run of an effect is the value
  // the adapter was built with.
  let first = true;
  effect(() => {
    const options = optionsOf();
    if (first) {
      first = false;
      return;
    }
    if (mounted) adapter.update(options);
  });

  // The host holds a resize observer and pointer listeners on the container, so
  // a route that leaves without this keeps measuring a plot that is gone.
  onCleanup(() => adapter.destroy());

  return (
    <div
      {...uiProps("chart-surface", surface, props)}
      ref={node.set}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
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

interface Point {
  readonly x: string;
  readonly series: string;
  readonly value: number;
}

/**
 * The wide rows an application holds, as the long rows a mark reads.
 *
 * A caller's datum is one column with a field per series, which is the shape a
 * table has and the shape shadcn's charts take. A mark groups by a CHANNEL, so
 * the same numbers have to arrive as one row per series per column. Folding
 * here rather than asking the caller to is what keeps `data` and `config` the
 * only two things a chart needs.
 */
function fold(
  data: readonly Record<string, string | number>[],
  config: ChartConfig,
  x: string,
): Point[] {
  return data.flatMap((row) =>
    config.map((series) => ({
      x: String(row[x] ?? ""),
      series: series.key,
      value: Number(row[series.key] ?? 0),
    })),
  );
}

/** The colour scale, as the series names rather than the colours behind them. */
function colorScale(config: ChartConfig): {
  domain: readonly string[];
  range: readonly string[];
} {
  return {
    domain: config.map((series) => series.key),
    range: config.map((series) => `var(--color-${series.key})`),
  };
}

/**
 * The tick labels, at this package's own size, thinned to what fits.
 *
 * `thin` is what stops twelve dates in a wide chart running into one another.
 * The old plotter estimated a label's width at `0.6em` a character and dropped
 * every Nth; the guide measures the text it is about to draw, which is the same
 * decision made from the real number.
 */
const TICK_LABELS = { fontSize: AXIS_FONT_SIZE, thin: true } as const;

const AXIS = { tickLabels: TICK_LABELS } as const;

/** A column per datum, one bar per series, side by side. */
export function ChartBars(props: Incoming<ChartPlotProps>) {
  const { config } = useChart();

  const definition = (): ChartDefinition =>
    defineChart({
      marks: [
        barY(fold(props.data(), config(), props.x()), {
          x: "x",
          y: "value",
          color: "series",
          layout: group(),
        }),
      ],
      scales: {
        x: { scale: scaleBand, axis: AXIS },
        y: { scale: scaleLinear, nice: true, grid: true, axis: AXIS },
      },
      color: colorScale(config()),
      theme: THEME,
    });

  return (
    <Chart
      {...props}
      definition={definition()}
      ariaLabel={props["aria-label"]?.() ?? "Chart"}
      height={props.height?.()}
    />
  );
}

/** A path per series, optionally filled to the axis. */
export function ChartLines(props: Incoming<ChartPlotProps & { area?: boolean }>) {
  const { config } = useChart();

  const definition = (): ChartDefinition => {
    const rows = fold(props.data(), config(), props.x());
    const line = lineY(rows, { x: "x", y: "value", z: "series", color: "series" });
    return defineChart({
      marks:
        props.area?.() === true
          ? [
              areaY(rows, { x: "x", y: "value", z: "series", color: "series", fillOpacity: 0.2 }),
              line,
            ]
          : [line],
      scales: {
        x: { scale: scalePoint, axis: AXIS },
        y: { scale: scaleLinear, nice: true, grid: true, axis: AXIS },
      },
      color: colorScale(config()),
      theme: THEME,
    });
  };

  return (
    <Chart
      {...props}
      definition={definition()}
      ariaLabel={props["aria-label"]?.() ?? "Chart"}
      height={props.height?.()}
    />
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
