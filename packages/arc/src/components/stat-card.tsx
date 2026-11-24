import { type Child, Show, cells, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Minus } from "@barqjs/lucide/icons/minus";
import { TrendingDown } from "@barqjs/lucide/icons/trending-down";
import { TrendingUp } from "@barqjs/lucide/icons/trending-up";
import type { UiProps } from "@barqjs/ui/props";
import { type RenderPart, uiProps } from "@barqjs/ui/slot";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts, rendered } from "../lib/parts.ts";
import { fg, gap, glyph, layout, space, surface, tone as tones, type } from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { Sparkline } from "./sparkline.tsx";

export const statCardStyles = variants({
  slots: {
    root: arc(surface.card, layout.column, layout.minZero, gap[1], { padding: space.x4 }),
    label: arc(type.sm, layout.flush, fg.muted),
    value: arc(type.stat),
    footer: arc(layout.row, layout.wrap, type.meta, { columnGap: space.x2, rowGap: space.x1 }),
    delta: arc(layout.inlineRow, gap[1], type.medium, type.numeric, fg.tone, glyph.sm),
    deltaLabel: arc({}),
    description: arc({}),
    trend: arc({ marginBlockStart: space.x2 }),
  },
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
  /** The recent values, oldest first, drawn as a sparkline. */
  trend?: readonly number[];
  /** The sparkline in words. Left out, one is written from the values. */
  trendLabel?: string;
  /** @default the delta's tone, else "info" */
  trendTone?: Tone;
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
 * ```
 *
 * The sparkline is an image with its numbers in words: how many, where it
 * started and ended, and its lowest and highest.
 */
export function StatCard(props: StatCardProps) {
  const labelId = createUniqueId();
  function cls(): Slots {
    return parts(statCardStyles(), props.classes);
  }
  function points(): readonly number[] {
    return props.trend ?? [];
  }
  return (
    <div
      {...uiProps("stat-card", () => cls().root, cells(props))}
      role="group"
      aria-labelledby={labelId}
    >
      {props.renders?.label === undefined ? (
        <p class={cls().label} id={labelId} data-slot="stat-card-label">
          {props.label}
        </p>
      ) : (
        rendered(
          props.renders.label,
          { class: cls().label, "data-slot": "stat-card-label", id: labelId },
          props.label,
        )
      )}
      {props.renders?.value === undefined ? (
        <p class={cls().value} data-slot="stat-card-value">
          {props.value}
        </p>
      ) : (
        rendered(
          props.renders.value,
          { class: cls().value, "data-slot": "stat-card-value" },
          props.value,
        )
      )}
      <Show when={props.delta !== undefined || props.description !== undefined}>
        <div class={cls().footer} data-slot="stat-card-footer">
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
            <span class={cls().description} data-slot="stat-card-description">
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
    </div>
  );
}
