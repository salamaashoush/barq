/**
 * Design tokens, as CSS custom properties.
 *
 * Custom properties are the one part of a styling system that does not want
 * compiling: they resolve in the browser, cascade, and can be overridden per
 * subtree without producing a second copy of anything. So `defineVars` does not
 * compile a value — it names one, and hands back the `var()` references.
 *
 * That is also what makes it cross-module safe. The returned object is plain
 * strings, so a component in another file reads DATA rather than asking the
 * compiler to resolve an import — which is the machinery behind StyleX's Vite
 * dev path diverging from its build, and behind the cross-module aggregation
 * this project already rejected on its own measurement.
 */

import { hash, register } from "./sheet.ts";

export type TokenValue = string | number;

/** The `var()` reference for each token, and its custom-property name. */
export type Vars<T> = { readonly [K in keyof T]: string };

function propertyName(group: string, token: string): string {
  return `--${token.replace(/[^\w-]/g, "-")}-${group}`;
}

/**
 * Tokens, declared on `:root`.
 *
 * The group suffix is a hash of the whole object, so two files declaring the
 * same tokens share them and two declaring a `brand` that differs do not
 * collide. Nothing here needs to know the file it is in.
 */
export function defineVars<T extends Record<string, TokenValue>>(tokens: T): Vars<T> {
  const group = hash(JSON.stringify(tokens)).slice(1);
  const declarations: string[] = [];
  const out: Record<string, string> = {};
  for (const [token, value] of Object.entries(tokens)) {
    const property = propertyName(group, token);
    declarations.push(`${property}:${String(value)}`);
    out[token] = `var(${property})`;
  }
  register(`vars:${group}`, `:root{${declarations.join(";")}}`);
  return out as Vars<T>;
}

/**
 * A class that redeclares some of a token set.
 *
 * Put it on any element and the subtree below reads the new values, because
 * that is what a custom property does. No component has to be re-rendered and
 * no second copy of any rule is produced.
 */
export function createTheme<T extends Record<string, string>>(
  vars: T,
  values: Partial<Record<keyof T, TokenValue>>,
): string {
  const declarations: string[] = [];
  for (const [token, value] of Object.entries(values)) {
    if (value === undefined) continue;
    // The property name is already in the reference the token set handed back,
    // so a theme needs nothing from the call that produced it.
    const property = /^var\((--[^,)]+)/.exec(vars[token] ?? "")?.[1];
    if (property === undefined) continue;
    declarations.push(`${property}:${String(value)}`);
  }
  const declaration = declarations.join(";");
  const name = hash(declaration);
  register(name, `.${name}{${declaration}}`);
  return name;
}
