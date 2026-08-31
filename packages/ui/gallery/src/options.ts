/**
 * What each picker offers, and the swatch beside it.
 *
 * Derived from `@barqjs/ui`'s own theme table wherever there is one, so a theme
 * added upstream appears here without this file being touched. The two font
 * lists are the exception and are written out, for the reason on `FONTS`.
 */

import { ACCENT_THEMES, BASE_THEMES, type ThemeDefinition } from "@barqjs/ui";

export interface Option {
  readonly value: string;
  readonly label: string;
  /** The dot beside the trigger and the item, where the choice has a colour. */
  readonly swatch?: string;
  /** What the value becomes in the theme, where it is not the value itself. */
  readonly css?: string;
}

const NONE = "none";

/** The dot shadcn draws: a base is known by its grey, an accent by its primary. */
function dotOf(theme: ThemeDefinition, token: "muted-foreground" | "primary"): string | undefined {
  return theme.dark[token] ?? theme.light[token];
}

export const BASES: readonly Option[] = BASE_THEMES.map((theme) => ({
  value: theme.name,
  label: theme.title,
  ...(dotOf(theme, "muted-foreground") === undefined
    ? {}
    : { swatch: dotOf(theme, "muted-foreground") }),
}));

export const ACCENTS: readonly Option[] = [
  { value: NONE, label: "None" },
  ...ACCENT_THEMES.map((theme) => ({
    value: theme.name,
    label: theme.title,
    ...(dotOf(theme, "primary") === undefined ? {} : { swatch: dotOf(theme, "primary") }),
  })),
];

/** The same seventeen, chosen for the ramp alone rather than for `primary`. */
export const CHARTS: readonly Option[] = [
  { value: NONE, label: "Theme's own" },
  ...ACCENT_THEMES.map((theme) => ({
    value: theme.name,
    label: theme.title,
    ...(theme.dark["chart-1"] === undefined ? {} : { swatch: theme.dark["chart-1"] }),
  })),
];

/** shadcn's own four, plus leaving whatever the base declares. */
export const RADII: readonly Option[] = [
  { value: NONE, label: "Theme's own" },
  { value: "0", label: "None" },
  { value: "0.45rem", label: "Small" },
  { value: "0.625rem", label: "Medium" },
  { value: "0.875rem", label: "Large" },
];

/**
 * STACKS, not families. Nothing here loads a font.
 *
 * shadcn's configurator offers thirty Google families and fetches them, which
 * is right for a hosted page and wrong for a gallery that has to work with no
 * network: a family that is not installed falls back in silence, so the control
 * would appear to do nothing on half the machines that open it. These are
 * families a desktop already has, ordered so that each one is visibly a
 * different shape from the last.
 */
export const FONTS: readonly Option[] = [
  { value: "system", label: "System", css: undefined },
  {
    value: "humanist",
    label: "Humanist",
    css: '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  {
    value: "geometric",
    label: "Geometric",
    css: '"Century Gothic", "Avant Garde", "Futura", "Trebuchet MS", sans-serif',
  },
  {
    value: "serif",
    label: "Serif",
    css: 'Georgia, "Times New Roman", Times, serif',
  },
  {
    value: "slab",
    label: "Slab",
    css: '"Rockwell", "Roboto Slab", "Bookman Old Style", Georgia, serif',
  },
  {
    value: "mono",
    label: "Monospace",
    css: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
];

export const MONO: readonly Option[] = [
  { value: "system", label: "System", css: undefined },
  { value: "menlo", label: "Menlo", css: 'Menlo, Monaco, "Courier New", monospace' },
  { value: "consolas", label: "Consolas", css: 'Consolas, "Lucida Console", monospace' },
  { value: "courier", label: "Courier", css: '"Courier New", Courier, monospace' },
];

/**
 * shadcn's eight, and the swatch is deliberately absent: a style is a shape
 * rather than a colour, so a dot would say nothing true about it.
 */
export const STYLES: readonly Option[] = [
  { value: NONE, label: "None" },
  { value: "vega", label: "Vega" },
  { value: "nova", label: "Nova" },
  { value: "maia", label: "Maia" },
  { value: "lyra", label: "Lyra" },
  { value: "mira", label: "Mira" },
  { value: "luma", label: "Luma" },
  { value: "sera", label: "Sera" },
  { value: "rhea", label: "Rhea" },
];

export function labelOf(options: readonly Option[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function swatchOf(options: readonly Option[], value: string): string | undefined {
  return options.find((option) => option.value === value)?.swatch;
}
