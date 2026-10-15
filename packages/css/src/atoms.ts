/**
 * One class per declaration, merged by property.
 *
 * Concatenating classes composes BLOCKS, and which one wins is then decided by
 * the order they were written in the stylesheet — not by the order they were
 * passed. That is the bug every design system hits at scale: a `variant` that
 * loses to its own `base` because a bundler put them the other way round. It is
 * why there is no `clsx` here: one way to compose, and it answers the question.
 *
 * An atom is one property, so "which wins" is answerable without the cascade:
 * the class carries its property in its own name (`a-color_1n4k2p0`), and
 * merging keeps the last class per key. Passing order decides, always.
 *
 * The compiler recognises `atoms` on object literals and does all of this at
 * build time; this is the same semantics for the values it cannot know.
 */

import type * as CSS from "csstype";

import { DISPLACES, SHORTHANDS, expand } from "./shorthands.ts";
import { hash, hold, onReset, register, registerAtom, release } from "./sheet.ts";

export type AtomValue = string | number | false | null | undefined | Fallback;

/** What `firstThatWorks` returns: the declaration repeated, best last. */
export interface Fallback {
  readonly $fallback: readonly (string | number)[];
}

/**
 * Values in order of preference, emitted as the same declaration repeated.
 *
 * CSS's own fallback mechanism: a browser keeps the last declaration it
 * understands, so preference order is the REVERSE of source order. Writing that
 * by hand is the mistake this removes.
 */
export function firstThatWorks(...values: (string | number)[]): Fallback {
  return { $fallback: values };
}

function isFallback(value: unknown): value is Fallback {
  return typeof value === "object" && value !== null && "$fallback" in value;
}

/** A condition path, joined. `@media …` outside, `:hover` inside. */
export const NEST = "\u0000";

/** What a key has to look like to be read as a condition rather than a property. */
export type Condition =
  | `:${string}`
  | `@${string}`
  | `&${string}`
  | `[${string}`
  | `${string}&${string}`;

/**
 * Conditions, named once.
 *
 * A breakpoint or a theme selector is written in every component that uses
 * it, and one of them spelled `min-width:768px` is a second condition with a
 * second hash and its own place in the media tier. Named, there is one
 * spelling:
 *
 * ```ts
 * export const when = defineConditions({
 *   md: "@media (min-width: 768px)",
 *   dark: "[data-theme=dark] &",
 * });
 *
 * atoms({ padding: { default: 4, [when.md]: 8 }, [when.dark]: { color: "white" } });
 * ```
 *
 * The object comes back as it went in, so a name is the condition's own text
 * and a computed key is the same key written out: same class, same rule. The
 * compiler reads the literal where it is declared, and through an import the
 * way it reads a `create` group through one.
 */
export function defineConditions<const T extends Readonly<Record<string, Condition>>>(
  conditions: T,
): T {
  for (const name in conditions) {
    const condition: unknown = conditions[name];
    if (typeof condition !== "string" || !looksLikeCondition(condition)) {
      throw new TypeError(
        `[barq] \`${name}\` is not a condition: its value \`${String(condition)}\` does not start with ` +
          "`:`, `@`, `&` or `[` and holds no `&`. Used as a key in `atoms`, it would be read as a CSS property and the styles under it would never apply. " +
          'Write the condition in full, such as `"@media (min-width: 768px)"` or `":hover"`.',
      );
    }
  }
  return conditions;
}

function looksLikeCondition(name: string): boolean {
  return (
    name.startsWith(":") ||
    name.startsWith("@") ||
    name.startsWith("&") ||
    name.startsWith("[") ||
    // `a&:hover` — an anchor that is also this element. `rule` substitutes `&`
    // wherever it appears, so a selector is not obliged to lead with it, and a
    // property name never contains one.
    name.includes("&")
  );
}

/**
 * A value per condition. `default` is the unconditional one; every other key is
 * a selector suffix (`:hover`, `[data-open]`), a nested selector containing
 * `&`, or an at-rule (`@media (min-width: 600px)`).
 *
 * Any other key is a type error rather than a condition: `defualt` would be
 * read as a descendant selector and style an element named `defualt`.
 */
export type AtomConditions<V = AtomValue> = {
  readonly default?: V | AtomConditions<V>;
} & { readonly [K in Condition]?: V | AtomConditions<V> };

/** A custom property's reference, which every property takes. */
export type VarReference = `var(--${string})`;

/**
 * What one property takes: its own values as `csstype` spells them, a length
 * as a bare number where the property has lengths, and a `var()` anywhere.
 */
export type PropertyValue<P extends keyof CSS.Properties> =
  | CSS.Properties<string | number>[P]
  | VarReference
  | Fallback
  | false
  | null
  | undefined;

/**
 * Declarations, conditions, and conditions holding declarations.
 *
 * The four template-literal keys are what makes `"::placeholder": { … }` and
 * `"@media …": { … }` type-check at the top level: a condition key holds a
 * whole style object, where a property key holds a value or a value per
 * condition.
 */
export type AtomStyles = {
  readonly [K in keyof CSS.Properties]?: PropertyValue<K> | AtomConditions<PropertyValue<K>>;
} & {
  /**
   * A custom property, and a vendor-prefixed one written the way CSS writes
   * it. `WebkitUserSelect` is the same declaration: a leading capital, or a
   * leading `ms`, is a vendor prefix and gets its dash back.
   */
  readonly [key: `-${string}`]: AtomValue | AtomConditions;
} & {
  readonly [key: `:${string}`]: AtomStyles | undefined;
  readonly [key: `@${string}`]: AtomStyles | undefined;
  readonly [key: `&${string}`]: AtomStyles | undefined;
  readonly [key: `[${string}`]: AtomStyles | undefined;
  readonly [key: `${string}&${string}`]: AtomStyles | undefined;
};

/** Properties whose bare number is a count, not a length. */
export const UNITLESS: Set<string> = new Set([
  "-webkit-box-flex",
  "-webkit-box-ordinal-group",
  "-webkit-line-clamp",
  "animation-iteration-count",
  "aspect-ratio",
  "border-image-outset",
  "border-image-slice",
  "border-image-width",
  "box-flex",
  "box-flex-group",
  "box-ordinal-group",
  "column-count",
  "columns",
  "fill-opacity",
  "flex",
  "flex-grow",
  "flex-shrink",
  "flood-opacity",
  "font-size-adjust",
  "font-weight",
  "grid-area",
  "grid-column",
  "grid-column-end",
  "grid-column-start",
  "grid-row",
  "grid-row-end",
  "grid-row-start",
  "hyphenate-limit-chars",
  "initial-letter",
  "line-clamp",
  "line-height",
  "mask-border-outset",
  "mask-border-slice",
  "mask-border-width",
  "math-depth",
  "max-lines",
  "opacity",
  "order",
  "orphans",
  "scale",
  "shape-image-threshold",
  "stop-opacity",
  "stroke-miterlimit",
  "stroke-opacity",
  "tab-size",
  "widows",
  "z-index",
  "zoom",
]);

const kebabbed = new Map<string, string>();

/**
 * Memoised over an alphabet of maybe forty property names in a whole
 * application. A custom property is returned as written and never held: its
 * name can be computed, and a map keyed on computed names only grows.
 *
 * Every capital gets a dash, including a leading one, so `WebkitLineClamp` is
 * `-webkit-line-clamp`. `ms` is the one prefix written in lower case.
 */
export function kebab(property: string): string {
  if (property.startsWith("--")) return property;
  const hit = kebabbed.get(property);
  if (hit !== undefined) return hit;
  const dashed = property.replace(/[A-Z]/g, "-$&").toLowerCase();
  const out = dashed.startsWith("ms-") ? `-${dashed}` : dashed;
  kebabbed.set(property, out);
  return out;
}

/**
 * A custom property's number is written as given: nothing here knows what
 * reads `--columns`, and `4px` in a `repeat()` is not a count.
 */
function cssValue(property: string, value: string | number): string {
  if (typeof value !== "number" || value === 0) return String(value);
  return property.startsWith("--") || UNITLESS.has(property) ? String(value) : `${value}px`;
}

/** The index of the quote closing the string that opens at `open`, or `-1`. */
function stringEnd(value: string, open: number): number {
  for (let index = open + 1; index < value.length; index++) {
    const character = value[index];
    if (character === "\\") index++;
    else if (character === value[open]) return index;
    else if (character === "\n") return -1;
  }
  return -1;
}

/**
 * Whether a value stays inside the declaration it is written into.
 *
 * A value reaches the sheet as text, and one that closes a brace it did not
 * open ends the rule and starts another: `red;} body{display:none` is a
 * stylesheet, not a colour. Every value the runtime sees is one the compiler
 * could not read, which is exactly the set that may have come from a URL or a
 * form. The one `;` allowed is the one {@link firstThatWorks} writes, between
 * two declarations of the same property.
 */
function contained(property: string, value: string): boolean {
  let nested = 0;
  let braces = 0;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character === "\\") {
      if (++index >= value.length) return false;
    } else if (character === '"' || character === "'") {
      index = stringEnd(value, index);
      if (index < 0) return false;
    } else if (character === "/" && value[index + 1] === "*") {
      index = value.indexOf("*/", index + 2);
      if (index < 0) return false;
      index++;
    } else if (character === "(" || character === "[") nested++;
    else if (character === ")" || character === "]") {
      if (--nested < 0) return false;
    } else if (character === "{") braces++;
    else if (character === "}") {
      if (--braces < 0) return false;
    } else if (character === ";" && nested === 0 && braces === 0) {
      if (!value.startsWith(`${property}:`, index + 1)) return false;
      index += property.length + 1;
    }
  }
  return nested === 0 && braces === 0;
}

/**
 * The merge key: everything a second declaration has to replace.
 *
 * In the class name, not in a lookup table beside it. A table would have to be
 * shipped, kept in step with the compiler's copy, and consulted per class;
 * the name is already there and both sides can read it with a `lastIndexOf`.
 */
function key(className: string): string {
  return className.slice(0, className.lastIndexOf("_"));
}

/** `a-color_1n4k2p0`, and not `my-button`. */
function atomic(className: string): boolean {
  return className.startsWith("a-") && className.includes("_");
}

/** `a-margin-top`, `a-color--hover-1x2y3z`, `a-var-brand`. */
function atomKey(property: string, condition: string): string {
  const name = property.startsWith("--") ? `var-${property.slice(2)}` : property;
  return condition === "default" ? `a-${name}` : `a-${name}-${hash(condition).slice(1)}`;
}

/**
 * The tier order, from the module that owns the sheet. Re-exported because a
 * tier is an ATOM's fact and `atoms.ts` is where a reader looks for it; it
 * lives beside `register` because `sheet.ts` cannot import from here without a
 * cycle.
 */
export { TIERS } from "./sheet.ts";

/**
 * A selector list, split at the commas that separate its branches.
 *
 * Depth-aware, because `:is(a, b)` and `:not(a, b)` both carry a comma that
 * separates nothing.
 */
function branches(part: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < part.length; index++) {
    const character = part[index];
    if (character === "(" || character === "[") depth++;
    else if (character === ")" || character === "]") depth--;
    else if (character === "," && depth === 0) {
      out.push(part.slice(start, index).trim());
      start = index + 1;
    }
  }
  out.push(part.slice(start).trim());
  return out;
}

/**
 * One branch of a condition, applied to one selector built so far.
 *
 * EVERY branch of a list gets the treatment, and that is why this is a function
 * rather than one `replaceAll`. `"[data-expanded], &[data-open]"` used to be
 * substituted as a single string: the `&` in the second branch matched, so the
 * first was left as a bare `[data-expanded]` and the rule painted every element
 * on the page carrying that attribute. Measured in a browser on `@barqjs/ui`'s
 * menubar, where it took an accordion trigger's background three sections away.
 */
function extend(selector: string, branch: string): string {
  return branch.includes("&")
    ? branch.replaceAll("&", selector)
    : branch.startsWith(":") || branch.startsWith("[")
      ? `${selector}${branch}`
      : `${selector} ${branch}`;
}

/** The selectors a condition's non-at-rule parts build from `seed`. */
function selectorsOf(condition: string, seed: string): string[] {
  let out = [seed];
  for (const part of condition.split(NEST)) {
    if (part.startsWith("@")) continue;
    out = out.flatMap((selector) => branches(part).map((branch) => extend(selector, branch)));
  }
  return out;
}

/**
 * Whether a condition's subject is this element, or something under it.
 *
 * A list is about a descendant when ANY of its branches is: the rule reaches
 * something under the element, whatever the rest of it does.
 */
function aboutSelf(condition: string): boolean {
  return selectorsOf(condition, "&").every((selector) => {
    // Whatever follows the last `&` at bracket depth zero: a combinator there
    // means the rule is about another element.
    const at = selector.lastIndexOf("&");
    let depth = 0;
    for (let index = at + 1; index < selector.length; index++) {
      const character = selector[index];
      if (character === "(" || character === "[") depth++;
      else if (character === ")" || character === "]") depth--;
      else if (
        depth === 0 &&
        (character === " " || character === ">" || character === "+" || character === "~")
      ) {
        return false;
      }
    }
    return true;
  });
}

export function tierOf(condition: string): number {
  if (condition === "default") return 1;
  const parts = condition.split(NEST);
  if (!aboutSelf(condition)) return 0;
  if (parts.some((part) => part.startsWith("@"))) return 4;
  if (parts.some((part) => part.includes("::"))) return 3;
  return 2;
}

/**
 * `:hover` appends, `&` substitutes, `@media` wraps, anything else is a
 * descendant — the same four cases the nested-block flattener has, because a
 * condition here is a nested selector written on one line.
 */
function rule(name: string, condition: string, declaration: string, into = ""): string {
  const parts = condition === "default" ? [] : condition.split(NEST);
  // At-rules wrap from the outside in; the selector parts all apply to the one
  // class, so they concatenate.
  const wraps = parts.filter((part) => part.startsWith("@"));
  let inner = condition === "default" ? `.${name}` : selectorsOf(condition, `.${name}`).join(",");
  inner = `${inner}{${declaration}}`;
  for (const wrap of wraps.toReversed()) inner = `${wrap}{${inner}}`;
  return into === "" ? inner : `@layer ${into}{${inner}}`;
}

function atom(property: string, condition: string, value: string, into: string): string {
  // The suffix hashes the VALUE, and nothing else. The key already carries the
  // property and the condition, so the value is all that is left to tell two
  // atoms of one key apart — and hashing it alone means every atom holding that
  // value ends in the same token. A shorthand expands to four longhands over
  // one value, and a compressor reads three of the four suffixes as
  // back-references instead of as noise. Measured over `@barqjs/ui`'s
  // stylesheet, 1,078 atoms: 16.2 KB brotli down to 13.1.
  //
  // The layer belongs to the atom's identity: the same declaration in and out
  // of a layer is two different rules, and one class name cannot carry both.
  const name = `${atomKey(property, condition)}_${hash(into === "" ? value : `${into}|${value}`).slice(1)}`;
  registerAtom(name, rule(name, condition, `${property}:${value}`, into), tierOf(condition));
  return name;
}

const NONE: readonly string[] = [];

let displacements = new Map<string, readonly string[]>();

/**
 * The keys a class takes the place of besides its own: the same axis written
 * the other way, under the same condition.
 *
 * Read off the key, as the merge itself is, so a class string another call
 * produced displaces exactly as the object that made it would have. A key is
 * its property and then, under a condition, a dash and that condition's hash,
 * so a key that is not a property outright is tried without its last segment.
 */
function displaced(mergeKey: string): readonly string[] {
  const hit = displacements.get(mergeKey);
  if (hit !== undefined) return hit;
  const name = mergeKey.slice(2);
  let others = DISPLACES.get(name);
  let suffix = "";
  if (others === undefined) {
    const cut = name.lastIndexOf("-");
    others = cut < 0 ? undefined : DISPLACES.get(name.slice(0, cut));
    suffix = cut < 0 ? "" : name.slice(cut);
  }
  const out = others === undefined ? NONE : others.map((other) => `a-${other}${suffix}`);
  if (displacements.size >= HELD_LIMIT) displacements = new Map();
  displacements.set(mergeKey, out);
  return out;
}

/** A name with the keys it displaces in front of it, each paired with `""`. */
function place(out: string[], name: string): void {
  const own = key(name);
  for (const other of displaced(own)) out.push(other, "");
  out.push(own, name);
}

/**
 * One declaration as the atoms it is: `key, class, key, class, …`, where an
 * empty class takes the key out instead of setting it.
 */
type Resolved = readonly string[];

type Scope = Map<string, Map<string | number, Resolved>>;

/**
 * layer -> condition -> property as written -> value as written -> its atoms.
 *
 * A component re-rendering hands `atoms` a FRESH object every time, so there is
 * nothing to memoise on identity — but the declarations inside it repeat, and
 * they are what costs: a shorthand to expand, a hash and a sheet write each.
 * Keyed on strings the caller already holds, a re-render is two lookups a
 * declaration and builds no string to look anything up by.
 */
let resolved = new Map<string, Map<string, Scope>>();
let held = 0;

/**
 * A value that changes every frame is a new entry every frame, so the memo is
 * dropped whole when it has grown past anything a stylesheet written by hand
 * reaches. Nothing is lost but the lookups: a class name is a function of its
 * declaration, and registering a rule the sheet holds is a no-op.
 */
const HELD_LIMIT = 10_000;

function scopeOf(into: string, condition: string): Scope {
  let conditions = resolved.get(into);
  if (conditions === undefined) {
    conditions = new Map();
    resolved.set(into, conditions);
  }
  let scope = conditions.get(condition);
  if (scope === undefined) {
    scope = new Map();
    conditions.set(condition, scope);
  }
  return scope;
}

function resolve(
  into: string,
  condition: string,
  property: string,
  value: string | number,
): Resolved {
  if (typeof value === "number" && !Number.isFinite(value)) return [];
  const text = cssValue(property, value);
  if (!contained(property, text)) return [];
  const expanded = expand(property, text);
  const out: string[] = [];
  if (expanded === null) {
    place(out, atom(property, condition, text, into));
    return out;
  }
  for (const [longhand, own] of expanded) place(out, atom(longhand, condition, own, into));
  return out;
}

function assign(applied: Map<string, string>, found: Resolved): void {
  for (let index = 0; index < found.length; index += 2) {
    const name = found[index + 1];
    if (name === "") applied.delete(found[index]);
    else applied.set(found[index], name);
  }
}

/**
 * One declaration, applied: a later one replaces an earlier one per key.
 *
 * `rawKey` is the property as the caller wrote it, which is what the memo is
 * keyed on, so the common case never reaches `kebab` either.
 */
function apply(
  applied: Map<string, string>,
  scope: Scope,
  into: string,
  condition: string,
  rawKey: string,
  value: string | number,
): void {
  let values = scope.get(rawKey);
  if (values === undefined) {
    values = new Map();
    scope.set(rawKey, values);
  }
  let found = values.get(value);
  if (found === undefined) {
    found = resolve(into, condition, kebab(rawKey), value);
    if (++held > HELD_LIMIT) {
      resolved = new Map();
      held = 0;
    } else {
      values.set(value, found);
    }
  }
  assign(applied, found);
}

/**
 * `null` REMOVES what an earlier argument applied, where `false` and
 * `undefined` only decline to add.
 *
 * StyleX's rule, and the reason it is a rule: `props(base, { color: null })` is
 * how a component says "whatever you set, not this", and skipping the value
 * would silently keep the base's. `undefined` is left as skip-only because it
 * is what an absent optional produces, and removing on it would make
 * `{ color: props.color }` erase the base by accident.
 */
function remove(applied: Map<string, string>, property: string, condition: string): void {
  const expanded = expand(property, "0");
  const names = expanded === null ? [property] : expanded.map(([longhand]) => longhand);
  // `atomKey`, not `atom`: the key is all a removal needs, and going through
  // `atom` would REGISTER the rule it is about to drop — measured as a stray
  // `.a-color_10y4afp{color:0}` in the sheet for every `color: null`.
  for (const name of names) applied.delete(atomKey(name, condition));
}

/** `{ ":hover": { … } }` and `{ color: { ":hover": … } }` alike, flattened. */
function walk(
  applied: Map<string, string>,
  style: Record<string, unknown>,
  condition: string,
  into: string,
): void {
  const scope = scopeOf(into, condition);
  for (const rawKey in style) {
    const raw = style[rawKey];
    if (typeof raw === "string" || typeof raw === "number") {
      // A key the memo already holds was a property the first time, so only a
      // key seen for the first time is asked what it is.
      if (!scope.has(rawKey) && looksLikeCondition(rawKey)) continue;
      apply(applied, scope, into, condition, rawKey, raw);
      continue;
    }
    if (typeof raw !== "object") continue;
    // A top-level condition key holds a whole style object: `'::placeholder'`,
    // `'@media …'`, `'&:hover .x'`.
    if (looksLikeCondition(rawKey)) {
      if (raw !== null)
        walk(applied, raw as Record<string, unknown>, join(condition, rawKey), into);
      continue;
    }
    if (raw === null) {
      remove(applied, kebab(rawKey), condition);
      continue;
    }
    if (isFallback(raw)) {
      apply(applied, scope, into, condition, rawKey, declarations(kebab(rawKey), raw));
      continue;
    }
    const conditions = raw as Record<string, unknown>;
    for (const inner in conditions) {
      const value = conditions[inner];
      const where = inner === "default" ? condition : join(condition, inner);
      if (typeof value === "string" || typeof value === "number") {
        const within = inner === "default" ? scope : scopeOf(into, where);
        apply(applied, within, into, where, rawKey, value);
        continue;
      }
      // `null` under a non-default condition has no meaning, so it is skipped
      // rather than removing the default a sibling key just set.
      if (value === null) {
        if (inner === "default") remove(applied, kebab(rawKey), condition);
        continue;
      }
      if (typeof value !== "object") continue;
      if (isFallback(value)) {
        const text = declarations(kebab(rawKey), value);
        apply(applied, scopeOf(into, where), into, where, rawKey, text);
        continue;
      }
      walk(applied, { [rawKey]: value }, where, into);
    }
  }
}

function join(outer: string, inner: string): string {
  return outer === "default" ? inner : `${outer}${NEST}${inner}`;
}

/** The declaration text for a value, or the repeated declarations of a fallback. */
function declarations(property: string, fallback: Fallback): string {
  return fallback.$fallback
    .toReversed()
    .map((value) => cssValue(property, value))
    .join(`;${property}:`);
}

/**
 * An argument to {@link atoms}: declarations, or the class string another
 * `atoms` or {@link create} already produced.
 */
export type AtomInput = AtomStyles | string | false | null | undefined;

/**
 * Declarations as classes, merged: the last argument wins per property.
 *
 * One class per DECLARATION, not per block, so `which of these wins` is
 * answerable without the cascade — the class carries its property in its own
 * name and merging keeps the last per key. Passing order decides, always.
 *
 * An argument may be a style object, a class string another call produced, an
 * array of either, or `false`/`null`/`undefined`. `null` as a VALUE removes
 * what an earlier argument applied, where `false` and `undefined` only decline
 * to add.
 *
 * ```ts
 * atoms({ color: "red", margin: 0 }, active() && { color: "blue" });
 * ```
 *
 * Unlayered on purpose: a layered rule loses to an unlayered one whatever its
 * specificity, so an application's own reset must not be able to beat this.
 * A design system wants the opposite and reaches for {@link layer}.
 */
export function atoms(...styles: (AtomInput | readonly AtomInput[])[]): string {
  return build("", styles);
}

/**
 * The same atoms, inside a cascade layer.
 *
 * For a component LIBRARY, whose rules are meant to lose. `atoms` is unlayered
 * on purpose — the reasoning is above `TIERS` — and that is right for an
 * application styling itself, where losing to a stray `* { margin: 0 }` is the
 * failure. A design system wants the opposite: whatever an application writes
 * should win without `!important` and without counting specificity, which is
 * what a layer gives and nothing else does.
 *
 * A module whose every rule is in one layer writes {@link layer} once instead
 * of naming it at each call.
 *
 * The layer is part of each atom's identity, so the same declaration layered
 * and not is two classes. Merging still works across them: the merge key is the
 * property, which both carry.
 */
export function atomsIn(into: string, ...styles: (AtomInput | readonly AtomInput[])[]): string {
  return build(into, styles);
}

/** Styles in, a class string out: what {@link atoms} and a {@link Layer} are. */
export type AtomsFn = (...styles: (AtomInput | readonly AtomInput[])[]) => string;

/**
 * A cascade layer, and every helper that writes into it.
 *
 * Calling it is {@link atomsIn}; the properties are the rest of the surface
 * with the same layer already bound, so the name is written once a module
 * rather than at every call.
 *
 * {@link variants} is deliberately NOT here. It writes no CSS — it composes
 * class strings that already carry the layer they were declared in — so there
 * is nothing for a layer to bind.
 */
export interface Layer extends AtomsFn {
  /** The layer this writes into. */
  readonly layer: string;
  /** {@link createIn}, in this layer. */
  create<T extends Record<string, AtomStyles>>(styles: T): { readonly [K in keyof T]: string };
  /** {@link propsIn}, in this layer. */
  props(...styles: (PropInput | readonly PropInput[])[]): Props;
  /** {@link dynamicIn}, in this layer. */
  dynamic<A extends unknown[]>(declare: (...args: A) => AtomStyles): (...args: A) => DynamicStyle;
}

/**
 * {@link atomsIn} with its layer bound, named once at the top of a module.
 *
 * ```ts
 * const ui = layer("barq.ui");
 * const card = ui({ display: "flex", padding: 8 });
 * ```
 *
 * The compiler folds a call through the binding exactly as it folds `atomsIn`,
 * which is the whole reason this exists rather than an arrow function of your
 * own: it reads `layer("barq.ui")` in THIS module, so the layer is still a
 * literal at the call site and the atoms still carry it in their names. A
 * wrapper the compiler cannot see leaves every call to the runtime, and with it
 * the module's whole stylesheet inside the JS bundle.
 *
 * A binding that crosses a module boundary is not one the compiler can read, so
 * this is written per module. That is one line against a layer named at every
 * call, and it puts the fact where a reader looks for it.
 */
export function layer(name: string): Layer {
  // Built by assignment rather than `Object.assign` so each member keeps the
  // generic signature `Layer` declares; inferred from a closure, `create` and
  // `dynamic` would widen to their one call site's types.
  const bound = ((...styles: (AtomInput | readonly AtomInput[])[]) =>
    build(name, styles)) as AtomsFn & { -readonly [K in keyof Layer]: Layer[K] };
  bound.layer = name;
  bound.create = (styles) => createIn(name, styles);
  bound.props = (...styles) => propsIn(name, ...styles);
  bound.dynamic = (declare) => dynamicIn(name, declare);
  return bound;
}

function build(into: string, styles: readonly unknown[]): string {
  const [first, second] = styles;
  const pair =
    styles.length <= 2 &&
    typeof first === "string" &&
    (typeof second === "string" || second === undefined || second === null || second === false);
  if (!pair) {
    // Only an object registers anything: a pair of class strings is a merge.
    hold();
    try {
      const applied = new Map<string, string>();
      for (const style of styles) feed(applied, into, style);
      return joined(applied);
    } finally {
      release();
    }
  }
  const over = typeof second === "string" ? second : "";
  let overs = pairs.get(first);
  const hit = overs?.get(over);
  if (hit !== undefined) return hit;
  const applied = new Map<string, string>();
  feed(applied, into, first);
  feed(applied, into, over);
  const out = joined(applied);
  if (++paired > HELD_LIMIT) {
    pairs = new Map();
    paired = 0;
    overs = undefined;
  }
  if (overs === undefined) {
    overs = new Map();
    pairs.set(first, overs);
  }
  overs.set(over, out);
  return out;
}

/**
 * One class string over another, already merged: first -> second -> result.
 *
 * `ui(shared.ring, props.class?.())` is most of what a component library asks
 * at run time, and both strings are the same text on every render.
 */
let pairs = new Map<string, Map<string, string>>();
let paired = 0;

onReset(() => {
  displacements = new Map();
  resolved = new Map();
  held = 0;
  pairs = new Map();
  paired = 0;
  split = new Map();
});

function joined(applied: Map<string, string>): string {
  let out = "";
  for (const name of applied.values()) out = out === "" ? name : `${out} ${name}`;
  return out;
}

function feed(applied: Map<string, string>, into: string, style: unknown): void {
  // A class string is already atomic and its rules are already registered,
  // so merging it needs only the key each name carries.
  if (typeof style === "string") {
    assign(applied, namesOf(style));
    return;
  }
  if (typeof style !== "object" || style === null) return;
  if (Array.isArray(style)) {
    for (const item of style) feed(applied, into, item);
    return;
  }
  walk(applied, style as Record<string, unknown>, "default", into);
}

/**
 * A class string as `key, class, key, class, …`, read once per string.
 *
 * The strings that reach a merge are few and repeat: a group a module made
 * once, a variant arm, a `class` prop that is the same text every render.
 */
let split = new Map<string, Resolved>();

function namesOf(classes: string): Resolved {
  const hit = split.get(classes);
  if (hit !== undefined) return hit;
  const out: string[] = [];
  // Any whitespace separates two classes, which is what the `class` attribute
  // itself says: a string written across several lines is still a list.
  for (const name of classes.split(/\s+/)) {
    if (name === "") continue;
    // A class that is NOT one of ours — an application's own, arriving through
    // a `class` prop — has no property in its name and nothing to merge
    // against, so it is kept as it is rather than keyed on a slice of itself
    // and dropped when another happens to slice the same way.
    if (atomic(name)) place(out, name);
    else out.push(name, name);
  }
  if (split.size >= HELD_LIMIT) split = new Map();
  split.set(classes, out);
  return out;
}

/**
 * A named set of atom groups.
 *
 * StyleX's shape, and it costs nothing extra here: each group is one `atoms`
 * call, and because a class carries its own property, two groups merge by
 * passing them both back to `atoms` — the same merge, over names instead of
 * objects.
 *
 * ```ts
 * const styles = create({
 *   root: { width: "100%", maxWidth: 800 },
 *   child: { backgroundColor: "black", marginBlock: "1rem" },
 * });
 * const colors = create({ red: { backgroundColor: "red" } });
 *
 * <div class={atoms(styles.root, active() && colors.red)} />
 * ```
 */
export function create<T extends Record<string, AtomStyles>>(
  styles: T,
): { readonly [K in keyof T]: string } {
  return createIn("", styles);
}

/**
 * The same groups, inside a cascade layer, for the same reason {@link atomsIn}
 * exists.
 *
 * A group is what a treatment shared across a package is written as once: the
 * ring, the shadow, the focus block. The object it returns is plain strings, so
 * it crosses a module boundary as DATA, and every module that composes it lands
 * on the classes this one registered.
 *
 * ```ts
 * export const shared = createIn("barq.ui", {
 *   shadow: { boxShadow: "var(--ui-inset-shadow), …" },
 * });
 * ```
 */
export function createIn<T extends Record<string, AtomStyles>>(
  into: string,
  styles: T,
): { readonly [K in keyof T]: string } {
  const out: Record<string, string> = {};
  hold();
  try {
    for (const name in styles) out[name] = build(into, [styles[name]]);
  } finally {
    release();
  }
  return out as { readonly [K in keyof T]: string };
}

/**
 * What a dynamic group returns: its classes, and the variables to set.
 *
 * A branded object rather than a `[class, vars]` tuple, because `props` accepts
 * ARRAYS of styles and `["a-color_x", { color: "red" }]` is exactly what such a
 * tuple looks like. One of the two had to be unambiguous.
 */
export interface DynamicStyle {
  readonly $class: string;
  /**
   * Each declaration's value as the caller handed it. {@link props} writes it,
   * and takes the declaration's class out when there is nothing to write.
   */
  readonly $vars: Readonly<Record<string, unknown>>;
}

export type PropInput = AtomInput | DynamicStyle;

/** `class` and `style`, ready to spread onto an element. */
export interface Props {
  readonly class: string;
  readonly style?: Record<string, string | number>;
}

function isDynamic(value: unknown): value is DynamicStyle {
  return typeof value === "object" && value !== null && "$class" in value;
}

/** `Array.isArray` narrows a readonly array to `any[]`, which would type every item `any`. */
function isList(style: PropInput | readonly PropInput[]): style is readonly PropInput[] {
  return Array.isArray(style);
}

/**
 * Styles as the two attributes an element takes.
 *
 * The form a dynamic style needs, because a value only known at run time cannot
 * be in a class: it becomes a custom property the class reads, and the property
 * is set per element. barq's `spread` is reactive, so
 * `<div {...props(styles.bg(theme()))} />` re-sets one custom property when the
 * signal changes and touches nothing else.
 *
 * `atoms` remains the string form for `class={…}`, which is what a static style
 * wants and what the compiler turns into a literal.
 */
export function props(...styles: (PropInput | readonly PropInput[])[]): Props {
  return propsIn("", ...styles);
}

/**
 * The same two attributes, with this call's own declarations in a cascade
 * layer.
 *
 * `props` is unlayered for the reason {@link atoms} is. A design system wants
 * the opposite, and without this it had no way to ask for it — `props` was the
 * one helper with no layered form, so a layered package could not use dynamic
 * styles at all.
 *
 * A {@link dynamic} group carries the layer it was declared in, so only the
 * style objects passed here take this one.
 */
export function propsIn(into: string, ...styles: (PropInput | readonly PropInput[])[]): Props {
  hold();
  try {
    return propsOf(styles, (applied, style) => feed(applied, into, style));
  } finally {
    release();
  }
}

/**
 * {@link props} over class strings and dynamic groups, and nothing else.
 *
 * What the compiler calls in place of `props` when it has read every argument:
 * the objects are folded into class strings already, so the walk that turns an
 * object into atoms, and the registry it writes to, are never reached. An
 * application whose only runtime styling is a dynamic group ships this and not
 * them. Not for hand-written code: an object passed here is ignored.
 */
export function mergeStyles(...styles: (PropInput | readonly PropInput[])[]): Props {
  return propsOf(styles, null);
}

function propsOf(
  styles: readonly (PropInput | readonly PropInput[])[],
  objects: ((applied: Map<string, string>, style: unknown) => void) | null,
): Props {
  const applied = new Map<string, string>();
  let vars: Record<string, string | number> | undefined;
  const take = (style: PropInput | readonly PropInput[]): void => {
    if (isList(style)) {
      for (const item of style) take(item);
    } else if (isDynamic(style)) {
      vars ??= {};
      let unset: Set<string> | undefined;
      for (const name in style.$vars) {
        if (!writeVariable(vars, name, style.$vars[name])) {
          unset ??= new Set();
          for (const reader of readersOf(name)) unset.add(reader);
        }
      }
      assign(applied, namesOf(unset === undefined ? style.$class : without(style.$class, unset)));
    } else if (typeof style === "string") {
      assign(applied, namesOf(style));
    } else if (objects !== null) {
      objects(applied, style);
    }
  };
  for (const style of styles) take(style);
  const merged = joined(applied);
  return vars === undefined ? { class: merged } : { class: merged, style: vars };
}

/** What a dynamic group's variable is written for, read back off its name. */
interface DynamicTarget {
  readonly property: string;
  /** `""` for a declaration under no condition. */
  readonly conditionHash: string;
}

/** The declaration a variable stands for, or `null` for a name no dynamic group made. */
function dynamicTarget(name: string): DynamicTarget | null {
  const body = name.slice(2, name.lastIndexOf("-"));
  if (variableFor(body, "") === name) return { property: body, conditionHash: "" };
  const cut = body.lastIndexOf("-");
  if (cut < 0) return null;
  const target = { property: body.slice(0, cut), conditionHash: body.slice(cut + 1) };
  return variableFor(target.property, target.conditionHash) === name ? target : null;
}

function dynamicLonghands(property: string): readonly string[] {
  return SHORTHANDS[property] ?? [property];
}

function readersOf(name: string): string[] {
  const target = dynamicTarget(name);
  if (target === null) return [];
  return dynamicLonghands(target.property).map((longhand) => {
    const own = atomKey(longhand, "default");
    return target.conditionHash === "" ? own : `${own}-${target.conditionHash}`;
  });
}

function without(classes: string, keys: ReadonlySet<string>): string {
  return classes
    .split(/\s+/)
    .filter((name) => name !== "" && !(atomic(name) && keys.has(key(name))))
    .join(" ");
}

/**
 * A dynamic declaration's value, into the variables its atoms read, or `false`
 * when it declares nothing.
 *
 * `null`, `undefined` and `false` decline to add, as they do in `atoms`, so the
 * caller takes the declaration's class out and an earlier argument's value for
 * that property stands. Leaving the class in would read a variable nothing
 * set, and the element would show whatever an ancestor's dynamic style had put
 * there instead.
 *
 * A shorthand is written to one variable per longhand, because a longhand
 * reading the whole of `1px 2px` is a declaration no browser keeps. The unit
 * goes on here rather than where the group is called, because a compiled group
 * leaves the caller's expression in `$vars` untouched and this is the one place
 * both forms pass through.
 */
function writeVariable(
  vars: Record<string, string | number>,
  name: string,
  value: unknown,
): boolean {
  let given: string | number;
  if (typeof value === "string") given = value;
  else if (typeof value === "number" && Number.isFinite(value)) given = value;
  else return false;
  const target = dynamicTarget(name);
  if (target === null) {
    vars[name] = given;
    return true;
  }
  const text = cssValue(target.property, given);
  if (SHORTHANDS[target.property] === undefined) {
    vars[name] = text;
    return true;
  }
  const expanded = expand(target.property, text);
  if (expanded === null) return false;
  for (const [longhand, own] of expanded) {
    vars[variableFor(longhand, target.conditionHash)] = own;
  }
  return true;
}

/**
 * The custom property a dynamic declaration reads.
 *
 * Derived from the property alone, so the compiler and this agree without
 * either knowing what the other saw — the same reason an atom's class name
 * carries its own key.
 */
export function dynamicVar(property: string, condition = "default"): string {
  const memo = condition === "default" ? property : `${property}${NEST}${condition}`;
  let name = variables.get(memo);
  if (name === undefined) {
    name = variableFor(property, condition === "default" ? "" : hash(condition).slice(1));
    variables.set(memo, name);
  }
  return name;
}

/**
 * `--<property>-<hash>`, and under a condition `--<property>-<condition
 * hash>-<hash>`: the condition's hash is the one its atoms' keys carry, so a
 * variable names the atoms that read it, and the last hash is how
 * {@link dynamicTarget} tells the two shapes apart.
 */
function variableFor(property: string, conditionHash: string): string {
  return conditionHash === ""
    ? `--${property}-${hash(property).slice(1)}`
    : `--${property}-${conditionHash}-${hash(`${property}${NEST}${conditionHash}`).slice(1)}`;
}

const variables = new Map<string, string>();

/**
 * A group whose values are only known when it is called.
 *
 * The class is fixed — it reads `var(--…)` — and only the variable changes, so
 * a colour that changes on every frame writes one custom property and produces
 * no new CSS at all. That is the whole of StyleX's dynamic styles, and it needs
 * no compiler to be correct: compiling it only removes the object walk.
 */
export function dynamic<A extends unknown[]>(
  declare: (...args: A) => AtomStyles,
): (...args: A) => DynamicStyle {
  return dynamicIn("", declare);
}

/**
 * The same group, with its one rule in a cascade layer.
 *
 * The class a dynamic group produces is a rule like any other — it reads
 * `var(--…)` rather than a literal — so a design system needs it layered for
 * the reason every other rule it writes is.
 */
export function dynamicIn<A extends unknown[]>(
  into: string,
  declare: (...args: A) => AtomStyles,
): (...args: A) => DynamicStyle {
  return (...args) => {
    hold();
    try {
      return dynamicOf(into, declare(...args));
    } finally {
      release();
    }
  };
}

function dynamicOf(into: string, declared: Record<string, unknown>): DynamicStyle {
  const applied = new Map<string, string>();
  const vars: Record<string, unknown> = {};
  const read: string[] = [];
  collect(applied, vars, read, into, declared, "default");
  // After the atoms, which is where the compiler writes them.
  for (let index = 0; index < read.length; index += 2)
    registerProperty(read[index], read[index + 1]);
  return { $class: joined(applied), $vars: vars };
}

/**
 * A dynamic group's declarations, walked the way {@link walk} walks a style:
 * a condition key holds a style, and a property holds a value or a value per
 * condition. Every value becomes a variable, and its atoms read it.
 */
function collect(
  applied: Map<string, string>,
  vars: Record<string, unknown>,
  read: string[],
  into: string,
  style: Record<string, unknown>,
  condition: string,
): void {
  for (const rawKey in style) {
    const value = style[rawKey];
    if (looksLikeCondition(rawKey)) {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        collect(
          applied,
          vars,
          read,
          into,
          value as Record<string, unknown>,
          join(condition, rawKey),
        );
      }
      continue;
    }
    if (typeof value === "object" && value !== null) {
      // A fallback list is several declarations, which one variable cannot carry.
      if (isFallback(value) || Array.isArray(value)) continue;
      const conditions = value as Record<string, unknown>;
      for (const inner in conditions) {
        const where = inner === "default" ? condition : join(condition, inner);
        collect(applied, vars, read, into, { [rawKey]: conditions[inner] }, where);
      }
      continue;
    }
    const property = kebab(rawKey);
    // Kept whatever the value is, `undefined` included, so this is the object
    // the compiler writes for the same group: `props` is what decides.
    vars[dynamicVar(property, condition)] = value;
    const scope = scopeOf(into, condition);
    for (const longhand of dynamicLonghands(property)) {
      const variable = dynamicVar(longhand, condition);
      apply(applied, scope, into, condition, longhand, `var(${variable})`);
      read.push(variable, condition);
    }
  }
}

const registeredProperties = new Set<string>();

onReset(() => registeredProperties.clear());

/**
 * A dynamic variable, registered as not inherited.
 *
 * Only the element that sets it reads it, and an inherited custom property
 * changed on an element restyles every element under it. Measured in Chrome
 * over 6,300 descendants: 1.26 ms a change unregistered, 0.002 ms registered.
 */
function registerProperty(name: string, condition: string): void {
  if (registeredProperties.has(name) || !ownVariable(condition)) return;
  registeredProperties.add(name);
  register(`@property ${name}`, `@property ${name}{syntax:"*";inherits:false}`);
}

/**
 * Whether only the element that sets a variable reads it. A rule about a
 * descendant, and one about a pseudo-element, reads it by inheritance.
 */
function ownVariable(condition: string): boolean {
  return tierOf(condition) !== 0 && !condition.includes("::");
}
