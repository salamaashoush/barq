/**
 * A date field: one segment per part, in the locale's own order.
 *
 * Not `<input type="date">`, which cannot be styled, cannot be given a range
 * the browser will respect consistently, and shows the format the OS chose
 * rather than the one the page is in. And not a text box either: "03/04/2024"
 * is the 3rd of April in London and the 4th of March in New York, and a field
 * that asks the user to guess which will get both.
 *
 * So each part is its own segment, ordered and separated by
 * `Intl.DateTimeFormat.formatToParts`, and each is a spin button:
 *
 * - **Typing fills the segment and moves on.** Typing 4 in a month segment
 *   means April and jumps to the day, because no month starts with 4 that
 *   isn't 4. Typing 1 waits, because 1, 10, 11 and 12 all begin with it.
 * - **The arrows cycle within the segment.** December plus one is January of
 *   the SAME year: the user is editing the month, not the date.
 * - **An empty field is a PLACEHOLDER, not a value.** It shows a shape to fill
 *   in, and the field has no value at all until every segment is filled — a
 *   half-typed date is not a date, and reporting one would submit it.
 * - **What is typed is kept as typed.** A day segment takes 31 whatever month
 *   is showing, because in a day-first locale the day is typed before the
 *   month that decides how long it is. A date that does not exist, the 31st
 *   of February, is held until the field is left and only then made into one
 *   that does.
 */

import {
  cells,
  type Accessor,
  type CallSite,
  type Child,
  For,
  createMemo,
  createContext,
  createEffect,
  getContext,
  type Incoming,
  provide,
  createSignal,
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import {
  type Calendar as CalendarSystem,
  CalendarDate,
  type CalendarIdentifier,
  createCalendar,
  type DateValue,
  getLocalTimeZone,
  GregorianCalendar,
  isEqualCalendar,
  type MappedDateValue,
  type MappedTimeValue,
  now,
  Time,
  toCalendar,
  toCalendarDate,
  toCalendarDateTime,
  today,
  toTime,
  toZoned,
  type TimeValue,
  type ZonedDateTime,
} from "./date.ts";
import { activeElement, contains, ownerDocument } from "./dom.ts";
import { focusRing } from "./focus.ts";
import {
  dateFormatter,
  filter,
  numberFormatter,
  numberParser,
  type LocalizedString,
  StringDictionary,
  stringFormatter,
  useLocale,
} from "./i18n.ts";
import { hover } from "./interactions/hover.ts";
import type { ElementRef } from "./interactions/press.ts";
import { field, type FieldOptions } from "./label.ts";
import { isIOS } from "./platform.ts";
import { formReset } from "./toggle.ts";
import {
  fieldValidation,
  formValidation,
  type ValidationResult,
  type FormValidationState,
  type ValidateFunction,
  type ValidationBehavior,
} from "./validation.ts";
import {
  access,
  callback,
  controllable,
  type DOMProps,
  filterDOMProps,
  fromProps,
  id,
  type MaybeAccessor,
  mergeProps,
  type StyleProps,
  styleProps,
} from "./utils.ts";

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

export type SegmentType =
  | "era"
  | "year"
  | "month"
  | "day"
  | "hour"
  | "minute"
  | "second"
  | "dayPeriod"
  | "timeZoneName"
  | "literal";

export interface DateSegment {
  type: SegmentType;
  /** What it shows: the value, or the placeholder standing in for it. */
  text: string;
  /** The number it holds; for an era, the era's place in its calendar's list. */
  value?: number;
  minValue?: number;
  maxValue?: number;
  /** Nothing has been typed here yet. */
  isPlaceholder: boolean;
  /** What it shows while it is empty. */
  placeholder?: string;
  /**
   * The user can change it. A separator cannot, and neither can the zone of a
   * zoned value, which is read out and focusable but belongs to the value.
   */
  isEditable: boolean;
}

/** How much of a date the field asks for. */
export type Granularity = "day" | "hour" | "minute" | "second";

type HourCycle = "h11" | "h12" | "h23" | "h24";
type EditableType = "era" | "year" | "month" | "day" | "hour" | "dayPeriod" | "minute" | "second";

const EDITABLE: readonly EditableType[] = [
  "era",
  "year",
  "month",
  "day",
  "hour",
  "dayPeriod",
  "minute",
  "second",
];

/** What `formatToParts` calls a part, as the segment it becomes. */
const PART_TYPES: Record<string, SegmentType> = {
  // A cyclic year's number, in the Chinese and Dangi calendars.
  relatedYear: "year",
  // Its name, which the number already says and nobody types.
  yearName: "literal",
  timeZoneName: "timeZoneName",
};

/**
 * Puts `text` back into a segment a composition wrote into.
 *
 * Into the text node that is already there rather than through
 * `textContent`, which would replace the node the segment's text is rendered
 * into and leave every later value written to a node no longer on the page.
 */
function writeText(element: HTMLElement, text: string): void {
  let kept: Text | null = null;
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.COMMENT_NODE) continue;
    if (kept === null && node instanceof Text) kept = node;
    else node.remove();
  }
  if (kept === null) element.append(text);
  else kept.data = text;
}

/** A 24-hour hour as the hour cycle writes it, and which half of the day it is in. */
function toHourCycle(hour: number, cycle: HourCycle): [number | null, number] {
  const period = hour >= 12 ? 1 : 0;
  switch (cycle) {
    case "h11":
      return [period, hour >= 12 ? hour - 12 : hour];
    case "h12":
      return [period, hour === 0 ? 12 : hour > 12 ? hour - 12 : hour];
    case "h24":
      return [null, hour + 1];
    default:
      return [null, hour];
  }
}

function fromHourCycle(hour: number, period: number, cycle: HourCycle): number {
  switch (cycle) {
    case "h11":
      return period === 1 ? hour + 12 : hour;
    case "h12":
      return (hour === 12 ? 0 : hour) + (period === 1 ? 12 : 0);
    case "h24":
      return hour - 1;
    default:
      return hour;
  }
}

/** Steps a number within its limits, wrapping at either end. */
function cycleValue(
  value: number,
  amount: number,
  min: number,
  max: number,
  round = false,
): number {
  let next = value;
  if (round) {
    next += Math.sign(amount);
    if (next < min) next = max;
    const step = Math.abs(amount);
    next = amount > 0 ? Math.ceil(next / step) * step : Math.floor(next / step) * step;
    if (next > max) next = min;
    return next;
  }
  next += amount;
  if (next < min) return max - (min - next - 1);
  if (next > max) return min + (next - max - 1);
  return next;
}

/** One date field of a value, the hour as the clock says it. */
function fieldOf(value: DateValue, type: Exclude<EditableType, "hour" | "dayPeriod">) {
  switch (type) {
    case "era":
      return value.era;
    case "year":
      return value.year;
    case "month":
      return value.month;
    case "day":
      return value.day;
    default:
      return "hour" in value ? value[type] : null;
  }
}

/**
 * A date as the user has typed it so far: any field may be missing, and the
 * fields present need not make a date that exists.
 *
 * The fields are the calendar's: a Japanese year is a year of its era, and a
 * Hebrew month can be the thirteenth. The hour is kept in the hour cycle with
 * the half of the day beside it, so the user can change AM to PM without the
 * hour moving. A zoned value's offset is kept too, because in the hour a
 * clock goes back the same wall time happens twice and only the offset says
 * which of the two was meant.
 */
class Fields {
  readonly calendar: CalendarSystem;
  readonly hourCycle: HourCycle;
  era: string | null = null;
  year: number | null = null;
  month: number | null = null;
  day: number | null = null;
  hour: number | null = null;
  dayPeriod: number | null = null;
  minute: number | null = null;
  second: number | null = null;
  millisecond: number | null = null;
  offset: number | null = null;

  constructor(calendar: CalendarSystem, hourCycle: HourCycle, value?: DateValue | null) {
    this.calendar = calendar;
    this.hourCycle = hourCycle;
    if (value === null || value === undefined) return;
    this.era = value.era;
    this.year = value.year;
    this.month = value.month;
    this.day = value.day;
    if ("hour" in value) {
      [this.dayPeriod, this.hour] = toHourCycle(value.hour, hourCycle);
      this.minute = value.minute;
      this.second = value.second;
      this.millisecond = value.millisecond;
    }
    if ("offset" in value) this.offset = value.offset;
  }

  copy(): Fields {
    const next = new Fields(this.calendar, this.hourCycle);
    next.era = this.era;
    next.year = this.year;
    next.month = this.month;
    next.day = this.day;
    next.hour = this.hour;
    next.dayPeriod = this.dayPeriod;
    next.minute = this.minute;
    next.second = this.second;
    next.millisecond = this.millisecond;
    next.offset = this.offset;
    return next;
  }

  isComplete(types: readonly EditableType[]): boolean {
    return types.every((type) => this[type] !== null);
  }

  isCleared(types: readonly EditableType[]): boolean {
    return types.every((type) => this[type] === null);
  }

  /** Whether `value` says what these fields say, which it does not if it was constrained. */
  matches(value: DateValue, types: readonly EditableType[]): boolean {
    return types.every((type) => {
      if (type === "hour" || type === "dayPeriod") {
        if (!("hour" in value)) return true;
        const [period, hour] = toHourCycle(value.hour, this.hourCycle);
        return this.dayPeriod === period && this.hour === hour;
      }
      return this[type] === fieldOf(value, type);
    });
  }

  set(type: EditableType, value: number | string, placeholder: DateValue): Fields {
    const next = this.copy();
    if (type === "era") next.era = String(value);
    else if (type === "dayPeriod") next.dayPeriod = Number(value) >= 1 ? 1 : 0;
    else next[type] = Number(value);
    if (type === "hour" && next.dayPeriod === null && "hour" in placeholder) {
      next.dayPeriod = toHourCycle(placeholder.hour, this.hourCycle)[0];
    }
    if (type === "year" && next.era === null) next.era = placeholder.era;
    // Any field but the second can move the value into the other offset.
    if (type !== "second") next.offset = null;
    return next;
  }

  clear(type: EditableType): Fields {
    const next = this.copy();
    next[type] = null;
    // A year without its era is a number with no year to be.
    if (type === "year") next.era = null;
    next.offset = null;
    return next;
  }

  /** One step of one field; an empty one takes the placeholder's value instead. */
  cycle(
    type: EditableType,
    amount: number,
    placeholder: DateValue,
    shown: readonly EditableType[],
  ): Fields {
    const next = this.copy();
    if (next[type] === null && type !== "dayPeriod" && type !== "era") {
      if (type === "hour") {
        if ("hour" in placeholder) {
          [next.dayPeriod, next.hour] = toHourCycle(placeholder.hour, this.hourCycle);
        }
      } else {
        next[type] = fieldOf(placeholder, type) as number;
      }
      if (type === "year" && next.era === null) next.era = placeholder.era;
      return next;
    }

    switch (type) {
      case "era": {
        const eras = this.calendar.getEras();
        const at = cycleValue(eras.indexOf(next.era ?? ""), amount, 0, eras.length - 1);
        next.era = eras[at] ?? next.era;
        break;
      }
      case "year": {
        // Through a whole date, so stepping back from year 1 of an era lands
        // in the last year of the one before.
        const date = new CalendarDate(
          this.calendar,
          this.era ?? placeholder.era,
          this.year ?? placeholder.year,
          this.month ?? 1,
          this.day ?? 1,
        ).cycle("year", amount, { round: true });
        next.era = date.era;
        next.year = date.year;
        break;
      }
      case "month":
        next.month = cycleValue(next.month ?? 1, amount, 1, this.calendar.getMaximumMonthsInYear());
        break;
      case "day":
        // Up to the longest month the calendar has: in a day-first locale the
        // day is typed before the month that decides how long it is.
        next.day = cycleValue(next.day ?? 1, amount, 1, this.calendar.getMaximumDaysInMonth());
        break;
      case "hour": {
        const hasDate = shown.some((one) => one === "year" || one === "month" || one === "day");
        const whole = next.year !== null && next.month !== null && next.day !== null;
        if ("timeZone" in placeholder && (!hasDate || whole)) {
          // Through the zoned value, so stepping across a change of the
          // clocks lands on the hour the clock shows: from 1:59 to 3:00 when
          // it goes forward, and through 1:00 twice when it goes back.
          const zoned = (this.toValue(placeholder) as ZonedDateTime).cycle("hour", amount, {
            hourCycle: this.hourCycle === "h12" ? 12 : 24,
            round: false,
          });
          [next.dayPeriod, next.hour] = toHourCycle(zoned.hour, this.hourCycle);
          next.offset = zoned.offset;
        } else {
          const limits = this.limits("hour");
          next.hour = cycleValue(next.hour ?? 0, amount, limits.min, limits.max);
          if (next.dayPeriod === null && "hour" in placeholder) {
            next.dayPeriod = toHourCycle(placeholder.hour, this.hourCycle)[0];
          }
        }
        break;
      }
      case "dayPeriod":
        next.dayPeriod = cycleValue(next.dayPeriod ?? 0, amount, 0, 1);
        break;
      case "minute":
      case "second":
        next[type] = cycleValue(next[type] ?? 0, amount, 0, 59, true);
        break;
    }
    return next;
  }

  /** A whole value: these fields over `base`, with a day its month lacks made into one it has. */
  toValue(base: DateValue): DateValue {
    const date = {
      era: this.era ?? base.era,
      year: this.year ?? base.year,
      month: this.month ?? base.month,
      day: this.day ?? base.day,
    };
    if (!("hour" in base)) return base.set(date);

    let hour: number | null = this.hour;
    if (hour !== null) hour = fromHourCycle(hour, this.dayPeriod ?? 0, this.hourCycle);
    else if (this.dayPeriod !== null && (this.hourCycle === "h11" || this.hourCycle === "h12")) {
      hour = this.dayPeriod === 1 ? 12 : 0;
    }
    const time = {
      hour: hour ?? base.hour,
      minute: this.minute ?? base.minute,
      second: this.second ?? base.second,
      millisecond: this.millisecond ?? base.millisecond,
    };
    if (!("timeZone" in base)) return base.set({ ...date, ...time });

    const zoned = base.set({ ...date, ...time });
    // The wall time is in the hour that happens twice, and the offset the
    // user stepped into is the other one.
    if (this.offset !== null && zoned.offset !== this.offset) {
      return zoned.add({ milliseconds: zoned.offset - this.offset });
    }
    return zoned;
  }

  limits(type: EditableType): { min: number; max: number } {
    switch (type) {
      case "era":
        return { min: 0, max: this.calendar.getEras().length - 1 };
      case "year":
        return { min: 1, max: 9999 };
      case "month":
        return { min: 1, max: this.calendar.getMaximumMonthsInYear() };
      case "day":
        return { min: 1, max: this.calendar.getMaximumDaysInMonth() };
      case "dayPeriod":
        return { min: 0, max: 1 };
      case "hour":
        if (this.hourCycle === "h12") return { min: 1, max: 12 };
        if (this.hourCycle === "h11") return { min: 0, max: 11 };
        if (this.hourCycle === "h24") return { min: 1, max: 24 };
        return { min: 0, max: 23 };
      default:
        return { min: 0, max: 59 };
    }
  }

  /** The number a segment holds; an era's is its place in the calendar's list. */
  numberOf(type: EditableType): number | null {
    if (type !== "era") return this[type];
    return this.era === null ? null : this.calendar.getEras().indexOf(this.era);
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface DateFieldStateOptions<T extends DateValue = DateValue> {
  /**
   * Any kind of date value. The field edits it in the calendar the locale
   * names and reports it back in the calendar it came in; a zoned value adds
   * its zone as a segment and is stepped through daylight-saving changes.
   */
  value?: MaybeAccessor<T | null | undefined>;
  defaultValue?: MaybeAccessor<T | null | undefined>;
  /**
   * What an empty field's segments count from, and the kind of value it
   * reports. @default today at midnight
   */
  placeholderValue?: MaybeAccessor<DateValue | null | undefined>;
  minValue?: MaybeAccessor<DateValue | null | undefined>;
  maxValue?: MaybeAccessor<DateValue | null | undefined>;
  /** Days that exist but cannot be chosen: a value on one is invalid. */
  isDateUnavailable?: (date: DateValue) => boolean;
  /**
   * The smallest part shown. Defaults to `"minute"` for a value with a time
   * and `"day"` for one without.
   */
  granularity?: MaybeAccessor<Granularity | undefined>;
  /** The largest part shown. `"hour"` makes it a field for a time alone. @default "year" */
  maxGranularity?: MaybeAccessor<"year" | "hour" | undefined>;
  /** 12- or 24-hour. Defaults to what the locale does. */
  hourCycle?: MaybeAccessor<12 | 24 | undefined>;
  /** Leave a zoned value's zone out of the segments. @default false */
  hideTimeZone?: MaybeAccessor<boolean | undefined>;
  /**
   * Builds the calendar system the locale names: `ja-JP-u-ca-japanese` asks
   * for `"japanese"`. @default createCalendar
   */
  createCalendar?: (identifier: CalendarIdentifier) => CalendarSystem;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  isRequired?: MaybeAccessor<boolean | undefined>;
  onChange?: (value: NoInfer<MappedDateValue<T>> | null) => void;
}

export interface DateFieldState {
  /** The value as it was given, in the calendar it was given in. */
  value: Accessor<DateValue | null>;
  /** What a form reset goes back to. */
  defaultValue: Accessor<DateValue | null>;
  setValue(value: DateValue | null): void;
  /**
   * What the segments show, in the calendar the field is drawn in: the value,
   * or the placeholder standing in for what has not been typed.
   */
  displayValue: Accessor<DateValue>;
  /** {@link displayValue} as an instant, in {@link timeZone}. */
  dateValue: Accessor<Date>;
  /** The calendar system the field is drawn in. */
  calendar: Accessor<CalendarSystem>;
  /**
   * The zone the field formats in: a zoned value's, or UTC for one without,
   * which has no hour a change of the clocks skips.
   */
  timeZone: Accessor<string>;
  segments: Accessor<DateSegment[]>;
  granularity: Accessor<Granularity>;
  maxGranularity: Accessor<"year" | "hour">;
  isDisabled: Accessor<boolean>;
  isReadOnly: Accessor<boolean>;
  isRequired: Accessor<boolean>;
  /** Every editable segment has been filled, so the field HAS a value. */
  isComplete: Accessor<boolean>;
  increment(type: SegmentType): void;
  decrement(type: SegmentType): void;
  incrementPage(type: SegmentType): void;
  decrementPage(type: SegmentType): void;
  /** A number for a segment, or an era's identifier for the era. */
  setSegment(type: SegmentType, value: number | string): void;
  clearSegment(type: SegmentType): void;
  clear(): void;
  /**
   * The field was left: a whole date that does not exist, the 31st of
   * February, becomes the nearest one that does and is reported.
   */
  confirmPlaceholder(): void;
  /** What a formatted value reads as, for a screen reader. */
  formatValue(options?: Intl.DateTimeFormatOptions): string;
  /** What `minValue`, `maxValue` and `isDateUnavailable` make of the value, or `undefined`. */
  rangeValidation: Accessor<ValidationResult | undefined>;
}

const PAGE: Partial<Record<SegmentType, number>> = {
  year: 5,
  month: 3,
  day: 7,
  hour: 2,
  minute: 15,
  second: 15,
};

export function dateFieldState<T extends DateValue = DateValue>(
  options: DateFieldStateOptions<T>,
): DateFieldState {
  const locale = useLocale();
  const messages = stringFormatter(FIELD_STRINGS);
  const plainNumber = numberFormatter({ useGrouping: false });
  const twoDigits = numberFormatter({ useGrouping: false, minimumIntegerDigits: 2 });

  const maxGranularity = (): "year" | "hour" => access(options.maxGranularity) ?? "year";
  const isDisabled = (): boolean => access(options.isDisabled) === true;
  const isReadOnly = (): boolean => access(options.isReadOnly) === true;

  const [value, setValueRaw] = controllable<DateValue | null>(
    () => access(options.value),
    () => access(options.defaultValue) ?? null,
    (next) => options.onChange?.(next as MappedDateValue<T> | null),
  );
  const initialValue = untrack(value);

  // The value, or what stands in for it, decides the granularity and the
  // zone. Emptied, a field keeps the last ones it had, or its segments would
  // change shape under the user who cleared it.
  let lastShape: { granularity: Granularity; timeZone: string | undefined } = {
    granularity: "day",
    timeZone: undefined,
  };
  const shape = createMemo(() => {
    const model =
      value() ?? access(options.defaultValue) ?? access(options.placeholderValue) ?? null;
    if (model !== null) {
      lastShape = {
        granularity: "minute" in model ? "minute" : "day",
        timeZone: "timeZone" in model ? model.timeZone : undefined,
      };
    }
    return lastShape;
  });
  const granularity = (): Granularity => access(options.granularity) ?? shape().granularity;
  const valueZone = (): string | undefined => shape().timeZone;
  const timeZone = (): string => valueZone() ?? "UTC";

  // What the locale says about the calendar and the clock, read from a format
  // that has both.
  const resolved = createMemo(() => {
    const given = access(options.hourCycle);
    return dateFormatter(
      {
        dateStyle: "short",
        timeStyle: "short",
        hour12: given === undefined ? undefined : given === 12,
      },
      locale,
    )().resolvedOptions();
  });
  const calendar = createMemo(
    () => (options.createCalendar ?? createCalendar)(resolved().calendar as CalendarIdentifier),
    { equals: isEqualCalendar },
  );
  const hourCycle = (): HourCycle => {
    const cycle = resolved().hourCycle;
    return cycle ?? (access(options.hourCycle) === 12 ? "h12" : "h23");
  };

  /** The value as the field edits it, in the calendar it is drawn in. */
  const calendarValue = (): DateValue | null => {
    const current = value();
    return current === null ? null : toCalendar(current, calendar());
  };

  /** The segments the field shows, which are the ones that must be filled. */
  const shown = createMemo((): EditableType[] => {
    const twelve = hourCycle() === "h11" || hourCycle() === "h12";
    const all: EditableType[] = twelve
      ? ["era", "year", "month", "day", "hour", "dayPeriod", "minute", "second"]
      : ["era", "year", "month", "day", "hour", "minute", "second"];
    const level = granularity();
    const last = all.indexOf(
      level === "day" ? "day" : level === "hour" && twelve ? "dayPeriod" : level,
    );
    return all.slice(maxGranularity() === "hour" ? all.indexOf("hour") : 0, last + 1);
  });

  const placeholder = createMemo((): DateValue => {
    const given = access(options.placeholderValue);
    if (given !== null && given !== undefined) return toCalendar(given, calendar());
    const zone = valueZone();
    const midnight = toCalendar(
      now(zone ?? getLocalTimeZone()).set({ hour: 0, minute: 0, second: 0, millisecond: 0 }),
      calendar(),
    );
    if (granularity() === "day") return toCalendarDate(midnight);
    return zone === undefined ? toCalendarDateTime(midnight) : midnight;
  });

  /** What edits are made over: the value, or the placeholder while there is none. */
  const basis = (): DateValue => calendarValue() ?? placeholder();

  /**
   * What the user has typed, which is what the segments show.
   *
   * A plain variable as well as a signal: two keystrokes can arrive before the
   * signal is published, and the second has to build on the first.
   */
  let live = new Fields(untrack(calendar), untrack(hourCycle), untrack(calendarValue));
  const [display, setDisplay] = createSignal<Fields>(live);
  /** The value this field last reported, so it is not mistaken for one from outside. */
  let emitted: DateValue | null | undefined;

  const show = (next: Fields): void => {
    live = next;
    setDisplay(next);
  };

  /** A value from the field, reported in the calendar the caller's value is in. */
  const write = (next: DateValue | null): void => {
    const model =
      untrack(value) ?? access(options.defaultValue) ?? access(options.placeholderValue);
    const reported =
      next === null ? null : toCalendar(next, model?.calendar ?? new GregorianCalendar());
    emitted = reported;
    setValueRaw(reported);
  };

  const fresh = (current: DateValue | null): Fields =>
    new Fields(calendar(), hourCycle(), current === null ? null : toCalendar(current, calendar()));

  /**
   * The fields shown, and the value reported when they make one.
   *
   * A half-filled field has no value, so taking a segment away reports null.
   * A whole one that names a day its month lacks reports nothing yet: the
   * user may be about to change the month.
   */
  const apply = (next: Fields): void => {
    if (isDisabled() || isReadOnly()) return;
    show(next);
    const types = shown();
    if (!next.isComplete(types)) {
      if (value() !== null) write(null);
      return;
    }
    const whole = next.toValue(basis());
    if (!next.matches(whole, types)) return;
    const current = calendarValue();
    if (current === null || current.compare(whole) !== 0) write(whole);
  };

  if (!isServer) {
    // A value arriving from OUTSIDE fills the field, and one taken away
    // empties it back to the placeholder. So does the locale naming another
    // calendar or clock.
    createEffect(
      () => [value(), calendar(), hourCycle()] as const,
      ([current, system, cycle]) => {
        if (
          current === emitted &&
          isEqualCalendar(system, live.calendar) &&
          cycle === live.hourCycle
        ) {
          return;
        }
        emitted = undefined;
        show(new Fields(system, cycle, current === null ? null : toCalendar(current, system)));
      },
    );
  }

  const isComplete = (): boolean => display().isComplete(shown());

  const displayValue = createMemo(() => display().toValue(basis()));
  const dateValue = (): Date => displayValue().toDate(timeZone());

  const format = createMemo(() => {
    const parts: Intl.DateTimeFormatOptions = {
      calendar: calendar().identifier,
      timeZone: timeZone(),
    };
    if (maxGranularity() === "year") {
      parts.year = "numeric";
      parts.month = "2-digit";
      parts.day = "2-digit";
      // A Gregorian year before the common era reads as one after it
      // without its era; other calendars print theirs on their own.
      if (calendar().identifier === "gregory" && display().era === "BC") parts.era = "short";
    }
    const level = granularity();
    if (level !== "day" || maxGranularity() === "hour") {
      parts.hour = "2-digit";
      parts.hourCycle = hourCycle();
      if (level !== "hour") parts.minute = "2-digit";
      if (level === "second") parts.second = "2-digit";
      if (valueZone() !== undefined && access(options.hideTimeZone) !== true) {
        parts.timeZoneName = "short";
      }
    }
    return dateFormatter(parts, locale)();
  });

  const segments = createMemo((): DateSegment[] => {
    const fields = display();
    const level = granularity();
    const tag = locale().locale;
    const parts = format().formatToParts(dateValue());
    const list: DateSegment[] = [];

    for (const part of parts) {
      const type = PART_TYPES[part.type] ?? (part.type as SegmentType);
      if (type === "timeZoneName") {
        list.push({ type, text: part.value, isPlaceholder: false, isEditable: false });
        continue;
      }
      if (!(EDITABLE as readonly string[]).includes(type)) {
        list.push({ type: "literal", text: part.value, isPlaceholder: false, isEditable: false });
        continue;
      }

      const editable = type as EditableType;
      const number = fields.numberOf(editable);
      const limits = fields.limits(editable);
      let text = part.value;
      if (editable !== "dayPeriod" && editable !== "era" && number !== null) {
        const wide = editable !== "year" && part.value.length >= 2;
        text = (wide ? twoDigits() : plainNumber()).format(number);
      }
      const empty =
        editable === "year" || editable === "month" || editable === "day"
          ? stringFor(PLACEHOLDERS, editable, tag)
          : editable === "dayPeriod" || editable === "era"
            ? part.value
            : "––";

      const segment: DateSegment = {
        type: editable,
        text: number === null ? empty : text,
        value: number ?? undefined,
        minValue: limits.min,
        maxValue: limits.max,
        isPlaceholder: number === null,
        placeholder: empty,
        // A calendar with one era has nothing to choose.
        isEditable: editable !== "era" || calendar().getEras().length > 1,
      };

      // A time reads left to right even in a right-to-left locale, so the
      // time segments are isolated as one left-to-right run.
      if (editable === "hour") {
        list.push({ type: "literal", text: "⁦", isPlaceholder: false, isEditable: false });
        list.push(segment);
        if (level === "hour") {
          list.push({ type: "literal", text: "⁩", isPlaceholder: false, isEditable: false });
        }
      } else if ((editable === "minute" || editable === "second") && editable === level) {
        list.push(segment);
        list.push({ type: "literal", text: "⁩", isPlaceholder: false, isEditable: false });
      } else {
        list.push(segment);
      }
    }
    return list;
  });

  const isEditableType = (type: SegmentType): type is EditableType =>
    (EDITABLE as readonly string[]).includes(type);

  const step = (type: SegmentType, amount: number): void => {
    if (!isEditableType(type)) return;
    apply(live.cycle(type, amount, basis(), shown()));
  };

  /** A format for a value said in words, in the calendar and zone the field formats in. */
  const wordsFormat = (fieldOptions: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
    dateFormatter(
      { ...fieldOptions, calendar: calendar().identifier, timeZone: timeZone() },
      locale,
    )();

  /**
   * How a bound is said in an error. A zoned one names its zone, which the
   * date and time styles cannot be combined with, so it is spelled out.
   */
  const boundOptions = (): Intl.DateTimeFormatOptions => {
    const zoned = valueZone() !== undefined;
    if (maxGranularity() === "hour") {
      return { hour: "numeric", minute: "2-digit", timeZoneName: zoned ? "short" : undefined };
    }
    if (granularity() === "day") return { dateStyle: "medium" };
    if (!zoned) return { dateStyle: "medium", timeStyle: "short" };
    const parts = { year: "numeric", month: "short", day: "numeric" } as const;
    return { ...parts, hour: "numeric", minute: "2-digit", timeZoneName: "short" };
  };

  const rangeValidation = (): ValidationResult | undefined => {
    const current = value();
    if (current === null) return undefined;

    const min = access(options.minValue);
    const max = access(options.maxValue);
    const under = min !== null && min !== undefined && current.compare(min) < 0;
    const over = max !== null && max !== undefined && current.compare(max) > 0;
    const unavailable = options.isDateUnavailable?.(current) === true;
    if (!under && !over && !unavailable) return undefined;

    const formatted = wordsFormat(boundOptions());
    const zone = timeZone();
    const errors: string[] = [];
    if (under) {
      errors.push(
        messages().format("rangeUnderflow", { minValue: formatted.format(min.toDate(zone)) }),
      );
    }
    if (over) {
      errors.push(
        messages().format("rangeOverflow", { maxValue: formatted.format(max.toDate(zone)) }),
      );
    }
    if (unavailable) errors.push(messages().format("unavailableDate"));

    return {
      isInvalid: true,
      validationErrors: errors,
      validationDetails: {
        badInput: unavailable,
        customError: false,
        patternMismatch: false,
        rangeOverflow: over,
        rangeUnderflow: under,
        stepMismatch: false,
        tooLong: false,
        tooShort: false,
        typeMismatch: false,
        valueMissing: false,
        valid: false,
      },
    };
  };

  return {
    value,
    defaultValue: () => access(options.defaultValue) ?? initialValue,
    rangeValidation,
    displayValue,
    dateValue,
    calendar,
    timeZone,
    segments,
    granularity,
    maxGranularity,
    isDisabled,
    isReadOnly,
    isRequired: () => access(options.isRequired) === true,
    isComplete,
    setValue: (next) => {
      show(fresh(next));
      write(next);
    },
    increment: (type) => step(type, 1),
    decrement: (type) => step(type, -1),
    incrementPage: (type) => step(type, PAGE[type] ?? 1),
    decrementPage: (type) => step(type, -(PAGE[type] ?? 1)),
    setSegment: (type, next) => {
      if (!isEditableType(type)) return;
      // An era by its identifier, or by its place in the list as Home and
      // End give it.
      const given =
        type === "era" && typeof next === "number" ? (calendar().getEras()[next] ?? "") : next;
      apply(live.set(type, given, basis()));
    },
    clearSegment: (type) => {
      if (!isEditableType(type)) return;
      apply(live.clear(type));
    },
    clear: () => {
      if (isDisabled() || isReadOnly()) return;
      show(fresh(null));
      write(null);
    },
    confirmPlaceholder: () => {
      if (isDisabled() || isReadOnly()) return;
      if (!live.isComplete(shown())) return;
      const result = live.toValue(basis());
      show(new Fields(calendar(), hourCycle(), result));
      const current = calendarValue();
      if (current === null || current.compare(result) !== 0) write(result);
    },
    formatValue: (formatOptions) => {
      const current = calendarValue();
      if (current === null) return "";
      if (maxGranularity() === "hour") {
        return wordsFormat(formatOptions ?? { timeStyle: "short" }).format(
          current.toDate(timeZone()),
        );
      }
      return wordsFormat(formatOptions ?? { dateStyle: "long" }).format(current.toDate(timeZone()));
    },
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface DateFieldOptions extends FieldOptions {
  ref: ElementRef;
  /** The hidden input that carries the value into a form, and that a form validates. */
  inputRef?: ElementRef<HTMLInputElement>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  isRequired?: MaybeAccessor<boolean | undefined>;
  name?: MaybeAccessor<string | undefined>;
  /** What the page thinks of the date, checked as it changes. */
  validate?: ValidateFunction<DateValue | null>;
  /** @default "aria" */
  validationBehavior?: MaybeAccessor<ValidationBehavior | undefined>;
}

export interface DateFieldResult {
  labelProps: DOMProps;
  /** For the element holding the segments. */
  fieldProps: DOMProps;
  descriptionProps: DOMProps;
  errorMessageProps: DOMProps;
  /** For a hidden input carrying the value into a form. */
  inputProps: DOMProps;
  /** What is wrong with the date, and whether the user is being told. */
  validation: FormValidationState;
  errors: Accessor<string[]>;
  isInvalid: Accessor<boolean>;
  /** The ids the field is described by, for {@link dateSegment}. */
  describedBy: Accessor<string | undefined>;
  /** The field's own `aria-label`, for {@link dateSegment}. */
  label: Accessor<string | undefined>;
  /** The ids the field is labelled by, for {@link dateSegment}. */
  labelledBy: Accessor<string | undefined>;
}

const SEGMENT_SELECTOR = '[role="spinbutton"], [role="textbox"]';

export function dateField(options: DateFieldOptions, state: DateFieldState): DateFieldResult {
  const {
    state: validation,
    behavior,
    isInvalid,
    errors,
    errorMessage,
  } = fieldValidation<DateValue | null>({
    value: state.value,
    builtinValidation: state.rangeValidation,
    validate: options.validate,
    validationBehavior: options.validationBehavior,
    isInvalid: options.isInvalid,
    errorMessage: options.errorMessage,
    name: options.name,
  });

  const {
    labelProps,
    fieldProps: labelledProps,
    descriptionProps,
    errorMessageProps,
  } = field({ ...options, isInvalid, errorMessage, labelElementType: "span" });

  const focusFirst = (): void => {
    const group = access(options.ref) as HTMLElement | null;
    group?.querySelector<HTMLElement>(SEGMENT_SELECTOR)?.focus();
  };

  if (options.inputRef !== undefined && !isServer) {
    formReset(options.inputRef, state.defaultValue, (next) => state.setValue(next));
    formValidation(
      { validationBehavior: behavior, focus: focusFirst },
      validation,
      options.inputRef,
    );
  }

  const isNative = (): boolean => behavior() === "native";

  return {
    labelProps,
    descriptionProps,
    errorMessageProps,
    validation,
    errors,
    isInvalid,
    describedBy: () =>
      access(labelledProps["aria-describedby"] as MaybeAccessor<string | undefined>),
    label: () => access(options["aria-label"]),
    labelledBy: () => access(labelledProps["aria-labelledby"] as MaybeAccessor<string | undefined>),
    fieldProps: mergeProps(filterDOMProps(options, { labelable: true }), labelledProps, {
      // A group, because the segments are separate controls that together are
      // one field: `role="textbox"` would promise editing the whole string.
      role: "group",
      "aria-disabled": () => state.isDisabled() || undefined,
      "aria-invalid": () => isInvalid() || undefined,
      "aria-required": () => access(options.isRequired) === true || undefined,
      // A date is committed segment by segment, so leaving the field is the
      // first moment the whole value is worth judging. Moving between its own
      // segments is not leaving it.
      onFocusOut: (event: FocusEvent) => {
        const group = event.currentTarget as Element | null;
        const next = event.relatedTarget as Element | null;
        if (group !== null && next !== null && contains(group, next)) return;
        state.confirmPlaceholder();
        validation.commitValidation();
      },
    }),
    inputProps: {
      // A hidden input is never validated by the browser, so under native
      // validation it is a text input the user cannot see, which is.
      type: () => (isNative() ? "text" : "hidden"),
      hidden: () => isNative() || undefined,
      required: () => (isNative() && access(options.isRequired) === true) || undefined,
      disabled: () => state.isDisabled() || undefined,
      name: () => access(options.name),
      value: () => state.value()?.toString() ?? "",
    },
  };
}

export interface DateSegmentOptions {
  segment: Accessor<DateSegment>;
  ref: ElementRef;
  /** The field's {@link DateFieldResult.describedBy}. */
  "aria-describedby"?: MaybeAccessor<string | undefined>;
  /** The field's {@link DateFieldResult.label}. */
  "aria-label"?: MaybeAccessor<string | undefined>;
  /** The field's {@link DateFieldResult.labelledBy}. */
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  isInvalid?: MaybeAccessor<boolean | undefined>;
}

export interface DateSegmentResult {
  segmentProps: DOMProps;
}

export function dateSegment(options: DateSegmentOptions, state: DateFieldState): DateSegmentResult {
  const segment = (): DateSegment => options.segment();
  const locale = useLocale();
  const messages = stringFormatter(FIELD_STRINGS);
  const parser = numberParser({ maximumFractionDigits: 0 });
  const { startsWith } = filter({ sensitivity: "base" });
  /** A format in the calendar and zone the field is drawn in. */
  const fieldFormat = (format: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
    dateFormatter(
      { ...format, calendar: state.calendar().identifier, timeZone: state.timeZone() },
      locale,
    )();
  const periods = dateFormatter({ hour: "numeric", hour12: true });

  /**
   * The calendar's eras as the locale writes them, so typing the first letter
   * of one chooses it.
   *
   * What every name shares is cut off first: in a calendar whose eras are
   * ERA0 and ERA1, the Ethiopic, the keys are 0 and 1.
   */
  const eras = createMemo(() => {
    if (segment().type !== "era") return [];
    const system = state.calendar();
    const format = dateFormatter(
      { year: "numeric", era: "narrow", calendar: system.identifier, timeZone: "UTC" },
      locale,
    )();
    const first = toCalendar(new CalendarDate(1, 1, 1), system);
    const named = system.getEras().map((era) => {
      const at = first.set({ era, year: 1, month: 1, day: 1 }).toDate("UTC");
      // An era CLDR has no name for is left out of the format; its
      // identifier is still something to type.
      const formatted = format.formatToParts(at).find((part) => part.type === "era")?.value ?? era;
      return { era, formatted };
    });
    const shared = commonPrefixLength(named.map((one) => one.formatted));
    return named.map((one) => ({ era: one.era, formatted: one.formatted.slice(shared) }));
  });

  /**
   * What has been typed into this segment since focus arrived.
   *
   * Kept here rather than in the state, because it is not part of the value:
   * a segment left half typed shows what was typed and commits nothing more.
   */
  let entered = "";
  /** Where among the field's segments this one was when it took focus, while it has it. */
  let focusedAt = -1;

  const isEditable = (): boolean =>
    segment().isEditable && !state.isDisabled() && !state.isReadOnly();

  const element = (): HTMLElement | null => access(options.ref) as HTMLElement | null;

  /** The next or previous editable segment: on screen in a right-to-left locale, in the DOM otherwise. */
  const moveFocus = (by: 1 | -1): void => {
    const self = element();
    const container = self?.closest('[role="group"]');
    if (self === null || self === undefined || container === null || container === undefined) {
      return;
    }
    const all = [...container.querySelectorAll<HTMLElement>(SEGMENT_SELECTOR)];
    if (locale().direction !== "rtl") {
      all[all.indexOf(self) + by]?.focus();
      return;
    }
    const from = self.getBoundingClientRect().left;
    let closest: HTMLElement | null = null;
    let distance = Infinity;
    for (const candidate of all) {
      const gap = candidate.getBoundingClientRect().left - from;
      if (Math.sign(gap) === by && Math.abs(gap) < distance) {
        closest = candidate;
        distance = Math.abs(gap);
      }
    }
    closest?.focus();
  };

  const dayPeriodText = (hour: number): string =>
    periods()
      .formatToParts(new Date(2000, 0, 1, hour))
      .find((part) => part.type === "dayPeriod")?.value ?? "";

  const matchesPeriod = (marker: string, key: string): boolean =>
    marker !== "" && key !== "" && startsWith(marker, key);

  /** A character typed into the segment, from a key or from a virtual keyboard. */
  const type = (key: string): void => {
    if (!isEditable()) return;
    const current = segment();

    if (current.type === "dayPeriod") {
      if (matchesPeriod(dayPeriodText(0), key)) state.setSegment("dayPeriod", 0);
      else if (matchesPeriod(dayPeriodText(12), key)) state.setSegment("dayPeriod", 1);
      else return;
      moveFocus(1);
      return;
    }

    if (current.type === "era") {
      const matched = eras().find((one) => key !== "" && startsWith(one.formatted, key));
      if (matched === undefined) return;
      state.setSegment("era", matched.era);
      moveFocus(1);
      return;
    }

    const next = `${entered}${key}`;
    if (!parser().isValidPartialNumber(next)) return;
    const number = parser().parse(next);
    if (Number.isNaN(number)) return;

    const max = current.maxValue;
    const written = max !== undefined && number > max ? parser().parse(key) : number;
    if (Number.isNaN(written)) return;
    state.setSegment(current.type, written);

    // On to the next when no further digit could belong here: typing 4 into a
    // month means April, and waiting for a second digit that cannot come
    // would make every date twice the keystrokes.
    if (max !== undefined && (Number(`${number}0`) > max || next.length >= String(max).length)) {
      entered = "";
      moveFocus(1);
    } else {
      entered = next;
    }
  };

  /** One digit taken off the end; an empty segment hands the key to the one before. */
  const backspace = (): void => {
    const current = segment();
    if (current.isPlaceholder) {
      moveFocus(-1);
      return;
    }
    if (!isEditable()) return;
    if (current.type === "dayPeriod" || current.type === "era") {
      state.clearSegment(current.type);
      return;
    }
    if (!parser().isValidPartialNumber(current.text)) return;
    let rest = current.text.slice(0, -1);
    const parsed = parser().parse(rest);
    if (rest.length === 0 || parsed === 0 || Number.isNaN(parsed)) {
      rest = "";
      state.clearSegment(current.type);
    } else {
      state.setSegment(current.type, parsed);
    }
    entered = rest;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const current = segment();
    if (current.type === "literal") return;
    // A modified key belongs to something else: Alt+ArrowDown opens a date
    // picker's calendar, and stepping the segment as well would change the
    // date the user is about to choose.
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    // The zone of a zoned value is read out and passed through, not changed.
    if (!current.isEditable && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        if (isEditable()) state.increment(current.type);
        entered = "";
        return;
      case "ArrowDown":
        event.preventDefault();
        if (isEditable()) state.decrement(current.type);
        entered = "";
        return;
      case "PageUp":
        event.preventDefault();
        if (isEditable()) state.incrementPage(current.type);
        entered = "";
        return;
      case "PageDown":
        event.preventDefault();
        if (isEditable()) state.decrementPage(current.type);
        entered = "";
        return;
      case "Home":
        event.preventDefault();
        if (isEditable() && current.minValue !== undefined) {
          state.setSegment(current.type, current.minValue);
        }
        entered = "";
        return;
      case "End":
        event.preventDefault();
        if (isEditable() && current.maxValue !== undefined) {
          state.setSegment(current.type, current.maxValue);
        }
        entered = "";
        return;
      case "Backspace":
      case "Delete":
        event.preventDefault();
        backspace();
        return;
      case "ArrowLeft":
      case "ArrowRight": {
        // The caret is between SEGMENTS, so moving it is moving focus.
        event.preventDefault();
        moveFocus(event.key === "ArrowRight" ? 1 : -1);
        return;
      }
      default:
        break;
    }

    if (event.key.length !== 1 || event.shiftKey) return;
    // Handled here, the character never reaches `beforeinput`; a virtual
    // keyboard's keydown carries no key, and its character arrives there.
    event.preventDefault();
    type(event.key);
  };

  /** What the content-editable segment's text was before a composition changed it. */
  let composed = "";

  const onBeforeInput = (event: InputEvent): void => {
    const self = element();
    if (self === null) return;
    // The segment's text is the state's to write, never the browser's.
    event.preventDefault();
    switch (event.inputType) {
      case "deleteContentBackward":
      case "deleteContentForward":
        backspace();
        return;
      case "insertCompositionText":
        composed = self.textContent ?? "";
        // Safari stays in a composition unless the text is written back.
        writeText(self, composed);
        return;
      default:
        if (event.data !== null) type(event.data);
    }
  };

  const onInput = (event: InputEvent): void => {
    if (event.inputType !== "insertCompositionText") return;
    const self = element();
    // A composition cannot be cancelled, so what it wrote is undone here.
    if (self !== null) writeText(self, composed);
    // Android sends some letters as compositions, AM and PM among them.
    const data = event.data;
    if (
      data !== null &&
      (matchesPeriod(dayPeriodText(0), data) || matchesPeriod(dayPeriodText(12), data))
    ) {
      type(data);
    }
  };

  if (!isServer) {
    // A selection spread across the segment makes Android's composition
    // rewrite the DOM under the field, so it is kept collapsed while focused.
    createEffect(
      () => element(),
      (self) => {
        if (self === null) return undefined;
        const document = self.ownerDocument;
        // Collapsing fires another `selectionchange`, which some engines
        // dispatch at once, so the listener must not answer its own.
        let collapsing = false;
        const collapse = (): void => {
          const selection = document.getSelection();
          if (
            collapsing ||
            selection?.anchorNode === null ||
            selection?.anchorNode === undefined ||
            !contains(self, selection.anchorNode) ||
            document.activeElement !== self
          ) {
            return;
          }
          collapsing = true;
          try {
            selection.collapse(self);
          } finally {
            collapsing = false;
          }
        };
        document.addEventListener("selectionchange", collapse);
        return () => document.removeEventListener("selectionchange", collapse);
      },
    );

    // A segment can go while it holds focus: the era of a year before the
    // common era goes when the year is stepped into the common era. Focus
    // moves to the segment before it, or after it when it was the first,
    // rather than falling to the page.
    createEffect(
      () => element(),
      (self) => {
        if (self === null) return undefined;
        const group = self.closest('[role="group"]');
        return () => {
          const at = focusedAt;
          if (at < 0 || group === null) return;
          queueMicrotask(() => {
            const document = ownerDocument(group);
            const active = activeElement(document);
            if (!group.isConnected || (active !== null && active !== document.body)) return;
            const all = [...group.querySelectorAll<HTMLElement>(SEGMENT_SELECTOR)];
            (all[at - 1] ?? all[at])?.focus();
          });
        };
      },
    );
  }

  const name = (): string => {
    const kind = segment().type;
    if (kind === "literal") return "";
    try {
      const names = new Intl.DisplayNames(locale().locale, { type: "dateTimeField" });
      const found = names.of(kind);
      if (found !== undefined) return found;
    } catch {
      // `dateTimeField` is the second edition of `Intl.DisplayNames`, which
      // an older engine does not have.
    }
    return messages().format(kind);
  };

  const valueText = (): string | undefined => {
    const current = segment();
    if (current.isPlaceholder) return messages().format("empty");
    const at = state.dateValue();
    if (current.type === "month") {
      const month = fieldFormat({ month: "long" }).format(at);
      return month === current.text ? month : `${current.text} – ${month}`;
    }
    if (current.type === "hour") {
      const twelve = state.segments().some((each) => each.type === "dayPeriod");
      return fieldFormat({ hour: "numeric", hour12: twelve }).format(at);
    }
    return current.text;
  };

  const isLiteral = (): boolean => segment().type === "literal";

  // VoiceOver on iOS cannot focus a spin button, so there it is a text box. So
  // is the zone, which is text and has no number to spin.
  const asTextbox = (): boolean => isIOS() || segment().type === "timeZoneName";

  const isNumeric = (): boolean => {
    const kind = segment().type;
    return kind !== "dayPeriod" && kind !== "era" && kind !== "timeZoneName";
  };

  const numericDirection = (): Record<string, string> => {
    const style: Record<string, string> = { "caret-color": "transparent" };
    if (locale().direction === "rtl") {
      // A placeholder is laid out by the bidirectional algorithm differently
      // from a number, so every segment is embedded, and a number runs left
      // to right.
      style["unicode-bidi"] = "embed";
      if (isNumeric()) style.direction = "ltr";
    }
    return style;
  };

  const isSpinButton = (): boolean => !isLiteral() && !asTextbox();

  // On the first editable segment only, unless the value is invalid: moving
  // between segments would otherwise read the description again at each one.
  const describedBy = (): string | undefined => {
    if (isLiteral()) return undefined;
    const first = state.segments().find((each) => each.isEditable);
    return access(options.isInvalid) === true || first?.type === segment().type
      ? access(options["aria-describedby"])
      : undefined;
  };

  // The field's label goes on every segment, because VoiceOver on iOS does not
  // announce the group around them: a lone "day" could belong to any field.
  // The segment's own aria-label leads its aria-labelledby, so it is read as
  // "day, Departure".
  const segmentId = id();
  const fieldLabelledBy = (): string | undefined => {
    const given = access(options["aria-labelledby"])?.trim();
    return given === undefined || given === "" ? undefined : given;
  };
  const ariaLabel = (): string | undefined => {
    if (isLiteral()) return undefined;
    const given = access(options["aria-label"]);
    const label = given === undefined || given === "" ? "" : `, ${given}`;
    return `${name()}${label}${fieldLabelledBy() === undefined ? "" : ", "}`;
  };
  const ariaLabelledBy = (): string | undefined => {
    const given = fieldLabelledBy();
    if (isLiteral() || given === undefined) return undefined;
    return [...new Set([segmentId(), ...given.split(/\s+/)])].join(" ");
  };

  return {
    segmentProps: {
      role: () => (isLiteral() ? undefined : asTextbox() ? "textbox" : "spinbutton"),
      "aria-hidden": () => (isLiteral() ? true : undefined),
      id: segmentId,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      "aria-describedby": describedBy,
      "aria-valuenow": () => (isSpinButton() ? segment().value : undefined),
      "aria-valuemin": () => (isSpinButton() ? segment().minValue : undefined),
      "aria-valuemax": () => (isSpinButton() ? segment().maxValue : undefined),
      // What the number MEANS: an empty segment reads as "empty" rather than
      // as the placeholder letters, and a month as its name.
      "aria-valuetext": () => (isSpinButton() ? valueText() : undefined),
      "aria-disabled": () => (state.isDisabled() ? true : undefined),
      "aria-readonly": () =>
        !isLiteral() && (state.isReadOnly() || !segment().isEditable) ? true : undefined,
      // Editable text, so a touch device raises its keyboard for it; what is
      // typed is intercepted before the browser writes it.
      contentEditable: () => (isLiteral() ? undefined : isEditable() ? "true" : "false"),
      spellcheck: () => (isEditable() ? "false" : undefined),
      autocorrect: () => (isEditable() ? "off" : undefined),
      enterKeyHint: () => (isEditable() ? "next" : undefined),
      inputMode: () => (isEditable() && isNumeric() ? "numeric" : undefined),
      style: () => (isLiteral() ? undefined : numericDirection()),
      tabIndex: () => (!isLiteral() && !state.isDisabled() ? 0 : undefined),
      onKeyDown,
      onBeforeInput,
      onInput,
      onFocus: () => {
        entered = "";
        // Collapsed at the start, or Chrome fires no input events.
        const self = element();
        if (self === null) return;
        self.ownerDocument.getSelection()?.collapse(self);
        const group = self.closest('[role="group"]');
        focusedAt =
          group === null ? -1 : [...group.querySelectorAll(SEGMENT_SELECTOR)].indexOf(self);
      },
      onBlur: () => {
        entered = "";
        // Focus leaving for somewhere else, not the segment being taken away.
        if (element()?.isConnected === true) focusedAt = -1;
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface DateFieldContextValue {
  state: DateFieldState;
  describedBy: Accessor<string | undefined>;
  label: Accessor<string | undefined>;
  labelledBy: Accessor<string | undefined>;
  isInvalid: Accessor<boolean>;
}

const DateFieldContext = createContext<DateFieldContextValue | null>(null);

export function useDateField(): DateFieldContextValue {
  const value = getContext(DateFieldContext);
  if (value === null || value === undefined) {
    throw new Error("A DateSegment must be rendered inside a DateField.");
  }
  return value;
}

function DateFieldProvider(props: { value: DateFieldContextValue; children?: Child }) {
  return provide(
    DateFieldContext,
    () => props.value,
    () => props.children as unknown,
  );
}

export interface PickerFieldValue {
  labelledBy: Accessor<string | undefined>;
  describedBy: Accessor<string | undefined>;
}

/**
 * The label, description and error of a date picker, for the segments of the
 * field inside it.
 *
 * Not `aria-labelledby` and `aria-describedby` on that field: those name and
 * describe its group too, and a group inside the picker's group, saying the
 * same, is read out twice.
 */
export const PickerFieldContext = createContext<PickerFieldValue | null>(null);

function joinIds(...given: (string | undefined)[]): string | undefined {
  const present = given.filter((one) => one !== undefined && one !== "");
  return present.length === 0 ? undefined : present.join(" ");
}

export interface DateFieldComponentProps<T extends DateValue = DateValue> extends StyleProps {
  label?: Child;
  description?: Child;
  errorMessage?: Child;
  value?: T | null;
  defaultValue?: T | null;
  /** What an empty field counts from, and the kind of value it reports. */
  placeholderValue?: DateValue | null;
  minValue?: DateValue | null;
  maxValue?: DateValue | null;
  /** Days that exist but cannot be chosen: a value on one is invalid. */
  isDateUnavailable?: (date: DateValue) => boolean;
  /** Defaults to `"minute"` for a value with a time and `"day"` for one without. */
  granularity?: Granularity;
  hourCycle?: 12 | 24;
  /** Leave a zoned value's zone out of the segments. @default false */
  hideTimeZone?: boolean;
  /** Builds the calendar system the locale names. @default createCalendar */
  createCalendar?: (identifier: CalendarIdentifier) => CalendarSystem;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  /** What the page thinks of the date, checked as it changes. */
  validate?: ValidateFunction<NoInfer<MappedDateValue<T>> | null>;
  /** @default "aria" */
  validationBehavior?: ValidationBehavior;
  name?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onChange?: (value: NoInfer<MappedDateValue<T>> | null) => void;
}

/**
 * ```tsx
 * <DateField label="Departure" value={date()} onChange={date.set} />
 * <DateField label="Starts" granularity="minute" />
 * <DateField label="Call" value={parseZonedDateTime("2026-03-08T09:00[America/New_York]")} />
 * ```
 */
// Declared as its own call site, so JSX infers `T` from the value written
// there: through the mapped type that widens Cells back to values, a type
// parameter standing alone in a prop is not inferred.
export function DateField<T extends DateValue = DateValue>(
  props: DateFieldComponentProps<T> & CallSite<DateFieldComponentProps<T>>,
) {
  const state = dateFieldState<T>({
    value: () => props.value,
    defaultValue: () => props.defaultValue,
    placeholderValue: () => props.placeholderValue,
    minValue: () => props.minValue,
    maxValue: () => props.maxValue,
    isDateUnavailable: callback<[DateValue], boolean>(cells(props).isDateUnavailable),
    granularity: () => props.granularity,
    hourCycle: () => props.hourCycle,
    hideTimeZone: () => props.hideTimeZone,
    createCalendar: callback<[CalendarIdentifier], CalendarSystem>(cells(props).createCalendar),
    isDisabled: () => props.isDisabled,
    isReadOnly: () => props.isReadOnly,
    isRequired: () => props.isRequired,
    onChange: (value) => props.onChange?.(value),
  });

  const check = callback<[MappedDateValue<T> | null], string | string[] | true | null | undefined>(
    cells(props).validate,
  );

  return (
    <FieldBody
      state={state}
      of={cells(props) as unknown as Incoming<DateFieldComponentProps>}
      validate={
        check === undefined ? undefined : (value) => check(value as MappedDateValue<T> | null)
      }
      inputValue={() => state.value()?.toString() ?? ""}
    />
  );
}

interface FieldBodyProps {
  state: DateFieldState;
  /** The field's own props, still as Cells. */
  of: Incoming<DateFieldComponentProps>;
  validate?: ValidateFunction<DateValue | null>;
  /** What the hidden input submits. */
  inputValue: () => string;
}

/** The label, the segments, the hidden input and the messages: what both fields are. */
function FieldBody(incoming: FieldBodyProps) {
  const state = incoming.state;
  const props = incoming.of;
  const domRef = makeRef<HTMLDivElement>();
  const inputRef = makeRef<HTMLInputElement>();
  const picker = getContext(PickerFieldContext);

  const {
    labelProps,
    fieldProps,
    descriptionProps,
    errorMessageProps,
    inputProps,
    errors,
    isInvalid,
    describedBy,
    label,
    labelledBy,
  } = dateField(
    {
      ref: domRef,
      inputRef,
      validate: incoming.validate,
      validationBehavior: () => props.validationBehavior?.(),
      label: () => props.label?.(),
      description: () => props.description?.(),
      errorMessage: () => props.errorMessage?.(),
      isDisabled: () => props.isDisabled?.(),
      isReadOnly: () => props.isReadOnly?.(),
      isRequired: () => props.isRequired?.(),
      isInvalid: () => props.isInvalid?.(),
      name: () => props.name?.(),
      "aria-label": () => props["aria-label"]?.(),
      "aria-labelledby": () => props["aria-labelledby"]?.(),
      "aria-describedby": () => props["aria-describedby"]?.(),
    },
    state,
  );

  const elementProps = mergeProps(
    fieldProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-disabled": () => props.isDisabled?.() === true,
      "data-invalid": isInvalid,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <DateFieldProvider
      value={{
        state,
        describedBy: () => joinIds(describedBy(), picker?.describedBy()),
        label,
        labelledBy: () => joinIds(labelledBy(), picker?.labelledBy()),
        isInvalid,
      }}
    >
      <span {...labelProps}>{() => props.label?.()}</span>
      <div {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
        {/* Keyed by INDEX, not by the segment: a new object every read would
            rebuild every element on every keystroke, and the one holding
            focus would be destroyed under the user. */}
        <For each={() => state.segments().map((_, at) => at)}>
          {(at: number) => <DateSegmentPart index={at} />}
        </For>
      </div>
      <input {...inputProps} value={incoming.inputValue()} ref={inputRef.set} />
      <span {...descriptionProps}>{() => props.description?.()}</span>
      <span {...errorMessageProps}>
        {() => {
          const given = props.errorMessage?.();
          if (given !== undefined && given !== null && given !== "") return given;
          const found = errors();
          return found.length === 0 ? null : found.join(" ");
        }}
      </span>
    </DateFieldProvider>
  );
}

interface DateSegmentPartProps {
  index: number;
}

/** One segment. Its own component so it keeps its element as the value moves. */
function DateSegmentPart(props: DateSegmentPartProps) {
  const domRef = makeRef<HTMLDivElement>();
  const { state, describedBy, label, labelledBy, isInvalid } = useDateField();
  const index = props.index;

  const segment = (): DateSegment =>
    state.segments()[index] ?? {
      type: "literal",
      text: "",
      isPlaceholder: false,
      isEditable: false,
    };

  const { segmentProps } = dateSegment(
    {
      segment,
      ref: domRef,
      "aria-describedby": describedBy,
      "aria-label": label,
      "aria-labelledby": labelledBy,
      isInvalid,
    },
    state,
  );
  const { hoverProps, isHovered } = hover({ isDisabled: state.isDisabled });
  const { focusProps, isFocusVisible } = focusRing();

  const elementProps = mergeProps(segmentProps, hoverProps, focusProps, {
    "data-type": () => segment().type,
    "data-placeholder": () => segment().isPlaceholder,
    "data-focus-visible": isFocusVisible,
    "data-hovered": isHovered,
  });

  return (
    <div {...elementProps} ref={domRef.set}>
      {() => segment().text}
    </div>
  );
}

export interface TimeFieldComponentProps<T extends TimeValue = Time> extends Omit<
  DateFieldComponentProps,
  | "granularity"
  | "value"
  | "defaultValue"
  | "placeholderValue"
  | "minValue"
  | "maxValue"
  | "isDateUnavailable"
  | "createCalendar"
  | "onChange"
  | "validate"
> {
  /**
   * A time, or a date and time whose time is edited. A zoned one shows its
   * zone, and stepping its hour follows the clock through a change.
   */
  value?: T | null;
  defaultValue?: T | null;
  /** What an empty field's segments count from. @default midnight */
  placeholderValue?: TimeValue;
  minValue?: TimeValue | null;
  maxValue?: TimeValue | null;
  /** @default "minute" */
  granularity?: "hour" | "minute" | "second";
  /** What the page thinks of the TIME, not of the date standing behind it. */
  validate?: ValidateFunction<NoInfer<MappedTimeValue<T>> | null>;
  onChange?: (value: NoInfer<MappedTimeValue<T>> | null) => void;
}

/**
 * A time on its own.
 *
 * The same segments without the date ones, so a meeting time is a field the
 * user fills rather than a string they format. A plain time is kept against
 * today and reported as a time; a date and time, zoned or not, is edited on
 * its own day and reported whole.
 */
export function TimeField<T extends TimeValue = Time>(
  props: TimeFieldComponentProps<T> & CallSite<TimeFieldComponentProps<T>>,
) {
  const day = today(getLocalTimeZone());
  const onDay = (
    time: TimeValue | null | undefined,
    date: DateValue = day,
  ): DateValue | null | undefined =>
    time === null || time === undefined
      ? time
      : "day" in time
        ? time
        : toCalendarDateTime(date, time);

  const placeholder = (): TimeValue => props.placeholderValue ?? new Time();
  /** The day the time stands on, when the caller gave one. */
  const standing = (): DateValue | undefined => {
    const model = props.value ?? placeholder();
    return "day" in model ? model : undefined;
  };
  const defaultZone = (): string | undefined => {
    const given = props.defaultValue;
    return given !== null && given !== undefined && "timeZone" in given
      ? given.timeZone
      : undefined;
  };
  /** A whole value is reported whole; a time alone is reported as a time. */
  const reported = (value: DateValue | null): MappedTimeValue<T> | null => {
    if (value === null || !("hour" in value)) return null;
    const whole = standing() !== undefined || defaultZone() !== undefined;
    return (whole ? value : toTime(value)) as MappedTimeValue<T>;
  };

  const state = dateFieldState({
    value: () => onDay(props.value),
    defaultValue: () => onDay(props.defaultValue),
    placeholderValue: () => {
      const model = props.value ?? placeholder();
      const zone = ("timeZone" in model ? model.timeZone : undefined) ?? defaultZone();
      const date = onDay(placeholder());
      if (date === null || date === undefined) return date;
      return zone !== undefined && !("timeZone" in date) ? toZoned(date, zone) : date;
    },
    minValue: () => onDay(props.minValue, standing()),
    maxValue: () => onDay(props.maxValue, standing()),
    granularity: () => props.granularity ?? "minute",
    maxGranularity: "hour",
    hourCycle: () => props.hourCycle,
    hideTimeZone: () => props.hideTimeZone,
    // A time has no calendar, and its day is never shown.
    createCalendar: () => new GregorianCalendar(),
    isDisabled: () => props.isDisabled,
    isReadOnly: () => props.isReadOnly,
    isRequired: () => props.isRequired,
    onChange: (value) => props.onChange?.(reported(value)),
  });

  const check = callback<[MappedTimeValue<T> | null], string | string[] | true | null | undefined>(
    cells(props).validate,
  );

  return (
    <FieldBody
      state={state}
      of={cells(props) as unknown as Incoming<DateFieldComponentProps>}
      validate={check === undefined ? undefined : (value) => check(reported(value))}
      inputValue={() => {
        const current = state.value();
        return current !== null && "hour" in current ? toTime(current).toString() : "";
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

/** A message with `{name}` slots filled from the variables it is formatted with. */
function say(template: string): LocalizedString {
  return (variables) =>
    template.replace(/\{(\w+)\}/g, (_, slot: string) => String(variables?.[slot] ?? ""));
}

/**
 * How many leading characters the strings share before they differ, or none
 * when one is all of another: cutting that much would leave nothing to type.
 */
function commonPrefixLength(strings: readonly string[]): number {
  const sorted = strings.toSorted();
  const first = sorted[0] ?? "";
  const last = sorted.at(-1) ?? "";
  for (let at = 0; at < first.length; at++) {
    if (first[at] !== last[at]) return at;
  }
  return 0;
}

function stringFor<K extends string>(
  dictionary: StringDictionary<K>,
  key: K,
  locale: string,
): string {
  const found = dictionary.get(key, locale);
  return typeof found === "string" ? found : "";
}

type FieldKey =
  | "empty"
  | "era"
  | "year"
  | "month"
  | "day"
  | "hour"
  | "minute"
  | "second"
  | "dayPeriod"
  | "timeZoneName"
  | "rangeUnderflow"
  | "rangeOverflow"
  | "unavailableDate";

// The placeholders browsers show in their own date inputs, per language,
// which is more languages than the rest of the strings here have.
const PLACEHOLDERS = new StringDictionary<"year" | "month" | "day">(
  {
    ach: { year: "mwaka", month: "dwe", day: "nino" },
    af: { year: "jjjj", month: "mm", day: "dd" },
    am: { year: "ዓዓዓዓ", month: "ሚሜ", day: "ቀቀ" },
    an: { year: "aaaa", month: "mm", day: "dd" },
    ar: { year: "سنة", month: "شهر", day: "يوم" },
    ast: { year: "aaaa", month: "mm", day: "dd" },
    az: { year: "iiii", month: "aa", day: "gg" },
    be: { year: "гггг", month: "мм", day: "дд" },
    bg: { year: "гггг", month: "мм", day: "дд" },
    bn: { year: "yyyy", month: "মিমি", day: "dd" },
    br: { year: "bbbb", month: "mm", day: "dd" },
    bs: { year: "gggg", month: "mm", day: "dd" },
    ca: { year: "aaaa", month: "mm", day: "dd" },
    cak: { year: "jjjj", month: "ii", day: "q'q'" },
    ckb: { year: "ساڵ", month: "مانگ", day: "ڕۆژ" },
    cs: { year: "rrrr", month: "mm", day: "dd" },
    cy: { year: "bbbb", month: "mm", day: "dd" },
    da: { year: "åååå", month: "mm", day: "dd" },
    de: { year: "jjjj", month: "mm", day: "tt" },
    dsb: { year: "llll", month: "mm", day: "źź" },
    el: { year: "εεεε", month: "μμ", day: "ηη" },
    en: { year: "yyyy", month: "mm", day: "dd" },
    eo: { year: "jjjj", month: "mm", day: "tt" },
    es: { year: "aaaa", month: "mm", day: "dd" },
    et: { year: "aaaa", month: "kk", day: "pp" },
    eu: { year: "uuuu", month: "hh", day: "ee" },
    fa: { year: "سال", month: "ماه", day: "روز" },
    ff: { year: "hhhh", month: "ll", day: "ññ" },
    fi: { year: "vvvv", month: "kk", day: "pp" },
    fr: { year: "aaaa", month: "mm", day: "jj" },
    fy: { year: "jjjj", month: "mm", day: "dd" },
    ga: { year: "bbbb", month: "mm", day: "ll" },
    gd: { year: "bbbb", month: "mm", day: "ll" },
    gl: { year: "aaaa", month: "mm", day: "dd" },
    he: { year: "שנה", month: "חודש", day: "יום" },
    hr: { year: "gggg", month: "mm", day: "dd" },
    hsb: { year: "llll", month: "mm", day: "dd" },
    hu: { year: "éééé", month: "hh", day: "nn" },
    ia: { year: "aaaa", month: "mm", day: "dd" },
    id: { year: "tttt", month: "bb", day: "hh" },
    is: { year: "áááá", month: "mm", day: "dd" },
    it: { year: "aaaa", month: "mm", day: "gg" },
    ja: { year: "年", month: "月", day: "日" },
    ka: { year: "წწწწ", month: "თთ", day: "რრ" },
    kk: { year: "жжжж", month: "аа", day: "кк" },
    kn: { year: "ವವವವ", month: "ಮಿಮೀ", day: "ದಿದಿ" },
    ko: { year: "연도", month: "월", day: "일" },
    lb: { year: "jjjj", month: "mm", day: "dd" },
    lo: { year: "ປປປປ", month: "ດດ", day: "ວວ" },
    lt: { year: "mmmm", month: "mm", day: "dd" },
    lv: { year: "gggg", month: "mm", day: "dd" },
    meh: { year: "aaaa", month: "mm", day: "dd" },
    ml: { year: "വർഷം", month: "മാസം", day: "തീയതി" },
    ms: { year: "tttt", month: "mm", day: "hh" },
    nb: { year: "åååå", month: "mm", day: "dd" },
    nl: { year: "jjjj", month: "mm", day: "dd" },
    nn: { year: "åååå", month: "mm", day: "dd" },
    no: { year: "åååå", month: "mm", day: "dd" },
    oc: { year: "aaaa", month: "mm", day: "jj" },
    pl: { year: "rrrr", month: "mm", day: "dd" },
    pt: { year: "aaaa", month: "mm", day: "dd" },
    rm: { year: "oooo", month: "mm", day: "dd" },
    ro: { year: "aaaa", month: "ll", day: "zz" },
    ru: { year: "гггг", month: "мм", day: "дд" },
    sc: { year: "aaaa", month: "mm", day: "dd" },
    scn: { year: "aaaa", month: "mm", day: "jj" },
    sk: { year: "rrrr", month: "mm", day: "dd" },
    sl: { year: "llll", month: "mm", day: "dd" },
    sr: { year: "гггг", month: "мм", day: "дд" },
    "sr-Latn": { year: "gggg", month: "mm", day: "dd" },
    sv: { year: "åååå", month: "mm", day: "dd" },
    szl: { year: "rrrr", month: "mm", day: "dd" },
    tg: { year: "сссс", month: "мм", day: "рр" },
    th: { year: "ปปปป", month: "ดด", day: "วว" },
    tr: { year: "yyyy", month: "aa", day: "gg" },
    uk: { year: "рррр", month: "мм", day: "дд" },
    "zh-CN": { year: "年", month: "月", day: "日" },
    "zh-TW": { year: "年", month: "月", day: "日" },
  },
  "en",
);

const FIELD_STRINGS = new StringDictionary<FieldKey>({
  "en-US": {
    empty: "Empty",
    era: "era",
    year: "year",
    month: "month",
    day: "day",
    hour: "hour",
    minute: "minute",
    second: "second",
    dayPeriod: "AM/PM",
    timeZoneName: "time zone",
    rangeUnderflow: "The date is before the earliest one allowed.",
    rangeOverflow: "The date is after the latest one allowed.",
    unavailableDate: "The date is not available.",
  },
  "ar-AE": {
    empty: "فارغ",
    era: "العصر",
    year: "السنة",
    month: "الشهر",
    day: "يوم",
    hour: "الساعات",
    minute: "الدقائق",
    second: "الثواني",
    dayPeriod: "ص/م",
    timeZoneName: "التوقيت",
    rangeUnderflow: say("يجب أن تكون القيمة {minValue} أو بعد ذلك."),
    rangeOverflow: say("يجب أن تكون القيمة {maxValue} أو قبل ذلك."),
    unavailableDate: "البيانات المحددة غير متاحة.",
  },
  "bg-BG": {
    empty: "Изпразни",
    era: "ера",
    year: "година",
    month: "месец",
    day: "ден",
    hour: "час",
    minute: "минута",
    second: "секунда",
    dayPeriod: "пр.об./сл.об.",
    timeZoneName: "часова зона",
    rangeUnderflow: say("Стойността трябва да е {minValue} или по-късно."),
    rangeOverflow: say("Стойността трябва да е {maxValue} или по-ранна."),
    unavailableDate: "Избраната дата не е налична.",
  },
  "cs-CZ": {
    empty: "Prázdné",
    era: "letopočet",
    year: "rok",
    month: "měsíc",
    day: "den",
    hour: "hodina",
    minute: "minuta",
    second: "sekunda",
    dayPeriod: "část dne",
    timeZoneName: "časové pásmo",
    rangeUnderflow: say("Hodnota musí být {minValue} nebo pozdější."),
    rangeOverflow: say("Hodnota musí být {maxValue} nebo dřívější."),
    unavailableDate: "Vybrané datum není k dispozici.",
  },
  "da-DK": {
    empty: "Tom",
    era: "æra",
    year: "år",
    month: "måned",
    day: "dag",
    hour: "time",
    minute: "minut",
    second: "sekund",
    dayPeriod: "AM/PM",
    timeZoneName: "tidszone",
    rangeUnderflow: say("Værdien skal være {minValue} eller nyere."),
    rangeOverflow: say("Værdien skal være {maxValue} eller tidligere."),
    unavailableDate: "Den valgte dato er ikke tilgængelig.",
  },
  "de-DE": {
    empty: "Leer",
    era: "Epoche",
    year: "Jahr",
    month: "Monat",
    day: "Tag",
    hour: "Stunde",
    minute: "Minute",
    second: "Sekunde",
    dayPeriod: "Tageshälfte",
    timeZoneName: "Zeitzone",
    rangeUnderflow: say("Der Wert muss {minValue} oder später sein."),
    rangeOverflow: say("Der Wert muss {maxValue} oder früher sein."),
    unavailableDate: "Das ausgewählte Datum ist nicht verfügbar.",
  },
  "el-GR": {
    empty: "Άδειο",
    era: "περίοδος",
    year: "έτος",
    month: "μήνας",
    day: "ημέρα",
    hour: "ώρα",
    minute: "λεπτό",
    second: "δευτερόλεπτο",
    dayPeriod: "π.μ./μ.μ.",
    timeZoneName: "ζώνη ώρας",
    rangeUnderflow: say("Η τιμή πρέπει να είναι {minValue} ή μεταγενέστερη."),
    rangeOverflow: say("Η τιμή πρέπει να είναι {maxValue} ή παλαιότερη."),
    unavailableDate: "Η επιλεγμένη ημερομηνία δεν είναι διαθέσιμη.",
  },
  "es-ES": {
    empty: "Vacío",
    era: "era",
    year: "año",
    month: "mes",
    day: "día",
    hour: "hora",
    minute: "minuto",
    second: "segundo",
    dayPeriod: "a. m./p. m.",
    timeZoneName: "zona horaria",
    rangeUnderflow: say("El valor debe ser {minValue} o posterior."),
    rangeOverflow: say("El valor debe ser {maxValue} o anterior."),
    unavailableDate: "Fecha seleccionada no disponible.",
  },
  "et-EE": {
    empty: "Tühjenda",
    era: "ajastu",
    year: "aasta",
    month: "kuu",
    day: "päev",
    hour: "tund",
    minute: "minut",
    second: "sekund",
    dayPeriod: "enne/pärast lõunat",
    timeZoneName: "ajavöönd",
    rangeUnderflow: say("Väärtus peab olema {minValue} või hilisem."),
    rangeOverflow: say("Väärtus peab olema {maxValue} või varasem."),
    unavailableDate: "Valitud kuupäev pole saadaval.",
  },
  "fi-FI": {
    empty: "Tyhjä",
    era: "aikakausi",
    year: "vuosi",
    month: "kuukausi",
    day: "päivä",
    hour: "tunti",
    minute: "minuutti",
    second: "sekunti",
    dayPeriod: "vuorokaudenaika",
    timeZoneName: "aikavyöhyke",
    rangeUnderflow: say("Arvon on oltava {minValue} tai sitä myöhäisempi."),
    rangeOverflow: say("Arvon on oltava {maxValue} tai sitä aikaisempi."),
    unavailableDate: "Valittu päivämäärä ei ole käytettävissä.",
  },
  "fr-FR": {
    empty: "Vide",
    era: "ère",
    year: "année",
    month: "mois",
    day: "jour",
    hour: "heure",
    minute: "minute",
    second: "seconde",
    dayPeriod: "cadran",
    timeZoneName: "fuseau horaire",
    rangeUnderflow: say("La valeur doit être {minValue} ou ultérieure."),
    rangeOverflow: say("La valeur doit être {maxValue} ou antérieure."),
    unavailableDate: "La date sélectionnée n’est pas disponible.",
  },
  "he-IL": {
    empty: "ריק",
    era: "תקופה",
    year: "שנה",
    month: "חודש",
    day: "יום",
    hour: "שעה",
    minute: "דקה",
    second: "שנייה",
    dayPeriod: "לפנה״צ/אחה״צ",
    timeZoneName: "אזור זמן",
    rangeUnderflow: say("הערך חייב להיות {minValue} או מאוחר יותר."),
    rangeOverflow: say("הערך חייב להיות {maxValue} או מוקדם יותר."),
    unavailableDate: "התאריך הנבחר אינו זמין.",
  },
  "hr-HR": {
    empty: "Prazno",
    era: "era",
    year: "godina",
    month: "mjesec",
    day: "dan",
    hour: "sat",
    minute: "minuta",
    second: "sekunda",
    dayPeriod: "AM/PM",
    timeZoneName: "vremenska zona",
    rangeUnderflow: say("Vrijednost mora biti {minValue} ili kasnije."),
    rangeOverflow: say("Vrijednost mora biti {maxValue} ili ranije."),
    unavailableDate: "Odabrani datum nije dostupan.",
  },
  "hu-HU": {
    empty: "Üres",
    era: "éra",
    year: "év",
    month: "hónap",
    day: "nap",
    hour: "óra",
    minute: "perc",
    second: "másodperc",
    dayPeriod: "napszak",
    timeZoneName: "időzóna",
    rangeUnderflow: say("Az értéknek {minValue} vagy későbbinek kell lennie."),
    rangeOverflow: say("Az értéknek {maxValue} vagy korábbinak kell lennie."),
    unavailableDate: "A kiválasztott dátum nem érhető el.",
  },
  "it-IT": {
    empty: "Vuoto",
    era: "era",
    year: "anno",
    month: "mese",
    day: "giorno",
    hour: "ora",
    minute: "minuto",
    second: "secondo",
    dayPeriod: "AM/PM",
    timeZoneName: "fuso orario",
    rangeUnderflow: say("Il valore deve essere {minValue} o successivo."),
    rangeOverflow: say("Il valore deve essere {maxValue} o precedente."),
    unavailableDate: "Data selezionata non disponibile.",
  },
  "ja-JP": {
    empty: "空",
    era: "時代",
    year: "年",
    month: "月",
    day: "日",
    hour: "時",
    minute: "分",
    second: "秒",
    dayPeriod: "午前/午後",
    timeZoneName: "タイムゾーン",
    rangeUnderflow: say("値は {minValue} 以上にする必要があります。"),
    rangeOverflow: say("値は {maxValue} 以下にする必要があります。"),
    unavailableDate: "選択した日付は使用できません。",
  },
  "ko-KR": {
    empty: "비어 있음",
    era: "연호",
    year: "년",
    month: "월",
    day: "일",
    hour: "시",
    minute: "분",
    second: "초",
    dayPeriod: "오전/오후",
    timeZoneName: "시간대",
    rangeUnderflow: say("값은 {minValue} 이후여야 합니다."),
    rangeOverflow: say("값은 {maxValue} 이전이어야 합니다."),
    unavailableDate: "선택한 날짜를 사용할 수 없습니다.",
  },
  "lt-LT": {
    empty: "Tuščias",
    era: "era",
    year: "metai",
    month: "mėnuo",
    day: "diena",
    hour: "valanda",
    minute: "minutė",
    second: "sekundė",
    dayPeriod: "iki pietų / po pietų",
    timeZoneName: "laiko juosta",
    rangeUnderflow: say("Reikšmė turi būti {minValue} arba naujesnė."),
    rangeOverflow: say("Reikšmė turi būti {maxValue} arba ankstesnė."),
    unavailableDate: "Pasirinkta data nepasiekiama.",
  },
  "lv-LV": {
    empty: "Tukšs",
    era: "ēra",
    year: "gads",
    month: "mēnesis",
    day: "diena",
    hour: "stundas",
    minute: "minūtes",
    second: "sekundes",
    dayPeriod: "priekšpusdienā/pēcpusdienā",
    timeZoneName: "laika josla",
    rangeUnderflow: say("Vērtībai ir jābūt {minValue} vai vēlākai."),
    rangeOverflow: say("Vērtībai ir jābūt {maxValue} vai agrākai."),
    unavailableDate: "Atlasītais datums nav pieejams.",
  },
  "nb-NO": {
    empty: "Tom",
    era: "tidsalder",
    year: "år",
    month: "måned",
    day: "dag",
    hour: "time",
    minute: "minutt",
    second: "sekund",
    dayPeriod: "a.m./p.m.",
    timeZoneName: "tidssone",
    rangeUnderflow: say("Verdien må være {minValue} eller senere."),
    rangeOverflow: say("Verdien må være {maxValue} eller tidligere."),
    unavailableDate: "Valgt dato utilgjengelig.",
  },
  "nl-NL": {
    empty: "Leeg",
    era: "tijdperk",
    year: "jaar",
    month: "maand",
    day: "dag",
    hour: "uur",
    minute: "minuut",
    second: "seconde",
    dayPeriod: "a.m./p.m.",
    timeZoneName: "tijdzone",
    rangeUnderflow: say("Waarde moet {minValue} of later zijn."),
    rangeOverflow: say("Waarde moet {maxValue} of eerder zijn."),
    unavailableDate: "Geselecteerde datum niet beschikbaar.",
  },
  "pl-PL": {
    empty: "Pusty",
    era: "era",
    year: "rok",
    month: "miesiąc",
    day: "dzień",
    hour: "godzina",
    minute: "minuta",
    second: "sekunda",
    dayPeriod: "rano / po południu / wieczorem",
    timeZoneName: "strefa czasowa",
    rangeUnderflow: say("Wartość musi mieć wartość {minValue} lub późniejszą."),
    rangeOverflow: say("Wartość musi mieć wartość {maxValue} lub wcześniejszą."),
    unavailableDate: "Wybrana data jest niedostępna.",
  },
  "pt-BR": {
    empty: "Vazio",
    era: "era",
    year: "ano",
    month: "mês",
    day: "dia",
    hour: "hora",
    minute: "minuto",
    second: "segundo",
    dayPeriod: "AM/PM",
    timeZoneName: "fuso horário",
    rangeUnderflow: say("O valor deve ser {minValue} ou posterior."),
    rangeOverflow: say("O valor deve ser {maxValue} ou anterior."),
    unavailableDate: "Data selecionada indisponível.",
  },
  "pt-PT": {
    empty: "Vazio",
    era: "era",
    year: "ano",
    month: "mês",
    day: "dia",
    hour: "hora",
    minute: "minuto",
    second: "segundo",
    dayPeriod: "am/pm",
    timeZoneName: "fuso horário",
    rangeUnderflow: say("O valor tem de ser {minValue} ou posterior."),
    rangeOverflow: say("O valor tem de ser {maxValue} ou anterior."),
    unavailableDate: "Data selecionada indisponível.",
  },
  "ro-RO": {
    empty: "Gol",
    era: "eră",
    year: "an",
    month: "lună",
    day: "zi",
    hour: "oră",
    minute: "minut",
    second: "secundă",
    dayPeriod: "a.m/p.m.",
    timeZoneName: "fus orar",
    rangeUnderflow: say("Valoarea trebuie să fie {minValue} sau ulterioară."),
    rangeOverflow: say("Valoarea trebuie să fie {maxValue} sau anterioară."),
    unavailableDate: "Data selectată nu este disponibilă.",
  },
  "ru-RU": {
    empty: "Не заполнено",
    era: "эра",
    year: "год",
    month: "месяц",
    day: "день",
    hour: "час",
    minute: "минута",
    second: "секунда",
    dayPeriod: "AM/PM",
    timeZoneName: "часовой пояс",
    rangeUnderflow: say("Значение должно быть не раньше {minValue}."),
    rangeOverflow: say("Значение должно быть не позже {maxValue}."),
    unavailableDate: "Выбранная дата недоступна.",
  },
  "sk-SK": {
    empty: "Prázdne",
    era: "letopočet",
    year: "rok",
    month: "mesiac",
    day: "deň",
    hour: "hodina",
    minute: "minúta",
    second: "sekunda",
    dayPeriod: "AM/PM",
    timeZoneName: "časové pásmo",
    rangeUnderflow: say("Hodnota musí byť {minValue} alebo neskoršia."),
    rangeOverflow: say("Hodnota musí byť {maxValue} alebo skoršia."),
    unavailableDate: "Vybratý dátum je nedostupný.",
  },
  "sl-SI": {
    empty: "Prazen",
    era: "doba",
    year: "leto",
    month: "mesec",
    day: "dan",
    hour: "ura",
    minute: "minuta",
    second: "sekunda",
    dayPeriod: "dop/pop",
    timeZoneName: "časovni pas",
    rangeUnderflow: say("Vrednost mora biti {minValue} ali novejša."),
    rangeOverflow: say("Vrednost mora biti {maxValue} ali starejša."),
    unavailableDate: "Izbrani datum ni na voljo.",
  },
  "sr-SP": {
    empty: "Prazno",
    era: "ера",
    year: "година",
    month: "месец",
    day: "дан",
    hour: "сат",
    minute: "минут",
    second: "секунд",
    dayPeriod: "пре подне/по подне",
    timeZoneName: "временска зона",
    rangeUnderflow: say("Vrednost mora da bude {minValue} ili novija."),
    rangeOverflow: say("Vrednost mora da bude {maxValue} ili starija."),
    unavailableDate: "Izabrani datum nije dostupan.",
  },
  "sv-SE": {
    empty: "Tomt",
    era: "era",
    year: "år",
    month: "månad",
    day: "dag",
    hour: "timme",
    minute: "minut",
    second: "sekund",
    dayPeriod: "fm/em",
    timeZoneName: "tidszon",
    rangeUnderflow: say("Värdet måste vara {minValue} eller senare."),
    rangeOverflow: say("Värdet måste vara {maxValue} eller tidigare."),
    unavailableDate: "Det valda datumet är inte tillgängligt.",
  },
  "tr-TR": {
    empty: "Boş",
    era: "çağ",
    year: "yıl",
    month: "ay",
    day: "gün",
    hour: "saat",
    minute: "dakika",
    second: "saniye",
    dayPeriod: "ÖÖ/ÖS",
    timeZoneName: "saat dilimi",
    rangeUnderflow: say("Değer, {minValue} veya sonrası olmalıdır."),
    rangeOverflow: say("Değer, {maxValue} veya öncesi olmalıdır."),
    unavailableDate: "Seçilen tarih kullanılamıyor.",
  },
  "uk-UA": {
    empty: "Пусто",
    era: "ера",
    year: "рік",
    month: "місяць",
    day: "день",
    hour: "година",
    minute: "хвилина",
    second: "секунда",
    dayPeriod: "дп/пп",
    timeZoneName: "часовий пояс",
    rangeUnderflow: say("Значення має бути не раніше {minValue}."),
    rangeOverflow: say("Значення має бути не пізніше {maxValue}."),
    unavailableDate: "Вибрана дата недоступна.",
  },
  "zh-CN": {
    empty: "空",
    era: "纪元",
    year: "年",
    month: "月",
    day: "日",
    hour: "小时",
    minute: "分钟",
    second: "秒",
    dayPeriod: "上午/下午",
    timeZoneName: "时区",
    rangeUnderflow: say("值必须是 {minValue} 或更晚日期。"),
    rangeOverflow: say("值必须是 {maxValue} 或更早日期。"),
    unavailableDate: "所选日期不可用。",
  },
  "zh-TW": {
    empty: "空白",
    era: "纪元",
    year: "年",
    month: "月",
    day: "日",
    hour: "小时",
    minute: "分钟",
    second: "秒",
    dayPeriod: "上午/下午",
    timeZoneName: "时区",
    rangeUnderflow: say("值必須是 {minValue} 或更晚。"),
    rangeOverflow: say("值必須是 {maxValue} 或更早。"),
    unavailableDate: "所選日期無法使用。",
  },
});
