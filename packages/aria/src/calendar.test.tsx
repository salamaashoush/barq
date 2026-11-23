import { describe, expect, test } from "bun:test";
import { type Child, createSignal, flush, For } from "@barqjs/core";
import {
  accessibleDescription,
  accessibleName,
  cleanup,
  expectNoAriaViolations,
  render,
  screen,
  tick,
  user,
} from "@barqjs/testing";
import {
  Calendar,
  calendarMonthPicker,
  CalendarMonthPicker,
  type CalendarPickerItem,
  type CalendarPickerResult,
  calendarState,
  CalendarYearPicker,
  dateMatches,
  MultipleCalendar,
  multipleCalendarState,
  RangeCalendar,
  rangeCalendarState,
  type CalendarState,
  type CalendarStateOptions,
  type DateRange,
  type MultipleCalendarState,
  type MultipleCalendarStateOptions,
  type RangeCalendarState,
  type RangeCalendarStateOptions,
} from "./calendar.tsx";
import {
  CalendarDate,
  CalendarDateTime,
  createCalendar,
  GregorianCalendar,
  now,
  parseZonedDateTime,
  today,
  type ZonedDateTime,
} from "./date.ts";
import { provideLocale } from "./i18n.ts";

function InLocale(props: { tag: string; children?: Child }) {
  const localeProps = provideLocale(() => props.tag);
  return <div {...localeProps}>{props.children}</div>;
}

/** March 2024: begins on a Friday, has 31 days, so six week rows. */
const MARCH = new CalendarDate(2024, 3, 7);

function Departure(props: {
  value?: CalendarDate | null;
  minValue?: CalendarDate;
  maxValue?: CalendarDate;
  isDateUnavailable?: (date: CalendarDate) => boolean;
  isDisabled?: boolean;
  onChange?: (value: CalendarDate | null) => void;
}) {
  return (
    <Calendar
      aria-label="Departure"
      value={props.value}
      defaultFocusedValue={MARCH}
      minValue={props.minValue}
      maxValue={props.maxValue}
      isDateUnavailable={props.isDateUnavailable}
      isDisabled={props.isDisabled}
      onChange={props.onChange}
    />
  );
}

/** Every day element in the first calendar on the page, in order. */
function dayElements(): Element[] {
  return [...document.querySelectorAll('[role="gridcell"] [role="button"]')];
}

/** A day by its accessible name, which is its whole date in the test locale. */
function day(weekday: string, dayOfMonth: number, month: string, year = 2024): HTMLElement {
  return screen.getByRole("button", {
    name: new RegExp(`^${weekday}, ${month} ${dayOfMonth}, ${year}`),
  });
}

describe("Calendar", () => {
  test("is a named group with a grid of days", () => {
    render(() => <Departure />);

    expect(accessibleName(screen.getByRole("group"))).toBe("Departure");
    expect(screen.getByRole("grid")).not.toBeNull();
    expect(screen.getAllByRole("columnheader", { hidden: true })).toHaveLength(7);
  });

  test("the weekday header is shown but not announced", () => {
    render(() => <Departure />);

    // Every cell already says which day of the week it is, so reading the
    // column headers as well would say it twice.
    expect(screen.queryAllByRole("columnheader")).toHaveLength(0);
    const header = screen.getAllByRole("row", { hidden: true })[0] as HTMLElement;
    expect(header.getAttribute("aria-hidden")).toBe("true");
  });

  test("the heading names the month on show", () => {
    render(() => <Departure />);
    expect(screen.getByRole("heading").textContent).toBe("March 2024");
  });

  test("the grid has as many week rows as the month needs", () => {
    // March 2024 begins on a Friday and has 31 days, so it spans six rows.
    // The weekday header row is not among them: it is hidden.
    render(() => <Departure />);
    expect(screen.getAllByRole("row")).toHaveLength(6);
  });

  test("every day is labelled with its whole date", () => {
    render(() => <Departure />);
    expect(day("Thursday", 7, "March")).not.toBeNull();
  });

  test("a day from the next month is hidden rather than removed", () => {
    render(() => <Departure />);

    // Six rows of seven cells are rendered so the grid stays rectangular, but
    // only March's 31 days are reachable: Down from the last week has to find
    // the next MONTH, not a greyed-out duplicate.
    expect(screen.getAllByRole("gridcell", { hidden: true })).toHaveLength(42);
    expect(screen.getAllByRole("button")).toHaveLength(31 + 2);
  });

  test("exactly one day is in the Tab order", () => {
    render(() => <Departure />);

    const days = screen
      .getAllByRole("button")
      .filter((element: Element) => /\d{4}$/.test(accessibleName(element)));
    const inOrder = days.filter((element: Element) => element.getAttribute("tabindex") === "0");

    expect(inOrder).toHaveLength(1);
    expect(accessibleName(inOrder[0] as HTMLElement)).toContain("March 7, 2024");
  });

  test("clicking a day chooses it", () => {
    const chosen: (CalendarDate | null)[] = [];
    render(() => <Departure onChange={(value) => chosen.push(value)} />);

    user.click(day("Friday", 15, "March"));
    flush();

    expect(chosen.map(String)).toEqual(["2024-03-15"]);
  });

  test("the chosen day says it is selected", () => {
    render(() => <Departure value={new CalendarDate(2024, 3, 15)} />);
    expect(day("Friday", 15, "March").getAttribute("data-selected")).toBe("");
  });

  test("the arrows move focus a day and a week at a time", () => {
    render(() => <Departure />);

    user.focus(day("Thursday", 7, "March"));
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(day("Friday", 8, "March"));

    user.keyDown("ArrowDown");
    flush();
    expect(document.activeElement).toBe(day("Friday", 15, "March"));

    user.keyDown("ArrowUp");
    flush();
    expect(document.activeElement).toBe(day("Friday", 8, "March"));
  });

  test("moving past the end of the month turns the page", () => {
    render(() => <Departure />);

    // Pressing it is what moves the calendar's own focus there; focusing the
    // element alone tells the state nothing.
    user.click(day("Sunday", 31, "March"));
    flush();
    user.keyDown("ArrowRight");
    flush();

    expect(screen.getByRole("heading").textContent).toBe("April 2024");
    expect(document.activeElement).toBe(day("Monday", 1, "April"));
  });

  test("Home and End go to the ends of the week", () => {
    render(() => <Departure />);

    user.focus(day("Thursday", 7, "March"));
    user.keyDown("Home");
    flush();
    expect(document.activeElement).toBe(day("Sunday", 3, "March"));

    user.keyDown("End");
    flush();
    expect(document.activeElement).toBe(day("Saturday", 9, "March"));
  });

  test("Page Up and Page Down move by a month, with Shift by a year", () => {
    render(() => <Departure />);

    user.focus(day("Thursday", 7, "March"));
    user.keyDown("PageDown");
    flush();
    expect(screen.getByRole("heading").textContent).toBe("April 2024");

    user.keyDown("PageUp", { shiftKey: true });
    flush();
    expect(screen.getByRole("heading").textContent).toBe("April 2023");
  });

  test("Enter chooses the focused day", () => {
    const chosen: (CalendarDate | null)[] = [];
    render(() => <Departure onChange={(value) => chosen.push(value)} />);

    user.focus(day("Thursday", 7, "March"));
    user.keyDown("Enter");
    flush();

    expect(chosen.map(String)).toEqual(["2024-03-07"]);
  });

  test("the page buttons move the month, and stop at the bounds", () => {
    render(() => (
      <Departure minValue={new CalendarDate(2024, 3, 1)} maxValue={new CalendarDate(2024, 3, 31)} />
    ));

    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Previous month" }).disabled).toBe(
      true,
    );
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Next month" }).disabled).toBe(
      true,
    );
  });

  test("a day outside the bounds cannot be chosen", () => {
    const chosen: (CalendarDate | null)[] = [];
    render(() => (
      <Departure
        minValue={new CalendarDate(2024, 3, 10)}
        onChange={(value) => chosen.push(value)}
      />
    ));

    const early = day("Friday", 1, "March");
    expect(early.getAttribute("data-disabled")).toBe("");

    user.click(early);
    flush();
    expect(chosen).toEqual([]);
  });

  test("an unavailable day stays reachable but cannot be chosen", () => {
    const chosen: (CalendarDate | null)[] = [];
    render(() => (
      <Departure
        isDateUnavailable={(date) => date.day === 14}
        onChange={(value) => chosen.push(value)}
      />
    ));

    const booked = day("Thursday", 14, "March");
    expect(booked.getAttribute("data-unavailable")).toBe("");
    // Focusable, because "the 14th is booked" is information.
    expect(booked.hasAttribute("data-disabled")).toBe(false);

    user.click(booked);
    flush();
    expect(chosen).toEqual([]);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Departure value={new CalendarDate(2024, 3, 15)} />);
    expectNoAriaViolations(container);
  });
  test("the visible range is the same object while the month is", () => {
    // Everything that reads it — the heading, the row count, whether a day is
    // outside the month — depended on the focused DAY, so a keystroke
    // invalidated the lot.
    let state: CalendarState | undefined;
    function Probe() {
      state = calendarState({ defaultFocusedValue: MARCH });
      return <span />;
    }
    render(() => <Probe />);

    const before = state?.visibleRange();
    state?.focusNextDay();
    flush();
    expect(state?.visibleRange()).toBe(before);

    state?.focusNextPage();
    flush();
    expect(state?.visibleRange()).not.toBe(before);
  });

  test("an arrow key moves the focus without rebuilding the grid", () => {
    // `weekDates` hands `<For>` seven new `CalendarDate` objects a row, and
    // `visibleRange` read the focused DAY, so a single keystroke destroyed all
    // forty-two cells — the one holding focus among them. A real browser then
    // leaves focus on `<body>`; happy-dom lets a removed element keep it, so
    // what this can check is that the elements are the same ones.
    render(() => <Departure />);
    const before = dayElements();

    user.key("ArrowRight", { target: day("Thursday", 7, "March") });
    flush();

    const after = dayElements();
    expect(after.length).toBe(before.length);
    expect(after.every((node, at) => node === before[at])).toBe(true);
  });

  test("and neither does changing month", () => {
    render(() => <Departure />);
    const before = dayElements();

    user.click(screen.getByRole("button", { name: "Next month" }));
    flush();

    // April 2024 needs five rows where March needed six, so the last row does
    // go. Every cell above it is the element that was already there.
    const after = dayElements();
    expect(after.length).toBe(35);
    expect(after.every((node, at) => node === before[at])).toBe(true);
    expect(day("Monday", 1, "April")).toBeTruthy();
  });

  test("losing the focused day is not the calendar losing focus", async () => {
    // Removing the focused element fires `focusout` exactly as leaving does.
    // Answering it at once told the calendar it was unfocused in the middle of
    // moving focus, and the day it moved TO no longer wanted it.
    render(() => <Departure />);
    const chosen = day("Thursday", 7, "March");
    user.focus(chosen);
    expect(chosen.getAttribute("data-focused")).toBe("");

    user.blur(chosen);
    expect(chosen.getAttribute("data-focused")).toBe("");

    await tick();
    flush();
    expect(chosen.hasAttribute("data-focused")).toBe(false);
  });

  test("a single day is neither end of a range, because there is none", () => {
    // A calendar that picks one day has no range, so a day that is selected is
    // not the start or the end of anything. `@barqjs/ui` reads that as the
    // difference between a lone day and one end of a stay.
    render(() => <Departure />);

    user.click(day("Monday", 11, "March"));
    flush();

    const chosen = day("Monday", 11, "March");
    expect(chosen.getAttribute("data-selected")).toBe("");
    expect(chosen.hasAttribute("data-selection-start")).toBe(false);
    expect(chosen.hasAttribute("data-selection-end")).toBe(false);
  });
});

describe("RangeCalendar", () => {
  function Stay(props: { onChange?: (value: DateRange | null) => void }) {
    return (
      <RangeCalendar aria-label="Stay" defaultFocusedValue={MARCH} onChange={props.onChange} />
    );
  }

  test("the first press anchors and the second finishes", () => {
    const ranges: string[][] = [];
    render(() => (
      <Stay
        onChange={(value) =>
          ranges.push(value === null ? [] : [String(value.start), String(value.end)])
        }
      />
    ));

    user.click(day("Monday", 11, "March"));
    flush();
    expect(ranges).toEqual([]);

    user.click(day("Friday", 15, "March"));
    flush();
    expect(ranges).toEqual([["2024-03-11", "2024-03-15"]]);
  });

  test("a range drawn backwards still comes out in order", () => {
    const ranges: string[][] = [];
    render(() => (
      <Stay
        onChange={(value) =>
          ranges.push(value === null ? [] : [String(value.start), String(value.end)])
        }
      />
    ));

    user.click(day("Friday", 15, "March"));
    user.click(day("Monday", 11, "March"));
    flush();

    expect(ranges).toEqual([["2024-03-11", "2024-03-15"]]);
  });

  test("every day between the ends is selected", () => {
    render(() => <Stay />);

    user.click(day("Monday", 11, "March"));
    user.click(day("Wednesday", 13, "March"));
    flush();

    expect(day("Monday", 11, "March").getAttribute("data-selected")).toBe("");
    expect(day("Tuesday", 12, "March").getAttribute("data-selected")).toBe("");
    expect(day("Wednesday", 13, "March").getAttribute("data-selected")).toBe("");
    expect(day("Thursday", 14, "March").hasAttribute("data-selected")).toBe(false);
  });

  test("the two ends of the range say so, and the days between do not", () => {
    // Which day is an END of the range is the whole of how a stylesheet rounds
    // one selection: square where the range continues, rounded where it stops.
    render(() => <Stay />);

    user.click(day("Monday", 11, "March"));
    user.click(day("Wednesday", 13, "March"));
    flush();

    const start = day("Monday", 11, "March");
    const middle = day("Tuesday", 12, "March");
    const end = day("Wednesday", 13, "March");

    expect(start.getAttribute("data-selection-start")).toBe("");
    expect(start.hasAttribute("data-selection-end")).toBe(false);
    expect(middle.hasAttribute("data-selection-start")).toBe(false);
    expect(middle.hasAttribute("data-selection-end")).toBe(false);
    expect(end.getAttribute("data-selection-end")).toBe("");
    expect(end.hasAttribute("data-selection-start")).toBe(false);
  });

  test("Escape abandons a range half drawn", () => {
    const ranges: string[][] = [];
    render(() => (
      <Stay
        onChange={(value) =>
          ranges.push(value === null ? [] : [String(value.start), String(value.end)])
        }
      />
    ));

    user.click(day("Monday", 11, "March"));
    flush();
    user.keyDown("Escape");
    flush();

    expect(day("Monday", 11, "March").hasAttribute("data-selected")).toBe(false);

    // The next press starts a new range rather than finishing the old one.
    user.click(day("Friday", 15, "March"));
    flush();
    expect(ranges).toEqual([]);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Stay />);
    expectNoAriaViolations(container);
  });
});

/** A state built under an owner, which is where every state here lives. */
function single(options: CalendarStateOptions): CalendarState {
  let state: CalendarState | undefined;
  function Probe() {
    state = calendarState(options);
    return <span />;
  }
  render(() => <Probe />);
  return state as CalendarState;
}

function several(options: MultipleCalendarStateOptions): MultipleCalendarState {
  let state: MultipleCalendarState | undefined;
  function Probe() {
    state = multipleCalendarState(options);
    return <span />;
  }
  render(() => <Probe />);
  return state as MultipleCalendarState;
}

function stay(options: RangeCalendarStateOptions): RangeCalendarState {
  let state: RangeCalendarState | undefined;
  function Probe() {
    state = rangeCalendarState(options);
    return <span />;
  }
  render(() => <Probe />);
  return state as RangeCalendarState;
}

const span = (state: { visibleRange(): DateRange }): string[] => [
  String(state.visibleRange().start),
  String(state.visibleRange().end),
];

describe("dateMatches", () => {
  const date = new CalendarDate(2024, 3, 7);

  test("a day, a list of days and a yes or no", () => {
    expect(dateMatches(date, new CalendarDate(2024, 3, 7))).toBe(true);
    expect(dateMatches(date, new CalendarDate(2024, 3, 8))).toBe(false);
    expect(dateMatches(date, [new CalendarDate(2024, 3, 1), new CalendarDate(2024, 3, 7)])).toBe(
      true,
    );
    expect(dateMatches(date, true)).toBe(true);
    expect(dateMatches(date, false)).toBe(false);
  });

  test("a range includes both of its ends, under either pair of names", () => {
    const from = new CalendarDate(2024, 3, 7);
    const to = new CalendarDate(2024, 3, 9);
    expect(dateMatches(date, { from, to })).toBe(true);
    expect(dateMatches(date, { start: from, end: to })).toBe(true);
    expect(dateMatches(new CalendarDate(2024, 3, 10), { from, to })).toBe(false);
  });

  test("before and after exclude the day they name", () => {
    expect(dateMatches(date, { before: new CalendarDate(2024, 3, 8) })).toBe(true);
    expect(dateMatches(date, { before: new CalendarDate(2024, 3, 7) })).toBe(false);
    expect(dateMatches(date, { after: new CalendarDate(2024, 3, 6) })).toBe(true);
    expect(dateMatches(date, { after: new CalendarDate(2024, 3, 7) })).toBe(false);
  });

  test("before and after together are the days strictly between", () => {
    const interval = { after: new CalendarDate(2024, 3, 5), before: new CalendarDate(2024, 3, 9) };
    expect(dateMatches(date, interval)).toBe(true);
    expect(dateMatches(new CalendarDate(2024, 3, 5), interval)).toBe(false);
    expect(dateMatches(new CalendarDate(2024, 3, 9), interval)).toBe(false);
  });

  test("days of the week, Sunday as zero", () => {
    // 2024-03-07 was a Thursday.
    expect(dateMatches(date, { dayOfWeek: 4 })).toBe(true);
    expect(dateMatches(date, { dayOfWeek: [0, 6] })).toBe(false);
  });

  test("a function, and any one of a list of matchers", () => {
    expect(dateMatches(date, (each) => each.day === 7)).toBe(true);
    expect(
      dateMatches(date, [{ dayOfWeek: [0, 6] }, { before: new CalendarDate(2024, 3, 8) }]),
    ).toBe(true);
    expect(dateMatches(date, undefined)).toBe(false);
  });
});

describe("several months on show", () => {
  test("the visible range runs from the first month to the end of the last", () => {
    const state = single({ defaultFocusedValue: MARCH, visibleMonths: 2 });
    expect(span(state)).toEqual(["2024-03-01", "2024-04-30"]);
    expect(state.visibleMonths()).toBe(2);
  });

  test("the page buttons slide the window one month, and focus goes with it", () => {
    const state = single({ defaultFocusedValue: MARCH, visibleMonths: 2 });
    state.focusNextPage();
    flush();
    expect(span(state)).toEqual(["2024-04-01", "2024-05-31"]);
    expect(String(state.focusedDate())).toBe("2024-04-07");

    state.focusPreviousPage();
    flush();
    expect(span(state)).toEqual(["2024-03-01", "2024-04-30"]);
  });

  test("paged navigation turns every month on show at once", () => {
    const state = single({ defaultFocusedValue: MARCH, visibleMonths: 2, pagedNavigation: true });
    state.focusNextPage();
    flush();
    expect(span(state)).toEqual(["2024-05-01", "2024-06-30"]);
  });

  test("focus moving into the second month leaves the window where it is", () => {
    const state = single({ defaultFocusedValue: new CalendarDate(2024, 3, 31), visibleMonths: 2 });
    const before = state.visibleRange();
    state.focusNextDay();
    flush();
    expect(String(state.focusedDate())).toBe("2024-04-01");
    expect(state.visibleRange()).toBe(before);
  });

  test("focus leaving the window drags it just far enough", () => {
    const state = single({ defaultFocusedValue: new CalendarDate(2024, 4, 30), visibleMonths: 2 });
    expect(span(state)).toEqual(["2024-04-01", "2024-05-31"]);
    state.setFocusedDate(new CalendarDate(2024, 6, 1));
    flush();
    expect(span(state)).toEqual(["2024-05-01", "2024-06-30"]);

    state.setFocusedDate(new CalendarDate(2024, 2, 10));
    flush();
    expect(span(state)).toEqual(["2024-02-01", "2024-03-31"]);
  });

  test("a month can be shown by name, at any position in the window", () => {
    const state = single({ defaultFocusedValue: MARCH, visibleMonths: 2 });
    state.showMonth(new CalendarDate(2025, 8, 1), 1);
    flush();
    expect(span(state)).toEqual(["2025-07-01", "2025-08-31"]);
  });
});

describe("the month as a prop", () => {
  test("a move that would turn the page reports the month it wants", () => {
    const asked: string[] = [];
    const state = single({
      defaultFocusedValue: MARCH,
      onVisibleMonthChange: (month) => asked.push(String(month)),
    });
    state.focusNextPage();
    flush();
    expect(asked).toEqual(["2024-04-01"]);
    state.focusNextDay();
    flush();
    expect(asked).toEqual(["2024-04-01"]);
  });

  test("a controlled month stays until its owner moves it", () => {
    const [month, setMonth] = createSignal(new CalendarDate(2024, 3, 1));
    const state = single({ defaultFocusedValue: MARCH, visibleMonth: month });
    state.focusNextPage();
    flush();
    expect(span(state)).toEqual(["2024-03-01", "2024-03-31"]);

    setMonth(new CalendarDate(2024, 6, 1));
    flush();
    expect(span(state)).toEqual(["2024-06-01", "2024-06-30"]);
  });
});

describe("the months that can be reached", () => {
  test("paging stops at the first and the last month, though their days stay open", () => {
    const state = single({
      defaultFocusedValue: MARCH,
      startMonth: new CalendarDate(2024, 3, 15),
      endMonth: new CalendarDate(2024, 4, 2),
    });
    expect(state.isPreviousVisibleRangeInvalid()).toBe(true);
    expect(state.isNextVisibleRangeInvalid()).toBe(false);
    expect(state.isCellDisabled(new CalendarDate(2024, 3, 1))).toBe(false);

    state.focusNextPage();
    flush();
    expect(state.isNextVisibleRangeInvalid()).toBe(true);
    state.focusNextPage();
    flush();
    expect(span(state)).toEqual(["2024-04-01", "2024-04-30"]);
  });
});

describe("days that are switched off", () => {
  const weekends = (date: CalendarDate): boolean => dateMatches(date, { dayOfWeek: [0, 6] });

  test("a disabled day cannot be chosen", () => {
    const chosen: string[] = [];
    const state = single({
      defaultFocusedValue: MARCH,
      isDateDisabled: weekends,
      onChange: (value) => chosen.push(String(value)),
    });
    expect(state.isCellDisabled(new CalendarDate(2024, 3, 9))).toBe(true);
    state.selectDate(new CalendarDate(2024, 3, 9));
    state.selectDate(new CalendarDate(2024, 3, 11));
    flush();
    expect(chosen).toEqual(["2024-03-11"]);
  });

  test("the arrows step over them, in the direction of travel", () => {
    const state = single({
      defaultFocusedValue: new CalendarDate(2024, 3, 8),
      isDateDisabled: weekends,
    });
    // Friday the 8th, then a weekend, then Monday the 11th.
    state.focusNextDay();
    flush();
    expect(String(state.focusedDate())).toBe("2024-03-11");
    state.focusPreviousDay();
    flush();
    expect(String(state.focusedDate())).toBe("2024-03-08");
  });

  test("when every day that way is off, focus stays where it is", () => {
    const state = single({
      defaultFocusedValue: MARCH,
      isDateDisabled: (date) => date.compare(MARCH) > 0,
    });
    state.focusNextDay();
    flush();
    expect(String(state.focusedDate())).toBe("2024-03-07");
  });
});

describe("today", () => {
  test("is the caller's day when they name one", () => {
    const state = single({ today: new CalendarDate(2020, 2, 29) });
    expect(String(state.today())).toBe("2020-02-29");
    expect(String(state.focusedDate())).toBe("2020-02-29");
  });

  test("is reckoned in the zone asked for", () => {
    const ahead = single({ timeZone: "Pacific/Kiritimati" });
    const behind = single({ timeZone: "Pacific/Pago_Pago" });
    expect(ahead.today().compare(behind.today())).toBeGreaterThanOrEqual(1);
  });
});

describe("multipleCalendarState", () => {
  const eleventh = new CalendarDate(2024, 3, 11);
  const twelfth = new CalendarDate(2024, 3, 12);
  const thirteenth = new CalendarDate(2024, 3, 13);

  test("a press adds a day and a second press takes it away", () => {
    const seen: string[][] = [];
    const state = several({
      defaultFocusedValue: MARCH,
      onChange: (value) => seen.push(value.map(String)),
    });
    state.selectDate(eleventh);
    flush();
    state.selectDate(thirteenth);
    flush();
    state.selectDate(eleventh);
    flush();
    expect(seen).toEqual([["2024-03-11"], ["2024-03-11", "2024-03-13"], ["2024-03-13"]]);
    expect(state.isSelected(thirteenth)).toBe(true);
    expect(state.isSelected(eleventh)).toBe(false);
  });

  test("no more than the maximum can be chosen", () => {
    const state = several({ defaultValue: [eleventh, twelfth], max: 2 });
    state.selectDate(thirteenth);
    flush();
    expect(state.value().map(String)).toEqual(["2024-03-11", "2024-03-12"]);
  });

  test("no fewer than the minimum can be left", () => {
    const state = several({ defaultValue: [eleventh, twelfth], min: 2 });
    state.selectDate(eleventh);
    flush();
    expect(state.value().map(String)).toEqual(["2024-03-11", "2024-03-12"]);
  });

  test("a required selection keeps its last day", () => {
    const state = several({ defaultValue: [eleventh], required: true });
    state.selectDate(eleventh);
    flush();
    expect(state.value().map(String)).toEqual(["2024-03-11"]);
  });

  test("a controlled list is the owner's to change", () => {
    const [value, setValue] = createSignal<CalendarDate[]>([eleventh]);
    const state = several({ value, onChange: () => {} });
    state.selectDate(twelfth);
    flush();
    expect(state.value().map(String)).toEqual(["2024-03-11"]);
    setValue([eleventh, twelfth]);
    flush();
    expect(state.isSelected(twelfth)).toBe(true);
  });
});

describe("a range with a length", () => {
  const eleventh = new CalendarDate(2024, 3, 11);

  test("a range shorter than the minimum starts again from the second press", () => {
    const ranges: string[][] = [];
    const state = stay({
      defaultFocusedValue: MARCH,
      minDays: 3,
      onChange: (value) =>
        ranges.push(value === null ? [] : [String(value.start), String(value.end)]),
    });
    state.selectDate(eleventh);
    state.selectDate(new CalendarDate(2024, 3, 12));
    flush();
    expect(ranges).toEqual([]);
    expect(String(state.anchorDate())).toBe("2024-03-12");

    state.selectDate(new CalendarDate(2024, 3, 14));
    flush();
    expect(ranges).toEqual([["2024-03-12", "2024-03-14"]]);
  });

  test("a range longer than the maximum starts again from the second press", () => {
    const ranges: string[][] = [];
    const state = stay({
      defaultFocusedValue: MARCH,
      maxDays: 3,
      onChange: (value) =>
        ranges.push(value === null ? [] : [String(value.start), String(value.end)]),
    });
    state.selectDate(eleventh);
    state.selectDate(new CalendarDate(2024, 3, 14));
    flush();
    expect(ranges).toEqual([]);
    expect(String(state.anchorDate())).toBe("2024-03-14");
  });

  test("a disabled day inside the range breaks it when asked to", () => {
    const ranges: string[][] = [];
    const state = stay({
      defaultFocusedValue: MARCH,
      isDateDisabled: (date) => date.day === 12,
      excludeDisabled: true,
      onChange: (value) =>
        ranges.push(value === null ? [] : [String(value.start), String(value.end)]),
    });
    state.selectDate(eleventh);
    state.selectDate(new CalendarDate(2024, 3, 13));
    flush();
    expect(ranges).toEqual([]);
  });
});

describe("MultipleCalendar", () => {
  function Shifts(props: { onChange?: (value: CalendarDate[]) => void; max?: number }) {
    return (
      <MultipleCalendar
        aria-label="Shifts"
        defaultFocusedValue={MARCH}
        max={props.max}
        onChange={props.onChange}
      />
    );
  }

  test("the grid says it takes more than one day", () => {
    render(() => <Shifts />);
    expect(screen.getByRole("grid").getAttribute("aria-multiselectable")).toBe("true");
  });

  test("each press turns one day on or off and leaves the rest", () => {
    const seen: string[][] = [];
    render(() => <Shifts onChange={(value) => seen.push(value.map(String))} />);

    user.click(day("Monday", 11, "March"));
    flush();
    user.click(day("Wednesday", 13, "March"));
    flush();
    expect(day("Monday", 11, "March").getAttribute("data-selected")).toBe("");
    expect(day("Wednesday", 13, "March").getAttribute("data-selected")).toBe("");
    expect(accessibleName(day("Monday", 11, "March"))).toContain("selected");

    user.click(day("Monday", 11, "March"));
    flush();
    expect(day("Monday", 11, "March").hasAttribute("data-selected")).toBe(false);
    expect(seen.at(-1)).toEqual(["2024-03-13"]);
  });

  test("Enter and Space choose the focused day, as a press does", () => {
    const seen: string[][] = [];
    render(() => <Shifts onChange={(value) => seen.push(value.map(String))} />);

    const start = day("Thursday", 7, "March");
    user.focus(start);
    user.key("Enter", { target: start });
    flush();
    user.key("ArrowRight", { target: start });
    flush();
    user.key(" ", { target: day("Friday", 8, "March") });
    flush();
    expect(seen.at(-1)).toEqual(["2024-03-07", "2024-03-08"]);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Shifts />);
    expectNoAriaViolations(container);
  });
});

describe("switched-off days in the grid", () => {
  test("a disabled day says so and a press on it does nothing", () => {
    const chosen: (CalendarDate | null)[] = [];
    render(() => (
      <Calendar
        aria-label="Departure"
        defaultFocusedValue={MARCH}
        isDateDisabled={(date) => dateMatches(date, { dayOfWeek: [0, 6] })}
        onChange={(value) => chosen.push(value)}
      />
    ));

    const saturday = day("Saturday", 9, "March");
    expect(saturday.getAttribute("data-disabled")).toBe("");
    expect(saturday.parentElement?.getAttribute("aria-disabled")).toBe("true");
    user.click(saturday);
    flush();
    expect(chosen).toEqual([]);
    // Focus did not move to a day that cannot be chosen.
    expect(day("Thursday", 7, "March").getAttribute("tabindex")).toBe("0");
  });

  test("a calendar asked for six rows always has six", () => {
    // February 2026 begins on a Sunday and has 28 days: four rows on its own.
    render(() => (
      <Calendar
        aria-label="Departure"
        defaultFocusedValue={new CalendarDate(2026, 2, 10)}
        fixedWeeks
      />
    ));
    expect(screen.getAllByRole("row")).toHaveLength(6);
  });
});

describe("clearing the chosen day", () => {
  test("a second press on it leaves it chosen, unless clearing is allowed", () => {
    const kept = single({ defaultValue: MARCH });
    kept.selectDate(MARCH);
    flush();
    expect(String(kept.value())).toBe("2024-03-07");

    const cleared = single({ defaultValue: MARCH, allowsDeselection: true });
    cleared.selectDate(MARCH);
    flush();
    expect(cleared.value()).toBeNull();
  });
});

describe("drawing a range from the keyboard", () => {
  test("the arrows draw it as they move, and Enter finishes it", () => {
    const ranges: string[][] = [];
    render(() => (
      <RangeCalendar
        aria-label="Stay"
        defaultFocusedValue={MARCH}
        onChange={(value) =>
          ranges.push(value === null ? [] : [String(value.start), String(value.end)])
        }
      />
    ));

    const start = day("Thursday", 7, "March");
    user.focus(start);
    user.key("Enter", { target: start });
    flush();
    user.key("ArrowRight", { target: start });
    flush();
    user.key("ArrowRight", { target: day("Friday", 8, "March") });
    flush();

    // What is highlighted is what Enter would give.
    expect(day("Friday", 8, "March").getAttribute("data-selected")).toBe("");
    expect(day("Saturday", 9, "March").getAttribute("data-selection-end")).toBe("");

    user.key("Enter", { target: day("Saturday", 9, "March") });
    flush();
    expect(ranges).toEqual([["2024-03-07", "2024-03-09"]]);
  });
});

function polite(): string {
  return document.querySelector("[data-barq-live-announcer] [aria-live=polite]")?.textContent ?? "";
}

describe("what the calendar says", () => {
  test("choosing a day announces it", () => {
    render(() => <Departure />);
    user.click(day("Friday", 15, "March"));
    flush();
    expect(polite()).toContain("Selected Date: Friday, March 15, 2024");
  });

  test("a finished range is announced as a range", () => {
    render(() => <RangeCalendar aria-label="Stay" defaultFocusedValue={MARCH} />);
    user.click(day("Monday", 11, "March"));
    user.click(day("Wednesday", 13, "March"));
    flush();
    expect(polite()).toContain("Selected Range:");
    expect(polite()).toContain("March 11");
  });

  test("the page buttons are named in the page's language", () => {
    render(() => (
      <InLocale tag="de-DE">
        <Calendar aria-label="Abreise" defaultFocusedValue={MARCH} />
      </InLocale>
    ));
    expect(screen.getByRole("button", { name: "Zurück" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Weiter" })).not.toBeNull();
  });
});

describe("an invalid calendar", () => {
  test("a value the calendar would not offer is invalid, and the day says why", () => {
    render(() => (
      <Calendar
        aria-label="Departure"
        value={new CalendarDate(2024, 3, 14)}
        isDateUnavailable={(date) => date.day === 14}
        errorMessage="That day is booked"
      />
    ));
    const chosen = day("Thursday", 14, "March");
    expect(chosen.getAttribute("aria-invalid")).toBe("true");
    expect(chosen.parentElement?.getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(chosen)).toBe("That day is booked");
  });

  test("isInvalid marks the chosen day invalid", () => {
    render(() => (
      <Calendar
        aria-label="Departure"
        value={new CalendarDate(2024, 3, 15)}
        isInvalid
        errorMessage="Pick a weekday"
      />
    ));
    const chosen = day("Friday", 15, "March");
    expect(chosen.getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(chosen)).toBe("Pick a weekday");
    expect(day("Thursday", 14, "March").hasAttribute("aria-invalid")).toBe(false);
  });

  test("a valid one points at no error", () => {
    render(() => <Calendar aria-label="Departure" value={new CalendarDate(2024, 3, 15)} />);
    expect(day("Friday", 15, "March").hasAttribute("aria-invalid")).toBe(false);
    expect(day("Friday", 15, "March").hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("drawing a range with a pointer", () => {
  function Stay(props: {
    onChange?: (value: DateRange | null) => void;
    commitBehavior?: "clear" | "reset" | "select";
    defaultValue?: DateRange;
  }) {
    return (
      <>
        <RangeCalendar
          aria-label="Stay"
          defaultFocusedValue={MARCH}
          defaultValue={props.defaultValue}
          commitBehavior={props.commitBehavior}
          onChange={props.onChange}
        />
        <button type="button">elsewhere</button>
      </>
    );
  }

  const recorder = (into: string[][]) => (value: DateRange | null) =>
    into.push(value === null ? [] : [String(value.start), String(value.end)]);

  test("a drag from one day to another is the range between them", () => {
    const ranges: string[][] = [];
    render(() => <Stay onChange={recorder(ranges)} />);

    user.pointerDown(day("Monday", 11, "March"));
    flush();
    user.hover(day("Tuesday", 12, "March"));
    user.hover(day("Wednesday", 13, "March"));
    flush();
    expect(day("Tuesday", 12, "March").getAttribute("data-selected")).toBe("");

    user.pointerUp(day("Wednesday", 13, "March"));
    flush();
    expect(ranges).toEqual([["2024-03-11", "2024-03-13"]]);
  });

  test("dragging an end of a chosen range moves that end", () => {
    const ranges: string[][] = [];
    render(() => (
      <Stay
        defaultValue={{ start: new CalendarDate(2024, 3, 11), end: new CalendarDate(2024, 3, 13) }}
        onChange={recorder(ranges)}
      />
    ));

    user.pointerDown(day("Wednesday", 13, "March"));
    flush();
    user.hover(day("Friday", 15, "March"));
    user.pointerUp(day("Friday", 15, "March"));
    flush();
    expect(ranges.at(-1)).toEqual(["2024-03-11", "2024-03-15"]);
  });

  test("leaving the calendar with a range half drawn finishes it there", () => {
    const ranges: string[][] = [];
    render(() => <Stay onChange={recorder(ranges)} />);

    const start = day("Thursday", 7, "March");
    user.focus(start);
    user.key("Enter", { target: start });
    flush();
    user.key("ArrowRight", { target: start });
    flush();
    user.key("ArrowRight", { target: day("Friday", 8, "March") });
    flush();

    user.focus(screen.getByRole("button", { name: "elsewhere" }));
    flush();
    expect(ranges).toEqual([["2024-03-07", "2024-03-09"]]);
  });

  test("letting go outside the calendar finishes the range, or not, as asked", () => {
    for (const [behavior, expected] of [
      ["select", [["2024-03-11", "2024-03-13"]]],
      ["reset", []],
      ["clear", [[]]],
    ] as const) {
      const ranges: string[][] = [];
      const { unmount } = render(() => (
        <Stay
          commitBehavior={behavior}
          defaultValue={{ start: new CalendarDate(2024, 3, 3), end: new CalendarDate(2024, 3, 5) }}
          onChange={recorder(ranges)}
        />
      ));
      user.click(day("Monday", 11, "March"));
      flush();
      user.hover(day("Wednesday", 13, "March"));
      flush();
      user.pointerDown(document.body);
      user.pointerUp(document.body);
      flush();
      expect(ranges).toEqual(expected.map((range) => [...range]));
      unmount();
    }
  });
});

describe("options a calendar takes", () => {
  test("several months are centred on the chosen day, unless told otherwise", () => {
    const may = new CalendarDate(2024, 5, 15);
    expect(span(single({ defaultValue: may, visibleMonths: 3 }))).toEqual([
      "2024-04-01",
      "2024-06-30",
    ]);
    expect(
      span(single({ defaultValue: may, visibleMonths: 3, selectionAlignment: "start" })),
    ).toEqual(["2024-05-01", "2024-07-31"]);
    expect(
      span(single({ defaultValue: may, visibleMonths: 3, selectionAlignment: "end" })),
    ).toEqual(["2024-03-01", "2024-05-31"]);
  });

  test("a fixed number of weeks a month", () => {
    render(() => (
      <Calendar
        aria-label="Departure"
        defaultFocusedValue={new CalendarDate(2026, 2, 10)}
        weeksInMonth={6}
      />
    ));
    expect(screen.getAllByRole("row")).toHaveLength(6);
  });

  test("a range calendar tells isDateUnavailable where the range began", () => {
    const anchors: (string | null)[] = [];
    const state = stay({
      defaultFocusedValue: MARCH,
      isDateUnavailable: (date, anchor) => {
        anchors.push(anchor === null ? null : String(anchor));
        return anchor !== null && date.compare(anchor.add({ days: 3 })) > 0;
      },
    });
    state.selectDate(new CalendarDate(2024, 3, 11));
    flush();
    expect(state.isCellUnavailable(new CalendarDate(2024, 3, 20))).toBe(true);
    expect(state.isCellUnavailable(new CalendarDate(2024, 3, 13))).toBe(false);
    expect(anchors).toContain("2024-03-11");
  });
});

describe("a calendar other than the Gregorian", () => {
  function heading(): string {
    return screen.getByRole("heading").textContent ?? "";
  }

  test("the locale names the calendar the grid is drawn in, era and all", () => {
    render(() => (
      <InLocale tag="en-US-u-ca-japanese">
        <Calendar aria-label="Date" defaultFocusedValue={new CalendarDate(2024, 2, 1)} />
      </InLocale>
    ));

    expect(heading()).toBe("February Reiwa 6");
    expect(screen.getByRole("button", { name: /^Thursday, February 1, Reiwa 6/ })).not.toBeNull();
  });

  test("a day chosen there is reported in the value's own calendar", () => {
    const changes: (CalendarDate | null)[] = [];
    render(() => (
      <InLocale tag="en-US-u-ca-japanese">
        <Calendar
          aria-label="Date"
          defaultFocusedValue={new CalendarDate(2024, 2, 1)}
          onChange={(value) => changes.push(value)}
        />
      </InLocale>
    ));

    user.click(screen.getByRole("button", { name: /^Thursday, February 15, Reiwa 6/ }));
    flush();
    expect(changes.at(-1)?.calendar.identifier).toBe("gregory");
    expect(changes.at(-1)?.toString()).toBe("2024-02-15");
  });

  test("a Hebrew leap year takes thirteen pages to come round", () => {
    render(() => (
      <InLocale tag="en-US-u-ca-hebrew">
        <Calendar aria-label="Date" defaultFocusedValue={new CalendarDate(2023, 9, 16)} />
      </InLocale>
    ));
    expect(heading()).toBe("Tishri 5784");

    const next = screen.getByRole("button", { name: "Next month" });
    for (let page = 0; page < 12; page++) {
      user.click(next);
      flush();
    }
    // 5784 is a leap year: Adar I and Adar II, and Elul is the thirteenth.
    expect(heading()).toBe("Elul 5784");
    user.click(next);
    flush();
    expect(heading()).toBe("Tishri 5785");
  });

  test("createCalendar decides the calendar, whatever the locale names", () => {
    render(() => (
      <InLocale tag="en-US-u-ca-japanese">
        <Calendar
          aria-label="Date"
          defaultFocusedValue={new CalendarDate(2024, 2, 1)}
          createCalendar={(identifier) =>
            identifier === "japanese" ? new GregorianCalendar() : createCalendar(identifier)
          }
        />
      </InLocale>
    ));
    expect(heading()).toBe("February 2024");
  });

  test("a Gregorian month before the common era says so", () => {
    render(() => (
      <Calendar aria-label="Date" defaultFocusedValue={new CalendarDate("BC", 2, 1, 5)} />
    ));
    expect(heading()).toBe("January 2 BC");
  });
});

describe("a value with a time", () => {
  test("choosing a day keeps the time and the zone", () => {
    const changes: (ZonedDateTime | null)[] = [];
    render(() => (
      <Calendar
        aria-label="Call"
        defaultValue={parseZonedDateTime("2024-03-07T09:30[America/New_York]")}
        onChange={(value) => changes.push(value)}
      />
    ));

    user.click(day("Sunday", 10, "March"));
    flush();
    // The day the clocks go forward, at the same wall time.
    expect(changes.at(-1)?.toString()).toBe("2024-03-10T09:30:00-04:00[America/New_York]");
  });

  test("a date and time keeps its time", () => {
    const changes: (CalendarDateTime | null)[] = [];
    render(() => (
      <Calendar
        aria-label="Call"
        defaultValue={new CalendarDateTime(2024, 3, 7, 14, 45)}
        onChange={(value) => changes.push(value)}
      />
    ));

    user.click(day("Friday", 8, "March"));
    flush();
    expect(changes.at(-1)?.toString()).toBe("2024-03-08T14:45:00");
  });

  test("today is today in the zone of a zoned value", () => {
    // UTC+14: at least as late a day as anywhere on Earth.
    const zone = "Pacific/Kiritimati";
    render(() => <Calendar aria-label="Call" defaultValue={now(zone)} />);
    const marked = document.querySelector('[data-today=""]');
    expect(marked?.getAttribute("aria-label")).toContain(String(today(zone).day));
  });

  test("each end of a range keeps its own time", () => {
    const changes: (DateRange<CalendarDateTime> | null)[] = [];
    render(() => (
      <RangeCalendar
        aria-label="Stay"
        defaultValue={{
          start: new CalendarDateTime(2024, 3, 7, 15),
          end: new CalendarDateTime(2024, 3, 9, 11),
        }}
        onChange={(value) => changes.push(value)}
      />
    ));

    user.click(day("Monday", 11, "March"));
    user.click(day("Wednesday", 13, "March"));
    flush();
    const range = changes.at(-1);
    expect([range?.start.toString(), range?.end.toString()]).toEqual([
      "2024-03-11T15:00:00",
      "2024-03-13T11:00:00",
    ]);
  });
});

describe("month and year pickers", () => {
  /**
   * The options of a picker, the way a page would list them in a select:
   * keyed by id, so an option stays the same element while the list is
   * rebuilt around it and the select keeps what it shows.
   */
  function Options(props: { picker: CalendarPickerResult }) {
    const picker = props.picker;
    return (
      <For each={() => picker.items().map((item) => item.id)}>
        {(key: number) => {
          const item = (): CalendarPickerItem | undefined =>
            picker.items().find((one) => one.id === key);
          return (
            <option
              value={key}
              disabled={item()?.isDisabled === true}
              data-date={String(item()?.date)}
            >
              {() => item()?.formatted}
            </option>
          );
        }}
      </For>
    );
  }

  const changed =
    (picker: CalendarPickerResult) =>
    (event: Event): void =>
      picker.onChange((event.currentTarget as HTMLSelectElement).value);

  function Appointment(props: {
    defaultFocusedValue?: CalendarDate;
    focusedValue?: CalendarDate;
    minValue?: CalendarDate;
    maxValue?: CalendarDate;
    visibleYears?: number;
  }) {
    // The name comes through a labelling element: a select whose value and
    // name are both bound has its value written before its options exist.
    return (
      <Calendar
        aria-label="Appointment date"
        defaultFocusedValue={props.defaultFocusedValue}
        focusedValue={props.focusedValue}
        minValue={props.minValue}
        maxValue={props.maxValue}
      >
        <CalendarMonthPicker>
          {(picker) => (
            <span>
              <span id="month-name">{picker["aria-label"]()}</span>
              <select
                aria-labelledby="month-name"
                value={String(picker.value())}
                onChange={changed(picker)}
              >
                <Options picker={picker} />
              </select>
            </span>
          )}
        </CalendarMonthPicker>
        <CalendarYearPicker visibleYears={props.visibleYears}>
          {(picker) => (
            <span>
              <span id="year-name">{picker["aria-label"]()}</span>
              <select
                aria-labelledby="year-name"
                value={String(picker.value())}
                onChange={changed(picker)}
              >
                <Options picker={picker} />
              </select>
            </span>
          )}
        </CalendarYearPicker>
      </Calendar>
    );
  }

  const month = (): HTMLSelectElement =>
    screen.getByRole<HTMLSelectElement>("combobox", { name: "month" });
  const year = (): HTMLSelectElement =>
    screen.getByRole<HTMLSelectElement>("combobox", { name: "year" });
  const texts = (select: HTMLSelectElement): string[] =>
    [...select.options].map((option) => option.textContent ?? "");
  function choose(select: HTMLSelectElement, value: string): void {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    flush();
  }

  test("a month and a year select take the heading's place, and the grid names its month", () => {
    render(() => <Appointment defaultFocusedValue={new CalendarDate(2026, 4, 1)} />);
    const grid = screen.getByRole("grid");
    expect(screen.queryByRole("heading")).toBeNull();
    expect(accessibleName(grid)).toBe("April 2026");

    expect(month().value).toBe("4");
    expect(texts(month())).toEqual([
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ]);
    choose(month(), "6");
    expect(month().value).toBe("6");
    expect(accessibleName(grid)).toBe("June 2026");

    expect(year().value).toBe("10");
    expect(texts(year())).toEqual(Array.from({ length: 20 }, (_, at) => String(at + 2016)));
    choose(year(), "14");
    // The list centres on the year chosen, and the month is kept.
    expect(year().value).toBe("10");
    expect(texts(year())).toEqual(Array.from({ length: 20 }, (_, at) => String(at + 2020)));
    expect(accessibleName(grid)).toBe("June 2030");
  });

  test("the years stop at maxValue, at minValue, or at both", () => {
    const listed = (): string[] => texts(year());

    render(() => (
      <Appointment
        defaultFocusedValue={new CalendarDate(2026, 4, 1)}
        maxValue={new CalendarDate(2026, 6, 30)}
      />
    ));
    expect(listed()).toEqual(Array.from({ length: 20 }, (_, at) => String(2007 + at)));
    cleanup();

    render(() => (
      <Appointment
        defaultFocusedValue={new CalendarDate(2026, 4, 1)}
        minValue={new CalendarDate(2020, 6, 30)}
      />
    ));
    expect(listed()).toEqual(Array.from({ length: 20 }, (_, at) => String(2020 + at)));
    cleanup();

    render(() => (
      <Appointment
        defaultFocusedValue={new CalendarDate(2026, 4, 1)}
        minValue={new CalendarDate(2020, 6, 30)}
        maxValue={new CalendarDate(2026, 6, 30)}
      />
    ));
    expect(listed()).toEqual(Array.from({ length: 7 }, (_, at) => String(2020 + at)));
  });

  test("a year at a bound goes to the bound's day, and the others keep the day on show", () => {
    render(() => (
      <Appointment
        focusedValue={new CalendarDate(2025, 2, 1)}
        minValue={new CalendarDate(2024, 8, 3)}
        maxValue={new CalendarDate(2025, 2, 3)}
      />
    ));
    expect(texts(year())).toEqual(["2024", "2025"]);
    expect(year().value).toBe("1");
    const dates = [...year().options].map((option) => option.getAttribute("data-date"));
    expect(dates).toEqual(["2024-08-03", "2025-02-01"]);
  });

  test("visibleYears sets how many years are offered", () => {
    render(() => (
      <Appointment defaultFocusedValue={new CalendarDate(2026, 6, 30)} visibleYears={1} />
    ));
    expect(texts(year())).toEqual(["2026"]);
  });

  test("a Hebrew leap year offers thirteen months, and an ordinary one twelve", () => {
    render(() => (
      <InLocale tag="en-US-u-ca-hebrew">
        <Appointment defaultFocusedValue={new CalendarDate(2023, 9, 16)} />
      </InLocale>
    ));
    expect(month().options).toHaveLength(13);
    expect(texts(month())).toContain("Adar II");

    choose(year(), String(year().selectedIndex + 1));
    expect(month().options).toHaveLength(12);
  });

  test("a Japanese year is named with its era, and the list runs across eras", () => {
    render(() => (
      <InLocale tag="en-US-u-ca-japanese">
        <Appointment defaultFocusedValue={new CalendarDate(2020, 6, 1)} />
      </InLocale>
    ));
    const names = texts(year());
    expect(names[year().selectedIndex]).toBe("Reiwa 2");
    expect(names[0]).toBe("Heisei 22");
    choose(year(), "0");
    expect(accessibleName(screen.getByRole("grid"))).toBe("June Heisei 22");
  });

  test("a month nothing of which can be reached is marked", () => {
    render(() => (
      <Appointment
        defaultFocusedValue={new CalendarDate(2024, 3, 7)}
        minValue={new CalendarDate(2024, 2, 20)}
        maxValue={new CalendarDate(2024, 10, 1)}
      />
    ));
    const open = [...month().options].filter((option) => !option.disabled);
    expect(open.map((option) => option.value)).toEqual([
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
  });

  test("a picker over one of several months follows that month and turns the page to it", () => {
    let state: CalendarState | undefined;
    let second: CalendarPickerResult | undefined;
    function Probe() {
      state = calendarState({
        defaultFocusedValue: new CalendarDate(2024, 3, 7),
        visibleMonths: 2,
        selectionAlignment: "start",
      });
      second = calendarMonthPicker({ monthOffset: 1 }, state);
      return <span />;
    }
    render(() => <Probe />);
    const shown = state as CalendarState;
    const picker = second as CalendarPickerResult;

    expect(picker.value()).toBe(4);
    picker.onChange("9");
    flush();
    expect(span(shown)).toEqual(["2024-08-01", "2024-09-30"]);
    expect(picker.value()).toBe(9);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => (
      <Appointment defaultFocusedValue={new CalendarDate(2026, 4, 1)} />
    ));
    expectNoAriaViolations(container);
  });
});
