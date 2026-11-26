import { describe, expect, test } from "bun:test";
import { createSignal } from "@barqjs/core";
import { ariaViolations, render, screen } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { SignalMeter } from "./signal-meter.tsx";

function lit(): number {
  return document.querySelectorAll('[data-slot="signal-meter-bar"][data-lit]').length;
}

describe("SignalMeter", () => {
  test("is a meter reading its level in words, the bars lit to match", async () => {
    const [level, setLevel] = createSignal<"good" | "poor" | "unknown">("good");
    render(() => <SignalMeter level={level()} />);
    const meter = screen.getByRole("meter", { name: "Connection" });
    expect(meter.getAttribute("aria-valuetext")).toBe("Good");
    expect(meter.getAttribute("aria-valuenow")).toBe("3");
    expect(lit()).toBe(3);
    expect(meter.className).not.toBe("");
    setLevel("poor");
    await settle();
    expect(meter.getAttribute("aria-valuetext")).toBe("Poor");
    expect(meter.getAttribute("data-level")).toBe("poor");
    expect(lit()).toBe(1);
    setLevel("unknown");
    await settle();
    expect(lit()).toBe(0);
    expect(meter.getAttribute("aria-valuetext")).toBe("Unknown");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("shows its level in words beside the bars, named by the caller", () => {
    render(() => <SignalMeter level="excellent" label="Network" showLabel size="md" />);
    const meter = screen.getByRole("meter", { name: "Network" });
    expect(meter.querySelector('[data-slot="signal-meter-label"]')?.textContent).toBe("Excellent");
    expect(lit()).toBe(4);
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { SignalMeter } from "<arc>";
      export function Page() {
        return <SignalMeter level="fair" showLabel />;
      }
    `);
    expect(result.container.querySelector('[data-level="fair"]')).not.toBeNull();
    result.unmount();
  });
});
