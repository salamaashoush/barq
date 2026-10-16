/**
 * A module's compiled CSS, appended to the module itself.
 *
 * The `"inline"` half of the compiler plugin's `cssMode`, exported
 * because the Vite plugin is not the only loader a barq module goes through:
 * `bun test` runs the same native transform with no bundler behind it, and it
 * dropped `result.css` on the floor until this was shared rather than inlined
 * in one caller.
 *
 * Keyed by module id, so re-evaluating the module replaces its rules.
 */
export function cssRegistration(
  id: string,
  css: string,
  cssSource: string = DEFAULT_CSS_SOURCE,
): string {
  return cssRegistrations([[id, css]], cssSource);
}

/**
 * The same, for a module registering SEVERAL stylesheets.
 *
 * One import for all of them, because a module carries its own rules and the
 * rules of everything it folded a value out of, and `cssRegistration` per
 * sheet wrote `import { registerCss as _$registerCss }` twice — which is not a
 * duplicate import a bundler dedupes but a redeclared binding, and the module
 * failed to parse. Every component in `@barqjs/ui` that reaches a shared group
 * is such a module, so dev served the package as a parse error.
 */
export function cssRegistrations(
  sheets: readonly (readonly [string, string])[],
  cssSource: string = DEFAULT_CSS_SOURCE,
): string {
  if (sheets.length === 0) return "";
  return (
    `\nimport { registerCss as _$registerCss } from ${JSON.stringify(cssSource)};\n` +
    sheets
      .map(([id, css]) => `_$registerCss(${JSON.stringify(id)}, ${JSON.stringify(css)});\n`)
      .join("")
  );
}

/** The specifier the compiler resolves `css`/`keyframes`/`globalCss` against. */
export const DEFAULT_CSS_SOURCE = "@barqjs/css";
