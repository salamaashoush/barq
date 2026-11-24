import type { ThemeTokens } from "@barqjs/ui/theme";

/** The tones every status, badge, banner and chart threshold draws from. */
export const TONES = ["success", "warning", "danger", "info", "neutral"] as const;
export type Tone = (typeof TONES)[number];

/**
 * What arc adds to `@barqjs/ui`'s tokens, light and dark.
 *
 * Each tone has three: the tone itself (a dot, a bar, an icon), `-foreground`
 * for text in that tone on the page or on its subtle fill, and `-subtle` for
 * the fill behind it. Both foregrounds clear 4.5:1 against `--background` and
 * against their `-subtle`.
 */
export const ARC_LIGHT: ThemeTokens = {
  sunken: "oklch(0.985 0 0)",
  link: "oklch(0.5 0.2 258)",
  "faint-foreground": "oklch(0.52 0 0)",
  "border-strong": "oklch(0.85 0 0)",
  selection: "oklch(0.5 0.2 258 / 0.18)",
  success: "oklch(0.6 0.15 150)",
  "success-foreground": "oklch(0.49 0.13 150)",
  "success-subtle": "oklch(0.965 0.03 150)",
  warning: "oklch(0.62 0.16 60)",
  "warning-foreground": "oklch(0.52 0.13 60)",
  "warning-subtle": "oklch(0.975 0.035 85)",
  danger: "oklch(0.56 0.21 25)",
  "danger-foreground": "oklch(0.52 0.2 25)",
  "danger-subtle": "oklch(0.97 0.02 25)",
  info: "oklch(0.58 0.2 258)",
  "info-foreground": "oklch(0.5 0.2 258)",
  "info-subtle": "oklch(0.97 0.02 258)",
  neutral: "oklch(0.6 0 0)",
  "neutral-foreground": "oklch(0.47 0 0)",
  "neutral-subtle": "oklch(0.96 0 0)",
  "code-keyword": "oklch(0.5 0.17 300)",
  "code-string": "oklch(0.49 0.1 186)",
  "code-number": "oklch(0.5 0.14 250)",
  "code-function": "oklch(0.48 0.19 258)",
  "code-property": "oklch(0.46 0.09 237)",
  "code-type": "oklch(0.51 0.18 345)",
  "code-tag": "oklch(0.49 0.15 300)",
  overlay: "oklch(0 0 0 / 0.4)",
  "shadow-color": "oklch(0 0 0 / 0.06)",
  "shadow-color-strong": "oklch(0 0 0 / 0.08)",
  "duration-fast": "150ms",
  "duration-base": "200ms",
  "duration-slow": "300ms",
  "ease-standard": "cubic-bezier(0.2, 0, 0, 1)",
  "ease-emphasized": "cubic-bezier(0.05, 0.7, 0.1, 1)",
  "z-sticky": "10",
  "z-header": "20",
  "z-popover": "40",
  "z-overlay": "50",
  "z-toast": "60",
};

export const ARC_DARK: ThemeTokens = {
  sunken: "oklch(0.1 0 0)",
  link: "oklch(0.72 0.14 250)",
  "faint-foreground": "oklch(0.64 0 0)",
  "border-strong": "oklch(0.36 0 0)",
  selection: "oklch(0.72 0.14 250 / 0.3)",
  success: "oklch(0.68 0.15 150)",
  "success-foreground": "oklch(0.76 0.15 150)",
  "success-subtle": "oklch(0.21 0.04 150)",
  warning: "oklch(0.8 0.15 75)",
  "warning-foreground": "oklch(0.83 0.14 78)",
  "warning-subtle": "oklch(0.21 0.035 70)",
  danger: "oklch(0.64 0.2 25)",
  "danger-foreground": "oklch(0.72 0.17 22)",
  "danger-subtle": "oklch(0.21 0.045 25)",
  info: "oklch(0.66 0.16 252)",
  "info-foreground": "oklch(0.74 0.13 250)",
  "info-subtle": "oklch(0.21 0.045 258)",
  neutral: "oklch(0.55 0 0)",
  "neutral-foreground": "oklch(0.72 0 0)",
  "neutral-subtle": "oklch(0.215 0 0)",
  "code-keyword": "oklch(0.77 0.13 300)",
  "code-string": "oklch(0.8 0.1 186)",
  "code-number": "oklch(0.79 0.11 250)",
  "code-function": "oklch(0.79 0.12 258)",
  "code-property": "oklch(0.83 0.06 237)",
  "code-type": "oklch(0.79 0.13 345)",
  "code-tag": "oklch(0.77 0.13 300)",
  overlay: "oklch(0 0 0 / 0.6)",
  "shadow-color": "oklch(0 0 0 / 0.32)",
  "shadow-color-strong": "oklch(0 0 0 / 0.5)",
};

/** `var()` references for the tokens arc adds, for values that cross a module as data. */
export const arc = {
  sunken: "var(--sunken)",
  link: "var(--link)",
  faintForeground: "var(--faint-foreground)",
  borderStrong: "var(--border-strong)",
  selection: "var(--selection)",
  overlay: "var(--overlay)",
  shadowColor: "var(--shadow-color)",
  shadowColorStrong: "var(--shadow-color-strong)",
  durationFast: "var(--duration-fast)",
  durationBase: "var(--duration-base)",
  durationSlow: "var(--duration-slow)",
  easeStandard: "var(--ease-standard)",
  easeEmphasized: "var(--ease-emphasized)",
  zSticky: "var(--z-sticky)",
  zHeader: "var(--z-header)",
  zPopover: "var(--z-popover)",
  zOverlay: "var(--z-overlay)",
  zToast: "var(--z-toast)",
} as const;

export interface ToneTokens {
  base: string;
  foreground: string;
  subtle: string;
}

/** A tone's three tokens, as `var()` references. */
export function tone(name: Tone): ToneTokens {
  return {
    base: `var(--${name})`,
    foreground: `var(--${name}-foreground)`,
    subtle: `var(--${name}-subtle)`,
  };
}

export const DENSITIES = ["compact", "comfortable", "spacious"] as const;
export type Density = (typeof DENSITIES)[number];

/**
 * How much room a region takes, as the one token every height, padding and
 * gap in ui and arc is a multiple of: `--spacing`. A control `9` steps tall,
 * a cell padded `3` and a toolbar spaced `2` all tighten together, and none of
 * them branches on the density in JavaScript. A touch target is the
 * exception by design: it is 44px under a coarse pointer at every density.
 */
export const DENSITY: Readonly<Record<Density, ThemeTokens>> = {
  compact: { spacing: "0.2rem" },
  comfortable: { spacing: "0.25rem" },
  spacious: { spacing: "0.3rem" },
};

/**
 * The tokens a high-contrast theme replaces: every edge and every quiet text
 * colour pulled toward the foreground, light and dark, so a border and a hint
 * clear 4.5:1 rather than the 3:1 a decorative edge is allowed.
 */
export const ARC_CONTRAST_LIGHT: ThemeTokens = {
  border: "oklch(0.45 0 0)",
  input: "oklch(0.45 0 0)",
  "border-strong": "oklch(0.3 0 0)",
  "muted-foreground": "oklch(0.35 0 0)",
  "faint-foreground": "oklch(0.4 0 0)",
  ring: "oklch(0.2 0 0)",
};

export const ARC_CONTRAST_DARK: ThemeTokens = {
  border: "oklch(0.75 0 0)",
  input: "oklch(0.75 0 0)",
  "border-strong": "oklch(0.88 0 0)",
  "muted-foreground": "oklch(0.86 0 0)",
  "faint-foreground": "oklch(0.8 0 0)",
  ring: "oklch(0.96 0 0)",
};
