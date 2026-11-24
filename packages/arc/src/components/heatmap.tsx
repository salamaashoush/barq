import { For, Show, createMemo } from "@barqjs/core";
import { variants } from "@barqjs/css";
import {
  CHART_AXIS,
  CHART_THEME,
  Chart,
  type ChartDefinition,
  ChartTooltip,
  useChart,
} from "@barqjs/ui/chart";
import { tokens } from "@barqjs/ui/theme/tokens";
import { cell, defineChart } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";

import { arcLayer as arc } from "../layer.ts";
import { parts } from "../lib/parts.ts";
import { gap, layout, rounded, space, type } from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import {
  type ChartBaseProps,
  ChartFrame,
  chartFrameParts,
  chartNumbers,
  chartTableParts,
  toneColour,
} from "./chart-frame.tsx";
import { useArcMessages } from "./messages.ts";

export const heatmapStyles = variants({
  slots: {
    ...chartFrameParts,
    ...chartTableParts,
    plot: arc({}),
    legend: arc(layout.row, gap[1], type.meta, { justifyContent: "center" }),
    legendStep: arc(rounded.xs, { width: space.x4, height: space.x3 }),
  },
});

export type HeatmapSlots = ReturnType<typeof heatmapStyles>;

type Row = Readonly<Record<string, string | number>>;

export interface HeatmapProps extends ChartBaseProps<HeatmapSlots> {
  /** One object per cell. */
  data: readonly Row[];
  /** The field naming each cell's column. */
  x: string;
  /** The field naming each cell's row. */
  y: string;
  /** The field holding each cell's number. */
  value: string;
  /** The rows' name, the table's first header. @default `y` */
  yLabel?: string;
  /** The value's name, in the tooltip. @default `value` */
  valueLabel?: string;
  /** The colour the strongest cells reach. @default the theme's first chart colour */
  tone?: Tone;
  /** How many shades the values fall into. @default 5 */
  steps?: number;
  /** The values the shades span. @default the lowest and highest given */
  domain?: readonly [number, number];
  /** A key from fewer to more under it. @default true */
  legend?: boolean;
}

/** The shade a step is drawn in: from the muted fill to the tone, in even mixes. */
export function heatShade(base: string, step: number, steps: number): string {
  const share = steps <= 1 ? 100 : Math.round(15 + (85 * step) / (steps - 1));
  return `color-mix(in oklab, ${base} ${String(share)}%, ${tokens.muted})`;
}

/** The step `value` falls in, from 0 to `steps - 1`. */
export function heatStep(
  value: number,
  [low, high]: readonly [number, number],
  steps: number,
): number {
  if (high <= low) return steps - 1;
  const at = Math.floor(((value - low) / (high - low)) * steps);
  return Math.min(steps - 1, Math.max(0, at));
}

interface Drawn {
  readonly column: string;
  readonly row: string;
  readonly value: number;
  readonly step: string;
}

function isDrawn(datum: unknown): datum is Drawn {
  return typeof datum === "object" && datum !== null && "step" in datum && "column" in datum;
}

/**
 * A number over two categories as a grid of shaded cells: a weekday by an
 * hour, a check by a region.
 *
 * ```tsx
 * <Heatmap label="Failures by hour" data={cells} x="hour" y="day" value="failures" tone="danger" />
 * ```
 *
 * The values fall into `steps` shades from the theme's muted fill to the
 * tone, which the key under it reads from fewer to more. The arrow keys walk
 * the cells and ui's tooltip reads each; the table is the same grid in
 * numbers, a row per row and a column per column.
 */
export function Heatmap(props: HeatmapProps) {
  const messages = useArcMessages();
  const number = chartNumbers(props.formatOptions);
  function cls(): HeatmapSlots {
    return parts(heatmapStyles(), props.classes);
  }
  function steps(): number {
    return Math.max(1, Math.round(props.steps ?? 5));
  }
  function base(): string {
    return toneColour(props.tone);
  }
  function valueOf(row: Row): number {
    return Number(row[props.value] ?? 0);
  }
  function range(): readonly [number, number] {
    if (props.domain !== undefined) return props.domain;
    const values = props.data.map(valueOf);
    return values.length === 0 ? [0, 0] : [Math.min(...values), Math.max(...values)];
  }
  function distinct(field: string): string[] {
    return [...new Set(props.data.map((row) => String(row[field] ?? "")))];
  }
  function shades(): string[] {
    return Array.from({ length: steps() }, (_, step) => heatShade(base(), step, steps()));
  }

  return (
    <ChartFrame
      slot="heatmap"
      cls={cls()}
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      label={props.label}
      config={[]}
      table={props.table}
      data={{
        columns: [
          { label: props.yLabel ?? props.y },
          ...distinct(props.x).map((column) => ({ label: column, numeric: true })),
        ],
        rows: distinct(props.y).map((name) => [
          name,
          ...distinct(props.x).map((column) => {
            const found = props.data.find(
              (row) => String(row[props.y]) === name && String(row[props.x]) === column,
            );
            return found === undefined ? "" : number(valueOf(found));
          }),
        ]),
      }}
      after={
        <Show when={props.legend !== false}>
          <div class={cls().legend} data-slot="heatmap-legend" aria-hidden="true">
            <span>{messages().chartLess}</span>
            <For each={shades()}>
              {(shade) => (
                <span
                  class={cls().legendStep}
                  data-slot="heatmap-legend-step"
                  style={{ "background-color": shade }}
                />
              )}
            </For>
            <span>{messages().chartMore}</span>
          </div>
        </Show>
      }
    >
      <HeatmapPlot
        class={cls().plot}
        label={props.label}
        height={props.height}
        shades={shades()}
        cells={props.data.map((row): Drawn => ({
          column: String(row[props.x] ?? ""),
          row: String(row[props.y] ?? ""),
          value: valueOf(row),
          step: String(heatStep(valueOf(row), range(), steps())),
        }))}
        name={props.valueLabel ?? props.value}
        write={number}
      />
      <ChartTooltip />
    </ChartFrame>
  );
}

interface HeatmapPlotProps {
  class: string;
  label: string;
  height?: number;
  shades: readonly string[];
  cells: readonly Drawn[];
  name: string;
  write: (value: number) => string;
}

function HeatmapPlot(props: HeatmapPlotProps) {
  const scope = useChart();
  const definition = createMemo((): ChartDefinition =>
    defineChart({
      marks: [cell(props.cells, { x: "column", y: "row", color: "step", inset: 1 })],
      scales: {
        x: { scale: scaleBand, axis: CHART_AXIS },
        y: { scale: scaleBand, axis: CHART_AXIS },
      },
      color: { domain: props.shades.map((_, step) => String(step)), range: props.shades },
      theme: CHART_THEME,
    }),
  );
  return (
    <Chart
      class={props.class}
      data-slot="heatmap-plot"
      definition={definition()}
      ariaLabel={props.label}
      height={props.height}
      onFocusGroupChange={(points, origin) => {
        const first = points[0];
        if (first === undefined || !isDrawn(first.datum)) {
          scope.setFocus(null);
          return;
        }
        const drawn = first.datum;
        scope.setFocus({
          label: `${drawn.row} · ${drawn.column}`,
          payload: [
            {
              name: props.name,
              value: props.write(drawn.value),
              color: props.shades[Number(drawn.step)],
            },
          ],
          x: origin.x + first.x,
          y: origin.y + first.y,
        });
      }}
    />
  );
}
