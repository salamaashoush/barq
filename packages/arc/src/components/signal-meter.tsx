import { For, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { meter } from "@barqjs/aria/link";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, gap, layout, rounded, space, tone as tones, type } from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { type ArcMessages, useArcMessages } from "./messages.ts";

/** How good a connection is, or that nobody knows yet. */
export type SignalLevel = "excellent" | "good" | "fair" | "poor" | "unknown";

const BARS: Record<SignalLevel, number> = { excellent: 4, good: 3, fair: 2, poor: 1, unknown: 0 };

export const SIGNAL_TONE: Record<SignalLevel, Tone> = {
  excellent: "success",
  good: "success",
  fair: "warning",
  poor: "danger",
  unknown: "neutral",
};

/** A signal level in arc's words. */
export function signalLabel(messages: ArcMessages, level: SignalLevel): string {
  if (level === "excellent") return messages.signalExcellent;
  if (level === "good") return messages.signalGood;
  if (level === "fair") return messages.signalFair;
  if (level === "poor") return messages.signalPoor;
  return messages.signalUnknown;
}

export const signalMeterStyles = variants({
  slots: {
    root: arc(layout.inlineRow, gap[1.5], type.meta),
    bars: arc(layout.inlineRow, layout.noShrink, {
      alignItems: "flex-end",
      gap: "1px",
      blockSize: space.x3,
    }),
    bar: arc(rounded.xs, bg.muted, { inlineSize: space.x1 }),
    label: arc({}),
  },
  variants: {
    size: {
      sm: {},
      md: { bars: arc({ blockSize: space.x4 }), bar: arc({ inlineSize: space.x1_5 }) },
    },
  },
  defaults: { size: "sm" },
});

export type SignalMeterSlots = ReturnType<typeof signalMeterStyles>;

export interface SignalMeterProps extends Customisable<SignalMeterSlots> {
  level: SignalLevel;
  /** What the signal is of. @default arc's "Connection" */
  label?: string;
  /** The level in words beside the bars, as well as read out. @default false */
  showLabel?: boolean;
  /** @default "sm" */
  size?: "sm" | "md";
  id?: string;
}

/**
 * How good a connection is, as four bars: a call's participant, a device,
 * a live feed.
 *
 * ```tsx
 * <SignalMeter level="fair" />
 * <SignalMeter level={quality()} showLabel label="Network" />
 * ```
 *
 * A meter on `@barqjs/aria` reading its level in words ("Connection: fair"),
 * so neither the number of bars lit nor their tone is the only way to tell.
 */
export function SignalMeter(props: SignalMeterProps) {
  const messages = useArcMessages();
  function cls(): SignalMeterSlots {
    return parts(signalMeterStyles({ size: props.size }), props.classes);
  }
  function words(): string {
    return signalLabel(messages(), props.level);
  }
  function name(): string {
    return props.label ?? messages().connection;
  }
  const { progressBarProps } = meter({
    value: () => BARS[props.level],
    minValue: 0,
    maxValue: 4,
    valueLabel: words,
    "aria-label": name,
    id: () => props.id,
  });
  return (
    <span
      {...progressBarProps}
      class={arc(cls().root, tones[SIGNAL_TONE[props.level]], props.class, props.className)}
      data-slot="signal-meter"
      data-level={props.level}
    >
      <span class={cls().bars} data-slot="signal-meter-bars" aria-hidden="true">
        <For each={[1, 2, 3, 4]}>
          {(bar: number) => (
            <span
              class={arc(cls().bar, bar <= BARS[props.level] ? bg.toneSolid : undefined)}
              data-slot="signal-meter-bar"
              data-lit={bar <= BARS[props.level] ? "" : undefined}
              style={{ "block-size": `${String(bar * 25)}%` }}
            />
          )}
        </For>
      </span>
      <Show when={props.showLabel === true}>
        <span class={cls().label} data-slot="signal-meter-label" aria-hidden="true">
          {words()}
        </span>
      </Show>
    </span>
  );
}
