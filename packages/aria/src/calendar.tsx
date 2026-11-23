/**
 * A calendar: a month of days, one of which may be chosen.
 *
 * The grid is a real `role="grid"` of `columnheader`s and `gridcell`s, because
 * the relationship between a day and its weekday column is what a screen
 * reader reads out. Inside it, focus is a ROVING one: exactly one day is in
 * the Tab order, and the arrows move it — a month of 31 separate Tab stops is
 * the failure mode this pattern exists to avoid.
 *
 * The details that make it usable rather than merely correct:
 *
 * - **A day outside the visible month is not focusable.** It is rendered so
 *   the grid stays rectangular, and it is `aria-hidden`: Down from the last
 *   week should reach the next MONTH, not a greyed-out duplicate of a day the
 *   next grid also shows.
 * - **Moving past the edge turns the page.** Right from the last day of the
 *   month shows the next month with its first day focused, so the arrows alone
 *   navigate the whole calendar.
 * - **Disabled and unavailable are different.** A disabled day cannot be
 *   reached at all; an unavailable one is focusable and announced, because
 *   "the 14th is booked" is information and a day you cannot land on tells
 *   you nothing.
 * - **Every cell is labelled with its full date.** "14" means nothing read out
 *   of context; "Thursday, 14 March 2024, selected" is the whole cell.
 * - **Several months are one calendar.** Each is a grid of its own, named for
 *   its month, and the roving focus is shared between them: one Tab stop, and
 *   an arrow off the end of one month lands in the next without the months
 *   changing places. A day drawn in two grids is the day in one of them only.
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
  Repeat,
  createSignal,
  onSettled,
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { button } from "./button.tsx";
import {
  type Calendar as CalendarSystem,
  CalendarDate,
  type CalendarIdentifier,
  createCalendar,
  type DateDuration,
  type DateValue,
  type DayOfWeek,
  endOfMonth,
  endOfWeek,
  getDayOfWeek,
  getISOWeek,
  getLocalTimeZone,
  getWeekOfYear,
  getWeeksInMonth,
  GregorianCalendar,
  isEqualCalendar,
  isSameDay,
  isSameMonth,
  type MappedDateValue,
  startOfMonth,
  startOfWeek,
  toCalendar,
  toCalendarDate,
  today,
} from "./date.ts";
import { activeElement, contains, ownerDocument } from "./dom.ts";
import { focusRing } from "./focus.ts";
import {
  dateFormatter,
  listFormatter,
  type Locale,
  type LocalizedString,
  StringDictionary,
  stringFormatter,
  useLocale,
} from "./i18n.ts";
import { focusSafely } from "./interactions/focusable.ts";
import { hover } from "./interactions/hover.ts";
import type { ElementRef } from "./interactions/press.ts";
import { announce } from "./live.ts";
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
// State
// ---------------------------------------------------------------------------

/**
 * Two ends and everything between them.
 *
 * Inside a calendar the ends are days in the calendar it draws; what a caller
 * hands in and gets back is any kind of date value, and keeps its kind.
 */
export interface DateRange<T extends DateValue = CalendarDate> {
  start: T;
  end: T;
}

/**
 * What a day is tested against to decide whether it is switched off, booked or
 * otherwise marked.
 *
 * - a day, or a list of days;
 * - a range, both ends included, as `{ from, to }` or `{ start, end }`;
 * - `{ before }` and `{ after }`, neither including the day they name; given
 *   together they are the days strictly between, or the days outside when
 *   `after` is the later of the two;
 * - `{ dayOfWeek }`, Sunday as 0;
 * - a function, a plain yes or no, or a list of any of these.
 */
export type DateMatcher =
  | boolean
  | CalendarDate
  | ((date: CalendarDate) => boolean)
  | DateRange
  | { from: CalendarDate | null | undefined; to?: CalendarDate | null }
  | { before: CalendarDate; after?: CalendarDate }
  | { after: CalendarDate; before?: CalendarDate }
  | { dayOfWeek: number | readonly number[] }
  | readonly DateMatcher[];

export function dateMatches(date: CalendarDate, matcher: DateMatcher | undefined): boolean {
  if (matcher === undefined) return false;
  if (typeof matcher === "boolean") return matcher;
  if (typeof matcher === "function") return matcher(date);
  if (matcher instanceof CalendarDate) return isSameDay(date, matcher);
  if (Array.isArray(matcher)) return matcher.some((one: DateMatcher) => dateMatches(date, one));

  if ("dayOfWeek" in matcher) {
    const days = typeof matcher.dayOfWeek === "number" ? [matcher.dayOfWeek] : matcher.dayOfWeek;
    return days.includes(getDayOfWeek(date, "en-US", "sun"));
  }
  if ("start" in matcher) {
    return date.compare(matcher.start) >= 0 && date.compare(matcher.end) <= 0;
  }
  if ("from" in matcher) {
    const from = matcher.from;
    if (from === null || from === undefined) return false;
    const to = matcher.to ?? from;
    return date.compare(from) >= 0 && date.compare(to) <= 0;
  }

  const { before, after } = matcher as { before?: CalendarDate; after?: CalendarDate };
  if (before !== undefined && after !== undefined) {
    return after.compare(before) < 0
      ? date.compare(after) > 0 && date.compare(before) < 0
      : date.compare(before) < 0 || date.compare(after) > 0;
  }
  if (before !== undefined) return date.compare(before) < 0;
  return after !== undefined && date.compare(after) > 0;
}

export interface CalendarStateOptions<T extends DateValue = CalendarDate> {
  /**
   * The chosen day. Any kind of date value: one with a time keeps its time
   * when another day is chosen, and one in another calendar is answered in
   * that calendar, whatever calendar the grid is drawn in.
   */
  value?: MaybeAccessor<T | null | undefined>;
  defaultValue?: MaybeAccessor<T | null | undefined>;
  focusedValue?: MaybeAccessor<DateValue | null | undefined>;
  defaultFocusedValue?: MaybeAccessor<DateValue | null | undefined>;
  minValue?: MaybeAccessor<DateValue | null | undefined>;
  maxValue?: MaybeAccessor<DateValue | null | undefined>;
  /** Days that exist but cannot be chosen: booked, closed, sold out. */
  isDateUnavailable?: (date: CalendarDate) => boolean;
  /**
   * Days that are switched off, beyond the two bounds.
   *
   * Unlike an unavailable day these are not information: they cannot be
   * chosen, and the arrow keys step over them.
   */
  isDateDisabled?: (date: CalendarDate) => boolean;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  autoFocus?: MaybeAccessor<boolean | undefined>;
  /** Pressing the chosen day again clears it. @default false */
  allowsDeselection?: MaybeAccessor<boolean | undefined>;
  /** Which day starts the week. Defaults to what the locale says. */
  firstDayOfWeek?: MaybeAccessor<DayOfWeek | undefined>;
  /**
   * Builds the calendar system the grid is drawn in, from the identifier the
   * locale names: `ja-JP-u-ca-japanese` asks for `"japanese"`. Passing one
   * that knows only some systems keeps the others out of a bundle.
   * @default createCalendar
   */
  createCalendar?: (identifier: CalendarIdentifier) => CalendarSystem;
  /** How many months are on show side by side. @default 1 */
  visibleMonths?: MaybeAccessor<number | undefined>;
  /** Turn every month on show at once, rather than sliding by one. @default false */
  pagedNavigation?: MaybeAccessor<boolean | undefined>;
  /**
   * The first month on show, when its owner keeps it.
   *
   * Then the focused day follows the month instead of the month following the
   * focused day, and a move that would turn the page only asks for it through
   * `onVisibleMonthChange`.
   */
  visibleMonth?: MaybeAccessor<DateValue | null | undefined>;
  onVisibleMonthChange?: (month: CalendarDate) => void;
  /** The first and last month that can be paged to. Their days stay open. */
  startMonth?: MaybeAccessor<DateValue | null | undefined>;
  endMonth?: MaybeAccessor<DateValue | null | undefined>;
  /** Which day counts as today. Defaults to today in `timeZone`. */
  today?: MaybeAccessor<DateValue | undefined>;
  /**
   * The IANA zone today is reckoned in and days are formatted in. Defaults to
   * the zone of a zoned value, and otherwise to the local one.
   */
  timeZone?: MaybeAccessor<string | undefined>;
  /** Said by the caller, whatever the value is. */
  isInvalid?: MaybeAccessor<boolean | undefined>;
  /**
   * Where the chosen day, or today, sits among several months when the
   * calendar first shows. @default "center"
   */
  selectionAlignment?: MaybeAccessor<"start" | "center" | "end" | undefined>;
  /** Every month drawn with this many week rows, however many it needs. */
  weeksInMonth?: MaybeAccessor<number | undefined>;
  onChange?: (value: NoInfer<MappedDateValue<T>> | null) => void;
  onFocusChange?: (date: CalendarDate) => void;
}

export interface CalendarState {
  readonly selectionMode: "single";
  /** The chosen day, in the calendar the grid is drawn in. */
  value: Accessor<CalendarDate | null>;
  setValue(value: CalendarDate | null): void;
  focusedDate: Accessor<CalendarDate>;
  setFocusedDate(date: CalendarDate): void;
  /** The months on show, as the first day of the first and the last of the last. */
  visibleRange: Accessor<DateRange>;
  visibleMonths: Accessor<number>;
  today: Accessor<CalendarDate>;
  /** The zone days are reckoned and formatted in. */
  timeZone: Accessor<string>;
  /** The bounds, as days in the calendar the grid is drawn in. */
  minValue: Accessor<CalendarDate | null>;
  maxValue: Accessor<CalendarDate | null>;
  /** The first and last month that can be paged to, as their first days. */
  startMonth: Accessor<CalendarDate | null>;
  endMonth: Accessor<CalendarDate | null>;
  /** Put a month on show, `position` months in from the first one. */
  showMonth(month: DateValue, position?: number): void;
  isFocused: Accessor<boolean>;
  setFocused(isFocused: boolean): void;
  /** The day the caller said starts the week, or undefined for the locale's. */
  firstDayOfWeek: Accessor<DayOfWeek | undefined>;
  isDisabled: Accessor<boolean>;
  isReadOnly: Accessor<boolean>;
  /**
   * The value is one the calendar would not offer, or the caller said it is
   * wrong: the chosen days say so, and point at the error message.
   */
  isValueInvalid: Accessor<boolean>;
  /** The week rows every month is drawn with, when the caller fixed them. */
  weeksInMonth: Accessor<number | undefined>;
  isSelected(date: CalendarDate): boolean;
  isCellFocused(date: CalendarDate): boolean;
  isCellDisabled(date: CalendarDate): boolean;
  isCellUnavailable(date: CalendarDate): boolean;
  isPreviousVisibleRangeInvalid(): boolean;
  isNextVisibleRangeInvalid(): boolean;
  focusPreviousDay(): void;
  focusNextDay(): void;
  focusPreviousRow(): void;
  focusNextRow(): void;
  focusPreviousSection(larger?: boolean): void;
  focusNextSection(larger?: boolean): void;
  focusSectionStart(): void;
  focusSectionEnd(): void;
  selectDate(date: CalendarDate): void;
  selectFocusedDate(): void;
  /** Show the month before or after the one on show. */
  focusPreviousPage(): void;
  focusNextPage(): void;
}

/** A month a page button or a caption asked for. Compared by identity. */
interface PageRequest {
  start: CalendarDate;
}

function unavailable(
  options: Pick<CalendarStateOptions, "isDateUnavailable">,
  date: CalendarDate,
): boolean {
  return options.isDateUnavailable?.(date) === true;
}

/**
 * The calendar system the grid is drawn in: the one the locale names, built
 * by the caller's factory.
 */
function displayCalendar(
  locale: Accessor<Locale>,
  factory: ((identifier: CalendarIdentifier) => CalendarSystem) | undefined,
): Accessor<CalendarSystem> {
  const system = dateFormatter(undefined, locale);
  return createMemo(
    () => (factory ?? createCalendar)(system().resolvedOptions().calendar as CalendarIdentifier),
    { equals: isEqualCalendar },
  );
}

/** A value read as a day in the calendar the grid is drawn in. */
function inCalendar(value: DateValue, system: CalendarSystem): CalendarDate {
  return toCalendar(toCalendarDate(value), system);
}

/**
 * A day chosen in the grid, as the kind of value the caller gave.
 *
 * The calendar the grid is drawn in has no say in what is reported: a value
 * given in the Gregorian calendar is answered in it, and a value with a time,
 * or a zone, keeps both.
 */
function asValueOf(date: CalendarDate, was: DateValue | null | undefined): DateValue {
  const day = toCalendar(date, was?.calendar ?? new GregorianCalendar());
  if (was === null || was === undefined || !("hour" in was)) return day;
  return was.set({ era: day.era, year: day.year, month: day.month, day: day.day });
}

/** A day held between two bounds, in its own calendar. */
function constrainValue(
  date: CalendarDate,
  minValue: DateValue | null | undefined,
  maxValue: DateValue | null | undefined,
): CalendarDate {
  if (minValue !== null && minValue !== undefined && date.compare(minValue) < 0) {
    return inCalendar(minValue, date.calendar);
  }
  if (maxValue !== null && maxValue !== undefined && date.compare(maxValue) > 0) {
    return inCalendar(maxValue, date.calendar);
  }
  return date;
}

/**
 * How many months apart two months are.
 *
 * Counted by stepping, because neither twelve months a year nor one year
 * number per era holds: a Hebrew leap year has thirteen, and a Japanese year
 * can begin in May.
 */
function monthsBetween(from: CalendarDate, to: CalendarDate): number {
  let month = startOfMonth(from);
  const target = startOfMonth(to);
  const step = target.compare(month) >= 0 ? 1 : -1;
  let count = 0;
  while (!isSameMonth(month, target)) {
    const next = month.add({ months: step });
    // The end of the calendar system, where adding stops moving.
    if (isSameMonth(next, month)) break;
    month = next;
    count += step;
  }
  return count;
}

export function calendarState<T extends DateValue = CalendarDate>(
  options: CalendarStateOptions<T>,
): CalendarState {
  const locale = useLocale();
  const system = displayCalendar(locale, options.createCalendar);
  const shown = (date: DateValue): CalendarDate => inCalendar(date, system());

  const [given, setGiven] = controllable<DateValue | null>(
    () => access(options.value),
    () => access(options.defaultValue) ?? null,
    (next) => options.onChange?.(next as MappedDateValue<T> | null),
  );

  const value = (): CalendarDate | null => {
    const current = given();
    return current === null ? null : shown(current);
  };

  const firstDayOfWeek = (): DayOfWeek | undefined => access(options.firstDayOfWeek);

  const timeZone = (): string => {
    const zone = access(options.timeZone);
    if (zone !== undefined) return zone;
    const current = given();
    return current !== null && "timeZone" in current ? current.timeZone : getLocalTimeZone();
  };

  const todayDate = (): CalendarDate => shown(access(options.today) ?? today(timeZone()));
  const visibleMonths = (): number => Math.max(1, Math.floor(access(options.visibleMonths) ?? 1));

  const bound = (
    date: MaybeAccessor<DateValue | null | undefined> | undefined,
  ): CalendarDate | null => {
    const read = access(date);
    return read === null || read === undefined ? null : shown(read);
  };
  const minValue = (): CalendarDate | null => bound(options.minValue);
  const maxValue = (): CalendarDate | null => bound(options.maxValue);
  const startMonth = (): CalendarDate | null => {
    const first = bound(options.startMonth);
    return first === null ? null : startOfMonth(first);
  };
  const endMonth = (): CalendarDate | null => {
    const last = bound(options.endMonth);
    return last === null ? null : startOfMonth(last);
  };

  const constrained = (date: CalendarDate): CalendarDate =>
    constrainValue(date, minValue(), maxValue());

  const [focusedAsSet, setFocusedDateRaw] = controllable<CalendarDate>(
    () => {
      const focused = access(options.focusedValue);
      return focused === null || focused === undefined ? undefined : shown(focused);
    },
    () => constrained(shown(access(options.defaultFocusedValue) ?? value() ?? todayDate())),
    options.onFocusChange,
  );
  // An uncontrolled focus was stored in the calendar of its day; the locale
  // may have named another since.
  const rawFocusedDate = (): CalendarDate => shown(focusedAsSet());

  const [isFocused, setIsFocused] = createSignal(access(options.autoFocus) === true);

  const isDisabled = (): boolean => access(options.isDisabled) === true;
  const isReadOnly = (): boolean => access(options.isReadOnly) === true;

  const [requested, setRequested] = createSignal<PageRequest | null>(null);

  /** A first month kept inside the months that can be reached. */
  const bounded = (start: CalendarDate): CalendarDate => {
    const first = startMonth();
    const last = endMonth();
    let next = start;
    if (last !== null) {
      const latest = last.subtract({ months: visibleMonths() - 1 });
      if (next.compare(latest) > 0) next = latest;
    }
    if (first !== null && next.compare(first) < 0) next = first;
    return next;
  };

  /** A first month moved just far enough for the window to hold a day. */
  const holding = (start: CalendarDate, date: CalendarDate): CalendarDate => {
    const month = startOfMonth(date);
    if (month.compare(start) < 0) return month;
    const last = start.add({ months: visibleMonths() - 1 });
    return month.compare(last) > 0 ? month.subtract({ months: visibleMonths() - 1 }) : start;
  };

  /**
   * The first month on show when the calendar is built, placed so the focused
   * day sits where `selectionAlignment` asks and no month beyond the bounds is
   * shown to make room for it.
   */
  const aligned = (focused: CalendarDate): CalendarDate => {
    const count = visibleMonths();
    const month = startOfMonth(focused);
    let before: number;
    switch (access(options.selectionAlignment) ?? "center") {
      case "start":
        before = 0;
        break;
      case "end":
        before = count - 1;
        break;
      default: {
        const half = Math.floor(count / 2);
        before = half > 0 && count % 2 === 0 ? half - 1 : half;
      }
    }
    let start = month.subtract({ months: before });
    const max = maxValue();
    if (max !== null && focused.compare(max) <= 0) {
      const latest = startOfMonth(max).subtract({ months: count - 1 });
      if (start.compare(latest) > 0) start = latest;
    }
    const min = minValue();
    if (min !== null && focused.compare(min) >= 0) {
      const earliest = startOfMonth(min);
      if (start.compare(earliest) < 0) start = earliest;
    }
    return start;
  };

  // Where the window begins. It stays where it was until the focused day leaves
  // it or a page is asked for, which is what lets focus cross from one visible
  // month into the next without the months changing places under it.
  const firstMonth = createMemo<{ start: CalendarDate; request: PageRequest | null }>(
    (previous) => {
      const request = requested();
      const kept = access(options.visibleMonth);
      if (kept !== undefined && kept !== null) {
        return { start: startOfMonth(shown(kept)), request };
      }

      const focused = rawFocusedDate();
      let from = aligned(focused);
      if (previous !== undefined) {
        from = shown(
          request !== null && request !== previous.request ? request.start : previous.start,
        );
      }
      return { start: bounded(holding(from, focused)), request };
    },
  );

  // The month on show, and it changes when the MONTH does.
  //
  // Written as a plain function reading `focusedDate()`, every consumer of it
  // depended on the focused DAY: an arrow key re-ran `weekDates`, which hands
  // `<For>` seven new `CalendarDate` objects a row, so all forty-two cells were
  // destroyed and built again — and the one holding focus went with them. A
  // real browser then leaves focus on `<body>`, which happy-dom does not, so no
  // test saw it.
  const visibleRange = createMemo<DateRange>(
    () => {
      const start = firstMonth().start;
      return { start, end: endOfMonth(start.add({ months: visibleMonths() - 1 })) };
    },
    { equals: (a, b) => isSameDay(a.start, b.start) && isSameDay(a.end, b.end) },
  );

  // Held to the months on show. The two only part when the window is kept by
  // its owner or stopped at a bound, and a focused day nobody can see is a
  // grid with no Tab stop.
  const focusedDate = (): CalendarDate => {
    const raw = rawFocusedDate();
    const range = visibleRange();
    if (raw.compare(range.start) < 0) return range.start;
    return raw.compare(range.end) > 0 ? range.end : raw;
  };

  const isCellDisabled = (date: CalendarDate): boolean => {
    if (isDisabled()) return true;
    const min = minValue();
    const max = maxValue();
    if (min !== null && date.compare(min) < 0) return true;
    if (max !== null && date.compare(max) > 0) return true;
    return options.isDateDisabled?.(date) === true;
  };

  const isCellUnavailable = (date: CalendarDate): boolean => unavailable(options, date);

  /** Focus, held inside the allowed range rather than refused at its edge. */
  const setFocusedDate = (date: CalendarDate): void => {
    const next = constrained(shown(date));
    const current = untrack(visibleRange).start;
    const start = bounded(holding(current, next));
    setFocusedDateRaw(next);
    if (!isSameDay(start, current)) options.onVisibleMonthChange?.(start);
  };

  /** The window moved to begin at a month, and the focused day carried with it. */
  const showFrom = (month: CalendarDate): void => {
    const current = untrack(visibleRange).start;
    const start = bounded(shown(month));
    if (isSameDay(start, current)) return;
    const months = monthsBetween(current, start);
    setRequested({ start });
    setFocusedDateRaw(constrained(untrack(focusedDate).add({ months })));
    options.onVisibleMonthChange?.(start);
  };

  const page = (direction: 1 | -1): void => {
    const months = access(options.pagedNavigation) === true ? visibleMonths() : 1;
    showFrom(untrack(visibleRange).start.add({ months: months * direction }));
  };

  /**
   * `date`, or the nearest day further that way that is not switched off.
   *
   * Null when there is none within a year, or the bounds are reached first:
   * the focus then stays where it is rather than resting on a day that cannot
   * be chosen.
   */
  const reachable = (date: CalendarDate, step: DateDuration): CalendarDate | null => {
    const off = options.isDateDisabled;
    let next = constrained(date);
    if (off === undefined) return next;
    for (let tries = 0; off(next); tries++) {
      const further = constrained(next.add(step));
      if (tries === 366 || isSameDay(further, next)) return null;
      next = further;
    }
    return next;
  };

  const land = (date: CalendarDate, step: DateDuration): void => {
    const next = reachable(date, step);
    if (next !== null) setFocusedDate(next);
  };

  const move = (duration: DateDuration): void => land(focusedDate().add(duration), duration);

  /** A day the calendar would not let anyone choose, for whatever reason. */
  const isRefused = (date: CalendarDate): boolean => {
    const min = minValue();
    const max = maxValue();
    if (min !== null && date.compare(min) < 0) return true;
    if (max !== null && date.compare(max) > 0) return true;
    return isCellUnavailable(date) || options.isDateDisabled?.(date) === true;
  };

  const setValue = (next: CalendarDate | null): void => {
    setGiven(next === null ? null : asValueOf(next, untrack(given)));
  };

  const selectDate = (date: CalendarDate): void => {
    if (isReadOnly() || isDisabled()) return;
    if (isCellDisabled(date) || isCellUnavailable(date)) return;
    const chosen = untrack(value);
    if (access(options.allowsDeselection) === true && chosen !== null && isSameDay(chosen, date)) {
      setValue(null);
      return;
    }
    setValue(date);
  };

  return {
    selectionMode: "single",
    value,
    setValue,
    focusedDate,
    setFocusedDate,
    visibleRange,
    visibleMonths,
    today: todayDate,
    timeZone,
    minValue,
    maxValue,
    startMonth,
    endMonth,
    showMonth: (month, position = 0) =>
      showFrom(startOfMonth(shown(month)).subtract({ months: position })),
    isFocused,
    setFocused: (next) => setIsFocused(next),
    firstDayOfWeek,
    isDisabled,
    isReadOnly,
    isValueInvalid: () => {
      if (access(options.isInvalid) === true) return true;
      const selected = value();
      return selected !== null && isRefused(selected);
    },
    weeksInMonth: () => access(options.weeksInMonth),
    isSelected: (date) => {
      const selected = value();
      return selected !== null && isSameDay(selected, date);
    },
    isCellFocused: (date) => isFocused() && isSameDay(focusedDate(), date),
    isCellDisabled,
    isCellUnavailable,
    isPreviousVisibleRangeInvalid: () => {
      const first = startMonth();
      if (first !== null && visibleRange().start.compare(first) <= 0) return true;
      const start = visibleRange().start;
      const before = start.subtract({ days: 1 });
      // Subtracting stops moving at the beginning of the calendar system.
      if (isSameDay(before, start)) return true;
      const min = minValue();
      return min !== null && before.compare(min) < 0;
    },
    isNextVisibleRangeInvalid: () => {
      const last = endMonth();
      if (last !== null && visibleRange().end.compare(endOfMonth(last)) >= 0) return true;
      const end = visibleRange().end;
      const after = end.add({ days: 1 });
      if (isSameDay(after, end)) return true;
      const max = maxValue();
      return max !== null && after.compare(max) > 0;
    },
    focusPreviousDay: () => move({ days: -1 }),
    focusNextDay: () => move({ days: 1 }),
    focusPreviousRow: () => move({ weeks: -1 }),
    focusNextRow: () => move({ weeks: 1 }),
    focusPreviousSection: (larger) => move(larger === true ? { years: -1 } : { months: -1 }),
    focusNextSection: (larger) => move(larger === true ? { years: 1 } : { months: 1 }),
    focusSectionStart: () =>
      land(startOfWeek(focusedDate(), locale().locale, firstDayOfWeek()), { days: 1 }),
    focusSectionEnd: () =>
      land(endOfWeek(focusedDate(), locale().locale, firstDayOfWeek()), { days: -1 }),
    selectDate,
    selectFocusedDate: () => selectDate(focusedDate()),
    focusPreviousPage: () => page(-1),
    focusNextPage: () => page(1),
  };
}

// ---------------------------------------------------------------------------
// A range of days
// ---------------------------------------------------------------------------

export interface RangeCalendarStateOptions<T extends DateValue = CalendarDate> extends Omit<
  CalendarStateOptions<T>,
  "value" | "defaultValue" | "onChange" | "isDateUnavailable"
> {
  value?: MaybeAccessor<DateRange<T> | null | undefined>;
  /**
   * Days that exist but cannot be chosen. The second argument is the day the
   * range being drawn began on, or null, so what is available can depend on
   * it: a stay of at most a week from wherever it starts.
   */
  isDateUnavailable?: (date: CalendarDate, anchorDate: CalendarDate | null) => boolean;
  defaultValue?: MaybeAccessor<DateRange<T> | null | undefined>;
  /** Nothing between the ends may be unavailable. @default false */
  allowsNonContiguousRanges?: MaybeAccessor<boolean | undefined>;
  /** The fewest and the most days a range may cover, both ends counted. */
  minDays?: MaybeAccessor<number | undefined>;
  maxDays?: MaybeAccessor<number | undefined>;
  /** A switched-off day between the ends breaks the range. @default false */
  excludeDisabled?: MaybeAccessor<boolean | undefined>;
  onChange?: (value: NoInfer<DateRange<MappedDateValue<T>>> | null) => void;
}

export interface RangeCalendarState extends Omit<
  CalendarState,
  "value" | "setValue" | "selectionMode"
> {
  readonly selectionMode: "range";
  /** The chosen range, as days in the calendar the grid is drawn in. */
  value: Accessor<DateRange | null>;
  setValue(value: DateRange | null): void;
  /** Where a range being drawn began, or null when none is. */
  anchorDate: Accessor<CalendarDate | null>;
  setAnchorDate(date: CalendarDate | null): void;
  /** What the range currently covers: the value, or the drag in progress. */
  highlightedRange: Accessor<DateRange | null>;
  highlightDate(date: CalendarDate): void;
  /** A pointer is down and drawing the range. */
  isDragging: Accessor<boolean>;
  setDragging(isDragging: boolean): void;
  /** Finish the range being drawn at the day it reaches now. */
  commitSelection(): void;
  /** Abandon the range being drawn and the value with it. */
  clearSelection(): void;
}

function ordered(a: CalendarDate, b: CalendarDate): DateRange {
  // A range drawn backwards is still a range: the anchor is where the user
  // started, not necessarily the earlier day.
  return a.compare(b) <= 0 ? { start: a, end: b } : { start: b, end: a };
}

export function rangeCalendarState<T extends DateValue = CalendarDate>(
  options: RangeCalendarStateOptions<T>,
): RangeCalendarState {
  const system = displayCalendar(useLocale(), options.createCalendar);

  const [given, setGiven] = controllable<DateRange<DateValue> | null>(
    () => access(options.value),
    () => access(options.defaultValue) ?? null,
    (next) => options.onChange?.(next as DateRange<MappedDateValue<T>> | null),
  );

  const value = (): DateRange | null => {
    const range = given();
    if (range === null) return null;
    return { start: inCalendar(range.start, system()), end: inCalendar(range.end, system()) };
  };

  const setValueRaw = (next: DateRange | null): void => {
    const was = untrack(given);
    setGiven(
      next === null
        ? null
        : { start: asValueOf(next.start, was?.start), end: asValueOf(next.end, was?.end) },
    );
  };

  const [anchorDate, writeAnchorSignal] = createSignal<CalendarDate | null>(null);
  const [drawn, setDrawn] = createSignal<DateRange | null>(null);
  const [isDragging, setDragging] = createSignal(false);

  // The anchor and the day the drawing reached, as plain variables too: a
  // pointer's down and up can arrive before a signal write is published, and
  // the up has to see what the down did.
  let anchorNow: CalendarDate | null = null;
  let reached: CalendarDate | null = null;

  const writeAnchorDate = (date: CalendarDate | null): void => {
    anchorNow = date;
    reached = date;
    writeAnchorSignal(date);
  };

  const ask = options.isDateUnavailable;
  const visibleMonths = (): number => Math.max(1, Math.floor(access(options.visibleMonths) ?? 1));

  // Centred on the range's start, unless its end would then be off the
  // window, in which case the start goes first.
  const alignment = (): "start" | "center" | "end" => {
    const asked = access(options.selectionAlignment);
    if (asked !== undefined) return asked;
    const range = untrack(value);
    if (range === null) return "center";
    const count = visibleMonths();
    const half = Math.floor(count / 2);
    const before = half > 0 && count % 2 === 0 ? half - 1 : half;
    const last = endOfMonth(startOfMonth(range.start).add({ months: count - 1 - before }));
    return range.end.compare(last) > 0 ? "start" : "center";
  };

  const base = calendarState<DateValue>({
    ...(options as Omit<
      CalendarStateOptions<T>,
      "value" | "defaultValue" | "onChange" | "isDateUnavailable"
    >),
    value: () => given()?.start ?? null,
    defaultValue: undefined,
    onChange: undefined,
    selectionAlignment: alignment,
    isDateUnavailable: ask === undefined ? undefined : (date) => ask(date, anchorDate()),
    onFocusChange: (date) => {
      // While a range is being drawn, moving focus IS drawing it, whichever
      // way the focus moved: a press, an arrow key or a page button.
      if (anchorNow !== null) highlightDate(date);
      options.onFocusChange?.(date);
    },
  });

  const highlightedRange = (): DateRange | null => {
    const anchor = anchorDate();
    if (anchor === null) return value();
    return drawn();
  };

  /** Whether every day between two ends can be chosen. */
  const contiguous = (range: DateRange): boolean => {
    const gaps = access(options.allowsNonContiguousRanges) === true;
    const holes = access(options.excludeDisabled) !== true;
    if (gaps && holes) return true;
    for (let day = range.start; day.compare(range.end) <= 0; day = day.add({ days: 1 })) {
      if (!gaps && base.isCellUnavailable(day)) return false;
      if (!holes && base.isCellDisabled(day)) return false;
    }
    return true;
  };

  const allowedLength = (range: DateRange): boolean => {
    // Between two days, `compare` is the number of days apart.
    const days = range.end.compare(range.start) + 1;
    const min = access(options.minDays);
    const max = access(options.maxDays);
    return (min === undefined || days >= min) && (max === undefined || days <= max);
  };

  const highlightDate = (date: CalendarDate): void => {
    const anchor = anchorNow;
    if (anchor === null) return;
    reached = date;
    setDrawn(ordered(anchor, date));
  };

  const selectDate = (date: CalendarDate): void => {
    if (base.isReadOnly() || base.isDisabled()) return;
    if (base.isCellDisabled(date) || base.isCellUnavailable(date)) return;

    const anchor = anchorNow;
    if (anchor === null) {
      writeAnchorDate(date);
      setDrawn({ start: date, end: date });
      return;
    }

    const range = ordered(anchor, date);
    writeAnchorDate(null);
    setDrawn(null);
    // A range with something unavailable inside it is not a range the user can
    // have; the second press starts a new one rather than silently failing.
    if (!contiguous(range) || !allowedLength(range)) {
      writeAnchorDate(date);
      setDrawn({ start: date, end: date });
      return;
    }
    setValueRaw(range);
  };

  const isAvailable = (date: CalendarDate): boolean => {
    const min = base.minValue();
    const max = base.maxValue();
    if (min !== null && date.compare(min) < 0) return false;
    if (max !== null && date.compare(max) > 0) return false;
    return !base.isCellUnavailable(date) && options.isDateDisabled?.(date) !== true;
  };

  return {
    ...base,
    selectionMode: "range",
    value,
    setValue: setValueRaw,
    // The signal is read so a reader is told when it changes; the variable is
    // returned so a handler sees what the event before it in the same tick did.
    anchorDate: () => {
      anchorDate();
      return anchorNow;
    },
    setAnchorDate: (date) => {
      writeAnchorDate(date);
      setDrawn(date === null ? null : { start: date, end: date });
    },
    highlightedRange,
    highlightDate,
    isDragging,
    setDragging: (next) => setDragging(next),
    commitSelection: () => {
      if (anchorNow === null) return;
      selectDate(reached ?? base.focusedDate());
    },
    clearSelection: () => {
      writeAnchorDate(null);
      setDrawn(null);
      setValueRaw(null);
    },
    isValueInvalid: () => {
      if (access(options.isInvalid) === true) return true;
      const range = value();
      if (range === null || anchorDate() !== null) return false;
      return !isAvailable(range.start) || !isAvailable(range.end);
    },
    isSelected: (date) => {
      const range = highlightedRange();
      if (range === null) return false;
      return date.compare(range.start) >= 0 && date.compare(range.end) <= 0;
    },
    selectDate,
    selectFocusedDate: () => selectDate(base.focusedDate()),
  };
}

// ---------------------------------------------------------------------------
// Several days
// ---------------------------------------------------------------------------

export interface MultipleCalendarStateOptions<T extends DateValue = CalendarDate> extends Omit<
  CalendarStateOptions<T>,
  "value" | "defaultValue" | "onChange"
> {
  value?: MaybeAccessor<readonly T[] | undefined>;
  defaultValue?: MaybeAccessor<readonly T[] | undefined>;
  /** The fewest days that may be left chosen, and the most that may be. */
  min?: MaybeAccessor<number | undefined>;
  max?: MaybeAccessor<number | undefined>;
  /** The last chosen day cannot be taken away. @default false */
  required?: MaybeAccessor<boolean | undefined>;
  onChange?: (value: NoInfer<MappedDateValue<T>>[]) => void;
}

export interface MultipleCalendarState extends Omit<
  CalendarState,
  "value" | "setValue" | "selectionMode"
> {
  readonly selectionMode: "multiple";
  /** The chosen days, in the order they were chosen, in the calendar the grid is drawn in. */
  value: Accessor<readonly CalendarDate[]>;
  setValue(value: readonly CalendarDate[]): void;
}

/**
 * Any number of days, each pressed on and off on its own.
 *
 * A press that would leave fewer than `min` or make more than `max` does
 * nothing, rather than dropping some other day to make room: which day to drop
 * is not a decision a calendar can make for anyone.
 */
export function multipleCalendarState<T extends DateValue = CalendarDate>(
  options: MultipleCalendarStateOptions<T>,
): MultipleCalendarState {
  const system = displayCalendar(useLocale(), options.createCalendar);

  const [given, setGiven] = controllable<readonly DateValue[]>(
    () => access(options.value),
    () => access(options.defaultValue) ?? [],
    (next) => options.onChange?.([...next] as MappedDateValue<T>[]),
  );

  const value = (): readonly CalendarDate[] => given().map((one) => inCalendar(one, system()));

  /** The days, each as the kind of value the first one given was. */
  const setValueRaw = (next: readonly CalendarDate[]): void => {
    const was = untrack(given);
    setGiven(next.map((day) => asValueOf(day, was.find((one) => isSameDay(one, day)) ?? was[0])));
  };

  const base = calendarState<DateValue>({
    ...(options as Omit<CalendarStateOptions<T>, "value" | "defaultValue" | "onChange">),
    value: () => given()[0] ?? null,
    defaultValue: undefined,
    onChange: undefined,
  });

  const isSelected = (date: CalendarDate): boolean =>
    value().some((chosen) => isSameDay(chosen, date));

  const selectDate = (date: CalendarDate): void => {
    if (base.isReadOnly() || base.isDisabled()) return;
    if (base.isCellDisabled(date) || base.isCellUnavailable(date)) return;

    const chosen = untrack(value);
    if (chosen.some((one) => isSameDay(one, date))) {
      const least = Math.max(access(options.min) ?? 0, access(options.required) === true ? 1 : 0);
      if (chosen.length - 1 < least) return;
      setValueRaw(chosen.filter((one) => !isSameDay(one, date)));
      return;
    }

    const most = access(options.max);
    if (most !== undefined && chosen.length >= most) return;
    setValueRaw([...chosen, date]);
  };

  const isRefused = (date: CalendarDate): boolean => {
    const min = base.minValue();
    const max = base.maxValue();
    if (min !== null && date.compare(min) < 0) return true;
    if (max !== null && date.compare(max) > 0) return true;
    return base.isCellUnavailable(date) || options.isDateDisabled?.(date) === true;
  };

  return {
    ...base,
    selectionMode: "multiple",
    value,
    setValue: setValueRaw,
    isValueInvalid: () => access(options.isInvalid) === true || value().some(isRefused),
    isSelected,
    selectDate,
    selectFocusedDate: () => selectDate(base.focusedDate()),
  };
}

/** Any of the three states a calendar can be built on. */
export type AnyCalendarState = CalendarState | RangeCalendarState | MultipleCalendarState;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface CalendarOptions {
  // No `isDisabled`: the STATE carries it, and a second copy here would be a
  // flag a caller could set and watch do nothing.
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
  /** The calendar's element, for telling a release or a blur outside it from one inside. */
  ref?: ElementRef;
  /**
   * What a range half drawn becomes when the pointer is released outside the
   * calendar or focus leaves it: finished where it reached, abandoned, or
   * abandoned with the value cleared. @default "select"
   */
  commitBehavior?: MaybeAccessor<"clear" | "reset" | "select" | undefined>;
}

/** What a calendar's cells need from the calendar around them. */
interface CalendarData {
  errorMessageId: Accessor<string>;
}

const calendarData = new WeakMap<AnyCalendarState, CalendarData>();

/** The press a range is being drawn with, shared by the cells of one calendar. */
interface Drag {
  /** The day the press began on, and what it did there. */
  origin: CalendarDate | null;
  kind: "anchor" | "boundary" | null;
  /** A touch waits before it draws, in case it is a scroll. */
  timer: ReturnType<typeof setTimeout> | undefined;
  /** A cell handled the press, so the click that follows is not a second one. */
  clickPending: boolean;
}

const drags = new WeakMap<AnyCalendarState, Drag>();

function dragOf(state: AnyCalendarState): Drag {
  let drag = drags.get(state);
  if (drag === undefined) {
    drag = { origin: null, kind: null, timer: undefined, clickPending: false };
    drags.set(state, drag);
  }
  return drag;
}

/** A screen reader's pointer has no size; its press is a click, and handled as one. */
function isVirtualPointer(event: PointerEvent): boolean {
  return event.pointerType === "" || (event.width === 0 && event.height === 0);
}

/**
 * Splits a formatted range into its two ends, at the last literal they share.
 *
 * The locale's own range format puts the separator where it belongs, "11–13
 * March" or "March 11 – 13", and the message around the two ends is the
 * locale's too.
 */
function formatRange(
  format: Intl.DateTimeFormat,
  start: CalendarDate,
  end: CalendarDate,
  timeZone: string,
): { startDate: string; endDate: string } {
  const parts = format.formatRangeToParts(start.toDate(timeZone), end.toDate(timeZone));
  let separator = -1;
  for (const [at, part] of parts.entries()) {
    if (part.source === "shared" && part.type === "literal") separator = at;
    else if (part.source === "endRange") break;
  }
  let startDate = "";
  let endDate = "";
  for (const [at, part] of parts.entries()) {
    if (at < separator) startDate += part.value;
    else if (at > separator) endDate += part.value;
  }
  return { startDate, endDate };
}

/**
 * A day as a format names it.
 *
 * A calendar built by a caller's `createCalendar` can number its months
 * differently from the system `Intl` formats in, a fiscal year beginning in
 * February; the calendar maps its month back to the one to print.
 */
function formattable(date: CalendarDate): CalendarDate {
  return date.calendar.getFormattableMonth?.(date) ?? date;
}

/** A Gregorian day before the common era says so, since its year alone reads as one after. */
function eraFormat(date: CalendarDate | null | undefined): "short" | undefined {
  return date?.calendar.identifier === "gregory" && date.era === "BC" ? "short" : undefined;
}

/**
 * A date format for the days a calendar shows.
 *
 * It names the calendar the grid is drawn in as well as the locale does,
 * because a caller's `createCalendar` can draw it in one the locale did not
 * name, and it formats in the zone the calendar reckons days in, which is the
 * one a day's `toDate` is given.
 */
function calendarFormat(
  options: () => Intl.DateTimeFormatOptions,
  state: AnyCalendarState,
  locale: Accessor<Locale>,
): Accessor<Intl.DateTimeFormat> {
  return () =>
    dateFormatter(
      {
        ...options(),
        calendar: state.visibleRange().start.calendar.identifier,
        timeZone: state.timeZone(),
      },
      locale,
    )();
}

export interface CalendarResult {
  calendarProps: DOMProps;
  /** Options for {@link button}, not props for an element. */
  prevButtonProps: DOMProps;
  nextButtonProps: DOMProps;
  errorMessageProps: DOMProps;
  /** The month on show, as a heading. With several on show, the first to the last. */
  title: Accessor<string>;
  baseId: Accessor<string>;
}

export function calendar(options: CalendarOptions, state: AnyCalendarState): CalendarResult {
  const baseId = id();
  const errorMessageId = id();
  const locale = useLocale();
  const titleFormat = calendarFormat(
    () => {
      const range = state.visibleRange();
      return {
        month: "long",
        year: "numeric",
        era: eraFormat(range.start) ?? eraFormat(range.end),
      };
    },
    state,
    locale,
  );
  const messages = stringFormatter(CALENDAR_STRINGS);
  const longDate = calendarFormat(
    () => ({ weekday: "long", month: "long", year: "numeric", day: "numeric" }),
    state,
    locale,
  );
  const list = listFormatter();
  calendarData.set(state, { errorMessageId });

  /** What has been chosen, in words, or nothing while a range is half drawn. */
  const selection = (): string => {
    const spoken = (date: CalendarDate): string => longDate().format(date.toDate(state.timeZone()));
    if (state.selectionMode === "range") {
      const range = state.value();
      if (range === null || state.anchorDate() !== null) return "";
      if (isSameDay(range.start, range.end)) {
        return messages().format("selectedDateDescription", { date: spoken(range.start) });
      }
      const dateRange = messages().format(
        "dateRange",
        formatRange(longDate(), range.start, range.end, state.timeZone()),
      );
      return messages().format("selectedRangeDescription", { dateRange });
    }
    if (state.selectionMode === "multiple") {
      const days = state.value();
      if (days.length === 0) return "";
      return messages().format("selectedDateDescription", {
        date: list().format(days.map(spoken)),
      });
    }
    const chosen = state.value();
    return chosen === null
      ? ""
      : messages().format("selectedDateDescription", { date: spoken(chosen) });
  };

  const commit = (): void => {
    if (state.selectionMode !== "range" || state.anchorDate() === null) return;
    const behavior = access(options.commitBehavior) ?? "select";
    if (behavior === "clear") state.clearSelection();
    else if (behavior === "reset") state.setAnchorDate(null);
    else state.commitSelection();
  };

  const title = (): string => {
    const range = state.visibleRange();
    const zone = state.timeZone();
    const first = formattable(range.start).toDate(zone);
    if (state.visibleMonths() === 1) return titleFormat().format(first);
    return titleFormat().formatRange(first, formattable(startOfMonth(range.end)).toDate(zone));
  };

  if (!isServer) {
    // The month changing under a pointer press has nothing on screen to say
    // so; a screen reader user pressing "next" hears only the button.
    let previous = title();
    createEffect(title, (current) => {
      if (current === previous) return;
      previous = current;
      if (!untrack(state.isFocused)) announce(current);
    });

    // A choice is said once it is made, since the day pressed is announced
    // before the press changes it.
    let chosen = untrack(selection);
    createEffect(selection, (current) => {
      if (current === chosen) return;
      chosen = current;
      if (current !== "") announce(current, "polite", 4000);
    });

    if (state.selectionMode === "range") {
      // A range drawn by dragging ends where the pointer is released. Released
      // outside the calendar, or anywhere in it but on a day, the range is
      // finished, abandoned or cleared as `commitBehavior` says.
      onSettled(() => {
        const view = typeof window === "undefined" ? null : window;
        if (view === null) return undefined;
        const release = (event: PointerEvent): void => {
          if (isVirtualPointer(event)) return;
          const drag = dragOf(state);
          clearTimeout(drag.timer);
          drag.timer = undefined;
          drag.origin = null;
          drag.kind = null;
          state.setDragging(false);
          if (state.anchorDate() === null) return;
          const root = access(options.ref) as Element | null;
          if (root === null || !contains(root, activeElement(ownerDocument(root)))) return;
          const target = event.target instanceof Element ? event.target : null;
          if (
            target !== null &&
            contains(root, target) &&
            target.closest('button, [role="button"]') !== null
          ) {
            return;
          }
          commit();
        };
        const clicked = (): void => {
          dragOf(state).clickPending = false;
        };
        view.addEventListener("pointerup", release);
        view.addEventListener("click", clicked);
        return () => {
          view.removeEventListener("pointerup", release);
          view.removeEventListener("click", clicked);
        };
      });
    }
  }

  return {
    baseId,
    title,
    errorMessageProps: { id: errorMessageId },
    calendarProps: mergeProps(filterDOMProps(options, { labelable: true }), {
      role: "group",
      id: baseId,
      "aria-label": () => access(options["aria-label"]),
      "aria-labelledby": () => access(options["aria-labelledby"]),
      // Leaving the calendar with a range half drawn finishes it, as letting
      // go of the pointer outside it does. Focus leaving because the focused
      // day was removed is not leaving, and is told apart a microtask later.
      onFocusOut: (event: FocusEvent) => {
        if (state.selectionMode !== "range") return;
        const root = event.currentTarget as Element | null;
        if (root === null) return;
        const next = event.relatedTarget instanceof Element ? event.relatedTarget : null;
        if (next !== null) {
          if (!contains(root, next)) commit();
          return;
        }
        queueMicrotask(() => {
          if (!contains(root, activeElement(ownerDocument(root)))) commit();
        });
      },
    }),
    prevButtonProps: {
      "aria-label": () => messages().format("previous"),
      isDisabled: () => state.isDisabled() || state.isPreviousVisibleRangeInvalid(),
      onPress: () => state.focusPreviousPage(),
    },
    nextButtonProps: {
      "aria-label": () => messages().format("next"),
      isDisabled: () => state.isDisabled() || state.isNextVisibleRangeInvalid(),
      onPress: () => state.focusNextPage(),
    },
  };
}

export interface CalendarGridOptions {
  /** @default "narrow" */
  weekdayStyle?: MaybeAccessor<"narrow" | "short" | "long" | undefined>;
  /** Which of the months on show this grid draws, counted from the first. @default 0 */
  monthOffset?: MaybeAccessor<number | undefined>;
  /** Always six week rows, so paging never changes the height. @default false */
  fixedWeeks?: MaybeAccessor<boolean | undefined>;
  /** Number the weeks by ISO 8601 rather than by the locale. @default false */
  isoWeek?: MaybeAccessor<boolean | undefined>;
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
}

export interface CalendarGridResult {
  gridProps: DOMProps;
  headerProps: DOMProps;
  /** The first day of the month this grid draws. */
  month: Accessor<CalendarDate>;
  /** That month as a heading. */
  title: Accessor<string>;
  /** The weekday names, from the locale, starting on its first day. */
  weekDays: Accessor<string[]>;
  weeksInMonth: Accessor<number>;
  /** Every day of a week row, including the ones outside the month. */
  weekDates: (week: number) => CalendarDate[];
  /** Which week of the year a row is, going by the row's first day. */
  weekNumber: (week: number) => number;
}

export function calendarGrid(
  options: CalendarGridOptions,
  state: AnyCalendarState,
): CalendarGridResult {
  const locale = useLocale();

  const month = (): CalendarDate =>
    state.visibleRange().start.add({ months: access(options.monthOffset) ?? 0 });
  const titleFormat = calendarFormat(
    () => ({ month: "long", year: "numeric", era: eraFormat(month()) }),
    state,
    locale,
  );
  const weekdayFormat = calendarFormat(
    () => ({ weekday: access(options.weekdayStyle) ?? "narrow" }),
    state,
    locale,
  );

  const weekDays = createMemo(() => {
    const zone = state.timeZone();
    const start = startOfWeek(today(zone), locale().locale, state.firstDayOfWeek());
    return Array.from({ length: 7 }, (_, at) =>
      weekdayFormat().format(start.add({ days: at }).toDate(zone)),
    );
  });

  const weeksInMonth = (): number =>
    access(options.fixedWeeks) === true
      ? 6
      : (state.weeksInMonth() ?? getWeeksInMonth(month(), locale().locale, state.firstDayOfWeek()));

  const weekDates = (week: number): CalendarDate[] => {
    const first = startOfWeek(month(), locale().locale, state.firstDayOfWeek());
    const start = first.add({ weeks: week });
    return Array.from({ length: 7 }, (_, at) => start.add({ days: at }));
  };

  const weekNumber = (week: number): number => {
    const first = startOfWeek(month(), locale().locale, state.firstDayOfWeek()).add({
      weeks: week,
    });
    if (access(options.isoWeek) === true) return getISOWeek(first);
    return getWeekOfYear(first, locale().locale, state.firstDayOfWeek());
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const rtl = locale().direction === "rtl";

    switch (event.key) {
      case "ArrowLeft":
        if (rtl) state.focusNextDay();
        else state.focusPreviousDay();
        break;
      case "ArrowRight":
        if (rtl) state.focusPreviousDay();
        else state.focusNextDay();
        break;
      case "ArrowUp":
        state.focusPreviousRow();
        break;
      case "ArrowDown":
        state.focusNextRow();
        break;
      case "PageUp":
        state.focusPreviousSection(event.shiftKey);
        break;
      case "PageDown":
        state.focusNextSection(event.shiftKey);
        break;
      case "Home":
        state.focusSectionStart();
        break;
      case "End":
        state.focusSectionEnd();
        break;
      case "Enter":
      case " ":
        state.selectFocusedDate();
        break;
      case "Escape": {
        // Abandon a range half drawn, rather than leaving an anchor behind
        // that the next press would finish against.
        if ("setAnchorDate" in state) {
          event.preventDefault();
          state.setAnchorDate(null);
        }
        return;
      }
      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  const title = (): string => titleFormat().format(formattable(month()).toDate(state.timeZone()));

  return {
    month,
    title,
    weekDays,
    weeksInMonth,
    weekDates,
    weekNumber,
    headerProps: { "aria-hidden": true },
    gridProps: {
      role: "grid",
      "aria-multiselectable": state.selectionMode === "single" ? undefined : true,
      "aria-readonly": () => state.isReadOnly() || undefined,
      "aria-disabled": () => state.isDisabled() || undefined,
      // A grid nobody named is named for its month: with a caption made of
      // selects there is no heading to point at, and an unnamed grid is announced
      // as "grid" and nothing else.
      "aria-label": () =>
        access(options["aria-label"]) ??
        (access(options["aria-labelledby"]) === undefined ? title() : undefined),
      "aria-labelledby": () => access(options["aria-labelledby"]),
      onKeyDown,
      onFocusIn: () => state.setFocused(true),
      // Removing the focused day fires `focusout` exactly as leaving the
      // calendar does, and moving between months removes a row. Clearing here
      // told the calendar it had lost focus in the middle of moving it, so the
      // day it moved TO no longer wanted focus and it stayed on `<body>`. The
      // question is answered a microtask later, against where focus actually
      // is.
      onFocusOut: (event: FocusEvent) => {
        const grid = event.currentTarget as Element | null;
        if (grid === null) {
          state.setFocused(false);
          return;
        }
        queueMicrotask(() => {
          if (!contains(grid, activeElement(ownerDocument(grid)))) state.setFocused(false);
        });
      },
    },
  };
}

export interface CalendarCellOptions {
  /**
   * The day.
   *
   * An accessor, because a cell OUTLIVES the day it draws: the grid keys its
   * rows and columns by position, so changing month moves 42 dates through 42
   * elements that stay where they are. A cell that was rebuilt instead would
   * be destroyed while it held focus.
   */
  date: MaybeAccessor<CalendarDate>;
  ref: ElementRef;
  /** Rendered to keep the grid rectangular, but belonging to another month. */
  isOutsideMonth?: MaybeAccessor<boolean | undefined>;
  /**
   * The month of the grid this cell is in. Defaults to the first one on show.
   *
   * With several months side by side the same day can be drawn twice, once in
   * its own grid and once as the tail of its neighbour's last week; only the
   * first of those is the day.
   */
  month?: MaybeAccessor<CalendarDate | undefined>;
}

export interface CalendarCellResult {
  cellProps: DOMProps;
  /** For the element inside the cell that the user actually presses. */
  buttonProps: DOMProps;
  isSelected: Accessor<boolean>;
  isFocused: Accessor<boolean>;
  isDisabled: Accessor<boolean>;
  isUnavailable: Accessor<boolean>;
  isOutsideVisibleRange: Accessor<boolean>;
  isToday: Accessor<boolean>;
  /**
   * The first and last day of the range this cell is in, if it is in one.
   *
   * Both are false in a calendar that selects a single day: there is no range,
   * so there are no ends to it. A range's three positions — its two ends and
   * everything between — are what a stylesheet needs to round the corners of
   * one selection and not of the days inside it.
   */
  isSelectionStart: Accessor<boolean>;
  isSelectionEnd: Accessor<boolean>;
  formattedDate: Accessor<string>;
}

export function calendarCell(
  options: CalendarCellOptions,
  state: AnyCalendarState,
): CalendarCellResult {
  const locale = useLocale();
  const date = (): CalendarDate => access(options.date);
  const labelFormat = calendarFormat(
    () => ({
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      era: eraFormat(date()),
    }),
    state,
    locale,
  );
  const dayFormat = calendarFormat(() => ({ day: "numeric" }), state, locale);
  const messages = stringFormatter(CALENDAR_STRINGS);
  const drag = dragOf(state);

  const isOutside = (): boolean =>
    access(options.isOutsideMonth) === true ||
    !isSameMonth(date(), access(options.month) ?? state.visibleRange().start);

  const isDisabled = (): boolean => state.isCellDisabled(date()) || isOutside();
  const isUnavailable = (): boolean => state.isCellUnavailable(date());
  const isSelectable = (): boolean => !isDisabled() && !isUnavailable();

  /** This day is part of a value the calendar says is wrong. */
  const isInvalid = (): boolean => {
    if (!state.isValueInvalid()) return false;
    const day = date();
    if (state.selectionMode === "range") {
      const range = state.highlightedRange();
      return (
        state.anchorDate() === null &&
        range !== null &&
        day.compare(range.start) >= 0 &&
        day.compare(range.end) <= 0
      );
    }
    if (state.selectionMode === "multiple") return state.value().some((one) => isSameDay(one, day));
    const chosen = state.value();
    return chosen !== null && isSameDay(chosen, day);
  };

  // A chosen day stays drawn as chosen while it is invalid, even when it is
  // one that could not be chosen now: the value is what it is, and hiding it
  // would leave the error pointing at nothing.
  const isSelected = (): boolean =>
    (state.isSelected(date()) && isSelectable()) || (isInvalid() && !isDisabled());
  const isFocused = (): boolean => state.isCellFocused(date()) && !isOutside();
  const isTodayCell = (): boolean => isSameDay(date(), state.today());

  const highlighted = (): DateRange | null =>
    "highlightedRange" in state ? state.highlightedRange() : null;
  const isSelectionStart = (): boolean => {
    const range = highlighted();
    return isSelected() && range !== null && isSameDay(date(), range.start);
  };
  const isSelectionEnd = (): boolean => {
    const range = highlighted();
    return isSelected() && range !== null && isSameDay(date(), range.end);
  };

  if (!isServer) {
    // The state decides which day is focused; the DOM follows it, so the
    // arrows move focus without every cell having to watch the keyboard.
    createEffect(
      () => (isFocused() ? { element: access(options.ref) as HTMLElement | null } : null),
      (focused) => {
        if (focused === null) return;
        const { element } = focused;
        if (element === null) return;
        if (activeElement(ownerDocument(element)) !== element) focusSafely(element);
      },
    );
  }

  const label = (): string => {
    const text = labelFormat().format(date().toDate(state.timeZone()));
    if (isTodayCell()) {
      return messages().format(isSelected() ? "todayDateSelected" : "todayDate", { date: text });
    }
    return isSelected() ? messages().format("dateSelected", { date: text }) : text;
  };

  /** A range drawn by pressing one day and releasing on another. */
  const onPointerDown = (event: PointerEvent): void => {
    if (state.selectionMode !== "range" || event.button !== 0 || isVirtualPointer(event)) return;
    drag.clickPending = true;
    // A touch keeps the pointer on the element it began on unless released,
    // and the days it is dragged over would then never hear it.
    const target = event.target instanceof Element ? event.target : null;
    if (target?.hasPointerCapture?.(event.pointerId) === true) {
      target.releasePointerCapture(event.pointerId);
    }
    if (!isSelectable()) return;
    const day = date();
    if (state.isReadOnly()) {
      state.setFocusedDate(day);
      return;
    }
    if (state.anchorDate() !== null) return;

    // Pressing an end of the chosen range takes hold of it, so dragging moves
    // that end and leaves the other where it is.
    const range = state.highlightedRange();
    if (range !== null && !isInvalid()) {
      const other = isSameDay(day, range.start)
        ? range.end
        : isSameDay(day, range.end)
          ? range.start
          : null;
      if (other !== null) {
        state.setAnchorDate(other);
        state.setFocusedDate(day);
        state.setDragging(true);
        drag.origin = day;
        drag.kind = "boundary";
        return;
      }
    }

    const start = (): void => {
      drag.timer = undefined;
      state.setDragging(true);
      state.selectDate(day);
      state.setFocusedDate(day);
      drag.origin = day;
      drag.kind = "anchor";
    };
    if (event.pointerType === "touch") drag.timer = setTimeout(start, 200);
    else start();
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (state.selectionMode !== "range" || event.button !== 0 || isVirtualPointer(event)) return;
    drag.clickPending = true;
    if (state.isReadOnly()) return;
    const day = date();

    // A tap quicker than the wait for a drag is a press like any other.
    if (drag.timer !== undefined) {
      clearTimeout(drag.timer);
      drag.timer = undefined;
      state.selectDate(day);
      state.setFocusedDate(day);
      return;
    }

    const fromHere = drag.origin !== null && isSameDay(drag.origin, day);
    if (drag.kind === "boundary" && fromHere) {
      // An end pressed and let go without moving starts a new range there.
      state.setAnchorDate(day);
    } else if (state.anchorDate() !== null && !(drag.kind === "anchor" && fromHere)) {
      state.selectDate(day);
      state.setFocusedDate(day);
    }
  };

  return {
    isSelected,
    isFocused,
    isDisabled,
    isUnavailable,
    isOutsideVisibleRange: isOutside,
    isToday: isTodayCell,
    isSelectionStart,
    isSelectionEnd,
    // The day's own part of the format: some calendars write more around it.
    formattedDate: () =>
      dayFormat()
        .formatToParts(date().toDate(state.timeZone()))
        .find((part) => part.type === "day")?.value ?? String(date().day),
    cellProps: {
      role: "gridcell",
      "aria-selected": () => isSelected() || undefined,
      "aria-disabled": () => (!isSelectable() ? true : undefined),
      "aria-invalid": () => isInvalid() || undefined,
    },
    buttonProps: {
      role: "button",
      // A day outside the month is scaffolding: hidden from the tree, so Down
      // from the last week reaches the next MONTH and not a duplicate.
      "aria-hidden": () => isOutside() || undefined,
      "aria-label": label,
      "aria-invalid": () => isInvalid() || undefined,
      // The error message says what is wrong with the value, so the days that
      // make it up point at it.
      "aria-describedby": () =>
        isInvalid() ? calendarData.get(state)?.errorMessageId() : undefined,
      // The roving focus: one day in the Tab order, and it moves with the
      // arrows.
      tabIndex: () =>
        isOutside() ? undefined : isFocused() || isSameDay(state.focusedDate(), date()) ? 0 : -1,
      onPointerEnter: (event: PointerEvent) => {
        // Drawing a range follows the pointer, so the highlight is what the
        // user would get by releasing here. A touch only draws once it has
        // waited long enough to be a drag rather than a scroll.
        if (state.selectionMode !== "range" || state.anchorDate() === null) return;
        if (event.pointerType === "touch" && !state.isDragging()) return;
        if (isSelectable()) state.highlightDate(date());
      },
      onPointerDown,
      onPointerUp,
      onContextMenu: (event: MouseEvent) => {
        // A long press on a touch screen is a drag here, not a menu.
        if (state.selectionMode === "range") event.preventDefault();
      },
      onClick: () => {
        // The pointer already chose; this is the click the browser sends after.
        if (drag.clickPending) {
          drag.clickPending = false;
          return;
        }
        if (isOutside() || state.isCellDisabled(date())) return;
        state.setFocusedDate(date());
        state.selectDate(date());
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface CalendarContextValue {
  state: AnyCalendarState;
  baseId: Accessor<string>;
}

const CalendarContext = createContext<CalendarContextValue | null>(null);

export function useCalendar(): CalendarContextValue {
  const value = getContext(CalendarContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a Calendar.");
  }
  return value;
}

function CalendarProvider(props: { value: CalendarContextValue; children?: Child }) {
  return provide(
    CalendarContext,
    () => props.value,
    () => props.children as unknown,
  );
}

export interface CalendarComponentProps<T extends DateValue = CalendarDate> extends StyleProps {
  value?: T | null;
  defaultValue?: T | null;
  focusedValue?: DateValue;
  defaultFocusedValue?: DateValue;
  minValue?: DateValue | null;
  maxValue?: DateValue | null;
  isDateUnavailable?: (date: CalendarDate) => boolean;
  /** Days that cannot be chosen and that the arrow keys step over. */
  isDateDisabled?: (date: CalendarDate) => boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  autoFocus?: boolean;
  /** Pressing the chosen day again clears it. @default false */
  allowsDeselection?: boolean;
  firstDayOfWeek?: DayOfWeek;
  /** Builds the calendar system the locale names. @default createCalendar */
  createCalendar?: (identifier: CalendarIdentifier) => CalendarSystem;
  /** Always six week rows. @default false */
  fixedWeeks?: boolean;
  /** The IANA zone today is reckoned in. Defaults to a zoned value's, then the local one. */
  timeZone?: string;
  /** @default "narrow" */
  weekdayStyle?: "narrow" | "short" | "long";
  /** Where the chosen day sits among several months when first shown. @default "center" */
  selectionAlignment?: "start" | "center" | "end";
  /** Every month drawn with this many week rows. */
  weeksInMonth?: number;
  /** Said by the caller, whatever the value is. */
  isInvalid?: boolean;
  errorMessage?: Child;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onChange?: (value: NoInfer<MappedDateValue<T>> | null) => void;
  onFocusChange?: (date: CalendarDate) => void;
}

/**
 * ```tsx
 * <Calendar aria-label="Departure" value={date()} onChange={date.set}
 *           minValue={today(getLocalTimeZone())} />
 * ```
 */
// Declared as its own call site, so JSX infers `T` from the value written
// there: through the mapped type that widens Cells back to values, a type
// parameter standing alone in a prop is not inferred.
export function Calendar<T extends DateValue = CalendarDate>(
  props: CalendarComponentProps<T> & CallSite<CalendarComponentProps<T>>,
) {
  const state = calendarState<T>({
    value: () => props.value,
    defaultValue: () => props.defaultValue,
    focusedValue: () => props.focusedValue,
    defaultFocusedValue: () => props.defaultFocusedValue,
    minValue: () => props.minValue,
    maxValue: () => props.maxValue,
    isDateUnavailable: callback<[CalendarDate], boolean>(cells(props).isDateUnavailable),
    isDateDisabled: callback<[CalendarDate], boolean>(cells(props).isDateDisabled),
    isDisabled: () => props.isDisabled,
    isReadOnly: () => props.isReadOnly,
    autoFocus: () => props.autoFocus,
    allowsDeselection: () => props.allowsDeselection,
    firstDayOfWeek: () => props.firstDayOfWeek,
    createCalendar: callback<[CalendarIdentifier], CalendarSystem>(cells(props).createCalendar),
    timeZone: () => props.timeZone,
    isInvalid: () => props.isInvalid,
    selectionAlignment: () => props.selectionAlignment,
    weeksInMonth: () => props.weeksInMonth,
    onChange: (value) => props.onChange?.(value),
    onFocusChange: (date) => props.onFocusChange?.(date),
  });

  return (
    <CalendarBody state={state} of={cells(props) as unknown as Incoming<CalendarComponentProps>} />
  );
}

export interface RangeCalendarComponentProps<T extends DateValue = CalendarDate> extends Omit<
  CalendarComponentProps<T>,
  "value" | "defaultValue" | "onChange" | "isDateUnavailable"
> {
  value?: DateRange<T> | null;
  defaultValue?: DateRange<T> | null;
  allowsNonContiguousRanges?: boolean;
  /** Days that cannot be chosen, told the day the range being drawn began on. */
  isDateUnavailable?: (date: CalendarDate, anchorDate: CalendarDate | null) => boolean;
  /**
   * What a range half drawn becomes when the pointer is released outside the
   * calendar or focus leaves it. @default "select"
   */
  commitBehavior?: "clear" | "reset" | "select";
  onChange?: (value: NoInfer<DateRange<MappedDateValue<T>>> | null) => void;
}

/**
 * Two days, and everything between them.
 *
 * The first press anchors, the second finishes. Moving the pointer or the
 * focus between the two DRAWS: what is highlighted is what releasing would
 * give, so the user is never guessing.
 */
export function RangeCalendar<T extends DateValue = CalendarDate>(
  props: RangeCalendarComponentProps<T> & CallSite<RangeCalendarComponentProps<T>>,
) {
  const state = rangeCalendarState<T>({
    value: () => props.value,
    defaultValue: () => props.defaultValue,
    focusedValue: () => props.focusedValue,
    defaultFocusedValue: () => props.defaultFocusedValue,
    minValue: () => props.minValue,
    maxValue: () => props.maxValue,
    isDateUnavailable: callback<[CalendarDate, CalendarDate | null], boolean>(
      cells(props).isDateUnavailable,
    ),
    isDateDisabled: callback<[CalendarDate], boolean>(cells(props).isDateDisabled),
    isDisabled: () => props.isDisabled,
    isReadOnly: () => props.isReadOnly,
    autoFocus: () => props.autoFocus,
    firstDayOfWeek: () => props.firstDayOfWeek,
    createCalendar: callback<[CalendarIdentifier], CalendarSystem>(cells(props).createCalendar),
    timeZone: () => props.timeZone,
    isInvalid: () => props.isInvalid,
    selectionAlignment: () => props.selectionAlignment,
    weeksInMonth: () => props.weeksInMonth,
    allowsNonContiguousRanges: () => props.allowsNonContiguousRanges,
    onChange: (value) => props.onChange?.(value),
    onFocusChange: (date) => props.onFocusChange?.(date),
  });

  return (
    <CalendarBody
      state={state}
      of={cells(props) as unknown as Incoming<CalendarComponentProps>}
      commitBehavior={props.commitBehavior}
    />
  );
}

export interface MultipleCalendarComponentProps<T extends DateValue = CalendarDate> extends Omit<
  CalendarComponentProps<T>,
  "value" | "defaultValue" | "onChange"
> {
  value?: readonly T[];
  defaultValue?: readonly T[];
  /** The fewest days that may be left chosen, and the most that may be. */
  min?: number;
  max?: number;
  /** The last chosen day cannot be taken away. @default false */
  required?: boolean;
  onChange?: (value: NoInfer<MappedDateValue<T>>[]) => void;
}

/**
 * Any number of days.
 *
 * Each press turns one day on or off and leaves the rest alone, and the grid
 * says it takes more than one so a screen reader does not announce a choice
 * as having replaced the last.
 */
export function MultipleCalendar<T extends DateValue = CalendarDate>(
  props: MultipleCalendarComponentProps<T> & CallSite<MultipleCalendarComponentProps<T>>,
) {
  const state = multipleCalendarState<T>({
    value: () => props.value,
    defaultValue: () => props.defaultValue,
    focusedValue: () => props.focusedValue,
    defaultFocusedValue: () => props.defaultFocusedValue,
    minValue: () => props.minValue,
    maxValue: () => props.maxValue,
    isDateUnavailable: callback<[CalendarDate], boolean>(cells(props).isDateUnavailable),
    isDateDisabled: callback<[CalendarDate], boolean>(cells(props).isDateDisabled),
    isDisabled: () => props.isDisabled,
    isReadOnly: () => props.isReadOnly,
    autoFocus: () => props.autoFocus,
    firstDayOfWeek: () => props.firstDayOfWeek,
    createCalendar: callback<[CalendarIdentifier], CalendarSystem>(cells(props).createCalendar),
    timeZone: () => props.timeZone,
    isInvalid: () => props.isInvalid,
    selectionAlignment: () => props.selectionAlignment,
    weeksInMonth: () => props.weeksInMonth,
    min: () => props.min,
    max: () => props.max,
    required: () => props.required,
    onChange: (value) => props.onChange?.(value),
    onFocusChange: (date) => props.onFocusChange?.(date),
  });

  return (
    <CalendarBody state={state} of={cells(props) as unknown as Incoming<CalendarComponentProps>} />
  );
}

interface CalendarBodyProps {
  state: AnyCalendarState;
  /** The calendar's own props, still as Cells. */
  of: Incoming<CalendarComponentProps>;
  commitBehavior?: "clear" | "reset" | "select";
}

/** The heading, the two page buttons and the grid: what both calendars are. */
function CalendarBody(incoming: CalendarBodyProps) {
  const state = incoming.state;
  const props = incoming.of;
  const prevRef = makeRef<HTMLButtonElement>();
  const nextRef = makeRef<HTMLButtonElement>();
  const rootRef = makeRef<HTMLDivElement>();

  const { calendarProps, prevButtonProps, nextButtonProps, errorMessageProps, title, baseId } =
    calendar(
      {
        ref: rootRef,
        "aria-label": () => props["aria-label"]?.(),
        "aria-labelledby": () => props["aria-labelledby"]?.(),
        commitBehavior: () => incoming.commitBehavior,
      },
      state,
    );

  const titleId = id();

  const { gridProps, headerProps, weekDays, weeksInMonth, weekDates } = calendarGrid(
    {
      weekdayStyle: () => props.weekdayStyle?.(),
      fixedWeeks: () => props.fixedWeeks?.(),
      "aria-labelledby": titleId,
    },
    state,
  );

  const previous = button(prevButtonProps, prevRef);
  const next = button(nextButtonProps, nextRef);

  const value: CalendarContextValue = { state, baseId };

  const elementProps = mergeProps(
    calendarProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-disabled": () => props.isDisabled?.() === true,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <CalendarProvider value={value}>
      <div {...elementProps} ref={mergeRefs(rootRef.set, props.ref?.())}>
        <div>
          <button {...previous.buttonProps} type="button" ref={prevRef.set}>
            <span aria-hidden="true">‹</span>
          </button>
          <h2 id={titleId}>{title}</h2>
          <button {...next.buttonProps} type="button" ref={nextRef.set}>
            <span aria-hidden="true">›</span>
          </button>
        </div>
        <div {...gridProps}>
          <div {...headerProps} role="row">
            <For each={() => weekDays()}>
              {(day: string) => (
                <div role="columnheader" aria-label={day}>
                  {day}
                </div>
              )}
            </For>
          </div>
          {/* Keyed by POSITION, not by the day: `weekDates` builds seven new
              `CalendarDate` objects every read, so keying by them destroyed
              all forty-two cells whenever the month changed — with the one
              holding focus among them. */}
          <For each={() => Array.from({ length: weeksInMonth() }, (_, week) => week)}>
            {(week: number) => (
              <div role="row">
                <Repeat count={7}>
                  {(at: number) => <CalendarCell date={weekDates(week)[at] as CalendarDate} />}
                </Repeat>
              </div>
            )}
          </For>
        </div>
        <span {...errorMessageProps}>{props.errorMessage}</span>
      </div>
    </CalendarProvider>
  );
}

export interface CalendarCellComponentProps extends StyleProps {
  date: CalendarDate;
  ref?: RefTarget<HTMLDivElement>;
}

/** One day. */
export function CalendarCell(props: CalendarCellComponentProps) {
  const domRef = makeRef<HTMLDivElement>();
  const { state } = useCalendar();

  const {
    cellProps,
    buttonProps,
    isSelected,
    isFocused,
    isDisabled,
    isUnavailable,
    isOutsideVisibleRange,
    isToday: isTodayCell,
    isSelectionStart,
    isSelectionEnd,
    formattedDate,
  } = calendarCell({ date: () => props.date, ref: domRef }, state);

  const { hoverProps, isHovered } = hover({ isDisabled });
  const { focusProps, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    buttonProps,
    hoverProps,
    focusProps,
    filterDOMProps(fromProps(cells(props)), { global: true }),
    styleProps(cells(props)),
    {
      "data-selected": isSelected,
      "data-focused": isFocused,
      "data-focus-visible": isFocusVisible,
      "data-hovered": isHovered,
      "data-disabled": isDisabled,
      "data-unavailable": isUnavailable,
      "data-outside-month": isOutsideVisibleRange,
      "data-today": isTodayCell,
      "data-selection-start": isSelectionStart,
      "data-selection-end": isSelectionEnd,
      "data-testid": () => props["data-testid"],
    },
  );

  return (
    <div {...cellProps}>
      <div {...elementProps} ref={mergeRefs(domRef.set, props.ref)}>
        {formattedDate}
      </div>
    </div>
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

type CalendarKey =
  | "previous"
  | "next"
  | "selectedDateDescription"
  | "selectedRangeDescription"
  | "todayDate"
  | "todayDateSelected"
  | "dateSelected"
  | "minimumDate"
  | "maximumDate"
  | "dateRange";

const CALENDAR_STRINGS = new StringDictionary<CalendarKey>({
  "en-US": {
    previous: "Previous month",
    next: "Next month",
    selectedDateDescription: say("Selected Date: {date}"),
    selectedRangeDescription: say("Selected Range: {dateRange}"),
    todayDate: say("Today, {date}"),
    todayDateSelected: say("Today, {date} selected"),
    dateSelected: say("{date} selected"),
    minimumDate: "First available date",
    maximumDate: "Last available date",
    dateRange: say("{startDate} to {endDate}"),
  },
  "ar-AE": {
    previous: "السابق",
    next: "التالي",
    selectedDateDescription: say("تاريخ محدد: {date}"),
    selectedRangeDescription: say("المدى الزمني المحدد: {dateRange}"),
    todayDate: say("اليوم، {date}"),
    todayDateSelected: say("اليوم، {date} محدد"),
    dateSelected: say("{date} المحدد"),
    minimumDate: "أول تاريخ متاح",
    maximumDate: "آخر تاريخ متاح",
    dateRange: say("{startDate} إلى {endDate}"),
  },
  "bg-BG": {
    previous: "Назад",
    next: "Напред",
    selectedDateDescription: say("Избрана дата: {date}"),
    selectedRangeDescription: say("Избран диапазон: {dateRange}"),
    todayDate: say("Днес, {date}"),
    todayDateSelected: say("Днес, {date} са избрани"),
    dateSelected: say("Избрано е {date}"),
    minimumDate: "Първа налична дата",
    maximumDate: "Последна налична дата",
    dateRange: say("{startDate} до {endDate}"),
  },
  "cs-CZ": {
    previous: "Předchozí",
    next: "Další",
    selectedDateDescription: say("Vybrané datum: {date}"),
    selectedRangeDescription: say("Vybrané období: {dateRange}"),
    todayDate: say("Dnes, {date}"),
    todayDateSelected: say("Dnes, vybráno {date}"),
    dateSelected: say("Vybráno {date}"),
    minimumDate: "První dostupné datum",
    maximumDate: "Poslední dostupné datum",
    dateRange: say("{startDate} až {endDate}"),
  },
  "da-DK": {
    previous: "Forrige",
    next: "Næste",
    selectedDateDescription: say("Valgt dato: {date}"),
    selectedRangeDescription: say("Valgt interval: {dateRange}"),
    todayDate: say("I dag, {date}"),
    todayDateSelected: say("I dag, {date} valgt"),
    dateSelected: say("{date} valgt"),
    minimumDate: "Første ledige dato",
    maximumDate: "Sidste ledige dato",
    dateRange: say("{startDate} til {endDate}"),
  },
  "de-DE": {
    previous: "Zurück",
    next: "Weiter",
    selectedDateDescription: say("Ausgewähltes Datum: {date}"),
    selectedRangeDescription: say("Ausgewählter Bereich: {dateRange}"),
    todayDate: say("Heute, {date}"),
    todayDateSelected: say("Heute, {date} ausgewählt"),
    dateSelected: say("{date} ausgewählt"),
    minimumDate: "Erstes verfügbares Datum",
    maximumDate: "Letztes verfügbares Datum",
    dateRange: say("{startDate} bis {endDate}"),
  },
  "el-GR": {
    previous: "Προηγούμενο",
    next: "Επόμενο",
    selectedDateDescription: say("Επιλεγμένη ημερομηνία: {date}"),
    selectedRangeDescription: say("Επιλεγμένο εύρος: {dateRange}"),
    todayDate: say("Σήμερα, {date}"),
    todayDateSelected: say("Σήμερα, επιλέχτηκε {date}"),
    dateSelected: say("Επιλέχθηκε {date}"),
    minimumDate: "Πρώτη διαθέσιμη ημερομηνία",
    maximumDate: "Τελευταία διαθέσιμη ημερομηνία",
    dateRange: say("{startDate} έως {endDate}"),
  },
  "es-ES": {
    previous: "Anterior",
    next: "Siguiente",
    selectedDateDescription: say("Fecha seleccionada: {date}"),
    selectedRangeDescription: say("Intervalo seleccionado: {dateRange}"),
    todayDate: say("Hoy, {date}"),
    todayDateSelected: say("Hoy, {date} seleccionado"),
    dateSelected: say("{date} seleccionado"),
    minimumDate: "Primera fecha disponible",
    maximumDate: "Última fecha disponible",
    dateRange: say("{startDate} a {endDate}"),
  },
  "et-EE": {
    previous: "Eelmine",
    next: "Järgmine",
    selectedDateDescription: say("Valitud kuupäev: {date}"),
    selectedRangeDescription: say("Valitud vahemik: {dateRange}"),
    todayDate: say("Täna, {date}"),
    todayDateSelected: say("Täna, {date} valitud"),
    dateSelected: say("{date} valitud"),
    minimumDate: "Esimene saadaolev kuupäev",
    maximumDate: "Viimane saadaolev kuupäev",
    dateRange: say("{startDate} kuni {endDate}"),
  },
  "fi-FI": {
    previous: "Edellinen",
    next: "Seuraava",
    selectedDateDescription: say("Valittu päivämäärä: {date}"),
    selectedRangeDescription: say("Valittu aikaväli: {dateRange}"),
    todayDate: say("Tänään, {date}"),
    todayDateSelected: say("Tänään, {date} valittu"),
    dateSelected: say("{date} valittu"),
    minimumDate: "Ensimmäinen varattavissa oleva päivämäärä",
    maximumDate: "Viimeinen varattavissa oleva päivämäärä",
    dateRange: say("{startDate} – {endDate}"),
  },
  "fr-FR": {
    previous: "Précédent",
    next: "Suivant",
    selectedDateDescription: say("Date sélectionnée : {date}"),
    selectedRangeDescription: say("Plage sélectionnée : {dateRange}"),
    todayDate: say("Aujourd'hui, {date}"),
    todayDateSelected: say("Aujourd’hui, {date} sélectionné"),
    dateSelected: say("{date} sélectionné"),
    minimumDate: "Première date disponible",
    maximumDate: "Dernière date disponible",
    dateRange: say("{startDate} à {endDate}"),
  },
  "he-IL": {
    previous: "הקודם",
    next: "הבא",
    selectedDateDescription: say("תאריך נבחר: {date}"),
    selectedRangeDescription: say("טווח נבחר: {dateRange}"),
    todayDate: say("היום, {date}"),
    todayDateSelected: say("היום, {date} נבחר"),
    dateSelected: say("{date} נבחר"),
    minimumDate: "תאריך פנוי ראשון",
    maximumDate: "תאריך פנוי אחרון",
    dateRange: say("{startDate} עד {endDate}"),
  },
  "hr-HR": {
    previous: "Prethodni",
    next: "Sljedeći",
    selectedDateDescription: say("Odabrani datum: {date}"),
    selectedRangeDescription: say("Odabrani raspon: {dateRange}"),
    todayDate: say("Danas, {date}"),
    todayDateSelected: say("Danas, odabran {date}"),
    dateSelected: say("{date} odabran"),
    minimumDate: "Prvi raspoloživi datum",
    maximumDate: "Posljednji raspoloživi datum",
    dateRange: say("{startDate} do {endDate}"),
  },
  "hu-HU": {
    previous: "Előző",
    next: "Következő",
    selectedDateDescription: say("Kijelölt dátum: {date}"),
    selectedRangeDescription: say("Kijelölt tartomány: {dateRange}"),
    todayDate: say("Ma, {date}"),
    todayDateSelected: say("Ma, {date} kijelölve"),
    dateSelected: say("{date} kiválasztva"),
    minimumDate: "Az első elérhető dátum",
    maximumDate: "Utolsó elérhető dátum",
    dateRange: say("{startDate}–{endDate}"),
  },
  "it-IT": {
    previous: "Precedente",
    next: "Successivo",
    selectedDateDescription: say("Data selezionata: {date}"),
    selectedRangeDescription: say("Intervallo selezionato: {dateRange}"),
    todayDate: say("Oggi, {date}"),
    todayDateSelected: say("Oggi, {date} selezionata"),
    dateSelected: say("{date} selezionata"),
    minimumDate: "Prima data disponibile",
    maximumDate: "Ultima data disponibile",
    dateRange: say("Da {startDate} a {endDate}"),
  },
  "ja-JP": {
    previous: "前へ",
    next: "次へ",
    selectedDateDescription: say("選択した日付 : {date}"),
    selectedRangeDescription: say("選択範囲 : {dateRange}"),
    todayDate: say("本日、{date}"),
    todayDateSelected: say("本日、{date} を選択"),
    dateSelected: say("{date} を選択"),
    minimumDate: "最初の利用可能日",
    maximumDate: "最終利用可能日",
    dateRange: say("{startDate} から {endDate}"),
  },
  "ko-KR": {
    previous: "이전",
    next: "다음",
    selectedDateDescription: say("선택 일자: {date}"),
    selectedRangeDescription: say("선택 범위: {dateRange}"),
    todayDate: say("오늘, {date}"),
    todayDateSelected: say("오늘, {date} 선택됨"),
    dateSelected: say("{date} 선택됨"),
    minimumDate: "처음으로 사용 가능한 일자",
    maximumDate: "마지막으로 사용 가능한 일자",
    dateRange: say("{startDate} ~ {endDate}"),
  },
  "lt-LT": {
    previous: "Ankstesnis",
    next: "Paskesnis",
    selectedDateDescription: say("Pasirinkta data: {date}"),
    selectedRangeDescription: say("Pasirinktas intervalas: {dateRange}"),
    todayDate: say("Šiandien, {date}"),
    todayDateSelected: say("Šiandien, pasirinkta {date}"),
    dateSelected: say("Pasirinkta {date}"),
    minimumDate: "Pirmoji galima data",
    maximumDate: "Paskutinė galima data",
    dateRange: say("Nuo {startDate} iki {endDate}"),
  },
  "lv-LV": {
    previous: "Atpakaļ",
    next: "Tālāk",
    selectedDateDescription: say("Atlasītais datums: {date}"),
    selectedRangeDescription: say("Atlasītais diapazons: {dateRange}"),
    todayDate: say("Šodien, {date}"),
    todayDateSelected: say("Atlasīta šodiena, {date}"),
    dateSelected: say("Atlasīts: {date}"),
    minimumDate: "Pirmais pieejamais datums",
    maximumDate: "Pēdējais pieejamais datums",
    dateRange: say("No {startDate} līdz {endDate}"),
  },
  "nb-NO": {
    previous: "Forrige",
    next: "Neste",
    selectedDateDescription: say("Valgt dato: {date}"),
    selectedRangeDescription: say("Valgt område: {dateRange}"),
    todayDate: say("I dag, {date}"),
    todayDateSelected: say("I dag, {date} valgt"),
    dateSelected: say("{date} valgt"),
    minimumDate: "Første tilgjengelige dato",
    maximumDate: "Siste tilgjengelige dato",
    dateRange: say("{startDate} til {endDate}"),
  },
  "nl-NL": {
    previous: "Vorige",
    next: "Volgende",
    selectedDateDescription: say("Geselecteerde datum: {date}"),
    selectedRangeDescription: say("Geselecteerd bereik: {dateRange}"),
    todayDate: say("Vandaag, {date}"),
    todayDateSelected: say("Vandaag, {date} geselecteerd"),
    dateSelected: say("{date} geselecteerd"),
    minimumDate: "Eerste beschikbare datum",
    maximumDate: "Laatste beschikbare datum",
    dateRange: say("{startDate} tot {endDate}"),
  },
  "pl-PL": {
    previous: "Wstecz",
    next: "Dalej",
    selectedDateDescription: say("Wybrana data: {date}"),
    selectedRangeDescription: say("Wybrany zakres: {dateRange}"),
    todayDate: say("Dzisiaj, {date}"),
    todayDateSelected: say("Dzisiaj wybrano {date}"),
    dateSelected: say("Wybrano {date}"),
    minimumDate: "Pierwsza dostępna data",
    maximumDate: "Ostatnia dostępna data",
    dateRange: say("{startDate} do {endDate}"),
  },
  "pt-BR": {
    previous: "Anterior",
    next: "Próximo",
    selectedDateDescription: say("Data selecionada: {date}"),
    selectedRangeDescription: say("Intervalo selecionado: {dateRange}"),
    todayDate: say("Hoje, {date}"),
    todayDateSelected: say("Hoje, {date} selecionado"),
    dateSelected: say("{date} selecionado"),
    minimumDate: "Primeira data disponível",
    maximumDate: "Última data disponível",
    dateRange: say("{startDate} a {endDate}"),
  },
  "pt-PT": {
    previous: "Anterior",
    next: "Próximo",
    selectedDateDescription: say("Data selecionada: {date}"),
    selectedRangeDescription: say("Intervalo selecionado: {dateRange}"),
    todayDate: say("Hoje, {date}"),
    todayDateSelected: say("Hoje, {date} selecionado"),
    dateSelected: say("{date} selecionado"),
    minimumDate: "Primeira data disponível",
    maximumDate: "Última data disponível",
    dateRange: say("{startDate} a {endDate}"),
  },
  "ro-RO": {
    previous: "Înainte",
    next: "Următorul",
    selectedDateDescription: say("Dată selectată: {date}"),
    selectedRangeDescription: say("Interval selectat: {dateRange}"),
    todayDate: say("Astăzi, {date}"),
    todayDateSelected: say("Azi, {date} selectată"),
    dateSelected: say("{date} selectată"),
    minimumDate: "Prima dată disponibilă",
    maximumDate: "Ultima dată disponibilă",
    dateRange: say("De la {startDate} până la {endDate}"),
  },
  "ru-RU": {
    previous: "Назад",
    next: "Далее",
    selectedDateDescription: say("Выбранная дата: {date}"),
    selectedRangeDescription: say("Выбранный диапазон: {dateRange}"),
    todayDate: say("Сегодня, {date}"),
    todayDateSelected: say("Сегодня, выбрано {date}"),
    dateSelected: say("Выбрано {date}"),
    minimumDate: "Первая доступная дата",
    maximumDate: "Последняя доступная дата",
    dateRange: say("С {startDate} по {endDate}"),
  },
  "sk-SK": {
    previous: "Predchádzajúce",
    next: "Nasledujúce",
    selectedDateDescription: say("Vybratý dátum: {date}"),
    selectedRangeDescription: say("Vybratý rozsah: {dateRange}"),
    todayDate: say("Dnes {date}"),
    todayDateSelected: say("Vybratý dnešný dátum {date}"),
    dateSelected: say("Vybratý dátum {date}"),
    minimumDate: "Prvý dostupný dátum",
    maximumDate: "Posledný dostupný dátum",
    dateRange: say("Od {startDate} do {endDate}"),
  },
  "sl-SI": {
    previous: "Nazaj",
    next: "Naprej",
    selectedDateDescription: say("Izbrani datum: {date}"),
    selectedRangeDescription: say("Izbrano območje: {dateRange}"),
    todayDate: say("Danes, {date}"),
    todayDateSelected: say("Danes, {date} izbrano"),
    dateSelected: say("{date} izbrano"),
    minimumDate: "Prvi razpoložljivi datum",
    maximumDate: "Zadnji razpoložljivi datum",
    dateRange: say("{startDate} do {endDate}"),
  },
  "sr-SP": {
    previous: "Prethodni",
    next: "Sledeći",
    selectedDateDescription: say("Izabrani datum: {date}"),
    selectedRangeDescription: say("Izabrani period: {dateRange}"),
    todayDate: say("Danas, {date}"),
    todayDateSelected: say("Danas, izabran {date}"),
    dateSelected: say("{date} izabran"),
    minimumDate: "Prvi raspoloživi datum",
    maximumDate: "Zadnji raspoloživi datum",
    dateRange: say("{startDate} do {endDate}"),
  },
  "sv-SE": {
    previous: "Föregående",
    next: "Nästa",
    selectedDateDescription: say("Valt datum: {date}"),
    selectedRangeDescription: say("Valt intervall: {dateRange}"),
    todayDate: say("Idag, {date}"),
    todayDateSelected: say("Idag, {date} har valts"),
    dateSelected: say("{date} har valts"),
    minimumDate: "Första tillgängliga datum",
    maximumDate: "Sista tillgängliga datum",
    dateRange: say("{startDate} till {endDate}"),
  },
  "tr-TR": {
    previous: "Önceki",
    next: "Sonraki",
    selectedDateDescription: say("Seçilen Tarih: {date}"),
    selectedRangeDescription: say("Seçilen Aralık: {dateRange}"),
    todayDate: say("Bugün, {date}"),
    todayDateSelected: say("Bugün, {date} seçildi"),
    dateSelected: say("{date} seçildi"),
    minimumDate: "İlk müsait tarih",
    maximumDate: "Son müsait tarih",
    dateRange: say("{startDate} - {endDate}"),
  },
  "uk-UA": {
    previous: "Попередній",
    next: "Наступний",
    selectedDateDescription: say("Вибрана дата: {date}"),
    selectedRangeDescription: say("Вибраний діапазон: {dateRange}"),
    todayDate: say("Сьогодні, {date}"),
    todayDateSelected: say("Сьогодні, вибрано {date}"),
    dateSelected: say("Вибрано {date}"),
    minimumDate: "Перша доступна дата",
    maximumDate: "Остання доступна дата",
    dateRange: say("{startDate} — {endDate}"),
  },
  "zh-CN": {
    previous: "上一页",
    next: "下一页",
    selectedDateDescription: say("选定的日期：{date}"),
    selectedRangeDescription: say("选定的范围：{dateRange}"),
    todayDate: say("今天，即 {date}"),
    todayDateSelected: say("已选择今天，即 {date}"),
    dateSelected: say("已选择 {date}"),
    minimumDate: "第一个可用日期",
    maximumDate: "最后一个可用日期",
    dateRange: say("{startDate} 至 {endDate}"),
  },
  "zh-TW": {
    previous: "上一頁",
    next: "下一頁",
    selectedDateDescription: say("選定的日期：{date}"),
    selectedRangeDescription: say("選定的範圍：{dateRange}"),
    todayDate: say("今天，{date}"),
    todayDateSelected: say("已選取今天，{date}"),
    dateSelected: say("已選取 {date}"),
    minimumDate: "第一個可用日期",
    maximumDate: "最後一個可用日期",
    dateRange: say("{startDate} 至 {endDate}"),
  },
});
