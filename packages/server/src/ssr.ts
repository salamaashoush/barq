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
 *
 * Since M6 it also holds the STRING half of `flow.ts`'s four primitives —
 * `branch`, `each`, `boundary`, `portal` — under the same names, in the same
 * argument order, reached by the same emitted call. `CODESIGN.md` §3.11: one
 * ABI, two implementations, and the compiler chooses between them by choosing
 * the import SOURCE. That is what deleted `uninlinable_flow` and the
 * whole-module SSR→DOM downgrade behind it.
 */

import {
  Block,
  COUNT,
  Cell,
  NO_SCOPE,
  NotReadyError,
  Scope,
  ScopeMissingError,
  classToString,
  enter,
  exit,
  getOwner,
  isArray,
  isBlock,
  isSsrHtml,
  omit,
  requireScope,
  toString,
  untrack,
} from "@barqjs/core";
import {
  ERROR_BOUNDARY,
  REVEAL_COORD,
  SSR_HTML_BRAND,
  createErrorCollector,
  createPendingCollector,
  createRevealCoordinator,
  disposeScope,
  isObject,
  keyMode,
  outerRevealHandle,
  provideOn,
  styleToString,
  type RevealHandle,
} from "@barqjs/core/internal";

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

function checkName(name: string, kind = "attribute"): void {
  if (VALID_NAMES.has(name)) return;
  if (!ATTRIBUTE_NAME.test(name)) {
    throw new Error(
      `"${name}" is not a valid ${kind} name. ` +
        "Untrusted data cannot be written to markup as a name.",
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
/**
 * `<form action={…}>` on the wire — the string half of `dom.ts`'s `formAction`.
 *
 * Named apart from it deliberately: the two take different arguments — this one
 * writes bytes and has no element and no scope — so one alias for both would
 * read like one call with two implementations, which is what `SHARED_ABI` means
 * and this is not.
 *
 * A URL is written. So is a SERVER FUNCTION, which has one: `@barqjs/start`
 * mounts each exported server function at a path derived from its id, and that
 * path exists before the page is rendered. This is what closes the progressive
 * enhancement hole the previous note here described as "a routing feature and
 * not this file's" — it needed a server-generated endpoint per action, and
 * there is now one.
 *
 * `method="post"` rides along because the endpoint refuses anything else: a
 * form defaults to GET, and a GET-invocable mutation is CVE-2026-39371. The two
 * attributes are one decision, which is why one function writes both — the same
 * shape SvelteKit's `{...form}` spread has.
 *
 * The brand is read through `Symbol.for` rather than imported. `@barqjs/start`
 * depends on this package, so importing it back would be a cycle; the symbol is
 * a public name and reading it here is an independent reading rather than a
 * dependency.
 *
 * An ordinary client HANDLER still writes nothing: it is client behaviour and
 * no byte on the wire means it. What both cases buy is the thing the DOM half
 * exists for — the function is never `toString`ed into the target. Before M10
 * it reached `attr` and the server wrote the action's source text as the URL.
 */
const SERVER_FN_BRAND = Symbol.for("barq.server-fn");

/** Kept beside the brand: `@barqjs/start`'s `RPC_PREFIX`, read the same way. */
const RPC_PREFIX = "/_barq/fn/";

export function formAttr(value: unknown): string {
  if (typeof value !== "function") return attr("action", value);
  const fn = value as unknown as Record<symbol, unknown> & { meta?: { id?: unknown } };
  if (fn[SERVER_FN_BRAND] !== true) return "";
  const id = fn.meta?.id;
  if (typeof id !== "string" || id === "") return "";
  return ` action="${escapeAttribute(RPC_PREFIX + encodeURIComponent(id))}" method="post"`;
}

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
    let slot: unknown = resolved[key];
    if (typeof slot === "function") slot = (slot as () => unknown)();
    if (slot) out += (out ? " " : "") + key;
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

// ============================================================================
// The four primitives, string-valued (CODESIGN.md §3.4, §3.11)
// ============================================================================
//
// One name, one argument order, two implementations. `flow.ts` splices nodes
// into `(parent, anchor)`; these concatenate bytes and have no parent to splice
// into, so the compiler hands them `(null, null)` and the range they own is the
// markup they return.
//
// THE RANGE INSTRUCTION, and when it is written. §11 Q4 settled "pay the bytes,
// get the recovery"; §12 REVERSED it on a measurement — the comments cost 55.7%
// raw and 7.3% gzipped on a 100-row page — and split the decision in two.
//
// RECOVERY. A range writes `<!--[-->` … `<!--]-->` when, and only when, the
// module was compiled `hydratable`, which the compiler ships as the `HYDRATE`
// bit of the same flags integer both backends already take. This is what the
// client claims against: a region's extent is data, and its position in a
// parent's child list is what every index after it is computed from.
//
// DETECTION. The KEY inside that open comment — `<!--[b-->` — is written only
// when the module was compiled `dev` as well, which the compiler ships as
// `DETECT`. It is the one thing the client cannot re-derive (re-evaluating the
// condition is unsound: `SEMANTICS.md` H2, it may read data the client has not
// been seeded with) and the one thing recovery does not need, because a client
// that claims the wrong arm still writes its own values through the nodes it
// took. A production page therefore pays for the range and not for the key.
//
// A ROW OF AN `each` writes NOTHING, in either build. Rows are produced in
// order and the client claims them from one cursor, so a row's extent is what
// its build consumed — which was two comments per row and 25% of the payload.
//
// With `HYDRATE` off nothing changes, and the property this backend is CHECKED
// by survives untouched: the two backends produce byte-identical markup, which
// is what lets `oracle.test.ts` and the dual-render suite compare them without
// a normalisation step that could hide a real divergence.
//
// One range is written whatever the flags say: a boundary the stream deferred.
// `<!--[b:N-->` names a continuation that has not been flushed yet, and no walk
// of the document can discover that either.

const OPEN = "<!--[";
const CLOSE = "<!--]-->";

/**
 * `flow.ts`'s `HYDRATE` and `DETECT`, read from the same flags integer, because
 * the compiler sets them from its options for both backends. The client's claim
 * and these bytes are one decision, not two that have to agree.
 */
const HYDRATE = 1 << 2;
const DETECT = 1 << 3;
/**
 * The range is the only thing in its parent element, so the client reads its
 * extent off the parent and the comments are not written at all. Never set with
 * `DETECT`: the open comment is where the key goes.
 */
const WHOLE = 1 << 4;

/** The key spellings that survive a comment. Anything else claims positionally. */
// `:` is excluded because `deferredRange` reserves `b:<id>`: a DEV branch keyed
// `"b:1"` would otherwise write the same open comment a parked boundary does,
// and the client would read a settled range as one the stream still owes it. A
// key with a colon degrades to the opaque `?`, which `reconcileKey` already
// treats as "no key on the wire".
const SAFE_KEY = /^[\w.+-]{0,32}$/;

/**
 * `<!--[-->` … `<!--]-->` around one range, and `<!--[k-->` where the build
 * asked for detection.
 *
 * A key that cannot be spelled safely becomes `?`, and the client then claims
 * the range by POSITION and skips the comparison — which is exactly what a hole
 * has always had, and what EVERY range has in a production build. Writing the
 * key raw is not an option: `-->` inside a comment ends it, and a key is user
 * data.
 */
function range(inner: string, flags: number, key?: unknown): string {
  if ((flags & WHOLE) !== 0) return inner;
  if ((flags & DETECT) === 0) return `${OPEN}-->${inner}${CLOSE}`;
  // Only a PRIMITIVE has a spelling. An object key stringifies to
  // `[object Object]`, which is neither safe nor informative, so it takes the
  // opaque form with everything else the pattern refuses.
  // POSITIVE narrowing, not a negative guard plus an assertion. A negative
  // `typeof` does not narrow `unknown`, so the old shape needed
  // `key as string | number | …` to satisfy `no-base-to-string` — and
  // `no-unnecessary-type-assertion` then called that assertion unnecessary.
  // Asking what the key IS answers both, and reads better.
  const spelled =
    typeof key === "string"
      ? key
      : typeof key === "number" ||
          typeof key === "boolean" ||
          typeof key === "bigint" ||
          typeof key === "symbol"
        ? String(key)
        : "";
  return `${OPEN}${SAFE_KEY.test(spelled) ? spelled : "?"}-->${inner}${CLOSE}`;
}

/**
 * §3.11's streaming range: a boundary whose content is still to come, addressed
 * by the continuation the stream will resume.
 */
function deferredRange(id: number, inner: string): string {
  return `${OPEN}b:${id}-->${inner}${CLOSE}`;
}

/**
 * A boundary that showed its FALLBACK with no stream to finish it.
 *
 * `renderToString`/`renderToStringAsync` have no sink, so a body that never
 * settles emits the fallback and that is the whole answer. The range still has
 * to SAY so: the client's `loadingBoundary` claims a settled range in place,
 * and claiming this one would claim the fallback's markup as the content's.
 * Caught by L5 — `control-flow-await-suspense` went to 0% reuse and a full
 * recovery before this marker existed.
 *
 * `f:` rather than a bare `f`, for the reason `b:` has a colon: `SAFE_KEY`
 * excludes `:`, so no DEV branch key can spell either of them.
 */
function parkedRange(inner: string): string {
  return `${OPEN}f:-->${inner}${CLOSE}`;
}

/**
 * Where an unready boundary parks itself. `null` is a non-streaming render, and
 * then a boundary shows its fallback and that is the whole answer — which is
 * what `renderPage`'s second render exists to repair.
 *
 * §3.11: "the Block is re-invocable with its scope, so there is no second code
 * path". The record is exactly that pair.
 */
export interface StreamSink {
  /**
   * `flags` carries the boundary's own `HYDRATE` bit, and the BUFFERED arm is
   * what needs it. A parked boundary always writes a `<!--[b:N-->` range because
   * the resume has to find what to replace — deliberately, whether or not the
   * page hydrates. Once that range has been patched in place, a hydratable page
   * keeps a plain `<!--[-->` range (the client claims it) and a non-hydratable
   * one must be left with the bare markup, exactly as a boundary that settled
   * inside the shell would have written. Without this the sink's mere presence
   * added comments to `renderToString` output.
   */
  defer(body: Block<unknown>, scope: Scope | null, flags?: number): number;
}

let SINK: StreamSink | null = null;

/** Install a sink for the duration of one render. Returns the previous one. */
export function setStreamSink(sink: StreamSink | null): StreamSink | null {
  const previous = SINK;
  SINK = sink;
  return previous;
}

/**
 * Re-invoke a parked continuation. It is the SAME call `boundary` made when it
 * built the shell — same Block, same scope, same activation — so there is no
 * second code path for a resumed boundary to diverge along, which is §3.11's
 * whole claim about streaming.
 */
export function resumeDeferred(body: Block<unknown>, scope: Scope | null): string {
  return activate(scope, body, NO_ARGS, 0, "branch");
}

const NO_ARGS: readonly unknown[] = [];

/**
 * C3.8 at the four Cell slots of the primitive surface, exactly as `flow.ts`
 * spells it. A Block reaching a Cell slot is a compiler or forwarding bug and
 * must throw rather than be invoked with no scope and stringified.
 */
function cellSlot(value: unknown, origin: string): void {
  if (isBlock(value)) throw new ScopeMissingError(`${origin} (a Block reached a Cell slot)`);
}

/** A Cell ignores every argument (§3.0 rule 1), so one spelling serves both. */
function invokeBlock(scope: Scope | null, body: unknown, args: readonly unknown[]): unknown {
  if (typeof body !== "function") return body;
  return (body as (s: Scope | null, ...rest: readonly unknown[]) => unknown)(scope, ...args);
}

/**
 * One activation's bytes. `enter(given)` and nothing else — O2/O3.7 hold on the
 * server for the same reason they hold on the client: an instance is a child of
 * the scope the construct was HANDED.
 *
 * The scope is not disposed on the way out. A server render disposes its root
 * once, and a range that has already been written to the wire has no later
 * update to be torn down for.
 */
function activate(
  given: Scope | null,
  body: unknown,
  args: readonly unknown[],
  flags: number,
  kind: "branch" | "each" | "portal",
): string {
  if (body === null || body === undefined) return "";
  if ((flags & NO_SCOPE) !== 0) return esc(invokeBlock(given, body, args));
  const scope = enter(given, kind);
  let built = false;
  try {
    const out = esc(invokeBlock(scope, body, args));
    built = true;
    return out;
  } finally {
    exit(scope);
    if (!built) disposeScope(scope);
  }
}

/**
 * K2/K5/K6 on the wire. The key is read ONCE — `STATIC_KEY` is the compiler
 * saying it would have read it once anyway, so there is no effect to open and
 * no previous-key record to keep, and on this backend that is true of every key.
 */
export function branch<K>(
  s: Scope | null,
  parent: Node | null,
  anchor: Node | null,
  key: Cell<K>,
  bodies: Block<unknown> | readonly (Block<unknown> | null | undefined)[],
  flags = 0,
): SsrHtml {
  const given = requireScope(s, "branch");
  refuseASite(parent, anchor, "branch");
  cellSlot(key, "branch key");
  const k = untrack(key);
  const body = typeof bodies === "function" ? bodies : bodies[k as unknown as number];
  const inner = activate(given, body, NO_ARGS, flags, "branch");
  return html((flags & HYDRATE) === 0 ? inner : range(inner, flags, k));
}

/**
 * The four modes of `each`, byte for byte with `flow.ts`'s table:
 *
 * | `keyOf`    | identity        | row Block receives          |
 * |------------|-----------------|-----------------------------|
 * | `null`     | the item        | `(item, index: Cell)`       |
 * | a function | `keyOf(item)`   | `(item: Cell, index: Cell)` |
 * | `false`    | the index       | `(item: Cell, index)`       |
 * | `COUNT`    | the index       | `(index)`                   |
 *
 * Getting the boxing backwards is the classic `For` bug, so it is one table in
 * both halves rather than two readings of prose — and `keyMode` is one function
 * in both halves for the same reason, because a construct whose `keyed` came
 * through a spread reaches here with the carrier still unresolved.
 */
export function each<T>(
  s: Scope | null,
  parent: Node | null,
  anchor: Node | null,
  src: Cell<readonly T[] | null | undefined> | Cell<number>,
  carrier: ((item: T) => unknown) | false | null | typeof COUNT | Cell<unknown>,
  row: Block<unknown, never[]>,
  flags = 0,
  fallback?: Block<unknown> | null,
): SsrHtml {
  const given = requireScope(s, "each");
  const keyOf = keyMode<T>(carrier);
  refuseASite(parent, anchor, "each");
  cellSlot(src, "each source");
  const value = untrack(src as Cell<unknown>);
  // The LIST gets a range; a ROW gets nothing. §12: a row's extent is what its
  // build consumed, because the rows are produced in order and the client walks
  // them from one cursor — so the two comments per row were the client telling
  // itself something it already knew. The list's own range is what tells it
  // where the rows stop, and that it cannot know.
  const list =
    (flags & HYDRATE) === 0
      ? (inner: string): string => inner
      : (inner: string): string => range(inner, flags);

  if (keyOf === COUNT) {
    const total = typeof value === "number" && value > 0 ? Math.floor(value) : 0;
    if (total === 0) return html(list(activate(given, fallback, NO_ARGS, 0, "each")));
    let out = "";
    for (let i = 0; i < total; i++) out += activate(given, row, [i], 0, "each");
    return html(list(out));
  }

  const items = isArray<T>(value) ? value : [];
  if (items.length === 0) return html(list(activate(given, fallback, NO_ARGS, 0, "each")));
  const boxedItem = keyOf === false || typeof keyOf === "function";
  const boxedIndex = keyOf !== false;
  let out = "";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemArg = boxedItem ? (): T => item : item;
    const indexArg = boxedIndex ? (): number => i : i;
    out += activate(given, row, [itemArg, indexArg], 0, "each");
  }
  return html(list(out));
}

export type BoundaryKind = "error" | "loading";

/**
 * E3 on the wire: a `branch` keyed on `{content | fallback}` plus a `try`.
 *
 * Both kinds collapse to the same shape here because a server render has one
 * frame. An error boundary catches a CONSTRUCTION throw (E2.1 — the catcher is
 * installed before the body runs, so a throw from inside an effect the body
 * created lands in this `try` too) and a loading boundary catches
 * `NotReadyError`, which E2.3 says an error boundary must pass through.
 *
 * What a server cannot do is the client's swap: there is no later frame to
 * reveal content in. `renderPage` settles the graph and renders a second time
 * for exactly that reason, and M6's streaming path is the other answer.
 */
export function boundary(
  s: Scope | null,
  parent: Node | null,
  anchor: Node | null,
  kind: BoundaryKind,
  fallback: Block<unknown> | null | undefined,
  body: Block<unknown>,
  flags = 0,
  on?: Cell<unknown>,
): SsrHtml {
  const given = requireScope(s, "boundary");
  refuseASite(parent, anchor, "boundary");
  if (on !== undefined) cellSlot(on, "boundary on");
  const inner =
    kind === "error"
      ? errorBoundary(given, fallback, body, flags)
      : loadingBoundary(given, fallback, body, flags);
  // A boundary that did not settle has already written its own range —
  // `<!--[b:N-->` for one the stream will swap, `<!--[f:-->` for one nothing
  // will — so wrapping it again would nest a range the client would claim as
  // this boundary's content.
  if (
    (flags & HYDRATE) === 0 ||
    inner.t.startsWith(`${OPEN}b:`) ||
    inner.t.startsWith(`${OPEN}f:`)
  ) {
    return inner;
  }
  return html(range(inner.t, flags));
}

function errorBoundary(
  given: Scope | null,
  fallback: Block<unknown> | null | undefined,
  body: Block<unknown>,
  flags: number,
): SsrHtml {
  const collector = createErrorCollector();
  const reset = (): void => collector.clear();
  const asError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

  // E2.1: the catcher is on the INSTANCE scope and is installed before the
  // body runs, so a throw routed to `s.catcher` from anywhere below reaches
  // this collector rather than the scope above the boundary.
  const arm: Block<unknown> = (scope: Scope | null): unknown => {
    provideOn(scope as Scope, ERROR_BOUNDARY, (err: unknown) => {
      if (err instanceof NotReadyError) throw err;
      collector.capture(err);
    });
    return invokeBlock(scope, body, NO_ARGS);
  };

  try {
    const inner = activate(given, arm, NO_ARGS, flags, "branch");
    if (!collector.failed()) return html(inner);
  } catch (error) {
    // E2.3: a `NotReadyError` belongs to the nearest loading boundary and is
    // never captured here.
    if (error instanceof NotReadyError) throw error;
    collector.capture(error);
  }
  if (fallback === null || fallback === undefined) return html("");
  const error = (): Error => asError(collector.error());
  return html(activate(given, fallback, [error, reset], flags, "branch"));
}

function loadingBoundary(
  given: Scope | null,
  fallback: Block<unknown> | null | undefined,
  body: Block<unknown>,
  flags: number,
): SsrHtml {
  const pending = createPendingCollector();
  const arm: Block<unknown> = (scope: Scope | null): unknown => {
    pending.install(scope as Scope);
    return invokeBlock(scope, body, NO_ARGS);
  };
  try {
    const inner = activate(given, arm, NO_ARGS, 0, "branch");
    if (pending.count() === 0) return html(inner);
  } catch (error) {
    if (!(error instanceof NotReadyError)) throw error;
  }
  // The FALLBACK can be async too, and until this was guarded it took the whole
  // page with it. `@barqjs/router`'s generated table emits
  // `pending: lazy(() => import(...))` for every route, so a route whose loader
  // parks on the very first render activated a fallback whose chunk had not
  // arrived — from a position with no `try` around it. Measured: a
  // `NotReadyError` escaped `renderPage` AND `renderToStream`, and the request
  // produced nothing at all.
  //
  // A fallback that is not ready cannot be shown, and there is nothing else to
  // show, so the shell emits empty and the content still defers: the resume is
  // what puts the real markup in. This is the one place a swallowed
  // `NotReadyError` is the honest answer rather than a hidden failure.
  let shown: unknown;
  try {
    shown = activate(given, fallback, NO_ARGS, 0, "branch");
  } catch (error) {
    if (!(error instanceof NotReadyError)) throw error;
    shown = "";
  }
  // §3.11's streaming form: the fallback goes out now, and the pair
  // `(arm Block, this scope)` goes to the sink so the same Block can be
  // re-invoked when its promises settle. There is no second rendering path —
  // the continuation IS the Block the shell already refused to wait for.
  // GATED on the flag, like every other range this file writes. `b:` is not —
  // the stream needs it to find what to swap whether or not the page hydrates —
  // but `f:` says nothing to anyone except a claiming client, and emitting it
  // unconditionally made the string backend's -O0 and -Ox output diverge, which
  // `ssr.test.ts`'s byte-identical channel caught.
  if (SINK === null) {
    return html((flags & HYDRATE) === 0 ? String(shown) : parkedRange(String(shown)));
  }
  return html(deferredRange(SINK.defer(arm, given, flags), shown));
}

/**
 * A portal writes NOTHING to the wire, and that is agreement rather than
 * omission: its target is a node in the client's document, which a server
 * cannot address, and the DOM path renders nothing into a `renderToString`
 * container either — the marker is not connected while the tree is detached, so
 * the deferred activation returns before it builds. The empty range is what the
 * client claims and fills.
 */
export function portal(
  s: Scope | null,
  target: Cell<Node | string | null | undefined>,
  _block: Block<unknown>,
  _flags = 0,
): SsrHtml {
  requireScope(s, "portal");
  cellSlot(target, "portal target");
  // An empty range, and it earns its bytes. `portal` on the client returns a
  // marker at its LEXICAL position and builds elsewhere on a microtask, so the
  // wire has nothing for the client to claim — but the POSITION still has to be
  // claimable, or the hole after it walks into the previous one's close comment.
  return html((_flags & HYDRATE) === 0 ? "" : range("", _flags));
}

/**
 * The pair a string primitive can never be given. `flow.ts` resolves the parent
 * from the anchor on every write; there is no node here to resolve, so a
 * non-null pair means a DOM-target call reached the string runtime and the
 * markup it would produce would silently drop the subtree.
 */
function refuseASite(parent: Node | null, anchor: Node | null, origin: string): void {
  if (parent === null && anchor === null) return;
  throw new Error(
    `${origin} was given a DOM insertion point on the string backend. The server emits ` +
      "`(null, null)`; a node here means a module compiled for the DOM is calling " +
      "`@barqjs/server`.",
  );
}

// ============================================================================
// The thirteen constructs, as string components
// ============================================================================
//
// `passes/flow.rs` lowers ten of the thirteen to a primitive directly at `-Ox`
// and never emits the call below for them. What is left reaches the SAME four
// primitives one adapter frame later, which is the direction that is always
// safe.
//
// These are `components.ts`'s adapters with the string primitives underneath.
// They exist so that no construct anywhere sends anything to another backend:
// the whole-module SSR→DOM downgrade is gone, and with it the eight-component
// set that triggered it.

// M9 tried to delete eleven of the twelve below and put them back on a corpus
// scan. M10 answered the question that scan could not, and the answer is that
// they are not deletable at all. `components.ts`'s header carries the table.
//
// The short version: `Opt::flow` is a flippable knob and `-O0` turns it off, so
// at `-O0` every construct is a component call and these are what it calls —
// 37 of 131 fixtures keep a flow import there, against 0 at `-Ox`. §6 L3 grades
// the flow pass by rendering the corpus at both levels and requiring the frames
// to agree, so this file IS the reference the pass is graded against. Deleting
// it would delete the oracle.
//
// Three constructs also still refuse at `-Ox`, so `ssrSwitch`, `ssrMatch` and
// `ssrDynamic` are reachable from an optimised build too: `Switch` needs
// literal `<Match>` arms it can read, `Match` goes with it, and `Dynamic`'s
// unrecognised props are the resolved component's rather than the construct's.
// `passes::flow::admits_spread` states each one where it is enforced.

/** A CELL-slot read (§3.0 rule 2): called with no scope, never with one. */
function readValue(slot: unknown, origin: string): unknown {
  cellSlot(slot, origin);
  return typeof slot === "function" ? (slot as () => unknown)() : slot;
}

function slotBlock(slot: unknown): Block<unknown> | null {
  return slot === null || slot === undefined ? null : (slot as Block<unknown>);
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
  const value = (): unknown => readValue(props.when, "Show.when");
  const keyed = readValue(props.keyed, "Show.keyed") === true;
  const key: Cell<unknown> = keyed
    ? (): unknown => value() || false
    : (): unknown => value() !== false && !!value();
  // ONE body for every key (§3.4), exactly as `components.ts` writes it: the
  // value is read at ACTIVATION time, which is why the branch takes no slot
  // argument of its own. The DEFAULT is non-keyed, so children get the narrowed
  // accessor; `keyed` hands over the raw value.
  const arm: Block<unknown> = (scope: Scope | null): unknown => {
    const current = untrack(value);
    return current
      ? invokeBlock(scope, props.children, [keyed ? current : value])
      : invokeBlock(scope, props.fallback, NO_ARGS);
  };
  return branch(s, null, null, key, arm);
}

export function ssrFor(
  s: Scope | null,
  props: {
    each?: unknown;
    fallback?: unknown;
    keyed?: unknown;
    children: (s: Scope | null, item: never, index: never) => unknown;
  },
): SsrHtml {
  // §3.0 rule 1 is `each`'s own (`flow.ts`'s `keyMode`), so the carrier crosses
  // unresolved and both backends reach one implementation of it.
  return eachOf(s, props.each, props.keyed as Cell<unknown>, props, "For");
}

function eachOf(
  s: Scope | null,
  source: unknown,
  keyOf: ((item: never) => unknown) | false | null | Cell<unknown>,
  props: { children: unknown; fallback?: unknown },
  origin: string,
): SsrHtml {
  const list = (): readonly unknown[] => readValue(source, `${origin}.each`) as readonly unknown[];
  return each(
    s,
    null,
    null,
    // `each` declares its source as `Cell<readonly never[]>` — the element type
    // is unresolved there by design — so the cast is at the boundary rather
    // than carried by a type parameter that appears nowhere in the signature.
    list as Cell<readonly never[]>,
    keyOf,
    props.children as Block<unknown, never[]>,
    0,
    slotBlock(props.fallback),
  );
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
  const from = (): number => (readValue(props.from, "Repeat.from") as number | undefined) ?? 0;
  const count = (): number => readValue(props.count, "Repeat.count") as number;
  const shifted: Block<unknown> = (scope: Scope | null, index: unknown): unknown =>
    invokeBlock(scope, props.children, [(index as number) + from()]);
  return each(
    s,
    null,
    null,
    count,
    COUNT,
    shifted as Block<unknown, never[]>,
    0,
    slotBlock(props.fallback),
  );
}

/** `Match` is an identity function on the client too — `components.ts:249`. */
export function ssrMatch<T>(_s: Scope | null, props: T): T {
  return props;
}

export function ssrSwitch(
  s: Scope | null,
  props: { fallback?: unknown; children?: unknown },
): SsrHtml {
  const arms = (): { index: number; value: unknown; match: Record<string, unknown> } | null => {
    const resolved = invokeBlock(s, props.children, NO_ARGS);
    const children = isArray<unknown>(resolved) ? resolved : [resolved];
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as Record<string, unknown> | null;
      if (!child || typeof child !== "object" || !("when" in child)) continue;
      const value = readValue(child.when, "Match.when");
      if (value) return { index: i, value, match: child };
    }
    return null;
  };
  // Row 0 is the fallback, so "no arm matched" is a key like any other — the
  // same table `passes/flow.rs` builds when it lowers a `Switch` itself.
  const found = arms();
  const key = (): number => (found === null ? 0 : found.index + 1);
  const body: Block<unknown> = (scope: Scope | null): unknown => {
    if (found === null) return invokeBlock(scope, props.fallback, NO_ARGS);
    // Non-keyed is the default, and its children take the narrowed accessor.
    // A server render has one frame, so the accessor is a constant thunk over
    // the value this arm matched on — the shape has to agree with the DOM
    // half's or the two backends hand the same body different arguments.
    const keyed = readValue(found.match.keyed, "Match.keyed") === true;
    const narrowed = (): unknown => found.value;
    return invokeBlock(scope, found.match.children, [keyed ? found.value : narrowed]);
  };
  return branch(s, null, null, key, body);
}

/**
 * `flags` is a parameter and not a constant because a HAND-WRITTEN caller has to
 * be able to say `HYDRATE`. The compiler never reaches these two — it emits
 * `boundary(..., 4)` directly on both backends — but `@barqjs/router` walks its
 * matched chain by hand, and with `0` here the string backend writes no range
 * while the DOM half claims one, which is a page that hydrates nothing.
 *
 * `0` stays the default: an uncompiled caller with no `hydratable` client half
 * is the case these adapters were written for.
 */
export function ssrLoading(
  s: Scope | null,
  props: { fallback?: unknown; on?: unknown; children: unknown },
  flags = 0,
): SsrHtml {
  return boundary(
    s,
    null,
    null,
    "loading",
    slotBlock(props.fallback),
    props.children as Block<unknown>,
    flags,
    props.on === undefined ? undefined : (): unknown => readValue(props.on, "Loading.on"),
  );
}

export function ssrErrored(
  s: Scope | null,
  props: { fallback: unknown; children: unknown },
  flags = 0,
): SsrHtml {
  return boundary(
    s,
    null,
    null,
    "error",
    props.fallback as Block<unknown>,
    props.children as Block<unknown>,
    flags,
  );
}

/** The pre-Solid-2.0 spelling, whose fallback takes the error BY VALUE. */
/**
 * The SERVER half of an island: ordinary markup, inside a range that says so.
 *
 * `i:` joins `b:` and `f:` in the set of keys `SAFE_KEY` cannot spell, so no DEV
 * branch key can be mistaken for one. The interior is rendered exactly as it
 * would be anywhere else — what the marker buys is the CLIENT's ability to skip
 * the whole extent in one step, which a positional walk needs and Solid's
 * key-based one does not.
 */
/** The COMPONENT form, for a build whose flow pass is off. See `island`. */
export function ssrIsland(s: Scope | null, props: { children: unknown }): SsrHtml {
  return island(s, null, null, props.children as Block<unknown>);
}

export function island(
  s: Scope | null,
  parent: Node | null,
  anchor: Node | null,
  block: Block<unknown>,
  flags = 0,
): SsrHtml {
  // The insertion pair is the SHARED_ABI tax and it is worth paying: one name,
  // one argument order, two implementations, so `region_call` emits a single
  // line for both backends. A string has no insertion pair to honour.
  refuseASite(parent, anchor, "island");
  void flags;
  const inner = activate(s, block, NO_ARGS, 0, "branch");
  return html(`${OPEN}i:-->${inner}${CLOSE}`);
}

export function ssrPortal(s: Scope | null, props: { mount?: unknown; children: unknown }): SsrHtml {
  return portal(
    s,
    (): Node | string | null | undefined =>
      readValue(props.mount, "Portal.mount") as Node | string | undefined,
    props.children as Block<unknown>,
  );
}

/**
 * `Await` — four states, three bodies, one `branch` keyed on the state. The
 * same shape `components.ts` builds, with the error arm's bare-message case
 * emitting text instead of a text NODE.
 */
export function ssrDynamic(
  s: Scope | null,
  props: { component?: unknown } & Record<string, unknown>,
): SsrHtml {
  const component = (): unknown => readValue(props.component, "Dynamic.component");
  const body: Block<unknown> = (scope: Scope | null): unknown => {
    const resolved = untrack(component);
    if (!resolved) return null;
    // C3/C5: `rest` is a VIEW of the same carriers, not a copy.
    const rest = omit(props, "component");
    if (typeof resolved !== "string") return invokeBlock(scope, resolved, [rest]);
    // The tag is RUNTIME DATA here, which makes it the same injection the
    // attribute-name check exists for: `component={"div onload=alert(1)"}`
    // writes two attributes into markup where `document.createElement` throws
    // `InvalidCharacterError` and writes nothing. Refusing is what makes the two
    // paths agree.
    checkName(resolved, "tag");
    const inner = rest.children === undefined ? "" : esc(rest.children);
    const open = `<${resolved}${spreadAttrs(omit(rest, "children"), resolved)}`;
    return raw(VOID_TAGS.has(resolved) ? `${open}>` : `${open}>${inner}</${resolved}>`);
  };
  return branch(s, null, null, component, body);
}

/** The tags a serialiser writes with no end tag. `dom.ts` never needs this — a
 * void element simply has no children to append — and a string does. */
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * `Reveal` — a PROVIDE scope, not a range (O1 lists `provide` separately). It
 * publishes the coordinator descendant loading boundaries register with and
 * owns nothing else, which is exactly as true on the wire as it is in the DOM.
 */
/**
 * `reveal` — the string half of the same name (`SHARED_ABI`). The compiler
 * emits one call with one argument order; which module it is imported from is
 * the TARGET's decision and nothing else differs.
 */
export function reveal(
  s: Scope | null,
  order: unknown,
  collapsed: unknown,
  block: unknown,
): SsrHtml {
  const handle: RevealHandle = createRevealCoordinator(
    () =>
      (readValue(order, "reveal.order") as "sequential" | "together" | "natural") ?? "sequential",
    () => readValue(collapsed, "reveal.collapsed") === true,
    outerRevealHandle(s),
  );
  const scope = enter(s ?? null, "provide");
  try {
    provideOn(scope, REVEAL_COORD, handle);
    return html(esc(invokeBlock(scope, block, NO_ARGS)));
  } finally {
    exit(scope);
  }
}

/**
 * `dynamic` — the string half. The branch that swaps the component is the
 * compiler's, so what is left here is the one question the value answers: a tag
 * name is serialised, anything else is invoked.
 */
export function dynamic(
  s: Scope | null,
  component: unknown,
  props: Record<string, unknown>,
): unknown {
  const resolved = untrack(() => readValue(component, "dynamic.component"));
  if (resolved === null || resolved === undefined || resolved === false) return null;
  if (typeof resolved !== "string") return invokeBlock(s, resolved, [props]);
  // The tag is RUNTIME DATA here, which makes it the same injection the
  // attribute-name check exists for: `component={"div onload=alert(1)"}` writes
  // two attributes into markup where `document.createElement` throws
  // `InvalidCharacterError` and writes nothing. Refusing is what makes the two
  // paths agree.
  checkName(resolved, "tag");
  const inner = props.children === undefined ? "" : esc(props.children);
  const open = `<${resolved}${spreadAttrs(omit(props, "children"), resolved)}`;
  return raw(VOID_TAGS.has(resolved) ? `${open}>` : `${open}>${inner}</${resolved}>`);
}

export function ssrReveal(
  s: Scope | null,
  props: { order?: unknown; collapsed?: unknown; children: unknown },
): SsrHtml {
  const handle: RevealHandle = createRevealCoordinator(
    () =>
      (readValue(props.order, "Reveal.order") as "sequential" | "together" | "natural") ??
      "sequential",
    () => readValue(props.collapsed, "Reveal.collapsed") === true,
    outerRevealHandle(s),
  );
  // X1: enter, fork, write, invoke — in that order, and on a scope of its own.
  const scope = enter(s ?? null, "provide");
  try {
    provideOn(scope, REVEAL_COORD, handle);
    return html(esc(invokeBlock(scope, props.children, NO_ARGS)));
  } finally {
    exit(scope);
  }
}
