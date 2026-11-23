import { describe, expect, test } from "bun:test";
import { type Child, flush } from "@barqjs/core";
import {
  accessibleDescription,
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  tick,
  user,
} from "@barqjs/testing";
import type { DateRange } from "./calendar.tsx";
import { CalendarDate, CalendarDateTime, parseZonedDateTime, type DateValue } from "./date.ts";
import { DatePicker, DateRangePicker } from "./datepicker.tsx";
import { provideLocale } from "./i18n.ts";

function InLocale(props: { tag: string; children?: Child }) {
  const localeProps = provideLocale(() => props.tag);
  return <div {...localeProps}>{props.children}</div>;
}

function Departure(props: {
  value?: DateValue | null;
  granularity?: "day" | "minute";
  isDisabled?: boolean;
  onChange?: (value: DateValue | null) => void;
}) {
  return (
    <DatePicker
      label="Departure"
      value={props.value}
      placeholderValue={new CalendarDate(2024, 3, 7)}
      granularity={props.granularity}
      isDisabled={props.isDisabled}
      onChange={props.onChange}
    />
  );
}

function trigger(): HTMLElement {
  return screen.getByRole("button", { name: /^Calendar/ });
}

function segment(name: string): HTMLElement {
  return screen.getByRole("spinbutton", { name });
}

describe("DatePicker", () => {
  test("is a named group holding a field and a calendar button", () => {
    render(() => <Departure />);

    expect(accessibleName(screen.getByRole("group", { name: "Departure" }))).toBe("Departure");
    expect(screen.getAllByRole("spinbutton")).toHaveLength(3);
    expect(trigger()).not.toBeNull();
  });

  test("the button says a dialog opens, and is named with the field", () => {
    render(() => <Departure />);

    expect(trigger().getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(accessibleName(trigger())).toBe("Calendar Departure");
  });

  test("the field shows the value", () => {
    render(() => <Departure value={new CalendarDate(2024, 3, 7)} />);

    expect(segment("month").textContent).toBe("03");
    expect(segment("day").textContent).toBe("07");
    expect(segment("year").textContent).toBe("2024");
  });

  test("pressing the button opens a dialog with a calendar in it", async () => {
    render(() => <Departure />);

    user.click(trigger());
    await tick();

    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(screen.getByRole("grid")).not.toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  test("choosing a day fills the field and closes the calendar", async () => {
    const changes: (DateValue | null)[] = [];
    render(() => <Departure onChange={(value) => changes.push(value)} />);

    user.click(trigger());
    await tick();

    user.click(screen.getByRole("button", { name: /^Friday, March 15, 2024/ }));
    flush();

    expect(changes.at(-1)?.toString()).toBe("2024-03-15");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("typing into the field reports the date without opening anything", () => {
    const changes: (DateValue | null)[] = [];
    render(() => <Departure onChange={(value) => changes.push(value)} />);

    user.focus(segment("month"));
    for (const key of ["3", "7", "2", "0", "2", "4"]) {
      user.keyDown(key);
      flush();
    }

    expect(changes.at(-1)?.toString()).toBe("2024-03-07");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("choosing a day keeps the time the field already held", async () => {
    const changes: (DateValue | null)[] = [];
    render(() => (
      <Departure
        granularity="minute"
        value={new CalendarDateTime(2024, 3, 7, 14, 30)}
        onChange={(value) => changes.push(value)}
      />
    ));

    user.click(trigger());
    await tick();
    user.click(screen.getByRole("button", { name: /^Friday, March 15, 2024/ }));
    flush();

    // Choosing a day is choosing a day, not resetting the meeting to midnight.
    expect(changes.at(-1)?.toString()).toBe("2024-03-15T14:30:00");
  });

  test("Escape closes the calendar without choosing", async () => {
    const changes: (DateValue | null)[] = [];
    render(() => <Departure onChange={(value) => changes.push(value)} />);

    user.click(trigger());
    await tick();
    user.keyDown("Escape");
    flush();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(changes).toEqual([]);
  });

  test("a disabled picker will not open", () => {
    render(() => <Departure isDisabled />);

    expect((trigger() as HTMLButtonElement).disabled).toBe(true);
    user.click(trigger());
    flush();

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("has no ARIA violations, closed and open", async () => {
    const { container } = render(() => <Departure value={new CalendarDate(2024, 3, 7)} />);
    expectNoAriaViolations(container);

    user.click(trigger());
    await tick();
    expectNoAriaViolations(container);
  });
});

describe("DateRangePicker", () => {
  function Stay(props: { onChange?: (value: DateRange<DateValue> | null) => void }) {
    return (
      <DateRangePicker
        label="Stay"
        placeholderValue={new CalendarDate(2024, 3, 7)}
        onChange={props.onChange}
      />
    );
  }

  test("is two fields and one calendar button", () => {
    render(() => <Stay />);

    // Three segments a field, twice over.
    expect(screen.getAllByRole("spinbutton")).toHaveLength(6);
    expect(screen.getAllByRole("group")).toHaveLength(3);
  });

  test("the fields say which end they are", () => {
    render(() => <Stay />);

    expect(screen.getByRole("group", { name: "Start date" })).not.toBeNull();
    expect(screen.getByRole("group", { name: "End date" })).not.toBeNull();
  });

  test("drawing a range in the calendar fills both fields", async () => {
    const ranges: string[][] = [];
    render(() => (
      <Stay
        onChange={(value) =>
          ranges.push(value === null ? [] : [String(value.start), String(value.end)])
        }
      />
    ));

    user.click(screen.getByRole("button", { name: /Calendar/ }));
    await tick();

    user.click(screen.getByRole("button", { name: /^Monday, March 11, 2024/ }));
    user.click(screen.getByRole("button", { name: /^Friday, March 15, 2024/ }));
    flush();

    expect(ranges.at(-1)).toEqual(["2024-03-11", "2024-03-15"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Stay />);
    expectNoAriaViolations(container);
  });
});

describe("a date picker with a range", () => {
  test("a value outside minValue is invalid, through the field it forwards to", () => {
    render(() => (
      <DatePicker
        label="Departure"
        value={new CalendarDate(2026, 1, 1)}
        minValue={new CalendarDate(2026, 6, 1)}
      />
    ));

    // `datePickerState` does not check the range itself: it hands `minValue`
    // to the `<DateField>` and to the `<Calendar>`, and both enforce it.
    const field = screen
      .getAllByRole("group")
      .find((g) => g.getAttribute("aria-invalid") === "true");
    expect(field, "nothing in the picker reported the value as out of range").not.toBeUndefined();
  });
});

describe("opening from the keyboard", () => {
  test("Alt+ArrowDown in the field opens the calendar and leaves the date alone", async () => {
    const changes: (DateValue | null)[] = [];
    render(() => (
      <DatePicker
        label="Departure"
        defaultValue={new CalendarDate(2024, 3, 7)}
        onChange={(value) => changes.push(value)}
      />
    ));

    user.focus(segment("month"));
    user.keyDown("ArrowDown", { altKey: true });
    await tick();

    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(changes).toEqual([]);
  });

  test("so does Alt+ArrowUp, in a range picker too", async () => {
    render(() => <DateRangePicker label="Stay" placeholderValue={new CalendarDate(2024, 3, 7)} />);

    user.focus(screen.getAllByRole("spinbutton")[0] as HTMLElement);
    user.keyDown("ArrowUp", { altKey: true });
    await tick();
    expect(screen.getByRole("dialog")).not.toBeNull();
  });
});

describe("what a date picker refuses", () => {
  test("a typed date the page says is unavailable is invalid", () => {
    render(() => (
      <DatePicker
        label="Departure"
        defaultValue={new CalendarDate(2026, 3, 10)}
        isDateUnavailable={(date) => date.day === 10}
      />
    ));
    const invalid = screen
      .getAllByRole("group")
      .filter((group) => group.getAttribute("aria-invalid") === "true");
    expect(invalid.length).toBeGreaterThan(0);
  });

  test("a range that ends before it starts is invalid, and says so", () => {
    render(() => (
      <DateRangePicker
        label="Stay"
        defaultValue={{ start: new CalendarDate(2026, 3, 10), end: new CalendarDate(2026, 3, 12) }}
      />
    ));

    const end = screen.getByRole("group", { name: "End date" });
    const endDay = end.querySelectorAll<HTMLElement>('[role="spinbutton"]')[1] as HTMLElement;
    user.focus(endDay);
    user.keyDown("0");
    user.keyDown("1");
    flush();

    const stay = screen.getByRole("group", { name: "Stay" });
    expect(stay.getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(stay)).toContain("The start date is after the end date.");
    expect(end.getAttribute("aria-invalid")).toBe("true");
  });

  test("a range keeps the time typed into either end", () => {
    const ranges: string[][] = [];
    render(() => (
      <DateRangePicker
        label="Stay"
        granularity="minute"
        hourCycle={24}
        defaultValue={{
          start: new CalendarDateTime(2026, 3, 10, 9, 0),
          end: new CalendarDateTime(2026, 3, 12, 17, 0),
        }}
        onChange={(value) =>
          ranges.push(value === null ? [] : [String(value.start), String(value.end)])
        }
      />
    ));

    const end = screen.getByRole("group", { name: "End date" });
    const hour = end.querySelector<HTMLElement>('[data-type="hour"]') as HTMLElement;
    user.focus(hour);
    user.keyDown("ArrowUp");
    flush();
    expect(ranges.at(-1)).toEqual(["2026-03-10T09:00:00", "2026-03-12T18:00:00"]);
  });

  test("a range picker takes what a date picker takes", () => {
    render(() => (
      <DateRangePicker
        label="Stay"
        granularity="minute"
        hourCycle={24}
        isRequired
        isInvalid
        errorMessage="Pick your nights"
        defaultValue={{
          start: new CalendarDateTime(2026, 3, 10, 9, 0),
          end: new CalendarDateTime(2026, 3, 12, 17, 0),
        }}
      />
    ));

    const stay = screen.getByRole("group", { name: "Stay" });
    expect(stay.getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(stay)).toContain("Pick your nights");
    const start = screen.getByRole("group", { name: "Start date" });
    expect(start.getAttribute("aria-required")).toBe("true");
    // A 24-hour clock has no AM and PM.
    expect(start.querySelector('[data-type="dayPeriod"]')).toBeNull();
  });

  test("a range picker's validate sees the range", () => {
    const seen: string[] = [];
    render(() => (
      <DateRangePicker
        label="Stay"
        defaultValue={{ start: new CalendarDate(2026, 3, 10), end: new CalendarDate(2026, 3, 12) }}
        validate={(range) => {
          seen.push(range === null ? "" : `${String(range.start)}/${String(range.end)}`);
          return "Too short";
        }}
      />
    ));
    expect(seen).toContain("2026-03-10/2026-03-12");
    const stay = screen.getByRole("group", { name: "Stay" });
    expect(stay.getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(stay)).toContain("Too short");
  });
});

describe("a date picker in a zone or another calendar", () => {
  test("choosing a day keeps a zoned value's time and zone", async () => {
    const changes: (DateValue | null)[] = [];
    render(() => (
      <DatePicker
        label="Call"
        defaultValue={parseZonedDateTime("2024-03-07T09:30[America/New_York]")}
        onChange={(value) => changes.push(value)}
      />
    ));

    expect(screen.getByRole("textbox", { name: "time zone" }).textContent).toBe("EST");
    user.click(trigger());
    await tick();
    user.click(screen.getByRole("button", { name: /^Sunday, March 10, 2024/ }));
    flush();

    expect(changes.at(-1)?.toString()).toBe("2024-03-10T09:30:00-04:00[America/New_York]");
    expect(screen.getByRole("textbox", { name: "time zone" }).textContent).toBe("EDT");
  });

  test("a day chosen with no value yet takes the placeholder's time and zone", async () => {
    const changes: (DateValue | null)[] = [];
    render(() => (
      <DatePicker
        label="Call"
        placeholderValue={parseZonedDateTime("2024-03-07T09:30[America/New_York]")}
        onChange={(value) => changes.push(value)}
      />
    ));

    user.click(trigger());
    await tick();
    user.click(screen.getByRole("button", { name: /^Friday, March 8, 2024/ }));
    flush();
    expect(changes.at(-1)?.toString()).toBe("2024-03-08T09:30:00-05:00[America/New_York]");
  });

  test("the field and the calendar both follow the locale's calendar", async () => {
    const changes: (DateValue | null)[] = [];
    render(() => (
      <InLocale tag="en-US-u-ca-japanese">
        <DatePicker
          label="Date"
          defaultValue={new CalendarDate(2024, 2, 1)}
          onChange={(value) => changes.push(value)}
        />
      </InLocale>
    ));

    expect(segment("era")).not.toBeNull();
    user.click(trigger());
    await tick();
    expect(screen.getByRole("heading").textContent).toBe("February Reiwa 6");
    user.click(screen.getByRole("button", { name: /^Thursday, February 15, Reiwa 6/ }));
    flush();
    expect(changes.at(-1)?.calendar.identifier).toBe("gregory");
    expect(changes.at(-1)?.toString()).toBe("2024-02-15");
  });
});
