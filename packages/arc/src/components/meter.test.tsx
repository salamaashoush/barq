import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen } from "@barqjs/testing";

import { hydrates, settle, wears } from "../test-arc.ts";
import { Meter, UsageList, meterStyles, usageState } from "./meter.tsx";

function fillOf(meter: Element): string | undefined {
  return meter
    .querySelector<HTMLElement>('[data-slot="meter-fill"]')
    ?.style.getPropertyValue("inline-size");
}

describe("Meter", () => {
  test("is a meter named by its label, reading its amount of the limit in words", async () => {
    render(() => <Meter label="Browser minutes" value={412} maxValue={500} />);
    const meter = screen.getByRole("meter", { name: "Browser minutes" });
    expect(meter.getAttribute("aria-valuenow")).toBe("412");
    expect(meter.getAttribute("aria-valuemax")).toBe("500");
    expect(meter.getAttribute("aria-valuetext")).toBe("412 of 500");
    expect(screen.getByText("412 of 500").getAttribute("aria-hidden")).toBe("true");
    expect(fillOf(document.querySelector('[data-slot="meter"]') as Element)).toBe("82.4%");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("changes tone at each threshold, and the reading takes the tone past a warning", async () => {
    const [value, setValue] = createSignal(10);
    render(() => (
      <Meter
        label="Seats"
        value={value()}
        maxValue={40}
        thresholds={[
          { value: 32, tone: "warning" },
          { value: 40, tone: "danger" },
        ]}
      />
    ));
    const root = document.querySelector('[data-slot="meter"]') as HTMLElement;
    expect(root.getAttribute("data-tone")).toBe("info");
    const reading = root.querySelector('[data-slot="meter-reading"]');
    expect(wears(reading, meterStyles({ toned: true }).reading)).toBe(false);
    setValue(35);
    await settle();
    expect(root.getAttribute("data-tone")).toBe("warning");
    expect(wears(reading, meterStyles({ toned: true }).reading)).toBe(true);
    setValue(52);
    await settle();
    expect(root.getAttribute("data-tone")).toBe("danger");
    expect(fillOf(root)).toBe("100%");
    expect(screen.getByRole("meter").getAttribute("aria-valuetext")).toBe("52 of 40");
  });

  test("writes its numbers in the locale, takes its own words, and hides its label on request", () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <Meter label="المقاعد" value={12} maxValue={40} />
        <Meter label="Storage" value={3} maxValue={10} valueLabel="3 GB of 10 GB" labelHidden />
      </Arabic>
    ));
    const [arabic, storage] = screen.getAllByRole("meter");
    expect(arabic?.getAttribute("aria-valuetext")).toBe("١٢ of ٤٠");
    expect(storage?.getAttribute("aria-valuetext")).toBe("3 GB of 10 GB");
    expect(screen.getByRole("meter", { name: "Storage" })).toBe(storage as HTMLElement);
    const header = document.querySelectorAll('[data-slot="meter-header"]')[1];
    expect(header?.getAttribute("class")).not.toContain(meterStyles().header.split(" ")[0] ?? "x");
  });

  test("takes a class per part and a slot on every part", () => {
    render(() => (
      <Meter
        label="Load"
        value={5}
        class="mine"
        classes={{ root: "r", header: "h", label: "l", reading: "v", track: "t", fill: "f" }}
      />
    ));
    for (const [slot, name] of [
      ["meter", "r"],
      ["meter-header", "h"],
      ["meter-label", "l"],
      ["meter-reading", "v"],
      ["meter-track", "t"],
      ["meter-fill", "f"],
    ]) {
      expect(document.querySelector(`[data-slot="${slot}"]`)?.classList.contains(name ?? "")).toBe(
        true,
      );
    }
    expect(document.querySelector('[data-slot="meter"]')?.classList.contains("mine")).toBe(true);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { Meter, UsageList } from "<arc>";
      export function Page() {
        return (
          <>
            <Meter label="Seats" value={30} maxValue={40} thresholds={[{ value: 30, tone: "warning" }]} />
            <UsageList items={[
              { key: "a", label: "Minutes", used: 450, limit: 500 },
              { key: "b", label: "Checks", used: 12, limit: null },
            ]} />
          </>
        );
      }
    `);
    expect(result.container.querySelector('[data-tone="warning"]')).not.toBeNull();
    expect(result.container.querySelector('[data-state="near"]')).not.toBeNull();
    result.unmount();
  });
});

describe("UsageList", () => {
  test("a meter per limited item, its state in words, and no bar without a limit", async () => {
    render(() => (
      <UsageList
        aria-label="This month"
        items={[
          { key: "minutes", label: "Browser minutes", used: 412, limit: 500 },
          { key: "seats", label: "Seats", used: 10, limit: 10, description: "Resets on the 1st" },
          { key: "runs", label: "Runs", used: 1300, limit: 1000 },
          { key: "checks", label: "Checks", used: 38, limit: null },
        ]}
      />
    ));
    const list = screen.getByRole("list", { name: "This month" });
    const items = [...list.querySelectorAll('[data-slot="usage-item"]')];
    expect(items.map((item) => item.getAttribute("data-state"))).toEqual([
      "near",
      "at",
      "over",
      "under",
    ]);
    expect(screen.getAllByRole("meter")).toHaveLength(3);
    expect(screen.getByText("Near the limit")).toBeDefined();
    expect(screen.getByText("At the limit")).toBeDefined();
    expect(screen.getByText("Over the limit")).toBeDefined();
    expect(screen.getByText("38, no limit")).toBeDefined();
    expect(screen.getByText("Resets on the 1st")).toBeDefined();
    expect(items[2]?.querySelector('[data-slot="meter"]')?.getAttribute("data-tone")).toBe(
      "danger",
    );
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("warns from the share it is told, and an empty list draws no rows", () => {
    expect(usageState(50, 100, 0.5)).toBe("near");
    expect(usageState(49, 100, 0.5)).toBe("under");
    expect(usageState(5, null)).toBe("under");
    render(() => <UsageList items={[]} />);
    expect(document.querySelectorAll('[data-slot="usage-item"]')).toHaveLength(0);
  });

  test("writes each item in its own units", () => {
    render(() => (
      <UsageList
        items={[
          {
            key: "spend",
            label: "Spend",
            used: 1.5,
            limit: 2,
            formatOptions: { style: "currency", currency: "USD" },
          },
        ]}
      />
    ));
    expect(screen.getByRole("meter").getAttribute("aria-valuetext")).toBe("$1.50 of $2.00");
  });
});
