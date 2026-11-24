import { Show } from "@barqjs/core";
import type { DateRange } from "@barqjs/aria/calendar";
import type { CalendarDate } from "@barqjs/aria/date";
import { DateRangePicker, type DateRangePreset } from "@barqjs/ui/date-picker";

import { arcLayer as arc } from "../layer.ts";
import { type ArcFieldProps, type FieldValueProps, Frame, bindField } from "../lib/field.tsx";
import { layout } from "../style/index.ts";
import { type ArcMessages, useArcMessages } from "./messages.ts";

export type { DateRange, DateRangePreset };

export interface DateRangeFieldProps extends ArcFieldProps, FieldValueProps<DateRange | null> {
  /**
   * Shortcuts above the calendar. `"common"` is today and the last 7, 30
   * and 90 days, in arc's words.
   */
  presets?: readonly DateRangePreset[] | "common";
  minValue?: CalendarDate | null;
  maxValue?: CalendarDate | null;
  isDateUnavailable?: (date: CalendarDate) => boolean;
  /** Months side by side. @default 2 */
  numberOfMonths?: number;
  /** @default the provider's `pickDates`, "Pick dates" */
  placeholder?: string;
}

/** Today and the last 7, 30 and 90 days. */
export function commonRangePresets(messages: ArcMessages): DateRangePreset[] {
  return [
    { label: messages.today, value: 1 },
    { label: messages.lastDays(7), value: 7 },
    { label: messages.lastDays(30), value: 30 },
    { label: messages.lastDays(90), value: 90 },
  ];
}

/**
 * A start and an end day, from a calendar of two months and the shortcuts a
 * report is usually filtered by.
 *
 * ```tsx
 * <DateRangeField label="Period" presets="common" value={period()} onChange={setPeriod} />
 * <form.AppField name="period">{(field) => <field.DateRangeField label="Period" />}</form.AppField>
 * ```
 *
 * The trigger is named by the label and then the range it shows, so a
 * screen reader hears "Period, Mar 01 - Mar 07". With `name` a plain form
 * posts the range as an ISO interval, `2026-03-01/2026-03-07`.
 */
export function DateRangeField(props: DateRangeFieldProps) {
  const messages = useArcMessages();
  const of = bindField<DateRange | null>(props, null);
  function presets(): readonly DateRangePreset[] | undefined {
    return props.presets === "common" ? commonRangePresets(messages()) : props.presets;
  }
  function interval(): string {
    const range = of.value();
    return range === null || range === undefined
      ? ""
      : `${range.start.toString()}/${range.end.toString()}`;
  }
  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="date-range-field"
    >
      <DateRangePicker
        class={arc(layout.fill, props.classes?.control)}
        data-slot="date-range-field-control"
        value={of.value()}
        presets={presets()}
        presetsLabel={messages().presets}
        presetsPlaceholder={messages().selectPlaceholder}
        placeholder={props.placeholder ?? messages().pickDates}
        aria-label={messages().chooseDates}
        aria-labelledby={of.ids.label}
        aria-describedby={of.describedBy(props.description !== undefined)}
        isInvalid={of.isInvalid()}
        isDisabled={props.isDisabled}
        minValue={props.minValue}
        maxValue={props.maxValue}
        isDateUnavailable={props.isDateUnavailable}
        numberOfMonths={props.numberOfMonths}
        onChange={(range: DateRange | null) => {
          of.change(range);
          of.blur();
        }}
      />
      <Show when={of.name() !== undefined}>
        <input type="hidden" name={of.name()} value={interval()} />
      </Show>
    </Frame>
  );
}
