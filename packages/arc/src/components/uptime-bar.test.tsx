import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, fireEvent, render, screen } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { type UptimeCell, UptimeBar, uptimeState } from "./uptime-bar.tsx";

const DAYS: UptimeCell[] = [
  { key: "d1", label: "Nov 1", value: 100 },
  { key: "d2", label: "Nov 2", value: 97.5, notes: ["Slow checkout"] },
  { key: "d3", label: "Nov 3", value: 80 },
  { key: "d4", label: "Nov 4", value: null },
  { key: "d5", label: "Nov 5", value: 99.95 },
];

function cells(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-slot="uptime-bar-cell"]')];
}

function tip(): HTMLElement | null {
  return document.querySelector('[data-slot="uptime-bar-tooltip"]');
}

describe("UptimeBar", () => {
  test("a cell per day in its state, each an image saying its day, state and share", async () => {
    render(() => (
      <UptimeBar label="API" cells={DAYS} startLabel="5 days ago" endLabel="Today" legend />
    ));
    screen.getByRole("group", { name: "API" });
    expect(cells().map((cell) => cell.getAttribute("data-state"))).toEqual([
      "up",
      "degraded",
      "down",
      "none",
      "up",
    ]);
    expect(cells().map((cell) => cell.getAttribute("aria-label"))).toEqual([
      "Nov 1, Operational, 100%",
      "Nov 2, Partial outage, 97.5%, Slow checkout",
      "Nov 3, Outage, 80%",
      "Nov 4, No data",
      "Nov 5, Operational, 99.95%",
    ]);
    expect(document.querySelector('[data-slot="uptime-bar-summary"]')?.textContent).toBe(
      "94.36% uptime",
    );
    expect(
      [...document.querySelectorAll('[data-slot="uptime-bar-legend-item"]')].map(
        (item) => item.textContent,
      ),
    ).toEqual(["Operational", "Partial outage", "Outage", "No data"]);
    expect(screen.getByText("5 days ago")).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("is one Tab stop, the newest first; the arrows, Home and End walk the cells and the tip follows", async () => {
    render(() => <UptimeBar label="API" cells={DAYS} />);
    expect(cells().map((cell) => cell.tabIndex)).toEqual([-1, -1, -1, -1, 0]);
    expect(tip()).toBeNull();
    cells()[4]?.focus();
    fireEvent.focus(cells()[4] as HTMLElement);
    await settle();
    expect(tip()?.textContent).toContain("Nov 5");
    fireEvent.keyDown(cells()[4] as HTMLElement, { key: "ArrowLeft" });
    await settle();
    expect(document.activeElement).toBe(cells()[3] as HTMLElement);
    expect(cells()[3]?.tabIndex).toBe(0);
    expect(tip()?.textContent).toBe("Nov 4No data");
    fireEvent.keyDown(cells()[3] as HTMLElement, { key: "Home" });
    await settle();
    expect(document.activeElement).toBe(cells()[0] as HTMLElement);
    expect(tip()?.style.getPropertyValue("translate")).toBe("0% 0");
    fireEvent.keyDown(cells()[0] as HTMLElement, { key: "End" });
    await settle();
    expect(document.activeElement).toBe(cells()[4] as HTMLElement);
    expect(tip()?.style.getPropertyValue("translate")).toBe("-100% 0");
    fireEvent.keyDown(cells()[4] as HTMLElement, { key: "Escape" });
    await settle();
    expect(tip()).toBeNull();
  });

  test("shows a cell's tip under the pointer or a finger, with its notes", async () => {
    render(() => <UptimeBar label="API" cells={DAYS} />);
    fireEvent.pointerEnter(cells()[1] as HTMLElement);
    await settle();
    expect(tip()?.textContent).toBe("Nov 2Partial outage, 97.5%Slow checkout");
    expect(tip()?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.pointerLeave(document.querySelector('[data-slot="uptime-bar-cells"]') as HTMLElement);
    await settle();
    expect(tip()).toBeNull();
    fireEvent.pointerDown(cells()[2] as HTMLElement);
    await settle();
    expect(tip()?.textContent).toContain("Nov 3");
  });

  test("right to left, the arrows follow the reading direction and the tip sits from the start", async () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <UptimeBar label="الواجهة" cells={DAYS} />
      </Arabic>
    ));
    cells()[2]?.focus();
    fireEvent.focus(cells()[2] as HTMLElement);
    fireEvent.keyDown(cells()[2] as HTMLElement, { key: "ArrowLeft" });
    await settle();
    expect(document.activeElement).toBe(cells()[3] as HTMLElement);
    expect(tip()?.style.getPropertyValue("translate")).toBe("50% 0");
    expect(document.querySelector('[data-slot="uptime-bar-summary"]')?.textContent).toContain("٪");
  });

  test("takes its own thresholds and words, and says no data when nothing was measured", () => {
    expect(uptimeState(99.5, { up: 99, degraded: 90 })).toBe("up");
    expect(uptimeState(undefined)).toBe("none");
    render(() => (
      <UptimeBar
        label="Runs"
        size="sm"
        cells={[
          { key: "a", label: "Run 1", state: "down" },
          { key: "b", label: "Run 2" },
        ]}
        stateLabels={{ down: "Failed", none: "Not run" }}
        labelHidden
      />
    ));
    expect(cells().map((cell) => cell.getAttribute("aria-label"))).toEqual([
      "Run 1, Failed",
      "Run 2, Not run",
    ]);
    expect(document.querySelector('[data-slot="uptime-bar-summary"]')?.textContent).toBe("Not run");
  });

  test("an empty strip draws no cells", () => {
    render(() => <UptimeBar label="Nothing" cells={[]} />);
    expect(cells()).toHaveLength(0);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { UptimeBar } from "<arc>";
      export function Page() {
        return <UptimeBar label="API" legend cells={[{ key: "a", label: "Mon", value: 100 }, { key: "b", label: "Tue", value: 90 }]} />;
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="uptime-bar-cell"]')).toHaveLength(2);
    result.unmount();
  });
});
