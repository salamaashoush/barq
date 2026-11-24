import { describe, expect, test } from "bun:test";
import type { DateRange } from "@barqjs/aria/calendar";
import { CalendarDate } from "@barqjs/aria/date";
import { provideDirection, provideLocale } from "@barqjs/aria/i18n";
import { cells, createSignal, flush, type Child, type ParentProps } from "@barqjs/core";
import { accessibleName, expectNoAriaViolations, render, screen, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Calendar, CalendarDayButton, RangeCalendar } from "./calendar.tsx";

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

interface DepartureProps {
  onChange?: (value: CalendarDate | null) => void;
}

describe("Calendar", () => {
  function Departure(props: DepartureProps) {
    return (
      <Calendar aria-label="Departure" defaultFocusedValue={MARCH} onChange={props.onChange} />
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

    const painted = day("Monday", 11).className.split(" ").map(rulesFor).join("\n");
    expect(painted).toContain("[data-selected-single]");
    expect(painted).toContain("background-color: var(--primary)");
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

function at(slot: string): HTMLElement {
  return document.querySelector(`[data-slot="${slot}"]`) as HTMLElement;
}
function all(slot: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`)];
}
/** A day by its ISO date, which does not depend on the language it is read in. */
function iso(date: string): HTMLElement {
  return document.querySelector(
    `[data-slot="calendar-day-button"][data-day="${date}"]:not([aria-hidden])`,
  ) as HTMLElement;
}
function rules(element: Element): string {
  return rulesFor([...element.classList].join(" "));
}
/** A native select has no pointer path a test can drive: set it, and say it changed. */
function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  flush();
}

describe("Calendar, several days", () => {
  test("each press turns a day on or off, and every chosen day is painted as a lone one", () => {
    const seen: string[][] = [];
    render(() => (
      <Calendar
        mode="multiple"
        aria-label="Shifts"
        defaultFocusedValue={MARCH}
        onSelect={(value) => seen.push(value.map(String))}
      />
    ));

    user.click(day("Monday", 11));
    flush();
    user.click(day("Wednesday", 13));
    flush();
    expect(seen.at(-1)).toEqual(["2024-03-11", "2024-03-13"]);
    expect(day("Monday", 11).getAttribute("data-selected-single")).toBe("");
    expect(day("Wednesday", 13).getAttribute("data-selected-single")).toBe("");
    expect(day("Tuesday", 12).hasAttribute("data-selected-single")).toBe(false);

    user.click(day("Monday", 11));
    flush();
    expect(seen.at(-1)).toEqual(["2024-03-13"]);
    expect(cellOf(day("Monday", 11)).hasAttribute("data-selected")).toBe(false);
  });

  test("the grid says it takes more than one, and the root says which mode it is in", () => {
    render(() => <Calendar mode="multiple" aria-label="Shifts" defaultFocusedValue={MARCH} />);
    expect(screen.getByRole("grid").getAttribute("aria-multiselectable")).toBe("true");
    expect(at("calendar").getAttribute("data-mode")).toBe("multiple");
  });

  test("no more than the maximum, and a required selection keeps its last day", () => {
    const seen: string[][] = [];
    render(() => (
      <Calendar
        mode="multiple"
        aria-label="Shifts"
        defaultFocusedValue={MARCH}
        max={2}
        required
        onSelect={(value) => seen.push(value.map(String))}
      />
    ));
    user.click(day("Monday", 11));
    flush();
    user.click(day("Tuesday", 12));
    flush();
    user.click(day("Wednesday", 13));
    flush();
    expect(seen.at(-1)).toEqual(["2024-03-11", "2024-03-12"]);

    user.click(day("Monday", 11));
    flush();
    user.click(day("Tuesday", 12));
    flush();
    expect(seen.at(-1)).toEqual(["2024-03-12"]);
  });

  test("a controlled list is read from `selected`", () => {
    const [chosen, setChosen] = createSignal<CalendarDate[]>([new CalendarDate(2024, 3, 11)]);
    render(() => (
      <Calendar
        mode="multiple"
        aria-label="Shifts"
        defaultFocusedValue={MARCH}
        selected={chosen()}
      />
    ));
    expect(cellOf(day("Monday", 11)).getAttribute("data-selected")).toBe("");
    setChosen([new CalendarDate(2024, 3, 12)]);
    flush();
    expect(cellOf(day("Monday", 11)).hasAttribute("data-selected")).toBe(false);
    expect(cellOf(day("Tuesday", 12)).getAttribute("data-selected")).toBe("");
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => (
      <Calendar mode="multiple" aria-label="Shifts" defaultFocusedValue={MARCH} />
    ));
    expectNoAriaViolations(container);
  });
});

describe("Calendar, a range by mode", () => {
  test("two presses make a range and report it through onSelect", () => {
    const seen: (DateRange | null)[] = [];
    render(() => (
      <Calendar
        mode="range"
        aria-label="Stay"
        defaultFocusedValue={MARCH}
        onSelect={(value) => seen.push(value)}
      />
    ));
    user.click(day("Monday", 11));
    user.click(day("Wednesday", 13));
    flush();
    expect(String(seen.at(-1)?.start)).toBe("2024-03-11");
    expect(String(seen.at(-1)?.end)).toBe("2024-03-13");
    expect(day("Tuesday", 12).getAttribute("data-range-middle")).toBe("");
  });

  test("min and max are how far apart the two ends may be", () => {
    const seen: (DateRange | null)[] = [];
    render(() => (
      <Calendar
        mode="range"
        aria-label="Stay"
        defaultFocusedValue={MARCH}
        min={2}
        max={4}
        onSelect={(value) => seen.push(value)}
      />
    ));
    // One night is too few: the second press starts again.
    user.click(day("Monday", 11));
    user.click(day("Tuesday", 12));
    flush();
    expect(seen).toEqual([]);
    // Five nights from the 12th is too many, and starts again on the 17th.
    user.click(day("Sunday", 17));
    flush();
    expect(seen).toEqual([]);
    user.click(day("Tuesday", 19));
    flush();
    expect(String(seen.at(-1)?.start)).toBe("2024-03-17");
    expect(String(seen.at(-1)?.end)).toBe("2024-03-19");
  });
});

interface TwoProps {
  pagedNavigation?: boolean;
}

describe("Calendar, several months", () => {
  function Two(props: TwoProps) {
    return (
      <Calendar
        aria-label="Departure"
        defaultFocusedValue={MARCH}
        numberOfMonths={2}
        pagedNavigation={props.pagedNavigation}
      />
    );
  }

  test("with three months, the month in focus comes first", () => {
    render(() => (
      <Calendar aria-label="Departure" defaultFocusedValue={MARCH} numberOfMonths={3} />
    ));
    expect(screen.getAllByRole("grid").map((grid) => accessibleName(grid))).toEqual([
      "March 2024",
      "April 2024",
      "May 2024",
    ]);
  });

  test("each month is a grid named by its own caption, under one pair of arrows", () => {
    render(() => <Two />);
    const grids = screen.getAllByRole("grid");
    expect(grids).toHaveLength(2);
    expect(grids.map((grid) => accessibleName(grid))).toEqual(["March 2024", "April 2024"]);
    expect(all("calendar-month")).toHaveLength(2);
    expect(all("calendar-nav-previous")).toHaveLength(1);
    expect(all("calendar-nav-next")).toHaveLength(1);
    expect(at("calendar-nav").parentElement).toBe(at("calendar-months"));
  });

  test("the next arrow slides the months along by one", () => {
    render(() => <Two />);
    user.click(at("calendar-nav-next"));
    flush();
    expect(all("calendar-caption-label").map((label) => label.textContent)).toEqual([
      "April 2024",
      "May 2024",
    ]);
  });

  test("paged navigation turns both at once", () => {
    render(() => <Two pagedNavigation />);
    user.click(at("calendar-nav-next"));
    flush();
    expect(all("calendar-caption-label").map((label) => label.textContent)).toEqual([
      "May 2024",
      "June 2024",
    ]);
  });

  test("the two grids share one Tab stop, and the arrows cross between them", () => {
    render(() => (
      <Calendar
        aria-label="Departure"
        defaultFocusedValue={new CalendarDate(2024, 3, 31)}
        numberOfMonths={2}
      />
    ));
    const stops = all("calendar-day-button").filter(
      (node) => node.getAttribute("tabindex") === "0",
    );
    expect(stops).toHaveLength(1);

    const last = iso("2024-03-31");
    last.focus();
    user.key("ArrowRight", { target: last });
    flush();
    expect(document.activeElement).toBe(iso("2024-04-01"));
    // The months did not change places to follow the focus.
    expect(all("calendar-caption-label").map((label) => label.textContent)).toEqual([
      "March 2024",
      "April 2024",
    ]);
  });

  test("a day drawn twice is the real one only in its own month", () => {
    render(() => <Two />);
    // The first of April closes March's last row and opens April's first.
    const drawn = [
      ...document.querySelectorAll('[data-slot="calendar-day-button"][data-day="2024-04-01"]'),
    ];
    expect(drawn).toHaveLength(2);
    expect(drawn.filter((node) => node.getAttribute("aria-hidden") === "true")).toHaveLength(1);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Two />);
    expectNoAriaViolations(container);
  });
});

interface InLocaleProps {
  locale: string;
  children?: Child;
}

function InLocale(props: InLocaleProps) {
  const localeProps = provideLocale(cells(props).locale);
  return <div {...localeProps}>{props.children}</div>;
}

interface BirthProps {
  layout?: "dropdown" | "dropdown-months" | "dropdown-years";
}

describe("Calendar, caption dropdowns", () => {
  function Birth(props: BirthProps) {
    return (
      <Calendar
        aria-label="Date of birth"
        defaultFocusedValue={MARCH}
        captionLayout={props.layout ?? "dropdown"}
        startMonth={new CalendarDate(2022, 6, 1)}
        endMonth={new CalendarDate(2025, 2, 1)}
      />
    );
  }

  function month(): HTMLSelectElement {
    return screen.getByRole<HTMLSelectElement>("combobox", { name: "Choose the Month" });
  }
  function year(): HTMLSelectElement {
    return screen.getByRole<HTMLSelectElement>("combobox", { name: "Choose the Year" });
  }
  // A year's option is keyed by its place in the list, since a Japanese year
  // number repeats in every era; these read and choose one by what it says.
  function yearShown(): string | null | undefined {
    return [...year().options].find((option) => option.value === year().value)?.textContent;
  }
  function chooseYear(text: string): void {
    const option = [...year().options].find((one) => one.textContent === text);
    choose(year(), option?.value ?? "");
  }

  test("the month and the year are two named selects showing what is on show", () => {
    render(() => <Birth />);
    expect(month().value).toBe("3");
    expect(yearShown()).toBe("2024");
    expect(month().getAttribute("data-slot")).toBe("calendar-dropdown");
    // The label drawn over each select is decoration: the select says it.
    const labels = all("calendar-caption-label");
    expect(labels.map((label) => label.textContent)).toEqual(["Mar", "2024"]);
    expect(labels.every((label) => label.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  test("the years run from the first reachable month to the last", () => {
    render(() => <Birth />);
    expect([...year().options].map((option) => option.textContent)).toEqual([
      "2022",
      "2023",
      "2024",
      "2025",
    ]);
  });

  test("choosing a month or a year shows it, and the grid is named for it", () => {
    render(() => <Birth />);
    choose(month(), "5");
    expect(accessibleName(screen.getByRole("grid"))).toBe("May 2024");
    expect(iso("2024-05-07")).toBeTruthy();

    chooseYear("2023");
    expect(accessibleName(screen.getByRole("grid"))).toBe("May 2023");
  });

  test("a month outside the reachable ones cannot be chosen", () => {
    render(() => <Birth />);
    chooseYear("2025");
    const options = [...month().options];
    expect(options.filter((option) => !option.disabled).map((option) => option.value)).toEqual([
      "1",
      "2",
    ]);
  });

  test("with several months on show, each caption picks its own month", () => {
    render(() => (
      <Calendar
        aria-label="Stay"
        defaultFocusedValue={MARCH}
        numberOfMonths={2}
        captionLayout="dropdown"
        startMonth={new CalendarDate(2024, 1, 1)}
        endMonth={new CalendarDate(2024, 12, 1)}
      />
    ));
    const pickers = screen.getAllByRole<HTMLSelectElement>("combobox", {
      name: "Choose the Month",
    });
    expect(pickers.map((picker) => picker.value)).toEqual(["3", "4"]);

    choose(pickers[1] as HTMLSelectElement, "9");
    expect(screen.getAllByRole("grid").map((grid) => accessibleName(grid))).toEqual([
      "August 2024",
      "September 2024",
    ]);
  });

  test("the selects list the locale's calendar: thirteen months in a Hebrew leap year", () => {
    render(() => (
      <InLocale locale="en-US-u-ca-hebrew">
        <Calendar
          aria-label="Date"
          defaultFocusedValue={new CalendarDate(2023, 9, 16)}
          captionLayout="dropdown"
        />
      </InLocale>
    ));
    expect(month().options).toHaveLength(13);
    expect(yearShown()).toBe("5784");
  });

  test("a Japanese year is listed with its era", () => {
    render(() => (
      <InLocale locale="en-US-u-ca-japanese">
        <Calendar
          aria-label="Date"
          defaultFocusedValue={MARCH}
          captionLayout="dropdown"
          startMonth={new CalendarDate(2018, 1, 1)}
          endMonth={new CalendarDate(2024, 12, 1)}
        />
      </InLocale>
    ));
    const names = [...year().options].map((option) => option.textContent);
    expect(names[0]).toBe("Heisei 30");
    expect(names.at(-1)).toBe("Reiwa 6");
    expect(yearShown()).toBe("Reiwa 6");
  });

  test("either half can be a select on its own", () => {
    render(() => <Birth layout="dropdown-months" />);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(month()).toBeTruthy();
    expect(at("calendar-dropdowns").textContent).toContain("2024");
  });

  test("the arrows stop at the first and last reachable month", () => {
    render(() => (
      <Calendar
        aria-label="Date of birth"
        defaultFocusedValue={MARCH}
        startMonth={new CalendarDate(2024, 3, 1)}
        endMonth={new CalendarDate(2024, 4, 1)}
      />
    ));
    expect(at("calendar-nav-previous").hasAttribute("disabled")).toBe(true);
    user.click(at("calendar-nav-next"));
    flush();
    expect(at("calendar-nav-next").hasAttribute("disabled")).toBe(true);
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Birth />);
    expectNoAriaViolations(container);
  });
});

describe("Calendar, week numbers", () => {
  test("each row is headed by its week, named for a screen reader", () => {
    render(() => <Calendar aria-label="Departure" defaultFocusedValue={MARCH} showWeekNumber />);
    const headers = screen.getAllByRole("rowheader");
    expect(headers).toHaveLength(6);
    // The row holding 1 March 2024 begins on Sunday 25 February: week 9.
    expect(headers[0]?.textContent).toBe("9");
    expect(accessibleName(headers[0] as HTMLElement)).toBe("Week 9");
    expect(headers[0]?.getAttribute("data-slot")).toBe("calendar-week-number");
    expect(at("calendar-week-number-header")).toBeTruthy();
  });

  test("ISO numbering is asked for by name", () => {
    render(() => (
      <Calendar
        aria-label="Departure"
        defaultFocusedValue={MARCH}
        weekStartsOn={1}
        showWeekNumber
        ISOWeek
      />
    ));
    // Monday 26 February 2024 opens ISO week 9; 1 January 2024 opened week 1.
    expect(screen.getAllByRole("rowheader")[0]?.textContent).toBe("9");
  });

  test("the rounded end of a selected row is the second child, after the number", () => {
    render(() => <Calendar aria-label="Departure" defaultFocusedValue={MARCH} showWeekNumber />);
    expect(rules(cellOf(day("Sunday", 3)))).toContain(":nth-child(2)[data-selected]");
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => (
      <Calendar aria-label="Departure" defaultFocusedValue={MARCH} showWeekNumber />
    ));
    expectNoAriaViolations(container);
  });
});

describe("Calendar, the days it draws", () => {
  test("outside days can be left blank, keeping their place in the row", () => {
    render(() => (
      <Calendar aria-label="Departure" defaultFocusedValue={MARCH} showOutsideDays={false} />
    ));
    const outside = at("calendar-day").querySelector(
      '[data-slot="calendar-day-button"]',
    ) as Element;
    expect(at("calendar-day").getAttribute("data-outside")).toBe("");
    expect(at("calendar-day").getAttribute("data-hidden")).toBe("");
    expect(rules(outside)).toContain("visibility: hidden");
    expect(all("calendar-day")).toHaveLength(42);
  });

  test("six rows when asked, whatever the month needs", () => {
    render(() => (
      <Calendar
        aria-label="Departure"
        defaultFocusedValue={new CalendarDate(2026, 2, 10)}
        fixedWeeks
      />
    ));
    expect(all("calendar-week")).toHaveLength(6);
  });

  test("the week starts on the day asked for", () => {
    render(() => <Calendar aria-label="Departure" defaultFocusedValue={MARCH} weekStartsOn={1} />);
    expect(all("calendar-weekday")[0]?.textContent).toBe("Mon");
    expect(
      at("calendar-week")
        .querySelector('[data-slot="calendar-day-button"]')
        ?.getAttribute("data-day"),
    ).toBe("2024-02-26");
  });

  test("today is the caller's day when they name one", () => {
    render(() => (
      <Calendar
        aria-label="Departure"
        defaultFocusedValue={MARCH}
        today={new CalendarDate(2024, 3, 9)}
      />
    ));
    expect(cellOf(iso("2024-03-09")).getAttribute("data-today")).toBe("");
    expect(accessibleName(iso("2024-03-09"))).toContain("Today");
  });

  test("today is reckoned in the zone asked for", () => {
    function todayIn(label: string): string | null | undefined {
      return screen
        .getByRole("group", { name: label })
        .querySelector("[data-today]:not([data-outside]) [data-day]")
        ?.getAttribute("data-day");
    }
    render(() => (
      <>
        <Calendar aria-label="Ahead" timeZone="Pacific/Kiritimati" />
        <Calendar aria-label="Behind" timeZone="Pacific/Pago_Pago" />
      </>
    ));
    // UTC+14 and UTC-11 are 25 hours apart, so no instant is the same day in both.
    expect(todayIn("Ahead")).toBeTruthy();
    expect(todayIn("Ahead")).not.toBe(todayIn("Behind"));
  });
});

interface WeekdaysProps {
  onChange?: (value: CalendarDate | null) => void;
}

describe("Calendar, switched-off days", () => {
  function Weekdays(props: WeekdaysProps) {
    return (
      <Calendar
        aria-label="Appointment"
        defaultFocusedValue={new CalendarDate(2024, 3, 8)}
        disabled={[{ dayOfWeek: [0, 6] }, { before: new CalendarDate(2024, 3, 5) }]}
        onChange={props.onChange}
      />
    );
  }

  test("a matched day says it is off, and a press on it chooses nothing", () => {
    const chosen: (CalendarDate | null)[] = [];
    render(() => <Weekdays onChange={(value) => chosen.push(value)} />);
    const saturday = cellOf(day("Saturday", 9));
    expect(saturday.getAttribute("data-disabled")).toBe("");
    expect(saturday.getAttribute("aria-disabled")).toBe("true");
    expect(cellOf(day("Monday", 4)).getAttribute("data-disabled")).toBe("");
    expect(cellOf(day("Tuesday", 5)).hasAttribute("data-disabled")).toBe(false);

    user.click(day("Saturday", 9));
    flush();
    expect(chosen).toEqual([]);
    expect(rules(saturday)).toContain("opacity: 50%");
  });

  test("the arrow keys step over a weekend", () => {
    render(() => <Weekdays />);
    const friday = day("Friday", 8);
    friday.focus();
    user.key("ArrowRight", { target: friday });
    flush();
    expect(document.activeElement).toBe(day("Monday", 11));
  });

  test("a matcher can be a function of the day", () => {
    render(() => (
      <Calendar
        aria-label="Appointment"
        defaultFocusedValue={MARCH}
        disabled={(date) => date.day === 12}
      />
    ));
    expect(cellOf(day("Tuesday", 12)).getAttribute("data-disabled")).toBe("");
    expect(cellOf(day("Wednesday", 13)).hasAttribute("data-disabled")).toBe(false);
  });

  test("`disabled` alone switches every day off", () => {
    render(() => <Calendar aria-label="Closed" defaultFocusedValue={MARCH} disabled />);
    expect(all("calendar-day").every((cell) => cell.hasAttribute("data-disabled"))).toBe(true);
  });
});

describe("Calendar, the variants of its buttons", () => {
  test("buttonVariant is the arrows', and dayButtonVariant is the days'", () => {
    render(() => (
      <Calendar
        aria-label="Departure"
        defaultFocusedValue={MARCH}
        buttonVariant="outline"
        dayButtonVariant="secondary"
      />
    ));
    expect(rules(at("calendar-nav-next"))).toContain("background-color: var(--background)");
    expect(rules(day("Monday", 11))).toContain("background-color: var(--secondary)");
  });

  test("a selected day's selection wins over dayButtonVariant in either mode", () => {
    render(() => (
      <Calendar
        mode="range"
        aria-label="Stay"
        defaultFocusedValue={MARCH}
        dayButtonVariant="outline"
      />
    ));
    user.click(day("Monday", 11));
    user.click(day("Wednesday", 13));
    flush();
    // Unselected, the day is the variant it was given, its dark fill included.
    expect(rules(day("Thursday", 14))).toContain("background-color: var(--background)");
    expect(rules(day("Thursday", 14))).toContain(":is(.dark *)");
    for (const selected of [day("Monday", 11), day("Tuesday", 12), day("Wednesday", 13)]) {
      const own = rules(selected);
      expect(own).not.toContain("background-color: var(--background)");
      expect(own).not.toContain("var(--input)");
    }
    expect(rules(day("Monday", 11))).toContain("background-color: var(--primary)");
    expect(rules(day("Tuesday", 12))).toContain("background-color: var(--accent)");
    expect(rules(day("Wednesday", 13))).toContain("background-color: var(--primary)");
  });

  test("a day is a ghost button unless told otherwise", () => {
    render(() => (
      <Calendar aria-label="Departure" defaultFocusedValue={MARCH} buttonVariant="outline" />
    ));
    expect(rules(day("Monday", 11))).not.toContain("background-color: var(--secondary)");
    expect(rules(day("Monday", 11))).not.toContain("background-color: var(--background)");
  });
});

describe("Calendar, upstream's names for its props", () => {
  test("selected and onSelect are value and onChange", () => {
    const seen: string[] = [];
    const [chosen, setChosen] = createSignal<CalendarDate | null>(new CalendarDate(2024, 3, 11));
    render(() => (
      <Calendar
        mode="single"
        aria-label="Departure"
        defaultMonth={MARCH}
        selected={chosen()}
        onSelect={(value) => {
          seen.push(String(value));
          setChosen(value);
        }}
      />
    ));
    expect(at("calendar-caption-label").textContent).toBe("March 2024");
    expect(day("Monday", 11).getAttribute("data-selected-single")).toBe("");
    user.click(day("Tuesday", 12));
    flush();
    expect(seen).toEqual(["2024-03-12"]);
    expect(day("Tuesday", 12).getAttribute("data-selected-single")).toBe("");
  });

  test("a second press clears the day when it is not required", () => {
    const seen: string[] = [];
    render(() => (
      <Calendar
        aria-label="Departure"
        defaultFocusedValue={MARCH}
        required={false}
        onChange={(value) => seen.push(String(value))}
      />
    ));
    user.click(day("Monday", 11));
    flush();
    user.click(day("Monday", 11));
    flush();
    expect(seen).toEqual(["2024-03-11", "null"]);
    expect(day("Monday", 11).hasAttribute("data-selected-single")).toBe(false);
  });

  test("the month can be kept by its owner, who hears when a page is asked for", () => {
    const asked: string[] = [];
    const [month, setMonth] = createSignal(new CalendarDate(2024, 3, 1));
    render(() => (
      <Calendar
        aria-label="Departure"
        month={month()}
        onMonthChange={(next) => asked.push(String(next))}
      />
    ));
    user.click(at("calendar-nav-next"));
    flush();
    expect(asked).toEqual(["2024-04-01"]);
    expect(at("calendar-caption-label").textContent).toBe("March 2024");

    setMonth(new CalendarDate(2024, 4, 1));
    flush();
    expect(at("calendar-caption-label").textContent).toBe("April 2024");
  });

  test("a modifier marks its days with an attribute and a class", () => {
    render(() => (
      <Calendar
        aria-label="Departure"
        defaultFocusedValue={MARCH}
        modifiers={{ booked: [new CalendarDate(2024, 3, 12), new CalendarDate(2024, 3, 13)] }}
        modifiersClassNames={{ booked: "struck" }}
      />
    ));
    const booked = cellOf(day("Tuesday", 12));
    expect(booked.getAttribute("data-booked")).toBe("");
    expect(booked.classList.contains("struck")).toBe(true);
    expect(cellOf(day("Monday", 11)).hasAttribute("data-booked")).toBe(false);
  });

  test("the arrows and the weekday row can be left out, and a footer added", () => {
    render(() => (
      <Calendar
        aria-label="Departure"
        defaultFocusedValue={MARCH}
        hideNavigation
        hideWeekdays
        footer="Pick a day"
      />
    ));
    expect(document.querySelector('[data-slot="calendar-nav"]')).toBeNull();
    expect(document.querySelector('[data-slot="calendar-weekdays"]')).toBeNull();
    expect(at("calendar-footer").textContent).toBe("Pick a day");
  });

  test("every part carries its slot, and the day its date", () => {
    render(() => <Calendar aria-label="Departure" defaultFocusedValue={MARCH} />);
    for (const slot of [
      "calendar",
      "calendar-months",
      "calendar-nav",
      "calendar-month",
      "calendar-month-caption",
      "calendar-caption-label",
      "calendar-month-grid",
      "calendar-weekdays",
      "calendar-weekday",
      "calendar-week",
      "calendar-day",
      "calendar-day-button",
    ]) {
      expect(document.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull();
    }
    expect(day("Thursday", 7).getAttribute("data-day")).toBe("2024-03-07");
    expect(at("calendar").getAttribute("data-mode")).toBe("single");
  });

  test("the caption, the selects and the day can each be written the caller's way", () => {
    render(() => (
      <Calendar
        aria-label="Departure"
        defaultFocusedValue={MARCH}
        captionLayout="dropdown-months"
        formatters={{
          formatMonthDropdown: (month) => `M${String(month.month)}`,
          formatYearDropdown: (year) => `Y${String(year.year)}`,
          formatDay: (date) => `#${String(date.day)}`,
        }}
      />
    ));
    expect(screen.getByRole<HTMLSelectElement>("combobox").options[2]?.textContent).toBe("M3");
    expect(at("calendar-dropdowns").textContent).toContain("Y2024");
    expect(day("Thursday", 7).textContent).toBe("#7");
  });

  test("the heading can be written the caller's way too", () => {
    render(() => (
      <Calendar
        aria-label="Departure"
        defaultFocusedValue={MARCH}
        formatters={{ formatCaption: (month) => `${String(month.year)}/${String(month.month)}` }}
      />
    ));
    expect(at("calendar-caption-label").textContent).toBe("2024/3");
  });

  test("a day can hold more than its number, and still reads as its date", () => {
    render(() => (
      <Calendar
        aria-label="Departure"
        defaultFocusedValue={MARCH}
        renderDay={(date, modifiers) => (
          <>
            {date.day}
            <span data-testid="price">{modifiers.outside ? "" : "$100"}</span>
          </>
        )}
      />
    ));
    const seventh = day("Thursday", 7);
    expect(seventh.textContent).toBe("7$100");
    expect(seventh.querySelector('[data-testid="price"]')).not.toBeNull();
    // The price is drawn small and muted under the number, as upstream's is.
    expect(rules(seventh)).toContain("> span");
  });

  test("the day button is the part a custom day is composed from", () => {
    render(() => <Calendar aria-label="Departure" defaultFocusedValue={MARCH} />);
    expect(typeof CalendarDayButton).toBe("function");
    expect(day("Thursday", 7).getAttribute("data-slot")).toBe("calendar-day-button");
  });
});

describe("Calendar, language and direction", () => {
  function Mirrored(props: ParentProps) {
    const directionProps = provideDirection("rtl");
    return <div {...directionProps}>{props.children}</div>;
  }

  test("the month, the weekdays and the first day of the week are the locale's", () => {
    render(() => (
      <InLocale locale="fr-FR">
        <Calendar aria-label="Départ" defaultFocusedValue={MARCH} />
      </InLocale>
    ));
    expect(at("calendar-caption-label").textContent).toBe("mars 2024");
    expect(all("calendar-weekday")[0]?.textContent).toBe("lun.");
    expect(accessibleName(iso("2024-03-07"))).toContain("jeudi 7 mars 2024");
  });

  test("a day before the calendar system's first is an empty cell", () => {
    render(() => (
      <InLocale locale="en-US-u-ca-japanese">
        <Calendar aria-label="Date" defaultFocusedValue={new CalendarDate(1868, 9, 12)} />
      </InLocale>
    ));
    // Meiji began on Tuesday 8 September 1868, so the row's first two places are empty.
    const first = all("calendar-week")[0] as HTMLElement;
    const places = [...first.querySelectorAll('[data-slot="calendar-day"]')];
    expect(places.map((place) => place.hasAttribute("data-empty"))).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(places[2]?.textContent).toBe("8");
    expect(at("calendar-nav-previous").hasAttribute("disabled")).toBe(true);
  });

  test("the dropdown lists the months in the locale too", () => {
    render(() => (
      <InLocale locale="fr-FR">
        <Calendar aria-label="Départ" defaultFocusedValue={MARCH} captionLayout="dropdown" />
      </InLocale>
    ));
    const months = screen.getAllByRole<HTMLSelectElement>("combobox")[0] as HTMLSelectElement;
    expect(months.options[2]?.textContent).toBe("mars");
  });

  test("right to left, the left arrow goes to the next day", () => {
    render(() => (
      <Mirrored>
        <Calendar aria-label="Departure" defaultFocusedValue={MARCH} />
      </Mirrored>
    ));
    const start = day("Thursday", 7);
    start.focus();
    user.key("ArrowLeft", { target: start });
    flush();
    expect(document.activeElement).toBe(day("Friday", 8));
  });

  test("the range's corners are named by the direction of the text, not the side of the screen", () => {
    render(() => <RangeCalendar aria-label="Stay" defaultFocusedValue={MARCH} />);
    const cell = rules(cellOf(day("Monday", 11)));
    expect(cell).toContain("border-start-start-radius");
    expect(cell).toContain("border-end-end-radius");
    expect(cell).not.toContain("[data-range-start]{border-top-left-radius");
  });
});

describe("Calendar, react-day-picker's remaining props", () => {
  function captions(): string[] {
    return [...document.querySelectorAll('[data-slot="calendar-caption-label"]')].map(
      (each) => each.textContent ?? "",
    );
  }

  test("hidden days are drawn as nothing, and the keyboard steps over them", async () => {
    render(() => (
      <Calendar
        aria-label="Departure"
        defaultFocusedValue={new CalendarDate(2024, 3, 8)}
        hidden={{ dayOfWeek: [0, 6] }}
      />
    ));
    const saturday = document.querySelector(
      '[data-slot="calendar-day-button"][data-day="2024-03-09"]',
    ) as HTMLElement;
    expect(saturday.closest('[data-slot="calendar-day"]')?.hasAttribute("data-hidden")).toBe(true);
    expect(rulesFor(saturday.className)).toContain("visibility: hidden");

    const friday = day("Friday", 8);
    friday.focus();
    user.key("ArrowRight", { target: friday });
    flush();
    expect(document.activeElement).toBe(day("Monday", 11));
    user.click(saturday);
    flush();
    expect(saturday.getAttribute("aria-selected")).toBeNull();
  });

  test("disableNavigation turns the arrows off and keeps the keyboard in the months on show", async () => {
    render(() => <Calendar aria-label="Departure" defaultFocusedValue={MARCH} disableNavigation />);
    const previous = at("calendar-nav-previous");
    const next = at("calendar-nav-next");
    expect(
      previous.hasAttribute("disabled") || previous.getAttribute("aria-disabled") === "true",
    ).toBe(true);
    expect(next.hasAttribute("disabled") || next.getAttribute("aria-disabled") === "true").toBe(
      true,
    );
    user.click(next);
    flush();
    expect(captions()).toEqual(["March 2024"]);

    user.focus(day("Thursday", 7));
    await user.keyboard("{PageDown}");
    flush();
    expect(captions()).toEqual(["March 2024"]);
  });

  test("reverseMonths draws the latest month first", () => {
    render(() => (
      <Calendar
        aria-label="Departure"
        defaultFocusedValue={MARCH}
        numberOfMonths={2}
        reverseMonths
      />
    ));
    expect(captions()).toEqual(["April 2024", "March 2024"]);
  });

  test("fixedWeeks always draws six weeks", () => {
    render(() => (
      <Calendar
        aria-label="February"
        defaultFocusedValue={new CalendarDate(2026, 2, 1)}
        fixedWeeks
      />
    ));
    expect(document.querySelectorAll('[data-slot="calendar-week"]')).toHaveLength(6);
  });

  test("autoFocus puts focus on the chosen day when the calendar appears", () => {
    render(() => (
      <Calendar aria-label="Departure" defaultValue={MARCH} defaultFocusedValue={MARCH} autoFocus />
    ));
    flush();
    expect(document.activeElement).toBe(day("Thursday", 7));
  });

  test("onDayClick hears a pressed day with what it is, and the arrows say which month they went to", async () => {
    const days: string[] = [];
    const pages: string[] = [];
    render(() => (
      <Calendar
        aria-label="Departure"
        defaultFocusedValue={MARCH}
        disabled={new CalendarDate(2024, 3, 12)}
        onDayClick={(date, modifiers) =>
          days.push(`${String(date)} ${modifiers.disabled ? "disabled" : "enabled"}`)
        }
        onNextClick={(month) => pages.push(`next ${String(month)}`)}
        onPrevClick={(month) => pages.push(`prev ${String(month)}`)}
      />
    ));
    user.click(day("Monday", 11));
    user.click(day("Tuesday", 12));
    flush();
    expect(days).toEqual(["2024-03-11 enabled", "2024-03-12 disabled"]);

    user.focus(day("Wednesday", 13));
    await user.keyboard("{Enter}");
    flush();
    expect(days.at(-1)).toBe("2024-03-13 enabled");

    user.click(at("calendar-nav-next"));
    flush();
    user.click(at("calendar-nav-previous"));
    user.click(at("calendar-nav-previous"));
    flush();
    expect(pages).toEqual(["next 2024-04-01", "prev 2024-03-01", "prev 2024-02-01"]);
  });
});
