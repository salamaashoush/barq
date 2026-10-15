import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import SliderControlled from "./slider-controlled.tsx";
import SliderDemo from "./slider-demo.tsx";
import SliderDisabled from "./slider-disabled.tsx";
import SliderMultiple from "./slider-multiple.tsx";
import SliderRange from "./slider-range.tsx";
import SliderRtl from "./slider-rtl.tsx";
import SliderVertical from "./slider-vertical.tsx";

const thumbs = (): HTMLInputElement[] => screen.getAllByRole("slider") as HTMLInputElement[];
const values = (): string[] => thumbs().map((thumb) => thumb.value);
const track = (): HTMLElement =>
  document.querySelector('[data-slot="slider-track"]') as HTMLElement;

describe("the slider examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("slider")).toEqual([]);
  });

  test("the arrows move the thumb one step and End takes it to the maximum", () => {
    render(() => <SliderDemo />);
    expect(values()).toEqual(["75"]);
    user.focus(thumbs()[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();
    expect(values()).toEqual(["76"]);
    user.keyDown("End");
    flush();
    expect(values()).toEqual(["100"]);
    expect(track().style.getPropertyValue("--barq-slider-end")).toBe("100%");
  });

  test("a range moves in its own step and the fill follows both thumbs", () => {
    render(() => <SliderRange />);
    expect(values()).toEqual(["25", "50"]);
    user.focus(thumbs()[1] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();
    expect(values()).toEqual(["25", "55"]);
    expect(track().style.getPropertyValue("--barq-slider-start")).toBe("25%");
    expect(track().style.getPropertyValue("--barq-slider-end")).toBe("55%");
  });

  test("three values draw three thumbs", () => {
    render(() => <SliderMultiple />);
    expect(values()).toEqual(["10", "20", "70"]);
  });

  test("the vertical sliders say which way they run", () => {
    render(() => <SliderVertical />);
    expect(thumbs().map((thumb) => thumb.getAttribute("aria-orientation"))).toEqual([
      "vertical",
      "vertical",
    ]);
    user.focus(thumbs()[0] as HTMLElement);
    user.keyDown("ArrowUp");
    flush();
    expect(values()).toEqual(["51", "25"]);
  });

  test("the controlled slider writes what it reports and is named by its label", () => {
    render(() => <SliderControlled />);
    expect(screen.getByText("0.3, 0.7")).not.toBeNull();
    expect(screen.getByRole("group").getAttribute("aria-labelledby")).toBe(
      "slider-controlled-temperature-label",
    );
    user.focus(thumbs()[0] as HTMLElement);
    user.keyDown("ArrowRight");
    flush();
    expect(values()).toEqual(["0.4", "0.7"]);
    expect(screen.getByText("0.4, 0.7")).not.toBeNull();
  });

  test("the disabled slider does not move", () => {
    render(() => <SliderDisabled />);
    expect(thumbs()[0]?.disabled).toBe(true);
    expect(document.querySelector('[data-slot="slider"]')?.hasAttribute("data-disabled")).toBe(
      true,
    );
  });

  test("right to left, the minimum is at the right and ArrowLeft raises the value", () => {
    render(() => <SliderRtl />);
    expect(document.querySelector('[dir="rtl"] [data-slot="slider"]')).not.toBeNull();
    expect(track().style.getPropertyValue("--barq-slider-start")).toBe("25%");
    expect(track().style.getPropertyValue("--barq-slider-end")).toBe("100%");
    user.focus(thumbs()[0] as HTMLElement);
    user.keyDown("ArrowLeft");
    flush();
    expect(values()).toEqual(["76"]);
  });
});
