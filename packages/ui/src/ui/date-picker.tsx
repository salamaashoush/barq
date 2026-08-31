import type { DateRange } from "@barqjs/aria/calendar";
import type { CalendarDate, DateValue } from "@barqjs/aria/date";
import type { Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";
import { Calendar as CalendarIcon } from "@barqjs/lucide/icons/calendar";

import "../theme/layers.ts";
import { uiProps } from "../lib/slot.ts";
import { Button } from "./button.tsx";
import { Calendar, RangeCalendar } from "./calendar.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.tsx";

import type { UiProps } from "../lib/props.ts";

const ui = layer("barq.ui");

const trigger = ui({
  width: "240px",
  justifyContent: "flex-start",
  textAlign: "left",
  "--ui-font-weight": "var(--font-weight-normal)",
  fontWeight: "var(--font-weight-normal)",
});

const rangeTrigger = ui({
  width: "300px",
  justifyContent: "flex-start",
  textAlign: "left",
  "--ui-font-weight": "var(--font-weight-normal)",
  fontWeight: "var(--font-weight-normal)",
});

const empty = ui({ color: "var(--muted-foreground)" });

const content = ui({ width: "auto", padding: "0px" });

const rangeRoot = ui({ display: "grid", gap: "calc(var(--spacing) * 2)" });

/**
 * The date as a person reads it.
 *
 * shadcn's recipe is `date-fns`'s `format(date, "PPP")`, which is a dependency
 * for one call. `Intl.DateTimeFormat` is the same output from the platform, and
 * it is what `@barqjs/aria` already formats every date segment with — so the
 * picker and the calendar inside it agree about the locale without being told.
 */
function readable(date: DateValue, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, options).format(date.toDate());
}

const ONE: Intl.DateTimeFormatOptions = { dateStyle: "long" };
const BOTH: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };

export interface DatePickerProps extends UiProps {
  value?: CalendarDate | null;
  defaultValue?: CalendarDate | null;
  minValue?: CalendarDate | null;
  maxValue?: CalendarDate | null;
  isDateUnavailable?: (date: CalendarDate) => boolean;
  isDisabled?: boolean;
  /** What the button says with no date chosen. @default "Pick a date" */
  placeholder?: string;
  onChange?: (value: CalendarDate | null) => void;
}

/**
 * ```tsx
 * <DatePicker value={date()} onChange={date.set} />
 * ```
 *
 * A `<Popover>` around a `<Calendar>`, which is what shadcn's date picker is:
 * upstream ships no `date-picker.tsx` at all, only a documented composition of
 * three components it does ship. This is that composition, so the same three
 * are what an application overrides.
 *
 * `@barqjs/aria` has a `<DatePicker>` of its own with a `<DateField>` and typed
 * segments in the trigger. That is a different component and a better one for a
 * form; this one is shadcn's look, and shadcn's look is a button.
 */
export function DatePicker(props: Incoming<DatePickerProps>) {
  const chosen = (): CalendarDate | null | undefined => props.value?.() ?? props.defaultValue?.();

  // ONE call, not a read per branch. The compiler proves reactivity rather
  // than guessing it, and a value assembled piecewise at a prop is bound once.
  const label = (): string => {
    const date = chosen();
    return date === null || date === undefined
      ? (props.placeholder?.() ?? "Pick a date")
      : readable(date, ONE);
  };

  return (
    <Popover>
      <PopoverTrigger>
        {/* `uiProps` is for an ELEMENT: it resolves every Cell, and a
            component here would then read `props["data-slot"]?.()` off a plain
            string. A component takes its props as props. */}
        <Button
          data-slot="date-picker-trigger"
          class={ui(trigger, chosen() ? "" : empty, props.class?.(), props.className?.())}
          variant="outline"
          isDisabled={props.isDisabled?.()}
        >
          <CalendarIcon />
          {label()}
        </Button>
      </PopoverTrigger>
      <PopoverContent class={content} placement="bottom start" data-slot="date-picker-content">
        <Calendar
          aria-label={props["aria-label"]?.() ?? "Choose a date"}
          value={props.value?.()}
          defaultValue={props.defaultValue?.()}
          minValue={props.minValue?.()}
          maxValue={props.maxValue?.()}
          isDateUnavailable={props.isDateUnavailable?.()}
          isDisabled={props.isDisabled?.()}
          autoFocus
          onChange={(date) => props.onChange?.()?.(date)}
        />
      </PopoverContent>
    </Popover>
  );
}

export interface DateRangePickerProps extends UiProps {
  value?: DateRange | null;
  defaultValue?: DateRange | null;
  minValue?: CalendarDate | null;
  maxValue?: CalendarDate | null;
  isDateUnavailable?: (date: CalendarDate) => boolean;
  isDisabled?: boolean;
  /** @default "Pick a date" */
  placeholder?: string;
  onChange?: (value: DateRange | null) => void;
}

/**
 * ```tsx
 * <DateRangePicker value={range()} onChange={range.set} />
 * ```
 *
 * The same composition over `<RangeCalendar>`. The trigger reads
 * `Jan 20, 2022 - Feb 09, 2022`, and one end alone reads as that end.
 */
export function DateRangePicker(props: Incoming<DateRangePickerProps>) {
  const chosen = (): DateRange | null | undefined => props.value?.() ?? props.defaultValue?.();

  const label = (): string => {
    const range = chosen();
    if (range === null || range === undefined) return props.placeholder?.() ?? "Pick a date";
    const from = readable(range.start, BOTH);
    return range.end === range.start ? from : `${from} - ${readable(range.end, BOTH)}`;
  };

  return (
    <div {...uiProps("date-range-picker", rangeRoot, props)}>
      <Popover>
        <PopoverTrigger>
          <Button
            data-slot="date-range-picker-trigger"
            class={ui(rangeTrigger, chosen() ? "" : empty)}
            variant="outline"
            isDisabled={props.isDisabled?.()}
          >
            <CalendarIcon />
            {label()}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          class={content}
          placement="bottom start"
          data-slot="date-range-picker-content"
        >
          <RangeCalendar
            aria-label={props["aria-label"]?.() ?? "Choose a range of dates"}
            value={props.value?.()}
            defaultValue={props.defaultValue?.()}
            minValue={props.minValue?.()}
            maxValue={props.maxValue?.()}
            isDateUnavailable={props.isDateUnavailable?.()}
            isDisabled={props.isDisabled?.()}
            autoFocus
            onChange={(range) => props.onChange?.()?.(range)}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
