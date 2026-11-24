import { For, Show, cells } from "@barqjs/core";
import { variants } from "@barqjs/css";
import type { UiProps } from "@barqjs/ui/props";
import { uiProps } from "@barqjs/ui/slot";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, place, space, tone as tones } from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { chartNumbers } from "./chart-frame.tsx";
import { useArcMessages } from "./messages.ts";

export type SparklineVariant = "line" | "area" | "bar";

/** The width and height a sparkline is drawn in before it is stretched to its box. */
const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 32;
const INSET = 2;

export const sparklineStyles = variants({
  slots: {
    root: arc(fg.toneBase, place.block, {
      height: space.x10,
      overflow: "visible",
    }),
    area: arc({}),
    line: arc({}),
    bar: arc({}),
  },
  variants: {
    tone: {
      success: { root: tones.success },
      warning: { root: tones.warning },
      danger: { root: tones.danger },
      info: { root: tones.info },
      neutral: { root: tones.neutral },
    },
  },
  defaults: { tone: "info" },
});

export type SparklineSlots = ReturnType<typeof sparklineStyles>;

export interface SparklineProps
  extends Omit<UiProps, "class" | "className">, Customisable<SparklineSlots> {
  /** The values, oldest first. */
  data: readonly number[];
  /** A line, a line over a filled area, or a bar per value. @default "line" */
  variant?: SparklineVariant;
  /** @default "info" */
  tone?: Tone;
  /**
   * The range the height spans, so sparklines in a column share one scale.
   * @default the values' own lowest and highest, from zero for bars
   */
  domain?: readonly [number, number];
  /** The values in words. Left out, one is written from them. */
  label?: string;
  /** How the numbers in the written description are formatted. */
  formatOptions?: Intl.NumberFormatOptions;
}

function rangeOf(
  points: readonly number[],
  variant: SparklineVariant,
  domain: readonly [number, number] | undefined,
): [number, number] {
  if (domain !== undefined) return [domain[0], domain[1]];
  const low = Math.min(...points);
  const high = Math.max(...points);
  return variant === "bar" ? [Math.min(0, low), Math.max(0, high)] : [low, high];
}

/** How far down the view box `value` sits in `range`. */
function heightOf(value: number, [low, high]: [number, number]): number {
  const span = high - low;
  if (span === 0) return VIEW_HEIGHT / 2;
  return INSET + (1 - (value - low) / span) * (VIEW_HEIGHT - INSET * 2);
}

interface SparkPaths {
  line: string;
  area: string;
}

/** The two paths of a line over `points`, and of the area under it, in the view box. */
function sparkPaths(points: readonly number[], range: [number, number]): SparkPaths {
  const step = VIEW_WIDTH / (points.length - 1);
  const coordinates = points.map(
    (point, index) => `${(index * step).toFixed(2)},${heightOf(point, range).toFixed(2)}`,
  );
  const line = `M${coordinates.join("L")}`;
  return { line, area: `${line}L${VIEW_WIDTH},${VIEW_HEIGHT}L0,${VIEW_HEIGHT}Z` };
}

interface Bar {
  x: string;
  y: string;
  width: string;
  height: string;
}

/** A bar per value, from the range's zero (or its floor) to the value. */
function sparkBars(points: readonly number[], range: [number, number]): Bar[] {
  const slot = VIEW_WIDTH / points.length;
  const base = heightOf(Math.min(Math.max(0, range[0]), range[1]), range);
  return points.map((point, index) => {
    const top = heightOf(point, range);
    return {
      x: (index * slot + slot * 0.15).toFixed(2),
      y: Math.min(top, base).toFixed(2),
      width: (slot * 0.7).toFixed(2),
      height: Math.max(Math.abs(base - top), 0.5).toFixed(2),
    };
  });
}

/**
 * A trend with no axes, beside a number or in a table cell.
 *
 * ```tsx
 * <Sparkline data={[3, 5, 4, 8, 7]} />
 * <Sparkline data={latencies} variant="area" tone="warning" />
 * <Sparkline data={dailyErrors} variant="bar" tone="danger" domain={[0, 50]} />
 * ```
 *
 * An image with its numbers in words: how many, where it started and ended,
 * and its lowest and highest, in the locale. It stretches to its box and its
 * strokes stay a hairline at any width. `StatCard` draws its trend with one.
 */
export function Sparkline(props: SparklineProps) {
  const messages = useArcMessages();
  const number = chartNumbers(props.formatOptions);
  function cls(): SparklineSlots {
    return parts(sparklineStyles({ tone: props.tone }), props.classes);
  }
  function variant(): SparklineVariant {
    return props.variant ?? "line";
  }
  function range(): [number, number] {
    return rangeOf(props.data, variant(), props.domain);
  }
  function paths(): SparkPaths {
    return sparkPaths(props.data, range());
  }
  function described(): string {
    if (props.label !== undefined) return props.label;
    const all = props.data;
    if (all.length === 0) return messages().nothingHere;
    return messages().trend(
      String(all.length),
      number(all[0] ?? 0),
      number(all[all.length - 1] ?? 0),
      number(Math.min(...all)),
      number(Math.max(...all)),
    );
  }

  return (
    <svg
      {...uiProps("sparkline", () => arc(cls().root, props.class, props.className), cells(props))}
      data-variant={variant()}
      data-tone={props.tone ?? "info"}
      viewBox={`0 0 ${String(VIEW_WIDTH)} ${String(VIEW_HEIGHT)}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={described()}
    >
      <Show when={variant() !== "bar" && props.data.length > 1}>
        <Show when={variant() === "area"}>
          <path
            class={cls().area}
            data-slot="sparkline-area"
            d={paths().area}
            fill="currentColor"
            fill-opacity="0.12"
            stroke="none"
          />
        </Show>
        <path
          class={cls().line}
          data-slot="sparkline-line"
          d={paths().line}
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
      </Show>
      <Show when={variant() === "bar"}>
        <For each={sparkBars(props.data, range())}>
          {(bar) => (
            <rect
              class={cls().bar}
              data-slot="sparkline-bar"
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              fill="currentColor"
            />
          )}
        </For>
      </Show>
    </svg>
  );
}
