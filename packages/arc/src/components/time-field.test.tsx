import { describe, expect, test } from "bun:test";
import { type Child, createSignal } from "@barqjs/core";
import { Time } from "@barqjs/aria/date";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { segmented } from "../lib/field.tsx";
import { target } from "../style/index.ts";
import { hydrates, settle, wears } from "../test-arc.ts";
import { useArcForm } from "./form.tsx";
import { TimeField, TimePicker, timesBetween } from "./time-field.tsx";

function Rtl(props: { children?: Child }) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

describe("TimeField", () => {
  test("is a group of segments named by its label, held as a Time", async () => {
    const changes: (Time | null)[] = [];
    render(() => (
      <TimeField
        label="Opens"
        description="Local time."
        defaultValue={new Time(9, 30)}
        onChange={(value) => changes.push(value)}
      />
    ));
    await settle();
    const minute = screen.getByRole("spinbutton", { name: "minute, Opens" });
    expect(minute.getAttribute("aria-valuenow")).toBe("30");
    minute.focus();
    await user.keyboard("{ArrowUp}");
    await settle();
    expect(changes.at(-1)?.toString()).toBe("09:31:00");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("shows the caller's error and is a finger's height", async () => {
    render(() => <TimeField label="Opens" value={null} errorMessage="Pick a time." />);
    await settle();
    expect(screen.getByText("Pick a time.")).toBeDefined();
    const box = document.querySelector('[data-slot="time-field-control"]');
    expect(box?.getAttribute("data-invalid")).not.toBeNull();
    expect(wears(box, segmented)).toBe(true);
    expect(wears(box, target.size)).toBe(true);
  });

  test("holds the form's value inside form.AppField", async () => {
    let read: () => unknown = () => undefined;
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { opens: new Time(8) } }));
      read = () => form.state.values.opens;
      return (
        <form.AppForm>
          <form.AppField name="opens">{(f) => <f.TimeField label="Opens" />}</form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    const hour = screen.getByRole("spinbutton", { name: "hour, Opens" });
    hour.focus();
    await user.keyboard("{ArrowUp}");
    await settle();
    expect((read() as Time).hour).toBe(9);
  });
});

describe("TimePicker", () => {
  test("lists the times every step between the bounds, in the locale's clock", async () => {
    expect(timesBetween(60, new Time(8), new Time(11)).map(String)).toEqual([
      "08:00:00",
      "09:00:00",
      "10:00:00",
      "11:00:00",
    ]);
    render(() => (
      <TimePicker label="Starts" step={30} minValue={new Time(9)} maxValue={new Time(10)} />
    ));
    await settle();
    await user.click(screen.getByRole("combobox", { name: "Choose a time" }));
    await settle();
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["9:00 AM", "9:30 AM", "10:00 AM"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("picking a time from the list fills the segments and reports it", async () => {
    const [time, setTime] = createSignal<Time | null>(null);
    render(() => (
      <TimePicker label="Starts" step={60} hourCycle={24} value={time()} onChange={setTime} />
    ));
    await settle();
    await user.click(screen.getByRole("combobox", { name: "Choose a time" }));
    await settle();
    await user.click(screen.getByRole("option", { name: "14:00" }));
    await settle();
    expect(time()?.toString()).toBe("14:00:00");
    expect(
      screen.getByRole("spinbutton", { name: "hour, Starts" }).getAttribute("aria-valuenow"),
    ).toBe("14");
  });

  test("from the keyboard: the list opens on Enter and the arrows move through it", async () => {
    const [time, setTime] = createSignal<Time | null>(new Time(10));
    render(() => (
      <TimePicker label="Starts" step={60} hourCycle={24} value={time()} onChange={setTime} />
    ));
    await settle();
    const trigger = screen.getByRole("combobox", { name: "Choose a time" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(document.activeElement?.textContent).toBe("10:00");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    await settle();
    expect(time()?.toString()).toBe("11:00:00");
  });

  test("a tap opens the list, and the trigger has room for a finger", async () => {
    render(() => <TimePicker label="Starts" />);
    await settle();
    const trigger = screen.getByRole("combobox", { name: "Choose a time" });
    expect(wears(trigger, target.size)).toBe(true);
    user.tap(trigger);
    await settle();
    expect(screen.getAllByRole("option").length).toBe(48);
  });

  test("in Arabic the times are written in the locale's digits", async () => {
    render(() => (
      <Rtl>
        <TimePicker label="يبدأ" step={60} minValue={new Time(9)} maxValue={new Time(9)} />
      </Rtl>
    ));
    await settle();
    await user.click(screen.getByRole("combobox", { name: "Choose a time" }));
    await settle();
    expect(screen.getByRole("option").textContent).toContain("٩");
  });

  test("takes a class per part and a slot on every part", async () => {
    render(() => (
      <TimePicker
        label="Starts"
        class="mine"
        classes={{ control: "c", segments: "s", trigger: "t", label: "l" }}
      />
    ));
    await settle();
    const by = (slot: string): Element | null => document.querySelector(`[data-slot="${slot}"]`);
    expect(by("time-picker")?.classList.contains("mine")).toBe(true);
    expect(by("time-picker-control")?.classList.contains("c")).toBe(true);
    expect(by("time-picker-segments")?.classList.contains("s")).toBe(true);
    expect(by("time-picker-trigger")?.classList.contains("t")).toBe(true);
    expect(by("field-label")?.classList.contains("l")).toBe(true);
  });

  test("hydrates what the server wrote, TimeField and TimePicker", async () => {
    const result = await hydrates(`
      import { Time } from "@barqjs/aria/date";
      import { TimeField, TimePicker } from "<arc>";
      export function Page() {
        return (
          <div>
            <TimeField label="Opens" defaultValue={new Time(9, 30)} />
            <TimePicker label="Closes" defaultValue={new Time(17)} />
          </div>
        );
      }
    `);
    expect(result.container.querySelectorAll('[role="spinbutton"]').length).toBeGreaterThan(3);
    result.unmount();
  });
});
