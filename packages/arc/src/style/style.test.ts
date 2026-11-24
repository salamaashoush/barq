import { collectCss } from "@barqjs/css";
import { describe, expect, test } from "bun:test";
import { box } from "@barqjs/ui/shared-box";
import { ring } from "@barqjs/ui/shared-ring";
import { text } from "@barqjs/ui/shared-text";

import { edge, focus, gap, layout, motion, space, surface, target, tone, type } from "./index.ts";

const classesOf = (group: string): string[] => group.split(" ");

describe("arc's style", () => {
  test("composes ui's treatments rather than writing them again", () => {
    for (const one of classesOf(text.sm)) expect(classesOf(type.label)).toContain(one);
    for (const one of classesOf(text.medium)) expect(classesOf(type.label)).toContain(one);
    for (const one of classesOf(box.border)) expect(classesOf(edge.all)).toContain(one);
    expect(focus.visible).toBe(ring.focus);
  });

  test("puts its own rules in arc's layer", () => {
    const sheet = collectCss();
    expect(sheet).toContain("@layer barq.arc{");
    for (const one of classesOf(layout.row)) expect(sheet).toContain(`.${one}`);
  });

  test("spaces from the one token density changes", () => {
    expect(space.x4).toBe("calc(var(--spacing) * 4)");
    expect(collectCss()).toContain(`{row-gap:${space.x2}}`);
    expect(classesOf(gap[2]).length).toBe(2);
  });

  test("a surface is one box: its fill, its edge and its corner", () => {
    for (const one of classesOf(edge.all)) expect(classesOf(surface.card)).toContain(one);
  });

  test("motion stops under reduced motion and touch targets grow under a coarse pointer", () => {
    const sheet = collectCss();
    expect(sheet).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\{\.[\w-]+\{transition-duration:0s\}/,
    );
    expect(sheet).toMatch(/@media \(pointer: coarse\)\{\.[\w-]+\{min-block-size:2\.75rem\}/);
    expect(classesOf(motion.colours).length).toBeGreaterThan(2);
    expect(classesOf(target.size).length).toBe(4);
  });

  test("a tone sets the three properties its children draw in", () => {
    expect(collectCss()).toContain("--arc-tone-subtle:var(--success-subtle)");
    expect(classesOf(tone.success).length).toBe(3);
  });
});
