import { describe, expect, test } from "bun:test";
import { CalendarDate, today } from "@barqjs/aria/date";
import { flush, createSignal } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { DatePicker, DatePickerInput, DateRangePicker } from "./date-picker.tsx";

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
    const [date, setDate] = createSignal<CalendarDate | null>(null);
    render(() => <DatePicker value={date()} />);
    const button = screen.getByRole("button");
    expect(button.textContent).toContain("Pick a date");

    setDate(new CalendarDate(2022, 1, 20));
    flush();
    expect(button.textContent).toContain("2022");
    expect(button.textContent).not.toContain("Pick a date");
  });

  test("the trigger is muted while empty and not once it is filled", () => {
    const [date, setDate] = createSignal<CalendarDate | null>(null);
    render(() => <DatePicker value={date()} />);
    const button = screen.getByRole("button");
    const muted = (): boolean =>
      rulesFor([...button.classList].join(" ")).includes("color: var(--muted-foreground)");

    expect(muted()).toBe(true);
    setDate(new CalendarDate(2022, 1, 20));
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

const at = (slot: string): HTMLElement | null => document.querySelector(`[data-slot="${slot}"]`);
const dayOf = (date: CalendarDate): HTMLElement =>
  document.querySelector(
    `[data-slot="calendar-day-button"][data-day="${String(date)}"]:not([aria-hidden])`,
  ) as HTMLElement;

describe("DatePicker, holding its own date", () => {
  test("the trigger reads the day pressed, with no value passed in", async () => {
    render(() => <DatePicker defaultValue={new CalendarDate(2022, 1, 20)} />);
    const trigger = at("date-picker-trigger") as HTMLElement;
    expect(trigger.textContent).toContain("January 20, 2022");

    await user.click(trigger);
    await opened();
    await user.click(dayOf(new CalendarDate(2022, 1, 21)));
    flush();
    expect(trigger.textContent).toContain("January 21, 2022");
  });

  test("starting empty, the placeholder gives way to the day pressed", async () => {
    const chosen: (CalendarDate | null)[] = [];
    render(() => <DatePicker onChange={(date) => chosen.push(date)} />);
    const trigger = at("date-picker-trigger") as HTMLElement;
    await user.click(trigger);
    await opened();
    await user.click(dayOf(today()));
    flush();
    expect(trigger.textContent).not.toContain("Pick a date");
    expect(String(chosen.at(-1))).toBe(String(today()));
  });

  test("a controlled picker still waits for its owner", async () => {
    render(() => <DatePicker value={new CalendarDate(2022, 1, 20)} />);
    const trigger = at("date-picker-trigger") as HTMLElement;
    await user.click(trigger);
    await opened();
    await user.click(dayOf(new CalendarDate(2022, 1, 21)));
    flush();
    expect(trigger.textContent).toContain("January 20, 2022");
  });

  test("the trigger says whether the calendar is open", async () => {
    render(() => <DatePicker />);
    const trigger = at("date-picker-trigger") as HTMLElement;
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(trigger);
    await opened();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  test("it can close on a choice, as a date of birth field does", async () => {
    render(() => (
      <DatePicker
        defaultValue={new CalendarDate(2022, 1, 20)}
        captionLayout="dropdown"
        closeOnSelect
      />
    ));
    await user.click(at("date-picker-trigger") as HTMLElement);
    await opened();
    expect(screen.getByRole("combobox", { name: "Choose the Year" })).toBeTruthy();

    await user.click(dayOf(new CalendarDate(2022, 1, 21)));
    await opened();
    expect(at("calendar")).toBeNull();
  });
});

describe("DatePicker, with presets", () => {
  const PRESETS = [
    { label: "Today", value: 0 },
    { label: "Tomorrow", value: 1 },
    { label: "In a week", value: 7 },
    { label: "New year", value: new CalendarDate(2030, 1, 1) },
  ];

  test("the presets sit above the calendar, which is boxed", async () => {
    render(() => <DatePicker presets={PRESETS} />);
    await user.click(at("date-picker-trigger") as HTMLElement);
    await opened();

    const content = at("date-picker-content") as HTMLElement;
    const select = at("date-picker-presets") as HTMLElement;
    expect(select).not.toBeNull();
    expect(content.contains(select)).toBe(true);
    const boxed = at("date-picker-calendar") as HTMLElement;
    expect(boxed.querySelector('[data-slot="calendar"]')).not.toBeNull();
    expect(rulesFor([...boxed.classList].join(" "))).toContain("border-top-width: 1px");
    // Padded, where the plain picker's content has none.
    expect(rulesFor([...content.classList].join(" "))).toContain(
      "padding-top: calc(var(--spacing) * 2)",
    );
  });

  test("choosing a preset sets the date, counted in days from today", async () => {
    const chosen: (CalendarDate | null)[] = [];
    render(() => <DatePicker presets={PRESETS} onChange={(date) => chosen.push(date)} />);
    const trigger = at("date-picker-trigger") as HTMLElement;
    await user.click(trigger);
    await opened();

    await user.click(at("date-picker-presets") as HTMLElement);
    await opened();
    await user.click(screen.getByRole("option", { name: "In a week" }));
    await opened();

    const expected = today().add({ days: 7 });
    expect(String(chosen.at(-1))).toBe(String(expected));
    expect(dayOf(expected).getAttribute("data-selected-single")).toBe("");
  });

  test("a preset can name a day outright, and the calendar turns to it", async () => {
    render(() => <DatePicker presets={PRESETS} />);
    const trigger = at("date-picker-trigger") as HTMLElement;
    await user.click(trigger);
    await opened();
    await user.click(at("date-picker-presets") as HTMLElement);
    await opened();
    await user.click(screen.getByRole("option", { name: "New year" }));
    await opened();

    expect(trigger.textContent).toContain("January 1, 2030");
    expect(at("calendar-caption-label")?.textContent).toBe("January 2030");
  });
});

describe("DateRangePicker, holding its own range", () => {
  test("the trigger reads both ends once the second is pressed", async () => {
    const seen: string[] = [];
    render(() => (
      <DateRangePicker
        defaultValue={{ start: new CalendarDate(2022, 1, 20), end: new CalendarDate(2022, 1, 22) }}
        onChange={(range) => seen.push(`${String(range?.start)}/${String(range?.end)}`)}
      />
    ));
    const trigger = at("date-range-picker-trigger") as HTMLElement;
    await user.click(trigger);
    await opened();
    await user.click(dayOf(new CalendarDate(2022, 1, 10)));
    await user.click(dayOf(new CalendarDate(2022, 2, 9)));
    flush();
    expect(seen).toEqual(["2022-01-10/2022-02-09"]);
    expect(trigger.textContent).toContain("Jan 10, 2022 - Feb 09, 2022");
  });

  test("two months side by side, as upstream's is, or as many as asked for", async () => {
    render(() => (
      <DateRangePicker
        defaultValue={{ start: new CalendarDate(2022, 1, 20), end: new CalendarDate(2022, 2, 9) }}
      />
    ));
    await user.click(at("date-range-picker-trigger") as HTMLElement);
    await opened();
    expect(screen.getAllByRole("grid")).toHaveLength(2);
  });

  test("one month when asked for one", async () => {
    render(() => <DateRangePicker numberOfMonths={1} />);
    await user.click(at("date-range-picker-trigger") as HTMLElement);
    await opened();
    expect(screen.getAllByRole("grid")).toHaveLength(1);
  });
});

describe("DatePickerInput", () => {
  function Subscription(props: { onChange?: (date: CalendarDate | null) => void }) {
    return (
      <DatePickerInput
        id="subscription"
        aria-label="Subscription date"
        defaultValue={new CalendarDate(2025, 6, 1)}
        placeholder="June 01, 2025"
        onChange={props.onChange}
      />
    );
  }

  const field = (): HTMLInputElement => screen.getByRole<HTMLInputElement>("textbox");
  const opener = (): HTMLElement => screen.getByRole("button", { name: "Select date" });

  test("a text field holding the date, and a named button that opens the calendar", () => {
    render(() => <Subscription />);
    expect(field().value).toBe("June 01, 2025");
    expect(field().id).toBe("subscription");
    expect(field().getAttribute("aria-label")).toBe("Subscription date");
    expect(at("input-group")).not.toBeNull();
    expect(opener().getAttribute("aria-expanded")).toBe("false");
  });

  test("typing a date the platform can read chooses it and turns the calendar to it", async () => {
    const chosen: (CalendarDate | null)[] = [];
    render(() => <Subscription onChange={(date) => chosen.push(date)} />);
    user.clear(field());
    user.type(field(), "March 7, 2024");
    flush();
    expect(String(chosen.at(-1))).toBe("2024-03-07");

    await user.click(opener());
    await opened();
    expect(at("calendar-caption-label")?.textContent).toBe("March 2024");
    expect(dayOf(new CalendarDate(2024, 3, 7)).getAttribute("data-selected-single")).toBe("");
  });

  test("an ISO date is the day it says, whatever the zone", () => {
    const chosen: (CalendarDate | null)[] = [];
    render(() => <Subscription onChange={(date) => chosen.push(date)} />);
    user.clear(field());
    user.type(field(), "2024-03-07");
    flush();
    expect(String(chosen.at(-1))).toBe("2024-03-07");
  });

  test("text that is not a date is kept as typed and chooses nothing", () => {
    const chosen: (CalendarDate | null)[] = [];
    render(() => <Subscription onChange={(date) => chosen.push(date)} />);
    user.clear(field());
    user.type(field(), "soon");
    flush();
    expect(field().value).toBe("soon");
    expect(chosen.filter((date) => date !== null)).toEqual([]);
  });

  test("the down arrow in the field opens the calendar", async () => {
    render(() => <Subscription />);
    field().focus();
    user.key("ArrowDown", { target: field() });
    await opened();
    expect(at("calendar")).not.toBeNull();
  });

  test("pressing a day writes it into the field and closes the calendar", async () => {
    render(() => <Subscription />);
    await user.click(opener());
    await opened();
    await user.click(dayOf(new CalendarDate(2025, 6, 12)));
    await opened();
    expect(field().value).toBe("June 12, 2025");
    expect(at("calendar")).toBeNull();
  });
});
