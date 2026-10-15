import {
  calendar,
  calendarCell,
  calendarGrid,
  calendarState,
  dateMatches,
  multipleCalendarState,
  rangeCalendarState,
  type AnyCalendarState,
  type CalendarCellResult,
  type CalendarComponentProps,
  type CalendarStateOptions,
  type DateMatcher,
  type DateRange,
} from "@barqjs/aria/calendar";
import { button, type ButtonOptions } from "@barqjs/aria/button";
import { CalendarDate, startOfMonth, today } from "@barqjs/aria/date";
import { focusRing } from "@barqjs/aria/focus";
import { dateFormatter } from "@barqjs/aria/i18n";
import { hover } from "@barqjs/aria/interactions";
import {
  access,
  callback,
  filterDOMProps,
  fromProps,
  id,
  mergeProps,
  styleProps,
  type DOMProps,
  type MaybeAccessor,
} from "@barqjs/aria/utils";
import {
  createMemo,
  For,
  Repeat,
  Show,
  type Child,
  type Incoming,
  type JSXElement,
} from "@barqjs/core";
import { firstThatWorks, layer } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { ChevronLeft } from "@barqjs/lucide/icons/chevron-left";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { ref as makeRef, mergeRefs, type RefTarget } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { buttonVariants, type ButtonVariant } from "./button.tsx";
import { box } from "../lib/shared-box.ts";
import { text } from "../lib/shared-text.ts";
import { omit } from "../lib/slot.ts";

const ui = layer("barq.ui");

const root = ui({
  width: "fit-content",
  backgroundColor: "var(--background)",
  padding: "calc(var(--spacing) * 3)",
  "--cell-size": "calc(var(--spacing) * 8)",
  '[data-slot="card-content"] &': {
    backgroundColor: "transparent",
  },
  '[data-slot="popover-content"] &': {
    backgroundColor: "transparent",
  },
});

const months = ui({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 4)",
  "@media (width >= 48rem)": {
    "&": {
      flexDirection: "row",
    },
  },
});

const monthBox = ui({
  display: "flex",
  width: "100%",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 4)",
});

const nav = ui({
  position: "absolute",
  insetInline: "0px",
  top: "0px",
  display: "flex",
  width: "100%",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--spacing)",
});

const navButton = ui(box.noSelect, {
  width: "var(--cell-size)",
  height: "var(--cell-size)",
  padding: "0px",
  paddingBlock: "0px",
  paddingInline: "0px",
  '[aria-disabled="true"]': {
    opacity: "50%",
  },
  ':where(:dir(rtl), [dir="rtl"], [dir="rtl"] *) > svg': {
    rotate: "180deg",
  },
});

const monthCaption = ui({
  display: "flex",
  height: "var(--cell-size)",
  width: "100%",
  alignItems: "center",
  justifyContent: "center",
  paddingInline: "var(--cell-size)",
});

const captionLabel = ui(text.sm, text.medium, box.noSelect);

const monthGrid = ui({
  width: "100%",
  borderCollapse: "collapse",
});

const weekdays = ui({
  display: "flex",
});

const weekday = ui(box.noSelect, {
  flex: "1",
  borderRadius: "calc(var(--radius) * 0.8)",
  fontSize: "0.8rem",
  "--ui-font-weight": "var(--font-weight-normal)",
  fontWeight: "var(--font-weight-normal)",
  color: "var(--muted-foreground)",
});

const week = ui({
  marginTop: "calc(var(--spacing) * 2)",
  display: "flex",
  width: "100%",
});

const day = ui(box.noSelect, {
  position: "relative",
  aspectRatio: "1 / 1",
  height: "100%",
  width: "100%",
  padding: "0px",
  textAlign: "center",
  "[data-disabled]": {
    color: "var(--muted-foreground)",
    opacity: "50%",
  },
  "[data-outside-month]": {
    color: "var(--muted-foreground)",
  },
  '[data-outside-month][aria-selected="true"]': {
    color: "var(--muted-foreground)",
  },
  "[data-range-end]": {
    borderStartEndRadius: "calc(var(--radius) * 0.8)",
    borderEndEndRadius: "calc(var(--radius) * 0.8)",
    backgroundColor: "var(--accent)",
  },
  "[data-range-middle]": {
    borderRadius: "0",
  },
  "[data-range-start]": {
    borderStartStartRadius: "calc(var(--radius) * 0.8)",
    borderEndStartRadius: "calc(var(--radius) * 0.8)",
    backgroundColor: "var(--accent)",
  },
  "[data-today]": {
    borderRadius: "calc(var(--radius) * 0.8)",
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  "[data-today][data-selected]": {
    borderRadius: "0",
  },
  ':last-child[data-selected] [data-slot="calendar-day-button"]': {
    borderStartEndRadius: "calc(var(--radius) * 0.8)",
    borderEndEndRadius: "calc(var(--radius) * 0.8)",
  },
});

const dayFirst = ui({
  ':first-child[data-selected] [data-slot="calendar-day-button"]': {
    borderStartStartRadius: "calc(var(--radius) * 0.8)",
    borderEndStartRadius: "calc(var(--radius) * 0.8)",
  },
});

// With week numbers the row's first child is the number, not a day.
const dayAfterNumber = ui({
  ':nth-child(2)[data-selected] [data-slot="calendar-day-button"]': {
    borderStartStartRadius: "calc(var(--radius) * 0.8)",
    borderEndStartRadius: "calc(var(--radius) * 0.8)",
  },
});

const dayButton = ui({
  display: "flex",
  aspectRatio: "1 / 1",
  width: firstThatWorks("100%", "auto"),
  height: "auto",
  minWidth: "var(--cell-size)",
  flexDirection: "column",
  gap: "var(--spacing)",
  "--ui-leading": "1",
  lineHeight: "1",
  "--ui-font-weight": "var(--font-weight-normal)",
  fontWeight: "var(--font-weight-normal)",
  "[data-range-end]": {
    borderRadius: "calc(var(--radius) * 0.8)",
    borderStartEndRadius: "calc(var(--radius) * 0.8)",
    borderEndEndRadius: "calc(var(--radius) * 0.8)",
    backgroundColor: "var(--primary)",
    color: "var(--primary-foreground)",
  },
  "[data-range-middle]": {
    borderRadius: "0",
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  "[data-range-start]": {
    borderRadius: "calc(var(--radius) * 0.8)",
    borderStartStartRadius: "calc(var(--radius) * 0.8)",
    borderEndStartRadius: "calc(var(--radius) * 0.8)",
    backgroundColor: "var(--primary)",
    color: "var(--primary-foreground)",
  },
  "[data-selected-single]": {
    backgroundColor: "var(--primary)",
    color: "var(--primary-foreground)",
  },
  "@media (hover: hover)": {
    ":is(.dark *):hover": {
      color: "var(--accent-foreground)",
    },
  },
  "& > span": {
    fontSize: "var(--text-xs)",
    lineHeight: "var(--ui-leading, var(--text-xs--line-height))",
    opacity: "70%",
  },
  '[data-slot="calendar-day"][data-focused] &': {
    position: "relative",
    zIndex: "10",
    borderColor: "var(--ring)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    boxShadow:
      "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
    "--ui-ring-color": "var(--ring)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
    },
  },
});

const dropdowns = ui(text.sm, text.medium, {
  display: "flex",
  height: "var(--cell-size)",
  width: "100%",
  alignItems: "center",
  justifyContent: "center",
  gap: "calc(var(--spacing) * 1.5)",
});

const dropdownRoot = ui({
  position: "relative",
  borderRadius: "calc(var(--radius) * 0.8)",
  borderStyle: "var(--ui-border-style)",
  borderWidth: "1px",
  borderColor: "var(--input)",
  "--ui-shadow": "0 1px 2px 0 var(--ui-shadow-color, rgb(0 0 0 / 0.05))",
  boxShadow:
    "var(--ui-inset-shadow), var(--ui-inset-ring-shadow), var(--ui-ring-offset-shadow), var(--ui-ring-shadow), var(--ui-shadow)",
  ":has(:focus)": {
    borderColor: "var(--ring)",
    "--ui-ring-shadow":
      "var(--ui-ring-inset,) 0 0 0 calc(3px + var(--ui-ring-offset-width)) var(--ui-ring-color, currentcolor)",
    "--ui-ring-color": "var(--ring)",
    "@supports (color: color-mix(in lab, red, red))": {
      "--ui-ring-color": "color-mix(in oklab, var(--ring) 50%, transparent)",
    },
  },
});

const dropdown = ui({
  position: "absolute",
  inset: "0px",
  backgroundColor: "var(--popover)",
  opacity: "0%",
});

const dropdownLabel = ui(text.sm, text.medium, box.noSelect, {
  display: "flex",
  height: "calc(var(--spacing) * 8)",
  alignItems: "center",
  gap: "var(--spacing)",
  borderRadius: "calc(var(--radius) * 0.8)",
  paddingInlineStart: "calc(var(--spacing) * 2)",
  paddingInlineEnd: "var(--spacing)",
  "& > svg": {
    width: "calc(var(--spacing) * 3.5)",
    height: "calc(var(--spacing) * 3.5)",
    color: "var(--muted-foreground)",
  },
});

const weekNumberHeader = ui(box.noSelect, {
  width: "var(--cell-size)",
});

const weekNumberCell = ui(box.noSelect, {
  fontSize: "0.8rem",
  color: "var(--muted-foreground)",
});

const weekNumberInner = ui({
  display: "flex",
  width: "var(--cell-size)",
  height: "var(--cell-size)",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
});

const hidden = ui({
  visibility: "hidden",
});

const footer = ui(text.sm, {
  marginTop: "calc(var(--spacing) * 3)",
});

export type CalendarMode = "single" | "multiple" | "range";

/** The month and year as a heading, as two selects, or as one select and a word. */
export type CalendarCaptionLayout = "label" | "dropdown" | "dropdown-months" | "dropdown-years";

/** What a day is, for a caller drawing its own. */
export interface CalendarDayModifiers {
  selected: boolean;
  today: boolean;
  disabled: boolean;
  unavailable: boolean;
  outside: boolean;
  focused: boolean;
  rangeStart: boolean;
  rangeEnd: boolean;
  rangeMiddle: boolean;
}

export interface CalendarFormatters {
  /** The heading over a month. Defaults to the month and year in the locale. */
  formatCaption?: (month: CalendarDate) => string;
  /** A month in the caption's select. Defaults to its short name in the locale. */
  formatMonthDropdown?: (month: CalendarDate) => string;
  /** A year in the caption's select, handed the first day of that year. */
  formatYearDropdown?: (year: CalendarDate) => string;
  formatWeekNumber?: (week: number) => string;
  /** The number drawn in a day. Its accessible name stays the whole date. */
  formatDay?: (date: CalendarDate) => string;
}

interface Shared {
  /** The variant the two month buttons take. @default "ghost" */
  buttonVariant?: ButtonVariant;
  /** The variant every day takes. @default "ghost" */
  dayButtonVariant?: ButtonVariant;
  /** Draw the days either side of the month. @default true */
  showOutsideDays?: boolean;
  /** @default "label" */
  captionLayout?: CalendarCaptionLayout;
  /** How many months are drawn side by side. @default 1 */
  numberOfMonths?: number;
  /** The arrows turn every month on show at once. @default false */
  pagedNavigation?: boolean;
  /** Head each row with the number of its week. @default false */
  showWeekNumber?: boolean;
  /** Number the weeks by ISO 8601 rather than by the locale. @default false */
  ISOWeek?: boolean;
  /** Which day starts the week, Sunday as 0. Another name for `firstDayOfWeek`. */
  weekStartsOn?: number;
  /**
   * Days that cannot be chosen and that the arrow keys step over: a day, a
   * list, a range, `{ before }`, `{ after }`, `{ dayOfWeek }` or a function.
   * `isDisabled` is the whole calendar; this is some of its days.
   */
  disabled?: DateMatcher;
  /**
   * The first and last month the arrows and the selects reach. With a select in
   * the caption they default to a hundred years back and the end of this year.
   */
  startMonth?: CalendarDate;
  endMonth?: CalendarDate;
  /** The first month on show, kept by the caller. Pair it with `onMonthChange`. */
  month?: CalendarDate;
  /** The month to open on. Another name for `defaultFocusedValue`. */
  defaultMonth?: CalendarDate;
  onMonthChange?: (month: CalendarDate) => void;
  /** Which day is marked as today. Defaults to today in `timeZone`. */
  today?: CalendarDate;
  /** Days to mark: each name becomes a `data-<name>` attribute on its cells. */
  modifiers?: Record<string, DateMatcher>;
  /** A class for the cells a modifier matches, by the modifier's name. */
  modifiersClassNames?: Record<string, string>;
  hideNavigation?: boolean;
  /** The arrows are drawn and do nothing, and the keyboard stays in the months on show. */
  disableNavigation?: boolean;
  /** With several months on show, the latest is drawn first. @default false */
  reverseMonths?: boolean;
  /** Days drawn as nothing: they keep their place in the row and cannot be reached. */
  hidden?: DateMatcher;
  /** A day was pressed, enabled or not, with what it is. */
  onDayClick?: (date: CalendarDate, modifiers: CalendarDayModifiers) => void;
  /** The next-month arrow was pressed, with the first month now on show. */
  onNextClick?: (month: CalendarDate) => void;
  /** The previous-month arrow was pressed, with the first month now on show. */
  onPrevClick?: (month: CalendarDate) => void;
  hideWeekdays?: boolean;
  /** Drawn under the months. */
  footer?: Child;
  formatters?: CalendarFormatters;
  /** What goes inside a day, in place of its number. */
  renderDay?: (date: CalendarDate, modifiers: CalendarDayModifiers) => Child;
}

interface CalendarBaseProps
  extends Omit<CalendarComponentProps, "value" | "defaultValue" | "onChange" | "hidden">, Shared {}

export interface CalendarProps extends CalendarBaseProps {
  /** Read once, when the calendar is built. @default "single" */
  mode?: "single";
  value?: CalendarDate | null;
  defaultValue?: CalendarDate | null;
  onChange?: (value: CalendarDate | null) => void;
  /** Another name for `value`. */
  selected?: CalendarDate | null;
  /** Another name for `onChange`. */
  onSelect?: (value: CalendarDate | null) => void;
  /** A second press on the chosen day leaves it chosen. @default true */
  required?: boolean;
}

export interface MultipleCalendarProps extends CalendarBaseProps {
  mode?: "multiple";
  value?: readonly CalendarDate[];
  defaultValue?: readonly CalendarDate[];
  onChange?: (value: CalendarDate[]) => void;
  selected?: readonly CalendarDate[];
  onSelect?: (value: CalendarDate[]) => void;
  /** The fewest days that may be left chosen, and the most that may be. */
  min?: number;
  max?: number;
  /** The last chosen day cannot be taken away. @default false */
  required?: boolean;
}

export interface RangeCalendarProps extends CalendarBaseProps {
  mode?: "range";
  value?: DateRange | null;
  defaultValue?: DateRange | null;
  onChange?: (value: DateRange | null) => void;
  selected?: DateRange | null;
  onSelect?: (value: DateRange | null) => void;
  allowsNonContiguousRanges?: boolean;
  /**
   * How many days apart the two ends must be at least, and may be at most. A
   * `min` of 1 allows any range, as it does upstream.
   */
  min?: number;
  max?: number;
  /** A switched-off day between the ends breaks the range. @default false */
  excludeDisabled?: boolean;
}

type ModeProps =
  | Incoming<CalendarProps>
  | Incoming<MultipleCalendarProps & { mode: "multiple" }>
  | Incoming<RangeCalendarProps & { mode: "range" }>;

/**
 * A matcher as the caller wrote it.
 *
 * Every prop arrives behind a Cell except a callback, which arrives as itself,
 * and a matcher can be either: `{ dayOfWeek: 0 }` or `(date) => …`. The two
 * are told apart the way `callback` tells them, by arity.
 */
function matcher(given: MaybeAccessor<DateMatcher | undefined>): DateMatcher | undefined {
  if (typeof given !== "function") return given;
  if (given.length === 0) return (given as () => DateMatcher | undefined)();
  return given as (date: CalendarDate) => boolean;
}

/** `value`, or `selected` when the caller used upstream's name for it. */
function chosen<T>(
  value: (() => T | undefined) | undefined,
  selected: typeof value,
): T | undefined {
  const own = value?.();
  return own === undefined ? selected?.() : own;
}

// A select has to end somewhere. Upstream's answer is a century back to the
// end of this year, which suits a date of birth and little else, so a caller
// with another purpose passes `startMonth` and `endMonth`.
const earliest = (now: CalendarDate): CalendarDate => new CalendarDate(now.year - 100, 1, 1);
const latest = (now: CalendarDate): CalendarDate => new CalendarDate(now.year, 12, 1);

/** What all three states are built from. */
function sharedOptions(
  props: Incoming<CalendarBaseProps>,
): Omit<CalendarStateOptions, "value" | "defaultValue" | "onChange"> {
  const own = callback<[CalendarDate], boolean>(props.isDateDisabled);
  const hasSelect = (): boolean => (props.captionLayout?.() ?? "label") !== "label";
  const now = (): CalendarDate => props.today?.() ?? today(props.timeZone?.());
  // With navigation off, the months on show when the calendar was built are
  // the only ones there are: the arrows, the selects and the keyboard all stop
  // at their edges.
  const shown = props.month?.() ?? props.defaultFocusedValue?.() ?? props.defaultMonth?.() ?? now();
  const pinned = (): { start: CalendarDate; end: CalendarDate } | undefined => {
    if (props.disableNavigation?.() !== true) return undefined;
    const start = shown.set({ day: 1 });
    return { start, end: start.add({ months: (props.numberOfMonths?.() ?? 1) - 1 }) };
  };

  return {
    focusedValue: () => props.focusedValue?.(),
    defaultFocusedValue: () => props.defaultFocusedValue?.() ?? props.defaultMonth?.(),
    minValue: () => props.minValue?.(),
    maxValue: () => props.maxValue?.(),
    isDateUnavailable: callback<[CalendarDate], boolean>(props.isDateUnavailable),
    isDateDisabled: (date) =>
      dateMatches(date, matcher(props.disabled)) ||
      dateMatches(date, matcher(props.hidden)) ||
      own?.(date) === true,
    isDisabled: () => props.isDisabled?.(),
    isReadOnly: () => props.isReadOnly?.(),
    autoFocus: () => props.autoFocus?.(),
    firstDayOfWeek: () => props.firstDayOfWeek?.() ?? props.weekStartsOn?.(),
    visibleMonths: () => props.numberOfMonths?.(),
    pagedNavigation: () => props.pagedNavigation?.(),
    visibleMonth: () => props.month?.(),
    onVisibleMonthChange: (month) => props.onMonthChange?.()?.(month),
    startMonth: () =>
      pinned()?.start ?? props.startMonth?.() ?? (hasSelect() ? earliest(now()) : undefined),
    endMonth: () =>
      pinned()?.end ?? props.endMonth?.() ?? (hasSelect() ? latest(now()) : undefined),
    today: () => props.today?.(),
    timeZone: () => props.timeZone?.(),
    onFocusChange: (date) => props.onFocusChange?.()?.(date),
  };
}

/**
 * ```tsx
 * <Calendar aria-label="Departure" value={date()} onChange={date.set} />
 * <Calendar mode="multiple" aria-label="Shifts" numberOfMonths={2} />
 * <Calendar aria-label="Date of birth" captionLayout="dropdown" />
 * ```
 *
 * The month name, the two arrows, the weekday row and the grid, with the
 * keyboard and the roving focus from `@barqjs/aria`. `mode` chooses between one
 * day, several and a range, and is read once: a calendar does not change what
 * its value is while it is on screen.
 *
 * Days are {@link CalendarDate}s rather than `Date`s, and a range is
 * `{ start, end }`.
 */
export function Calendar(props: Incoming<CalendarProps>): JSXElement;
export function Calendar(props: Incoming<MultipleCalendarProps & { mode: "multiple" }>): JSXElement;
export function Calendar(props: Incoming<RangeCalendarProps & { mode: "range" }>): JSXElement;
export function Calendar(props: ModeProps): JSXElement {
  const mode: CalendarMode = props.mode?.() ?? "single";
  if (mode === "multiple")
    return <MultipleCalendar {...(props as Incoming<MultipleCalendarProps>)} />;
  if (mode === "range") return <RangeCalendar {...(props as Incoming<RangeCalendarProps>)} />;
  return <SingleCalendar {...(props as Incoming<CalendarProps>)} />;
}

function SingleCalendar(props: Incoming<CalendarProps>) {
  const state = calendarState({
    ...sharedOptions(props),
    value: () => chosen(props.value, props.selected),
    defaultValue: () => props.defaultValue?.(),
    allowsDeselection: () => props.required?.() === false,
    onChange: (value) => {
      props.onChange?.()?.(value);
      props.onSelect?.()?.(value);
    },
  });

  return <CalendarShell state={state} of={props} />;
}

/**
 * Any number of days, each pressed on and off on its own. `<Calendar
 * mode="multiple">` is this.
 */
export function MultipleCalendar(props: Incoming<MultipleCalendarProps>) {
  const state = multipleCalendarState({
    ...sharedOptions(props),
    value: () => chosen(props.value, props.selected),
    defaultValue: () => props.defaultValue?.(),
    min: () => props.min?.(),
    max: () => props.max?.(),
    required: () => props.required?.(),
    onChange: (value) => {
      props.onChange?.()?.(value);
      props.onSelect?.()?.(value);
    },
  });

  return <CalendarShell state={state} of={props} />;
}

/**
 * Two days and everything between them. The first press anchors, the second
 * finishes, and moving the pointer between the two draws what releasing would
 * give. `<Calendar mode="range">` is this.
 */
export function RangeCalendar(props: Incoming<RangeCalendarProps>) {
  const state = rangeCalendarState({
    ...sharedOptions(props),
    value: () => chosen(props.value, props.selected),
    defaultValue: () => props.defaultValue?.(),
    allowsNonContiguousRanges: () => props.allowsNonContiguousRanges?.(),
    // Upstream counts the days BETWEEN the ends, so a stay of two nights is a
    // `min` of 2 and covers three days. It also ignores a `min` of 1.
    minDays: () => {
      const min = props.min?.();
      return min === undefined || min <= 1 ? undefined : min + 1;
    },
    maxDays: () => {
      const max = props.max?.();
      return max === undefined || max <= 0 ? undefined : max + 1;
    },
    excludeDisabled: () => props.excludeDisabled?.(),
    onChange: (value) => {
      props.onChange?.()?.(value);
      props.onSelect?.()?.(value);
    },
  });

  return <CalendarShell state={state} of={props} />;
}

interface ShellProps {
  state: AnyCalendarState;
  /** The calendar's own props, still as Cells. */
  of: Incoming<CalendarBaseProps>;
}

/**
 * The DOM every calendar shares.
 *
 * `@barqjs/aria`'s own `<Calendar>` is not used: shadcn's stylesheet wants a
 * class on the cell AND on the button inside it, a nav laid over the caption,
 * and a month wrapper, none of which that component renders. The hooks
 * underneath it are the same ones.
 */
function CalendarShell(incoming: Incoming<ShellProps>) {
  const state = incoming.state();
  const props = incoming.of();
  const prevRef = makeRef<HTMLButtonElement>();
  const nextRef = makeRef<HTMLButtonElement>();

  const { calendarProps, prevButtonProps, nextButtonProps, errorMessageProps } = calendar(
    {
      "aria-label": () => props["aria-label"]?.(),
      "aria-labelledby": () => props["aria-labelledby"]?.(),
    },
    state,
  );

  // The month the press is going to: the graph has not settled when the press
  // handler returns, so the state cannot be asked yet.
  const navigation = (
    own: DOMProps,
    direction: 1 | -1,
    heard: () => ((month: CalendarDate) => void) | undefined,
  ): ButtonOptions => ({
    ...(own as ButtonOptions),
    isDisabled: () =>
      props.disableNavigation?.() === true || access(own.isDisabled as MaybeAccessor<boolean>),
    onPress: (event) => {
      const step = props.pagedNavigation?.() === true ? state.visibleMonths() : 1;
      const going = state.visibleRange().start.add({ months: step * direction });
      (own.onPress as ((event: unknown) => void) | undefined)?.(event);
      heard()?.(going);
    },
  });
  const previous = button(
    navigation(prevButtonProps, -1, () => props.onPrevClick?.()),
    prevRef,
  );
  const next = button(
    navigation(nextButtonProps, 1, () => props.onNextClick?.()),
    nextRef,
  );
  const navClass = (): string =>
    ui(buttonVariants({ variant: props.buttonVariant?.() ?? "ghost" }), navButton);

  const offsets = createMemo(() => {
    const all = Array.from({ length: state.visibleMonths() }, (_, at) => at);
    return props.reverseMonths?.() === true ? all.toReversed() : all;
  });

  const elementProps = mergeProps(
    calendarProps,
    // `hidden` is react-day-picker's matcher here, not the attribute that
    // would hide the whole calendar.
    filterDOMProps(fromProps(omit(props, ["hidden"])), { global: true }),
    styleProps(props),
    {
      "data-slot": () => props["data-slot"]?.() ?? "calendar",
      "data-mode": state.selectionMode,
      "data-disabled": () => props.isDisabled?.() === true,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <div
      {...elementProps}
      class={ui(root, "group/calendar", props.class?.(), props.className?.())}
      ref={mergeRefs(props.ref?.())}
    >
      <div data-slot="calendar-months" class={months}>
        <Show when={props.hideNavigation?.() !== true}>
          <div data-slot="calendar-nav" class={nav}>
            <button
              {...previous.buttonProps}
              type="button"
              data-slot="calendar-nav-previous"
              class={navClass()}
              ref={prevRef.set}
            >
              <ChevronLeft />
            </button>
            <button
              {...next.buttonProps}
              type="button"
              data-slot="calendar-nav-next"
              class={navClass()}
              ref={nextRef.set}
            >
              <ChevronRight />
            </button>
          </div>
        </Show>
        <For each={() => offsets()}>
          {(offset: number) => <CalendarMonth state={state} of={props} offset={offset} />}
        </For>
      </div>
      <Show when={props.footer !== undefined}>
        <div data-slot="calendar-footer" class={footer}>
          {props.footer}
        </div>
      </Show>
      <span {...errorMessageProps}>{props.errorMessage}</span>
    </div>
  );
}

interface MonthProps extends ShellProps {
  /** Which of the months on show this is, counted from the first. */
  offset: number;
}

/** One month: its caption, its weekday row and its grid of weeks. */
function CalendarMonth(incoming: Incoming<MonthProps>) {
  const state = incoming.state();
  const props = incoming.of();
  const titleId = id();
  const hasSelect = (): boolean => (props.captionLayout?.() ?? "label") !== "label";

  const { gridProps, headerProps, month, title, weekDays, weeksInMonth, weekDates, weekNumber } =
    calendarGrid(
      {
        weekdayStyle: () => props.weekdayStyle?.() ?? "short",
        monthOffset: () => incoming.offset(),
        fixedWeeks: () => props.fixedWeeks?.(),
        isoWeek: () => props.ISOWeek?.(),
        "aria-labelledby": () => (hasSelect() ? undefined : titleId()),
      },
      state,
    );

  const caption = (): string => props.formatters?.()?.formatCaption?.(month()) ?? title();
  const numbered = (): boolean => props.showWeekNumber?.() === true;
  const weekLabel = (row: number): string => {
    const number = weekNumber(row);
    return props.formatters?.()?.formatWeekNumber?.(number) ?? String(number);
  };

  return (
    <div data-slot="calendar-month" class={monthBox}>
      <div data-slot="calendar-month-caption" class={monthCaption}>
        <Show
          when={hasSelect()}
          fallback={
            <h2 id={titleId} data-slot="calendar-caption-label" class={captionLabel}>
              {caption}
            </h2>
          }
        >
          <CalendarDropdowns state={state} of={props} offset={incoming.offset()} month={month()} />
        </Show>
      </div>

      <div {...gridProps} data-slot="calendar-month-grid" class={monthGrid}>
        <Show when={props.hideWeekdays?.() !== true}>
          <div {...headerProps} role="row" data-slot="calendar-weekdays" class={weekdays}>
            <Show when={numbered()}>
              <div
                role="columnheader"
                aria-label="Week number"
                data-slot="calendar-week-number-header"
                class={weekNumberHeader}
              />
            </Show>
            <For each={() => weekDays()}>
              {(name: string) => (
                <div
                  role="columnheader"
                  aria-label={name}
                  data-slot="calendar-weekday"
                  class={weekday}
                >
                  {name}
                </div>
              )}
            </For>
          </div>
        </Show>
        {/* Keyed by POSITION: `weekDates` builds a new `CalendarDate` per
            day per read, and keying by those destroyed every cell when the
            month changed, focus included. */}
        <For each={() => Array.from({ length: weeksInMonth() }, (_, at) => at)}>
          {(at: number) => (
            <div role="row" data-slot="calendar-week" class={week}>
              <Show when={numbered()}>
                <div
                  role="rowheader"
                  aria-label={() => `Week ${String(weekNumber(at))}`}
                  data-slot="calendar-week-number"
                  class={weekNumberCell}
                >
                  <div class={weekNumberInner}>{() => weekLabel(at)}</div>
                </div>
              </Show>
              <Repeat count={7}>
                {(column: number) => (
                  <CalendarDay
                    state={state}
                    date={weekDates(at)[column] as CalendarDate}
                    month={month()}
                    showOutsideDays={props.showOutsideDays?.() !== false}
                    variant={props.dayButtonVariant?.()}
                    afterWeekNumber={numbered()}
                    modifiers={props.modifiers?.()}
                    modifiersClassNames={props.modifiersClassNames?.()}
                    hidden={props.hidden?.()}
                    onDayClick={props.onDayClick?.()}
                    formatDay={props.formatters?.()?.formatDay}
                    renderDay={callback<[CalendarDate, CalendarDayModifiers], Child>(
                      props.renderDay,
                    )}
                  />
                )}
              </Repeat>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

interface DropdownsProps extends MonthProps {
  /** The first day of the month this caption is over. */
  month: CalendarDate;
}

const MONTHS = Array.from({ length: 12 }, (_, at) => at + 1);

/**
 * The caption as selects.
 *
 * Native ones, drawn over by a label: a year list is a hundred options long,
 * and the platform's picker for that is better than anything positioned by
 * hand, on a phone most of all. The label is decoration and hidden from
 * assistive technology; the select carries the name and the value.
 */
function CalendarDropdowns(incoming: Incoming<DropdownsProps>) {
  const state = incoming.state();
  const props = incoming.of();
  const layout = (): CalendarCaptionLayout => props.captionLayout?.() ?? "dropdown";
  const monthFormat = dateFormatter({ month: "short" });
  const yearFormat = dateFormatter({ year: "numeric" });

  const shown = (): CalendarDate => incoming.month();
  const first = (): CalendarDate => startOfMonth(props.startMonth?.() ?? earliest(state.today()));
  const last = (): CalendarDate => startOfMonth(props.endMonth?.() ?? latest(state.today()));

  const years = createMemo(
    () => {
      const from = first().year;
      const to = Math.max(last().year, from);
      return Array.from({ length: to - from + 1 }, (_, at) => from + at);
    },
    { equals: (a, b) => a.length === b.length && a[0] === b[0] },
  );

  const monthName = (month: number): string => {
    const date = new CalendarDate(shown().year, month, 1);
    return props.formatters?.()?.formatMonthDropdown?.(date) ?? monthFormat().format(date.toDate());
  };
  const yearName = (year: number): string => {
    const date = new CalendarDate(year, 1, 1);
    return props.formatters?.()?.formatYearDropdown?.(date) ?? yearFormat().format(date.toDate());
  };
  const unreachable = (month: number): boolean => {
    const date = new CalendarDate(shown().year, month, 1);
    return date.compare(first()) < 0 || date.compare(last()) > 0;
  };

  const show = (year: number, month: number): void =>
    state.showMonth(new CalendarDate(year, month, 1), incoming.offset());

  return (
    <div data-slot="calendar-dropdowns" class={dropdowns}>
      <Show
        when={layout() !== "dropdown-years"}
        fallback={<span data-slot="calendar-caption-label">{() => monthName(shown().month)}</span>}
      >
        <span
          data-slot="calendar-dropdown-root"
          class={dropdownRoot}
          data-disabled={() => state.isDisabled() || undefined}
        >
          <select
            data-slot="calendar-dropdown"
            class={dropdown}
            aria-label="Choose the Month"
            value={() => String(shown().month)}
            disabled={() => state.isDisabled()}
            onChange={(event: Event) =>
              show(shown().year, Number((event.currentTarget as HTMLSelectElement).value))
            }
          >
            <For each={() => MONTHS}>
              {(month: number) => (
                <option value={month} disabled={() => unreachable(month)}>
                  {() => monthName(month)}
                </option>
              )}
            </For>
          </select>
          <span data-slot="calendar-caption-label" class={dropdownLabel} aria-hidden="true">
            {() => monthName(shown().month)}
            <ChevronDown />
          </span>
        </span>
      </Show>
      <Show
        when={layout() !== "dropdown-months"}
        fallback={<span data-slot="calendar-caption-label">{() => yearName(shown().year)}</span>}
      >
        <span
          data-slot="calendar-dropdown-root"
          class={dropdownRoot}
          data-disabled={() => state.isDisabled() || undefined}
        >
          <select
            data-slot="calendar-dropdown"
            class={dropdown}
            aria-label="Choose the Year"
            value={() => String(shown().year)}
            disabled={() => state.isDisabled()}
            onChange={(event: Event) =>
              show(Number((event.currentTarget as HTMLSelectElement).value), shown().month)
            }
          >
            <For each={() => years()}>
              {(year: number) => <option value={year}>{() => yearName(year)}</option>}
            </For>
          </select>
          <span data-slot="calendar-caption-label" class={dropdownLabel} aria-hidden="true">
            {() => yearName(shown().year)}
            <ChevronDown />
          </span>
        </span>
      </Show>
    </div>
  );
}

export interface CalendarDayProps {
  state: AnyCalendarState;
  date: CalendarDate;
  /** The month of the grid this day is drawn in. Defaults to the first on show. */
  month?: CalendarDate;
  showOutsideDays?: boolean;
  /** @default "ghost" */
  variant?: ButtonVariant;
  /** The row begins with its week number, so the first day is the second child. */
  afterWeekNumber?: boolean;
  modifiers?: Record<string, DateMatcher>;
  modifiersClassNames?: Record<string, string>;
  /** Drawn as nothing, as a day outside the month is when they are not shown. */
  hidden?: DateMatcher;
  onDayClick?: (date: CalendarDate, modifiers: CalendarDayModifiers) => void;
  formatDay?: (date: CalendarDate) => string;
  renderDay?: (date: CalendarDate, modifiers: CalendarDayModifiers) => Child;
}

/**
 * One day: the cell, and the button inside it.
 *
 * Both carry the range position, because shadcn styles both — the cell paints
 * the strip the range runs through and the button paints its two ends.
 */
export function CalendarDay(props: Incoming<CalendarDayProps>) {
  const domRef = makeRef<HTMLDivElement>();
  const state = props.state();

  const cell = calendarCell(
    { date: () => props.date(), ref: domRef, month: () => props.month?.() },
    state,
  );
  const {
    cellProps,
    isSelected,
    isFocused,
    isDisabled,
    isUnavailable,
    isOutsideVisibleRange,
    isToday,
    isSelectionStart,
    isSelectionEnd,
  } = cell;

  // A calendar that picks one day has no range, so `isSelectionStart` and
  // `isSelectionEnd` are both false there and a selected day is a lone one.
  const inRange = state.selectionMode === "range";
  const isRangeMiddle = (): boolean =>
    inRange && isSelected() && !isSelectionStart() && !isSelectionEnd();
  const isHidden = (): boolean =>
    (isOutsideVisibleRange() && props.showOutsideDays?.() === false) ||
    dateMatches(props.date(), matcher(props.hidden));

  const marks = {
    "data-selected": isSelected,
    "data-today": isToday,
    "data-disabled": isDisabled,
    "data-unavailable": isUnavailable,
    "data-outside-month": isOutsideVisibleRange,
    "data-range-start": isSelectionStart,
    "data-range-end": isSelectionEnd,
    "data-range-middle": isRangeMiddle,
  };

  /** The modifiers this package computes, under the names upstream gives them. */
  const built: Record<string, () => boolean> = {
    selected: isSelected,
    today: isToday,
    disabled: isDisabled,
    outside: isOutsideVisibleRange,
    hidden: isHidden,
    focused: isFocused,
    range_start: isSelectionStart,
    range_end: isSelectionEnd,
    range_middle: isRangeMiddle,
  };

  const matches = (name: string): boolean =>
    built[name]?.() ?? dateMatches(props.date(), props.modifiers?.()?.[name]);

  // The NAMES are read once: an attribute that comes and goes with a prop
  // would need the element rebuilt, and which modifiers exist is a decision a
  // caller makes when writing the calendar. Whether a day matches one is live.
  const custom = Object.fromEntries(
    Object.keys(props.modifiers?.() ?? {}).map((name) => [`data-${name}`, () => matches(name)]),
  );

  const cellClass = (): string => {
    const named = props.modifiersClassNames?.() ?? {};
    // One argument, not a spread: the compiler counts a call's arguments to
    // fold the ones it can read, and the merge treats a list as its members.
    const matched = Object.keys(named)
      .filter(matches)
      .map((name) => named[name]);
    return ui(day, props.afterWeekNumber?.() === true ? dayAfterNumber : dayFirst, matched);
  };

  const render = callback<[CalendarDate, CalendarDayModifiers], Child>(props.renderDay);

  const modifiersNow = (): CalendarDayModifiers => ({
    selected: isSelected(),
    today: isToday(),
    disabled: isDisabled(),
    unavailable: isUnavailable(),
    outside: isOutsideVisibleRange(),
    focused: isFocused(),
    rangeStart: isSelectionStart(),
    rangeEnd: isSelectionEnd(),
    rangeMiddle: isRangeMiddle(),
  });

  // Upstream's day is a native button, which a click and Enter or Space alike
  // press. Read before the press is handled, so the modifiers are the ones the
  // day had when it was pressed.
  const dayClicked = (): void => {
    if (isHidden()) return;
    props.onDayClick?.()?.(props.date(), modifiersNow());
  };

  const content = (): Child => {
    if (render !== undefined) return render(props.date(), modifiersNow());
    return props.formatDay?.()?.(props.date()) ?? cell.formattedDate();
  };

  return (
    <div
      {...cellProps}
      {...marks}
      {...custom}
      data-focused={isFocused}
      data-outside={isOutsideVisibleRange}
      data-hidden={isHidden}
      data-slot="calendar-day"
      class={cellClass}
      onClickCapture={dayClicked}
      onKeyDownCapture={(event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") dayClicked();
      }}
    >
      <CalendarDayButton
        cell={cell}
        date={props.date()}
        variant={props.variant?.()}
        isHidden={isHidden()}
        isRangeMiddle={isRangeMiddle()}
        isSingle={!inRange && isSelected()}
        buttonRef={domRef.set}
      >
        {content}
      </CalendarDayButton>
    </div>
  );
}

export interface CalendarDayButtonProps {
  /** What `calendarCell` from `@barqjs/aria/calendar` returned for this day. */
  cell: CalendarCellResult;
  date: CalendarDate;
  /** @default "ghost" */
  variant?: ButtonVariant;
  /** Kept in the row, drawn as nothing. */
  isHidden?: boolean;
  isRangeMiddle?: boolean;
  /** Chosen, and not part of a range. */
  isSingle?: boolean;
  class?: string;
  children?: Child;
  buttonRef?: RefTarget<HTMLDivElement>;
}

/**
 * The button inside a day.
 *
 * Exported for a calendar that draws its own days, as upstream's is: it takes
 * the cell `calendarCell` built and anything to show under the number.
 */
export function CalendarDayButton(props: Incoming<CalendarDayButtonProps>) {
  const cell = props.cell();
  const { hoverProps, isHovered } = hover({ isDisabled: cell.isDisabled });
  const { focusProps, isFocusVisible } = focusRing();

  return (
    <div
      {...mergeProps(cell.buttonProps, hoverProps, focusProps, {
        "data-selected": cell.isSelected,
        "data-today": cell.isToday,
        "data-disabled": cell.isDisabled,
        "data-unavailable": cell.isUnavailable,
        "data-outside-month": cell.isOutsideVisibleRange,
        "data-range-start": cell.isSelectionStart,
        "data-range-end": cell.isSelectionEnd,
        "data-range-middle": () => props.isRangeMiddle?.() === true,
        "data-selected-single": () => props.isSingle?.() === true,
        "data-focus-visible": isFocusVisible,
        "data-hovered": isHovered,
      })}
      data-slot="calendar-day-button"
      data-day={() => props.date().toString()}
      class={() =>
        ui(
          buttonVariants({ variant: props.variant?.() ?? "ghost", size: "icon" }),
          dayButton,
          props.isHidden?.() === true ? hidden : undefined,
          props.class?.(),
        )
      }
      ref={mergeRefs(props.buttonRef?.())}
    >
      {props.children}
    </div>
  );
}
