import { For, Show, createMemo, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { controllable } from "@barqjs/aria/utils";
import {
  AXIS_FONT_SIZE,
  CHART_AXIS,
  CHART_THEME,
  Chart,
  type ChartConfig,
  type ChartDefinition,
  type ChartFocus,
  ChartLegend,
  ChartLegendContent,
  type ChartPayloadItem,
  ChartTooltip,
  useChart,
} from "@barqjs/ui/chart";
import { tokens } from "@barqjs/ui/theme/tokens";
import {
  areaY,
  barY,
  defineChart,
  dot,
  group,
  lineY,
  ruleX,
  ruleY,
  stack,
  text,
} from "@tanstack/charts";
import { decorative } from "@tanstack/charts/mark/decorative";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";

import { arcLayer as arc } from "../layer.ts";
import { parts } from "../lib/parts.ts";
import { bg, fg, gap, layout, plainList, rounded, space, type } from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { type AxisFormat, niceTicks, useAxisFormat } from "./chart-axis.ts";
import {
  type ChartBaseProps,
  ChartFrame,
  type TonedSeries,
  chartFrameParts,
  chartNumbers,
  chartTableParts,
  focusOf,
  seriesConfig,
  toneColour,
} from "./chart-frame.tsx";
import { LegendFilter } from "./legend-filter.tsx";
import { useArcMessages } from "./messages.ts";

export const comboChartStyles = variants({
  slots: {
    ...chartFrameParts,
    ...chartTableParts,
    plot: arc({}),
    legendFilter: arc(layout.fill),
    notes: arc(plainList, layout.column, gap[1], type.sm),
    note: arc(layout.row, gap[2], { alignItems: "baseline" }),
    marker: arc(
      layout.inlineCentre,
      layout.noShrink,
      rounded.full,
      bg.muted,
      fg.default,
      type.xs,
      type.numeric,
      {
        inlineSize: space.x5,
        blockSize: space.x5,
      },
    ),
    noteAt: arc(type.medium),
    noteText: arc(fg.muted),
  },
});

export type ComboChartSlots = ReturnType<typeof comboChartStyles>;

type Row = Readonly<Record<string, string | number>>;

/** A line's series: its field, name and colour, and how its points are marked. */
export interface LineSeries extends TonedSeries {
  /**
   * The field of each row naming its point's status, a key of the chart's
   * `statuses`: a run that failed drawn as a dot in the failure's tone.
   */
  status?: string;
}

/** What a point's status is called and the tone its dot is drawn in. */
export interface PointStatus {
  label: string;
  tone: Tone;
}

/** A value to read the series against, drawn as a dashed rule across the plot. */
export interface ChartReference {
  value: number;
  /** Its legend entry: `"Degraded above 800 ms"`, `"Target"`. */
  label: string;
  /** @default "neutral" */
  tone?: Tone;
  /** The scale it is on, with `dualAxis`. @default "y" */
  axis?: "y" | "y2";
}

/** A range of values to read the series against, drawn as a faint band across the plot. */
export interface ChartBand {
  from: number;
  to: number;
  label: string;
  /** @default "success" */
  tone?: Tone;
  /** @default "y" */
  axis?: "y" | "y2";
}

/** Something that happened at one column, numbered on the plot and written under it. */
export interface ChartAnnotation {
  /** The column, as its `x` field names it. */
  x: string;
  label: string;
  /** Where it sits: this value, or this series' value at the column. Neither, a rule down the column. */
  y?: number;
  series?: string;
}

export interface ComboChartProps extends ChartBaseProps<ComboChartSlots> {
  /** One object per column, each holding `x` and every series' key. */
  data: readonly Row[];
  /** The field that names each column. */
  x: string;
  /** The series drawn as bars, side by side. */
  bars?: readonly TonedSeries[];
  /** The series drawn as lines over them; `dashed` for a percentile or a forecast. */
  lines?: readonly LineSeries[];
  /** Stack the bars into one column rather than side by side. @default false */
  stacked?: boolean;
  /**
   * The lines read a scale of their own, drawn at the end: a rate over a
   * count, a price over a volume. @default false
   */
  dualAxis?: boolean;
  /** A dot on every point of every line. @default false */
  points?: boolean;
  /** The statuses a line's `status` field names. */
  statuses?: Readonly<Record<string, PointStatus>>;
  /** Values to read the series against: a budget, a target, a norm. */
  references?: readonly ChartReference[];
  /** Ranges to read the series against: a healthy range, a window. */
  bands?: readonly ChartBand[];
  /** Events at columns, numbered on the plot and listed under it. */
  annotations?: readonly ChartAnnotation[];
  /**
   * The value axis's ticks: the library's own, round steps from zero
   * (`"nice"`, see `niceTicks`), or exactly these. @default the library's
   */
  yTicks?: "nice" | readonly number[];
  /** How the value axis writes its ticks. @default "number" */
  yFormat?: AxisFormat;
  /** The second axis's ticks, with `dualAxis`. */
  y2Ticks?: "nice" | readonly number[];
  /** How the second axis writes its ticks. */
  y2Format?: AxisFormat;
  /** The column axis's title, and the table's first header. @default `x` */
  xLabel?: string;
  /** The value axis's title. */
  yLabel?: string;
  /** The second axis's title, with `dualAxis`. */
  y2Label?: string;
  /**
   * The key under the plot, or `"filter"`: a chip per series that hides or
   * shows it, folded into a menu in a narrow box. @default true
   */
  legend?: boolean | "filter";
  /** The series not drawn, by key: the caller's. */
  hidden?: readonly string[];
  defaultHidden?: readonly string[];
  onHiddenChange?: (hidden: readonly string[]) => void;
  /** @default true */
  tooltip?: boolean;
}

/**
 * Bars and lines over the same columns, on one value axis or two, with the
 * marks a monitoring chart reads them by.
 *
 * ```tsx
 * <ComboChart
 *   label="Response time"
 *   data={buckets}
 *   x="hour"
 *   lines={[
 *     { key: "p50", label: "p50" },
 *     { key: "p95", label: "p95", dashed: true, status: "outcome" },
 *   ]}
 *   statuses={{ failed: { label: "Failed", tone: "danger" } }}
 *   references={[{ value: 800, label: "Degraded above 800 ms", tone: "warning" }]}
 *   yTicks="nice"
 *   yFormat="duration"
 * />
 * ```
 *
 * On TanStack Charts inside ui's chart container: a tooltip compares every
 * series in a column, the arrow keys walk the columns, and the table holds
 * each value as written in the locale. A dashed line is dashed in the legend
 * too; a reference is a dashed rule and a band a faint range, each named in
 * the legend; a point's status is a dot in its tone, named in the legend,
 * the tooltip and the table; an annotation is numbered on the plot and
 * written under it. With `legend="filter"` the legend hides and shows the
 * series.
 */
export function ComboChart(props: ComboChartProps) {
  const messages = useArcMessages();
  const number = chartNumbers(props.formatOptions);
  const [hidden, setHidden] = controllable<readonly string[]>(
    () => props.hidden,
    () => untrack(() => props.defaultHidden) ?? [],
    (next) => props.onHiddenChange?.(next),
  );
  function cls(): ComboChartSlots {
    return parts(comboChartStyles(), props.classes);
  }
  function all(): readonly TonedSeries[] {
    return [...(props.bars ?? []), ...(props.lines ?? [])];
  }
  function statusLines(): readonly LineSeries[] {
    if (props.statuses === undefined) return [];
    return (props.lines ?? []).filter((line) => line.status !== undefined);
  }
  function extras(): ChartConfig {
    const statuses = Object.entries(props.statuses ?? {}).map(([name, status]) => ({
      key: `status-${name}`,
      label: status.label,
      color: toneColour(status.tone),
    }));
    const references = (props.references ?? []).map((reference, at) => ({
      key: `reference-${String(at)}`,
      label: reference.label,
      color: toneColour(reference.tone ?? "neutral"),
      dashed: true,
    }));
    const bands = (props.bands ?? []).map((band, at) => ({
      key: `band-${String(at)}`,
      label: band.label,
      color: toneColour(band.tone ?? "success"),
    }));
    return [...statuses, ...references, ...bands];
  }
  function statusWords(row: Row): string {
    const lines = statusLines();
    return lines
      .flatMap((line) => {
        const status = props.statuses?.[String(row[line.status ?? ""] ?? "")];
        if (status === undefined) return [];
        return [lines.length > 1 ? `${line.label}: ${status.label}` : status.label];
      })
      .join(", ");
  }
  function extraLegend(): readonly ChartPayloadItem[] {
    return extras().map((entry) => ({
      dataKey: entry.key,
      value: entry.key,
      color: `var(--color-${entry.key})`,
    }));
  }
  return (
    <ChartFrame
      slot="combo-chart"
      height={props.height}
      cls={cls()}
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      label={props.label}
      config={[...seriesConfig(all()), ...extras()]}
      table={props.table}
      data={{
        columns: [
          { label: props.xLabel ?? props.x },
          ...all().map((series) => ({ label: series.label, numeric: true })),
          ...(statusLines().length > 0 ? [{ label: messages().pointStatus }] : []),
        ],
        rows: props.data.map((row) => [
          String(row[props.x] ?? ""),
          ...all().map((series) => number(Number(row[series.key] ?? 0))),
          ...(statusLines().length > 0 ? [statusWords(row)] : []),
        ]),
      }}
      after={
        <>
          <Show when={props.legend === "filter"}>
            <LegendFilter
              class={cls().legendFilter}
              label={messages().chartSeries}
              items={all().map((series, at) => ({
                key: series.key,
                label: series.label,
                color: series.color ?? toneColour(series.tone, at),
                dashed: series.dashed,
              }))}
              hidden={hidden()}
              onHiddenChange={setHidden}
            />
          </Show>
          <Show when={(props.annotations ?? []).length > 0}>
            <ol
              class={cls().notes}
              data-slot="combo-chart-notes"
              aria-label={messages().chartNotes}
            >
              <For each={() => props.annotations ?? []}>
                {(note: ChartAnnotation, at: () => number) => (
                  <li class={cls().note} data-slot="combo-chart-note">
                    <span class={cls().marker} data-slot="combo-chart-marker" aria-hidden="true">
                      {number(at() + 1)}
                    </span>
                    <span class={cls().noteAt}>{note.x}</span>
                    <span class={cls().noteText}>{note.label}</span>
                  </li>
                )}
              </For>
            </ol>
          </Show>
        </>
      }
    >
      <ComboPlot
        {...props}
        class={cls().plot}
        write={number}
        hiddenKeys={hidden()}
        statusOf={(row, line) => props.statuses?.[String(row[line.status ?? ""] ?? "")]}
        writeMarker={(at) => number(at + 1)}
      />
      <Show when={props.tooltip !== false}>
        <ChartTooltip />
      </Show>
      <Show when={props.legend !== false && props.legend !== "filter"}>
        <ChartLegend />
      </Show>
      <Show when={props.legend === "filter" && extras().length > 0}>
        <ChartLegendContent payload={extraLegend()} />
      </Show>
    </ChartFrame>
  );
}

interface Point {
  readonly x: string;
  readonly series: string;
  readonly value: number;
  readonly status?: PointStatus;
}

function isPoint(datum: unknown): datum is Point {
  return typeof datum === "object" && datum !== null && "series" in datum && "value" in datum;
}

function fold(
  data: readonly Row[],
  series: readonly TonedSeries[],
  x: string,
  statusOf?: (row: Row, line: LineSeries) => PointStatus | undefined,
): Point[] {
  return data.flatMap((row) =>
    series.map((one) => {
      const status = statusOf?.(row, one);
      return {
        x: String(row[x] ?? ""),
        series: one.key,
        value: Number(row[one.key] ?? 0),
        ...(status === undefined ? {} : { status }),
      };
    }),
  );
}

/** A tooltip's rows in the order the series were given, whatever order the marks reported them. */
function inSeriesOrder(focus: ChartFocus | null, keys: readonly string[]): ChartFocus | null {
  if (focus === null) return null;
  return {
    ...focus,
    payload: focus.payload.toSorted(
      (a, b) => keys.indexOf(a.dataKey ?? "") - keys.indexOf(b.dataKey ?? ""),
    ),
  };
}

interface ComboPlotProps {
  class: string;
  write: (value: number) => string;
  hiddenKeys: readonly string[];
  statusOf: (row: Row, line: LineSeries) => PointStatus | undefined;
  writeMarker: (at: number) => string;
}

interface Keyed {
  readonly x: string;
  readonly key: string;
}

interface Marker {
  readonly x: string;
  readonly y: number;
  readonly mark: string;
}

/** The largest value drawn against an axis, to fit its ticks over. */
function highest(values: readonly number[]): number {
  return values.reduce((most, value) => (Number.isFinite(value) ? Math.max(most, value) : most), 0);
}

function ComboPlot(props: ComboChartProps & ComboPlotProps) {
  const scope = useChart();
  const axisFormat = useAxisFormat();
  const definition = createMemo((): ChartDefinition => {
    function shown(one: TonedSeries): boolean {
      return !props.hiddenKeys.includes(one.key);
    }
    const bars = (props.bars ?? []).filter(shown);
    const lines = (props.lines ?? []).filter(shown);
    const keys = [...(props.bars ?? []), ...(props.lines ?? [])].map((series) => series.key);
    const extraKeys = [
      ...Object.keys(props.statuses ?? {}).map((name) => `status-${name}`),
      ...(props.references ?? []).map((_, at) => `reference-${String(at)}`),
      ...(props.bands ?? []).map((_, at) => `band-${String(at)}`),
    ];
    const dual = props.dualAxis === true && lines.length > 0;
    const columns = props.data.map((row) => String(row[props.x] ?? ""));
    function onY2(axis: "y" | "y2" | undefined): boolean {
      return dual && axis === "y2";
    }

    const barValues =
      props.stacked === true
        ? props.data.map((row) => bars.reduce((sum, one) => sum + Number(row[one.key] ?? 0), 0))
        : props.data.flatMap((row) => bars.map((one) => Number(row[one.key] ?? 0)));
    const lineValues = props.data.flatMap((row) => lines.map((one) => Number(row[one.key] ?? 0)));
    function guideValues(secondAxis: boolean): number[] {
      return [
        ...(props.references ?? [])
          .filter((one) => onY2(one.axis) === secondAxis)
          .map((one) => one.value),
        ...(props.bands ?? []).filter((one) => onY2(one.axis) === secondAxis).map((one) => one.to),
      ];
    }
    const yMax = highest([...barValues, ...(dual ? [] : lineValues), ...guideValues(false)]);
    const y2Max = highest([...lineValues, ...guideValues(true)]);

    function axisOf(
      ticks: "nice" | readonly number[] | undefined,
      format: AxisFormat | undefined,
      max: number,
      title: string | undefined,
    ) {
      const values = ticks === "nice" ? niceTicks(max) : ticks;
      const labelled = title === undefined ? CHART_AXIS : { ...CHART_AXIS, label: title };
      const write =
        format === undefined && values === undefined
          ? undefined
          : axisFormat(format ?? "number", values ?? []);
      return {
        scale:
          values === undefined
            ? scaleLinear
            : scaleLinear().domain([Math.min(0, ...values), Math.max(...values)]),
        nice: values === undefined,
        axis:
          write === undefined
            ? labelled
            : {
                ...labelled,
                ticks: values === undefined ? { format: write } : { values, format: write },
              },
      };
    }

    const lineMarks = lines.map((one) =>
      lineY(fold(props.data, [one], props.x, props.statusOf), {
        id: `line-${one.key}`,
        x: "x",
        y: "value",
        z: "series",
        color: "series",
        points: props.points === true,
        ...(one.dashed === true ? { strokeDasharray: "5 4" } : {}),
        ...(dual ? { yScale: "y2" } : {}),
      }),
    );

    const statusDots = lines.flatMap((one) => {
      if (one.status === undefined) return [];
      return Object.keys(props.statuses ?? {}).map((name) => {
        const rows = props.data
          .filter((row) => String(row[one.status ?? ""] ?? "") === name)
          .map((row) => ({
            x: String(row[props.x] ?? ""),
            y: Number(row[one.key] ?? 0),
            key: `status-${name}`,
          }));
        return decorative(
          dot(rows, {
            id: `status-${one.key}-${name}`,
            x: "x",
            y: "y",
            color: "key",
            r: 4,
            stroke: tokens.background,
            strokeWidth: 1.5,
            ...(dual ? { yScale: "y2" } : {}),
          }),
        );
      });
    });

    const bandMarks = (props.bands ?? []).map((band, at) =>
      decorative(
        areaY(
          columns.map((column): Keyed => ({ x: column, key: `band-${String(at)}` })),
          {
            id: `band-${String(at)}`,
            x: "x",
            y1: band.from,
            y2: band.to,
            color: "key",
            fillOpacity: 0.12,
            ...(onY2(band.axis) ? { yScale: "y2" } : {}),
          },
        ),
      ),
    );

    const referenceMarks = (["y", "y2"] as const).flatMap((axis) => {
      const rows = (props.references ?? [])
        .map((reference, at) => ({ ...reference, key: `reference-${String(at)}` }))
        .filter((reference) => onY2(reference.axis) === (axis === "y2"));
      if (rows.length === 0) return [];
      return [
        decorative(
          ruleY(rows, {
            id: `references-${axis}`,
            y: "value",
            color: "key",
            strokeOpacity: 1,
            strokeWidth: 1.5,
            strokeDasharray: "4 3",
            ...(axis === "y2" ? { yScale: "y2" } : {}),
          }),
        ),
      ];
    });

    const notes = props.annotations ?? [];
    function valueAt(note: ChartAnnotation): number | undefined {
      if (note.y !== undefined) return note.y;
      if (note.series === undefined) return undefined;
      const row = props.data.find((one) => String(one[props.x] ?? "") === note.x);
      return row === undefined ? undefined : Number(row[note.series] ?? 0);
    }
    const pinned: Marker[] = notes.flatMap((note, at) => {
      const y = valueAt(note);
      return y === undefined ? [] : [{ x: note.x, y, mark: props.writeMarker(at) }];
    });
    const columnNotes = notes
      .map((note, at) => ({ note, at }))
      .filter((one) => valueAt(one.note) === undefined);
    const noteTop = Math.max(yMax, 0);
    const noteMarks = [
      ...(columnNotes.length > 0
        ? [
            decorative(
              ruleX(
                columnNotes.map((one) => one.note.x),
                {
                  id: "note-rules",
                  stroke: CHART_THEME.muted,
                  strokeOpacity: 0.8,
                  strokeDasharray: "2 3",
                },
              ),
            ),
            decorative(
              text(
                columnNotes.map((one): Marker => ({
                  x: one.note.x,
                  y: noteTop,
                  mark: props.writeMarker(one.at),
                })),
                {
                  id: "note-rule-marks",
                  x: "x",
                  y: "y",
                  text: "mark",
                  dy: -6,
                  fontSize: AXIS_FONT_SIZE,
                  fill: CHART_THEME.foreground,
                },
              ),
            ),
          ]
        : []),
      ...(pinned.length > 0
        ? [
            decorative(
              dot(pinned, { id: "note-dots", x: "x", y: "y", r: 7, fill: CHART_THEME.foreground }),
            ),
            decorative(
              text(pinned, {
                id: "note-marks",
                x: "x",
                y: "y",
                text: "mark",
                fontSize: AXIS_FONT_SIZE - 1,
                fill: tokens.background,
              }),
            ),
          ]
        : []),
    ];

    return defineChart({
      marks: [
        ...bandMarks,
        barY(fold(props.data, bars, props.x), {
          x: "x",
          y: "value",
          color: "series",
          layout: props.stacked === true ? stack() : group(),
        }),
        ...referenceMarks,
        ...lineMarks,
        ...statusDots,
        ...noteMarks,
      ],
      scales: {
        x: {
          scale: bars.length > 0 ? scaleBand : scalePoint,
          axis: props.xLabel === undefined ? CHART_AXIS : { ...CHART_AXIS, label: props.xLabel },
        },
        y: { ...axisOf(props.yTicks, props.yFormat, yMax, props.yLabel), grid: true },
        ...(dual
          ? {
              y2: {
                channel: "y" as const,
                side: "right" as const,
                ...axisOf(props.y2Ticks, props.y2Format, y2Max, props.y2Label),
              },
            }
          : {}),
      },
      color: {
        domain: [...keys, ...extraKeys],
        range: [...keys, ...extraKeys].map((key) => `var(--color-${key})`),
      },
      theme: CHART_THEME,
      ...(scope.isWatched() ? { focus: "group-x" as const, focusRing: scope.hasCursor() } : {}),
    });
  });
  return (
    <Chart
      class={props.class}
      data-slot="combo-chart-plot"
      definition={definition()}
      ariaLabel={props.label}
      height={props.height}
      onFocusGroupChange={(points, origin) =>
        scope.setFocus(
          inSeriesOrder(
            focusOf(points, origin, (datum) =>
              isPoint(datum)
                ? {
                    label: datum.x,
                    item: {
                      dataKey: datum.series,
                      name: datum.series,
                      value:
                        datum.status === undefined
                          ? props.write(datum.value)
                          : `${props.write(datum.value)}, ${datum.status.label}`,
                      color: `var(--color-${datum.series})`,
                    },
                  }
                : undefined,
            ),
            [...(props.bars ?? []), ...(props.lines ?? [])].map((series) => series.key),
          ),
        )
      }
    />
  );
}
