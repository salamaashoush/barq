import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import TooltipDemo from "./tooltip-demo.tsx";
import TooltipDisabled from "./tooltip-disabled.tsx";
import TooltipKeyboard from "./tooltip-keyboard.tsx";
import TooltipRtl from "./tooltip-rtl.tsx";
import TooltipSides from "./tooltip-sides.tsx";

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

const tip = (): HTMLElement | null => document.querySelector('[data-slot="tooltip-content"]');

describe("the tooltip examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("tooltip")).toEqual([]);
  });

  test("focus opens the tooltip at once and Escape closes it", async () => {
    render(() => <TooltipDemo />);
    user.tab();
    await settle();
    expect(document.activeElement?.textContent).toBe("Hover");
    expect(tip()?.textContent).toBe("Add to library");
    user.keyDown("Escape");
    flush();
    expect(tip()).toBeNull();
  });

  test("the shortcut sits inside the content", async () => {
    render(() => <TooltipKeyboard />);
    user.tab();
    await settle();
    expect(tip()?.querySelector('[data-slot="kbd"]')?.textContent).toBe("S");
  });

  test("a disabled button gets its tooltip through a focusable wrapper", async () => {
    render(() => <TooltipDisabled />);
    user.tab();
    await settle();
    expect(document.activeElement?.tagName).toBe("SPAN");
    expect(tip()?.textContent).toBe("This feature is currently unavailable");
  });

  test("each side puts the content on that side", async () => {
    render(() => <TooltipSides />);
    user.tab();
    await settle();
    expect(tip()?.getAttribute("data-side")).toBe("left");
  });

  test("the right-to-left tooltips are labelled in Arabic", async () => {
    render(() => <TooltipRtl />);
    expect(document.querySelectorAll('[dir="rtl"] [data-slot="button"]')).toHaveLength(4);
    user.tab();
    await settle();
    expect(tip()?.textContent).toBe("إضافة إلى المكتبة");
  });
});
