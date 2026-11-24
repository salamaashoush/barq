import { Show, createMemo } from "@barqjs/core";
import { variants } from "@barqjs/css";
import {
  CHART_AXIS,
  CHART_THEME,
  Chart,
  type ChartDefinition,
  ChartLegend,
  ChartTooltip,
  useChart,
} from "@barqjs/ui/chart";
import { barY, defineChart, group, lineY, stack } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";

import { arcLayer as arc } from "../layer.ts";
import { parts } from "../lib/parts.ts";
import {
  type ChartBaseProps,
  ChartFrame,
  type TonedSeries,
  chartFrameParts,
  chartNumbers,
  chartTableParts,
  focusOf,
  seriesConfig,
} from "./chart-frame.tsx";

export const comboChartStyles = variants({
  slots: { ...chartFrameParts, ...chartTableParts, plot: arc({}) },
});

export type ComboChartSlots = ReturnType<typeof comboChartStyles>;

type Row = Readonly<Record<string, string | number>>;

export interface ComboChartProps extends ChartBaseProps<ComboChartSlots> {
  /** One object per column, each holding `x` and every series' key. */
  data: readonly Row[];
  /** The field that names each column. */
  x: string;
  /** The series drawn as bars, side by side. */
  bars?: readonly TonedSeries[];
  /** The series drawn as lines over them. */
  lines?: readonly TonedSeries[];
  /** Stack the bars into one column rather than side by side. @default false */
  stacked?: boolean;
  /**
   * The lines read a scale of their own, drawn at the end: a rate over a
   * count, a price over a volume. @default false
   */
  dualAxis?: boolean;
  /** The column axis's title, and the table's first header. @default `x` */
  xLabel?: string;
  /** The value axis's title. */
  yLabel?: string;
  /** The second axis's title, with `dualAxis`. */
  y2Label?: string;
  /** @default true */
  legend?: boolean;
  /** @default true */
  tooltip?: boolean;
}

/**
 * Bars and lines over the same columns, on one value axis or two.
 *
 * ```tsx
 * <ComboChart
 *   label="Runs and failure rate"
 *   data={days}
 *   x="day"
 *   bars={[{ key: "runs", label: "Runs" }]}
 *   lines={[{ key: "failureRate", label: "Failure rate", tone: "danger" }]}
 *   dualAxis
 * />
 * ```
 *
 * On TanStack Charts inside ui's chart container: a tooltip compares every
 * series in a column, the arrow keys walk the columns, and the table holds
 * each value as written in the locale.
 */
export function ComboChart(props: ComboChartProps) {
  const number = chartNumbers(props.formatOptions);
  const cls = (): ComboChartSlots => parts(comboChartStyles(), props.classes);
  const all = (): readonly TonedSeries[] => [...(props.bars ?? []), ...(props.lines ?? [])];
  return (
    <ChartFrame
      slot="combo-chart"
      cls={cls()}
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      label={props.label}
      config={seriesConfig(all())}
      table={props.table}
      data={{
        columns: [
          { label: props.xLabel ?? props.x },
          ...all().map((series) => ({ label: series.label, numeric: true })),
        ],
        rows: props.data.map((row) => [
          String(row[props.x] ?? ""),
          ...all().map((series) => number(Number(row[series.key] ?? 0))),
        ]),
      }}
    >
      <ComboPlot {...props} class={cls().plot} write={number} />
      <Show when={props.tooltip !== false}>
        <ChartTooltip />
      </Show>
      <Show when={props.legend !== false}>
        <ChartLegend />
      </Show>
    </ChartFrame>
  );
}

interface Point {
  readonly x: string;
  readonly series: string;
  readonly value: number;
}

const isPoint = (datum: unknown): datum is Point =>
  typeof datum === "object" && datum !== null && "series" in datum && "value" in datum;

function fold(data: readonly Row[], series: readonly TonedSeries[], x: string): Point[] {
  return data.flatMap((row) =>
    series.map((one) => ({
      x: String(row[x] ?? ""),
      series: one.key,
      value: Number(row[one.key] ?? 0),
    })),
  );
}

function ComboPlot(props: ComboChartProps & { class: string; write: (value: number) => string }) {
  const scope = useChart();
  const definition = createMemo((): ChartDefinition => {
    const bars = props.bars ?? [];
    const lines = props.lines ?? [];
    const keys = [...bars, ...lines].map((series) => series.key);
    const dual = props.dualAxis === true && lines.length > 0;
    return defineChart({
      marks: [
        barY(fold(props.data, bars, props.x), {
          x: "x",
          y: "value",
          color: "series",
          layout: props.stacked === true ? stack() : group(),
        }),
        lineY(fold(props.data, lines, props.x), {
          x: "x",
          y: "value",
          z: "series",
          color: "series",
          ...(dual ? { yScale: "y2" } : {}),
        }),
      ],
      scales: {
        x: {
          scale: scaleBand,
          axis: props.xLabel === undefined ? CHART_AXIS : { ...CHART_AXIS, label: props.xLabel },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: props.yLabel === undefined ? CHART_AXIS : { ...CHART_AXIS, label: props.yLabel },
        },
        ...(dual
          ? {
              y2: {
                channel: "y" as const,
                side: "right" as const,
                scale: scaleLinear,
                nice: true,
                axis:
                  props.y2Label === undefined
                    ? CHART_AXIS
                    : { ...CHART_AXIS, label: props.y2Label },
              },
            }
          : {}),
      },
      color: { domain: keys, range: keys.map((key) => `var(--color-${key})`) },
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
          focusOf(points, origin, (datum) =>
            isPoint(datum)
              ? {
                  label: datum.x,
                  item: {
                    dataKey: datum.series,
                    name: datum.series,
                    value: props.write(datum.value),
                    color: `var(--color-${datum.series})`,
                  },
                }
              : undefined,
          ),
        )
      }
    />
  );
}
