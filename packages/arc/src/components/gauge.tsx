import { type Child, createMemo, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { meter } from "@barqjs/aria/link";
import { CHART_THEME, Chart, type ChartDefinition } from "@barqjs/ui/chart";
import type { RenderPart } from "@barqjs/ui/slot";
import { defineChart } from "@tanstack/charts";
import { pie, polar, radialArc } from "@tanstack/charts/polar";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts, rendered } from "../lib/parts.ts";
import { gap, layout, type } from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { chartCentreParts, chartNumbers } from "./chart-frame.tsx";

/** From `value` up, the gauge is drawn in `tone`. */
export interface GaugeThreshold {
  value: number;
  tone: Tone;
}

export const gaugeStyles = variants({
  slots: {
    root: arc(layout.column, layout.centre, layout.minZero, gap[1], { inlineSize: "100%" }),
    plot: arc(chartCentreParts.plot, {
      inlineSize: "100%",
      maxInlineSize: "16rem",
      aspectRatio: "1",
    }),
    centre: chartCentreParts.centre,
    value: chartCentreParts.centreValue,
    label: arc(type.label, { textAlign: "center" }),
  },
});

export type GaugeSlots = ReturnType<typeof gaugeStyles>;

export interface GaugeProps extends Customisable<GaugeSlots> {
  value: number;
  /** @default 0 */
  minValue?: number;
  /** @default 100 */
  maxValue?: number;
  /** What it measures, under it. Also the meter's name. */
  label: Child;
  /** The tone throughout. Ignored once `thresholds` are given. @default "info" */
  tone?: Tone;
  /** Tones by reading: `[{ value: 80, tone: "warning" }, { value: 95, tone: "danger" }]`. */
  thresholds?: readonly GaugeThreshold[];
  /** How the reading is written in the locale: `{ style: "unit", unit: "percent" }`. */
  formatOptions?: Intl.NumberFormatOptions;
  /** What to say instead of the written reading: `"42 of 50 seats"`. */
  valueLabel?: string;
  /** The drawing's height in px. @default its own square */
  height?: number;
  /** Another element for the reading or the label. */
  renders?: { value?: RenderPart<Child>; label?: RenderPart<Child> };
  id?: string;
}

/** The sweep, in radians from twelve o'clock: three quarters of a turn. */
const SWEEP = Math.PI * 0.75;

/** The tone a reading falls in. */
export function gaugeTone(
  value: number,
  thresholds: readonly GaugeThreshold[] | undefined,
  fallback: Tone,
): Tone {
  let tone = fallback;
  for (const threshold of [...(thresholds ?? [])].toSorted((a, b) => a.value - b.value)) {
    if (value >= threshold.value) tone = threshold.tone;
  }
  return tone;
}

/**
 * One reading against its range: a usage against a limit, a score, a load.
 *
 * ```tsx
 * <Gauge label="Storage" value={72} thresholds={[{ value: 80, tone: "warning" }, { value: 95, tone: "danger" }]}
 *   formatOptions={{ style: "unit", unit: "percent" }} />
 * ```
 *
 * A meter on `@barqjs/aria`: a screen reader hears its name, its range and
 * the reading as written, so the arc, drawn with TanStack Charts' polar arcs,
 * is never the only way to read it. Its tone changes at each threshold, and
 * the reading says it in words too.
 */
export function Gauge(props: GaugeProps) {
  const number = chartNumbers(props.formatOptions);
  const cls = (): GaugeSlots => parts(gaugeStyles(), props.classes);
  const min = (): number => props.minValue ?? 0;
  const max = (): number => props.maxValue ?? 100;
  const clamped = (): number => Math.min(max(), Math.max(min(), props.value));
  const written = (): string => number(props.value);
  const tone = (): Tone =>
    gaugeTone(
      props.value,
      props.thresholds,
      props.thresholds === undefined ? (props.tone ?? "info") : "info",
    );
  const labelId = createUniqueId();
  const { progressBarProps } = meter({
    value: () => props.value,
    minValue: min,
    maxValue: max,
    valueLabel: () => props.valueLabel ?? written(),
    "aria-labelledby": labelId,
    id: () => props.id,
  });

  const definition = createMemo((): ChartDefinition => {
    const span = max() - min();
    const share = span === 0 ? 0 : (clamped() - min()) / span;
    const segments = [
      { id: "reading", value: share },
      { id: "rest", value: 1 - share },
    ];
    return defineChart({
      marks: [
        polar({
          inset: 4,
          marks: [
            radialArc(pie(segments, { value: "value", startAngle: -SWEEP, endAngle: SWEEP }), {
              innerRadius: ({ radius }) => radius * 0.8,
              cornerRadius: 999,
              color: "id",
              key: "id",
            }),
          ],
          scales: { angle: null, radius: null },
        }),
      ],
      scales: { x: null, y: null },
      color: { domain: ["reading", "rest"], range: [`var(--${tone()})`, "var(--muted)"] },
      theme: CHART_THEME,
      keyboard: false,
      pointer: false,
    });
  });

  return (
    <div
      {...progressBarProps}
      class={arc(cls().root, props.class, props.className)}
      data-slot="gauge"
      data-tone={tone()}
    >
      <div class={cls().plot} data-slot="gauge-plot" style={{ height: heightOf(props.height) }}>
        <Chart definition={definition()} ariaLabel={written()} height={props.height} />
        <div class={cls().centre} data-slot="gauge-centre" aria-hidden="true">
          {props.renders?.value === undefined ? (
            <span class={cls().value} data-slot="gauge-value">
              {written()}
            </span>
          ) : (
            rendered(
              props.renders.value,
              { class: cls().value, "data-slot": "gauge-value" },
              written(),
            )
          )}
        </div>
      </div>
      {props.renders?.label === undefined ? (
        <span class={cls().label} id={labelId} data-slot="gauge-label">
          {props.label}
        </span>
      ) : (
        rendered(
          props.renders.label,
          { class: cls().label, id: labelId, "data-slot": "gauge-label" },
          props.label,
        )
      )}
    </div>
  );
}

function heightOf(height: number | undefined): string | undefined {
  return height === undefined ? undefined : `${String(height)}px`;
}
