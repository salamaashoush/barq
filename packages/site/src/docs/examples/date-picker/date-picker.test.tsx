import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import DataPickerWithDropdowns from "./data-picker-with-dropdowns.tsx";
import DatePickerDemo from "./date-picker-demo.tsx";
import DatePickerDob from "./date-picker-dob.tsx";
import DatePickerInput from "./date-picker-input.tsx";
import DatePickerRange from "./date-picker-range.tsx";
import DatePickerRtl from "./date-picker-rtl.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const day = (name: number): HTMLElement =>
  screen
    .getAllByRole("button")
    .find(
      (button) => button.closest('[role="grid"]') !== null && button.textContent === String(name),
    ) as HTMLElement;

describe("the date picker examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("date-picker")).toEqual([]);
  });

  test("picking a day writes it on the trigger", async () => {
    render(() => <DatePickerDemo />);
    const trigger = screen.getByRole("button", { name: /Pick a date/ });
    expect(trigger.getAttribute("data-empty")).toBe("true");
    await user.click(trigger);
    await settle();
    expect(screen.getByRole("grid")).toBeTruthy();
    await user.click(day(15));
    await settle();
    expect(trigger.getAttribute("data-empty")).toBe("false");
    expect(trigger.textContent).toContain("15");
  });

  test("the date of birth picker closes once a day is chosen", async () => {
    render(() => <DatePickerDob />);
    const trigger = screen.getByRole("button", { name: "Date of birth" });
    expect(trigger.textContent).toBe("Select date");
    await user.click(trigger);
    await settle();
    expect(document.querySelectorAll('[data-slot="calendar"] select').length).toBeGreaterThan(0);
    await user.click(day(3));
    await settle();
    expect(screen.queryByRole("grid")).toBeNull();
    expect(trigger.textContent).not.toBe("Select date");
  });

  test("the range picker starts with twenty days and shows two months", async () => {
    render(() => <DatePickerRange />);
    const trigger = screen.getByLabelText("Date Picker Range");
    const year = new Date().getFullYear();
    expect(trigger.textContent).toBe(`Jan 20, ${year} - Feb 09, ${year}`);
    await user.click(trigger);
    await settle();
    expect(screen.getAllByRole("grid")).toHaveLength(2);
  });

  test("a typed date moves the field's value, and ArrowDown opens the calendar", async () => {
    render(() => <DatePickerInput />);
    const input = screen.getByLabelText<HTMLInputElement>("Subscription Date");
    expect(input.value).toBe("June 01, 2025");
    input.focus();
    await user.keyboard("{ArrowDown}");
    await settle();
    expect(screen.getByRole("grid")).toBeTruthy();
    await user.click(day(9));
    await settle();
    expect(input.value).toBe("June 09, 2025");
  });

  test("the footer button closes the dropdown picker", async () => {
    render(() => <DataPickerWithDropdowns />);
    await user.click(screen.getByRole("button", { name: "Date" }));
    await settle();
    await user.click(screen.getByRole("button", { name: "Done" }));
    await settle();
    expect(screen.queryByRole("grid")).toBeNull();
  });

  test("the right-to-left picker names its direction", () => {
    render(() => <DatePickerRtl />);
    expect(document.querySelector('[dir="rtl"] [data-slot="button"]')?.textContent).toContain(
      "اختر تاريخًا",
    );
  });
});
