/**
 * `css`, `keyframes` and `globalCss`.
 *
 * With the compiler in the build, none of these three functions runs:
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

import { hash, onReset, register } from "./sheet.ts";

/**
 * The public surface, written out rather than re-exported wholesale.
 *
 * `export *` made every helper the two implementations share into API — the
 * hash, the tier table, the shorthand map — and none of it is stable. They are
 * `@barqjs/css/internal` now, and this list is what a consumer may rely on.
 */

// Composing declarations. Each `…In` takes a cascade layer; `layer` binds one
// for all of them at once, which is how a design system writes it.
export {
  atoms,
  atomsIn,
  create,
  createIn,
  defineConditions,
  dynamic,
  dynamicIn,
  firstThatWorks,
  layer,
  mergeStyles,
  props,
  propsIn,
} from "./atoms.ts";
export type {
  AtomConditions,
  AtomInput,
  AtomsFn,
  AtomStyles,
  AtomValue,
  Condition,
  DynamicStyle,
  Fallback,
  Layer,
  PropInput,
  Props,
  PropertyValue,
  VarReference,
} from "./atoms.ts";

// Tokens as custom properties.
export { createTheme, defineVars, globalVars } from "./theme.ts";
export type { ThemeValues, Tokens, TokenValue, Vars } from "./theme.ts";

// A class per combination, over classes that already compiled.
export { variants } from "./variants.ts";
export type {
  SlotClasses,
  SlotFn,
  SlotGroups,
  SlotSpec,
  VariantFn,
  VariantGroups,
  VariantMatch,
  VariantProps,
  VariantSelection,
  VariantSpec,
} from "./variants.ts";

// The one registry, and how a server render reads it.
export { collectCss, registerCss, setCssSink } from "./sheet.ts";
export type { CssSink } from "./sheet.ts";

export type CssValue = string | number | false | null | undefined;

const compiled = new Map<string, string>();
const animations = new Map<string, string>();

onReset(() => {
  compiled.clear();
  animations.clear();
});

/**
 * An interpolation that changes every render is a new source every render, so
 * a memo of sources is emptied before it outgrows any stylesheet a person
 * wrote. The name is a hash of the source, so forgetting one costs a hash.
 */
function remember(memo: Map<string, string>, source: string, name: string): void {
  if (memo.size >= 10_000) memo.clear();
  memo.set(source, name);
}

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
    // `globalCss` starts with no scope, and a declaration outside any rule
    // there has no selector to be written under.
    if (pending.length > 0 && scope !== "") {
      out.push(`${open}${scope}{${pending.join(";")}}${close}`);
    }
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
    if (head.startsWith("@")) {
      // A STATEMENT at-rule — `@layer a, b;`, `@import`, `@charset`. It ends in
      // a `;` like a declaration and is not one: wrapped in the scope's braces
      // it becomes `{@layer a, b}`, which no browser reads. The compiler emits
      // it beside the rule, so the runtime has to as well or a block behaves
      // one way under `bun test` and another once built.
      flush();
      out.push(`${open}${head};${close}`);
    } else if (head !== "") {
      pending.push(head);
    }
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
  remember(compiled, source, name);
  register(name, rules.join(""));
  return name;
}

/** A `@keyframes` body, as the animation name to reference it by. */
export function keyframes(strings: TemplateStringsArray, ...values: CssValue[]): string {
  const source = join(strings, values);
  const cached = animations.get(source);
  if (cached !== undefined) return cached;
  const name = hash(source);
  remember(animations, source, name);
  // Keyed apart from a block: the two are named by the same hash, so the same
  // text as a `css` block is the same name and would replace that block's rule.
  register(`@keyframes ${name}`, `@keyframes ${name}{${source.trim()}}`);
  return name;
}

/** Whole rules, scoped to nothing. */
export function globalCss(strings: TemplateStringsArray, ...values: CssValue[]): void {
  const source = join(strings, values);
  const rules: string[] = [];
  emit(source, "", [], rules);
  register(`g${hash(source)}`, rules.join(""));
}
