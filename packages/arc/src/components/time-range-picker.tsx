import { Show, createSignal, createUniqueId, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { type ZonedDateTime, fromDate, getLocalTimeZone, now } from "@barqjs/aria/date";
import { DateField as AriaDateField } from "@barqjs/aria/datefield";
import { dateFormatter } from "@barqjs/aria/i18n";
import { controllable } from "@barqjs/aria/utils";
import { CalendarClock } from "@barqjs/lucide/icons/calendar-clock";
import { Button } from "@barqjs/ui/button";
import { Toggle } from "@barqjs/ui/toggle";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { type SearchParamState, useSearchParam } from "../lib/search-state.ts";
import { control, fg, gap, layout, tone, type } from "../style/index.ts";
import { type ArcMessages, useArcMessages } from "./messages.ts";
import { ResponsiveOverlay } from "./responsive-overlay.tsx";
import { type Segment, SegmentedControl } from "./segmented-control.tsx";
import { statusVariants } from "./status.tsx";

/** A window that ends now: the last hour, the last 24 hours. */
export interface TimeRangePreset {
  /** Its key, in the value and the address: `"24h"`. */
  value: string;
  label: string;
  /** How far back it reaches, in milliseconds. */
  duration: number;
}

/** A preset window that moves with the clock, or two fixed instants. */
export type TimeRange = PresetRange | CustomRange;

export interface PresetRange {
  preset: string;
}

export interface CustomRange {
  /** ISO instants. */
  start: string;
  end: string;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The last hour, 24 hours, 7 days and 30 days. */
export function commonTimeRangePresets(messages: ArcMessages): TimeRangePreset[] {
  return [
    { value: "1h", label: messages.lastHours(1), duration: HOUR },
    { value: "24h", label: messages.lastHours(24), duration: DAY },
    { value: "7d", label: messages.lastDays(7), duration: 7 * DAY },
    { value: "30d", label: messages.lastDays(30), duration: 30 * DAY },
  ];
}

export interface ResolvedTimeRange {
  start: Date;
  end: Date;
}

/** The two instants a range covers, a preset's measured back from `at`. */
export function resolveTimeRange(
  range: TimeRange,
  presets: readonly TimeRangePreset[],
  at: Date | number = Date.now(),
): ResolvedTimeRange | undefined {
  if ("preset" in range) {
    const preset = presets.find((one) => one.value === range.preset);
    if (preset === undefined) return undefined;
    const end = new Date(at);
    return { start: new Date(end.getTime() - preset.duration), end };
  }
  const start = new Date(range.start);
  const end = new Date(range.end);
  return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ? undefined : { start, end };
}

/** A range as the address keeps it: `24h`, or `2026-03-01T10:00:00.000Z/2026-03-02T10:00:00.000Z`. */
export function formatTimeRange(range: TimeRange): string {
  return "preset" in range ? range.preset : `${range.start}/${range.end}`;
}

export function parseTimeRange(
  raw: string,
  presets: readonly TimeRangePreset[],
): TimeRange | undefined {
  if (presets.some((preset) => preset.value === raw)) return { preset: raw };
  const [start, end] = raw.split("/");
  if (start === undefined || end === undefined) return undefined;
  const from = new Date(start);
  const to = new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return undefined;
  return { start: from.toISOString(), end: to.toISOString() };
}

export const timeRangePickerStyles = variants({
  slots: {
    root: arc(layout.row, layout.wrap, gap[2], layout.minZero),
    presets: arc({}),
    customButton: arc({}),
    live: arc(gap[1.5]),
    liveDot: arc(tone.success),
    custom: arc(layout.column, gap[3]),
    field: arc(layout.column, gap[1.5]),
    label: arc(type.label),
    control: arc(control.segmented),
    error: arc(type.meta, fg.danger),
    actions: arc(layout.row, layout.end, gap[2]),
  },
});

type Slots = ReturnType<typeof timeRangePickerStyles>;

export interface TimeRangePickerProps extends Customisable<Slots> {
  /** @default arc's "Time range" */
  "aria-label"?: string;
  /** @default the last hour, 24 hours, 7 days and 30 days */
  presets?: readonly TimeRangePreset[];
  value?: TimeRange;
  /** @default the first preset */
  defaultValue?: TimeRange;
  onChange?: (range: TimeRange) => void;
  /** Kept in this search parameter; the default range leaves it out. */
  param?: string;
  /** Offer two fixed instants of the reader's choosing. @default true */
  allowCustom?: boolean;
  /**
   * A Live toggle, offered while a preset is chosen: the window follows the
   * clock and the page refreshes as it does.
   */
  live?: boolean;
  defaultLive?: boolean;
  onLiveChange?: (live: boolean) => void;
  /** Offer the Live toggle. @default `live` or `onLiveChange` given */
  showLive?: boolean;
  /** The zone the custom instants are read and written in. @default the reader's */
  timeZone?: string;
  /** @default "sm" */
  size?: "sm" | "default";
}

/**
 * A window of time for a chart or a log: the last hour, day, week or month,
 * two instants of the reader's own, and whether it follows the clock live.
 *
 * ```tsx
 * <TimeRangePicker param="window" live={live()} onLiveChange={setLive} onChange={setRange} />
 * const { start, end } = resolveTimeRange(range(), commonTimeRangePresets(messages)) ?? …;
 * ```
 *
 * The presets are a `SegmentedControl`; Custom opens a dialog, a sheet on a
 * phone, of two date and time fields that refuse an end before the start.
 */
export function TimeRangePicker(props: TimeRangePickerProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(timeRangePickerStyles(), props.classes);
  }
  function presets(): readonly TimeRangePreset[] {
    return props.presets ?? commonTimeRangePresets(messages());
  }
  const fallback: TimeRange = untrack(
    () => props.defaultValue ?? { preset: presets()[0]?.value ?? "" },
  );
  const param = untrack(() => props.param);
  const url: SearchParamState<TimeRange> | undefined =
    param === undefined
      ? undefined
      : useSearchParam<TimeRange>(param, {
          defaultValue: fallback,
          parse: (raw) => parseTimeRange(raw, untrack(presets)),
          format: formatTimeRange,
        });
  const [own, setOwn] = controllable<TimeRange>(
    () => props.value,
    () => fallback,
    (next) => props.onChange?.(next),
  );
  function current(): TimeRange {
    return url === undefined ? own() : url.value();
  }
  function choose(next: TimeRange): void {
    if (url === undefined) setOwn(next);
    else {
      url.setValue(next);
      props.onChange?.(next);
    }
  }
  const [live, setLive] = controllable<boolean>(
    () => props.live,
    () => untrack(() => props.defaultLive) ?? false,
    (next) => props.onLiveChange?.(next),
  );
  function showsLive(): boolean {
    return props.showLive ?? (props.live !== undefined || props.onLiveChange !== undefined);
  }
  const [editing, setEditing] = createSignal(false);

  const format = dateFormatter({
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: props.timeZone,
  });
  function items(): Segment[] {
    return presets().map((preset) => ({ value: preset.value, label: preset.label }));
  }
  function held(): string | null {
    const range = current();
    return "preset" in range ? range.preset : null;
  }
  function customLabel(): string {
    const range = current();
    return "preset" in range
      ? messages().customRange
      : `${format().format(new Date(range.start))} – ${format().format(new Date(range.end))}`;
  }

  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="time-range-picker">
      <SegmentedControl
        class={cls().presets}
        aria-label={props["aria-label"] ?? messages().timeRange}
        size={props.size ?? "sm"}
        items={items()}
        value={held()}
        onChange={(next) => choose({ preset: next })}
      />
      <Show when={props.allowCustom !== false}>
        <Button
          variant={held() === null ? "secondary" : "outline"}
          size={props.size ?? "sm"}
          class={cls().customButton}
          data-slot="time-range-picker-custom-button"
          data-active={held() === null ? "true" : "false"}
          aria-pressed={held() === null ? "true" : "false"}
          onPress={() => setEditing(true)}
        >
          <CalendarClock aria-hidden="true" />
          {customLabel()}
        </Button>
      </Show>
      <Show when={showsLive() && "preset" in current()}>
        <Toggle
          variant="outline"
          size={props.size ?? "sm"}
          class={cls().live}
          data-slot="time-range-picker-live"
          isSelected={live()}
          onChange={(on: boolean) => setLive(on)}
        >
          <span
            class={arc(statusVariants().dot, cls().liveDot)}
            data-pulse={live() ? "" : undefined}
            aria-hidden="true"
          />
          {messages().live}
        </Toggle>
      </Show>
      <Show when={editing()}>
        <CustomRangeDialog
          range={current()}
          timeZone={props.timeZone}
          classes={cls()}
          onCancel={() => setEditing(false)}
          onApply={(range) => {
            setEditing(false);
            setLive(false);
            choose(range);
          }}
        />
      </Show>
    </div>
  );
}

interface CustomRangeDialogProps {
  range: TimeRange;
  timeZone: string | undefined;
  classes: Slots;
  onCancel: () => void;
  onApply: (range: CustomRange) => void;
}

function CustomRangeDialog(props: CustomRangeDialogProps) {
  const messages = useArcMessages();
  const zone = untrack(() => props.timeZone) ?? getLocalTimeZone();
  const initial = untrack(() =>
    "preset" in props.range
      ? { start: now(zone).subtract({ days: 1 }), end: now(zone) }
      : {
          start: fromDate(new Date(props.range.start), zone),
          end: fromDate(new Date(props.range.end), zone),
        },
  );
  const [start, setStart] = createSignal<ZonedDateTime | null>(initial.start);
  const [end, setEnd] = createSignal<ZonedDateTime | null>(initial.end);
  const fromId = createUniqueId();
  const toId = createUniqueId();
  const errorId = createUniqueId();
  function invalid(): boolean {
    const from = start();
    const to = end();
    return from !== null && to !== null && to.compare(from) <= 0;
  }
  function apply(): void {
    const from = start();
    const to = end();
    if (from === null || to === null || invalid()) return;
    props.onApply({
      start: from.toDate().toISOString(),
      end: to.toDate().toISOString(),
    });
  }
  return (
    <ResponsiveOverlay
      heading={messages().customRange}
      open
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
      footer={
        <div class={props.classes.actions}>
          <Button variant="outline" onPress={() => props.onCancel()}>
            {messages().cancel}
          </Button>
          <Button
            data-slot="time-range-picker-apply"
            isDisabled={invalid() || start() === null || end() === null}
            onPress={apply}
          >
            {messages().apply}
          </Button>
        </div>
      }
    >
      <div class={props.classes.custom} data-slot="time-range-picker-custom">
        <div class={props.classes.field}>
          <span class={props.classes.label} id={fromId}>
            {messages().rangeFrom}
          </span>
          <AriaDateField<ZonedDateTime>
            class={props.classes.control}
            aria-labelledby={fromId}
            granularity="minute"
            value={start()}
            onChange={(value: ZonedDateTime | null) => setStart(value)}
          />
        </div>
        <div class={props.classes.field}>
          <span class={props.classes.label} id={toId}>
            {messages().rangeTo}
          </span>
          <AriaDateField<ZonedDateTime>
            class={props.classes.control}
            aria-labelledby={toId}
            aria-describedby={invalid() ? errorId : undefined}
            granularity="minute"
            isInvalid={invalid()}
            value={end()}
            onChange={(value: ZonedDateTime | null) => setEnd(value)}
          />
        </div>
        <Show when={invalid()}>
          <span class={props.classes.error} id={errorId} role="alert">
            {messages().rangeOrder}
          </span>
        </Show>
      </div>
    </ResponsiveOverlay>
  );
}
