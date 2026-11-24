/**
 * arc's own scales, as values: what a style object reads where no treatment
 * says it already. A colour or a corner ui has a token for is ui's token,
 * `@barqjs/ui/theme/tokens`, rather than a second spelling of it here.
 */

import { tokens } from "@barqjs/ui/theme/tokens";

/**
 * The spacing scale, as multiples of ui's `--spacing`: `space.x4` is
 * `calc(var(--spacing) * 4)`. Density is that one token, so every value here
 * follows a `data-density` region.
 */
export const space = {
  x0: "0px",
  x0_5: "calc(var(--spacing) * 0.5)",
  x1: "calc(var(--spacing) * 1)",
  x1_5: "calc(var(--spacing) * 1.5)",
  x2: "calc(var(--spacing) * 2)",
  x2_5: "calc(var(--spacing) * 2.5)",
  x3: "calc(var(--spacing) * 3)",
  x3_5: "calc(var(--spacing) * 3.5)",
  x4: "calc(var(--spacing) * 4)",
  x5: "calc(var(--spacing) * 5)",
  x6: "calc(var(--spacing) * 6)",
  x8: "calc(var(--spacing) * 8)",
  x9: "calc(var(--spacing) * 9)",
  x10: "calc(var(--spacing) * 10)",
  x11: "calc(var(--spacing) * 11)",
  x12: "calc(var(--spacing) * 12)",
  x14: "calc(var(--spacing) * 14)",
  x16: "calc(var(--spacing) * 16)",
} as const;

/** Corners, as steps of the theme's `--radius`. */
export const radius = {
  xs: "calc(var(--radius) * 0.5)",
  sm: "calc(var(--radius) * 0.6)",
  md: tokens.radius,
  lg: "calc(var(--radius) * 1.4)",
  xl: "calc(var(--radius) * 2)",
  full: "9999px",
} as const;

/** Durations and the two curves, as arc's theme tokens. */
export const motionTokens = {
  fast: "var(--duration-fast, 150ms)",
  base: "var(--duration-base, 200ms)",
  slow: "var(--duration-slow, 300ms)",
  standard: "var(--ease-standard, ease)",
  emphasized: "var(--ease-emphasized, ease-out)",
} as const;

/** Stacking, as arc's theme tokens with the values they default to. */
export const zIndex = {
  sticky: "var(--z-sticky, 10)",
  header: "var(--z-header, 20)",
  popover: "var(--z-popover, 40)",
  overlay: "var(--z-overlay, 50)",
  toast: "var(--z-toast, 60)",
} as const;
