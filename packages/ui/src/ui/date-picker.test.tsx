import { describe, expect, test } from "bun:test";
import { CalendarDate } from "@barqjs/aria/date";
import { flush, signal } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { DatePicker, DateRangePicker } from "./date-picker.tsx";

/** The popover builds on a microtask after its marker connects. */
async function opened(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
}

describe("DatePicker", () => {
  test("says what to do before a date is chosen", () => {
    render(() => <DatePicker />);
    expect(screen.getByRole("button").textContent).toContain("Pick a date");
  });

  test("the placeholder is the caller's if they gave one", () => {
    render(() => <DatePicker placeholder="Departure" />);
    expect(screen.getByRole("button").textContent).toContain("Departure");
  });

  test("shows the chosen date, and follows it", () => {
    // The label is one call rather than a read per branch, because the compiler
    // PROVES reactivity: a value assembled piecewise at a prop is bound once,
    // and this is the assertion that says so.
    const date = signal<CalendarDate | null>(null);
    render(() => <DatePicker value={date()} />);
    const button = screen.getByRole("button");
    expect(button.textContent).toContain("Pick a date");

    date.set(new CalendarDate(2022, 1, 20));
    flush();
    expect(button.textContent).toContain("2022");
    expect(button.textContent).not.toContain("Pick a date");
  });

  test("the trigger is muted while empty and not once it is filled", () => {
    const date = signal<CalendarDate | null>(null);
    render(() => <DatePicker value={date()} />);
    const button = screen.getByRole("button");
    const muted = (): boolean =>
      rulesFor([...button.classList].join(" ")).includes("color: var(--muted-foreground)");

    expect(muted()).toBe(true);
    date.set(new CalendarDate(2022, 1, 20));
    flush();
    expect(muted()).toBe(false);
  });

  test("opens a calendar and reports the day pressed", async () => {
    const chosen: (CalendarDate | null)[] = [];
    render(() => (
      <DatePicker defaultValue={new CalendarDate(2022, 1, 20)} onChange={(d) => chosen.push(d)} />
    ));
    await user.click(screen.getByRole("button"));
    await opened();

    const grid = document.querySelector('[data-slot="calendar"]');
    expect(grid, "the calendar never opened").not.toBeNull();

    const day = screen.getByRole("button", { name: /21/ });
    await user.click(day);
    expect(chosen.at(-1)?.day).toBe(21);
  });

  test("the content carries no padding of its own, so the calendar owns the box", async () => {
    render(() => <DatePicker />);
    await user.click(screen.getByRole("button"));
    await opened();
    // shadcn's `w-auto p-0`, which is what stops the popover's own padding
    // boxing the calendar in.
    const content = document.querySelector('[data-slot="date-picker-content"]');
    expect(content).not.toBeNull();
    const declarations = rulesFor([...(content?.classList ?? [])].join(" "));
    // A shorthand expands, so `p-0` is four longhands and naming `padding` finds
    // nothing.
    expect(declarations).toContain("padding-top: 0px");
    expect(declarations).toContain("padding-left: 0px");
    expect(declarations).toContain("width: auto");
  });
});

describe("DateRangePicker", () => {
  test("reads both ends once they are chosen", () => {
    render(() => (
      <DateRangePicker
        value={{ start: new CalendarDate(2022, 1, 20), end: new CalendarDate(2022, 2, 9) }}
      />
    ));
    const text = screen.getByRole("button").textContent ?? "";
    expect(text).toContain("2022");
    expect(text).toContain(" - ");
  });

  test("says what to do before a range is chosen", () => {
    render(() => <DateRangePicker />);
    expect(screen.getByRole("button").textContent).toContain("Pick a date");
  });

  test("brings its own element, so a class lands on something", () => {
    render(() => <DateRangePicker class="mine" />);
    const root = document.querySelector('[data-slot="date-range-picker"]');
    expect(root).not.toBeNull();
    expect(root?.classList.contains("mine")).toBe(true);
  });
});
