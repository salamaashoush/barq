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
import type { DateRange } from "./calendar.tsx";
import { CalendarDate, CalendarDateTime, type DateValue } from "./date.ts";
import { DatePicker, DateRangePicker } from "./datepicker.tsx";

function Departure(
  props: Incoming<{
    value?: DateValue | null;
    granularity?: "day" | "minute";
    isDisabled?: boolean;
    onChange?: (value: DateValue | null) => void;
  }>,
) {
  return (
    <DatePicker
      label="Departure"
      value={props.value?.()}
      placeholderValue={new CalendarDate(2024, 3, 7)}
      granularity={props.granularity?.()}
      isDisabled={props.isDisabled?.()}
      onChange={props.onChange?.()}
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
  function Stay(props: Incoming<{ onChange?: (value: DateRange | null) => void }>) {
    return (
      <DateRangePicker
        label="Stay"
        placeholderValue={new CalendarDate(2024, 3, 7)}
        onChange={props.onChange?.()}
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
