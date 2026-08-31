/**
 * One class per declaration, merged by property.
 *
 * `clsx(base, variant)` composes CLASSES, and which one wins is decided by the
 * order the two blocks were written in the stylesheet — not by the order they
 * were passed. That is the bug every design system hits at scale: a `variant`
 * that loses to its own `base` because a bundler put them the other way round.
 *
 * An atom is one property, so "which wins" is answerable without the cascade:
 * the class carries its property in its own name (`a-color_1n4k2p0`), and
 * merging keeps the last class per key. Passing order decides, always.
 *
 * The compiler recognises `atoms` on object literals and does all of this at
 * build time; this is the same semantics for the values it cannot know.
 */

import type * as CSS from "csstype";

import { UNEXPANDABLE, expand } from "./shorthands.ts";
import { hash, register } from "./sheet.ts";

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
 */
export type AtomConditions = { readonly [condition: string]: AtomValue | AtomConditions };

/**
 * Declarations, conditions, and conditions holding declarations.
 *
 * The four template-literal keys are what makes `"::placeholder": { … }` and
 * `"@media …": { … }` type-check at the top level: a condition key holds a
 * whole style object, where a property key holds a value or a value per
 * condition.
 */
export type AtomStyles = {
  readonly [K in keyof CSS.Properties]?: AtomValue | AtomConditions;
} & {
  /**
   * A custom property, and a vendor-prefixed one.
   *
   * `-webkit-user-select` has no other spelling: camel-cased to
   * `WebkitUserSelect` it comes back out of `kebab` as `webkit-user-select`,
   * which is not a property any browser has.
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
const UNITLESS = new Set([
  "animation-iteration-count",
  "aspect-ratio",
  "border-image-outset",
  "border-image-slice",
  "border-image-width",
  "column-count",
  "columns",
  "flex",
  "flex-grow",
  "flex-shrink",
  "font-weight",
  "grid-area",
  "grid-column",
  "grid-column-end",
  "grid-column-start",
  "grid-row",
  "grid-row-end",
  "grid-row-start",
  "line-clamp",
  "line-height",
  "opacity",
  "order",
  "orphans",
  "scale",
  "tab-size",
  "widows",
  "z-index",
  "zoom",
]);

const kebabbed = new Map<string, string>();

/**
 * Memoised because it is the hottest thing here: a regex and a lowercase per
 * property per call, over an alphabet of maybe forty property names in a whole
 * application.
 */
export function kebab(property: string): string {
  const hit = kebabbed.get(property);
  if (hit !== undefined) return hit;
  const out = property.startsWith("--")
    ? property
    : property.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  kebabbed.set(property, out);
  return out;
}

function cssValue(property: string, value: string | number): string {
  if (typeof value !== "number" || value === 0 || UNITLESS.has(property)) return String(value);
  return `${value}px`;
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
 * How an atom is ORDERED against another atom, and nothing more.
 *
 * Not a cascade layer, and this was one for a while. Layers gave ordering
 * across modules and took away the thing atoms exist for: a layered rule loses
 * to an UNLAYERED one whatever the specificity, so an application's
 * `* { margin: 0 }` beat every `margin` atom on the page — measured in a
 * browser, every margin and padding computing to `0px`.
 *
 * Specificity already answers that: `.a-margin-top_x` is 0-1-0 against the
 * reset's 0-0-0. It answers most of the rest too — `:hover` is 0-2-0 and
 * `::before` is 0-1-1 — and the only pair it cannot separate is a base against
 * the same property under an at-rule, since `@media` adds none. So a module
 * emits its atoms in tier order and that pair is decided.
 *
 * Ordering ACROSS modules is not needed and never was: two atoms conflict only
 * when merged, merging happens in one `atoms` call, and one call is in one
 * module. Tailwind does layer (`@layer theme, base, components, utilities;`)
 * because it owns the reset as well as the utilities; vanilla-extract layers
 * only where asked, and Linaria and StyleX not at all.
 */
/**
 * `descendant` comes FIRST, and that is the one tier order decides rather than
 * specificity. A rule a parent writes about its children — `& > *`, `& svg` —
 * and a rule the child writes about itself are both one class, so nothing
 * separates them but which was written last. Measured in a browser: a field
 * saying `& > * { width: 100% }` took a label's own `width: fit-content` away
 * and stretched it across the row. The child's own rule is the more specific
 * INTENT, so the parent's goes before it and loses the tie.
 */
export const TIERS = ["descendant", "base", "select", "element", "media"] as const;

/** Whether a condition's subject is this element, or something under it. */
function aboutSelf(condition: string): boolean {
  let selector = "&";
  for (const part of condition.split(NEST)) {
    if (part.startsWith("@")) continue;
    selector = part.includes("&")
      ? part.replaceAll("&", selector)
      : part.startsWith(":") || part.startsWith("[")
        ? `${selector}${part}`
        : `${selector} ${part}`;
  }

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
  const selectors = parts.filter((part) => !part.startsWith("@"));
  let inner = `.${name}`;
  for (const part of selectors) {
    inner = part.includes("&")
      ? part.replaceAll("&", inner)
      : part.startsWith(":") || part.startsWith("[")
        ? `${inner}${part}`
        : `${inner} ${part}`;
  }
  inner = `${inner}{${declaration}}`;
  for (const wrap of wraps.toReversed()) inner = `${wrap}{${inner}}`;
  return into === "" ? inner : `@layer ${into}{${inner}}`;
}

/**
 * `(property, condition, value)` -> class, and its rule already registered.
 *
 * A component re-rendering hands `atoms` a FRESH object every time, so there is
 * nothing to memoise on identity — but the declarations inside it repeat, and
 * they are what costs: a hash and a sheet write per declaration. Keyed on the
 * three strings, a re-render is a `Map` hit and a `join`.
 */
const named = new Map<string, string>();

function atom(property: string, condition: string, value: string, into = ""): string {
  // The layer belongs to the atom's identity: the same declaration in and out
  // of a layer is two different rules, and one class name cannot carry both.
  const memo =
    into === "" ? `${property}|${condition}|${value}` : `${into}|${property}|${condition}|${value}`;
  const hit = named.get(memo);
  if (hit !== undefined) return hit;
  // The suffix hashes the VALUE, and nothing else. The key already carries the
  // property and the condition, so the value is all that is left to tell two
  // atoms of one key apart — and hashing it alone means every atom holding that
  // value ends in the same token. A shorthand expands to four longhands over
  // one value, and a compressor reads three of the four suffixes as
  // back-references instead of as noise. Measured over `@barqjs/ui`'s
  // stylesheet, 1,078 atoms: 16.2 KB brotli down to 13.1.
  const name = `${atomKey(property, condition)}_${hash(into === "" ? value : `${into}|${value}`).slice(1)}`;
  register(name, rule(name, condition, `${property}:${value}`, into), tierOf(condition));
  named.set(memo, name);
  return name;
}

function isConditions(value: unknown): value is AtomConditions {
  return typeof value === "object" && value !== null;
}

/**
 * Declarations, as classes.
 *
 * Later arguments win per property, and a falsy argument contributes nothing —
 * `atoms(base, active() && { color: "blue" })` is the ordinary shape.
 */
function apply(
  applied: Map<string, string>,
  property: string,
  condition: string,
  text: string,
  into: string,
): void {
  const expanded = expand(property, text);
  if (expanded === null) {
    const name = atom(property, condition, text, into);
    applied.set(key(name), name);
    return;
  }
  for (const [longhand, own] of expanded) {
    const name = atom(longhand, condition, own, into);
    applied.set(key(name), name);
  }
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
  for (const rawKey in style) {
    const raw = style[rawKey];
    // A top-level condition key holds a whole style object: `'::placeholder'`,
    // `'@media …'`, `'&:hover .x'`.
    if (looksLikeCondition(rawKey)) {
      if (isConditions(raw)) {
        walk(applied, raw, join(condition, rawKey), into);
      }
      continue;
    }
    const property = kebab(rawKey);
    if (isFallback(raw)) {
      apply(applied, property, condition, declarations(property, raw), into);
      continue;
    }
    if (!isConditions(raw)) {
      if (raw === null) remove(applied, property, condition);
      else if (typeof raw === "string" || typeof raw === "number") {
        apply(applied, property, condition, cssValue(property, raw), into);
      }
      continue;
    }
    for (const inner in raw) {
      const value = raw[inner];
      const where = inner === "default" ? condition : join(condition, inner);
      if (isConditions(value) && !isFallback(value)) {
        walk(applied, { [rawKey]: value }, where, into);
        continue;
      }
      if (isFallback(value)) {
        apply(applied, property, where, declarations(property, value), into);
        continue;
      }
      // `null` under a non-default condition has no meaning, so it is skipped
      // rather than removing the default a sibling key just set.
      if (value === null) {
        if (inner === "default") remove(applied, property, condition);
        continue;
      }
      if (typeof value !== "string" && typeof value !== "number") continue;
      apply(applied, property, where, cssValue(property, value), into);
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

/** What {@link layer} and {@link atoms} both are: styles in, a class string out. */
export type AtomsFn = (...styles: (AtomInput | readonly AtomInput[])[]) => string;

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
export function layer(name: string): AtomsFn {
  return (...styles) => build(name, styles);
}

function build(into: string, styles: (AtomInput | readonly AtomInput[])[]): string {
  const applied = new Map<string, string>();

  for (const style of styles.flat(4)) {
    if (style === false || style === null || style === undefined) continue;
    // A class string is already atomic and its rules are already registered,
    // so merging it needs only the key each name carries. A class that is NOT
    // one of ours — an application's own, arriving through a `class` prop —
    // has no property in its name and nothing to merge against, so it is kept
    // as it is rather than keyed on a slice of itself and dropped when another
    // happens to slice the same way.
    if (typeof style === "string") {
      for (const name of style.split(" ")) {
        if (name === "") continue;
        applied.set(atomic(name) ? key(name) : name, name);
      }
      continue;
    }
    walk(applied, style, "default", into);
  }
  return [...applied.values()].join(" ");
}

/**
 * Whether a shorthand can take part in a merge at all.
 *
 * `border: 1px solid red` puts three values in three sub-properties BY TYPE, so
 * counting them cannot say which longhand each belongs to. Expanding it wrongly
 * is worse than not expanding it, so `atoms` leaves it whole and this reports
 * that a later `border-color` will not replace it.
 */
export function mergeable(property: string): boolean {
  return !UNEXPANDABLE.has(kebab(property));
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
  for (const name in styles) out[name] = build(into, [styles[name]]);
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
  readonly $vars: Record<string, string | number>;
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
  const classes: AtomInput[] = [];
  let vars: Record<string, string | number> | undefined;
  for (const style of styles.flat(4)) {
    if (isDynamic(style)) {
      classes.push(style.$class);
      vars = vars === undefined ? { ...style.$vars } : Object.assign(vars, style.$vars);
      continue;
    }
    classes.push(style);
  }
  const merged = atoms(...classes);
  return vars === undefined ? { class: merged } : { class: merged, style: vars };
}

/**
 * The custom property a dynamic declaration reads.
 *
 * Derived from the property alone, so the compiler and this agree without
 * either knowing what the other saw — the same reason an atom's class name
 * carries its own key.
 */
export function dynamicVar(property: string): string {
  return `--${property}-${hash(property).slice(1)}`;
}

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
  return (...args) => {
    const declared = declare(...args);
    const classes: string[] = [];
    const vars: Record<string, string | number> = {};
    for (const rawProperty in declared) {
      const property = kebab(rawProperty);
      const value = (declared as Record<string, AtomValue>)[rawProperty];
      // A fallback list is a set of declarations, not one value, so it has
      // nothing to put in a custom property.
      if (value === false || value === null || value === undefined || isFallback(value)) continue;
      const name = dynamicVar(property);
      vars[name] = value;
      const applied = new Map<string, string>();
      apply(applied, property, "default", `var(${name})`, "");
      classes.push(...applied.values());
    }
    return { $class: classes.join(" "), $vars: vars };
  };
}
