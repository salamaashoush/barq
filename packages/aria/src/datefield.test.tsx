import { describe, expect, test } from "bun:test";
import { flush, type Incoming } from "@barqjs/core";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  user,
  accessibleDescription,
} from "@barqjs/testing";
import { CalendarDate, CalendarDateTime, Time, type DateValue } from "./date.ts";
import { DateField, TimeField } from "./datefield.tsx";

function Departure(
  props: Incoming<{
    value?: DateValue | null;
    defaultValue?: DateValue | null;
    granularity?: "day" | "hour" | "minute" | "second";
    isDisabled?: boolean;
    isReadOnly?: boolean;
    name?: string;
    onChange?: (value: DateValue | null) => void;
  }>,
) {
  return (
    <DateField
      label="Departure"
      value={props.value?.()}
      defaultValue={props.defaultValue?.()}
      granularity={props.granularity?.()}
      isDisabled={props.isDisabled?.()}
      isReadOnly={props.isReadOnly?.()}
      name={props.name?.()}
      onChange={props.onChange?.()}
    />
  );
}

function segments(): HTMLElement[] {
  return screen.getAllByRole("spinbutton");
}

function segment(name: string): HTMLElement {
  return screen.getByRole("spinbutton", { name });
}

describe("DateField", () => {
  test("is a named group of segments, one per part", () => {
    render(() => <Departure />);

    const group = screen.getByRole("group");
    expect(accessibleName(group)).toBe("Departure");
    // Month, day and year: the separators are not segments.
    expect(segments()).toHaveLength(3);
  });

  test("the segments are in the locale's order", () => {
    render(() => <Departure />);
    expect(segments().map((element: Element) => element.getAttribute("data-type"))).toEqual([
      "month",
      "day",
      "year",
    ]);
  });

  test("an empty field shows a shape to fill in, and has no value", () => {
    const changes: (DateValue | null)[] = [];
    render(() => <Departure onChange={(value) => changes.push(value)} />);

    for (const element of segments()) {
      expect(element.getAttribute("data-placeholder")).toBe("");
      // "Empty", not the placeholder letters: a screen reader reading "m m"
      // is reading nothing.
      expect(element.getAttribute("aria-valuetext")).toBe("Empty");
    }
    expect(changes).toEqual([]);
  });

  test("a value fills every segment", () => {
    render(() => <Departure value={new CalendarDate(2024, 3, 7)} />);

    expect(segment("month").textContent).toBe("03");
    expect(segment("day").textContent).toBe("07");
    expect(segment("year").textContent).toBe("2024");
    expect(segment("month").hasAttribute("data-placeholder")).toBe(false);
  });

  test("each segment is a spin button with its own range", () => {
    render(() => <Departure value={new CalendarDate(2024, 3, 7)} />);

    expect(segment("month").getAttribute("aria-valuemin")).toBe("1");
    expect(segment("month").getAttribute("aria-valuemax")).toBe("12");
    expect(segment("month").getAttribute("aria-valuenow")).toBe("3");
    // February 2024 has 29 days; March has 31.
    expect(segment("day").getAttribute("aria-valuemax")).toBe("31");
  });

  test("the arrows cycle within the segment", () => {
    render(() => <Departure defaultValue={new CalendarDate(2024, 12, 7)} />);

    user.focus(segment("month"));
    user.keyDown("ArrowUp");
    flush();

    // January of the SAME year: the user is editing the month.
    expect(segment("month").textContent).toBe("01");
    expect(segment("year").textContent).toBe("2024");
  });

  test("typing a digit that can only mean one thing moves on", () => {
    render(() => <Departure />);

    user.focus(segment("month"));
    user.keyDown("4");
    flush();

    expect(segment("month").textContent).toBe("04");
    // No month starts with 4 that is not 4, so the day is next.
    expect(document.activeElement).toBe(segment("day"));
  });

  test("typing a digit that could start a longer number waits", () => {
    render(() => <Departure />);

    user.focus(segment("month"));
    user.keyDown("1");
    flush();

    expect(segment("month").textContent).toBe("01");
    // 1, 10, 11 and 12 all begin with it.
    expect(document.activeElement).toBe(segment("month"));

    user.keyDown("2");
    flush();
    expect(segment("month").textContent).toBe("12");
  });

  test("the value only exists once every segment is filled", () => {
    const changes: (DateValue | null)[] = [];
    render(() => <Departure onChange={(value) => changes.push(value)} />);

    user.focus(segment("month"));
    user.keyDown("3");
    flush();
    user.keyDown("7");
    flush();
    expect(changes.filter((value) => value !== null)).toEqual([]);

    user.keyDown("2");
    user.keyDown("0");
    user.keyDown("2");
    user.keyDown("4");
    flush();

    expect(changes.at(-1)?.toString()).toBe("2024-03-07");
  });

  test("Backspace empties a segment and takes the value with it", () => {
    const changes: (DateValue | null)[] = [];
    render(() => (
      <Departure
        defaultValue={new CalendarDate(2024, 3, 7)}
        onChange={(value) => changes.push(value)}
      />
    ));

    user.focus(segment("day"));
    user.keyDown("Backspace");
    flush();

    expect(segment("day").getAttribute("data-placeholder")).toBe("");
    expect(changes.at(-1)).toBeNull();
  });

  test("the arrows move between segments", () => {
    render(() => <Departure value={new CalendarDate(2024, 3, 7)} />);

    user.focus(segment("month"));
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(segment("day"));

    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement).toBe(segment("month"));
  });

  test("a granularity of minutes adds the time segments", () => {
    render(() => (
      <Departure granularity="minute" value={new CalendarDateTime(2024, 3, 7, 14, 30)} />
    ));

    const types = segments().map((element: Element) => element.getAttribute("data-type"));
    expect(types).toContain("hour");
    expect(types).toContain("minute");
  });

  test("a disabled field takes no input", () => {
    const changes: (DateValue | null)[] = [];
    render(() => (
      <Departure
        isDisabled
        defaultValue={new CalendarDate(2024, 3, 7)}
        onChange={(value) => changes.push(value)}
      />
    ));

    expect(screen.getByRole("group").getAttribute("aria-disabled")).toBe("true");
    for (const element of segments()) {
      expect(element.getAttribute("aria-disabled")).toBe("true");
      // Still readable, still out of the Tab order.
      expect(element.hasAttribute("tabindex")).toBe(false);
    }

    user.keyDown("ArrowUp");
    flush();
    expect(changes).toEqual([]);
  });

  test("a read-only field shows its value and refuses to change it", () => {
    const changes: (DateValue | null)[] = [];
    render(() => (
      <Departure
        isReadOnly
        defaultValue={new CalendarDate(2024, 3, 7)}
        onChange={(value) => changes.push(value)}
      />
    ));

    user.focus(segment("month"));
    user.keyDown("ArrowUp");
    flush();

    expect(segment("month").textContent).toBe("03");
    expect(changes).toEqual([]);
  });

  test("a name puts the value into the form as ISO 8601", () => {
    const { container } = render(() => (
      <Departure name="departure" value={new CalendarDate(2024, 3, 7)} />
    ));

    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.type).toBe("hidden");
    expect(input.name).toBe("departure");
    expect(input.value).toBe("2024-03-07");
  });

  test("has no ARIA violations", () => {
    const { container } = render(() => <Departure value={new CalendarDate(2024, 3, 7)} />);
    expectNoAriaViolations(container);
  });
});

describe("TimeField", () => {
  test("is the time segments alone", () => {
    render(() => <TimeField label="Starts" value={new Time(14, 30)} />);

    const types = screen
      .getAllByRole("spinbutton")
      .map((element: Element) => element.getAttribute("data-type"));
    expect(types).toContain("hour");
    expect(types).toContain("minute");
  });

  test("reports a time rather than a date", () => {
    const changes: (Time | null)[] = [];
    render(() => (
      <TimeField
        label="Starts"
        value={new Time(14, 30)}
        onChange={(value) => changes.push(value)}
      />
    ));

    user.focus(screen.getByRole("spinbutton", { name: "minute" }));
    user.keyDown("ArrowUp");
    flush();

    expect(changes.at(-1)?.toString()).toBe("14:31:00");
  });
});

describe("a date outside minValue or maxValue", () => {
  function group(): HTMLElement {
    return screen.getByRole("group");
  }

  test("a date before minValue is invalid and says why", () => {
    render(() => (
      <DateField
        label="Departure"
        defaultValue={new CalendarDate(2026, 1, 1)}
        minValue={new CalendarDate(2026, 6, 1)}
      />
    ));

    // `minValue` was accepted and ignored before this: the segments took any
    // date at all and nothing said the field was out of range.
    expect(group().getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(group())).toContain("before");
  });

  test("a date after maxValue is invalid", () => {
    render(() => (
      <DateField
        label="Departure"
        defaultValue={new CalendarDate(2026, 12, 1)}
        maxValue={new CalendarDate(2026, 6, 1)}
      />
    ));

    expect(group().getAttribute("aria-invalid")).toBe("true");
    expect(accessibleDescription(group())).toContain("after");
  });

  test("a date inside the range is not", () => {
    render(() => (
      <DateField
        label="Departure"
        defaultValue={new CalendarDate(2026, 6, 15)}
        minValue={new CalendarDate(2026, 1, 1)}
        maxValue={new CalendarDate(2026, 12, 31)}
      />
    ));

    expect(group().hasAttribute("aria-invalid")).toBe(false);
  });

  test("an empty field is not out of range", () => {
    render(() => <DateField label="Departure" minValue={new CalendarDate(2026, 6, 1)} />);
    expect(group().hasAttribute("aria-invalid")).toBe(false);
  });
});
