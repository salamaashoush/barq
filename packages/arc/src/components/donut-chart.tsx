import { type Child, Show, createMemo } from "@barqjs/core";
import { variants } from "@barqjs/css";
import {
  CHART_THEME,
  Chart,
  type ChartDefinition,
  ChartLegend,
  ChartTooltip,
  useChart,
} from "@barqjs/ui/chart";
import { type RenderPart } from "@barqjs/ui/slot";
import { defineChart } from "@tanstack/charts";
import { pie, polar, radialArc } from "@tanstack/charts/polar";

import { arcLayer as arc } from "../layer.ts";
import { parts, rendered } from "../lib/parts.ts";
import type { Tone } from "../theme/tokens.ts";
import {
  type ChartBaseProps,
  ChartFrame,
  type TonedSeries,
  chartCentreParts,
  chartFrameParts,
  chartNumbers,
  chartTableParts,
  focusOf,
  seriesConfig,
} from "./chart-frame.tsx";
import { useArcMessages } from "./messages.ts";

/** One slice: what it is, how much, and its colour. */
export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  tone?: Tone;
  color?: string;
}

export const donutChartStyles = variants({
  slots: {
    ...chartFrameParts,
    ...chartTableParts,
    chart: arc(chartFrameParts.chart, { aspectRatio: "1", maxInlineSize: "24rem" }),
    ...chartCentreParts,
  },
});

export type DonutChartSlots = ReturnType<typeof donutChartStyles>;

export interface DonutChartRenders {
  centreValue?: RenderPart<Child>;
  centreLabel?: RenderPart<Child>;
}

export interface DonutChartProps extends ChartBaseProps<DonutChartSlots> {
  data: readonly DonutSlice[];
  /** In the hole. @default the slices' total, written in the locale */
  centreValue?: Child;
  /** Under the centre value: what it counts. */
  centreLabel?: Child;
  /** The hole's share of the radius, from 0 (a pie) to 0.9. @default 0.62 */
  hole?: number;
  /** @default true */
  legend?: boolean;
  /** A tooltip naming the slice under the pointer or the keyboard. @default true */
  tooltip?: boolean;
  /** The table's first column's header. @default the provider's `chartCategory`, "Category" */
  categoryLabel?: string;
  /** Another element for the centre's value or label: a link, a heading. */
  renders?: DonutChartRenders;
}

/**
 * A part-to-whole chart with a figure in its hole.
 *
 * ```tsx
 * <DonutChart
 *   label="Checks by state"
 *   data={[
 *     { key: "up", label: "Up", value: 42, tone: "success" },
 *     { key: "down", label: "Down", value: 3, tone: "danger" },
 *   ]}
 *   centreLabel="checks"
 * />
 * ```
 *
 * The slices are TanStack Charts' polar arcs inside ui's chart container, so
 * the arrow keys walk them and ui's tooltip names each; the legend and the
 * table carry every value and its share in words.
 */
export function DonutChart(props: DonutChartProps) {
  const messages = useArcMessages();
  const number = chartNumbers(props.formatOptions);
  const percent = chartNumbers({ style: "percent", maximumFractionDigits: 1 });
  function cls(): DonutChartSlots {
    return parts(donutChartStyles(), props.classes);
  }
  function series(): TonedSeries[] {
    return props.data.map((slice) => ({
      key: slice.key,
      label: slice.label,
      tone: slice.tone,
      color: slice.color,
    }));
  }
  function total(): number {
    return props.data.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  }
  function share(value: number): string {
    return percent(total() === 0 ? 0 : value / total());
  }

  function centreValue(): Child {
    return props.centreValue ?? number(total());
  }
  return (
    <ChartFrame
      slot="donut-chart"
      height={props.height}
      cls={cls()}
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      label={props.label}
      config={seriesConfig(series())}
      table={props.table}
      data={{
        columns: [
          { label: props.categoryLabel ?? messages().chartCategory },
          { label: messages().chartValue, numeric: true },
          { label: messages().chartShare, numeric: true },
        ],
        rows: props.data.map((slice) => [slice.label, number(slice.value), share(slice.value)]),
      }}
    >
      <div class={cls().plot} data-slot="donut-chart-plot">
        <DonutPlot
          data={props.data}
          label={props.label}
          height={props.height}
          hole={props.hole}
          write={number}
        />
        <div class={cls().centre} data-slot="donut-chart-centre" aria-hidden="true">
          {props.renders?.centreValue === undefined ? (
            <span class={cls().centreValue} data-slot="donut-chart-centre-value">
              {centreValue()}
            </span>
          ) : (
            rendered(
              props.renders.centreValue,
              { class: cls().centreValue, "data-slot": "donut-chart-centre-value" },
              centreValue(),
            )
          )}
          <Show when={props.centreLabel !== undefined}>
            {props.renders?.centreLabel === undefined ? (
              <span class={cls().centreLabel} data-slot="donut-chart-centre-label">
                {props.centreLabel}
              </span>
            ) : (
              rendered(
                props.renders.centreLabel,
                { class: cls().centreLabel, "data-slot": "donut-chart-centre-label" },
                props.centreLabel,
              )
            )}
          </Show>
        </div>
      </div>
      <Show when={props.tooltip !== false}>
        <ChartTooltip />
      </Show>
      <Show when={props.legend !== false}>
        <ChartLegend />
      </Show>
    </ChartFrame>
  );
}

function isSlice(datum: unknown): datum is DonutSlice {
  return typeof datum === "object" && datum !== null && "key" in datum && "value" in datum;
}

interface DonutPlotProps {
  data: readonly DonutSlice[];
  label: string;
  height?: number;
  hole?: number;
  write: (value: number) => string;
}

function DonutPlot(props: DonutPlotProps) {
  const scope = useChart();
  const definition = createMemo((): ChartDefinition =>
    defineChart({
      marks: [
        polar({
          inset: 4,
          marks: [
            radialArc(pie(props.data, { value: "value" }), {
              innerRadius: ({ radius }) => radius * Math.min(0.9, Math.max(0, props.hole ?? 0.62)),
              color: "key",
              key: "key",
            }),
          ],
          scales: { angle: null, radius: null },
        }),
      ],
      scales: { x: null, y: null },
      color: {
        domain: props.data.map((slice) => slice.key),
        range: props.data.map((slice) => `var(--color-${slice.key})`),
      },
      theme: CHART_THEME,
    }),
  );
  return (
    <Chart
      definition={definition()}
      ariaLabel={props.label}
      height={props.height}
      onFocusGroupChange={(points, origin) =>
        scope.setFocus(
          focusOf(points, origin, (datum) =>
            isSlice(datum)
              ? {
                  label: datum.label,
                  item: {
                    dataKey: datum.key,
                    name: datum.key,
                    value: props.write(datum.value),
                    color: `var(--color-${datum.key})`,
                  },
                }
              : undefined,
          ),
        )
      }
    />
  );
}
