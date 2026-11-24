import { registerCss } from "@barqjs/css";
import { type ThemeSelection, type ThemeTokens, themeValues } from "@barqjs/ui/theme";

import {
  ARC_CONTRAST_DARK,
  ARC_CONTRAST_LIGHT,
  ARC_DARK,
  ARC_LIGHT,
  DENSITIES,
  DENSITY,
  type Density,
} from "./tokens.ts";

export {
  ARC_CONTRAST_DARK,
  ARC_CONTRAST_LIGHT,
  ARC_DARK,
  ARC_LIGHT,
  DENSITIES,
  DENSITY,
  TONES,
  arc,
  tone,
  type Density,
  type Tone,
} from "./tokens.ts";

export interface ArcThemeSelection extends ThemeSelection {
  /**
   * Tokens over everything else, light and dark: arc's own (`success`,
   * `link`, `z-toast`), `@barqjs/ui`'s (`primary`, `radius`), or an app's
   * brand under names of its own (`brand`, `brand-ink`). The dark set falls
   * back to the light one for a token it does not name, which is what a
   * radius or a duration wants.
   */
  readonly tokens?: { readonly light?: ThemeTokens; readonly dark?: ThemeTokens };
  /**
   * The room the whole scope takes. A region of its own takes another with
   * `data-density="compact"` (or `comfortable`, `spacious`) on any element.
   * @default "comfortable"
   */
  readonly density?: Density;
  /**
   * The high-contrast token set: always (`"high"`), or while the reader's
   * system asks for more contrast (`"system"`). Left out, neither.
   */
  readonly contrast?: "high" | "system";
}

/** Every token a selection comes to, light and dark: ui's, then arc's, then the app's. */
export function arcThemeValues(selection: ArcThemeSelection): {
  light: ThemeTokens;
  dark: ThemeTokens;
} {
  const base = themeValues(selection);
  const high = selection.contrast === "high";
  const light = {
    ...base.light,
    ...ARC_LIGHT,
    ...(selection.density === undefined ? {} : DENSITY[selection.density]),
    ...(high ? ARC_CONTRAST_LIGHT : {}),
    ...selection.tokens?.light,
  };
  const dark = {
    ...base.dark,
    ...ARC_DARK,
    ...(high ? ARC_CONTRAST_DARK : {}),
    ...selection.tokens?.dark,
  };
  return { light, dark };
}

function block(tokens: ThemeTokens): string {
  return Object.entries(tokens)
    .map(([name, value]) => `  --${name}: ${value};`)
    .join("\n");
}

/**
 * The theme as CSS, in `@layer barq.theme`, so an app's own unlayered
 * declarations still win.
 *
 * A token the dark set does not name keeps its light value through the
 * cascade, so only the colours are written twice.
 */
export function arcThemeCss(selection: ArcThemeSelection): string {
  const scope = selection.scope ?? ":root";
  const darkAsked = selection.dark ?? ".dark";
  const { light, dark } = arcThemeValues(selection);
  const darkRule =
    darkAsked === "media"
      ? `@media (prefers-color-scheme: dark) {\n  ${scope} {\n${block(dark)}\n  }\n}`
      : `${scope === ":root" ? darkAsked : `${darkAsked} ${scope}, ${scope}${darkAsked}`} {\n${block(dark)}\n}`;
  const darkSelector =
    darkAsked === "media"
      ? undefined
      : scope === ":root"
        ? darkAsked
        : `${darkAsked} ${scope}, ${scope}${darkAsked}`;
  const densities = DENSITIES.map(
    (name) =>
      `${scope === ":root" ? "" : `${scope} `}[data-density="${name}"] {\n${block(DENSITY[name])}\n}`,
  ).join("\n");
  const contrast =
    selection.contrast === "system"
      ? `\n@media (prefers-contrast: more) {\n  ${scope} {\n${block(ARC_CONTRAST_LIGHT)}\n  }\n${
          darkSelector === undefined
            ? `  @media (prefers-color-scheme: dark) {\n  ${scope} {\n${block(ARC_CONTRAST_DARK)}\n  }\n  }`
            : `  ${darkSelector} {\n${block(ARC_CONTRAST_DARK)}\n  }`
        }\n}`
      : "";
  return `@layer barq.theme {\n${scope} {\n${block(light)}\n}\n${darkRule}\n${densities}${contrast}\n}`;
}

/** Put the theme on the page, replacing one installed before for the same scope. */
export function installArcTheme(selection: ArcThemeSelection): void {
  const scope = selection.scope ?? ":root";
  registerCss(
    scope === ":root" ? "barq-arc:theme" : `barq-arc:theme:${scope}`,
    arcThemeCss(selection),
  );
}
