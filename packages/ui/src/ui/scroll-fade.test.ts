import { describe, expect, test } from "bun:test";
import { collectCss } from "@barqjs/css";

import { rulesFor } from "../test-rules.ts";

import {
  scrollFade,
  scrollFadeB,
  scrollFadeE,
  scrollFadeL,
  scrollFadeNone,
  scrollFadeR,
  scrollFadeS,
  scrollFadeStyle,
  scrollFadeT,
  scrollFadeX,
  scrollFadeY,
} from "./scroll-fade.ts";

const flat = (text: string): string => text.replaceAll(/\s+/g, "");

describe("scrollFade", () => {
  test("the fade is a mask, so it works over any background", () => {
    const rules = flat(rulesFor(scrollFade));
    expect(rules).toContain("mask-image:var(--scroll-fade-mask,var(--scroll-fade-block))");
    expect(rules).toContain("mask-composite:intersect");
    expect(rules).toContain("mask-repeat:no-repeat");
  });

  test("the edges are driven by the element's own scroll position", () => {
    const rules = flat(rulesFor(scrollFade));
    expect(rules).toContain("@supports(animation-timeline:scroll())");
    expect(rules).toContain("animation-timeline:scroll(selfy),scroll(selfy)");
    expect(rules).toContain("animation-fill-mode:both");
  });

  test("a browser without scroll timelines shows both edges faded, always", () => {
    const rules = flat(rulesFor(scrollFade));
    expect(rules).toContain("@supportsnot(animation-timeline:scroll())");
    expect(rules).toContain("--scroll-fade-t:var(--_scroll-fade-size-t)");
    expect(rules).toContain("--scroll-fade-b:var(--_scroll-fade-size-b)");
  });

  test("the default is the block axis", () => {
    expect(scrollFadeY).toBe(scrollFade);
  });

  test("the inline axis follows the scroller's inline direction", () => {
    const rules = flat(rulesFor(scrollFadeX));
    expect(rules).toContain("animation-timeline:scroll(selfinline),scroll(selfinline)");
    expect(rules).toContain("mask-image:var(--scroll-fade-mask,var(--scroll-fade-inline))");
  });

  test("right to left, the inline gradient runs the other way", () => {
    const rules = flat(rulesFor(scrollFadeX));
    expect(rules).toContain('[dir="rtl"]');
    expect(rules).toContain("linear-gradient(toleft,transparent0");
  });

  test("a single edge fades that edge and no other", () => {
    const top = flat(rulesFor(scrollFadeT));
    expect(top).toContain("#000var(--scroll-fade-t,0px),#000100%");
    expect(top).not.toContain("--scroll-fade-b");

    const bottom = flat(rulesFor(scrollFadeB));
    expect(bottom).toContain("#000calc(100%-var(--scroll-fade-b,0px)),transparent100%");
    expect(bottom).not.toContain("--scroll-fade-t");
  });

  test("start and end mirror by their own direction, not for every descendant of rtl", () => {
    for (const fade of [scrollFadeS, scrollFadeE]) {
      expect(flat(rulesFor(fade))).toContain(':where(:dir(rtl)):where([dir="rtl"],[dir="rtl"]*)');
    }
  });

  test("start and end mirror under rtl, left and right do not", () => {
    expect(flat(rulesFor(scrollFadeS))).toContain('[dir="rtl"]');
    expect(flat(rulesFor(scrollFadeE))).toContain('[dir="rtl"]');
    expect(flat(rulesFor(scrollFadeS))).toContain("animation-timeline:scroll(selfinline)");

    expect(flat(rulesFor(scrollFadeL))).not.toContain('[dir="rtl"]');
    expect(flat(rulesFor(scrollFadeR))).not.toContain('[dir="rtl"]');
    expect(flat(rulesFor(scrollFadeL))).toContain("animation-timeline:scroll(selfx)");
  });

  test("none removes the mask without removing the class that set it", () => {
    expect(flat(rulesFor(scrollFadeNone))).toContain("--scroll-fade-mask:none");
  });

  test("the edge sizes are registered lengths, or a keyframe could not animate them", () => {
    const sheet = flat(collectCss());
    for (const edge of ["t", "b", "s", "e"]) {
      expect(sheet).toContain(`@property--scroll-fade-${edge}{syntax:"<length-percentage>"`);
      expect(sheet).toContain(`@keyframesscroll-fade-reveal-${edge}{`);
    }
  });
});

describe("scrollFadeStyle", () => {
  test("a number is a multiple of the spacing scale", () => {
    expect(scrollFadeStyle({ size: 4 })).toEqual({
      "--scroll-fade-size": "calc(var(--spacing) * 4)",
    });
  });

  test("a length or a percentage is taken as written", () => {
    expect(scrollFadeStyle({ size: "20%" })).toEqual({ "--scroll-fade-size": "20%" });
  });

  test("each edge has a size of its own, and the reveal distance is separate", () => {
    expect(scrollFadeStyle({ top: 24, bottom: "2rem", start: 2, end: "10%", reveal: 12 })).toEqual({
      "--scroll-fade-t-size": "calc(var(--spacing) * 24)",
      "--scroll-fade-b-size": "2rem",
      "--scroll-fade-s-size": "calc(var(--spacing) * 2)",
      "--scroll-fade-e-size": "10%",
      "--scroll-fade-reveal": "calc(var(--spacing) * 12)",
    });
  });

  test("nothing asked for is nothing set", () => {
    expect(scrollFadeStyle({})).toEqual({});
  });
});
