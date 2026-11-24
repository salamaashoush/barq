import { describe, expect, test } from "bun:test";
import { type Child, flush } from "@barqjs/core";
import type { DateRange } from "@barqjs/aria/calendar";
import { CalendarDate, getLocalTimeZone, today } from "@barqjs/aria/date";
import { provideLocale } from "@barqjs/aria/i18n";
import { accessibleName, ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { DateRangeField } from "./date-range-field.tsx";
import { useArcForm } from "./form.tsx";

const MARCH = { start: new CalendarDate(2030, 3, 1), end: new CalendarDate(2030, 3, 7) };

function trigger(): HTMLElement {
  return document.querySelector('[data-slot="date-range-picker-trigger"]') as HTMLElement;
}

async function opened(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
}

describe("DateRangeField", () => {
  test("its trigger is named by the label and the range, and described by its line", async () => {
    render(() => (
      <DateRangeField label="Period" description="Both days count." defaultValue={MARCH} />
    ));
    await settle();
    expect(accessibleName(trigger())).toBe("Period Mar 01, 2030 - Mar 07, 2030");
    const described = trigger().getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(described)?.textContent).toBe("Both days count.");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("the common presets are today and the last 7, 30 and 90 days", async () => {
    const chosen: (DateRange | null)[] = [];
    render(() => (
      <DateRangeField label="Period" presets="common" onChange={(range) => chosen.push(range)} />
    ));
    await settle();
    await user.click(trigger());
    await opened();
    await user.click(document.querySelector('[data-slot="date-range-picker-presets"]') as HTMLElement);
    await opened();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Today",
      "Last 7 days",
      "Last 30 days",
      "Last 90 days",
    ]);
    await user.click(screen.getByRole("option", { name: "Last 30 days" }));
    await opened();
    const end = today(getLocalTimeZone());
    expect(String(chosen.at(-1)?.start)).toBe(String(end.subtract({ days: 29 })));
  });

  test("from the keyboard: Enter opens the calendar, two days pick the range", async () => {
    const chosen: (DateRange | null)[] = [];
    render(() => (
      <DateRangeField label="Period" defaultValue={MARCH} onChange={(range) => chosen.push(range)} />
    ));
    await settle();
    trigger().focus();
    await user.keyboard("{Enter}");
    await opened();
    await settle();
    expect(document.activeElement?.closest('[role="grid"]')).not.toBeNull();
    await user.keyboard("{Enter}{ArrowRight}{ArrowRight}{Enter}");
    await settle();
    expect(String(chosen.at(-1)?.start)).toBe("2030-03-01");
    expect(String(chosen.at(-1)?.end)).toBe("2030-03-03");
  });

  test("a tap opens the calendar", async () => {
    render(() => <DateRangeField label="Period" />);
    await settle();
    user.tap(trigger());
    await opened();
    expect(screen.getAllByRole("grid")).toHaveLength(2);
  });

  test("in Arabic the trigger reads the locale's dates", async () => {
    function Rtl(props: { children?: Child }) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <DateRangeField label="الفترة" defaultValue={MARCH} />
      </Rtl>
    ));
    await settle();
    expect(trigger().textContent).toContain("٢٠٣٠");
  });

  test("holds the form's value inside form.AppField", async () => {
    let read: () => unknown = () => undefined;
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { period: MARCH } }));
      read = () => form.state.values.period;
      return (
        <form.AppForm>
          <form.AppField name="period">
            {(f) => <f.DateRangeField label="Period" presets="common" />}
          </form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    expect(trigger().textContent).toContain("Mar 07, 2030");
    await user.click(trigger());
    await opened();
    await user.click(document.querySelector('[data-slot="date-range-picker-presets"]') as HTMLElement);
    await opened();
    await user.click(screen.getByRole("option", { name: "Today" }));
    await settle();
    const end = today(getLocalTimeZone());
    expect(String((read() as DateRange).start)).toBe(String(end));
  });

  test("shows the caller's error on the trigger and posts an ISO interval by name", async () => {
    render(() => (
      <form>
        <DateRangeField label="Span" name="span" defaultValue={MARCH} errorMessage="Too long." />
      </form>
    ));
    await settle();
    const form = document.querySelector("form") as HTMLFormElement;
    expect(new FormData(form).get("span")).toBe("2030-03-01/2030-03-07");
    expect(screen.getByText("Too long.")).toBeDefined();
    expect(trigger().getAttribute("aria-invalid")).toBe("true");
    expect(trigger().getAttribute("aria-describedby")).toContain(
      screen.getByText("Too long.").closest("[id]")?.id ?? "-",
    );
  });

  test("takes a class per part and a slot on every part", async () => {
    render(() => (
      <DateRangeField
        label="Period"
        class="mine"
        classes={{ control: "c", label: "l", description: "d" }}
        description="Both days."
      />
    ));
    await settle();
    const by = (slot: string): Element | null => document.querySelector(`[data-slot="${slot}"]`);
    expect(by("date-range-field")?.classList.contains("mine")).toBe(true);
    expect(by("date-range-field-control")?.classList.contains("c")).toBe(true);
    expect(by("field-label")?.classList.contains("l")).toBe(true);
    expect(by("field-description")?.classList.contains("d")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { CalendarDate } from "@barqjs/aria/date";
      import { DateRangeField } from "<arc>";
      export function Page() {
        return (
          <DateRangeField
            label="Period"
            presets="common"
            defaultValue={{ start: new CalendarDate(2030, 3, 1), end: new CalendarDate(2030, 3, 7) }}
          />
        );
      }
    `);
    expect(result.container.textContent).toContain("Mar 07, 2030");
    result.unmount();
  });
});
