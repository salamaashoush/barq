import { describe, expect, test } from "bun:test";
import { collectCss } from "@barqjs/css";
import { render } from "@barqjs/testing";
import {
  scrollFade,
  scrollFadeB,
  scrollFadeE,
  scrollFadeNone,
  scrollFadeS,
  scrollFadeT,
  scrollFadeX,
} from "@barqjs/ui";

import { hydrateExamples } from "../test-harness.ts";
import ScrollFadeDemo from "./scroll-fade-demo.tsx";
import ScrollFadeEdge from "./scroll-fade-edge.tsx";
import ScrollFadeHorizontal from "./scroll-fade-horizontal.tsx";
import ScrollFadeNone from "./scroll-fade-none.tsx";
import ScrollFadeOverflow from "./scroll-fade-overflow.tsx";
import ScrollFadeRtl from "./scroll-fade-rtl.tsx";
import ScrollFadeSize from "./scroll-fade-size.tsx";

const faded = (name: string): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(`.${name}`),
];

/** The declarations of every class on the element, which is what the example itself wrote. */
function rules(element: HTMLElement | undefined): string {
  const sheet = collectCss();
  return [...(element?.classList ?? [])]
    .map((name) => new RegExp(`\\.${name}\\{[^}]*\\}`).exec(sheet)?.[0] ?? "")
    .join("\n");
}

describe("the scroll-fade examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("scroll-fade")).toEqual([]);
  });

  test("the fade is on the element that scrolls, not on the frame around it", () => {
    render(() => <ScrollFadeDemo />);
    const [scroller] = faded(scrollFade);
    expect(rules(scroller)).toContain("overflow-y: auto");
    expect(rules(scroller)).toContain("height: 18rem");
    expect(rules(scroller?.parentElement ?? undefined)).toContain("border: 1px solid");
    expect(scroller?.firstElementChild?.children).toHaveLength(12);
  });

  test("the short list has the class and no height to overflow", () => {
    render(() => <ScrollFadeOverflow />);
    const [scroller] = faded(scrollFade);
    expect(rules(scroller)).toContain("overflow-y: auto");
    expect(rules(scroller)).not.toContain("height:");
    expect(scroller?.firstElementChild?.children).toHaveLength(3);
  });

  test("a horizontal scroller takes the inline class", () => {
    render(() => <ScrollFadeHorizontal />);
    const [scroller] = faded(scrollFadeX);
    expect(rules(scroller)).toContain("overflow-x: auto");
    expect(scroller?.firstElementChild?.children).toHaveLength(12);
    expect(faded(scrollFade)).toHaveLength(0);
  });

  test("each edge class is on a scroller of its own axis", () => {
    render(() => <ScrollFadeEdge />);
    for (const name of [scrollFadeT, scrollFadeB]) {
      const found = faded(name);
      expect(found).toHaveLength(1);
      expect(rules(found[0])).toContain("overflow-y: auto");
    }
    for (const name of [scrollFadeS, scrollFadeE]) {
      const found = faded(name);
      expect(found).toHaveLength(1);
      expect(rules(found[0])).toContain("overflow-x: auto");
    }
  });

  test("a numeric size is a multiple of the spacing scale", () => {
    render(() => <ScrollFadeSize />);
    const [shallow, deep] = faded(scrollFade);
    expect(shallow?.style.getPropertyValue("--scroll-fade-size")).toBe("calc(var(--spacing) * 4)");
    expect(deep?.style.getPropertyValue("--scroll-fade-size")).toBe("calc(var(--spacing) * 24)");
  });

  test("the second list of the disabled example carries both classes", () => {
    render(() => <ScrollFadeNone />);
    const [on, off] = faded(scrollFade);
    expect(on?.classList.contains(scrollFadeNone)).toBe(false);
    expect(off?.classList.contains(scrollFadeNone)).toBe(true);
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <ScrollFadeRtl />);
    const scroller = document.querySelector<HTMLElement>(`[dir="rtl"] .${scrollFadeX}`);
    expect(scroller).not.toBeNull();
    expect(scroller?.firstElementChild?.children).toHaveLength(10);
  });
});
