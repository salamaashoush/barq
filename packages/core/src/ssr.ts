/**
 * String-mode server rendering — the runtime half of the compiler's SSR
 * backend (DESIGN §5 / P8b). Every function here builds bytes, and a module
 * compiled entirely by the string backend renders with no `document` in scope
 * at all. The one exception is `serializeNode`, the declared bridge for the
 * other direction: a module that FELL BACK to the DOM backend hands a
 * string-compiled caller real nodes, and serialising those needs a DOM.
 *
 * The compiler escapes every static byte at compile time and calls into this
 * file only for the values it cannot see: `esc` for a text hole, `attr` for a
 * dynamic attribute, `spreadAttrs` for a spread. The escaping tables below and
 * the compiler's `lower::entity` must agree byte for byte, because the same
 * markup is produced by both.
 */

import { SSR_HTML_BRAND, classToString, isSsrHtml, styleToString } from "./dom.ts";
import type { Scope } from "./scope.ts";
import { getOwner } from "./signals.ts";
import { isArray, isObject, toString } from "./type-utils.ts";

/**
 * Markup a compiled module produced. It is branded rather than a bare string
 * so a value crossing a hole can be told apart from user data: user data is
 * escaped, this is not, and getting that backwards is an XSS hole. The brand is
 * a registered SYMBOL so no deserialised object can carry it.
 */
export class SsrHtml {
  readonly [SSR_HTML_BRAND] = true;
  readonly t: string;

  constructor(t: string) {
    this.t = t;
  }

  toString(): string {
    return this.t;
  }
}

/** Wrap already-escaped markup. Every compiled SSR root returns one of these. */
export function html(t: string): SsrHtml {
  return new SsrHtml(t);
}

/**
 * The opt-out: mark a string the caller has already escaped (or trusts) so a
 * hole emits it as markup. Everything else a hole receives is escaped.
 */
export function raw(value: unknown): SsrHtml {
  return new SsrHtml(value === null || value === undefined ? "" : toString(value));
}

export { isSsrHtml };

// ── escaping ─────────────────────────────────────────────────────────────
//
// Three contexts, three tables, matching the HTML serialization spec — which
// is what `renderToString`'s `container.innerHTML` runs, so the two paths agree:
//
//   text        &  <  >  U+00A0
//   attribute   &  "
//   raw text    nothing (script/style/xmp/iframe/noembed/noframes/plaintext)
//
// U+00A0 is escaped in TEXT and left raw in an ATTRIBUTE, which is what the
// serialiser behind `renderToString` does. The spec escapes it in both, and the
// two spellings parse to the same character, so this is a byte-for-byte
// agreement with the oracle rather than a semantic choice.

// Both escapers are an `indexOf` probe followed by a slice-and-append scan.
// `String.replace` with a global regex and a function callback measured 3.6x
// slower than the equivalent scan on the shapes a page is made of, and it is
// the single largest cost in a server render.
//
// The scan reads UTF-16 CODE UNITS and every character it cuts on is below
// U+0800, so a slice boundary can never fall between the halves of a surrogate
// pair.

function firstEscapableText(value: string): number {
  let first = value.indexOf("&");
  const lt = value.indexOf("<");
  if (lt >= 0 && (first < 0 || lt < first)) first = lt;
  const gt = value.indexOf(">");
  if (gt >= 0 && (first < 0 || gt < first)) first = gt;
  const nbsp = value.indexOf("\u00A0");
  if (nbsp >= 0 && (first < 0 || nbsp < first)) first = nbsp;
  return first;
}

/**
 * Where the text probe starts paying for itself. It costs four `indexOf` passes
 * against the attribute probe's two, so on a short string — which is what most
 * holes carry — scanning outright is cheaper than asking first.
 */
const TEXT_PROBE_ABOVE = 32;

/** Escape a string for a text node position. */
export function escapeText(value: string): string {
  let start = 0;
  if (value.length > TEXT_PROBE_ABOVE) {
    start = firstEscapableText(value);
    if (start < 0) return value;
  }
  let out = start === 0 ? "" : value.slice(0, start);
  let last = start;
  for (let i = start; i < value.length; i++) {
    const code = value.charCodeAt(i);
    let entity: string;
    if (code === 38) entity = "&amp;";
    else if (code === 60) entity = "&lt;";
    else if (code === 62) entity = "&gt;";
    else if (code === 160) entity = "&nbsp;";
    else continue;
    if (last !== i) out += value.slice(last, i);
    out += entity;
    last = i + 1;
  }
  if (last === 0) return value;
  return last === value.length ? out : out + value.slice(last);
}

function firstEscapableAttribute(value: string): number {
  const amp = value.indexOf("&");
  const quote = value.indexOf('"');
  if (amp < 0) return quote;
  if (quote < 0) return amp;
  return amp < quote ? amp : quote;
}

/** Escape a string for a double-quoted attribute value. */
export function escapeAttribute(value: string): string {
  const start = firstEscapableAttribute(value);
  if (start < 0) return value;
  let out = start === 0 ? "" : value.slice(0, start);
  let last = start;
  for (let i = start; i < value.length; i++) {
    const code = value.charCodeAt(i);
    let entity: string;
    if (code === 38) entity = "&amp;";
    else if (code === 34) entity = "&quot;";
    else continue;
    if (last !== i) out += value.slice(last, i);
    out += entity;
    last = i + 1;
  }
  return last === value.length ? out : out + value.slice(last);
}

/**
 * A child position. Mirrors what `appendChild`/`applyInsert` do with the same
 * value on the DOM path: nullish and booleans render nothing, an array
 * flattens, a function is read once, and everything else becomes text.
 */
export function esc(value: unknown): string {
  // A string is what a hole carries almost every time, and `typeof null` is
  // `"object"` — so testing for it first is both the fast order and a safe one.
  if (typeof value === "string") return escapeText(value);
  if (value === null || value === undefined || typeof value === "boolean") return "";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  // §3.0 rules 1-2: a Cell ignores the scope, a Block needs it, one call
  // serves both. On this backend the scope is only ever handed on.
  if (typeof value === "function") return esc((value as (s: unknown) => unknown)(getOwner()));
  if (isArray<unknown>(value)) {
    let out = "";
    for (let i = 0; i < value.length; i++) out += esc(value[i]);
    return out;
  }
  if (isSsrHtml(value)) return value.t;
  const node = serializeNode(value);
  return node === null ? escapeText(toString(value)) : node;
}

/**
 * The other half of DESIGN §5's two-strategy coexistence: a module that fell
 * back to the DOM backend hands a string-compiled caller real nodes, and they
 * have to reach the wire as the markup they already are.
 */
function serializeNode(value: unknown): string | null {
  if (typeof Node === "undefined" || !(value instanceof Node)) return null;
  const holder = document.createElement("div");
  holder.appendChild(value.cloneNode(true));
  return holder.innerHTML;
}

/** An attribute value position, already inside the quotes. */
export function escAttr(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "function") return escAttr((value as () => unknown)());
  return escapeAttribute(toString(value));
}

/**
 * Raw-text element content (`<script>`, `<style>`). The tokenizer decodes
 * nothing inside these, so an HTML escaper would corrupt the content — `&amp;`
 * inside a stylesheet is five literal characters. Exactly one sequence is
 * therefore neutralised: the one that ENDS the element.
 *
 * `</script>` in a value is a real breakout — the rest of the value becomes
 * live elements outside the script — and there is no entity form to escape it
 * with, because entities do not exist here. `<\/` is the answer the tokenizer
 * and both content languages agree on: `</` followed by anything that is not an
 * ASCII letter stays raw text, and `\/` is an identity escape in a JS string
 * literal and in a CSS string alike, so the value survives verbatim where it
 * matters. `escapeScriptPayload` in `server.ts` makes the same trade with
 * `<` for the hydration payload.
 *
 * `<!--` goes with it: it is the only way into script-data-escaped state, where
 * a following `<script` makes `</script>` stop closing the element and swallow
 * the rest of the document.
 */
export function rawText(value: unknown, tag?: string): string {
  if (value === null || value === undefined || typeof value === "boolean") return "";
  if (typeof value === "function") return rawText((value as () => unknown)(), tag);
  if (isArray<unknown>(value)) {
    let out = "";
    for (let i = 0; i < value.length; i++) out += rawText(value[i], tag);
    return out;
  }
  return neutralizeRawText(toString(value), tag);
}

const BREAKOUT = new Map<string, RegExp>();

function breakoutPattern(tag: string): RegExp {
  let pattern = BREAKOUT.get(tag);
  if (pattern === undefined) {
    // An unknown owner neutralises every close tag: a caller that did not say
    // which element it is in cannot be told which one ends it.
    const name = tag.replace(/[^a-zA-Z]/g, "").toLowerCase();
    const close = name === "" ? "</(?=[a-zA-Z])" : `</(?=${name})`;
    // `<!--` is the only way into script-data-escaped state, and it is a legal
    // CDO token in CSS — so script data pays for it and a stylesheet does not.
    const comment = name === "" || name === "script" ? "|<!--" : "";
    pattern = new RegExp(close + comment, "gi");
    BREAKOUT.set(tag, pattern);
  }
  return pattern;
}

export function neutralizeRawText(text: string, tag?: string): string {
  if (text.indexOf("<") < 0) return text;
  return text.replace(breakoutPattern(tag ?? ""), (match) =>
    match === "<!--" ? "<\\!--" : "<\\/",
  );
}

// ── attributes ───────────────────────────────────────────────────────────

/**
 * `DOM_PROPS` are written as PROPERTIES by `setElementAttr`, and markup carries
 * only the content attribute a property REFLECTS to. These four reflect, under
 * the name the HTML spells them with.
 */
const REFLECTS_AS: Record<string, string> = {
  defaultValue: "value",
  defaultChecked: "checked",
  readOnly: "readonly",
};

/**
 * Names that write no attribute at all.
 *
 * `checked`, `selected` and `indeterminate` are the form-field DIRTY values:
 * setting the property changes what the field shows without touching the
 * markup, so a server that wrote them would ship a document the client's own
 * render does not produce. `defaultChecked` is the spelling that DOES reach the
 * wire, which is exactly what the DOM says it is for.
 */
const NOT_AN_ATTRIBUTE: Record<string, 1> = {
  children: 1,
  ref: 1,
  key: 1,
  checked: 1,
  selected: 1,
  indeterminate: 1,
  innerHTML: 1,
  innerText: 1,
  textContent: 1,
  dangerouslySetInnerHTML: 1,
};

/**
 * `value` is the one name whose answer depends on the ELEMENT. On these four it
 * is the dirty value and reflects to nothing (`defaultValue` is the content
 * attribute); everywhere else — `<option>`, `<button>`, `<li>`, `<data>`,
 * `<meter>`, `<progress>`, `<param>` — the property IS the attribute.
 */
const DIRTY_VALUE: Record<string, 1> = { input: 1, textarea: 1, select: 1, output: 1 };

/**
 * The XML `Name` production, which is what `setAttribute` validates a name
 * against. Only a SPREAD can carry a name that is runtime data — every compiled
 * call site passes a name the compiler wrote — and a spread of untrusted props
 * is otherwise an injection: `{"x onload=alert(1) y": "1"}` writes three
 * attributes into the markup where the DOM path throws `InvalidCharacterError`
 * and writes none. Refusing is what makes the two paths agree.
 */
const NAME_START =
  ":A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF" +
  "\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uD800-\\uDFFF" +
  "\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
const NAME_REST = `${NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040`;
const ATTRIBUTE_NAME = new RegExp(`^[${NAME_START}][${NAME_REST}]*$`);

/**
 * Names that have already passed. A page writes the same handful of attribute
 * names thousands of times and the `Name` production costs 8.5 ns to re-derive,
 * so the answer is remembered — but only the ACCEPTING answer, and only up to a
 * bound: a spread whose keys are untrusted data would otherwise be a way to
 * make the server allocate one map entry per request.
 */
const VALID_NAMES = new Set<string>();
const VALID_NAMES_MAX = 1024;

function checkName(name: string): void {
  if (VALID_NAMES.has(name)) return;
  if (!ATTRIBUTE_NAME.test(name)) {
    throw new Error(
      `"${name}" is not a valid attribute name. ` +
        "A spread whose keys are untrusted data cannot be written to markup.",
    );
  }
  if (VALID_NAMES.size < VALID_NAMES_MAX) VALID_NAMES.add(name);
}

/**
 * One attribute, including its leading space, or `""` when it writes nothing.
 * Reproduces `setElementAttr`: booleans add or remove, nullish removes, class
 * goes through `classToString`, and a style object through the kebab + px rule.
 *
 * The compiler has already normalised the NAME (className → class, SVG
 * kebab-casing), so this only re-applies the two cheap aliases as a safety net.
 */
export function attr(name: string, value: unknown, tag?: string): string {
  const key = name === "className" ? "class" : name === "htmlFor" ? "for" : name;

  // Events never reach the wire. `applyProp` intercepts them before
  // `setElementAttr`, so an `on…` attribute in the markup would be a name the
  // client never writes.
  if (key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110) return "";
  if (key in NOT_AN_ATTRIBUTE) return "";
  if (key === "value" && (tag === undefined || tag in DIRTY_VALUE)) return "";

  if (key === "class") return classAttr(classToString(unwrap(value)));
  if (key === "classList") return classAttr(clsList(value));
  if (key === "style") {
    const css = styleToString(unwrap(value));
    return css === null ? "" : ` style="${escapeAttribute(css)}"`;
  }

  const resolved = unwrap(value);
  // Nullish and `false` write nothing, and the DOM path's `removeAttribute`
  // does not validate either — so a name is only checked where it reaches bytes.
  if (resolved === null || resolved === undefined || resolved === false) return "";
  const attribute = REFLECTS_AS[key] ?? key;
  checkName(attribute);
  if (resolved === true) return ` ${attribute}=""`;
  return ` ${attribute}="${escapeAttribute(toString(resolved))}"`;
}

/**
 * Every name `attr` above answers about ITSELF rather than by writing
 * `name="value"`: the two aliases, the three that build their value out of an
 * object, the one whose answer depends on the element, the three that reflect
 * under a different name, and the ten that write nothing at all.
 *
 * It exists so the compiler can decide, at compile time, which call sites can
 * take `attrLit` instead — the name is a literal it wrote, so everything `attr`
 * re-derives per call is knowable once. `build.rs` reads this table out of this
 * file the way it reads `dom.ts`'s, so a name added here reaches the compiler
 * on the next build and cannot drift.
 *
 * The `on…` prefix is NOT in it: it is a prefix rule, not a name, and the
 * compiler applies it as one.
 */
const ATTR_INTERCEPTED: Record<string, 1> = {
  children: 1,
  ref: 1,
  key: 1,
  checked: 1,
  selected: 1,
  indeterminate: 1,
  innerHTML: 1,
  innerText: 1,
  textContent: 1,
  dangerouslySetInnerHTML: 1,
  className: 1,
  htmlFor: 1,
  class: 1,
  classList: 1,
  style: 1,
  value: 1,
  defaultValue: 1,
  defaultChecked: 1,
  readOnly: 1,
};

/**
 * `attr` for a name the COMPILER wrote and already decided about.
 *
 * Every test `attr` runs — the two aliases, the `on…` prefix, three table
 * lookups, the element-dependent `value`, and the XML `Name` production — is
 * answered by a string literal in the emitted module, so none of them is run
 * here. What is left is the part that depends on the value: unwrap a thunk,
 * drop nullish and `false`, write a bare name for `true`, escape anything else.
 *
 * `spreadAttrs` keeps calling `attr`, and that is the point: a spread's keys
 * are the one place a name is runtime data, and `checkName` is what stops
 * `{"x onload=alert(1) y": "1"}` from becoming three attributes.
 */
export function attrLit(name: string, value: unknown): string {
  const resolved = typeof value === "function" ? (value as () => unknown)() : value;
  if (resolved === null || resolved === undefined || resolved === false) return "";
  if (resolved === true) return ` ${name}=""`;
  return ` ${name}="${escapeAttribute(toString(resolved))}"`;
}

/** Whether `attr` decides about this name itself. For the conformance tests. */
export function attrIntercepts(name: string): boolean {
  return name in ATTR_INTERCEPTED;
}

function unwrap(value: unknown): unknown {
  return typeof value === "function" ? (value as () => unknown)() : value;
}

/**
 * `null` means the attribute is not written at all; `""` means it is written
 * EMPTY. The DOM path draws exactly that line — `classToString` answers null
 * for nullish and `false` and `applyResolvedProp` calls `removeAttribute`,
 * where an empty string is assigned to `className` and leaves `class=""` on the
 * element. `styleToString` already splits the two the same way.
 */
function classAttr(name: string | null): string {
  return name === null ? "" : ` class="${escapeAttribute(name)}"`;
}

/**
 * `classList`, which is NOT `class`. `diffClassList` calls a per-key value that
 * is a function and toggles on the RESULT, where `classToString` treats the
 * same function as a truthy key — the same object, two answers, and the DOM
 * path really does give both.
 *
 * Only an OBJECT contributes tokens, and no token means no attribute: the DOM
 * path is `diffClassList(element, isObject(value) ? value : null, …)`, which
 * writes nothing for a string or an array and never creates a `class` the
 * element did not already have. Hence `null` rather than `""` — `cls` has to
 * tell "this list added nothing" from "this class is present and empty".
 */
export function clsList(value: unknown): string | null {
  const resolved = unwrap(value);
  if (!isObject(resolved)) return null;
  let out = "";
  for (const key in resolved) {
    let raw: unknown = resolved[key];
    if (typeof raw === "function") raw = (raw as () => unknown)();
    if (raw) out += (out ? " " : "") + key;
  }
  return out === "" ? null : out;
}

/**
 * The one class attribute for an element whose class arrives in more than one
 * piece — a baked literal, a dynamic `class`, a `classList` object. The DOM
 * path can write them separately because `classList` is additive; markup has
 * exactly one `class=` slot, so they are joined here instead.
 */
export function cls(...parts: unknown[]): string {
  let out = "";
  // A piece that resolves to `""` writes no token and still makes the attribute
  // present, exactly as it does on the DOM path — so "every piece was empty" is
  // `class=""` and "every piece was absent" is no class at all.
  let present = false;
  for (let i = 0; i < parts.length; i++) {
    const name = classToString(unwrap(parts[i]));
    if (name === null) continue;
    present = true;
    if (name === "") continue;
    out += (out ? " " : "") + name;
  }
  return present ? ` class="${escapeAttribute(out)}"` : "";
}

/** `{...props}` on an intrinsic element, in the object's own key order. */
export function spreadAttrs(props: unknown, tag?: string): string {
  const resolved = unwrap(props);
  if (!isObject(resolved)) return "";
  let out = "";
  for (const key in resolved) {
    out += attr(key, resolved[key], tag);
  }
  return out;
}

/**
 * The names that replace an element's CONTENT rather than set an attribute.
 * `createElement` applies them before it appends children, so the compiler
 * refuses to inline an element that has both — which is why this can own the
 * whole child position.
 */
export function content(name: string, value: unknown): string {
  const resolved = unwrap(value);
  if (name === "dangerouslySetInnerHTML") {
    const inner = isObject(resolved) ? (resolved as { __html?: unknown }).__html : undefined;
    return inner === null || inner === undefined ? "" : toString(inner);
  }
  if (name === "innerHTML") {
    return resolved === null || resolved === undefined ? "" : toString(resolved);
  }
  return resolved === null || resolved === undefined ? "" : escapeText(toString(resolved));
}

// ── the six string-inlinable flow components (DESIGN §5) ─────────────────
//
// `Flow::inlinable_on_server()` in the compiler is the same 6/8 split. These
// reproduce `components.ts`'s semantics with a `+=` where it splices nodes;
// the other eight have real async and boundary semantics, and a module using
// one of them compiles to the DOM backend instead.

interface ListProps {
  each?: unknown;
  fallback?: unknown;
  keyed?: unknown;
  children: (item: never, index: never) => unknown;
}

function rows(each: unknown): readonly unknown[] {
  const value = unwrap(each);
  return isArray<unknown>(value) ? value : [];
}

function fallbackHtml(props: { fallback?: unknown }): SsrHtml {
  return html(props.fallback === null || props.fallback === undefined ? "" : esc(props.fallback));
}

export function ssrFor(s: Scope | null, props: ListProps): SsrHtml {
  // §3.0 rule 1, drawn in the same place `For` draws it (components.ts:266): a
  // Cell declares no parameter and a key function declares one, and that is
  // the only thing separating them once both are values in the same slot. A
  // spread source's `keyed` reaches here verbatim, so `unwrap` would invoke the
  // key function with no row.
  const carrier = props.keyed;
  const keyed =
    typeof carrier === "function" && (carrier as { length: number }).length >= 1
      ? carrier
      : unwrap(carrier);
  if (keyed === false) return ssrIndex(s, props);
  const items = rows(props.each);
  if (items.length === 0) return fallbackHtml(props);
  // A key FUNCTION makes the row survive an item change, so `children` takes
  // the item as an accessor there and as a plain value everywhere else
  // (`components.ts:259`). Getting this backwards is the classic For bug.
  const boxed = typeof keyed === "function";
  const children = props.children as unknown as (
    s: Scope | null,
    item: unknown,
    index: () => number,
  ) => unknown;
  let out = "";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    out += esc(children(s, boxed ? (): unknown => item : item, () => i));
  }
  return html(out);
}

export function ssrIndex(s: Scope | null, props: ListProps): SsrHtml {
  const items = rows(props.each);
  if (items.length === 0) return fallbackHtml(props);
  const children = props.children as unknown as (
    s: Scope | null,
    item: () => unknown,
    index: number,
  ) => unknown;
  let out = "";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    out += esc(children(s, () => item, i));
  }
  return html(out);
}

export function ssrRepeat(
  s: Scope | null,
  props: {
    count?: unknown;
    from?: unknown;
    fallback?: unknown;
    children: (s: Scope | null, index: number) => unknown;
  },
): SsrHtml {
  const raw = unwrap(props.count);
  const total = typeof raw === "number" && raw > 0 ? Math.floor(raw) : 0;
  if (total === 0) return fallbackHtml(props);
  const from = unwrap(props.from);
  const start = typeof from === "number" ? from : 0;
  let out = "";
  for (let i = 0; i < total; i++) out += esc(props.children(s, start + i));
  return html(out);
}

export function ssrShow(
  s: Scope | null,
  props: {
    when?: unknown;
    keyed?: unknown;
    fallback?: unknown;
    children?: unknown;
  },
): SsrHtml {
  const value = unwrap(props.when);
  if (!value) return fallbackHtml(props);
  const children = props.children;
  if (typeof children !== "function") return html(esc(children));
  // Non-keyed narrows to an accessor so reads inside stay live on the client;
  // on the wire both spellings are read exactly once.
  const argument = unwrap(props.keyed) === false ? (): unknown => value : value;
  return html(esc((children as (s: Scope | null, item: unknown) => unknown)(s, argument)));
}

/** `Match` is an identity function on the client too — `components.ts:525`. */
export function ssrMatch<T>(_s: Scope | null, props: T): T {
  return props;
}

export function ssrSwitch(
  s: Scope | null,
  props: { fallback?: unknown; children?: unknown },
): SsrHtml {
  const resolved =
    typeof props.children === "function"
      ? (props.children as (s: Scope | null) => unknown)(s)
      : props.children;
  const children = isArray<unknown>(resolved) ? resolved : [resolved];
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as { when?: unknown; children?: unknown } | null;
    if (!child || typeof child !== "object" || !("when" in child)) continue;
    const value = unwrap(child.when);
    if (!value) continue;
    const body = child.children;
    return html(
      esc(
        typeof body === "function"
          ? (body as (s: Scope | null, v: unknown) => unknown)(s, value)
          : body,
      ),
    );
  }
  return fallbackHtml(props);
}
