/**
 * The theme module `init` writes into a project.
 *
 * A `globalCss` block with the chosen colours in it, which the barq compiler
 * folds into a stylesheet at build time — so an application that picks its
 * theme once pays nothing at run time for the twenty-three it did not pick.
 * `installTheme` from `@barqjs/ui` is the other half, for an application that
 * switches theme while it is running.
 *
 * It is written as SOURCE rather than fetched, because the values come from the
 * registry's own theme data and the file is the project's to edit afterwards.
 */

import type { ThemeChoice } from "./schema.ts";

export interface ThemeTokens {
  readonly [token: string]: string;
}

export interface ThemeDefinition {
  readonly name: string;
  readonly title: string;
  readonly kind: "base" | "accent";
  readonly light: ThemeTokens;
  readonly dark: ThemeTokens;
}

/**
 * A chosen radius REPLACES the base's own, rather than following it.
 *
 * Every base declares `radius` among its tokens, so appending wrote `--radius`
 * twice. The cascade took the second one and the page was right, but the file
 * is the project's to read and edit and said two different things.
 */
function declarations(tokens: ThemeTokens, radius: string | undefined, indent: string): string {
  const all = radius === undefined ? tokens : { ...tokens, radius };
  return Object.entries(all)
    .map(([token, value]) => `${indent}--${token}: ${value};`)
    .join("\n");
}

export interface ThemeModuleOptions {
  /** Whether the reset was written beside it. */
  readonly reset: boolean;
  /** How this file reaches `base.ts`, which is written beside it. */
  readonly base: string;
  /** How it reaches `reset.ts`. */
  readonly resetPath: string;
}

export interface ResolvedTheme {
  readonly base: ThemeDefinition;
  readonly accent?: ThemeDefinition;
  /** What to call the pair, for a message a person reads. */
  readonly title: string;
}

/**
 * A length, or a function that produces one.
 *
 * `--radius` is written into the project's own stylesheet, where a typo is a
 * corner that silently stops being round. The units are CSS's absolute and
 * relative lengths; the functions are the four that can stand where a length
 * can, plus `var`, because a project layering this over tokens of its own is
 * the case the plain token names exist for.
 */
const LENGTH =
  /^(?:0|[+-]?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|ex|ch|vw|vh|vmin|vmax|cm|mm|in|pt|pc|q)|(?:calc|clamp|min|max|var)\(.*\))$/i;

function names(themes: readonly ThemeDefinition[], kind: ThemeDefinition["kind"]): string {
  return themes
    .filter((theme) => theme.kind === kind)
    .map((theme) => theme.name)
    .join(", ");
}

/**
 * The chosen pair, looked up, or an error naming what does exist.
 *
 * Separate from `themeModule` so a caller can check a selection BEFORE it acts
 * on it. `init` writes four files before it reaches the theme, and a mistyped
 * `--theme` used to leave all four on disk with no `components.json` beside
 * them — a project too far in to `add` to and too far in for `init` to be the
 * first thing you run.
 */
export function resolveTheme(
  choice: ThemeChoice,
  themes: readonly ThemeDefinition[],
): ResolvedTheme {
  const base = themes.find((theme) => theme.name === choice.base && theme.kind === "base");
  if (base === undefined) {
    throw new Error(`no base theme named "${choice.base}". Try one of: ${names(themes, "base")}`);
  }

  const accent =
    choice.accent === undefined
      ? undefined
      : themes.find((theme) => theme.name === choice.accent && theme.kind === "accent");
  if (choice.accent !== undefined && accent === undefined) {
    throw new Error(
      `no accent theme named "${choice.accent}". Try one of: ${names(themes, "accent")}`,
    );
  }

  if (choice.radius !== undefined && !LENGTH.test(choice.radius)) {
    throw new Error(`--radius wants a CSS length, like 0.5rem or 8px, not "${choice.radius}"`);
  }

  return {
    base,
    ...(accent === undefined ? {} : { accent }),
    title: accent === undefined ? base.title : `${base.title} with ${accent.title}`,
  };
}

export function themeModule(
  choice: ThemeChoice,
  themes: readonly ThemeDefinition[],
  options: ThemeModuleOptions,
): string {
  const { base, accent, title } = resolveTheme(choice, themes);

  const light = { ...base.light, ...accent?.light };
  const dark = { ...base.dark, ...accent?.dark };
  const darkSelector = choice.dark ?? ".dark";

  const darkRule =
    darkSelector === "media"
      ? `  @media (prefers-color-scheme: dark) {\n    :root {\n${declarations(dark, undefined, "      ")}\n    }\n  }`
      : `  ${darkSelector} {\n${declarations(dark, undefined, "    ")}\n  }`;

  return `/**
 * The colour theme: ${title}.
 *
 * Written by \`barq-ui init\`, and yours to edit. The barq compiler folds this
 * block into a stylesheet at build time, so nothing here reaches the browser as
 * JavaScript.
 *
 * To change theme, run \`barq-ui theme <name>\` — or edit the values, which is
 * what they are here for.
 */

import { globalCss } from "@barqjs/css";

import ${JSON.stringify(options.base)};
${options.reset ? `import ${JSON.stringify(options.resetPath)};\n` : ""}
globalCss\`
@layer barq.theme {
  :root {
${declarations(light, choice.radius, "    ")}
  }
${darkRule}
}
\`;
`;
}
