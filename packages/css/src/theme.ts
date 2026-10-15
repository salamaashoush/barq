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

/** A token set: values, and groups of values to any depth. */
export type Tokens = { readonly [name: string]: TokenValue | Tokens };

/** The `var()` reference for each token, in the shape the tokens were given. */
export type Vars<T> = {
  readonly [K in keyof T]: T[K] extends TokenValue ? string : Vars<T[K]>;
};

/** Some of a token set's values, in the shape {@link Vars} has. */
export type ThemeValues<T> = {
  readonly [K in keyof T]?: T[K] extends string ? TokenValue : ThemeValues<T[K]>;
};

/**
 * Letters and digits of any script are kept, which is what the compiler keeps:
 * a token named `größe` is one property whichever of the two names it.
 */
function safe(token: string): string {
  return token.replace(/[^\p{Alphabetic}\p{N}_-]/gu, "-");
}

function propertyName(group: string, token: string): string {
  return `--${safe(token)}-${group}`;
}

/**
 * Every token as a declaration and a reference. A group's tokens are named by
 * their path, so `{ color: { brand } }` is `--color-brand`.
 */
function declare(
  tokens: Tokens,
  name: (path: string) => string,
  declarations: string[],
  prefix = "",
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [token, value] of Object.entries(tokens)) {
    const path = prefix === "" ? token : `${prefix}-${token}`;
    if (typeof value === "object") {
      out[token] = declare(value, name, declarations, path);
      continue;
    }
    const property = name(path);
    declarations.push(`${property}:${String(value)}`);
    out[token] = `var(${property})`;
  }
  return out;
}

/**
 * Tokens, declared on `:root`.
 *
 * The group suffix is a hash of the whole object, so two files declaring the
 * same tokens share them and two declaring a `brand` that differs do not
 * collide. Nothing here needs to know the file it is in.
 */
export function defineVars<T extends Tokens>(tokens: T): Vars<T> {
  const group = hash(JSON.stringify(tokens)).slice(1);
  const declarations: string[] = [];
  const out = declare(tokens, (path) => propertyName(group, path), declarations);
  register(`vars:${group}`, `:root{${declarations.join(";")}}`);
  return out as Vars<T>;
}

/**
 * Tokens on `:root` under the names you gave them, unhashed.
 *
 * {@link defineVars} suffixes each property with a hash of the whole token
 * object, which is what lets two files declare the same tokens without
 * colliding — and what makes the set a CLOSED system: nothing outside can
 * write `--brand` and be heard. A design system wants the opposite. Its tokens
 * are a published contract, an application brings its own `:root { --primary:
 * … }`, and a theme copied out of a generator has to land on the components
 * without being rewritten.
 *
 * So this is to {@link defineVars} what `globalCss` is to `css`: the same
 * declaration, under the name you wrote rather than one this package chose.
 *
 * ```ts
 * export const tokens = globalVars({ primary: "#3b82f6", radius: "8px" });
 * // :root{--primary:#3b82f6;--radius:8px}
 * // { primary: "var(--primary)", radius: "var(--radius)" }
 * ```
 *
 * Use {@link defineVars} when the tokens are yours alone and a collision would
 * be a bug; use this when the names are the point.
 */
export function globalVars<T extends Tokens>(tokens: T): Vars<T> {
  const declarations: string[] = [];
  const names: string[] = [];
  const out = declare(
    tokens,
    (path) => {
      names.push(path);
      return `--${safe(path)}`;
    },
    declarations,
  );
  // Keyed by the NAMES, so declaring the same set twice replaces it rather
  // than stacking two `:root` blocks that disagree.
  register(`vars:${hash(names.join(","))}`, `:root{${declarations.join(";")}}`);
  return out as Vars<T>;
}

/**
 * A class that redeclares some of a token set.
 *
 * Put it on any element and the subtree below reads the new values, because
 * that is what a custom property does. No component has to be re-rendered and
 * no second copy of any rule is produced.
 */
export function createTheme<T extends Vars<Tokens>>(vars: T, values: ThemeValues<T>): string {
  const declarations: string[] = [];
  redeclare(vars, values, declarations);
  const declaration = declarations.join(";");
  const name = hash(declaration);
  register(name, `.${name}{${declaration}}`);
  return name;
}

type ValueTree = { readonly [token: string]: TokenValue | ValueTree | undefined };

function redeclare(vars: Record<string, unknown>, values: ValueTree, declarations: string[]): void {
  for (const [token, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const reference = vars[token];
    if (typeof value === "object") {
      if (typeof reference === "object" && reference !== null) {
        redeclare(reference as Record<string, unknown>, value, declarations);
      }
      continue;
    }
    // The property name is already in the reference the token set handed back,
    // so a theme needs nothing from the call that produced it.
    const property = /^var\((--[^,)]+)/.exec(typeof reference === "string" ? reference : "")?.[1];
    if (property === undefined) continue;
    declarations.push(`${property}:${String(value)}`);
  }
}
