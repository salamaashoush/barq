import { Show, createMemo } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { ChartPayloadItem } from "@barqjs/ui/chart";
import {
  CHART_AXIS,
  CHART_THEME,
  Chart,
  type ChartDefinition,
  ChartLegend,
  ChartTooltip,
  useChart,
} from "@barqjs/ui/chart";
import { defineChart, dot } from "@tanstack/charts";
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
  seriesConfig,
} from "./chart-frame.tsx";
import { useArcMessages } from "./messages.ts";

export const scatterChartStyles = variants({
  slots: { ...chartFrameParts, ...chartTableParts, plot: arc({}) },
});

export type ScatterChartSlots = ReturnType<typeof scatterChartStyles>;

type Row = Readonly<Record<string, string | number>>;

/** The smallest and largest bubble, in px of radius. */
const BUBBLE = { min: 3, max: 18 } as const;

export interface ScatterChartProps extends ChartBaseProps<ScatterChartSlots> {
  /** One object per point. */
  data: readonly Row[];
  /** The field read across. */
  x: string;
  /** The field read up. */
  y: string;
  /** A field read as each point's area: a bubble chart. */
  size?: string;
  /** A field naming each point, for the tooltip and the table's first column. */
  name?: string;
  /** A field naming each point's series, which `series` colours and names. */
  group?: string;
  /** The series, keyed by the values of `group`. @default one, named by `yLabel` */
  series?: readonly TonedSeries[];
  /** @default `x` */
  xLabel?: string;
  /** @default `y` */
  yLabel?: string;
  /** @default `size` */
  sizeLabel?: string;
  /** @default whether there is more than one series */
  legend?: boolean;
  /** @default true */
  tooltip?: boolean;
}

/** The series key a point is drawn in when the chart has one series. */
const ONE = "points";

interface Measure {
  key: string;
  label: string;
}

/**
 * Two measures, or three as bubbles, one point per record.
 *
 * ```tsx
 * <ScatterChart
 *   label="Response size against duration"
 *   data={requests}
 *   x="duration"
 *   y="bytes"
 *   size="count"
 *   name="route"
 *   group="method"
 *   series={[{ key: "GET", label: "GET" }, { key: "POST", label: "POST", tone: "warning" }]}
 * />
 * ```
 *
 * The arrow keys walk the points by position and ui's tooltip reads each
 * one's measures in words; the table lists every point. A bubble's area, not
 * its radius, follows its value, so a value twice another looks twice as big.
 */
export function ScatterChart(props: ScatterChartProps) {
  const messages = useArcMessages();
  const number = chartNumbers(props.formatOptions);
  function cls(): ScatterChartSlots {
    return parts(scatterChartStyles(), props.classes);
  }
  function series(): readonly TonedSeries[] {
    return props.series ?? [{ key: ONE, label: props.yLabel ?? props.y }];
  }
  function keyOf(row: Row): string {
    return props.group === undefined ? ONE : String(row[props.group] ?? "");
  }
  function labelOf(row: Row, at: number): string {
    return props.name === undefined ? String(at + 1) : String(row[props.name] ?? "");
  }
  function measures(): Measure[] {
    return [
      { key: props.x, label: props.xLabel ?? props.x },
      { key: props.y, label: props.yLabel ?? props.y },
      ...(props.size === undefined
        ? []
        : [{ key: props.size, label: props.sizeLabel ?? props.size }]),
    ];
  }
  function seriesLabel(key: string): string {
    return series().find((one) => one.key === key)?.label ?? key;
  }

  return (
    <ChartFrame
      slot="scatter-chart"
      cls={cls()}
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      label={props.label}
      config={seriesConfig(series())}
      table={props.table}
      data={{
        columns: [
          { label: messages().chartCategory },
          ...measures().map((measure) => ({ label: measure.label, numeric: true })),
          ...(props.group === undefined ? [] : [{ label: props.group }]),
        ],
        rows: props.data.map((row, at) => [
          labelOf(row, at),
          ...measures().map((measure) => number(Number(row[measure.key] ?? 0))),
          ...(props.group === undefined ? [] : [seriesLabel(keyOf(row))]),
        ]),
      }}
    >
      <ScatterPlot
        {...props}
        class={cls().plot}
        keys={series().map((one) => one.key)}
        keyOf={keyOf}
        read={(row) => {
          const at = props.data.indexOf(row);
          const colour = `var(--color-${keyOf(row)})`;
          return {
            label: labelOf(row, at),
            items: measures().map((measure): ChartPayloadItem => ({
              name: measure.label,
              value: number(Number(row[measure.key] ?? 0)),
              color: colour,
            })),
          };
        }}
      />
      <Show when={props.tooltip !== false}>
        <ChartTooltip />
      </Show>
      <Show when={props.legend ?? series().length > 1}>
        <ChartLegend />
      </Show>
    </ChartFrame>
  );
}

function isRow(datum: unknown): datum is Row {
  return typeof datum === "object" && datum !== null;
}

interface ScatterPlotProps {
  class: string;
  keys: readonly string[];
  keyOf: (row: Row) => string;
  read: (row: Row) => ScatterRead;
}

interface ScatterRead {
  label: string;
  items: ChartPayloadItem[];
}

function ScatterPlot(props: ScatterChartProps & ScatterPlotProps) {
  const scope = useChart();
  const definition = createMemo((): ChartDefinition => {
    const size = props.size;
    const largest =
      size === undefined ? 0 : Math.max(0, ...props.data.map((row) => Number(row[size] ?? 0)));
    return defineChart({
      marks: [
        dot(props.data, {
          x: (row) => Number(row[props.x] ?? 0),
          y: (row) => Number(row[props.y] ?? 0),
          color: (row) => props.keyOf(row),
          ...(size === undefined || largest === 0
            ? {}
            : {
                r: (row: Row) => Number(row[size] ?? 0),
                rScale: (value: number) =>
                  BUBBLE.min + (BUBBLE.max - BUBBLE.min) * Math.sqrt(value / largest),
                fillOpacity: 0.6,
              }),
        }),
      ],
      scales: {
        x: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: { ...CHART_AXIS, label: props.xLabel ?? props.x },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: { ...CHART_AXIS, label: props.yLabel ?? props.y },
        },
      },
      color: { domain: props.keys, range: props.keys.map((key) => `var(--color-${key})`) },
      theme: CHART_THEME,
    });
  });
  return (
    <Chart
      class={props.class}
      data-slot="scatter-chart-plot"
      definition={definition()}
      ariaLabel={props.label}
      height={props.height}
      onFocusGroupChange={(points, origin) => {
        const first = points[0];
        if (first === undefined || !isRow(first.datum)) {
          scope.setFocus(null);
          return;
        }
        const read = props.read(first.datum);
        scope.setFocus({
          label: read.label,
          payload: read.items,
          x: origin.x + first.x,
          y: origin.y + first.y,
        });
      }}
    />
  );
}
