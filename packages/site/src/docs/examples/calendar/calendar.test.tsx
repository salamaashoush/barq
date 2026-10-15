import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import CalendarBasic from "./calendar-basic.tsx";

const caption = (): string | null | undefined =>
  document.querySelector('[data-slot="calendar-caption-label"]')?.textContent;

describe("the calendar examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("calendar")).toEqual([]);
  });

  test("the month is the fixed today's, and the arrows move it", async () => {
    render(() => <CalendarBasic />);
    expect(caption()).toBe("June 2026");

    await user.click(document.querySelector('[data-slot="calendar-nav-next"]') as HTMLElement);
    flush();
    expect(caption()).toBe("July 2026");

    await user.click(document.querySelector('[data-slot="calendar-nav-previous"]') as HTMLElement);
    flush();
    expect(caption()).toBe("June 2026");
  });

  test("a press on a day selects it and only it", async () => {
    render(() => <CalendarBasic />);
    const days = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-slot="calendar-day-button"]:not([disabled]):not([data-outside])',
      ),
    ];
    const tenth = days.find((day) => day.textContent === "10") as HTMLElement;
    expect(
      document.querySelectorAll('[data-slot="calendar-day-button"][data-selected-single]'),
    ).toHaveLength(0);

    await user.click(tenth);
    flush();
    const selected = [
      ...document.querySelectorAll('[data-slot="calendar-day-button"][data-selected-single]'),
    ];
    expect(selected.map((day) => day.textContent)).toEqual(["10"]);
  });
});
