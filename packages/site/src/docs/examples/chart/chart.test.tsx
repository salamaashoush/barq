import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import ChartDemo from "./chart-demo.tsx";
import ChartExampleLegend from "./chart-example-legend.tsx";
import ChartRtl from "./chart-rtl.tsx";
import ChartTooltipDemo from "./chart-tooltip.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("the chart examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("chart")).toEqual([]);
  });

  test("the container declares a colour per series", () => {
    render(() => <ChartExampleLegend />);
    const container = document.querySelector<HTMLElement>('[data-slot="chart"]');
    expect(container).not.toBeNull();
    expect(document.body.innerHTML).toContain("--color-desktop");
    expect(document.body.innerHTML).toContain("--color-mobile");
    expect(screen.getByText("Desktop")).toBeTruthy();
    expect(screen.getByText("Mobile")).toBeTruthy();
  });

  test("the interactive chart switches series from its header", async () => {
    render(() => <ChartDemo />);
    const desktop = screen.getByRole("button", { name: /Desktop/ });
    const mobile = screen.getByRole("button", { name: /Mobile/ });
    expect(desktop.textContent).toBe(`Desktop${(7324).toLocaleString()}`);
    expect(mobile.textContent).toBe(`Mobile${(7250).toLocaleString()}`);
    expect(desktop.getAttribute("data-active")).toBe("true");
    await user.click(mobile);
    await settle();
    expect(mobile.getAttribute("data-active")).toBe("true");
    expect(desktop.getAttribute("data-active")).toBe("false");
  });

  test("the tooltip anatomy shows each indicator", () => {
    render(() => <ChartTooltipDemo />);
    expect(
      [...document.querySelectorAll('[data-slot="chart-tooltip-label"]')].map(
        (label) => label.textContent,
      ),
    ).toEqual(["Page Views", "Page Views"]);
    expect(screen.getAllByText("Chrome")).toHaveLength(2);
    expect(screen.getByText((12486).toLocaleString())).toBeTruthy();
  });

  test("the right-to-left chart names its direction and labels its series in Arabic", () => {
    render(() => <ChartRtl />);
    expect(document.querySelector('[dir="rtl"] [data-slot="chart"]')).not.toBeNull();
    expect(screen.getByText("سطح المكتب")).toBeTruthy();
  });
});
