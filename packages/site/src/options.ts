/**
 * What each picker offers, and the swatch beside it.
 *
 * The names are shadcn's: a BASE COLOUR is the whole token set (`neutral`,
 * `stone`, …), a THEME layers `primary` and the chart ramp over one of them
 * (`blue`, `amber`, …), and a CHART COLOUR takes only the ramp, from a
 * different theme than the one `primary` came from. `getThemesForBaseColor` is
 * upstream's rule for what the second and third lists hold: the current base
 * plus every theme, which is why the first group of both is one entry long.
 *
 * Derived from `@barqjs/ui`'s own theme table wherever there is one, so a theme
 * added upstream appears here without this file being touched. The font lists
 * are the exception and are written out, for the reason on `FONTS`.
 */

import { ACCENT_THEMES, BASE_THEMES, type ThemeDefinition } from "@barqjs/ui";

export interface Option {
  readonly value: string;
  readonly label: string;
  /** The dot beside the trigger and the item, where the choice has a colour. */
  readonly swatch?: string;
  /** What the value becomes in the theme, where it is not the value itself. */
  readonly css?: string;
  /**
   * The heading a picker draws above this run of options.
   *
   * shadcn separates its base colours from its themes with a rule, and its
   * fonts into Sans, Serif and Mono with a label each. A group on the option
   * rather than a list of lists, because every picker then takes one array and
   * the grouping is data like everything else.
   */
  readonly group?: string;
}

const NONE = "none";

/** The dot shadcn draws: a base is known by its grey, a theme by its primary. */
function dotOf(theme: ThemeDefinition, token: "muted-foreground" | "primary"): string | undefined {
  return theme.dark[token] ?? theme.light[token];
}

export const BASE_COLORS: readonly Option[] = BASE_THEMES.map((theme) => ({
  value: theme.name,
  label: theme.title,
  ...(dotOf(theme, "muted-foreground") === undefined
    ? {}
    : { swatch: dotOf(theme, "muted-foreground") }),
}));

/**
 * The base's own tokens, then the seventeen that layer over them.
 *
 * `None` is the first group of one, which is where upstream puts the current
 * base colour: choosing it means "the base decides `primary` too".
 */
export const THEMES: readonly Option[] = [
  { value: NONE, label: "Base color", group: "base" },
  ...ACCENT_THEMES.map((theme) => ({
    value: theme.name,
    label: theme.title,
    group: "theme",
    ...(dotOf(theme, "primary") === undefined ? {} : { swatch: dotOf(theme, "primary") }),
  })),
];

/** The same seventeen, chosen for the ramp alone rather than for `primary`. */
export const CHART_COLORS: readonly Option[] = [
  { value: NONE, label: "Theme's own", group: "base" },
  ...ACCENT_THEMES.map((theme) => ({
    value: theme.name,
    label: theme.title,
    group: "theme",
    ...(theme.dark["chart-1"] === undefined ? {} : { swatch: theme.dark["chart-1"] }),
  })),
];

/** shadcn's own four, plus leaving whatever the base declares. */
export const RADII: readonly Option[] = [
  { value: NONE, label: "Default", group: "default" },
  { value: "0", label: "None", group: "radius" },
  { value: "0.45rem", label: "Small", group: "radius" },
  { value: "0.625rem", label: "Medium", group: "radius" },
  { value: "0.875rem", label: "Large", group: "radius" },
];

/**
 * STACKS, not families. Nothing here loads a font.
 *
 * shadcn's configurator offers twenty-six Google families and fetches them,
 * which is right for a hosted page and wrong for a gallery that has to work
 * with no network: a family that is not installed falls back in silence, so the
 * control would appear to do nothing on half the machines that open it. These
 * are families a desktop already has, grouped the way upstream groups its own —
 * Sans, Serif, Mono — and ordered so each is visibly a different shape from the
 * last.
 */
export const FONTS: readonly Option[] = [
  { value: "system", label: "System", group: "sans", css: undefined },
  {
    value: "humanist",
    label: "Humanist",
    group: "sans",
    css: '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  {
    value: "geometric",
    label: "Geometric",
    group: "sans",
    css: '"Century Gothic", "Avant Garde", "Futura", "Trebuchet MS", sans-serif',
  },
  {
    value: "grotesque",
    label: "Grotesque",
    group: "sans",
    css: '"Helvetica Neue", Helvetica, "Arial Nova", Arial, sans-serif',
  },
  {
    value: "serif",
    label: "Serif",
    group: "serif",
    css: 'Georgia, "Times New Roman", Times, serif',
  },
  {
    value: "slab",
    label: "Slab",
    group: "serif",
    css: '"Rockwell", "Roboto Slab", "Bookman Old Style", Georgia, serif',
  },
  {
    value: "old-style",
    label: "Old Style",
    group: "serif",
    css: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  },
  {
    value: "mono",
    label: "Monospace",
    group: "mono",
    css: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
];

/**
 * The body font, and the one extra choice a heading has.
 *
 * `inherit` is shadcn's sentinel for "whatever the body font is", and it is a
 * sentinel rather than a copy of the current value so that changing the body
 * font later still moves the headings with it.
 */
export const HEADING_FONTS: readonly Option[] = [
  { value: "inherit", label: "Body font", group: "default" },
  ...FONTS,
];

export const MONO: readonly Option[] = [
  { value: "system", label: "System", group: "mono", css: undefined },
  {
    value: "menlo",
    label: "Menlo",
    group: "mono",
    css: 'Menlo, Monaco, "Courier New", monospace',
  },
  {
    value: "consolas",
    label: "Consolas",
    group: "mono",
    css: 'Consolas, "Lucida Console", monospace',
  },
  {
    value: "courier",
    label: "Courier",
    group: "mono",
    css: '"Courier New", Courier, monospace',
  },
];

/**
 * shadcn's eight, with their descriptions.
 *
 * No swatch: a style is a shape rather than a colour, so a dot would say
 * nothing true about it. Upstream draws a small outline glyph instead, which is
 * what `glyph` names — the rounding each style gives a rectangle, which is the
 * one thing about a style a 16px icon can honestly show.
 */
export interface StyleOption extends Option {
  readonly description: string;
  /** The corner radius the glyph is drawn with, as its own shape says. */
  readonly glyph: string;
}

export const STYLES: readonly StyleOption[] = [
  { value: NONE, label: "None", description: "The components' own look", glyph: "3" },
  { value: "vega", label: "Vega", description: "Clean, neutral, and familiar", glyph: "3" },
  { value: "nova", label: "Nova", description: "Reduced padding and margins", glyph: "5" },
  { value: "maia", label: "Maia", description: "Rounded, with generous spacing", glyph: "8" },
  { value: "lyra", label: "Lyra", description: "Square, with hard edges", glyph: "0" },
  { value: "mira", label: "Mira", description: "Compact and dense", glyph: "4" },
  { value: "luma", label: "Luma", description: "Soft, light, and airy", glyph: "7" },
  { value: "sera", label: "Sera", description: "Sharp, with fine rules", glyph: "1" },
  { value: "rhea", label: "Rhea", description: "Bold, with heavy weight", glyph: "6" },
];

export function labelOf(options: readonly Option[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function optionOf(options: readonly Option[], value: string): Option | undefined {
  return options.find((option) => option.value === value);
}

export function swatchOf(options: readonly Option[], value: string): string | undefined {
  return optionOf(options, value)?.swatch;
}
