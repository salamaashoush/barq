import {
  calendar,
  calendarCell,
  calendarGrid,
  calendarState,
  rangeCalendarState,
  type CalendarComponentProps,
  type CalendarState,
  type RangeCalendarComponentProps,
  type RangeCalendarState,
} from "@barqjs/aria/calendar";
import { button } from "@barqjs/aria/button";
import type { CalendarDate } from "@barqjs/aria/date";
import { focusRing } from "@barqjs/aria/focus";
import { hover } from "@barqjs/aria/interactions";
import {
  callback,
  filterDOMProps,
  fromProps,
  id,
  mergeProps,
  styleProps,
} from "@barqjs/aria/utils";
import { For, type Incoming, Repeat } from "@barqjs/core";
import { atomsIn, firstThatWorks } from "@barqjs/css";
import { ChevronLeft } from "@barqjs/lucide/icons/chevron-left";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { ref as makeRef, mergeRefs } from "@barqjs/primitives/refs";

import "../theme/layers.ts";
import { ui } from "../lib/atoms.ts";
import { buttonVariants, type ButtonVariant } from "./button.tsx";

const root = atomsIn("barq.ui", {
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

const months = atomsIn("barq.ui", {
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

const month = atomsIn("barq.ui", {
  display: "flex",
  width: "100%",
  flexDirection: "column",
  gap: "calc(var(--spacing) * 4)",
});

const nav = atomsIn("barq.ui", {
  position: "absolute",
  insetInline: "0px",
  top: "0px",
  display: "flex",
  width: "100%",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--spacing)",
});

const navButton = atomsIn("barq.ui", {
  width: "var(--cell-size)",
  height: "var(--cell-size)",
  // `p-0` is the physical padding, and the button's own size sets the LOGICAL
  // one. Two different properties for one side of a box do not merge, so the
  // physical zero left `padding-block: 8px` standing and the arrows grew.
  padding: "0px",
  paddingBlock: "0px",
  paddingInline: "0px",
  "-webkit-user-select": "none",
  userSelect: "none",
  '[aria-disabled="true"]': {
    opacity: "50%",
  },
  ':where(:dir(rtl), [dir="rtl"], [dir="rtl"] *) > svg': {
    rotate: "180deg",
  },
});

const monthCaption = atomsIn("barq.ui", {
  display: "flex",
  height: "var(--cell-size)",
  width: "100%",
  alignItems: "center",
  justifyContent: "center",
  paddingInline: "var(--cell-size)",
});

const captionLabel = atomsIn("barq.ui", {
  fontSize: "var(--text-sm)",
  lineHeight: "var(--ui-leading, var(--text-sm--line-height))",
  "--ui-font-weight": "var(--font-weight-medium)",
  fontWeight: "var(--font-weight-medium)",
  "-webkit-user-select": "none",
  userSelect: "none",
});

const monthGrid = atomsIn("barq.ui", {
  width: "100%",
  borderCollapse: "collapse",
});

const weekdays = atomsIn("barq.ui", {
  display: "flex",
});

const weekday = atomsIn("barq.ui", {
  flex: "1",
  borderRadius: "calc(var(--radius) - 2px)",
  fontSize: "0.8rem",
  "--ui-font-weight": "var(--font-weight-normal)",
  fontWeight: "var(--font-weight-normal)",
  color: "var(--muted-foreground)",
  "-webkit-user-select": "none",
  userSelect: "none",
});

const week = atomsIn("barq.ui", {
  marginTop: "calc(var(--spacing) * 2)",
  display: "flex",
  width: "100%",
});

const day = atomsIn("barq.ui", {
  position: "relative",
  aspectRatio: "1 / 1",
  height: "100%",
  width: "100%",
  padding: "0px",
  textAlign: "center",
  "-webkit-user-select": "none",
  userSelect: "none",
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
    borderTopRightRadius: "calc(var(--radius) - 2px)",
    borderBottomRightRadius: "calc(var(--radius) - 2px)",
    backgroundColor: "var(--accent)",
  },
  "[data-range-middle]": {
    borderRadius: "0",
  },
  "[data-range-start]": {
    borderTopLeftRadius: "calc(var(--radius) - 2px)",
    borderBottomLeftRadius: "calc(var(--radius) - 2px)",
    backgroundColor: "var(--accent)",
  },
  "[data-today]": {
    borderRadius: "calc(var(--radius) - 2px)",
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  "[data-today][data-selected]": {
    borderRadius: "0",
  },
  ':first-child[data-selected] [data-slot="calendar-day-button"]': {
    borderTopLeftRadius: "calc(var(--radius) - 2px)",
    borderBottomLeftRadius: "calc(var(--radius) - 2px)",
  },
  ':last-child[data-selected] [data-slot="calendar-day-button"]': {
    borderTopRightRadius: "calc(var(--radius) - 2px)",
    borderBottomRightRadius: "calc(var(--radius) - 2px)",
  },
});

const dayButton = atomsIn("barq.ui", {
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
    borderRadius: "calc(var(--radius) - 2px)",
    borderTopRightRadius: "calc(var(--radius) - 2px)",
    borderBottomRightRadius: "calc(var(--radius) - 2px)",
    backgroundColor: "var(--primary)",
    color: "var(--primary-foreground)",
  },
  "[data-range-middle]": {
    borderRadius: "0",
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  "[data-range-start]": {
    borderRadius: "calc(var(--radius) - 2px)",
    borderTopLeftRadius: "calc(var(--radius) - 2px)",
    borderBottomLeftRadius: "calc(var(--radius) - 2px)",
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

const hidden = atomsIn("barq.ui", {
  visibility: "hidden",
});

interface Shared {
  /** The variant the two month buttons take. @default "ghost" */
  buttonVariant?: ButtonVariant;
  /** Draw the days either side of the month. @default true */
  showOutsideDays?: boolean;
}

export interface CalendarProps extends CalendarComponentProps, Shared {}

/**
 * ```tsx
 * <Calendar aria-label="Departure" value={date()} onChange={date.set} />
 * ```
 *
 * The month name, the two arrows, the weekday row and the grid, with the
 * keyboard and the roving focus from `@barqjs/aria`. shadcn's caption
 * dropdowns are not here: `captionLayout` is always its `"label"`.
 */
export function Calendar(props: Incoming<CalendarProps>) {
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

  return <CalendarShell state={state} of={props} />;
}

export interface RangeCalendarProps extends RangeCalendarComponentProps, Shared {}

/**
 * Two days and everything between them. The first press anchors, the second
 * finishes, and moving the pointer between the two draws what releasing would
 * give.
 */
export function RangeCalendar(props: Incoming<RangeCalendarProps>) {
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

  return <CalendarShell state={state} of={props as unknown as Incoming<CalendarProps>} />;
}

interface ShellProps {
  state: CalendarState | RangeCalendarState;
  /** The calendar's own props, still as Cells. */
  of: Incoming<CalendarProps>;
}

/**
 * The DOM both calendars share.
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
  const titleId = id();

  const { calendarProps, prevButtonProps, nextButtonProps, errorMessageProps, title } = calendar(
    {
      "aria-label": () => props["aria-label"]?.(),
      "aria-labelledby": () => props["aria-labelledby"]?.(),
    },
    state,
  );

  const { gridProps, headerProps, weekDays, weeksInMonth, weekDates } = calendarGrid(
    { weekdayStyle: () => props.weekdayStyle?.() ?? "short", "aria-labelledby": titleId },
    state,
  );

  const previous = button(prevButtonProps, prevRef);
  const next = button(nextButtonProps, nextRef);
  const navClass = (): string =>
    ui(buttonVariants({ variant: props.buttonVariant?.() ?? "ghost" }), navButton);

  const elementProps = mergeProps(
    calendarProps,
    filterDOMProps(fromProps(props), { global: true }),
    styleProps(props),
    {
      "data-slot": () => props["data-slot"]?.() ?? "calendar",
      "data-disabled": () => props.isDisabled?.() === true,
      "data-testid": () => props["data-testid"]?.(),
    },
  );

  return (
    <div
      {...elementProps}
      class={ui(root, props.class?.(), props.className?.())}
      ref={mergeRefs(props.ref?.())}
    >
      <div data-slot="calendar-months" class={months}>
        <div data-slot="calendar-month" class={month}>
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

          <div data-slot="calendar-month-caption" class={monthCaption}>
            <h2 id={titleId} data-slot="calendar-caption-label" class={captionLabel}>
              {title}
            </h2>
          </div>

          <div {...gridProps} data-slot="calendar-month-grid" class={monthGrid}>
            <div {...headerProps} role="row" data-slot="calendar-weekdays" class={weekdays}>
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
            {/* Keyed by POSITION: `weekDates` builds a new `CalendarDate` per
                day per read, and keying by those destroyed every cell when the
                month changed, focus included. */}
            <For each={() => Array.from({ length: weeksInMonth() }, (_, at) => at)}>
              {(at: number) => (
                <div role="row" data-slot="calendar-week" class={week}>
                  <Repeat count={7}>
                    {(column: number) => (
                      <CalendarDay
                        state={state}
                        date={weekDates(at)[column] as CalendarDate}
                        showOutsideDays={props.showOutsideDays?.() !== false}
                      />
                    )}
                  </Repeat>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
      <span {...errorMessageProps}>{props.errorMessage}</span>
    </div>
  );
}

export interface CalendarDayProps {
  state: CalendarState | RangeCalendarState;
  date: CalendarDate;
  showOutsideDays?: boolean;
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

  const {
    cellProps,
    buttonProps,
    isSelected,
    isFocused,
    isDisabled,
    isUnavailable,
    isOutsideVisibleRange,
    isToday,
    isSelectionStart,
    isSelectionEnd,
    formattedDate,
  } = calendarCell({ date: () => props.date(), ref: domRef }, state);

  const { hoverProps, isHovered } = hover({ isDisabled });
  const { focusProps, isFocusVisible } = focusRing();

  // A calendar that picks one day has no range, so `isSelectionStart` and
  // `isSelectionEnd` are both false there and a selected day is a lone one.
  const inRange = "highlightedRange" in state;
  const isRangeStart = (): boolean => isSelectionStart();
  const isRangeEnd = (): boolean => isSelectionEnd();
  const isRangeMiddle = (): boolean =>
    inRange && isSelected() && !isSelectionStart() && !isSelectionEnd();
  const isSingle = (): boolean => !inRange && isSelected();

  const marks = {
    "data-selected": isSelected,
    "data-today": isToday,
    "data-disabled": isDisabled,
    "data-unavailable": isUnavailable,
    "data-outside-month": isOutsideVisibleRange,
    "data-range-start": isRangeStart,
    "data-range-end": isRangeEnd,
    "data-range-middle": isRangeMiddle,
  };

  return (
    <div {...cellProps} {...marks} data-focused={isFocused} data-slot="calendar-day" class={day}>
      <div
        {...mergeProps(buttonProps, hoverProps, focusProps, marks, {
          "data-selected-single": isSingle,
          "data-focus-visible": isFocusVisible,
          "data-hovered": isHovered,
        })}
        data-slot="calendar-day-button"
        class={ui(
          buttonVariants({ variant: "ghost", size: "icon" }),
          dayButton,
          isOutsideVisibleRange() && props.showOutsideDays?.() === false ? hidden : undefined,
        )}
        ref={domRef.set}
      >
        {formattedDate}
      </div>
    </div>
  );
}
