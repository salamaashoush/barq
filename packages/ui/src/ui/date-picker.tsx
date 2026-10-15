import type { DateMatcher, DateRange } from "@barqjs/aria/calendar";
import { CalendarDate, parseDate, today, type DateValue } from "@barqjs/aria/date";
import { dateFormatter } from "@barqjs/aria/i18n";
import { callback, controllable } from "@barqjs/aria/utils";
import { createSignal, Show, type Incoming } from "@barqjs/core";
import { layer } from "@barqjs/css";
import { Calendar as CalendarIcon } from "@barqjs/lucide/icons/calendar";

import "../theme/layers.ts";
import { uiProps } from "../lib/slot.ts";
import { Button } from "./button.tsx";
import { Calendar, RangeCalendar, type CalendarCaptionLayout } from "./calendar.tsx";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "./input-group.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.tsx";
import { Select, SelectItem } from "./select.tsx";

import type { UiProps } from "../lib/props.ts";

const ui = layer("barq.ui");

const trigger = ui({
  width: "240px",
  justifyContent: "flex-start",
  textAlign: "start",
  "--ui-font-weight": "var(--font-weight-normal)",
  fontWeight: "var(--font-weight-normal)",
});

const rangeTrigger = ui({
  width: "300px",
  justifyContent: "flex-start",
  textAlign: "start",
  "--ui-font-weight": "var(--font-weight-normal)",
  fontWeight: "var(--font-weight-normal)",
});

const empty = ui({ color: "var(--muted-foreground)" });

const content = ui({ width: "auto", padding: "0px" });

const presetContent = ui({
  display: "flex",
  width: "auto",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 2)",
  padding: "calc(var(--spacing) * 2)",
});

const boxed = ui({
  borderRadius: "calc(var(--radius) * 0.8)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
});

const inputContent = ui({ width: "auto", overflow: "hidden", padding: "0px" });

const rangeRoot = ui({ display: "grid", gap: "calc(var(--spacing) * 2)" });

/**
 * The date as a person reads it.
 *
 * shadcn's recipe is `date-fns`'s `format(date, "PPP")`, which is a dependency
 * for one call. `Intl.DateTimeFormat` is the same output from the platform, and
 * it is what `@barqjs/aria` already formats every date segment with — so the
 * picker and the calendar inside it agree about the locale without being told.
 */
function readable(date: DateValue, format: Intl.DateTimeFormat): string {
  return format.format(date.toDate());
}

const ONE: Intl.DateTimeFormatOptions = { dateStyle: "long" };
const BOTH: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };
const TYPED: Intl.DateTimeFormatOptions = { day: "2-digit", month: "long", year: "numeric" };

export interface DatePickerProps extends UiProps {
  value?: CalendarDate | null;
  defaultValue?: CalendarDate | null;
  minValue?: CalendarDate | null;
  maxValue?: CalendarDate | null;
  isDateUnavailable?: (date: CalendarDate) => boolean;
  isDisabled?: boolean;
  /** What the button says with no date chosen. @default "Pick a date" */
  placeholder?: string;
  /** Days that cannot be chosen, as `<Calendar disabled>` takes them. */
  disabled?: DateMatcher;
  /** `"dropdown"` puts a month and a year select over the grid. @default "label" */
  captionLayout?: CalendarCaptionLayout;
  /** The first and last month the calendar reaches. */
  startMonth?: CalendarDate;
  endMonth?: CalendarDate;
  /** Close the calendar once a day is pressed. @default false */
  closeOnSelect?: boolean;
  /** Shortcuts listed above the calendar. */
  presets?: readonly DatePreset[];
  /** What the list of presets says before one is chosen. @default "Select" */
  presetsPlaceholder?: string;
  onChange?: (value: CalendarDate | null) => void;
}

/** A named shortcut to a day: a date, or a number of days from today. */
export interface DatePreset {
  label: string;
  value: CalendarDate | number;
}

function presetDate(preset: DatePreset): CalendarDate {
  return typeof preset.value === "number" ? today().add({ days: preset.value }) : preset.value;
}

/**
 * ```tsx
 * <DatePicker value={date()} onChange={date.set} />
 * <DatePicker presets={[{ label: "Tomorrow", value: 1 }]} />
 * <DatePicker captionLayout="dropdown" closeOnSelect />
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
  // The picker owns the date when nobody passes one, or its trigger would go
  // on saying "Pick a date" over a calendar that shows a day chosen.
  const [chosen, choose] = controllable<CalendarDate | null>(
    () => props.value?.(),
    () => props.defaultValue?.() ?? null,
    (date) => props.onChange?.()?.(date),
  );
  const [isOpen, setOpen] = createSignal(false);
  // Where the calendar is turned to. A preset can name a day in another month,
  // and a calendar that stayed put would have chosen a day nobody can see.
  const [focused, setFocused] = createSignal<CalendarDate | undefined>(undefined);
  const presets = (): readonly DatePreset[] => props.presets?.() ?? [];

  const format = dateFormatter(ONE);

  const pick = (date: CalendarDate | null): void => {
    choose(date);
    if (date !== null && props.closeOnSelect?.() === true) setOpen(false);
  };

  // ONE call, not a read per branch. The compiler proves reactivity rather
  // than guessing it, and a value assembled piecewise at a prop is bound once.
  const label = (): string => {
    const date = chosen();
    return date === null || date === undefined
      ? (props.placeholder?.() ?? "Pick a date")
      : readable(date, format());
  };

  return (
    <Popover isOpen={isOpen()} onOpenChange={setOpen}>
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
      <PopoverContent
        class={presets().length > 0 ? presetContent : content}
        placement="bottom start"
        data-slot="date-picker-content"
      >
        <Show when={presets().length > 0}>
          <Select
            items={presets()}
            aria-label="Presets"
            placeholder={props.presetsPlaceholder?.() ?? "Select"}
            data-slot="date-picker-presets"
            getKey={(preset: DatePreset) => preset.label}
            getTextValue={(preset: DatePreset) => preset.label}
            onSelectionChange={(key) => {
              const preset = presets().find((one) => one.label === key);
              if (preset === undefined) return;
              const date = presetDate(preset);
              setFocused(date);
              pick(date);
            }}
          >
            {(preset: DatePreset) => <SelectItem>{preset.label}</SelectItem>}
          </Select>
        </Show>
        <div data-slot="date-picker-calendar" class={presets().length > 0 ? boxed : ""}>
          <Calendar
            aria-label={props["aria-label"]?.() ?? "Choose a date"}
            value={chosen()}
            focusedValue={focused()}
            minValue={props.minValue?.()}
            maxValue={props.maxValue?.()}
            isDateUnavailable={callback<[CalendarDate], boolean>(props.isDateUnavailable)}
            disabled={props.disabled?.()}
            captionLayout={props.captionLayout?.()}
            startMonth={props.startMonth?.()}
            endMonth={props.endMonth?.()}
            isDisabled={props.isDisabled?.()}
            autoFocus
            onFocusChange={setFocused}
            onChange={pick}
          />
        </div>
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
  /** Days that cannot be chosen, as `<Calendar disabled>` takes them. */
  disabled?: DateMatcher;
  /** How many months are drawn side by side. @default 2 */
  numberOfMonths?: number;
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
  const [chosen, choose] = controllable<DateRange | null>(
    () => props.value?.(),
    () => props.defaultValue?.() ?? null,
    (range) => props.onChange?.()?.(range),
  );
  const format = dateFormatter(BOTH);

  const label = (): string => {
    const range = chosen();
    if (range === null || range === undefined) return props.placeholder?.() ?? "Pick a date";
    const from = readable(range.start, format());
    return range.end === range.start ? from : `${from} - ${readable(range.end, format())}`;
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
            value={chosen()}
            minValue={props.minValue?.()}
            maxValue={props.maxValue?.()}
            isDateUnavailable={callback<[CalendarDate], boolean>(props.isDateUnavailable)}
            disabled={props.disabled?.()}
            numberOfMonths={props.numberOfMonths?.() ?? 2}
            isDisabled={props.isDisabled?.()}
            autoFocus
            onChange={choose}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Typed text as a day, or nothing.
 *
 * An ISO date is read as the day it names. `new Date("2024-03-07")` is midnight
 * UTC, which is the 6th anywhere west of Greenwich, so that form never reaches
 * `Date`. Anything else is whatever the platform makes of it, read in the local
 * zone the person typing is in.
 */
function readDate(text: string): CalendarDate | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return parseDate(trimmed);
  const at = new Date(trimmed);
  if (Number.isNaN(at.getTime())) return null;
  return new CalendarDate(at.getFullYear(), at.getMonth() + 1, at.getDate());
}

export interface DatePickerInputProps extends UiProps {
  value?: CalendarDate | null;
  defaultValue?: CalendarDate | null;
  minValue?: CalendarDate | null;
  maxValue?: CalendarDate | null;
  isDateUnavailable?: (date: CalendarDate) => boolean;
  /** Days that cannot be chosen, as `<Calendar disabled>` takes them. */
  disabled?: DateMatcher;
  isDisabled?: boolean;
  placeholder?: string;
  /** Submitted with the form, as the text in the field. */
  name?: string;
  /** @default "label" */
  captionLayout?: CalendarCaptionLayout;
  startMonth?: CalendarDate;
  endMonth?: CalendarDate;
  /** How a day is written into the field. Defaults to the locale's long form. */
  format?: (date: CalendarDate) => string;
  /** How typed text is read. Return null for text that is not a date. */
  parse?: (text: string) => CalendarDate | null;
  /** The calendar button's accessible name. @default "Select date" */
  buttonLabel?: string;
  onChange?: (value: CalendarDate | null) => void;
}

/**
 * ```tsx
 * <FieldLabel for="start">Subscription date</FieldLabel>
 * <DatePickerInput id="start" value={date()} onChange={date.set} />
 * ```
 *
 * A text field that takes a typed date, with the calendar behind a button at
 * its end. Either one sets the other: typing a date the platform can read turns
 * the calendar to it, and pressing a day writes it into the field and closes.
 * The down arrow in the field opens the calendar.
 *
 * `id` and the ARIA labelling props go on the field, which is the control a
 * label names; `class` goes on the group around it.
 */
export function DatePickerInput(props: Incoming<DatePickerInputProps>) {
  const [chosen, choose] = controllable<CalendarDate | null>(
    () => props.value?.(),
    () => props.defaultValue?.() ?? null,
    (date) => props.onChange?.()?.(date),
  );
  const [isOpen, setOpen] = createSignal(false);
  const [focused, setFocused] = createSignal<CalendarDate | undefined>(undefined);
  // What the person typed, while it differs from the date written out. Null
  // means the field shows the date itself.
  const [typed, setTyped] = createSignal<string | null>(null);

  const long = dateFormatter(TYPED);
  const write = callback<[CalendarDate], string>(props.format);
  const read = callback<[string], CalendarDate | null>(props.parse) ?? readDate;

  const text = (): string => {
    const own = typed();
    if (own !== null) return own;
    const date = chosen();
    if (date === null) return "";
    return write?.(date) ?? readable(date, long());
  };

  return (
    <InputGroup
      class={ui(props.class?.(), props.className?.())}
      style={props.style?.()}
      isDisabled={props.isDisabled?.()}
      data-slot={props["data-slot"]?.() ?? "input-group"}
      data-testid={props["data-testid"]?.()}
    >
      <InputGroupInput
        id={props.id?.()}
        name={props.name?.()}
        value={text()}
        placeholder={props.placeholder?.()}
        disabled={props.isDisabled?.()}
        aria-label={props["aria-label"]?.()}
        aria-labelledby={props["aria-labelledby"]?.()}
        aria-describedby={props["aria-describedby"]?.()}
        onInput={(event: Event) => {
          const value = (event.currentTarget as HTMLInputElement).value;
          setTyped(value);
          const date = read(value);
          if (date === null) return;
          setFocused(date);
          choose(date);
        }}
        onBlur={() => {
          // Typed text that named the chosen day gives way to the day written
          // out; text that named nothing stays, so it can be corrected.
          const own = typed();
          if (own !== null && read(own) !== null) setTyped(null);
        }}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          setOpen(true);
        }}
      />
      <InputGroupAddon align="inline-end">
        <Popover isOpen={isOpen()} onOpenChange={setOpen}>
          <PopoverTrigger>
            <InputGroupButton
              data-slot="date-picker-input-trigger"
              variant="ghost"
              size="icon-xs"
              aria-label={props.buttonLabel?.() ?? "Select date"}
              isDisabled={props.isDisabled?.()}
            >
              <CalendarIcon />
            </InputGroupButton>
          </PopoverTrigger>
          <PopoverContent
            class={inputContent}
            placement="bottom end"
            offset={10}
            crossOffset={8}
            data-slot="date-picker-content"
          >
            <Calendar
              aria-label={props.buttonLabel?.() ?? "Select date"}
              value={chosen()}
              focusedValue={focused()}
              minValue={props.minValue?.()}
              maxValue={props.maxValue?.()}
              isDateUnavailable={callback<[CalendarDate], boolean>(props.isDateUnavailable)}
              disabled={props.disabled?.()}
              captionLayout={props.captionLayout?.()}
              startMonth={props.startMonth?.()}
              endMonth={props.endMonth?.()}
              isDisabled={props.isDisabled?.()}
              autoFocus
              onFocusChange={setFocused}
              onChange={(date) => {
                choose(date);
                setTyped(null);
                if (date !== null) setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </InputGroupAddon>
    </InputGroup>
  );
}
