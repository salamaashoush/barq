/**
 * `css`, `keyframes` and `globalCss`.
 *
 * With `@barqjs/compiler` in the build, none of these three functions runs:
 * the compiler resolves the tag by symbol, replaces the whole tagged template
 * with the class name it produced, and hands the CSS to the bundler. A block
 * used as `class={card}` on an intrinsic element is then folded into the
 * template markup, so the element carries no class channel either.
 *
 * What is left here is the escape hatch, and it earns its bytes twice: a block
 * the compiler declined (BARQ015 says which and why) still has to work, and so
 * does a component imported into `bun test` with no build in front of it.
 *
 * Runtime classes are prefixed `r`, compiled ones `b`. They are deliberately
 * not the same namespace: seeing `r` in devtools is how you find a block that
 * did not compile.
 */

import { hash, register } from "./sheet.ts";

export { collectCss, registerCss, setCssSink } from "./sheet.ts";
export * from "./atoms.ts";
export * from "./theme.ts";
export * from "./variants.ts";

export type CssValue = string | number | false | null | undefined;

export type ClassValue =
  | string
  | number
  | false
  | null
  | undefined
  | ClassValue[]
  | Record<string, unknown>;

const compiled = new Map<string, string>();

/**
 * The next `;`, `{` or `}` that is not inside a string, a comment, or brackets.
 *
 * Brackets are why this is a scanner rather than a `split`: `url(a;b)` and
 * `:is(a, b)` both carry a delimiter that ends nothing.
 */
function scan(source: string, from: number): { end: number; found: string } {
  let depth = 0;
  for (let index = from; index < source.length; index++) {
    const character = source[index];
    if (character === "\\") {
      index++;
    } else if (character === '"' || character === "'") {
      const quote = character;
      index++;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === "\\") index++;
        index++;
      }
    } else if (character === "/" && source[index + 1] === "*") {
      const close = source.indexOf("*/", index + 2);
      if (close < 0) return { end: source.length, found: "" };
      index = close + 1;
    } else if (character === "(" || character === "[") {
      depth++;
    } else if (character === ")" || character === "]") {
      depth--;
    } else if (depth === 0 && (character === ";" || character === "{" || character === "}")) {
      return { end: index, found: character };
    }
  }
  return { end: source.length, found: "" };
}

function closingBrace(source: string, open: number): number {
  let index = open + 1;
  let depth = 1;
  while (index < source.length && depth > 0) {
    const { end, found } = scan(source, index);
    if (found === "{") depth++;
    else if (found === "}") depth--;
    else if (found === "") return source.length;
    index = end + 1;
  }
  return index - 1;
}

/** Comma-split that respects brackets, so `:is(a, b)` stays one selector. */
function parts(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < list.length; index++) {
    const character = list[index];
    if (character === "(" || character === "[") depth++;
    else if (character === ")" || character === "]") depth--;
    else if (character === "," && depth === 0) {
      out.push(list.slice(start, index));
      start = index + 1;
    }
  }
  out.push(list.slice(start));
  return out.map((part) => part.trim()).filter(Boolean);
}

/** Every parent against every child: `&` takes the parent, anything else is a descendant. */
function cross(parent: string, selectors: string): string {
  // `globalCss` starts with no parent, and a rule there is its own selector.
  if (parent === "") return parts(selectors).join(",");
  const out: string[] = [];
  for (const outer of parts(parent)) {
    for (const inner of parts(selectors)) {
      out.push(inner.includes("&") ? inner.replaceAll("&", outer) : `${outer} ${inner}`);
    }
  }
  return out.join(",");
}

/** At-rules whose block still applies to the enclosing selector. */
const GROUPS = new Set([
  "media",
  "supports",
  "container",
  "layer",
  "scope",
  "starting-style",
  "document",
]);

function emit(source: string, scope: string, conditions: string[], out: string[]): void {
  const open = conditions.map((condition) => `${condition}{`).join("");
  const close = "}".repeat(conditions.length);
  let pending: string[] = [];
  const flush = (): void => {
    if (pending.length === 0) return;
    out.push(`${open}${scope}{${pending.join(";")}}${close}`);
    pending = [];
  };

  let index = 0;
  while (index < source.length) {
    const { end, found } = scan(source, index);
    const head = source.slice(index, end).trim();
    if (found === "{") {
      const stop = closingBrace(source, end);
      const body = source.slice(end + 1, stop);
      flush();
      if (head.startsWith("@")) {
        const name = head
          .slice(1)
          .split(/[\s({]/, 1)[0]
          .toLowerCase();
        if (GROUPS.has(name)) emit(body, scope, [...conditions, head], out);
        else out.push(`${open}${head}{${body.trim()}}${close}`);
      } else {
        emit(body, cross(scope, head), conditions, out);
      }
      index = stop + 1;
      continue;
    }
    if (head !== "") pending.push(head);
    index = end + 1;
    if (found === "}" || found === "") break;
  }
  flush();
}

function join(strings: TemplateStringsArray, values: CssValue[]): string {
  let out = strings[0] ?? "";
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    out +=
      (value === false || value === null || value === undefined ? "" : String(value)) +
      (strings[index + 1] ?? "");
  }
  return out;
}

/** A block of nested CSS, as a class name. */
export function css(strings: TemplateStringsArray, ...values: CssValue[]): string {
  const source = join(strings, values);
  const cached = compiled.get(source);
  if (cached !== undefined) return cached;
  const name = hash(source);
  const rules: string[] = [];
  emit(source, `.${name}`, [], rules);
  compiled.set(source, name);
  register(name, rules.join(""));
  return name;
}

/** A `@keyframes` body, as the animation name to reference it by. */
export function keyframes(strings: TemplateStringsArray, ...values: CssValue[]): string {
  const source = join(strings, values);
  const cached = compiled.get(source);
  if (cached !== undefined) return cached;
  const name = hash(source);
  compiled.set(source, name);
  register(name, `@keyframes ${name}{${source.trim()}}`);
  return name;
}

/** Whole rules, scoped to nothing. */
export function globalCss(strings: TemplateStringsArray, ...values: CssValue[]): void {
  const source = join(strings, values);
  const rules: string[] = [];
  emit(source, "", [], rules);
  register(`g${hash(source)}`, rules.join(""));
}

/** `var(--name)`, or `var(--name, fallback)`. */
export function cssVar(name: string, fallback?: string): string {
  const property = name.startsWith("--") ? name : `--${name}`;
  return fallback === undefined ? `var(${property})` : `var(${property}, ${fallback})`;
}

/** Class names from strings, arrays and `{ name: on }` maps. */
export function clsx(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const input of inputs) {
    if (input === false || input === null || input === undefined || input === "") continue;
    if (typeof input === "string" || typeof input === "number") {
      out.push(String(input));
    } else if (Array.isArray(input)) {
      const nested = clsx(...input);
      if (nested !== "") out.push(nested);
    } else {
      for (const [name, on] of Object.entries(input)) if (on) out.push(name);
    }
  }
  return out.join(" ");
}
