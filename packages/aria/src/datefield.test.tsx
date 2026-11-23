import { describe, expect, test } from "bun:test";
import { type Child, flush } from "@barqjs/core";
import {
  accessibleName,
  expectNoAriaViolations,
  render,
  screen,
  tick,
  user,
  accessibleDescription,
} from "@barqjs/testing";
import {
  CalendarDate,
  CalendarDateTime,
  HebrewCalendar,
  JapaneseCalendar,
  parseZonedDateTime,
  Time,
  ZonedDateTime,
  type DateValue,
} from "./date.ts";
import { DateField, TimeField } from "./datefield.tsx";
import { provideLocale } from "./i18n.ts";

function Departure(props: {
  value?: DateValue | null;
  defaultValue?: DateValue | null;
  granularity?: "day" | "hour" | "minute" | "second";
  isDisabled?: boolean;
  isReadOnly?: boolean;
  name?: string;
  onChange?: (value: DateValue | null) => void;
}) {
  return (
    <DateField
      label="Departure"
      value={props.value}
      defaultValue={props.defaultValue}
      granularity={props.granularity}
      isDisabled={props.isDisabled}
      isReadOnly={props.isReadOnly}
      name={props.name}
      onChange={props.onChange}
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

describe("a segment's description", () => {
  const described = (): string[] => segments().map((element) => accessibleDescription(element));

  test("the first segment reads the field's description and the rest do not", () => {
    render(() => (
      <>
        <span id="trip-note">Local time</span>
        <DateField
          label="Departure"
          description="When the train leaves"
          aria-describedby="trip-note"
          defaultValue={new CalendarDate(2026, 3, 8)}
        />
      </>
    ));

    expect(described()).toEqual(["When the train leaves Local time", "", ""]);
    const group = accessibleDescription(screen.getByRole("group"));
    expect(group).toContain("When the train leaves");
    expect(group).toContain("Local time");
  });

  test("an invalid field describes every segment, with its error", () => {
    render(() => (
      <DateField
        label="Departure"
        description="When the train leaves"
        errorMessage="No trains that day"
        isInvalid
        defaultValue={new CalendarDate(2026, 3, 8)}
      />
    ));

    expect(described()).toEqual(
      Array.from({ length: 3 }, () => "When the train leaves No trains that day"),
    );
  });

  test("a TimeField describes its first segment too", () => {
    render(() => (
      <TimeField label="Starts" description="In the venue's zone" value={new Time(14, 30)} />
    ));

    expect(described()[0]).toBe("In the venue's zone");
    expect(
      described()
        .slice(1)
        .every((text) => text === ""),
    ).toBe(true);
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

function InLocale(props: { tag: string; children?: Child }) {
  const localeProps = provideLocale(() => props.tag);
  return <div {...localeProps}>{props.children}</div>;
}

function beforeInput(element: Element, inputType: string, data: string | null = null): boolean {
  return element.dispatchEvent(
    new InputEvent("beforeinput", { inputType, data, bubbles: true, cancelable: true }),
  );
}

describe("editing on a touch device", () => {
  test("an editable segment is content-editable, a disabled or read-only one is not", () => {
    render(() => <Departure />);
    expect(segment("month").getAttribute("contenteditable")).toBe("true");
    expect(segment("month").getAttribute("inputmode")).toBe("numeric");

    render(() => <Departure isReadOnly />);
    const readOnly = screen.getAllByRole("spinbutton").at(-1) as HTMLElement;
    expect(readOnly.getAttribute("contenteditable")).not.toBe("true");
  });

  test("a virtual keyboard's beforeinput types into the segment", () => {
    const changes: (DateValue | null)[] = [];
    render(() => <Departure onChange={(value) => changes.push(value)} />);

    user.focus(segment("month"));
    // The keydown of a virtual keyboard carries no key; the character arrives
    // only in beforeinput, which the browser would otherwise write into the
    // segment's text.
    expect(beforeInput(segment("month"), "insertText", "4")).toBe(false);
    flush();
    expect(segment("month").textContent).toBe("04");
    expect(document.activeElement).toBe(segment("day"));

    for (const key of ["7", "2", "0", "2", "6"]) {
      beforeInput(document.activeElement as Element, "insertText", key);
      flush();
    }
    expect(changes.at(-1)?.toString()).toBe("2026-04-07");
  });

  test("a virtual keyboard's delete removes one digit", () => {
    render(() => <Departure defaultValue={new CalendarDate(2024, 12, 7)} />);
    user.focus(segment("month"));
    beforeInput(segment("month"), "deleteContentBackward");
    flush();
    expect(segment("month").textContent).toBe("01");
  });

  test("on iOS a segment is a textbox, because VoiceOver cannot focus a spin button", () => {
    const platform = Object.getOwnPropertyDescriptor(window.navigator, "platform");
    Object.defineProperty(window.navigator, "platform", { value: "iPhone", configurable: true });
    try {
      render(() => <Departure value={new CalendarDate(2024, 3, 7)} />);
      const boxes = screen.getAllByRole("textbox");
      expect(boxes).toHaveLength(3);
      expect(boxes[0]?.hasAttribute("aria-valuenow")).toBe(false);
      expect(boxes[0]?.hasAttribute("aria-valuetext")).toBe(false);
    } finally {
      if (platform === undefined) Reflect.deleteProperty(window.navigator, "platform");
      else Object.defineProperty(window.navigator, "platform", platform);
    }
  });
});

describe("what a segment reads as", () => {
  test("a month reads as its number and its name", () => {
    render(() => <Departure value={new CalendarDate(2024, 3, 7)} />);
    expect(segment("month").getAttribute("aria-valuetext")).toBe("03 – March");
    expect(segment("day").getAttribute("aria-valuetext")).toBe("07");
  });

  test("an hour reads as the hour of the day", () => {
    render(() => (
      <Departure granularity="minute" value={new CalendarDateTime(2024, 3, 7, 14, 30)} />
    ));
    expect(segment("hour").getAttribute("aria-valuetext")).toBe("2 PM");
  });

  test("an empty field's placeholders are the locale's own", () => {
    render(() => (
      <InLocale tag="de-DE">
        <DateField label="Abreise" />
      </InLocale>
    ));
    expect(segments().map((element: Element) => element.textContent)).toEqual(["tt", "mm", "jjjj"]);
  });
});

describe("Backspace", () => {
  test("removes the last digit rather than the whole segment", () => {
    const changes: (DateValue | null)[] = [];
    render(() => (
      <Departure
        defaultValue={new CalendarDate(2024, 12, 7)}
        onChange={(value) => changes.push(value)}
      />
    ));

    user.focus(segment("year"));
    user.keyDown("Backspace");
    flush();
    expect(segment("year").textContent).toBe("202");
    expect(changes.at(-1)?.toString()).toBe("0202-12-07");

    user.focus(segment("month"));
    user.keyDown("Backspace");
    flush();
    expect(segment("month").textContent).toBe("01");
  });

  test("on an empty segment moves back to the one before", () => {
    render(() => <Departure />);
    user.focus(segment("day"));
    user.keyDown("Backspace");
    flush();
    expect(document.activeElement).toBe(segment("month"));
  });
});

describe("the arrow keys between segments", () => {
  test("follow the screen, not the DOM, right to left", () => {
    render(() => (
      <InLocale tag="he-IL">
        <DateField label="תאריך" value={new CalendarDate(2024, 3, 7)} />
      </InLocale>
    ));
    const all = segments();
    // Laid out right to left: the first segment in the DOM is on the right.
    all.forEach((element, at) => {
      const left = (all.length - 1 - at) * 40;
      element.getBoundingClientRect = () => new DOMRect(left, 0, 30, 20);
    });

    user.focus(all[1] as HTMLElement);
    user.keyDown("ArrowLeft");
    flush();
    expect(document.activeElement).toBe(all[2] as HTMLElement);

    user.keyDown("ArrowRight");
    flush();
    user.keyDown("ArrowRight");
    flush();
    expect(document.activeElement).toBe(all[0] as HTMLElement);
  });

  test("a modified arrow is not the segment's", () => {
    render(() => <Departure defaultValue={new CalendarDate(2024, 3, 7)} />);
    user.focus(segment("month"));
    user.keyDown("ArrowDown", { altKey: true });
    flush();
    expect(segment("month").textContent).toBe("03");
  });
});

describe("a day-first locale", () => {
  test("typing a whole date in en-GB gives that date, whatever month the placeholder shows", () => {
    const changes: (DateValue | null)[] = [];
    render(() => (
      <InLocale tag="en-GB">
        <DateField
          label="Due"
          placeholderValue={new CalendarDate(2026, 11, 21)}
          onChange={(value) => changes.push(value)}
        />
      </InLocale>
    ));

    user.focus(segments()[0] as HTMLElement);
    for (const key of "31122026") {
      user.keyDown(key);
      flush();
    }
    expect(changes.at(-1)?.toString()).toBe("2026-12-31");
  });

  test("a day that its month lacks is held as typed until the field is left", () => {
    const changes: (DateValue | null)[] = [];
    render(() => (
      <InLocale tag="en-GB">
        <DateField label="Due" onChange={(value) => changes.push(value)} />
        <button type="button">after</button>
      </InLocale>
    ));

    user.focus(segments()[0] as HTMLElement);
    for (const key of "31022026") {
      user.keyDown(key);
      flush();
    }
    expect(segments().map((element: Element) => element.textContent)).toEqual(["31", "02", "2026"]);
    expect(changes.filter((value) => value !== null)).toEqual([]);

    user.tab();
    flush();
    expect(changes.at(-1)?.toString()).toBe("2026-02-28");
    expect(segments()[0]?.textContent).toBe("28");
  });
});

describe("TimeField on its own", () => {
  test("an empty one shows only the time", () => {
    render(() => <TimeField label="Starts" />);
    expect(segments().map((element: Element) => element.getAttribute("data-type"))).toEqual([
      "hour",
      "minute",
      "dayPeriod",
    ]);
  });

  test("typing a time reports it", () => {
    const changes: (Time | null)[] = [];
    render(() => <TimeField label="Starts" onChange={(value) => changes.push(value)} />);

    user.focus(segment("hour"));
    for (const key of ["9", "3", "0", "p"]) {
      user.keyDown(key);
      flush();
    }
    expect(changes.at(-1)?.toString()).toBe("21:30:00");
  });

  test("puts the time into the form, and checks it against its bounds", () => {
    render(() => (
      <form data-testid="form">
        <TimeField
          label="Starts"
          name="starts"
          defaultValue={new Time(7, 15)}
          minValue={new Time(9, 0)}
          maxValue={new Time(17, 0)}
        />
      </form>
    ));

    const form = screen.getByTestId<HTMLFormElement>("form");
    expect([...new FormData(form).entries()]).toEqual([["starts", "07:15:00"]]);
    expect(screen.getByRole("group").getAttribute("aria-invalid")).toBe("true");
  });

  test("an empty one counts from its placeholder", () => {
    render(() => <TimeField label="Starts" placeholderValue={new Time(14, 0)} />);
    user.focus(segment("hour"));
    user.keyDown("ArrowUp");
    flush();
    expect(segment("hour").textContent).toBe("02");
    expect(segment("AM/PM").textContent).toBe("PM");
  });
});

describe("a DateField in a form", () => {
  test("a required empty field blocks a native submit", () => {
    render(() => (
      <form data-testid="form">
        <DateField label="Due" name="due" isRequired validationBehavior="native" />
      </form>
    ));
    const form = screen.getByTestId<HTMLFormElement>("form");
    expect(form.checkValidity()).toBe(false);
  });

  test("a reset puts the default back", () => {
    render(() => (
      <form data-testid="form">
        <DateField label="Due" name="due" defaultValue={new CalendarDate(2026, 3, 10)} />
      </form>
    ));
    const form = screen.getByTestId<HTMLFormElement>("form");

    user.focus(segment("month"));
    user.keyDown("ArrowUp");
    flush();
    expect(new FormData(form).get("due")).toBe("2026-04-10");

    form.reset();
    flush();
    expect(new FormData(form).get("due")).toBe("2026-03-10");
    expect(segment("month").textContent).toBe("03");
  });

  test("a date the page says is unavailable is invalid", () => {
    render(() => (
      <DateField
        label="Due"
        defaultValue={new CalendarDate(2026, 3, 10)}
        isDateUnavailable={(date) => date.day === 10}
      />
    ));
    expect(screen.getByRole("group").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("a calendar with eras", () => {
  function Japanese(props: {
    defaultValue: DateValue;
    onChange?: (value: DateValue | null) => void;
  }) {
    return (
      <InLocale tag="en-US-u-ca-japanese">
        <DateField label="Date" defaultValue={props.defaultValue} onChange={props.onChange} />
      </InLocale>
    );
  }

  test("the locale's calendar names the era, as a segment of its own", () => {
    render(() => <Japanese defaultValue={new CalendarDate(2024, 2, 3)} />);

    const types = segments().map((element) => element.getAttribute("data-type"));
    expect(types).toEqual(["month", "day", "era", "year"]);
    // 2024 is the sixth year of Reiwa.
    expect(segment("year").textContent).toBe("6");
    expect(segment("era").getAttribute("aria-valuetext")).toBe(segment("era").textContent);
  });

  test("the arrows step the era, keeping the year of it", () => {
    const changes: (DateValue | null)[] = [];
    const japanese = new JapaneseCalendar();
    render(() => (
      <Japanese
        defaultValue={new CalendarDate(japanese, "heisei", 5, 2, 3)}
        onChange={(value) => changes.push(value)}
      />
    ));

    user.focus(segment("era"));
    user.keyDown("ArrowUp");
    flush();
    expect(changes.at(-1)).toEqual(new CalendarDate(japanese, "reiwa", 5, 2, 3));

    user.keyDown("ArrowDown");
    user.keyDown("ArrowDown");
    flush();
    expect(changes.at(-1)).toEqual(new CalendarDate(japanese, "showa", 5, 2, 3));
  });

  test("stepping the year crosses into the era before", () => {
    const changes: (DateValue | null)[] = [];
    const japanese = new JapaneseCalendar();
    render(() => (
      <Japanese
        defaultValue={new CalendarDate(japanese, "reiwa", 1, 12, 28)}
        onChange={(value) => changes.push(value)}
      />
    ));

    user.focus(segment("year"));
    user.keyDown("ArrowDown");
    flush();
    expect(changes.at(-1)).toEqual(new CalendarDate(japanese, "heisei", 30, 12, 28));
  });

  test("typing an era's first letter chooses it", () => {
    const changes: (DateValue | null)[] = [];
    const japanese = new JapaneseCalendar();
    render(() => (
      <Japanese
        defaultValue={new CalendarDate(japanese, "reiwa", 5, 2, 3)}
        onChange={(value) => changes.push(value)}
      />
    ));

    user.focus(segment("era"));
    user.keyDown("h");
    flush();
    expect(changes.at(-1)).toEqual(new CalendarDate(japanese, "heisei", 5, 2, 3));
  });

  test("a value is reported in its own calendar, whatever the field shows", () => {
    const changes: (DateValue | null)[] = [];
    render(() => (
      <Japanese
        defaultValue={new CalendarDate(2024, 2, 3)}
        onChange={(value) => changes.push(value)}
      />
    ));

    user.focus(segment("day"));
    user.keyDown("ArrowUp");
    flush();
    expect(changes.at(-1)?.calendar.identifier).toBe("gregory");
    expect(changes.at(-1)?.toString()).toBe("2024-02-04");
  });

  test("a Gregorian year before the common era shows its era, and loses it with it", async () => {
    render(() => <Departure defaultValue={new CalendarDate("BC", 2020, 2, 3)} />);

    const era = segment("era");
    expect(segments().at(-1)).toBe(era);

    user.focus(era);
    user.keyDown("ArrowUp");
    flush();
    await tick();

    expect(screen.queryByRole("spinbutton", { name: "era" })).toBeNull();
    // The era went from under the focus, which moves back to the year.
    expect(document.activeElement).toBe(segment("year"));
  });

  test("a Hebrew leap year's thirteenth month can be reached", () => {
    const changes: (DateValue | null)[] = [];
    const hebrew = new HebrewCalendar();
    render(() => (
      <InLocale tag="en-US-u-ca-hebrew">
        <DateField
          label="Date"
          defaultValue={new CalendarDate(hebrew, 5784, 12, 1)}
          onChange={(value) => changes.push(value)}
        />
      </InLocale>
    ));

    expect(segment("month").getAttribute("aria-valuemax")).toBe("13");
    user.focus(segment("month"));
    user.keyDown("ArrowUp");
    flush();
    expect(changes.at(-1)).toEqual(new CalendarDate(hebrew, 5784, 13, 1));
  });
});

describe("a value in a time zone", () => {
  const zoned = (text: string) => parseZonedDateTime(text);

  test("shows its zone as a segment that reads out and cannot be edited", () => {
    render(() => (
      <DateField label="Call" defaultValue={zoned("2024-03-10T01:30[America/New_York]")} />
    ));

    const zone = screen.getByRole("textbox", { name: "time zone" });
    expect(zone.textContent).toBe("EST");
    expect(zone.getAttribute("aria-readonly")).toBe("true");
    expect(zone.getAttribute("contenteditable")).toBe("false");
    // A zoned value has a time, so the field asks for one without being told.
    expect(screen.getByRole("spinbutton", { name: "minute" }).textContent).toBe("30");
  });

  test("stepping the hour across the spring change lands on the hour the clock shows", () => {
    const changes: (DateValue | null)[] = [];
    render(() => (
      <DateField
        label="Call"
        defaultValue={zoned("2024-03-10T01:30[America/New_York]")}
        onChange={(value) => changes.push(value)}
      />
    ));

    user.focus(screen.getByRole("spinbutton", { name: "hour" }));
    user.keyDown("ArrowUp");
    flush();

    expect(changes.at(-1)?.toString()).toBe("2024-03-10T03:30:00-04:00[America/New_York]");
    expect(screen.getByRole("textbox", { name: "time zone" }).textContent).toBe("EDT");
  });

  test("hideTimeZone leaves the zone out", () => {
    render(() => (
      <DateField
        label="Call"
        hideTimeZone
        defaultValue={zoned("2024-03-10T01:30[America/New_York]")}
      />
    ));
    expect(screen.queryByRole("textbox", { name: "time zone" })).toBeNull();
  });

  test("puts the whole zoned value into the form", () => {
    render(() => (
      <DateField
        label="Call"
        name="call"
        defaultValue={new ZonedDateTime(2020, 2, 3, "America/Los_Angeles", -28800000, 12, 24, 45)}
      />
    ));
    const input = document.querySelector<HTMLInputElement>('input[name="call"]');
    expect(input?.value).toBe("2020-02-03T12:24:45-08:00[America/Los_Angeles]");
  });

  test("a time field steps through the hour the autumn change repeats", () => {
    const changes: (string | undefined)[] = [];
    render(() => (
      <TimeField
        label="Time"
        defaultValue={zoned("2021-11-07T01:45:00-07:00[America/Los_Angeles]")}
        onChange={(value) => changes.push(value?.toString())}
      />
    ));

    user.focus(screen.getByRole("spinbutton", { name: "hour" }));
    for (const key of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowDown"]) {
      user.keyDown(key);
      flush();
    }

    expect(changes).toEqual([
      "2021-11-07T01:45:00-08:00[America/Los_Angeles]",
      "2021-11-07T02:45:00-08:00[America/Los_Angeles]",
      "2021-11-07T01:45:00-08:00[America/Los_Angeles]",
      "2021-11-07T01:45:00-07:00[America/Los_Angeles]",
      "2021-11-07T00:45:00-07:00[America/Los_Angeles]",
    ]);
  });

  test("a time field keeps its zone when a segment is emptied and filled again", () => {
    render(() => (
      <TimeField label="Time" defaultValue={zoned("2023-07-01T01:05-07:00[America/Los_Angeles]")} />
    ));
    const minute = screen.getByRole("spinbutton", { name: "minute" });

    user.focus(minute);
    user.keyDown("Backspace");
    flush();
    expect(minute.getAttribute("aria-valuetext")).toBe("Empty");
    expect(screen.getByRole("textbox", { name: "time zone" }).textContent).toBe("PDT");

    user.keyDown("ArrowUp");
    flush();
    expect(minute.getAttribute("aria-valuetext")).toBe("00");
    expect(screen.getByRole("textbox", { name: "time zone" }).textContent).toBe("PDT");
  });

  test("an empty time field counting from a zoned placeholder steps through the repeated hour", () => {
    render(() => (
      <TimeField
        label="Time"
        placeholderValue={zoned("2021-11-07T01:45:00-07:00[America/Los_Angeles]")}
      />
    ));
    const hour = screen.getByRole("spinbutton", { name: "hour" });

    user.focus(hour);
    const seen: (string | null)[] = [];
    for (const key of ["ArrowUp", "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowDown"]) {
      user.keyDown(key);
      flush();
      seen.push(hour.textContent);
    }
    // The first press takes the placeholder's hour; 1 o'clock happens twice.
    expect(seen).toEqual(["01", "01", "02", "01", "01", "12"]);
  });
});
