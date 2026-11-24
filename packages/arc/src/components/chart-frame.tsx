import { type Child, For, Show, createSignal, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { numberFormatter } from "@barqjs/aria/i18n";
import { Button } from "@barqjs/ui/button";
import {
  type ChartConfig,
  ChartContainer,
  type ChartFocus,
  type ChartOrigin,
  type ChartPayloadItem,
} from "@barqjs/ui/chart";
import { srOnly } from "@barqjs/ui/sr-only";
import type { ChartPoint } from "@tanstack/charts/types";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, fg, gap, layout, space, type } from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { useArcMessages } from "./messages.ts";

/** One series a chart draws: the field it reads, its name, and its colour. */
export interface TonedSeries {
  /** The field of each datum the series reads. */
  key: string;
  label: string;
  /** Drawn in a tone of the theme. */
  tone?: Tone;
  /** Any colour, which wins over `tone`. @default the theme's `--chart-N` */
  color?: string;
}

/**
 * How a chart's numbers reach a reader who cannot read the drawing: a table
 * only a screen reader reads, one a button shows, or one always shown.
 */
export type ChartTableMode = "hidden" | "toggle" | "visible";

/** A chart's numbers as a table: a header per column, and each row's cells as written. */
export interface ChartTableData {
  columns: readonly { label: string; numeric?: boolean }[];
  /** The first cell of each row is its header. */
  rows: readonly (readonly string[])[];
}

/** The colour a series is drawn in. */
export function seriesColour(series: TonedSeries, at: number): string {
  if (series.color !== undefined) return series.color;
  if (series.tone !== undefined) return `var(--${series.tone})`;
  return `var(--chart-${String((at % 5) + 1)})`;
}

/** The series as ui's chart config, so ui's legend and tooltip name and colour them. */
export function seriesConfig(series: readonly TonedSeries[]): ChartConfig {
  return series.map((one, at) => ({
    key: one.key,
    label: one.label,
    color: seriesColour(one, at),
  }));
}

/** Numbers written in the locale in scope. */
export function chartNumbers(options?: Intl.NumberFormatOptions): (value: number) => string {
  const formatter = numberFormatter(options);
  return (value) => formatter().format(value);
}

/**
 * What ui's tooltip is told about the points a plot reports focused: the
 * topmost of them is where it goes, `read` names each datum.
 */
export function focusOf(
  points: readonly ChartPoint[],
  origin: ChartOrigin,
  read: (datum: unknown) => { label: string; item: ChartPayloadItem } | undefined,
): ChartFocus | null {
  const named = points.flatMap((point) => {
    const one = read(point.datum);
    return one === undefined ? [] : [{ point, ...one }];
  });
  const first = named[0];
  if (first === undefined) return null;
  return {
    label: first.label,
    payload: named.map((one) => one.item),
    x: origin.x + first.point.x,
    y: origin.y + Math.min(...named.map((one) => one.point.y)),
  };
}

const cellBox = arc(edge.bottom, { paddingBlock: space.x1_5, paddingInline: space.x2 });

/** The table's parts, which every arc chart carries under the same names. */
export const chartTableParts = {
  table: arc(type.sm, layout.fill, { borderCollapse: "collapse" }),
  caption: arc(type.label, { textAlign: "start", paddingBlockEnd: space.x2 }),
  header: arc(cellBox, type.label, fg.muted, {
    textAlign: "start",
    "&[data-numeric]": { textAlign: "end" },
  }),
  cell: arc(cellBox, type.numeric, { textAlign: "end" }),
};

/** The frame's parts around the drawing, which every arc chart carries under the same names. */
export const chartFrameParts = {
  root: arc(layout.column, layout.minZero, gap[2]),
  chart: arc(layout.fill),
  toggle: arc({ alignSelf: "flex-start" }),
};

export const chartDataTableStyles = variants({ slots: chartTableParts });

export type ChartTableSlots = ReturnType<typeof chartDataTableStyles>;

export interface ChartDataTableProps extends Customisable<ChartTableSlots> {
  /** The caption, which names the table as the chart's `label` names the drawing. */
  label: string;
  data: ChartTableData;
  /** Drawn nowhere and read by a screen reader. @default false */
  hidden?: boolean;
  id?: string;
}

/**
 * A chart's numbers as a table: the exact values a drawing only suggests,
 * for a screen reader, a keyboard, a printout and anyone checking a figure.
 *
 * ```tsx
 * <ChartDataTable
 *   label="Visitors"
 *   data={{ columns: [{ label: "Month" }, { label: "Desktop", numeric: true }], rows: [["Jan", "186"]] }}
 * />
 * ```
 *
 * Every arc chart draws one; beside one of ui's `ChartBars` it is the same
 * fallback for that drawing.
 */
export function ChartDataTable(props: ChartDataTableProps) {
  const cls = (): ChartTableSlots => parts(chartDataTableStyles(), props.classes);
  return (
    <table
      class={arc(cls().table, props.class, props.className, props.hidden === true ? srOnly : "")}
      id={props.id}
      data-slot="chart-table"
    >
      <caption class={cls().caption} data-slot="chart-table-caption">
        {props.label}
      </caption>
      <thead>
        <tr>
          <For each={props.data.columns}>
            {(column) => (
              <th
                class={cls().header}
                data-slot="chart-table-header"
                data-numeric={column.numeric === true ? "" : undefined}
                scope="col"
              >
                {column.label}
              </th>
            )}
          </For>
        </tr>
      </thead>
      <tbody>
        <For each={props.data.rows}>
          {(row) => (
            <tr>
              <th class={cls().header} data-slot="chart-table-header" scope="row">
                {row[0]}
              </th>
              <For each={row.slice(1)}>
                {(value) => (
                  <td class={cls().cell} data-slot="chart-table-cell">
                    {value}
                  </td>
                )}
              </For>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}

/** The parts every arc chart has, whatever it draws. */
export interface ChartFrameSlots extends ChartTableSlots {
  root: string;
  chart: string;
  toggle: string;
}

/** What every arc chart takes besides its data. */
export interface ChartBaseProps<Slots> extends Customisable<Slots> {
  /** Names the drawing and captions its table. */
  label: string;
  /** @default "hidden", a table a screen reader reads and nobody sees */
  table?: ChartTableMode;
  /** The drawing's height in px. @default the box's own, from its aspect ratio */
  height?: number;
  /** How the numbers are written, in the locale in scope. */
  formatOptions?: Intl.NumberFormatOptions;
  id?: string;
}

interface ChartFrameProps {
  slot: string;
  cls: ChartFrameSlots;
  class?: string;
  id?: string;
  label: string;
  config: ChartConfig;
  table: ChartTableMode | undefined;
  data: ChartTableData;
  attributes?: Readonly<Record<string, string | undefined>>;
  /** Inside ui's chart container: the plot, its tooltip, its legend. */
  children: Child;
  /** After the drawing and before the table. */
  after?: Child;
}

/**
 * The box every arc chart is drawn in: ui's chart container holding the plot,
 * and under it the numbers as a table, which `table` hides, shows or puts
 * behind a button.
 */
export function ChartFrame(props: ChartFrameProps) {
  const messages = useArcMessages();
  const tableId = createUniqueId();
  const [open, setOpen] = createSignal(false);
  const mode = (): ChartTableMode => props.table ?? "hidden";
  const shown = (): boolean => mode() === "visible" || (mode() === "toggle" && open());
  return (
    <div class={props.class} id={props.id} data-slot={props.slot} {...props.attributes}>
      <ChartContainer class={props.cls.chart} config={props.config}>
        {props.children}
      </ChartContainer>
      {props.after}
      <Show when={mode() === "toggle"}>
        <Button
          class={props.cls.toggle}
          data-slot={`${props.slot}-toggle`}
          variant="ghost"
          size="sm"
          aria-expanded={open()}
          aria-controls={tableId}
          onPress={() => setOpen((was) => !was)}
        >
          {open() ? messages().hideDataTable : messages().showDataTable}
        </Button>
      </Show>
      <ChartDataTable
        id={tableId}
        label={props.label}
        data={props.data}
        hidden={!shown()}
        classes={{
          table: props.cls.table,
          caption: props.cls.caption,
          header: props.cls.header,
          cell: props.cls.cell,
        }}
      />
    </div>
  );
}
