import { describe, expect, test } from "bun:test";
import { CalendarDate } from "@barqjs/aria/date";
import { flush, type Incoming } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Calendar, RangeCalendar } from "./calendar.tsx";

/** March 2024: begins on a Friday, has 31 days, so six week rows. */
const MARCH = new CalendarDate(2024, 3, 7);

function day(weekday: string, dayOfMonth: number, month = "March"): HTMLElement {
  return screen.getByRole("button", {
    name: new RegExp(`^${weekday}, ${month} ${dayOfMonth}, 2024`),
  });
}

/** The cell around a day, which is what carries the strip a range runs through. */
function cellOf(button: HTMLElement): HTMLElement {
  return button.parentElement as HTMLElement;
}

describe("Calendar", () => {
  function Departure(props: Incoming<{ onChange?: (value: CalendarDate | null) => void }>) {
    return (
      <Calendar aria-label="Departure" defaultFocusedValue={MARCH} onChange={props.onChange?.()} />
    );
  }

  test("draws the month, its weekdays and every day in it", () => {
    render(() => <Departure />);

    expect(document.querySelector('[data-slot="calendar-caption-label"]')?.textContent).toBe(
      "March 2024",
    );
    expect(document.querySelectorAll('[data-slot="calendar-weekday"]').length).toBe(7);
    expect(document.querySelectorAll('[data-slot="calendar-week"]').length).toBe(6);
    expect(day("Friday", 1)).toBeTruthy();
    expect(day("Sunday", 31)).toBeTruthy();
  });

  test("choosing a day reports it and marks it as the only one", () => {
    const chosen: string[] = [];
    render(() => <Departure onChange={(value) => chosen.push(String(value))} />);

    user.click(day("Monday", 11));
    flush();

    expect(chosen).toEqual(["2024-03-11"]);
    const button = day("Monday", 11);
    expect(button.getAttribute("data-selected-single")).toBe("");
    expect(button.hasAttribute("data-range-start")).toBe(false);
    expect(cellOf(button).getAttribute("data-selected")).toBe("");
  });

  test("a lone day is painted with the primary colour", () => {
    render(() => <Departure />);
    user.click(day("Monday", 11));
    flush();

    const rules = day("Monday", 11).className.split(" ").map(rulesFor).join("\n");
    expect(rules).toContain("[data-selected-single]");
    expect(rules).toContain("background-color: var(--primary)");
  });

  test("the arrows page the month, and the heading names the grid", () => {
    render(() => <Departure />);

    user.click(document.querySelector('[data-slot="calendar-nav-next"]') as HTMLElement);
    flush();
    expect(document.querySelector('[data-slot="calendar-caption-label"]')?.textContent).toBe(
      "April 2024",
    );

    user.click(document.querySelector('[data-slot="calendar-nav-previous"]') as HTMLElement);
    flush();
    expect(document.querySelector('[data-slot="calendar-caption-label"]')?.textContent).toBe(
      "March 2024",
    );

    const grid = screen.getByRole("grid");
    const label = document.querySelector('[data-slot="calendar-caption-label"]') as HTMLElement;
    expect(grid.getAttribute("aria-labelledby")).toBe(label.id);
  });

  test("a day outside the month says so, and is not reachable", () => {
    render(() => <Departure />);

    // March 2024 begins on a Friday, so the first row starts in February.
    const outside = document.querySelector(
      '[data-slot="calendar-day"][data-outside-month]',
    ) as HTMLElement;
    expect(outside).toBeTruthy();
    expect(
      outside.querySelector('[data-slot="calendar-day-button"]')?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  test("the arrow keys move the focused day", () => {
    render(() => <Departure />);
    const start = day("Thursday", 7);
    start.focus();
    user.key("ArrowRight", { target: start });
    flush();

    expect(document.activeElement).toBe(day("Friday", 8));
  });
});

describe("RangeCalendar", () => {
  function Stay() {
    return <RangeCalendar aria-label="Stay" defaultFocusedValue={MARCH} />;
  }

  test("the two ends and the days between are painted differently", () => {
    render(() => <Stay />);

    user.click(day("Monday", 11));
    user.click(day("Wednesday", 13));
    flush();

    expect(day("Monday", 11).getAttribute("data-range-start")).toBe("");
    expect(day("Tuesday", 12).getAttribute("data-range-middle")).toBe("");
    expect(day("Wednesday", 13).getAttribute("data-range-end")).toBe("");
    // Never the single-day mark: in a range every selected day is one of three.
    expect(day("Tuesday", 12).hasAttribute("data-selected-single")).toBe(false);
  });

  test("the strip is on the cell and the ends are on the button", () => {
    render(() => <Stay />);

    user.click(day("Monday", 11));
    user.click(day("Wednesday", 13));
    flush();

    const middle = cellOf(day("Tuesday", 12));
    expect(middle.getAttribute("data-range-middle")).toBe("");

    const cellRules = rulesFor(middle.className);
    expect(cellRules).toContain("[data-range-start]");
    expect(cellRules).toContain("background-color: var(--accent)");
  });
});
