import { createMemo } from "@barqjs/core";
import { variants } from "@barqjs/css";
import {
  AXIS_FONT_SIZE,
  CHART_AXIS,
  CHART_THEME,
  Chart,
  type ChartDefinition,
  ChartTooltip,
  useChart,
} from "@barqjs/ui/chart";
import { barX, defineChart, text } from "@tanstack/charts";
import { decorative } from "@tanstack/charts/mark/decorative";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";

import { arcLayer as arc } from "../layer.ts";
import { parts } from "../lib/parts.ts";
import type { Tone } from "../theme/tokens.ts";
import {
  type ChartBaseProps,
  ChartFrame,
  chartFrameParts,
  chartNumbers,
  chartTableParts,
  seriesConfig,
  toneColour,
} from "./chart-frame.tsx";
import { useArcMessages } from "./messages.ts";

/** One stage a total passes through, in order. */
export interface FunnelStage {
  key: string;
  label: string;
  value: number;
  /** Drawn in a tone of its own, over the chart's. */
  tone?: Tone;
  color?: string;
}

export const funnelChartStyles = variants({
  slots: { ...chartFrameParts, ...chartTableParts, plot: arc({}) },
});

export type FunnelChartSlots = ReturnType<typeof funnelChartStyles>;

export interface FunnelChartProps extends ChartBaseProps<FunnelChartSlots> {
  /** The stages, widest first. */
  data: readonly FunnelStage[];
  /** Every stage's tone, unless one names its own. @default the theme's first chart colour */
  tone?: Tone;
  /** Each stage's value and its share of the first, written at its end. @default true */
  showValues?: boolean;
}

/** Room at the end of the widest bar for its value, as a share of the widest. */
const LABEL_ROOM = 0.35;

interface Drawn extends FunnelStage {
  readonly start: number;
  readonly end: number;
  readonly words: string;
}

function isDrawn(datum: unknown): datum is Drawn {
  return typeof datum === "object" && datum !== null && "start" in datum && "words" in datum;
}

/**
 * How much of a total reaches each stage, as bars centred on one line and
 * narrowing toward the outcome.
 *
 * ```tsx
 * <FunnelChart
 *   label="Sign-up funnel"
 *   data={[
 *     { key: "visit", label: "Visited", value: 12000 },
 *     { key: "start", label: "Started", value: 4200 },
 *     { key: "done", label: "Signed up", value: 1300, tone: "success" },
 *   ]}
 * />
 * ```
 *
 * Each stage carries its value and its share of the first in words at its
 * end, in the tooltip the arrow keys walk, and in the table.
 */
export function FunnelChart(props: FunnelChartProps) {
  const messages = useArcMessages();
  const number = chartNumbers(props.formatOptions);
  const percent = chartNumbers({ style: "percent", maximumFractionDigits: 1 });
  function cls(): FunnelChartSlots {
    return parts(funnelChartStyles(), props.classes);
  }
  function first(): number {
    return props.data[0]?.value ?? 0;
  }
  function share(value: number): string {
    return percent(first() === 0 ? 0 : value / first());
  }
  function colour(stage: FunnelStage): string {
    return stage.color ?? toneColour(stage.tone ?? props.tone);
  }

  return (
    <ChartFrame
      slot="funnel-chart"
      cls={cls()}
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      label={props.label}
      config={seriesConfig(
        props.data.map((stage) => ({ key: stage.key, label: stage.label, color: colour(stage) })),
      )}
      table={props.table}
      data={{
        columns: [
          { label: messages().chartStage },
          { label: messages().chartValue, numeric: true },
          { label: messages().chartShare, numeric: true },
        ],
        rows: props.data.map((stage) => [stage.label, number(stage.value), share(stage.value)]),
      }}
    >
      <FunnelPlot
        class={cls().plot}
        label={props.label}
        height={props.height}
        showValues={props.showValues !== false}
        data={props.data}
        words={(stage) => `${number(stage.value)} · ${share(stage.value)}`}
        share={(stage) => messages().shareOfFirst(share(stage.value))}
        write={number}
      />
      <ChartTooltip />
    </ChartFrame>
  );
}

interface FunnelPlotProps {
  class: string;
  label: string;
  height?: number;
  showValues: boolean;
  data: readonly FunnelStage[];
  words: (stage: FunnelStage) => string;
  share: (stage: FunnelStage) => string;
  write: (value: number) => string;
}

function FunnelPlot(props: FunnelPlotProps) {
  const scope = useChart();
  const definition = createMemo((): ChartDefinition => {
    const widest = Math.max(0, ...props.data.map((stage) => stage.value));
    const rows: Drawn[] = props.data.map((stage) => ({
      ...stage,
      start: (widest - stage.value) / 2,
      end: (widest + stage.value) / 2,
      words: props.words(stage),
    }));
    const keys = rows.map((row) => row.key);
    return defineChart({
      marks: [
        barX(rows, { x1: "start", x2: "end", y: "key", color: "key", key: "key", radius: 2 }),
        ...(props.showValues
          ? [
              decorative(
                text(rows, {
                  x: "end",
                  y: "key",
                  text: "words",
                  anchor: "start",
                  dx: 6,
                  fontSize: AXIS_FONT_SIZE,
                  fill: CHART_THEME.muted,
                }),
              ),
            ]
          : []),
      ],
      scales: {
        x: {
          scale: scaleLinear().domain([0, Math.max(1, widest * (1 + LABEL_ROOM))]),
          axis: false,
        },
        y: {
          scale: scaleBand,
          axis: {
            ...CHART_AXIS,
            ticks: {
              format: (key: string) => rows.find((row) => row.key === key)?.label ?? key,
            },
          },
        },
      },
      color: { domain: keys, range: keys.map((key) => `var(--color-${key})`) },
      theme: CHART_THEME,
    });
  });
  return (
    <Chart
      class={props.class}
      data-slot="funnel-chart-plot"
      definition={definition()}
      ariaLabel={props.label}
      height={props.height}
      onFocusGroupChange={(points, origin) => {
        const first = points[0];
        if (first === undefined || !isDrawn(first.datum)) {
          scope.setFocus(null);
          return;
        }
        const stage = first.datum;
        scope.setFocus({
          label: stage.label,
          payload: [
            {
              dataKey: stage.key,
              name: stage.key,
              value: props.write(stage.value),
              color: `var(--color-${stage.key})`,
            },
            { name: props.share(stage), type: "share" },
          ],
          x: origin.x + first.x,
          y: origin.y + first.y,
        });
      }}
    />
  );
}
