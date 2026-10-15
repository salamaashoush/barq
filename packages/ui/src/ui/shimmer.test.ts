import { describe, expect, test } from "bun:test";
import { collectCss } from "@barqjs/css";

import { rulesFor } from "../test-rules.ts";

import { shimmer, shimmerNone, shimmerOnce, shimmerReverse, shimmerStyle } from "./shimmer.ts";

const flat = (text: string): string => text.replaceAll(/\s+/g, "");

describe("shimmer", () => {
  test("the highlight is a gradient clipped to the text", () => {
    const rules = flat(rulesFor(shimmer));
    expect(rules).toContain("background-clip:text");
    expect(rules).toContain("-webkit-text-fill-color:var(--shimmer-text-fill,transparent)");
    expect(rules).toContain("background-image:var(--shimmer-image,linear-gradient(");
    expect(rules).toContain("calc(90deg+var(--shimmer-angle))");
  });

  test("it sweeps forever by default, at a duration a caller can set", () => {
    const rules = flat(rulesFor(shimmer));
    expect(rules).toMatch(/animation:[\w-]+var\(--shimmer-duration,2s\)linearinfinite/);
  });

  test("the highlight derives from the text colour, and is brighter on dark", () => {
    const rules = flat(rulesFor(shimmer));
    expect(rules).toContain("--_base:currentColor");
    expect(rules).toContain("var(--shimmer-color,oklch(fromcurrentColorlch/calc(alpha*0.2)))");
    expect(rules).toContain(":is(.dark*)");
    expect(rules).toContain("max(0.8,calc(l+0.4))");
  });

  test("right to left it sweeps the other way", () => {
    const rules = flat(rulesFor(shimmer));
    expect(rules).toContain('[dir="rtl"]');
    expect(rules).toContain("animation-direction:reverse");
  });

  test("by its own direction, so a left-to-right island inside is left alone", () => {
    // `[dir="rtl"] *` is every descendant, a nested `dir="ltr"` subtree
    // included. `:dir()` asks the element which way it runs.
    expect(flat(rulesFor(shimmer))).toContain(':where(:dir(rtl)):where([dir="rtl"],[dir="rtl"]*)');
  });

  test("reduced motion gets plain text, not a frozen gradient", () => {
    const rules = flat(rulesFor(shimmer));
    expect(rules).toContain("@media(prefers-reduced-motion:reduce)");
    expect(rules).toContain("animation:none");
    expect(rules).toContain("-webkit-text-fill-color:currentColor");
  });

  test("once runs a single sweep", () => {
    expect(flat(rulesFor(shimmerOnce))).toContain("animation-iteration-count:1");
  });

  test("reverse sweeps the other way", () => {
    expect(flat(rulesFor(shimmerReverse))).toContain("animation-direction:reverse");
  });

  test("none switches it off and puts the text colour back", () => {
    const rules = flat(rulesFor(shimmerNone));
    expect(rules).toContain("--shimmer-image:none");
    expect(rules).toContain("--shimmer-text-fill:currentColor");
  });

  test("the angle is a registered angle that inherits, so a parent can set it", () => {
    const sheet = flat(collectCss());
    expect(sheet).toContain('@property--shimmer-angle{syntax:"<angle>";inherits:true');
  });
});

describe("shimmerStyle", () => {
  test("duration is milliseconds, the angle is degrees", () => {
    expect(shimmerStyle({ duration: 1000, angle: 45 })).toEqual({
      "--shimmer-duration": "1000ms",
      "--shimmer-angle": "45deg",
    });
  });

  test("a numeric spread is a multiple of the spacing scale, a length is as written", () => {
    expect(shimmerStyle({ spread: 24 })).toEqual({
      "--shimmer-spread": "calc(var(--spacing) * 24)",
    });
    expect(shimmerStyle({ spread: "6ch" })).toEqual({ "--shimmer-spread": "6ch" });
  });

  test("the colour is any colour, and an opacity mixes it toward transparent", () => {
    expect(shimmerStyle({ color: "var(--primary)" })).toEqual({
      "--shimmer-color": "var(--primary)",
    });
    expect(shimmerStyle({ color: "var(--primary)", opacity: 60 })).toEqual({
      "--shimmer-color": "color-mix(in oklch, var(--primary) 60%, transparent)",
    });
  });

  test("nothing asked for is nothing set", () => {
    expect(shimmerStyle({})).toEqual({});
  });
});
