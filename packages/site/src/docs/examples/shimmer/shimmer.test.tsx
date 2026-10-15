import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";
import { shimmer, shimmerNone, shimmerOnce } from "@barqjs/ui";

import { hydrateExamples } from "../test-harness.ts";
import ShimmerAngle from "./shimmer-angle.tsx";
import ShimmerColor from "./shimmer-color.tsx";
import ShimmerDuration from "./shimmer-duration.tsx";
import ShimmerMarker from "./shimmer-marker.tsx";
import ShimmerNone from "./shimmer-none.tsx";
import ShimmerOnce from "./shimmer-once.tsx";
import ShimmerRtl from "./shimmer-rtl.tsx";
import ShimmerSpread from "./shimmer-spread.tsx";

const shimmering = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(`.${shimmer}`)];

describe("the shimmer examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("shimmer")).toEqual([]);
  });

  test("a marker's content takes the class", () => {
    render(() => <ShimmerMarker />);
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(2);
    for (const status of statuses) {
      const content = status.querySelector('[data-slot="marker-content"]');
      expect(content?.classList.contains(shimmer)).toBe(true);
    }
  });

  test("the color is set as given, and mixed toward transparent with an opacity", () => {
    render(() => <ShimmerColor />);
    const [mixed, plain] = shimmering();
    expect(mixed?.style.getPropertyValue("--shimmer-color")).toBe(
      "color-mix(in oklch, oklch(62.3% 0.214 259.815) 60%, transparent)",
    );
    expect(plain?.style.getPropertyValue("--shimmer-color")).toBe("#378ADD");
  });

  test("the duration is in milliseconds, and absent on the default", () => {
    render(() => <ShimmerDuration />);
    const [standard, fast] = shimmering();
    expect(standard?.style.getPropertyValue("--shimmer-duration")).toBe("");
    expect(fast?.style.getPropertyValue("--shimmer-duration")).toBe("1000ms");
  });

  test("a numeric spread is a multiple of the spacing scale", () => {
    render(() => <ShimmerSpread />);
    const [narrow, wide] = shimmering();
    expect(narrow?.style.getPropertyValue("--shimmer-spread")).toBe("calc(var(--spacing) * 4)");
    expect(wide?.style.getPropertyValue("--shimmer-spread")).toBe("calc(var(--spacing) * 24)");
  });

  test("the angle is in degrees", () => {
    render(() => <ShimmerAngle />);
    const [, tilted] = shimmering();
    expect(tilted?.style.getPropertyValue("--shimmer-angle")).toBe("45deg");
  });

  test("replay builds the paragraph again, which restarts its single sweep", async () => {
    render(() => <ShimmerOnce />);
    const [first] = shimmering();
    expect(first?.classList.contains(shimmerOnce)).toBe(true);
    expect(first?.style.getPropertyValue("--shimmer-duration")).toBe("1100ms");

    await user.click(screen.getByRole("button", { name: "Replay" }));
    flush();
    const again = shimmering();
    expect(again).toHaveLength(1);
    expect(again[0]).not.toBe(first);
    expect(again[0]?.classList.contains(shimmerOnce)).toBe(true);
  });

  test("the disabled example carries both classes", () => {
    render(() => <ShimmerNone />);
    const [text] = shimmering();
    expect(text?.classList.contains(shimmerNone)).toBe(true);
  });

  test("the right-to-left example names each direction on an element", () => {
    render(() => <ShimmerRtl />);
    expect(document.querySelector(`[dir="ltr"].${shimmer}`)).not.toBeNull();
    expect(document.querySelector(`[dir="rtl"] .${shimmer}`)?.textContent).toBe("جارٍ إنشاء الرد…");
  });
});
