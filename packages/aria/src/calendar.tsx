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
  type Accessor,
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
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { button } from "./button.tsx";
import {
  CalendarDate,
  constrainDate,
  endOfMonth,
  endOfWeek,
  getDayOfWeek,
  getFirstDayOfWeek,
  getISOWeek,
  getMinimalDaysInFirstWeek,
  getWeekOfYear,
  getWeeksInMonth,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  today,
  type DateValue,
} from "./date.ts";
import { activeElement, contains, ownerDocument } from "./dom.ts";
import { focusRing } from "./focus.ts";
import { dateFormatter, useLocale } from "./i18n.ts";
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

export interface DateRange {
  start: CalendarDate;
  end: CalendarDate;
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
    return days.includes(getDayOfWeek(date));
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

export interface CalendarStateOptions {
  value?: MaybeAccessor<CalendarDate | null | undefined>;
  defaultValue?: MaybeAccessor<CalendarDate | null | undefined>;
  focusedValue?: MaybeAccessor<CalendarDate | undefined>;
  defaultFocusedValue?: MaybeAccessor<CalendarDate | undefined>;
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
  firstDayOfWeek?: MaybeAccessor<number | undefined>;
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
  today?: MaybeAccessor<CalendarDate | undefined>;
  /** The IANA zone today is reckoned in. Defaults to the local one. */
  timeZone?: MaybeAccessor<string | undefined>;
  onChange?: (value: CalendarDate | null) => void;
  onFocusChange?: (date: CalendarDate) => void;
}

export interface CalendarState {
  readonly selectionMode: "single";
  value: Accessor<CalendarDate | null>;
  setValue(value: CalendarDate | null): void;
  focusedDate: Accessor<CalendarDate>;
  setFocusedDate(date: CalendarDate): void;
  /** The months on show, as the first day of the first and the last of the last. */
  visibleRange: Accessor<DateRange>;
  visibleMonths: Accessor<number>;
  today: Accessor<CalendarDate>;
  /** Put a month on show, `position` months in from the first one. */
  showMonth(month: DateValue, position?: number): void;
  isFocused: Accessor<boolean>;
  setFocused(isFocused: boolean): void;
  firstDayOfWeek: Accessor<number>;
  isDisabled: Accessor<boolean>;
  isReadOnly: Accessor<boolean>;
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

type Duration = Parameters<CalendarDate["add"]>[0];

/** A month a page button or a caption asked for. Compared by identity. */
interface PageRequest {
  start: CalendarDate;
}

function unavailable(options: CalendarStateOptions, date: CalendarDate): boolean {
  return options.isDateUnavailable?.(date) === true;
}

export function calendarState(options: CalendarStateOptions): CalendarState {
  const locale = useLocale();

  const [value, setValueRaw] = controllable<CalendarDate | null>(
    () => access(options.value),
    () => access(options.defaultValue) ?? null,
    options.onChange,
  );

  const firstDayOfWeek = (): number =>
    access(options.firstDayOfWeek) ?? getFirstDayOfWeek(locale().locale);

  const todayDate = (): CalendarDate => access(options.today) ?? today(access(options.timeZone));
  const visibleMonths = (): number => Math.max(1, Math.floor(access(options.visibleMonths) ?? 1));

  const constrained = (date: CalendarDate): CalendarDate =>
    constrainDate(date, access(options.minValue), access(options.maxValue));

  const [rawFocusedDate, setFocusedDateRaw] = controllable<CalendarDate>(
    () => access(options.focusedValue),
    () => constrained(access(options.defaultFocusedValue) ?? value() ?? todayDate()),
    options.onFocusChange,
  );

  const [isFocused, setIsFocused] = createSignal(access(options.autoFocus) === true);

  const isDisabled = (): boolean => access(options.isDisabled) === true;
  const isReadOnly = (): boolean => access(options.isReadOnly) === true;

  const [requested, setRequested] = createSignal<PageRequest | null>(null);

  /** A first month kept inside the months that can be reached. */
  const bounded = (start: CalendarDate): CalendarDate => {
    const first = access(options.startMonth);
    const last = access(options.endMonth);
    let next = start;
    if (last !== undefined && last !== null) {
      const latest = startOfMonth(last).subtract({ months: visibleMonths() - 1 });
      if (next.compare(latest) > 0) next = latest;
    }
    if (first !== undefined && first !== null) {
      const earliest = startOfMonth(first);
      if (next.compare(earliest) < 0) next = earliest;
    }
    return next;
  };

  /** A first month moved just far enough for the window to hold a day. */
  const holding = (start: CalendarDate, date: CalendarDate): CalendarDate => {
    const month = startOfMonth(date);
    if (month.compare(start) < 0) return month;
    const last = start.add({ months: visibleMonths() - 1 });
    return month.compare(last) > 0 ? month.subtract({ months: visibleMonths() - 1 }) : start;
  };

  // Where the window begins. It stays where it was until the focused day leaves
  // it or a page is asked for, which is what lets focus cross from one visible
  // month into the next without the months changing places under it.
  const firstMonth = createMemo<{ start: CalendarDate; request: PageRequest | null }>(
    (previous) => {
      const request = requested();
      const kept = access(options.visibleMonth);
      if (kept !== undefined && kept !== null) return { start: startOfMonth(kept), request };

      const focused = rawFocusedDate();
      let from = startOfMonth(focused);
      if (previous !== undefined) {
        from = request !== null && request !== previous.request ? request.start : previous.start;
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
    const min = access(options.minValue);
    const max = access(options.maxValue);
    if (min !== undefined && min !== null && date.compare(min) < 0) return true;
    if (max !== undefined && max !== null && date.compare(max) > 0) return true;
    return options.isDateDisabled?.(date) === true;
  };

  const isCellUnavailable = (date: CalendarDate): boolean => unavailable(options, date);

  /** Focus, held inside the allowed range rather than refused at its edge. */
  const setFocusedDate = (date: CalendarDate): void => {
    const next = constrained(date);
    const current = untrack(visibleRange).start;
    const start = bounded(holding(current, next));
    setFocusedDateRaw(next);
    if (!isSameDay(start, current)) options.onVisibleMonthChange?.(start);
  };

  /** The window moved to begin at a month, and the focused day carried with it. */
  const showFrom = (month: CalendarDate): void => {
    const current = untrack(visibleRange).start;
    const start = bounded(month);
    if (isSameDay(start, current)) return;
    const months = (start.year - current.year) * 12 + start.month - current.month;
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
  const reachable = (date: CalendarDate, step: Duration): CalendarDate | null => {
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

  const land = (date: CalendarDate, step: Duration): void => {
    const next = reachable(date, step);
    if (next !== null) setFocusedDate(next);
  };

  const move = (duration: Duration): void => land(focusedDate().add(duration), duration);

  const selectDate = (date: CalendarDate): void => {
    if (isReadOnly() || isDisabled()) return;
    if (isCellDisabled(date) || isCellUnavailable(date)) return;
    const chosen = untrack(value);
    if (access(options.allowsDeselection) === true && chosen !== null && isSameDay(chosen, date)) {
      setValueRaw(null);
      return;
    }
    setValueRaw(date);
  };

  return {
    selectionMode: "single",
    value,
    setValue: (next) => setValueRaw(next),
    focusedDate,
    setFocusedDate,
    visibleRange,
    visibleMonths,
    today: todayDate,
    showMonth: (month, position = 0) =>
      showFrom(startOfMonth(month).subtract({ months: position })),
    isFocused,
    setFocused: (next) => setIsFocused(next),
    firstDayOfWeek,
    isDisabled,
    isReadOnly,
    isSelected: (date) => {
      const selected = value();
      return selected !== null && isSameDay(selected, date);
    },
    isCellFocused: (date) => isFocused() && isSameDay(focusedDate(), date),
    isCellDisabled,
    isCellUnavailable,
    isPreviousVisibleRangeInvalid: () => {
      const first = access(options.startMonth);
      if (first !== undefined && first !== null) {
        if (visibleRange().start.compare(startOfMonth(first)) <= 0) return true;
      }
      const min = access(options.minValue);
      if (min === undefined || min === null) return false;
      return visibleRange().start.subtract({ days: 1 }).compare(min) < 0;
    },
    isNextVisibleRangeInvalid: () => {
      const last = access(options.endMonth);
      if (last !== undefined && last !== null) {
        if (visibleRange().end.compare(endOfMonth(last)) >= 0) return true;
      }
      const max = access(options.maxValue);
      if (max === undefined || max === null) return false;
      return visibleRange().end.add({ days: 1 }).compare(max) > 0;
    },
    focusPreviousDay: () => move({ days: -1 }),
    focusNextDay: () => move({ days: 1 }),
    focusPreviousRow: () => move({ weeks: -1 }),
    focusNextRow: () => move({ weeks: 1 }),
    focusPreviousSection: (larger) => move(larger === true ? { years: -1 } : { months: -1 }),
    focusNextSection: (larger) => move(larger === true ? { years: 1 } : { months: 1 }),
    focusSectionStart: () => land(startOfWeek(focusedDate(), firstDayOfWeek()), { days: 1 }),
    focusSectionEnd: () => land(endOfWeek(focusedDate(), firstDayOfWeek()), { days: -1 }),
    selectDate,
    selectFocusedDate: () => selectDate(focusedDate()),
    focusPreviousPage: () => page(-1),
    focusNextPage: () => page(1),
  };
}

// ---------------------------------------------------------------------------
// A range of days
// ---------------------------------------------------------------------------

export interface RangeCalendarStateOptions extends Omit<
  CalendarStateOptions,
  "value" | "defaultValue" | "onChange"
> {
  value?: MaybeAccessor<DateRange | null | undefined>;
  defaultValue?: MaybeAccessor<DateRange | null | undefined>;
  /** Nothing between the ends may be unavailable. @default false */
  allowsNonContiguousRanges?: MaybeAccessor<boolean | undefined>;
  /** The fewest and the most days a range may cover, both ends counted. */
  minDays?: MaybeAccessor<number | undefined>;
  maxDays?: MaybeAccessor<number | undefined>;
  /** A switched-off day between the ends breaks the range. @default false */
  excludeDisabled?: MaybeAccessor<boolean | undefined>;
  onChange?: (value: DateRange | null) => void;
}

export interface RangeCalendarState extends Omit<
  CalendarState,
  "value" | "setValue" | "selectionMode"
> {
  readonly selectionMode: "range";
  value: Accessor<DateRange | null>;
  setValue(value: DateRange | null): void;
  /** Where a range being drawn began, or null when none is. */
  anchorDate: Accessor<CalendarDate | null>;
  setAnchorDate(date: CalendarDate | null): void;
  /** What the range currently covers: the value, or the drag in progress. */
  highlightedRange: Accessor<DateRange | null>;
  highlightDate(date: CalendarDate): void;
}

function ordered(a: CalendarDate, b: CalendarDate): DateRange {
  // A range drawn backwards is still a range: the anchor is where the user
  // started, not necessarily the earlier day.
  return a.compare(b) <= 0 ? { start: a, end: b } : { start: b, end: a };
}

export function rangeCalendarState(options: RangeCalendarStateOptions): RangeCalendarState {
  const [value, setValueRaw] = controllable<DateRange | null>(
    () => access(options.value),
    () => access(options.defaultValue) ?? null,
    options.onChange,
  );

  const [anchorDate, writeAnchorDate] = createSignal<CalendarDate | null>(null);
  const [drawn, setDrawn] = createSignal<DateRange | null>(null);

  const base = calendarState({
    ...(options as CalendarStateOptions),
    value: () => value()?.start ?? null,
    defaultValue: undefined,
    onChange: undefined,
    onFocusChange: (date) => {
      // While a range is being drawn, moving focus IS drawing it, whichever
      // way the focus moved: a press, an arrow key or a page button.
      if (untrack(anchorDate) !== null) highlightDate(date);
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
    const days = range.end.epochDay - range.start.epochDay + 1;
    const min = access(options.minDays);
    const max = access(options.maxDays);
    return (min === undefined || days >= min) && (max === undefined || days <= max);
  };

  const highlightDate = (date: CalendarDate): void => {
    const anchor = anchorDate();
    if (anchor === null) return;
    setDrawn(ordered(anchor, date));
  };

  const selectDate = (date: CalendarDate): void => {
    if (base.isReadOnly() || base.isDisabled()) return;
    if (base.isCellDisabled(date) || base.isCellUnavailable(date)) return;

    const anchor = anchorDate();
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

  return {
    ...base,
    selectionMode: "range",
    value,
    setValue: (next) => setValueRaw(next),
    anchorDate,
    setAnchorDate: (date) => {
      writeAnchorDate(date);
      setDrawn(date === null ? null : { start: date, end: date });
    },
    highlightedRange,
    highlightDate,
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

export interface MultipleCalendarStateOptions extends Omit<
  CalendarStateOptions,
  "value" | "defaultValue" | "onChange"
> {
  value?: MaybeAccessor<readonly CalendarDate[] | undefined>;
  defaultValue?: MaybeAccessor<readonly CalendarDate[] | undefined>;
  /** The fewest days that may be left chosen, and the most that may be. */
  min?: MaybeAccessor<number | undefined>;
  max?: MaybeAccessor<number | undefined>;
  /** The last chosen day cannot be taken away. @default false */
  required?: MaybeAccessor<boolean | undefined>;
  onChange?: (value: CalendarDate[]) => void;
}

export interface MultipleCalendarState extends Omit<
  CalendarState,
  "value" | "setValue" | "selectionMode"
> {
  readonly selectionMode: "multiple";
  /** The chosen days, in the order they were chosen. */
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
export function multipleCalendarState(
  options: MultipleCalendarStateOptions,
): MultipleCalendarState {
  const [value, setValueRaw] = controllable<readonly CalendarDate[]>(
    () => access(options.value),
    () => access(options.defaultValue) ?? [],
    (next) => options.onChange?.([...next]),
  );

  const base = calendarState({
    ...(options as CalendarStateOptions),
    value: () => value()[0] ?? null,
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

  return {
    ...base,
    selectionMode: "multiple",
    value,
    setValue: (next) => setValueRaw(next),
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
  const titleFormat = dateFormatter({ month: "long", year: "numeric" });

  const title = (): string => {
    const range = state.visibleRange();
    const first = range.start.toDate();
    if (state.visibleMonths() === 1) return titleFormat().format(first);
    return titleFormat().formatRange(first, startOfMonth(range.end).toDate());
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
    }),
    prevButtonProps: {
      "aria-label": "Previous month",
      isDisabled: () => state.isDisabled() || state.isPreviousVisibleRangeInvalid(),
      onPress: () => state.focusPreviousPage(),
    },
    nextButtonProps: {
      "aria-label": "Next month",
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
  const titleFormat = dateFormatter({ month: "long", year: "numeric" });

  const month = (): CalendarDate =>
    state.visibleRange().start.add({ months: access(options.monthOffset) ?? 0 });
  const dayFormat = createMemo(() =>
    dateFormatter({ weekday: access(options.weekdayStyle) ?? "narrow" })(),
  );

  const weekDays = createMemo(() => {
    const start = startOfWeek(today(), state.firstDayOfWeek());
    return Array.from({ length: 7 }, (_, at) =>
      dayFormat().format(start.add({ days: at }).toDate()),
    );
  });

  const weeksInMonth = (): number =>
    access(options.fixedWeeks) === true ? 6 : getWeeksInMonth(month(), state.firstDayOfWeek());

  const weekDates = (week: number): CalendarDate[] => {
    const first = startOfWeek(month(), state.firstDayOfWeek());
    const start = first.add({ weeks: week });
    return Array.from({ length: 7 }, (_, at) => start.add({ days: at }));
  };

  const weekNumber = (week: number): number => {
    const first = startOfWeek(month(), state.firstDayOfWeek()).add({ weeks: week });
    if (access(options.isoWeek) === true) return getISOWeek(first);
    return getWeekOfYear(first, state.firstDayOfWeek(), getMinimalDaysInFirstWeek(locale().locale));
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

  const title = (): string => titleFormat().format(month().toDate());

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
  const labelFormat = dateFormatter({
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const dayFormat = dateFormatter({ day: "numeric" });

  const date = (): CalendarDate => access(options.date);

  const isOutside = (): boolean =>
    access(options.isOutsideMonth) === true ||
    !isSameMonth(date(), access(options.month) ?? state.visibleRange().start);

  const isDisabled = (): boolean => state.isCellDisabled(date()) || isOutside();
  const isUnavailable = (): boolean => state.isCellUnavailable(date());
  const isSelectable = (): boolean => !isDisabled() && !isUnavailable();
  const isSelected = (): boolean => state.isSelected(date()) && isSelectable();
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
    let text = labelFormat().format(date().toDate());
    if (isTodayCell()) text = `Today, ${text}`;
    if (isSelected()) text = `${text}, selected`;
    return text;
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
    formattedDate: () => dayFormat().format(date().toDate()),
    cellProps: {
      role: "gridcell",
      "aria-selected": () => isSelected() || undefined,
      "aria-disabled": () => (!isSelectable() ? true : undefined),
    },
    buttonProps: {
      role: "button",
      // A day outside the month is scaffolding: hidden from the tree, so Down
      // from the last week reaches the next MONTH and not a duplicate.
      "aria-hidden": () => isOutside() || undefined,
      "aria-label": label,
      "aria-invalid": () => undefined,
      // The roving focus: one day in the Tab order, and it moves with the
      // arrows.
      tabIndex: () =>
        isOutside() ? undefined : isFocused() || isSameDay(state.focusedDate(), date()) ? 0 : -1,
      onPointerEnter: () => {
        // Drawing a range follows the pointer, so the highlight is what the
        // user would get by releasing here.
        if ("highlightDate" in state && state.anchorDate() !== null) {
          state.highlightDate(date());
        }
      },
      onClick: () => {
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

function CalendarProvider(props: Incoming<{ value: CalendarContextValue; children?: Child }>) {
  return provide(
    CalendarContext,
    () => props.value(),
    () => props.children as unknown,
  );
}

export interface CalendarComponentProps extends StyleProps {
  value?: CalendarDate | null;
  defaultValue?: CalendarDate | null;
  focusedValue?: CalendarDate;
  defaultFocusedValue?: CalendarDate;
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
  firstDayOfWeek?: number;
  /** Always six week rows. @default false */
  fixedWeeks?: boolean;
  /** The IANA zone today is reckoned in. Defaults to the local one. */
  timeZone?: string;
  /** @default "narrow" */
  weekdayStyle?: "narrow" | "short" | "long";
  errorMessage?: Child;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  ref?: RefTarget<HTMLDivElement>;
  onChange?: (value: CalendarDate | null) => void;
  onFocusChange?: (date: CalendarDate) => void;
}

/**
 * ```tsx
 * <Calendar aria-label="Departure" value={date()} onChange={date.set}
 *           minValue={today()} />
 * ```
 */
export function Calendar(props: Incoming<CalendarComponentProps>) {
  const state = calendarState({
    value: () => props.value?.(),
    defaultValue: () => props.defaultValue?.(),
    focusedValue: () => props.focusedValue?.(),
    defaultFocusedValue: () => props.defaultFocusedValue?.(),
    minValue: () => props.minValue?.(),
    maxValue: () => props.maxValue?.(),
    isDateUnavailable: callback<[CalendarDate], boolean>(props.isDateUnavailable),
    isDateDisabled: callback<[CalendarDate], boolean>(props.isDateDisabled),
    isDisabled: () => props.isDisabled?.(),
    isReadOnly: () => props.isReadOnly?.(),
    autoFocus: () => props.autoFocus?.(),
    allowsDeselection: () => props.allowsDeselection?.(),
    firstDayOfWeek: () => props.firstDayOfWeek?.(),
    timeZone: () => props.timeZone?.(),
    onChange: (value) => props.onChange?.()?.(value),
    onFocusChange: (date) => props.onFocusChange?.()?.(date),
  });

  return <CalendarBody state={state} of={props} />;
}

export interface RangeCalendarComponentProps extends Omit<
  CalendarComponentProps,
  "value" | "defaultValue" | "onChange"
> {
  value?: DateRange | null;
  defaultValue?: DateRange | null;
  allowsNonContiguousRanges?: boolean;
  onChange?: (value: DateRange | null) => void;
}

/**
 * Two days, and everything between them.
 *
 * The first press anchors, the second finishes. Moving the pointer or the
 * focus between the two DRAWS: what is highlighted is what releasing would
 * give, so the user is never guessing.
 */
export function RangeCalendar(props: Incoming<RangeCalendarComponentProps>) {
  const state = rangeCalendarState({
    value: () => props.value?.(),
    defaultValue: () => props.defaultValue?.(),
    focusedValue: () => props.focusedValue?.(),
    defaultFocusedValue: () => props.defaultFocusedValue?.(),
    minValue: () => props.minValue?.(),
    maxValue: () => props.maxValue?.(),
    isDateUnavailable: callback<[CalendarDate], boolean>(props.isDateUnavailable),
    isDateDisabled: callback<[CalendarDate], boolean>(props.isDateDisabled),
    isDisabled: () => props.isDisabled?.(),
    isReadOnly: () => props.isReadOnly?.(),
    autoFocus: () => props.autoFocus?.(),
    firstDayOfWeek: () => props.firstDayOfWeek?.(),
    timeZone: () => props.timeZone?.(),
    allowsNonContiguousRanges: () => props.allowsNonContiguousRanges?.(),
    onChange: (value) => props.onChange?.()?.(value),
    onFocusChange: (date) => props.onFocusChange?.()?.(date),
  });

  return <CalendarBody state={state} of={props as unknown as Incoming<CalendarComponentProps>} />;
}

export interface MultipleCalendarComponentProps extends Omit<
  CalendarComponentProps,
  "value" | "defaultValue" | "onChange"
> {
  value?: readonly CalendarDate[];
  defaultValue?: readonly CalendarDate[];
  /** The fewest days that may be left chosen, and the most that may be. */
  min?: number;
  max?: number;
  /** The last chosen day cannot be taken away. @default false */
  required?: boolean;
  onChange?: (value: CalendarDate[]) => void;
}

/**
 * Any number of days.
 *
 * Each press turns one day on or off and leaves the rest alone, and the grid
 * says it takes more than one so a screen reader does not announce a choice
 * as having replaced the last.
 */
export function MultipleCalendar(props: Incoming<MultipleCalendarComponentProps>) {
  const state = multipleCalendarState({
    value: () => props.value?.(),
    defaultValue: () => props.defaultValue?.(),
    focusedValue: () => props.focusedValue?.(),
    defaultFocusedValue: () => props.defaultFocusedValue?.(),
    minValue: () => props.minValue?.(),
    maxValue: () => props.maxValue?.(),
    isDateUnavailable: callback<[CalendarDate], boolean>(props.isDateUnavailable),
    isDateDisabled: callback<[CalendarDate], boolean>(props.isDateDisabled),
    isDisabled: () => props.isDisabled?.(),
    isReadOnly: () => props.isReadOnly?.(),
    autoFocus: () => props.autoFocus?.(),
    firstDayOfWeek: () => props.firstDayOfWeek?.(),
    timeZone: () => props.timeZone?.(),
    min: () => props.min?.(),
    max: () => props.max?.(),
    required: () => props.required?.(),
    onChange: (value) => props.onChange?.()?.(value),
    onFocusChange: (date) => props.onFocusChange?.()?.(date),
  });

  return <CalendarBody state={state} of={props as unknown as Incoming<CalendarComponentProps>} />;
}

interface CalendarBodyProps {
  state: AnyCalendarState;
  /** The calendar's own props, still as Cells. */
  of: Incoming<CalendarComponentProps>;
}

/** The heading, the two page buttons and the grid: what both calendars are. */
function CalendarBody(incoming: Incoming<CalendarBodyProps>) {
  const state = incoming.state();
  const props = incoming.of();
  const prevRef = makeRef<HTMLButtonElement>();
  const nextRef = makeRef<HTMLButtonElement>();

  const { calendarProps, prevButtonProps, nextButtonProps, errorMessageProps, title, baseId } =
    calendar(
      {
        "aria-label": () => props["aria-label"]?.(),
        "aria-labelledby": () => props["aria-labelledby"]?.(),
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
      <div {...elementProps} ref={mergeRefs(props.ref?.())}>
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
export function CalendarCell(props: Incoming<CalendarCellComponentProps>) {
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
  } = calendarCell({ date: () => props.date(), ref: domRef }, state);

  const { hoverProps, isHovered } = hover({ isDisabled });
  const { focusProps, isFocusVisible } = focusRing();

  const elementProps = mergeProps(
    buttonProps,
    hoverProps,
    focusProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
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
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <div {...cellProps}>
      <div {...elementProps} ref={mergeRefs(domRef.set, props.ref?.())}>
        {formattedDate}
      </div>
    </div>
  );
}
