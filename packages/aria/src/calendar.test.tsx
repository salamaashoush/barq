import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  tick,
  user,
} from "@barqjs/testing";
import {
  Calendar,
  calendarState,
  RangeCalendar,
  type CalendarState,
  type DateRange,
} from "./calendar.tsx";
import { CalendarDate } from "./date.ts";

/** March 2024: begins on a Friday, has 31 days, so six week rows. */
const MARCH = new CalendarDate(2024, 3, 7);

function Departure(
  props: Incoming<{
    value?: CalendarDate | null;
    minValue?: CalendarDate;
    maxValue?: CalendarDate;
    isDateUnavailable?: (date: CalendarDate) => boolean;
    isDisabled?: boolean;
    onChange?: (value: CalendarDate | null) => void;
  }>,
) {
  return (
    <Calendar
      aria-label="Departure"
      value={props.value?.()}
      defaultFocusedValue={MARCH}
      minValue={props.minValue?.()}
      maxValue={props.maxValue?.()}
      isDateUnavailable={props.isDateUnavailable?.()}
      isDisabled={props.isDisabled?.()}
      onChange={props.onChange?.()}
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
  function Stay(props: Incoming<{ onChange?: (value: DateRange | null) => void }>) {
    return (
      <RangeCalendar aria-label="Stay" defaultFocusedValue={MARCH} onChange={props.onChange?.()} />
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
