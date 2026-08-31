/**
 * A colour theme, on the page.
 *
 * The tokens are a `:root` block and a dark counterpart, which is data rather
 * than something to compile: an application uses one of the twenty-four and
 * should pay for one, and switching theme at run time is a feature rather than
 * an escape hatch. `registerCss` is keyed, so installing a second theme
 * REPLACES the first instead of stacking two sets of `--primary` and hoping
 * the later one wins.
 *
 * For an application that picks its theme once and never changes it, the CLI's
 * `init` writes the same rules into a `globalCss` block the compiler folds
 * away, and none of this ships.
 */

import { registerCss } from "@barqjs/css";

import "./layers.ts";
import { findTheme, type ThemeDefinition, type ThemeTokens } from "./themes.ts";

export interface ThemeSelection {
  /** The whole token set. A name from `BASE_THEMES`, or one of your own. */
  readonly base: string | ThemeDefinition;
  /**
   * A handful of tokens over the base: `primary`, the chart ramp, the sidebar's
   * accent. A name from `ACCENT_THEMES`.
   */
  readonly accent?: string | ThemeDefinition;
  /** `--radius`, if the base's own value is not what you want. */
  readonly radius?: string;
  /**
   * Where the light values land.
   *
   * @default ":root"
   */
  readonly scope?: string;
  /**
   * How the dark values are asked for: a selector, or `"media"` for
   * `prefers-color-scheme`.
   *
   * @default ".dark"
   */
  readonly dark?: string;
}

function resolve(theme: string | ThemeDefinition): ThemeDefinition {
  if (typeof theme !== "string") return theme;
  const found = findTheme(theme);
  if (found === undefined) throw new Error(`no theme named "${theme}"`);
  return found;
}

/**
 * A chosen radius REPLACES the base's own, rather than following it.
 *
 * Every base declares `radius` among its tokens, so appending wrote `--radius`
 * twice. The cascade took the second and the page was right, but `themeCss` is
 * also what a configurator shows someone to copy out.
 */
function declarations(tokens: ThemeTokens, radius: string | undefined): string {
  const all = radius === undefined ? tokens : { ...tokens, radius };
  return Object.entries(all)
    .map(([token, value]) => `  --${token}: ${value};`)
    .join("\n");
}

/**
 * A dark selector that survives being scoped.
 *
 * `.dark` on `<html>` with `:root` scoping is the shadcn arrangement and needs
 * nothing. A theme scoped to `.panel` has two ways to be dark — the class on an
 * ancestor, or on the element itself — and a selector naming only one of them
 * silently does nothing half the time.
 */
function darkSelector(scope: string, dark: string): string {
  if (scope === ":root") return dark;
  return `${dark} ${scope}, ${scope}${dark}`;
}

export function themeCss(selection: ThemeSelection): string {
  const base = resolve(selection.base);
  const accent = selection.accent === undefined ? undefined : resolve(selection.accent);
  const scope = selection.scope ?? ":root";
  const dark = selection.dark ?? ".dark";

  const light = { ...base.light, ...accent?.light };
  const night = { ...base.dark, ...accent?.dark };

  const lightRule = `${scope} {\n${declarations(light, selection.radius)}\n}`;
  const darkRule =
    dark === "media"
      ? `@media (prefers-color-scheme: dark) {\n  ${scope} {\n${declarations(night, undefined)}\n  }\n}`
      : `${darkSelector(scope, dark)} {\n${declarations(night, undefined)}\n}`;

  return `@layer barq.theme {\n${lightRule}\n${darkRule}\n}`;
}

/**
 * The key every installed theme shares, so the second call replaces the first.
 *
 * Scoped themes are a different question — two of them are meant to coexist —
 * so those key on their scope.
 */
function keyFor(scope: string): string {
  return scope === ":root" ? "barq-ui:theme" : `barq-ui:theme:${scope}`;
}

export function installTheme(selection: ThemeSelection): void {
  registerCss(keyFor(selection.scope ?? ":root"), themeCss(selection));
}
