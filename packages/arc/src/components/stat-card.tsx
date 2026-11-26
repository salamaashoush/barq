import { type Child, Show, cells, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Button as AriaButton } from "@barqjs/aria/button";
import { Link as AriaLink } from "@barqjs/aria/link";
import { Minus } from "@barqjs/lucide/icons/minus";
import { TrendingDown } from "@barqjs/lucide/icons/trending-down";
import { TrendingUp } from "@barqjs/lucide/icons/trending-up";
import { on } from "@barqjs/ui/conditions";
import type { UiProps } from "@barqjs/ui/props";
import { Skeleton } from "@barqjs/ui/skeleton";
import { type RenderPart, uiProps } from "@barqjs/ui/slot";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts, rendered } from "../lib/parts.ts";
import {
  bg,
  control,
  fg,
  gap,
  glyph,
  interaction,
  layout,
  motion,
  rounded,
  space,
  square,
  surface,
  tone as tones,
  type,
} from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import type { GaugeThreshold } from "./gauge.tsx";
import { Meter } from "./meter.tsx";
import { MetricRating, type MetricRatingLevel, RATING_TONE } from "./metric-rating.tsx";
import { Sparkline } from "./sparkline.tsx";

export const statCardStyles = variants({
  slots: {
    root: arc(surface.card, layout.column, layout.minZero, layout.relative, gap[1], {
      padding: space.x4,
    }),
    label: arc(type.sm, layout.flush, fg.muted, layout.minZero),
    link: control.stretched,
    body: arc(layout.row, layout.between, layout.minZero, gap[3], { alignItems: "flex-end" }),
    value: arc(type.stat, layout.minZero, { overflowWrap: "anywhere" }),
    aside: arc(layout.noShrink, {
      display: { default: "none", [on.sm]: "block" },
      marginBlockEnd: space.x1,
    }),
    meter: arc({ marginBlock: space.x1 }),
    footer: arc(layout.row, layout.wrap, type.meta, { columnGap: space.x2, rowGap: space.x1 }),
    delta: arc(layout.inlineRow, gap[1], type.medium, type.numeric, fg.tone, glyph.sm),
    deltaLabel: arc({}),
    description: arc(layout.inlineRow, gap[1.5]),
    descriptionDot: arc(rounded.full, bg.toneSolid, layout.noShrink, square.x2),
    trend: arc({ marginBlockStart: space.x2 }),
    valueSkeleton: arc({ blockSize: space.x8, inlineSize: "60%", marginBlock: space.x0_5 }),
    footerSkeleton: arc({ blockSize: space.x4, inlineSize: "40%" }),
  },
  variants: {
    interactive: {
      true: {
        root: arc(motion.colours, interaction.hoverEdge),
      },
      false: {},
    },
    valueTone: {
      warning: { value: arc(tones.warning, fg.tone) },
      danger: { value: arc(tones.danger, fg.tone) },
      none: {},
    },
  },
  defaults: { interactive: false, valueTone: "none" },
});

type Slots = ReturnType<typeof statCardStyles>;

export interface StatDelta {
  /** The change as the reader should see it, sign included: `"+12%"`. */
  value: Child;
  /** @default "neutral" */
  tone?: Tone;
  /** Which way the arrow points. The value's own sign says it in words. @default "flat" */
  direction?: "up" | "down" | "flat";
  /** What it is measured against, after it: `"from last week"`. */
  label?: Child;
}

/** How full the number is against its limit, drawn as a bar under it. */
export interface StatMeter {
  value: number;
  max: number;
  /** @default 0 */
  min?: number;
  /** Tones by reading, in the value's own units. @default the card's `valueTone`, else "info" */
  thresholds?: readonly GaugeThreshold[];
  /** The reading in words: `"12 of 40 seats"`. @default "12 of 40", in the locale */
  valueLabel?: string;
}

export interface StatCardRenders {
  label?: RenderPart<Child>;
  value?: RenderPart<Child>;
}

export interface StatCardProps extends Omit<UiProps, "class" | "className">, Customisable<Slots> {
  label: Child;
  /** Already formatted for the reader: a count, an amount, a duration. */
  value: Child;
  delta?: StatDelta;
  /** A line under the value. */
  description?: Child;
  /** A dot in a tone before the description, for a line that reports a state. */
  descriptionTone?: Tone;
  /** The value drawn in a tone, kept for a number that is wrong: never for one that is fine. */
  valueTone?: "warning" | "danger";
  /**
   * How the number rates: a word and a tone in the footer, and the value in
   * that tone when it is fair or poor.
   */
  rating?: MetricRatingLevel;
  /** A bar under the value, how full it is against its limit. */
  meter?: StatMeter;
  /** Beside the value at its end, from the `sm` breakpoint: a sparkline, a badge. */
  aside?: Child;
  /** The recent values, oldest first, drawn as a sparkline. */
  trend?: readonly number[];
  /** The sparkline in words. Left out, one is written from the values. */
  trendLabel?: string;
  /** @default the delta's tone, else "info" */
  trendTone?: Tone;
  /** The whole card opens this, its label the link's name. */
  href?: string;
  /** The whole card presses, its label the button's name. */
  onPress?: () => void;
  /** Shapes in place of the value and the footer while the number loads. */
  loading?: boolean;
  /** Another element for what it counts or for the number: a heading, a link. */
  renders?: StatCardRenders;
}

/**
 * One number, what it counts, how it moved, and where it has been.
 *
 * ```tsx
 * <StatCard
 *   label="Active projects"
 *   value="128"
 *   delta={{ value: "+12%", tone: "success", direction: "up", label: "from last week" }}
 *   trend={[90, 96, 101, 99, 110, 121, 128]}
 * />
 * <StatCard label="Seats" value="38" meter={{ value: 38, max: 40 }} description="2 left" href="/seats" />
 * ```
 *
 * The sparkline is an image with its numbers in words: how many, where it
 * started and ended, and its lowest and highest. A `meter` is a `Meter`
 * named by the label. With `href` or `onPress` the label is the link or the
 * button, stretched over the whole card.
 */
export function StatCard(props: StatCardProps) {
  const labelId = createUniqueId();
  function valueTone(): "warning" | "danger" | undefined {
    if (props.valueTone !== undefined) return props.valueTone;
    if (props.rating === "fair" || props.rating === "poor") {
      return RATING_TONE[props.rating] as "warning" | "danger";
    }
    return undefined;
  }
  function interactive(): boolean {
    return props.href !== undefined || props.onPress !== undefined;
  }
  function cls(): Slots {
    return parts(
      statCardStyles({ interactive: interactive(), valueTone: valueTone() ?? "none" }),
      props.classes,
    );
  }
  function points(): readonly number[] {
    return props.trend ?? [];
  }
  function labelContent(): Child {
    if (props.href !== undefined) {
      return (
        <AriaLink class={cls().link} data-slot="stat-card-link" href={props.href}>
          {props.label}
        </AriaLink>
      );
    }
    if (props.onPress !== undefined) {
      return (
        <AriaButton class={cls().link} data-slot="stat-card-link" onPress={() => props.onPress?.()}>
          {props.label}
        </AriaButton>
      );
    }
    return props.label;
  }
  function hasFooter(): boolean {
    return (
      props.delta !== undefined || props.description !== undefined || props.rating !== undefined
    );
  }
  return (
    <div
      {...uiProps("stat-card", () => cls().root, cells(props))}
      role="group"
      aria-labelledby={labelId}
      aria-busy={props.loading === true ? "true" : undefined}
    >
      {props.renders?.label === undefined ? (
        <p class={cls().label} id={labelId} data-slot="stat-card-label">
          {labelContent()}
        </p>
      ) : (
        rendered(
          props.renders.label,
          { class: cls().label, "data-slot": "stat-card-label", id: labelId },
          labelContent(),
        )
      )}
      <Show
        when={props.loading !== true}
        fallback={
          <>
            <Skeleton class={cls().valueSkeleton} data-slot="stat-card-value-skeleton" />
            <Show when={hasFooter()}>
              <Skeleton class={cls().footerSkeleton} data-slot="stat-card-footer-skeleton" />
            </Show>
          </>
        }
      >
        <div class={cls().body} data-slot="stat-card-body">
          {props.renders?.value === undefined ? (
            <p class={cls().value} data-slot="stat-card-value" data-tone={valueTone()}>
              {props.value}
            </p>
          ) : (
            rendered(
              props.renders.value,
              { class: cls().value, "data-slot": "stat-card-value" },
              props.value,
            )
          )}
          <Show when={props.aside !== undefined}>
            <div class={cls().aside} data-slot="stat-card-aside">
              {props.aside}
            </div>
          </Show>
        </div>
        <Show when={props.meter}>
          {(meter: () => StatMeter) => (
            <Meter
              class={cls().meter}
              label={props.label}
              labelHidden
              size="sm"
              value={meter().value}
              minValue={meter().min}
              maxValue={meter().max}
              thresholds={meter().thresholds}
              tone={valueTone() ?? "info"}
              valueLabel={meter().valueLabel}
            />
          )}
        </Show>
        <Show when={hasFooter()}>
          <div class={cls().footer} data-slot="stat-card-footer">
            <Show when={props.rating}>
              {(rating: () => MetricRatingLevel) => <MetricRating rating={rating()} />}
            </Show>
            <Show when={props.delta}>
              <span
                class={arc(cls().delta, tones[props.delta?.tone ?? "neutral"])}
                data-slot="stat-card-delta"
                data-tone={props.delta?.tone ?? "neutral"}
                data-direction={props.delta?.direction ?? "flat"}
              >
                {props.delta?.direction === "up" ? (
                  <TrendingUp aria-hidden="true" />
                ) : props.delta?.direction === "down" ? (
                  <TrendingDown aria-hidden="true" />
                ) : (
                  <Minus aria-hidden="true" />
                )}
                {props.delta?.value}
              </span>
              <Show when={props.delta?.label}>
                <span class={cls().deltaLabel} data-slot="stat-card-delta-label">
                  {props.delta?.label}
                </span>
              </Show>
            </Show>
            <Show when={props.description}>
              <span
                class={arc(
                  cls().description,
                  props.descriptionTone === undefined ? undefined : tones[props.descriptionTone],
                )}
                data-slot="stat-card-description"
                data-tone={props.descriptionTone}
              >
                <Show when={props.descriptionTone !== undefined}>
                  <span
                    class={cls().descriptionDot}
                    data-slot="stat-card-description-dot"
                    aria-hidden="true"
                  />
                </Show>
                {props.description}
              </span>
            </Show>
          </div>
        </Show>
        <Show when={points().length > 1}>
          <Sparkline
            data-slot="stat-card-trend"
            class={cls().trend}
            data={points()}
            variant="area"
            tone={props.trendTone ?? props.delta?.tone ?? "info"}
            label={props.trendLabel}
          />
        </Show>
      </Show>
    </div>
  );
}
