import {
  createContext,
  createMemo,
  createTrackedEffect,
  createUniqueId,
  Dynamic,
  For,
  getContext,
  onCleanup,
  onSettled,
  provide,
  createSignal,
  Show,
  type Accessor,
  type Child,
  type Component,
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

import type { ChartPoint, DomChartDefinition } from "@tanstack/charts/types";

import "../theme/layers.ts";
import { omit, uiProps } from "../lib/slot.ts";

import type { UiProps } from "../lib/props.ts";
import { mergeRefs } from "@barqjs/primitives/refs";

const ui = layer("barq.ui");

const chart = ui({
  // The tooltip is placed against this box, from where the plot says the
  // focused point is.
  position: "relative",
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
  '[data-indicator="dot"]': {
    alignItems: "center",
  },
  "& > svg": {
    height: "10px",
    width: "10px",
    color: "var(--muted-foreground)",
  },
});

const tooltipIndicator = ui({
  flexShrink: "0",
  borderRadius: "2px",
  '[data-indicator="dot"]': {
    width: "10px",
    height: "10px",
  },
  '[data-indicator="line"]': {
    width: "4px",
  },
  // A rule drawn with its own border, so there is nothing behind it to fill.
  '[data-indicator="dashed"]': {
    width: "0px",
    borderWidth: "1.5px",
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
  '[data-indicator="dashed"][data-nested]': {
    marginBlock: "calc(var(--spacing) * 0.5)",
  },
});

const tooltipText = ui({
  display: "flex",
  flex: "1",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  lineHeight: "1",
  "&[data-nested]": {
    alignItems: "flex-end",
  },
});

const tooltipNames = ui({ display: "grid", gap: "calc(var(--spacing) * 1.5)" });

const tooltipName = ui({ color: "var(--muted-foreground)" });

const tooltipLabel = ui({
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
});

const tooltipValue = ui({
  fontFamily: "var(--font-mono)",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  color: "var(--foreground)",
  "--ui-numeric-spacing": "tabular-nums",
  fontVariantNumeric:
    "var(--ui-ordinal,) var(--ui-slashed-zero,) var(--ui-numeric-figure,) var(--ui-numeric-spacing,) var(--ui-numeric-fraction,)",
});

/**
 * The tooltip's place over the plot.
 *
 * `top` and `left`, not their logical names: the point it follows is reported
 * in the scene's own pixels, measured from the left whichever way the page
 * reads, and a chart is not mirrored right to left.
 */
const popup = ui({
  position: "absolute",
  top: "0px",
  left: "0px",
  zIndex: "50",
  // Over the plot and never in its way: a tooltip that takes the pointer hides
  // the point it is describing from the very pointer that found it.
  pointerEvents: "none",
  '[data-state="closed"]': {
    visibility: "hidden",
  },
});

const legend = ui({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "calc(var(--spacing) * 4)",
  paddingTop: "calc(var(--spacing) * 3)",
  // Above the plot, which in a column is a matter of order, with the gap on
  // the side that now faces the drawing.
  '[data-align="top"]': {
    order: "-1",
    paddingTop: "0px",
    paddingBottom: "calc(var(--spacing) * 3)",
  },
});

const legendItem = ui({
  display: "flex",
  alignItems: "center",
  gap: "calc(var(--spacing) * 1.5)",
  "& > svg": {
    height: "calc(var(--spacing) * 3)",
    width: "calc(var(--spacing) * 3)",
    color: "var(--muted-foreground)",
  },
});

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

/** The colour schemes a series can name a colour for, and the selector each one is under. */
const THEMES = { light: "", dark: ".dark" } as const;

export type ChartTheme = keyof typeof THEMES;

const SCHEMES: readonly ChartTheme[] = ["light", "dark"];

export interface ChartConfigEntry {
  readonly label?: string;
  /** Drawn in the legend and the tooltip instead of the colour swatch. */
  readonly icon?: Component;
  /** Any colour. `var(--chart-1)` is what a theme's own ramp is called. */
  readonly color?: string;
  /** A colour per scheme, for a series whose colour is not a theme token. Wins over `color`. */
  readonly theme?: Readonly<Record<ChartTheme, string>>;
}

/** One series as a chart reads it, whichever shape it was written in. */
interface Series extends ChartConfigEntry {
  /** The key of the value this series reads out of each datum. */
  readonly key: string;
}

export interface ChartSeries extends Series {
  readonly label: string;
  readonly color: string;
}

/** The series a chart draws, as a list in drawing order. */
export type ChartConfig = readonly ChartSeries[];

/**
 * shadcn's shape for the same thing: an object keyed by the field each series
 * reads, drawn in the order the keys were written.
 */
export type ChartConfigRecord = Readonly<Record<string, ChartConfigEntry>>;

type AnyChartConfig = ChartConfig | ChartConfigRecord;

const isList = (config: AnyChartConfig): config is ChartConfig => Array.isArray(config);

function seriesOf(config: AnyChartConfig): readonly Series[] {
  if (isList(config)) return config;
  return Object.entries(config).map(([key, entry]) => ({ key, ...entry }));
}

/** A caller's style without the properties it left unset, which an element's style cannot hold. */
function declared(style: UiProps["style"]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(style ?? {})) {
    if (value !== undefined) out[name] = value;
  }
  return out;
}

/** What a tooltip or a legend is told about one series at one point. */
export interface ChartPayloadItem {
  /** The field of the datum the value came from, which is the series key. */
  readonly dataKey?: string;
  readonly name?: string;
  readonly value?: string | number;
  readonly color?: string;
  /** The datum the point was drawn from. */
  readonly payload?: Readonly<Record<string, unknown>>;
  /** `"none"` leaves the entry out. */
  readonly type?: string;
}

interface ChartFocus {
  readonly label: string;
  readonly payload: readonly ChartPayloadItem[];
  /** Where the focused point is, in px from the container's top left. */
  readonly x: number;
  readonly y: number;
}

interface ChartValue {
  readonly config: () => readonly Series[];
  readonly focus: Accessor<ChartFocus | null>;
  readonly setFocus: (focus: ChartFocus | null) => void;
  /** Whether a tooltip is there to show what gets the focus. */
  readonly isWatched: Accessor<boolean>;
  /** Whether that tooltip wants the plot's own ring round the focused point. */
  readonly hasCursor: Accessor<boolean>;
  /** A tooltip announcing itself. Returns what takes the announcement back. */
  readonly watch: (cursor: Accessor<boolean>) => () => void;
}

const ChartContext = createContext<ChartValue | null>(null);

function useChart(): ChartValue {
  const value = getContext(ChartContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a <ChartContainer>.");
  }
  return value;
}

/**
 * The config entry a payload item belongs to.
 *
 * `key` names a field. If the item, or the datum behind it, holds a string
 * there, that string is the entry's name: a pie's slice says `browser:
 * "chrome"` and is styled by the `chrome` entry. Otherwise the key itself is.
 */
function entryFor(
  config: readonly Series[],
  item: ChartPayloadItem | undefined,
  key: string,
): Series | undefined {
  if (item === undefined) return undefined;
  const own: Readonly<Record<string, unknown>> = { ...item };
  const direct = own[key];
  const nested = item.payload?.[key];
  let name = key;
  if (typeof direct === "string") name = direct;
  else if (typeof nested === "string") name = nested;
  return (
    config.find((series) => series.key === name) ?? config.find((series) => series.key === key)
  );
}

export interface ChartContainerProps extends UiProps {
  config: ChartConfig | ChartConfigRecord;
}

/**
 * ```tsx
 * <ChartContainer config={{ sales: { label: "Sales", color: "var(--chart-1)" } }}>
 *   <ChartBars data={rows} x="month" />
 *   <ChartTooltip />
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
 *
 * A plain `color` is written on the element. A `theme` cannot be: an inline
 * style has no way to differ under `.dark`, so those series get a rule per
 * scheme from {@link ChartStyle}, addressed to this chart by `data-chart`.
 */
export function ChartContainer(props: Incoming<ChartContainerProps>) {
  const generated = createUniqueId();
  const chartId = (): string => `chart-${props.id?.() ?? generated.replace(/:/g, "")}`;
  const series = (): readonly Series[] => seriesOf(props.config());

  // `ownedWrite` on both: a tooltip announces itself from its own body, and
  // the host reports a cleared focus from inside the update that cleared it.
  const [focus, setFocus] = createSignal<ChartFocus | null>(null, { ownedWrite: true });
  const [watchers, setWatchers] = createSignal<readonly Accessor<boolean>[]>([], {
    ownedWrite: true,
  });
  const value: ChartValue = {
    config: series,
    focus,
    setFocus: (next) => setFocus(() => next),
    isWatched: () => watchers().length > 0,
    hasCursor: () => watchers().some((cursor) => cursor()),
    watch(cursor) {
      setWatchers((current) => [...current, cursor]);
      return () => setWatchers((current) => current.filter((each) => each !== cursor));
    },
  };

  const themed = (): ChartConfigRecord =>
    Object.fromEntries(
      series()
        .filter((entry) => entry.theme !== undefined)
        .map((entry) => [entry.key, entry]),
    );

  return (
    <div
      {...uiProps("chart", chart, omit(props, ["id"]))}
      data-chart={chartId()}
      style={() => ({
        ...Object.fromEntries(
          series().flatMap((entry, at) => {
            const paint = entry.theme === undefined ? entry.color : `var(--color-${entry.key})`;
            if (paint === undefined) return [];
            const palette: [string, string][] = [[`--ts-chart-${String(at + 1)}`, paint]];
            if (entry.theme === undefined) palette.unshift([`--color-${entry.key}`, paint]);
            return palette;
          }),
        ),
        ...declared(props.style?.()),
      })}
    >
      <ChartStyle id={chartId()} config={themed()} />
      <ChartProvider value={value}>{props.children}</ChartProvider>
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
function ChartProvider(props: Incoming<{ value: ChartValue; children?: Child }>) {
  return provide(
    ChartContext,
    () => props.value(),
    () => props.children,
  );
}

export interface ChartStyleProps {
  /** The chart's `data-chart` value, which the rules are addressed to. */
  id: string;
  config: ChartConfig | ChartConfigRecord;
}

/**
 * The series colours as rules, one block per colour scheme.
 *
 * `<ChartContainer>` renders this for the series that name a `theme`. On its
 * own it writes every coloured series, which is upstream's, for a chart whose
 * container is not this package's.
 */
export function ChartStyle(props: Incoming<ChartStyleProps>) {
  const rules = (): string => {
    const coloured = seriesOf(props.config()).filter(
      (entry) => entry.theme !== undefined || entry.color !== undefined,
    );
    if (coloured.length === 0) return "";
    return SCHEMES.map((scheme) => {
      const declarations = coloured
        .map((entry) => {
          const paint = entry.theme?.[scheme] ?? entry.color;
          return paint === undefined ? "" : `  --color-${entry.key}: ${paint};`;
        })
        .filter((line) => line !== "")
        .join("\n");
      return `\n${THEMES[scheme]} [data-chart=${props.id()}] {\n${declarations}\n}\n`;
    }).join("\n");
  };

  return (
    <Show when={rules() !== ""}>
      <style dangerouslySetInnerHTML={{ __html: rules() }} />
    </Show>
  );
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
  /**
   * The points that have the focus, from the pointer or the keyboard, and
   * where this chart's box starts inside its container. Empty when none has.
   */
  onFocusGroupChange?: (points: readonly ChartPoint[], origin: ChartOrigin) => void;
  onSelect?: (point: ChartPoint | null) => void;
}

/** A chart's own top left corner, in px from its positioned ancestor's. */
export interface ChartOrigin {
  readonly x: number;
  readonly y: number;
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
  const [measured, setMeasured] = createSignal(0);
  resizeObserver(
    () => node() as Element | null,
    () => {
      const element = node();
      if (element === null || element === undefined) return;
      const height = Math.round(element.getBoundingClientRect().height);
      if (height > 0) setMeasured(height);
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
    onFocusGroupChange: (points) => {
      const element = node();
      props.onFocusGroupChange?.()?.(points, {
        x: element?.offsetLeft ?? 0,
        y: element?.offsetTop ?? 0,
      });
    },
    onSelect: (point) => props.onSelect?.()?.(point),
  });

  const built = optionsOf();
  const adapter = createChartAdapter(built);
  const markup = adapter.prerender();

  let mounted = false;
  // What changed between the markup being written and the host taking it
  // over: a tooltip rendered after the plot asks for grouped focus in exactly
  // that gap, and an update the effect could not deliver is delivered here.
  let stale = false;
  onSettled(() => {
    const element = node();
    if (element === null || element === undefined) return;
    adapter.mount(element);
    mounted = true;
    if (stale) {
      stale = false;
      adapter.update(optionsOf());
    }
  });

  // Only after the mount: an update before it re-runs `prerender` work the
  // markup above already holds. The first run of the effect is usually the
  // value the adapter was built with, and the definition's identity says
  // whether it is: a sibling built after this one may already have changed it.
  let first = true;
  createTrackedEffect(() => {
    const options = optionsOf();
    if (first) {
      first = false;
      if (options.definition === built.definition) return;
    }
    if (mounted) adapter.update(options);
    else stale = true;
  });

  // The host holds a resize observer and pointer listeners on the container, so
  // a route that leaves without this keeps measuring a plot that is gone.
  onCleanup(() => adapter.destroy());

  return (
    <div
      {...uiProps("chart-surface", surface, props)}
      ref={mergeRefs(node.set, props.ref?.())}
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
  /** The caller's own datum, which a tooltip's formatter is handed. */
  readonly row: Readonly<Record<string, string | number>>;
}

const isPoint = (datum: unknown): datum is Point =>
  typeof datum === "object" && datum !== null && "series" in datum && "row" in datum;

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
  config: readonly Series[],
  x: string,
): Point[] {
  return data.flatMap((row) =>
    config.map((series) => ({
      x: String(row[x] ?? ""),
      series: series.key,
      value: Number(row[series.key] ?? 0),
      row,
    })),
  );
}

/**
 * What a tooltip is told about the points that have the focus.
 *
 * The scene reports them in its own pixels. The topmost of the group is where
 * the tooltip goes, so it sits beside the tallest mark rather than over one.
 */
function focusOf(points: readonly ChartPoint[], origin: ChartOrigin): ChartFocus | null {
  const first = points[0];
  if (first === undefined || !isPoint(first.datum)) return null;
  return {
    label: first.datum.x,
    payload: points.flatMap((point): ChartPayloadItem[] =>
      isPoint(point.datum)
        ? [
            {
              dataKey: point.datum.series,
              name: point.datum.series,
              value: point.datum.value,
              color: `var(--color-${point.datum.series})`,
              payload: point.datum.row,
            },
          ]
        : [],
    ),
    x: origin.x + first.x,
    y: origin.y + Math.min(...points.map((point) => point.y)),
  };
}

/**
 * What a plot adds to its definition while a tooltip is listening.
 *
 * Grouped by column, because a tooltip compares the series at one position.
 * Without a tooltip nothing changes: focus stays the nearest single point.
 */
function focusOptions(scope: ChartValue): { focus?: "group-x"; focusRing?: boolean } {
  return scope.isWatched() ? { focus: "group-x", focusRing: scope.hasCursor() } : {};
}

/** The colour scale, as the series names rather than the colours behind them. */
function colorScale(config: readonly Series[]): {
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
  const scope = useChart();
  const { config } = scope;

  // A memo, so the definition keeps its identity until something it is made
  // from changes: identity is what `<Chart>` updates on.
  const definition = createMemo((): ChartDefinition =>
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
      ...focusOptions(scope),
    }),
  );

  return (
    <Chart
      {...props}
      definition={definition()}
      ariaLabel={props["aria-label"]?.() ?? "Chart"}
      height={props.height?.()}
      onFocusGroupChange={(points, origin) => scope.setFocus(focusOf(points, origin))}
    />
  );
}

/** A path per series, optionally filled to the axis. */
export function ChartLines(props: Incoming<ChartPlotProps & { area?: boolean }>) {
  const scope = useChart();
  const { config } = scope;

  const definition = createMemo((): ChartDefinition => {
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
      ...focusOptions(scope),
    });
  });

  return (
    <Chart
      {...props}
      definition={definition()}
      ariaLabel={props["aria-label"]?.() ?? "Chart"}
      height={props.height?.()}
      onFocusGroupChange={(points, origin) => scope.setFocus(focusOf(points, origin))}
    />
  );
}

export interface ChartLegendContentProps extends UiProps {
  /** Show the swatch even for a series that has an icon. @default false */
  hideIcon?: boolean;
  /** The field of each entry, or of its datum, that names its config entry. @default "dataKey" */
  nameKey?: string;
  /** Above the plot or below it. @default "bottom" */
  verticalAlign?: "top" | "bottom";
  /** The entries. @default one per series in the config */
  payload?: readonly ChartPayloadItem[];
}

/** The key: a swatch or an icon and a label for each series. */
export function ChartLegendContent(props: Incoming<ChartLegendContentProps>) {
  const { config } = useChart();
  const entries = (): readonly ChartPayloadItem[] =>
    (
      props.payload?.() ??
      config().map((series): ChartPayloadItem => ({
        dataKey: series.key,
        value: series.key,
        color: `var(--color-${series.key})`,
      }))
    ).filter((item) => item.type !== "none");
  const entryOf = (item: ChartPayloadItem): Series | undefined =>
    entryFor(config(), item, props.nameKey?.() ?? item.dataKey ?? "value");

  return (
    <Show when={entries().length > 0}>
      <div
        {...uiProps("chart-legend", legend, props)}
        data-align={props.verticalAlign?.() ?? "bottom"}
      >
        <For each={() => entries()}>
          {(item: ChartPayloadItem) => (
            <div class={legendItem} data-slot="chart-legend-item">
              <Show
                when={props.hideIcon?.() !== true && entryOf(item)?.icon !== undefined}
                fallback={
                  <span
                    class={legendSwatch}
                    data-slot="chart-legend-swatch"
                    style={{ background: item.color }}
                  />
                }
              >
                <Dynamic component={entryOf(item)?.icon} />
              </Show>
              {entryOf(item)?.label}
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

export interface ChartLegendProps extends ChartLegendContentProps {
  /** What to draw instead of the default `<ChartLegendContent />`. */
  content?: Child;
}

/**
 * The legend's place in the chart.
 *
 * ```tsx
 * <ChartLegend />
 * <ChartLegend content={<ChartLegendContent nameKey="browser" hideIcon />} />
 * ```
 *
 * On its own it is a `<ChartLegendContent>` given the same props. With
 * `content`, that is drawn in its place, and where it goes is the content's
 * own `verticalAlign`: nothing is cloned here to pass one down.
 */
export function ChartLegend(props: Incoming<ChartLegendProps>) {
  return (
    <>
      {props.content === undefined
        ? (props.children ?? <ChartLegendContent {...props} />)
        : props.content()}
    </>
  );
}

export type ChartTooltipIndicator = "line" | "dot" | "dashed";

export interface ChartTooltipContentProps extends UiProps {
  /** Whether there is a point to describe. @default whether the chart has a focused point */
  active?: boolean;
  /** The rows. @default the focused point's, from the chart */
  payload?: readonly ChartPayloadItem[];
  /** The heading. @default the focused column's own label */
  label?: string;
  /** Rows already named and formatted, for a panel that is not driven by a chart. */
  items?: readonly { key: string; label: string; value: string | number }[];
  /** @default "dot" */
  indicator?: ChartTooltipIndicator;
  hideLabel?: boolean;
  hideIndicator?: boolean;
  /** Writes the heading from the label and the rows under it. */
  labelFormatter?: (label: string | undefined, payload: readonly ChartPayloadItem[]) => Child;
  labelClass?: string;
  /** Writes a whole row, in place of the indicator, the name and the value. */
  formatter?: (
    value: string | number,
    name: string,
    item: ChartPayloadItem,
    index: number,
    payload: Readonly<Record<string, unknown>> | undefined,
  ) => Child;
  /** One colour for every indicator, in place of each series' own. */
  color?: string;
  /** The field of each row, or of its datum, that names its config entry. */
  nameKey?: string;
  /** The field that names the config entry the heading is taken from. */
  labelKey?: string;
}

/** The content's props under the name they had before `<ChartTooltip>` existed. */
export type ChartTooltipProps = ChartTooltipContentProps;

/**
 * What a tooltip says: a heading, and a row per series.
 *
 * Inside a `<ChartTooltip>` it describes the point that has the focus. Given a
 * `payload` or `items` of its own it describes those, which is what makes it
 * usable beside a chart, in a table cell or in a story, with no plot at all.
 */
export function ChartTooltipContent(props: Incoming<ChartTooltipContentProps>) {
  const scope = getContext(ChartContext) ?? null;
  const config = (): readonly Series[] => scope?.config() ?? [];
  const indicator = (): ChartTooltipIndicator => props.indicator?.() ?? "dot";

  const rows = (): readonly ChartPayloadItem[] => {
    const given = props.payload?.();
    if (given !== undefined) return given;
    const items = props.items?.();
    if (items !== undefined) {
      return items.map((item) => ({
        dataKey: item.key,
        name: item.label,
        value: item.value,
        color: `var(--color-${item.key})`,
      }));
    }
    return scope?.focus()?.payload ?? [];
  };
  const shown = (): readonly ChartPayloadItem[] => rows().filter((item) => item.type !== "none");
  const active = (): boolean => {
    const given = props.active?.();
    if (given !== undefined) return given;
    if (props.payload?.() !== undefined || props.items?.() !== undefined) return true;
    return scope !== null && scope.focus() !== null;
  };

  const heading = (): Child => {
    const first = rows()[0];
    if (props.hideLabel?.() === true || first === undefined) return undefined;
    const label = props.label?.() ?? scope?.focus()?.label;
    const labelKey = props.labelKey?.();
    const named =
      labelKey === undefined && label !== undefined
        ? (config().find((series) => series.key === label)?.label ?? label)
        : entryFor(config(), first, labelKey ?? first.dataKey ?? first.name ?? "value")?.label;
    const format = props.labelFormatter?.();
    if (format !== undefined) return format(named, rows());
    return named === undefined || named === "" ? undefined : named;
  };
  // One row with a rule beside it reads as a single sentence, so the heading
  // goes inside the row, above the name, rather than over the whole panel.
  const nested = (): boolean => rows().length === 1 && indicator() !== "dot";
  const headingElement = (): Child => {
    const text = heading();
    if (text === undefined || text === null) return undefined;
    return (
      <div class={ui(tooltipLabel, props.labelClass?.())} data-slot="chart-tooltip-label">
        {text}
      </div>
    );
  };

  const entryOf = (item: ChartPayloadItem): Series | undefined =>
    entryFor(config(), item, props.nameKey?.() ?? item.name ?? item.dataKey ?? "value");
  const paintOf = (item: ChartPayloadItem): string | undefined => {
    const fill = item.payload?.fill;
    return props.color?.() ?? (typeof fill === "string" ? fill : item.color);
  };
  const formatted = (item: ChartPayloadItem, index: number): Child => {
    const format = props.formatter?.();
    if (format === undefined || item.value === undefined) return undefined;
    if (item.name === undefined || item.name === "") return undefined;
    return format(item.value, item.name, item, index, item.payload);
  };
  const written = (value: string | number): string =>
    typeof value === "number" ? value.toLocaleString() : value;

  return (
    <Show when={active() && shown().length > 0}>
      <div {...uiProps("chart-tooltip", tooltip, props)}>
        <Show when={!nested()}>{headingElement()}</Show>
        <div class={tooltipNames}>
          <For each={() => shown().map((item, index) => ({ item, index }))}>
            {(row: { item: ChartPayloadItem; index: number }) => (
              <div class={tooltipRow} data-slot="chart-tooltip-row" data-indicator={indicator()}>
                <Show
                  when={formatted(row.item, row.index) === undefined}
                  fallback={formatted(row.item, row.index)}
                >
                  <Show
                    when={entryOf(row.item)?.icon === undefined}
                    fallback={<Dynamic component={entryOf(row.item)?.icon} />}
                  >
                    <Show when={props.hideIndicator?.() !== true}>
                      <span
                        class={tooltipIndicator}
                        data-slot="chart-tooltip-indicator"
                        data-indicator={indicator()}
                        data-nested={nested() ? "" : undefined}
                        style={
                          indicator() === "dashed"
                            ? { "border-color": paintOf(row.item) }
                            : { background: paintOf(row.item) }
                        }
                      />
                    </Show>
                  </Show>
                  <div class={tooltipText} data-nested={nested() ? "" : undefined}>
                    <div class={tooltipNames}>
                      <Show when={nested()}>{headingElement()}</Show>
                      <span class={tooltipName}>{entryOf(row.item)?.label ?? row.item.name}</span>
                    </div>
                    <Show when={row.item.value !== undefined}>
                      <span class={tooltipValue}>{written(row.item.value ?? "")}</span>
                    </Show>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}

export interface ChartTooltipPopupProps extends UiProps {
  /** What to show. @default `<ChartTooltipContent />` */
  content?: Child;
  /** Draw the plot's own ring round the focused point. @default true */
  cursor?: boolean;
  /** How far from the point it sits, in px. @default 10 */
  offset?: number;
}

/**
 * The tooltip that follows the focused point.
 *
 * ```tsx
 * <ChartContainer config={config}>
 *   <ChartBars data={rows} x="month" />
 *   <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
 * </ChartContainer>
 * ```
 *
 * Rendering one is what switches the plots beside it to grouped focus: the
 * pointer over a column, or the arrow keys on the focused drawing, select every
 * series at that position and this shows them. It is a `status`, so the column
 * the keyboard lands on is read out, which is the only way a screen reader
 * gets the numbers out of a drawing.
 */
export function ChartTooltip(props: Incoming<ChartTooltipPopupProps>) {
  const scope = useChart();
  const node = makeRef<HTMLDivElement>();
  onCleanup(scope.watch(() => props.cursor?.() !== false));

  const place = (): Record<string, string> => {
    const focus = scope.focus();
    if (focus === null) return {};
    const gap = props.offset?.() ?? 10;
    const element = node();
    const width = element?.offsetWidth ?? 0;
    const room = element?.parentElement?.clientWidth ?? 0;
    // To the right of the point, unless that would run it off the scope.
    const overflows = room > 0 && focus.x + gap + width > room;
    const left = overflows ? Math.max(0, focus.x - gap - width) : focus.x + gap;
    const top = Math.max(0, focus.y + gap);
    return { transform: `translate(${String(left)}px, ${String(top)}px)` };
  };

  return (
    <div
      {...uiProps("chart-tooltip-popup", popup, props)}
      ref={mergeRefs(node.set, props.ref?.())}
      role="status"
      data-state={() => (scope.focus() === null ? "closed" : "open")}
      style={() => ({ ...declared(props.style?.()), ...place() })}
    >
      {props.content === undefined ? (props.children ?? <ChartTooltipContent />) : props.content()}
    </div>
  );
}

/** The state a chart with a live tooltip keeps, for an application that wants one. */
export function chartHover(): {
  at: () => number | null;
  set: (index: number | null) => void;
} {
  const [at, setAt] = createSignal<number | null>(null);
  return { at, set: (index) => setAt(index) };
}
