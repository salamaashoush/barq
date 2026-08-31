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
 */

import {
  type Accessor,
  type Child,
  For,
  computed,
  context,
  effect,
  getContext,
  getOwner,
  type Incoming,
  isServer,
  provide,
  signal,
} from "@barqjs/core";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";
import { button } from "./button.tsx";
import {
  CalendarDate,
  constrainDate,
  endOfMonth,
  endOfWeek,
  getFirstDayOfWeek,
  getWeeksInMonth,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  today,
  type DateValue,
} from "./date.ts";
import { activeElement, ownerDocument } from "./dom.ts";
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

export interface CalendarStateOptions {
  value?: MaybeAccessor<CalendarDate | null | undefined>;
  defaultValue?: MaybeAccessor<CalendarDate | null | undefined>;
  focusedValue?: MaybeAccessor<CalendarDate | undefined>;
  defaultFocusedValue?: MaybeAccessor<CalendarDate | undefined>;
  minValue?: MaybeAccessor<DateValue | null | undefined>;
  maxValue?: MaybeAccessor<DateValue | null | undefined>;
  /** Days that exist but cannot be chosen: booked, closed, sold out. */
  isDateUnavailable?: (date: CalendarDate) => boolean;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  isReadOnly?: MaybeAccessor<boolean | undefined>;
  autoFocus?: MaybeAccessor<boolean | undefined>;
  /** Which day starts the week. Defaults to what the locale says. */
  firstDayOfWeek?: MaybeAccessor<number | undefined>;
  onChange?: (value: CalendarDate | null) => void;
  onFocusChange?: (date: CalendarDate) => void;
}

export interface CalendarState {
  value: Accessor<CalendarDate | null>;
  setValue(value: CalendarDate | null): void;
  focusedDate: Accessor<CalendarDate>;
  setFocusedDate(date: CalendarDate): void;
  /** The month on show, as a first and last day. */
  visibleRange: Accessor<DateRange>;
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

  const [focusedDate, setFocusedDateRaw] = controllable<CalendarDate>(
    () => access(options.focusedValue),
    () =>
      constrainDate(
        access(options.defaultFocusedValue) ?? value() ?? today(),
        access(options.minValue),
        access(options.maxValue),
      ),
    options.onFocusChange,
  );

  const isFocused = signal(access(options.autoFocus) === true);

  const isDisabled = (): boolean => access(options.isDisabled) === true;
  const isReadOnly = (): boolean => access(options.isReadOnly) === true;

  const visibleRange = (): DateRange => ({
    start: startOfMonth(focusedDate()),
    end: endOfMonth(focusedDate()),
  });

  const isCellDisabled = (date: CalendarDate): boolean => {
    if (isDisabled()) return true;
    const min = access(options.minValue);
    const max = access(options.maxValue);
    if (min !== undefined && min !== null && date.compare(min) < 0) return true;
    if (max !== undefined && max !== null && date.compare(max) > 0) return true;
    return false;
  };

  const isCellUnavailable = (date: CalendarDate): boolean => unavailable(options, date);

  /** Focus, held inside the allowed range rather than refused at its edge. */
  const setFocusedDate = (date: CalendarDate): void => {
    setFocusedDateRaw(constrainDate(date, access(options.minValue), access(options.maxValue)));
  };

  const move = (duration: Parameters<CalendarDate["add"]>[0]): void =>
    setFocusedDate(focusedDate().add(duration));

  const selectDate = (date: CalendarDate): void => {
    if (isReadOnly() || isDisabled()) return;
    if (isCellDisabled(date) || isCellUnavailable(date)) return;
    setValueRaw(date);
  };

  return {
    value,
    setValue: (next) => setValueRaw(next),
    focusedDate,
    setFocusedDate,
    visibleRange,
    isFocused,
    setFocused: (next) => isFocused.set(next),
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
      const min = access(options.minValue);
      if (min === undefined || min === null) return false;
      return visibleRange().start.subtract({ days: 1 }).compare(min) < 0;
    },
    isNextVisibleRangeInvalid: () => {
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
    focusSectionStart: () => setFocusedDate(startOfWeek(focusedDate(), firstDayOfWeek())),
    focusSectionEnd: () => setFocusedDate(endOfWeek(focusedDate(), firstDayOfWeek())),
    selectDate,
    selectFocusedDate: () => selectDate(focusedDate()),
    focusPreviousPage: () => move({ months: -1 }),
    focusNextPage: () => move({ months: 1 }),
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
  onChange?: (value: DateRange | null) => void;
}

export interface RangeCalendarState extends Omit<CalendarState, "value" | "setValue"> {
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

  const anchorDate = signal<CalendarDate | null>(null);
  const drawn = signal<DateRange | null>(null);

  const base = calendarState({
    ...(options as CalendarStateOptions),
    value: () => value()?.start ?? null,
    defaultValue: undefined,
    onChange: undefined,
  });

  const highlightedRange = (): DateRange | null => {
    const anchor = anchorDate();
    if (anchor === null) return value();
    return drawn();
  };

  /** Whether every day between two ends can be chosen. */
  const contiguous = (range: DateRange): boolean => {
    if (access(options.allowsNonContiguousRanges) === true) return true;
    for (let day = range.start; day.compare(range.end) <= 0; day = day.add({ days: 1 })) {
      if (base.isCellUnavailable(day)) return false;
    }
    return true;
  };

  const highlightDate = (date: CalendarDate): void => {
    const anchor = anchorDate();
    if (anchor === null) return;
    drawn.set(ordered(anchor, date));
  };

  const selectDate = (date: CalendarDate): void => {
    if (base.isReadOnly() || base.isDisabled()) return;
    if (base.isCellDisabled(date) || base.isCellUnavailable(date)) return;

    const anchor = anchorDate();
    if (anchor === null) {
      anchorDate.set(date);
      drawn.set({ start: date, end: date });
      return;
    }

    const range = ordered(anchor, date);
    anchorDate.set(null);
    drawn.set(null);
    // A range with something unavailable inside it is not a range the user can
    // have; the second press starts a new one rather than silently failing.
    if (!contiguous(range)) {
      anchorDate.set(date);
      drawn.set({ start: date, end: date });
      return;
    }
    setValueRaw(range);
  };

  return {
    ...base,
    value,
    setValue: (next) => setValueRaw(next),
    anchorDate,
    setAnchorDate: (date) => {
      anchorDate.set(date);
      drawn.set(date === null ? null : { start: date, end: date });
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
    setFocusedDate: (date) => {
      base.setFocusedDate(date);
      // While a range is being drawn, moving focus IS drawing it.
      if (anchorDate() !== null) highlightDate(base.focusedDate());
    },
  };
}

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
  /** The month on show, as a heading. */
  title: Accessor<string>;
  baseId: Accessor<string>;
}

export function calendar(
  options: CalendarOptions,
  state: CalendarState | RangeCalendarState,
): CalendarResult {
  const baseId = id();
  const errorMessageId = id();
  const titleFormat = dateFormatter({ month: "long", year: "numeric" });

  const title = (): string => titleFormat().format(state.visibleRange().start.toDate());

  if (!isServer) {
    // The month changing under a pointer press has nothing on screen to say
    // so; a screen reader user pressing "next" hears only the button.
    let previous = title();
    effect(() => {
      const current = title();
      if (current === previous) return;
      previous = current;
      if (!state.isFocused()) announce(current);
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
  "aria-label"?: MaybeAccessor<string | undefined>;
  "aria-labelledby"?: MaybeAccessor<string | undefined>;
}

export interface CalendarGridResult {
  gridProps: DOMProps;
  headerProps: DOMProps;
  /** The weekday names, from the locale, starting on its first day. */
  weekDays: Accessor<string[]>;
  weeksInMonth: Accessor<number>;
  /** Every day of a week row, including the ones outside the month. */
  weekDates: (week: number) => CalendarDate[];
}

export function calendarGrid(
  options: CalendarGridOptions,
  state: CalendarState | RangeCalendarState,
): CalendarGridResult {
  const locale = useLocale();
  const dayFormat = computed(() =>
    dateFormatter({ weekday: access(options.weekdayStyle) ?? "narrow" })(),
  );

  const weekDays = computed(() => {
    const start = startOfWeek(today(), state.firstDayOfWeek());
    return Array.from({ length: 7 }, (_, at) =>
      dayFormat().format(start.add({ days: at }).toDate()),
    );
  });

  const weeksInMonth = (): number =>
    getWeeksInMonth(state.visibleRange().start, state.firstDayOfWeek());

  const weekDates = (week: number): CalendarDate[] => {
    const first = startOfWeek(state.visibleRange().start, state.firstDayOfWeek());
    const start = first.add({ weeks: week });
    return Array.from({ length: 7 }, (_, at) => start.add({ days: at }));
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

  return {
    weekDays,
    weeksInMonth,
    weekDates,
    headerProps: { "aria-hidden": true },
    gridProps: {
      role: "grid",
      "aria-readonly": () => state.isReadOnly() || undefined,
      "aria-disabled": () => state.isDisabled() || undefined,
      "aria-label": () => access(options["aria-label"]),
      "aria-labelledby": () => access(options["aria-labelledby"]),
      onKeyDown,
      onFocusIn: () => state.setFocused(true),
      onFocusOut: () => state.setFocused(false),
    },
  };
}

export interface CalendarCellOptions {
  date: CalendarDate;
  ref: ElementRef;
  /** Rendered to keep the grid rectangular, but belonging to another month. */
  isOutsideMonth?: MaybeAccessor<boolean | undefined>;
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
  state: CalendarState | RangeCalendarState,
): CalendarCellResult {
  const labelFormat = dateFormatter({
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const dayFormat = dateFormatter({ day: "numeric" });

  const isOutside = (): boolean =>
    access(options.isOutsideMonth) === true ||
    !isSameMonth(options.date, state.visibleRange().start);

  const isDisabled = (): boolean => state.isCellDisabled(options.date) || isOutside();
  const isUnavailable = (): boolean => state.isCellUnavailable(options.date);
  const isSelectable = (): boolean => !isDisabled() && !isUnavailable();
  const isSelected = (): boolean => state.isSelected(options.date) && isSelectable();
  const isFocused = (): boolean => state.isCellFocused(options.date) && !isOutside();
  const isTodayCell = (): boolean => isToday(options.date);

  const highlighted = (): DateRange | null =>
    "highlightedRange" in state ? state.highlightedRange() : null;
  const isSelectionStart = (): boolean => {
    const range = highlighted();
    return isSelected() && range !== null && isSameDay(options.date, range.start);
  };
  const isSelectionEnd = (): boolean => {
    const range = highlighted();
    return isSelected() && range !== null && isSameDay(options.date, range.end);
  };

  if (!isServer) {
    // The state decides which day is focused; the DOM follows it, so the
    // arrows move focus without every cell having to watch the keyboard.
    effect(() => {
      if (!isFocused()) return;
      const element = access(options.ref) as HTMLElement | null;
      if (element === null) return;
      if (activeElement(ownerDocument(element)) !== element) focusSafely(element);
    });
  }

  const label = (): string => {
    let text = labelFormat().format(options.date.toDate());
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
    formattedDate: () => dayFormat().format(options.date.toDate()),
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
        isOutside()
          ? undefined
          : isFocused() || isSameDay(state.focusedDate(), options.date)
            ? 0
            : -1,
      onPointerEnter: () => {
        // Drawing a range follows the pointer, so the highlight is what the
        // user would get by releasing here.
        if ("highlightDate" in state && state.anchorDate() !== null) {
          state.highlightDate(options.date);
        }
      },
      onClick: () => {
        if (isOutside()) return;
        state.setFocusedDate(options.date);
        state.selectDate(options.date);
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface CalendarContextValue {
  state: CalendarState | RangeCalendarState;
  baseId: Accessor<string>;
}

const CalendarContext = context<CalendarContextValue | null>(null);

export function useCalendar(): CalendarContextValue {
  const value = getContext(CalendarContext);
  if (value === null || value === undefined) {
    throw new Error("This must be rendered inside a Calendar.");
  }
  return value;
}

function CalendarProvider(props: Incoming<{ value: CalendarContextValue; children?: Child }>) {
  const owner = getOwner();
  if (owner === null) return <>{props.children}</>;
  return provide(
    owner,
    CalendarContext,
    () => props.value(),
    () => props.children as unknown,
  ) as never;
}

export interface CalendarComponentProps extends StyleProps {
  value?: CalendarDate | null;
  defaultValue?: CalendarDate | null;
  focusedValue?: CalendarDate;
  defaultFocusedValue?: CalendarDate;
  minValue?: DateValue | null;
  maxValue?: DateValue | null;
  isDateUnavailable?: (date: CalendarDate) => boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  autoFocus?: boolean;
  firstDayOfWeek?: number;
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
    isDisabled: () => props.isDisabled?.(),
    isReadOnly: () => props.isReadOnly?.(),
    autoFocus: () => props.autoFocus?.(),
    firstDayOfWeek: () => props.firstDayOfWeek?.(),
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
    isDisabled: () => props.isDisabled?.(),
    isReadOnly: () => props.isReadOnly?.(),
    autoFocus: () => props.autoFocus?.(),
    firstDayOfWeek: () => props.firstDayOfWeek?.(),
    allowsNonContiguousRanges: () => props.allowsNonContiguousRanges?.(),
    onChange: (value) => props.onChange?.()?.(value),
    onFocusChange: (date) => props.onFocusChange?.()?.(date),
  });

  return <CalendarBody state={state} of={props as unknown as Incoming<CalendarComponentProps>} />;
}

interface CalendarBodyProps {
  state: CalendarState | RangeCalendarState;
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
          <For each={() => Array.from({ length: weeksInMonth() }, (_, week) => week)}>
            {(week: number) => (
              <div role="row">
                <For each={() => weekDates(week)}>
                  {(date: CalendarDate) => <CalendarCell date={date} />}
                </For>
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
  const date = props.date();

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
  } = calendarCell({ date, ref: domRef }, state);

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
