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

function declarations(tokens: ThemeTokens, radius: string | undefined, indent: string): string {
  const out = Object.entries(tokens).map(([token, value]) => `${indent}--${token}: ${value};`);
  if (radius !== undefined) out.push(`${indent}--radius: ${radius};`);
  return out.join("\n");
}

export interface ThemeModuleOptions {
  /** Whether the reset was written beside it. */
  readonly reset: boolean;
  /** How this file reaches `base.ts`, which is written beside it. */
  readonly base: string;
  /** How it reaches `reset.ts`. */
  readonly resetPath: string;
}

export function themeModule(
  choice: ThemeChoice,
  themes: readonly ThemeDefinition[],
  options: ThemeModuleOptions,
): string {
  const base = themes.find((theme) => theme.name === choice.base);
  if (base === undefined) throw new Error(`no theme named "${choice.base}"`);

  const accent =
    choice.accent === undefined ? undefined : themes.find((theme) => theme.name === choice.accent);
  if (choice.accent !== undefined && accent === undefined) {
    throw new Error(`no accent theme named "${choice.accent}"`);
  }

  const light = { ...base.light, ...accent?.light };
  const dark = { ...base.dark, ...accent?.dark };
  const darkSelector = choice.dark ?? ".dark";

  const darkRule =
    darkSelector === "media"
      ? `  @media (prefers-color-scheme: dark) {\n    :root {\n${declarations(dark, undefined, "      ")}\n    }\n  }`
      : `  ${darkSelector} {\n${declarations(dark, undefined, "    ")}\n  }`;

  const title = accent === undefined ? base.title : `${base.title} with ${accent.title}`;

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
