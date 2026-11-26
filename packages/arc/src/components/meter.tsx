import { type Child, For, Show, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { meter } from "@barqjs/aria/link";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  fg,
  gap,
  layout,
  plainList,
  rounded,
  space,
  tone as tones,
  type,
} from "../style/index.ts";
import type { Tone } from "../theme/tokens.ts";
import { chartNumbers } from "./chart-frame.tsx";
import { type GaugeThreshold, gaugeTone } from "./gauge.tsx";
import { useArcMessages } from "./messages.ts";

export const meterStyles = variants({
  slots: {
    root: arc(layout.column, layout.minZero, gap[1.5]),
    header: arc(layout.row, layout.between, layout.wrap, gap.line),
    label: arc(type.label, layout.minZero),
    reading: arc(type.sm, type.numeric, fg.muted),
    track: arc(bg.muted, rounded.full, layout.clip, layout.row, { blockSize: space.x1_5 }),
    fill: arc(bg.toneSolid, rounded.full, { blockSize: "100%" }),
  },
  variants: {
    size: {
      sm: { track: arc({ blockSize: space.x1 }) },
      md: {},
      lg: { track: arc({ blockSize: space.x2_5 }) },
    },
    toned: { true: { reading: fg.tone }, false: {} },
  },
  defaults: { size: "md", toned: false },
});

export type MeterSlots = ReturnType<typeof meterStyles>;

export interface MeterProps extends Customisable<MeterSlots> {
  /** What it measures. Also the meter's name. */
  label: Child;
  value: number;
  /** @default 0 */
  minValue?: number;
  /** @default 100 */
  maxValue?: number;
  /** The tone throughout. Ignored once `thresholds` are given. @default "info" */
  tone?: Tone;
  /** Tones by reading, in the value's own units: `[{ value: 32, tone: "warning" }]`. */
  thresholds?: readonly GaugeThreshold[];
  /** How the numbers are written in the locale. */
  formatOptions?: Intl.NumberFormatOptions;
  /** The reading in words, shown and read out. @default "12 of 40", in the locale */
  valueLabel?: string;
  /** The label drawn for a screen reader only, where the meter sits under a heading that says it. */
  labelHidden?: boolean;
  /** No reading beside the label. @default false */
  readingHidden?: boolean;
  /** The track's thickness. @default "md" */
  size?: "sm" | "md" | "lg";
  id?: string;
}

/**
 * A reading against its range as a bar: a usage against a limit, seats
 * taken, a quota.
 *
 * ```tsx
 * <Meter label="Browser minutes" value={412} maxValue={500}
 *   thresholds={[{ value: 400, tone: "warning" }, { value: 500, tone: "danger" }]} />
 * ```
 *
 * A meter on `@barqjs/aria` named by its label, its reading written beside
 * it and read as written ("412 of 500"), so the bar's length and tone are
 * never the only way to tell it. The `Gauge`'s linear sibling: the same
 * thresholds, the same `gaugeTone`.
 */
export function Meter(props: MeterProps) {
  const messages = useArcMessages();
  const number = chartNumbers(props.formatOptions);
  const labelId = createUniqueId();
  function cls(): MeterSlots {
    return parts(
      meterStyles({ size: props.size, toned: tone() === "warning" || tone() === "danger" }),
      props.classes,
    );
  }
  function min(): number {
    return props.minValue ?? 0;
  }
  function max(): number {
    return props.maxValue ?? 100;
  }
  function share(): number {
    const span = max() - min();
    if (span <= 0) return 0;
    return Math.min(1, Math.max(0, (props.value - min()) / span));
  }
  function tone(): Tone {
    return gaugeTone(
      props.value,
      props.thresholds,
      props.thresholds === undefined ? (props.tone ?? "info") : "info",
    );
  }
  function reading(): string {
    return props.valueLabel ?? messages().amountOf(number(props.value), number(max()));
  }
  const { progressBarProps } = meter({
    value: () => props.value,
    minValue: min,
    maxValue: max,
    valueLabel: reading,
    "aria-labelledby": labelId,
    id: () => props.id,
  });
  return (
    <div
      class={arc(cls().root, tones[tone()], props.class, props.className)}
      data-slot="meter"
      data-tone={tone()}
    >
      <div class={props.labelHidden === true ? srOnly : cls().header} data-slot="meter-header">
        <span class={cls().label} id={labelId} data-slot="meter-label">
          {props.label}
        </span>
        <Show when={props.readingHidden !== true}>
          <span class={cls().reading} data-slot="meter-reading" aria-hidden="true">
            {reading()}
          </span>
        </Show>
      </div>
      <div {...progressBarProps} class={cls().track} data-slot="meter-track">
        <span
          class={cls().fill}
          data-slot="meter-fill"
          style={{ "inline-size": `${String(Math.round(share() * 1000) / 10)}%` }}
        />
      </div>
    </div>
  );
}

/** One thing metered against what the plan allows. */
export interface UsageItem {
  key: string;
  label: Child;
  used: number;
  /** What is allowed. `null` is no limit, said in words with no bar. */
  limit: number | null;
  /** How this item's numbers are written: minutes, bytes, a currency. @default the list's */
  formatOptions?: Intl.NumberFormatOptions;
  /** A line under it: what counts, when it resets. */
  description?: Child;
}

export const usageListStyles = variants({
  slots: {
    root: arc(plainList, layout.column, gap[4]),
    item: arc(layout.column, layout.minZero, gap[1]),
    unlimited: arc(layout.row, layout.between, layout.wrap, gap.line),
    label: arc(type.label),
    reading: arc(type.sm, type.numeric, fg.muted),
    state: arc(type.meta, fg.tone),
    description: arc(type.meta),
  },
});

export type UsageListSlots = ReturnType<typeof usageListStyles>;

export interface UsageListProps extends Customisable<UsageListSlots> {
  items: readonly UsageItem[];
  /** The share of a limit from which an item turns to a warning. @default 0.8 */
  warnAt?: number;
  /** How the numbers are written in the locale. */
  formatOptions?: Intl.NumberFormatOptions;
  /** Names the list. */
  "aria-label"?: string;
  id?: string;
}

/** Where a use stands against its limit: under, near, at or over it. */
export type UsageState = "under" | "near" | "at" | "over";

/** Where `used` stands against `limit`, near from `warnAt` of it. */
export function usageState(used: number, limit: number | null, warnAt = 0.8): UsageState {
  if (limit === null) return "under";
  if (used > limit) return "over";
  if (used >= limit) return "at";
  return used >= limit * warnAt ? "near" : "under";
}

const STATE_TONE: Record<UsageState, Tone> = {
  under: "info",
  near: "warning",
  at: "danger",
  over: "danger",
};

/**
 * What is used against what is allowed, one meter each: a plan's usage, a
 * workspace's quotas.
 *
 * ```tsx
 * <UsageList aria-label="This month" items={[
 *   { key: "minutes", label: "Browser minutes", used: 412, limit: 500 },
 *   { key: "checks", label: "Checks", used: 38, limit: null },
 * ]} />
 * ```
 *
 * An item turns to a warning from `warnAt` of its limit and to danger at
 * it, and says so in words beside the reading ("Near the limit", "Over the
 * limit") rather than by colour alone. An item with no limit says "No
 * limit" and draws no bar.
 */
export function UsageList(props: UsageListProps) {
  const messages = useArcMessages();
  function cls(): UsageListSlots {
    return parts(usageListStyles(), props.classes);
  }
  function stateWords(state: UsageState): string | undefined {
    if (state === "near") return messages().usageNear;
    if (state === "at") return messages().usageAt;
    if (state === "over") return messages().usageOver;
    return undefined;
  }
  return (
    <ul
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="usage-list"
      aria-label={props["aria-label"]}
    >
      <For each={() => props.items}>
        {(item: UsageItem) => {
          const number = chartNumbers(item.formatOptions ?? props.formatOptions);
          function state(): UsageState {
            return usageState(item.used, item.limit, props.warnAt);
          }
          return (
            <li
              class={arc(cls().item, tones[STATE_TONE[state()]])}
              data-slot="usage-item"
              data-state={state()}
            >
              <Show
                when={item.limit !== null}
                fallback={
                  <div class={cls().unlimited} data-slot="usage-unlimited">
                    <span class={cls().label} data-slot="usage-label">
                      {item.label}
                    </span>
                    <span class={cls().reading} data-slot="usage-reading">
                      {messages().amountNoLimit(number(item.used))}
                    </span>
                  </div>
                }
              >
                <Meter
                  label={item.label}
                  value={item.used}
                  maxValue={item.limit ?? 0}
                  tone={STATE_TONE[state()]}
                  valueLabel={messages().amountOf(number(item.used), number(item.limit ?? 0))}
                />
              </Show>
              <Show when={stateWords(state())}>
                <span class={cls().state} data-slot="usage-state">
                  {stateWords(state())}
                </span>
              </Show>
              <Show when={item.description !== undefined}>
                <span class={cls().description} data-slot="usage-description">
                  {item.description}
                </span>
              </Show>
            </li>
          );
        }}
      </For>
    </ul>
  );
}
