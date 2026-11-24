/**
 * The conditions every style in barq's design system is written under, named
 * once.
 *
 * A breakpoint written in two places is two spellings, and two spellings are
 * two conditions with their own hash and their own place in the cascade. Here
 * each one is a key, so `{ padding: { default: 4, [on.md]: 8 } }` in this
 * package, in `@barqjs/arc` and in an application all mean one rule.
 *
 * The widths are tokens, `breakpoints` and `containers`, for the code that asks
 * the question in JavaScript (`mediaQuery(breakpointQuery("md"))`). A media
 * query cannot read a custom property, so the strings below spell the same
 * widths out, and `shared.test.ts` holds the two to each other.
 *
 * The steps are Tailwind's, so a class copied from shadcn lands on the same
 * width. Each comes twice: `md` from its width up, which is what a style
 * written by hand wants, and `mdOnly` up to the next step, for a value per
 * step. Two `min-width` conditions on one property both match a wide screen,
 * and between two at-rules of one tier the stylesheet orders by hash, not by
 * width, so a responsive value written as steps that overlap would pick a
 * winner nobody chose.
 */

import { defineConditions } from "@barqjs/css";

export type Breakpoint = "sm" | "md" | "lg" | "xl" | "2xl";
export type ContainerStep = "sm" | "md" | "lg" | "xl";

/** Where each viewport step starts. */
export const breakpoints: { readonly [K in Breakpoint]: string } = {
  sm: "40rem",
  md: "48rem",
  lg: "64rem",
  xl: "80rem",
  "2xl": "96rem",
};

/** Where each container step starts, for an element with `container-type`. */
export const containers: { readonly [K in ContainerStep]: string } = {
  sm: "24rem",
  md: "32rem",
  lg: "48rem",
  xl: "64rem",
};

/** A step as the media query `mediaQuery` and `matchMedia` take: from it up, or below it. */
export function breakpointQuery(step: Breakpoint, direction: "up" | "down" = "up"): string {
  return direction === "up" ? `(width >= ${breakpoints[step]})` : `(width < ${breakpoints[step]})`;
}

export const on = defineConditions({
  sm: "@media (width >= 40rem)",
  md: "@media (width >= 48rem)",
  lg: "@media (width >= 64rem)",
  xl: "@media (width >= 80rem)",
  "2xl": "@media (width >= 96rem)",
  belowSm: "@media (width < 40rem)",
  belowMd: "@media (width < 48rem)",
  smOnly: "@media (40rem <= width < 48rem)",
  mdOnly: "@media (48rem <= width < 64rem)",
  lgOnly: "@media (64rem <= width < 80rem)",
  xlOnly: "@media (80rem <= width < 96rem)",

  cqSm: "@container (width >= 24rem)",
  cqMd: "@container (width >= 32rem)",
  cqLg: "@container (width >= 48rem)",
  cqXl: "@container (width >= 64rem)",
  cqBelowSm: "@container (width < 24rem)",
  cqBelowMd: "@container (width < 32rem)",
  cqSmOnly: "@container (24rem <= width < 32rem)",
  cqMdOnly: "@container (32rem <= width < 48rem)",
  cqLgOnly: "@container (48rem <= width < 64rem)",

  /** A finger, where a target needs room; and a mouse or a pen. */
  coarse: "@media (pointer: coarse)",
  fine: "@media (pointer: fine)",
  /** A pointer that can rest on something, so a hover style is not stuck after a tap. */
  hover: "@media (hover: hover)",
  reducedMotion: "@media (prefers-reduced-motion: reduce)",
  motion: "@media (prefers-reduced-motion: no-preference)",
  moreContrast: "@media (prefers-contrast: more)",
  forcedColors: "@media (forced-colors: active)",
  print: "@media print",

  /** Under the class `installTheme` toggles, as every component here writes it. */
  dark: ":is(.dark *)",
  rtl: ":dir(rtl)",
});
