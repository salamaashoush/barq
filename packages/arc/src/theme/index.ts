import { registerCss } from "@barqjs/css";
import { type ThemeSelection, type ThemeTokens, themeValues } from "@barqjs/ui/theme";

import { ARC_DARK, ARC_LIGHT } from "./tokens.ts";

export { ARC_DARK, ARC_LIGHT, TONES, arc, tone, type Tone } from "./tokens.ts";

export interface ArcThemeSelection extends ThemeSelection {
  /**
   * Tokens over everything else, light and dark: arc's own (`success`,
   * `link`, `z-toast`), `@barqjs/ui`'s (`primary`, `radius`), or an app's
   * brand under names of its own (`brand`, `brand-ink`). The dark set falls
   * back to the light one for a token it does not name, which is what a
   * radius or a duration wants.
   */
  readonly tokens?: { readonly light?: ThemeTokens; readonly dark?: ThemeTokens };
}

/** Every token a selection comes to, light and dark: ui's, then arc's, then the app's. */
export function arcThemeValues(selection: ArcThemeSelection): {
  light: ThemeTokens;
  dark: ThemeTokens;
} {
  const base = themeValues(selection);
  const light = { ...base.light, ...ARC_LIGHT, ...selection.tokens?.light };
  const dark = { ...base.dark, ...ARC_DARK, ...selection.tokens?.dark };
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
  return `@layer barq.theme {\n${scope} {\n${block(light)}\n}\n${darkRule}\n}`;
}

/** Put the theme on the page, replacing one installed before for the same scope. */
export function installArcTheme(selection: ArcThemeSelection): void {
  const scope = selection.scope ?? ":root";
  registerCss(
    scope === ":root" ? "barq-arc:theme" : `barq-arc:theme:${scope}`,
    arcThemeCss(selection),
  );
}
