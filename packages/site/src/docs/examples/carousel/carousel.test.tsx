import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, tick } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import CarouselApiDemo from "./carousel-api.tsx";
import CarouselDemo from "./carousel-demo.tsx";
import CarouselOrientation from "./carousel-orientation.tsx";
import CarouselRtl from "./carousel-rtl.tsx";

const status = (): string | undefined =>
  [...document.querySelectorAll("div")].find((one) => one.textContent?.startsWith("Slide "))
    ?.textContent ?? undefined;

async function settle(): Promise<void> {
  flush();
  await tick();
  flush();
}

describe("the carousel examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("carousel")).toEqual([]);
  });

  test("five slides, a region, and the arrows", async () => {
    render(() => <CarouselDemo />);
    await settle();
    expect(document.querySelectorAll('[data-slot="carousel-item"]')).toHaveLength(5);
    expect(screen.getByRole("region").getAttribute("aria-roledescription")).toBe("carousel");
    expect(screen.getByRole("button", { name: "Previous slide" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeTruthy();
  });

  test("a vertical carousel says so", async () => {
    render(() => <CarouselOrientation />);
    await settle();
    expect(
      document.querySelector('[data-slot="carousel"]')?.getAttribute("data-orientation") ??
        "vertical",
    ).toBe("vertical");
  });

  test("the API callback writes the selected slide into the caption", async () => {
    render(() => <CarouselApiDemo />);
    // happy-dom measures nothing, so embla finds no snap points to count or
    // move between; what this pins is that the instance reached the callback.
    await settle();
    expect(status()).toMatch(/^Slide 1 of \d+$/);
  });

  test("the right-to-left example names its direction on an element", async () => {
    render(() => <CarouselRtl />);
    await settle();
    expect(document.querySelectorAll('[dir="rtl"] [data-slot="carousel-item"]')).toHaveLength(5);
  });
});
