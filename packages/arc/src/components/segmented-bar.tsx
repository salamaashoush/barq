import { For, Show, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { progressBar } from "@barqjs/aria/link";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, fg, gap, layout, plainList, rounded, space, square, type } from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { chartNumbers, toneColour } from "./chart-frame.tsx";
import { useArcMessages } from "./messages.ts";

/** One share of the bar: an outcome, a phase, a kind of use. */
export interface BarSegment {
  key: string;
  label: string;
  value: number;
  /** Drawn in a tone of the theme. @default the theme's `--chart-N` */
  tone?: Tone;
  /** Any colour, which wins over `tone`. */
  color?: string;
}

export const segmentedBarStyles = variants({
  slots: {
    root: arc(layout.column, layout.minZero, gap[2]),
    header: arc(layout.row, layout.between, layout.wrap, gap.line),
    label: arc(type.label),
    caption: arc(type.meta, type.numeric),
    track: arc(bg.muted, rounded.sm, layout.clip, layout.row, { blockSize: space.x2, gap: "1px" }),
    segment: arc({ blockSize: "100%", flexShrink: "0" }),
    legend: arc(plainList, layout.row, layout.wrap, type.meta, gap.line),
    item: arc(layout.inlineRow, gap[1.5]),
    swatch: arc(rounded.xs, layout.noShrink, square.x2),
    count: arc(type.numeric, type.medium, fg.default),
  },
  variants: {
    size: {
      sm: { track: arc({ blockSize: space.x1_5 }) },
      md: {},
      lg: { track: arc({ blockSize: space.x4 }) },
    },
  },
  defaults: { size: "md" },
});

export type SegmentedBarSlots = ReturnType<typeof segmentedBarStyles>;

interface SegmentPartsProps {
  cls: SegmentedBarSlots;
  segments: readonly BarSegment[];
  /** What the whole bar stands for; the rest past the segments is the empty track. */
  whole: number;
}

interface SegmentLegendProps extends SegmentPartsProps {
  shares: boolean;
  write: (value: number) => string;
  writeShare: (value: number) => string;
}

function colourOf(segment: BarSegment, at: number): string {
  return segment.color ?? toneColour(segment.tone, at);
}

function percent(value: number, whole: number): string {
  if (whole <= 0) return "0%";
  return `${String(Math.round((Math.max(0, value) / whole) * 10000) / 100)}%`;
}

function SegmentTrack(props: SegmentPartsProps) {
  return (
    <div class={props.cls.track} data-slot="segmented-bar-track" aria-hidden="true">
      <For each={() => props.segments.filter((segment) => segment.value > 0)}>
        {(segment: BarSegment) => (
          <span
            class={props.cls.segment}
            data-slot="segmented-bar-segment"
            data-key={segment.key}
            style={{
              "inline-size": percent(segment.value, props.whole),
              "background-color": colourOf(segment, props.segments.indexOf(segment)),
            }}
          />
        )}
      </For>
    </div>
  );
}

function SegmentLegend(props: SegmentLegendProps) {
  return (
    <ul class={props.cls.legend} data-slot="segmented-bar-legend">
      <For each={() => props.segments}>
        {(segment: BarSegment, at: () => number) => (
          <li class={props.cls.item} data-slot="segmented-bar-item" data-key={segment.key}>
            <span
              class={props.cls.swatch}
              data-slot="segmented-bar-swatch"
              style={{ "background-color": colourOf(segment, at()) }}
            />
            {segment.label}
            <span class={props.cls.count} data-slot="segmented-bar-count">
              {props.shares
                ? props.writeShare(props.whole <= 0 ? 0 : segment.value / props.whole)
                : props.write(segment.value)}
            </span>
          </li>
        )}
      </For>
    </ul>
  );
}

export interface SegmentedBarProps extends Customisable<SegmentedBarSlots> {
  /** Names the bar, drawn above it unless `labelHidden`. */
  label: string;
  segments: readonly BarSegment[];
  /** What the whole bar stands for, the rest an empty track. @default the segments' sum */
  total?: number;
  /** The key under the bar, with each segment's count or share. @default true */
  legend?: boolean;
  /** The legend gives each segment's share of the whole rather than its count. @default false */
  shares?: boolean;
  /** The label for a screen reader only. @default false */
  labelHidden?: boolean;
  /** Beside the label: a total, a duration. */
  caption?: string;
  /** How the counts are written in the locale. */
  formatOptions?: Intl.NumberFormatOptions;
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  id?: string;
}

/**
 * A whole split into shares in tones: a run's outcomes, a request's phases,
 * storage by kind.
 *
 * ```tsx
 * <SegmentedBar label="Request timing" shares segments={[
 *   { key: "dns", label: "DNS", value: 12 },
 *   { key: "connect", label: "Connect", value: 30 },
 *   { key: "wait", label: "Waiting", value: 180, tone: "warning" },
 * ]} />
 * ```
 *
 * The legend under it names every segment with its count or share, so the
 * colours are never the only key; without the legend, the bar is an image
 * whose name says each share in words.
 */
export function SegmentedBar(props: SegmentedBarProps) {
  const messages = useArcMessages();
  const number = chartNumbers(props.formatOptions);
  const share = chartNumbers({ style: "percent", maximumFractionDigits: 1 });
  const labelId = createUniqueId();
  function cls(): SegmentedBarSlots {
    return parts(segmentedBarStyles({ size: props.size }), props.classes);
  }
  function whole(): number {
    return (
      props.total ?? props.segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0)
    );
  }
  function legend(): boolean {
    return props.legend !== false;
  }
  function words(): string {
    return messages().segmentsOf(
      props.segments.map((segment) => `${segment.label} ${number(segment.value)}`),
      number(whole()),
    );
  }
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="segmented-bar"
      role={legend() ? "group" : "img"}
      aria-labelledby={legend() ? labelId : undefined}
      aria-label={legend() ? undefined : `${props.label}: ${words()}`}
    >
      <div
        class={cls().header}
        data-slot="segmented-bar-header"
        hidden={props.labelHidden === true ? true : undefined}
      >
        <span class={cls().label} id={labelId} data-slot="segmented-bar-label">
          {props.label}
        </span>
        <Show when={props.caption !== undefined}>
          <span class={cls().caption} data-slot="segmented-bar-caption">
            {props.caption}
          </span>
        </Show>
      </div>
      <SegmentTrack cls={cls()} segments={props.segments} whole={whole()} />
      <Show when={legend()}>
        <SegmentLegend
          cls={cls()}
          segments={props.segments}
          whole={whole()}
          shares={props.shares === true}
          write={number}
          writeShare={share}
        />
      </Show>
    </div>
  );
}

export interface TallyProgressProps extends Customisable<SegmentedBarSlots> {
  /** Names the progress bar: "Tests finished". */
  label: string;
  /** How many there are in all; those not in a segment are still to come. */
  total: number;
  /** What has finished, by outcome. */
  segments: readonly BarSegment[];
  /** The line under the bar. @default "12 of 50 finished", or "All 50 finished" */
  caption?: string;
  /** The key, with each outcome's count. @default true */
  legend?: boolean;
  /** How the counts are written in the locale. */
  formatOptions?: Intl.NumberFormatOptions;
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  id?: string;
}

/**
 * Progress through a batch, split by how each finished: a suite run's
 * tests, an import's rows, a deploy's steps.
 *
 * ```tsx
 * <TallyProgress label="Tests finished" total={50} segments={[
 *   { key: "passed", label: "Passed", value: 40, tone: "success" },
 *   { key: "failed", label: "Failed", value: 3, tone: "danger" },
 * ]} />
 * ```
 *
 * A progress bar on `@barqjs/aria` whose reading is how many have finished
 * of how many ("43 of 50 finished"); the bar fills with each outcome's share
 * over the empty track of those still to come, and the legend counts each.
 */
export function TallyProgress(props: TallyProgressProps) {
  const messages = useArcMessages();
  const number = chartNumbers(props.formatOptions);
  const labelId = createUniqueId();
  function cls(): SegmentedBarSlots {
    return parts(segmentedBarStyles({ size: props.size }), props.classes);
  }
  function settled(): number {
    return Math.min(
      props.total,
      props.segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0),
    );
  }
  function caption(): string {
    if (props.caption !== undefined) return props.caption;
    return settled() >= props.total
      ? messages().tallyDone(number(props.total))
      : messages().tallyProgress(number(settled()), number(props.total));
  }
  const { progressBarProps } = progressBar({
    value: settled,
    maxValue: () => props.total,
    valueLabel: caption,
    "aria-labelledby": labelId,
    id: () => props.id,
  });
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      data-slot="tally-progress"
      data-complete={settled() >= props.total ? "" : undefined}
    >
      <div class={cls().header} data-slot="segmented-bar-header">
        <span class={cls().label} id={labelId} data-slot="segmented-bar-label">
          {props.label}
        </span>
        <span class={cls().caption} data-slot="segmented-bar-caption" aria-hidden="true">
          {caption()}
        </span>
      </div>
      <div {...progressBarProps} data-slot="tally-progress-bar">
        <SegmentTrack cls={cls()} segments={props.segments} whole={props.total} />
      </div>
      <Show when={props.legend !== false}>
        <SegmentLegend
          cls={cls()}
          segments={props.segments}
          whole={props.total}
          shares={false}
          write={number}
          writeShare={number}
        />
      </Show>
    </div>
  );
}
