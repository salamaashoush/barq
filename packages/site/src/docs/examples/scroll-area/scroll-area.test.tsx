import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import ScrollAreaDemo from "./scroll-area-demo.tsx";
import ScrollAreaHorizontalDemo from "./scroll-area-horizontal-demo.tsx";
import ScrollAreaRtl from "./scroll-area-rtl.tsx";

const slot = (name: string): HTMLElement =>
  document.querySelector(`[data-slot="${name}"]`) as HTMLElement;

/** happy-dom measures nothing, so the horizontal geometry is declared. */
function measure(size: number, content: number): HTMLElement {
  const viewport = slot("scroll-area-viewport");
  const track = slot("scroll-area-scrollbar");
  let at = 0;
  for (const name of ["clientWidth", "offsetWidth"]) {
    Object.defineProperty(viewport, name, { get: () => size, configurable: true });
  }
  Object.defineProperty(viewport, "scrollWidth", { get: () => content, configurable: true });
  Object.defineProperty(viewport, "scrollLeft", {
    get: () => at,
    set: (next: number) => {
      at = next;
    },
    configurable: true,
  });
  Object.defineProperty(track, "clientWidth", { get: () => size, configurable: true });
  track.getBoundingClientRect = () => ({ top: 0, left: 0, width: size, height: 10 }) as DOMRect;
  viewport.dispatchEvent(new Event("scroll"));
  flush();
  return viewport;
}

describe("the scroll area examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("scroll-area")).toEqual([]);
  });

  test("the list is the native scroller, reachable with Tab", () => {
    render(() => <ScrollAreaDemo />);
    const region = screen.getByRole("region", { name: "Tags" });
    expect(region.hasAttribute("data-scrollbars")).toBe(false);
    expect(document.querySelector('[data-slot="scroll-area-scrollbar"]')).toBeNull();
    expect(region.querySelectorAll('[data-slot="separator"]')).toHaveLength(50);
    expect(region.textContent).toContain("v1.2.0-beta.50");
    expect(region.textContent).toContain("v1.2.0-beta.1");

    user.tab();
    expect(document.activeElement).toBe(region);
  });

  test("the horizontal bar reports how far the artwork has scrolled", async () => {
    render(() => <ScrollAreaHorizontalDemo />);
    await tick();
    flush();
    const region = screen.getByRole("region", { name: "Artwork" });
    expect(region.getAttribute("data-scrollbars")).toBe("custom");
    expect(screen.getAllByRole("img")).toHaveLength(3);

    const viewport = measure(384, 984);
    expect(viewport.hasAttribute("data-horizontal")).toBe(true);
    const track = screen.getByRole("scrollbar");
    expect(track.getAttribute("aria-orientation")).toBe("horizontal");
    expect(track.getAttribute("aria-controls")).toBe(viewport.id);
    expect(track.getAttribute("aria-valuenow")).toBe("0");

    viewport.scrollLeft = 300;
    viewport.dispatchEvent(new Event("scroll"));
    flush();
    expect(track.getAttribute("aria-valuenow")).toBe("50");

    viewport.scrollLeft = 600;
    viewport.dispatchEvent(new Event("scroll"));
    flush();
    expect(track.getAttribute("aria-valuenow")).toBe("100");
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <ScrollAreaRtl />);
    const region = document.querySelector('[dir="rtl"] [data-slot="scroll-area"]');
    expect(region?.getAttribute("aria-label")).toBe("العلامات");
  });
});
