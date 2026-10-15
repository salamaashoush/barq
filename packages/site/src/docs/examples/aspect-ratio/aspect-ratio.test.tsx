import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import AspectRatioDemo from "./aspect-ratio-demo.tsx";
import AspectRatioPortrait from "./aspect-ratio-portrait.tsx";
import AspectRatioRtl from "./aspect-ratio-rtl.tsx";
import AspectRatioSquare from "./aspect-ratio-square.tsx";

const ratio = (): number => {
  const box = document.querySelector<HTMLElement>('[data-slot="aspect-ratio"]');
  return Number(box?.style.getPropertyValue("--barq-aspect-ratio"));
};

describe("the aspect ratio examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("aspect-ratio")).toEqual([]);
  });

  test("the first example is sixteen by nine around a named picture", () => {
    render(() => <AspectRatioDemo />);
    expect(ratio()).toBeCloseTo(16 / 9, 10);
    expect(screen.getByRole("img", { name: "Photo" }).parentElement?.dataset.slot).toBe(
      "aspect-ratio",
    );
  });

  test("the square example has a ratio of one", () => {
    render(() => <AspectRatioSquare />);
    expect(ratio()).toBe(1);
  });

  test("the portrait example is taller than it is wide", () => {
    render(() => <AspectRatioPortrait />);
    expect(ratio()).toBeCloseTo(9 / 16, 10);
  });

  test("the right-to-left example names its direction on the figure", () => {
    render(() => <AspectRatioRtl />);
    const figure = document.querySelector('figure[dir="rtl"]');
    expect(figure?.querySelector('[data-slot="aspect-ratio"]')).not.toBeNull();
    expect(figure?.querySelector("figcaption")?.textContent).toBe("منظر طبيعي جميل");
  });
});
