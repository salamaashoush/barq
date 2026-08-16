/**
 * DOM rendering and reconciliation
 * Fine-grained reactive DOM updates using comment markers
 */

import {
  CONTEXT_MISS,
  disposeScope,
  emitDiagnostic,
  ERROR_BOUNDARY,
  isBlock,
  lookupContext,
  onCleanup,
  requireScope,
  ScopeMissingError,
  enterRoot,
  exit,
  flush,
  getOwner,
  ownRange,
  OWNERSHIP,
  readSlot,
  renderEffect,
  resetChildIds,
  unclaimedSeeds,
  underScope,
  untrack,
  signal,
  type Scope,
  type Signal,
} from "./signals.ts";
import {
  isString,
  isBoolean,
  isObject,
  isArray,
  isNullish,
  toString,
  setProperty,
  isRefCallback,
  isSignalGetter,
} from "./type-utils.ts";
import type { Cell } from "./scope.ts";
import { writeLive } from "./forms.ts";
import {
  HydrationMismatch,
  beginHydration,
  built as builtNode,
  claimNode,
  claimRange,
  endHydration,
  hydrating,
  report,
  wireIsMarked,
  withRange,
  withoutClaim,
  type HydrationReport,
  type Range,
} from "./hydration.ts";

/**
 * §3.0: a function child is a `Cell<Child>` or a `Block<Child>` and the two are
 * not distinguished here — a Cell ignores the scope a Block needs, so both are
 * called the same way and both belong in the same position.
 */
export type Child =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | ((...args: never[]) => Child)
  | Child[];
export type Props = Record<string, unknown> & { children?: Child | Child[] };
// Component type - generic over props like React's FunctionComponent
export type Component<P = Props> = (s: Scope | null, props: P) => JSXElement;

// SVG namespace
const SVG_NS = "http://www.w3.org/2000/svg";

// SVG elements need createElementNS - use object for O(1) lookup
const SVG_TAGS: Record<string, 1> = {
  svg: 1,
  path: 1,
  circle: 1,
  ellipse: 1,
  line: 1,
  polygon: 1,
  polyline: 1,
  rect: 1,
  g: 1,
  defs: 1,
  clipPath: 1,
  mask: 1,
  pattern: 1,
  marker: 1,
  symbol: 1,
  use: 1,
  text: 1,
  tspan: 1,
  textPath: 1,
  image: 1,
  foreignObject: 1,
  linearGradient: 1,
  radialGradient: 1,
  stop: 1,
  filter: 1,
  feBlend: 1,
  feColorMatrix: 1,
  feComponentTransfer: 1,
  feComposite: 1,
  feConvolveMatrix: 1,
  feDiffuseLighting: 1,
  feDisplacementMap: 1,
  feDistantLight: 1,
  feFlood: 1,
  feFuncA: 1,
  feFuncB: 1,
  feFuncG: 1,
  feFuncR: 1,
  feGaussianBlur: 1,
  feImage: 1,
  feMerge: 1,
  feMergeNode: 1,
  feMorphology: 1,
  feOffset: 1,
  fePointLight: 1,
  feSpecularLighting: 1,
  feSpotLight: 1,
  feTile: 1,
  feTurbulence: 1,
  animate: 1,
  animateMotion: 1,
  animateTransform: 1,
};

// CSS properties that don't need 'px' suffix
const CSS_NUMBER_PROPS: Record<string, 1> = {
  "z-index": 1,
  opacity: 1,
  flex: 1,
  "flex-grow": 1,
  "flex-shrink": 1,
  order: 1,
  zoom: 1,
  "line-height": 1,
  "font-weight": 1,
  "column-count": 1,
  "fill-opacity": 1,
  "stroke-opacity": 1,
  orphans: 1,
  widows: 1,
};

// CODESIGN §3.10.1: the properties the USER also writes. Their channel compares
// against the element rather than against the last framework write, because for
// these two writers exist and only one of them is the framework. Contenteditable
// text is in the set too and is not spelled here: it arrives only through
// `bind:`, which resolves it from the tag.
// Keyed `tag:property`, with `*` for a property no tag restricts, because the
// question is not "can this property be written" but "can the USER write it on
// THIS element". `<option value="one">` answers no — the user toggles an
// option's `selected`, never its `value` — and the difference is not academic:
// `option.value` falls back to the option's TEXT, so a compare against the
// element reports "already holds it" and the reflected attribute never appears.
const USER_MUTABLE_PROPS: Record<string, 1> = {
  "input:value": 1,
  "textarea:value": 1,
  "select:value": 1,
  "input:checked": 1,
  "input:indeterminate": 1,
  "option:selected": 1,
  "details:open": 1,
  "dialog:open": 1,
  "audio:currentTime": 1,
  "video:currentTime": 1,
  "audio:volume": 1,
  "video:volume": 1,
  "*:scrollTop": 1,
  "*:scrollLeft": 1,
};

/** The property halves of `USER_MUTABLE_PROPS`, so the tag is only computed for a name that could need it. */
const USER_MUTABLE_NAMES = new Set(
  Object.keys(USER_MUTABLE_PROPS).map((k) => k.slice(k.indexOf(":") + 1)),
);

function isUserMutable(tag: string, name: string): boolean {
  if (!USER_MUTABLE_NAMES.has(name)) return false;
  return `*:${name}` in USER_MUTABLE_PROPS || `${tag.toLowerCase()}:${name}` in USER_MUTABLE_PROPS;
}

// Properties that should be set directly on the element (not as attributes)
const DOM_PROPS: Record<string, 1> = {
  value: 1,
  checked: 1,
  selected: 1,
  disabled: 1,
  readOnly: 1,
  multiple: 1,
  indeterminate: 1,
  defaultChecked: 1,
  defaultValue: 1,
  innerHTML: 1,
  innerText: 1,
  textContent: 1,
};

// Events delegated to a single document-level listener (Solid's list).
// Handlers are stored on the element as `$$<type>`; the document listener
// walks up from the event target calling them, respecting stopPropagation.
const DELEGATED_EVENTS = new Set([
  "beforeinput",
  "click",
  "dblclick",
  "contextmenu",
  "focusin",
  "focusout",
  "input",
  "keydown",
  "keyup",
  "mousedown",
  "mousemove",
  "mouseout",
  "mouseover",
  "mouseup",
  "pointerdown",
  "pointermove",
  "pointerout",
  "pointerover",
  "pointerup",
  "touchend",
  "touchmove",
  "touchstart",
]);

const installedDelegatedEvents = new Set<string>();

// A document listener for one of these can never fire from a descendant, so a
// compiler that emits delegateEvents([...]) for one has produced a dead handler.
const NON_BUBBLING_EVENTS = new Set([
  "abort",
  "blur",
  "error",
  "focus",
  "load",
  "mouseenter",
  "mouseleave",
  "pointerenter",
  "pointerleave",
  "resize",
  "scroll",
  "unload",
]);

const warnedNonBubbling = new Set<string>();

/** A delegated handler: plain listener or [handler, data] tuple (the tuple
 * form lets compiled list rows share one function without per-row closures) */
type DelegatedHandler = EventListener | [(data: unknown, e: Event) => void, unknown];

/**
 * The expando the compiler writes beside `$$<type>`: the scope that owned the
 * element when the handler was bound. One per element rather than one per event
 * type, so `$$<type>` keeps its shape exactly (a function or a `[fn, data]`
 * tuple, and no `$$<type>Data` in this runtime).
 */
const SCOPE_KEY = "$$s";

/**
 * E2 entry point #6. A handler is code the framework invoked, so the framework
 * owns its failure: the throw routes to the nearest `ERROR_BOUNDARY` on the
 * owning scope's chain instead of escaping to `window.onerror`. With no boundary
 * above it the error is rethrown, which is what it did before.
 *
 * `NotReadyError` is re-thrown by the boundary's own handler (E2.3), so it
 * passes through here without a second test.
 */
function routeError(scope: Scope | null, error: unknown): void {
  const routed = scope === null ? CONTEXT_MISS : lookupContext(scope, ERROR_BOUNDARY);
  if (routed !== CONTEXT_MISS && typeof routed === "function") {
    (routed as (err: unknown) => void)(error);
    return;
  }
  throw error;
}

function scopeOf(node: Node): Scope | null {
  return ((node as Node & Record<string, unknown>)[SCOPE_KEY] as Scope | undefined) ?? null;
}

function delegatedEventHandler(e: Event): void {
  const key = `$$${e.type}`;
  let node: Node | null = ((e.composedPath?.()[0] as Node | undefined) ?? e.target) as Node | null;

  // Reflect the element whose handler is running, like native bubbling
  Object.defineProperty(e, "currentTarget", {
    configurable: true,
    get() {
      return node ?? document;
    },
  });

  try {
    while (node) {
      const handler = (node as Node & Record<string, unknown>)[key] as DelegatedHandler | undefined;
      if (handler && !(node as Partial<HTMLButtonElement>).disabled) {
        const owner = scopeOf(node);
        try {
          // The compiled path writes this expando ITSELF — `_el$1.$$click = h` —
          // so `delegate`'s guard never sees it and this is the only place a
          // Block forwarded into a handler slot can be caught. Invoked, it would
          // take the Event as its scope: rule 3's guard tests `undefined` and an
          // Event is not undefined.
          refuseBlock(handler, `on${e.type}`);
          if (Array.isArray(handler)) refuseBlock(handler[0], `on${e.type}`);
          // O4.5/C1: the handler's own work is owned by the scope the compiler
          // stapled to the element, not by `CURRENT` — which at dispatch is
          // null, so an `effect` or an `onCleanup` created here became an
          // ORPHAN that the next flush released, owned by nobody, forever.
          ownedBy(owner, "handler", () => {
            if (typeof handler === "function") {
              handler.call(node, e);
            } else if (Array.isArray(handler) && typeof handler[0] === "function") {
              handler[0].call(node, handler[1], e);
            }
          });
        } catch (error) {
          routeError(owner, error);
        }
        if (e.cancelBubble) return;
      }
      node =
        (node.parentNode as Node | null) ??
        ((node as Partial<ShadowRoot>).host as Node | undefined) ??
        null;
    }
  } finally {
    // The override outlives the walk otherwise, so anything reading
    // currentTarget after dispatch would see `document` forever.
    delete (e as Partial<Record<"currentTarget", unknown>>).currentTarget;
  }
}

function isEventHandlerValue(value: unknown): boolean {
  return typeof value === "function" || (Array.isArray(value) && typeof value[0] === "function");
}

/** Wrap a tuple handler for direct (non-delegated) listeners */
function toListener(value: DelegatedHandler): EventListener {
  if (typeof value === "function") return value;
  return (e: Event) => value[0](value[1], e);
}

function ensureDelegatedListener(type: string): void {
  if (installedDelegatedEvents.has(type)) return;
  installedDelegatedEvents.add(type);
  document.addEventListener(type, delegatedEventHandler);
}

/**
 * Install the document-level listener for each event type, idempotently.
 *
 * Compiled output writes handlers straight to the element as `$$<type>`
 * (a function, or a `[fn, data]` tuple) and calls this once per module for
 * the types it emitted; without it those expandos are dead, because nothing
 * is listening.
 */
export function delegateEvents(types: string[]): void {
  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    if (NON_BUBBLING_EVENTS.has(type) && !warnedNonBubbling.has(type)) {
      warnedNonBubbling.add(type);
      console.warn(
        `delegateEvents(["${type}"]): "${type}" does not bubble, so a $$${type} handler never runs. Bind it directly instead.`,
      );
    }
    ensureDelegatedListener(type);
  }
}

/**
 * Remove the document-level listeners `delegateEvents` installed, so the next
 * render starts from nothing.
 *
 * `installedDelegatedEvents` is module state that outlives any scope, so two
 * renders in one process share it: the second inherits the first's listeners
 * and its `$$<type>` expandos work whether or not it called `delegateEvents`
 * itself. That makes the call unfalsifiable by any test that renders twice —
 * a compiler that dropped it would still look green. Tear the state down
 * between renders and the assertion has teeth again.
 */
export function clearDelegatedEvents(types?: string[]): void {
  const removing = types ?? [...installedDelegatedEvents];
  for (let i = 0; i < removing.length; i++) {
    const type = removing[i];
    if (!installedDelegatedEvents.delete(type)) continue;
    document.removeEventListener(type, delegatedEventHandler);
  }
}

// Cache for kebab-case conversions
const kebabCache = new Map<string, string>();

/**
 * Convert camelCase to kebab-case (cached)
 */
function toKebabCase(str: string): string {
  let result = kebabCache.get(str);
  if (result === undefined) {
    result = str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
    kebabCache.set(str, result);
  }
  return result;
}

/** Array of JSX elements */
export type ArrayElement = JSXElement[];

/**
 * JSXElement type that components can return
 * Matches SolidJS's JSX.Element type exactly
 * The (string & {}) pattern allows string literals while avoiding widening
 */
export type JSXElement = Node | ArrayElement | (string & {}) | number | boolean | null | undefined;

// Re-export as Element for convenience
export type { JSXElement as Element };

/**
 * `<Dynamic component={c}>` — §3.13 item 4, which is the whole reason this
 * exists: a component or a tag whose value is not a module-local `const` cannot
 * be resolved at compile time, so the choice is made here and nowhere else.
 *
 * The compiler has already done everything else. The key is a `branch`'s, so
 * the swap and the teardown are the primitive's; the props are a SOURCE LIST
 * (C9), not a copied object; the children are a Block inside it. What is left
 * is one `typeof` — and the string arm builds through `spread` and `insert`,
 * the same two entry points every other element goes through, rather than the
 * fifth element-creation path `createDynamicElement` used to be.
 */
export function dyn(
  s: Scope | null,
  component: Cell<string | ((s: Scope | null, props: Record<string, unknown>) => unknown)>,
  props: Record<string, unknown>,
): unknown {
  // The branch key already tracks this; reading it again inside the body would
  // make the body's own construction a dependency of the swap that created it.
  const resolved = untrack(component as () => unknown);
  if (resolved === null || resolved === undefined || resolved === false) return null;
  if (typeof resolved !== "string") {
    return (resolved as (s: Scope | null, props: Record<string, unknown>) => unknown)(s, props);
  }
  return element(s, resolved, props);
}

/**
 * One element, by tag NAME, with a props source list — the shape a template
 * cannot express and the only element-creation path beside `template()`.
 *
 * Two callers, both of them the compiler's: `dyn`'s string arm, and the
 * intrinsic P1 refuses because the tree builder would not produce it as written
 * (`<td>` outside a row, `<body>`). Everything it does goes through the same
 * two entry points a compiled element goes through — `spread` for the props,
 * `insert` for the children — so there is no second answer here to what a prop
 * or a child means.
 *
 * A subtree built here has no counterpart on the wire for a walk to claim: the
 * string backend serialised it inline as one hole's value. `withoutClaim` says
 * so, and the enclosing `insert` reconciles the server's nodes away instead.
 */
export function element(s: Scope | null, tag: string, props: Record<string, unknown>): Element {
  return withoutClaim(() => {
    const node =
      tag in SVG_TAGS ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    spread(s, node, props);
    const children = props.children;
    if (children !== undefined && children !== null) insert(s, node, children as Child);
    return node;
  });
}

/**
 * A resolved CHANNEL — `CODESIGN.md` §3.5.
 *
 * The compiler picks one of these at compile time from `NameFlags` plus the
 * element's namespace, so nothing here re-derives attribute-vs-property,
 * boolean-ness or namespace-sensitivity from the name. `name` is already
 * normalised and kebab-cased where the namespace calls for it; a channel that
 * writes a fixed name ignores the argument.
 *
 * `prev` is what this channel returned last time — the APPLIED representation,
 * which for `class` is the normalised string and for a style object is the css
 * map — and the return value is what the caller threads back in.
 */
export type Channel = (element: Element, name: string, value: unknown, prev?: unknown) => unknown;

/** `setAttribute` / `removeAttribute`. A boolean value toggles the attribute. */
export function setAttr(element: Element, name: string, value: unknown, prev?: unknown): unknown {
  if (value === prev) return prev;
  if (isBoolean(value)) {
    if (value) {
      element.setAttribute(name, "");
    } else {
      element.removeAttribute(name);
    }
    return value;
  }
  if (isNullish(value)) {
    element.removeAttribute(name);
    return value;
  }
  element.setAttribute(name, toString(value));
  return value;
}

/**
 * `element[name] = value`. The `DOM_PROPS` channel, and the one a template may
 * never bake: HTML would set the default attribute, which diverges on a dirty
 * form field.
 */
export function setDomProp(
  element: Element,
  name: string,
  value: unknown,
  prev?: unknown,
): unknown {
  if (value === prev) return prev;
  setProperty(element, name, value);
  return value;
}

/**
 * The user-mutable channel (§3.10.1). It takes NO `prev`, and that is the whole
 * rule rather than an omission: `prev` is what the FRAMEWORK last wrote, and for
 * these properties the user writes too. A handler that rejects a keystroke
 * leaves the element holding text no signal ever contained, `prev` still agrees
 * with the signal, and a cached compare then never repairs it.
 *
 * The compiler emits this channel only for the names that need it (`Diff` is
 * `Always`, so the record's guard never suppresses the repair) and the cheap
 * cached compare everywhere else, which is why comparing against the DOM costs
 * nothing on the 99% of props no user can touch.
 */
export function setLive(element: Element, name: string, value: unknown): unknown {
  writeLive(element, name, value);
  return value;
}

/**
 * `bool:` — presence, not text. Distinct from `setAttr`'s boolean branch, which
 * only fires for a value that IS a boolean: here truthiness decides, so
 * `bool:hidden={count()}` is the author saying what the name means rather than
 * the runtime guessing from the value that arrived.
 */
export function setBool(element: Element, name: string, value: unknown, prev?: unknown): unknown {
  const on = Boolean(value);
  if (on === prev) return on;
  if (on) {
    element.setAttribute(name, "");
  } else {
    element.removeAttribute(name);
  }
  return on;
}

/**
 * The `class` channel, normalised from a string, array or object — and it emits
 * only the tokens it OWNS.
 *
 * `element.className = …` owns the whole attribute, so every class another
 * channel put there — `classList`, a `ref`, a directive — is erased the moment
 * this value changes. B1/B2 remove that in two places, and they cover different
 * cases: the fused record guards `class` on its own field, so an UNRELATED prop
 * can no longer reach this channel at all, and the branch below keeps a real
 * class change from taking anything it did not write.
 *
 * The test is one string compare: if the attribute still reads exactly what this
 * channel last applied, nothing else is holding a token and the value is written
 * WHOLE — byte for byte, which is what keeps a class string round-tripping
 * through the DOM unchanged (duplicate tokens, runs of spaces, and separators
 * `DOMTokenList` does not treat as whitespace all survive). Only when the
 * attribute has been changed by someone else does the write become a token diff,
 * and only that case pays for one.
 *
 * A ONE-SHOT caller — `setProp`, the un-compiled walk, anything that does not
 * thread `prev` — has no `prev` to compare against, and reading `null` for it
 * made every write after the first an additive diff that removed nothing:
 * twenty thousand `setProp(el, "class", …)` calls left twenty thousand tokens on
 * the element. The channel therefore remembers its own last write on the element
 * (`$$class`, beside `$$s`), which is what "what this channel last applied"
 * means when the caller cannot say. It still removes only what it OWNS, so a
 * token another channel put there survives.
 */
export function setClass(element: Element, _name: string, value: unknown, prev?: unknown): unknown {
  const className = classToString(value);
  if (className === prev) return prev;
  const held = element as Element & { $$class?: string | null };
  const owned = prev === undefined ? (held.$$class ?? null) : (prev as string | null);
  const current = element.getAttribute("class");
  held.$$class = className;
  if (current === owned) {
    if (className === null) {
      element.removeAttribute("class");
    } else if (element.namespaceURI === SVG_NS) {
      // SVGElement.className is a read-only SVGAnimatedString
      element.setAttribute("class", className);
    } else {
      (element as Element & { className: string }).className = className;
    }
    return className;
  }
  const tokens = element.classList;
  const next = splitClass(className);
  for (const token of splitClass(owned)) {
    if (!next.has(token)) tokens.remove(token);
  }
  for (const token of next) {
    tokens.add(token);
  }
  if (className === null && tokens.length === 0) element.removeAttribute("class");
  return className;
}

function splitClass(value: string | null): Set<string> {
  const out = new Set<string>();
  if (value === null) return out;
  for (const token of value.split(/[ \t\n\f\r]+/)) {
    if (token !== "") out.add(token);
  }
  return out;
}

/** The whole `style` attribute: a css string, or an object diffed per property. */
export function setStyle(element: Element, _name: string, value: unknown, prev?: unknown): unknown {
  const style = (element as Partial<ElementCSSInlineStyle>).style;
  if (!style) return prev;
  if (isObject(value)) {
    return diffStyleObjects(style, value, isStyleMap(prev) ? prev : null);
  }
  if (isString(value)) {
    // setAttribute, not style.cssText: cssText round-trips through the CSSOM
    // serializer, so the style attribute comes back re-written (a trailing ";"
    // at minimum). That makes a compile-time-folded `style="…"` in a template
    // unable to match this path byte for byte, which blocks folding a literal
    // style into the template at all.
    if (value !== prev) element.setAttribute("style", value);
    return value;
  }
  return prev;
}

/** One css declaration, with the property name resolved at compile time. */
export function setStyleProp(
  element: Element,
  name: string,
  value: unknown,
  prev?: unknown,
): unknown {
  if (value === prev) return prev;
  const style = (element as Partial<ElementCSSInlineStyle>).style;
  if (style) setStylePropDirect(style, name, value);
  return value;
}

/** Additive per-key toggling, diffed against the previously applied map. */
export function setClassList(
  element: Element,
  _name: string,
  value: unknown,
  prev?: unknown,
): unknown {
  return diffClassList(element, isObject(value) ? value : null, isClassMap(prev) ? prev : null);
}

/** `dangerouslySetInnerHTML={{ __html }}`. */
export function setHtml(element: Element, _name: string, value: unknown, prev?: unknown): unknown {
  if (!isObject(value)) return prev;
  const html = (value as { __html?: string }).__html ?? "";
  // A hydrating element already HAS these bytes, and `innerHTML =` would throw
  // away every node the server sent inside it — the same destruction the
  // sole-occupant `textContent` write does at a hole, in the one channel that
  // cannot go through `insert`. Comparing the serialisation is exactly what the
  // write would have produced, so skipping it is a no-op with the nodes kept.
  if (prev === undefined && hydrating() && element.innerHTML === html) return html;
  if (html !== prev) element.innerHTML = html;
  return html;
}

/**
 * `ref` as a channel rather than a prop. The compiled path calls `ref()` below,
 * which owns the cleanup a callback returns; this is the shape the un-compiled
 * `createElement` walk applies, and it registers nothing, exactly as before.
 */
export function setRef(element: Element, _name: string, value: unknown, prev?: unknown): unknown {
  applyRefs(element, value);
  return prev;
}

/**
 * §3.0 rule 3 at the `ref` slot. `block`'s entry guard fires on
 * `scope === undefined`, and this is one of the two slots where the value is
 * invoked with something ELSE — the Element — so the guard is structurally
 * unreachable and a forwarded Block would run with a DOM node as its scope.
 * `requireScope` accepts it, everything below it is parented to that node, and
 * root disposal never reaches any of it. The brand is a property of the VALUE
 * (C3.8), so the test belongs here, at the read, exactly as `readSlot` puts it.
 */
function refuseBlock(target: unknown, origin: string): void {
  if (isBlock(target)) throw new ScopeMissingError(`${origin} (a Block reached a Cell slot)`);
}

/** Every ref shape, returning whatever the callbacks handed back as cleanups. */
function applyRefs(element: Element, value: unknown): (() => void)[] {
  const undo: (() => void)[] = [];
  const one = (target: unknown): void => {
    refuseBlock(target, "ref");
    if (isRefCallback(target)) {
      const back = (target as (el: Element) => unknown)(element);
      // The LAUNDERED shape: an un-compiled caller wrapping a forwarded prop in
      // `() => x` carries no brand, so the test above walks past it and the
      // Block arrives here as the "cleanup" the callback returned. Registering
      // it as a cleanup would run a Block at disposal with no arguments at all.
      refuseBlock(back, "ref");
      if (typeof back === "function") undo.push(back as () => void);
    } else if (isObject(target) && "current" in target) {
      setProperty(target, "current", element);
    }
  };
  if (isArray(value)) {
    for (const target of value) one(target);
  } else {
    one(value);
  }
  return undo;
}

/**
 * M3/E2 entry point #7. A ref registration owned by the scope the element
 * belongs to: a callback that returns a function has it run at disposal, and a
 * callback that throws routes to the enclosing boundary instead of aborting
 * construction.
 */
export function ref(s: Scope | null, element: Element, value: unknown): void {
  const owner = requireScope(s, "ref");
  let undo: (() => void)[] = [];
  try {
    undo = applyRefs(element, value);
  } catch (error) {
    routeError(owner, error);
  }
  if (undo.length === 0 || owner === null) return;
  underScope(owner, "ref", () => {
    onCleanup(() => {
      for (const fn of undo) fn();
    });
  });
}

/**
 * B4 — a listener dies with its position. `addEventListener` paired with a
 * cleanup on the scope the element belongs to, so removal costs no bookkeeping
 * and cannot be forgotten. A handler that throws routes to the boundary (E2 #6).
 *
 * The delegated set never reaches here: those are `$$<type>` expandos plus one
 * `delegateEvents` call per module, and that protocol is unchanged.
 */
export function listen(
  s: Scope | null,
  element: EventTarget,
  type: string,
  handler: EventListener,
  options?: boolean | AddEventListenerOptions,
): void {
  const owner = requireScope(s, "listen");
  refuseBlock(handler, `on${type}`);
  const routed = routedListener(owner, element, handler);
  element.addEventListener(type, routed, options);
  if (owner === null) return;
  underScope(owner, "listen", () => {
    onCleanup(() => element.removeEventListener(type, routed, options));
  });
}

/**
 * E2.2's half of `listen`, shared so the two non-delegated channels cannot
 * drift: `spread` binds its own listeners and used to bind them RAW, so a throw
 * out of one escaped `dispatchEvent` to `window.onerror` instead of reaching
 * the enclosing boundary.
 */
function routedListener(
  owner: Scope | null,
  element: EventTarget,
  handler: EventListener,
): EventListener {
  return function (this: unknown, e: Event): void {
    try {
      ownedBy(owner, "handler", () => {
        handler.call(element, e);
      });
    } catch (error) {
      routeError(owner, error);
    }
  };
}

/**
 * The delegated half of the same registration. Compiled code writes the expando
 * itself — `_n1.$$click = h` — and this exists for the un-compiled walk and for
 * `spread`, so both record the owning scope the dispatcher routes a throw
 * through.
 */
export function delegate(
  s: Scope | null,
  element: Element,
  type: string,
  handler: DelegatedHandler | undefined,
): void {
  const owner = requireScope(s, "delegate");
  refuseBlock(handler, `on${type}`);
  if (Array.isArray(handler)) refuseBlock(handler[0], `on${type}`);
  (element as Element & Record<string, unknown>)[`$$${type}`] = handler;
  (element as Element & Record<string, unknown>)[SCOPE_KEY] = owner;
  if (handler !== undefined) ensureDelegatedListener(type);
}

/**
 * The one question channel resolution CANNOT answer at compile time (§3.13):
 * whether the value that arrived is a live Cell. The CHANNEL is the compiler's,
 * passed in; only liveness is decided here.
 */
export function bindProp(
  s: Scope | null,
  element: Element,
  write: Channel,
  name: string,
  value: unknown,
): void {
  const given = requireScope(s, "setProp");
  // §3.0 rule 2 / §3.13: an attribute is a CELL slot. A Block forwarded into one
  // is the asymmetry the rule is about, and it throws here rather than being
  // invoked with `undefined` and stringified into the attribute.
  if (isBlock(value)) {
    throw new ScopeMissingError(`setProp ${name} (a Block reached a Cell slot)`);
  }
  if (!isSignalGetter(value)) {
    write(element, name, value, undefined);
    return;
  }
  // O4.5: the effect belongs to the scope this call was GIVEN, not to whatever
  // happened to be current at the call site.
  //
  // The split form is the same one the compiled path emits (B2/R2): the READ is
  // the tracked half and the WRITE is not, so a channel that touches the DOM —
  // `namespaceURI`, `classList`, `style` — cannot acquire a dependency here
  // either. A single tracked function would make the two paths disagree about
  // what an element effect depends on, which is a divergence no DOM comparison
  // would show until something in a channel started reading.
  ownedBy(given, "setProp", () => {
    let prev: unknown;
    renderEffect(
      // C3.8 on the READ, not only on the value: a Cell that YIELDS a Block
      // carries no brand, so only a test at the read site can see it.
      () => readSlot(value, `setProp ${name}`),
      (next) => {
        prev = write(element, name, next, prev);
      },
    );
  });
}

/**
 * O4.5 for the element-binding channel: the effect belongs to the scope the
 * enclosing Block was HANDED, not to whatever the call site left current.
 *
 * This is what the compiled attribute/class/style/domprop path emits, and it
 * used to emit a bare `renderEffect(compute, apply)` taking no scope at all —
 * so `insert` and `setProp` honoured the argument while the channel beside them
 * followed `CURRENT`, and one component could split its ownership across two
 * scopes. The scope-first shape makes a mistiming a missing argument rather
 * than a silent reparent, and it is why `brand` can see these components: a
 * body whose only reactive work is an element binding now names `_s$`.
 */
export function bindEffect<T>(
  s: Scope | null,
  compute: (prev?: T) => T | void | (() => void),
  apply?: (value: T, prev: T | undefined) => void | (() => void),
): void {
  const given = requireScope(s, "bindEffect");
  ownedBy(given, "bindEffect", () => {
    renderEffect(compute, apply);
  });
}

/**
 * A counter every `bind:` effect reads and every reported edit bumps. See the
 * paragraph in `bindValue`'s listener for why it has to be shared rather than
 * per-element. `equals: false` because the VALUE is meaningless — what is being
 * published is that an edit happened at all.
 *
 * Keyed by the BOUND SIGNAL, not module-wide. The problem the counter exists
 * for is a pair the scheduler cannot see — (signal, element) — and every
 * element that can be in that pair with a given edit is bound to the same
 * signal: the radio group is N elements behind one signal, and a veto in the
 * author's own handler vetoes a write to that signal. A module-wide counter
 * would make one keystroke re-run every two-way binding in the application,
 * which is O(bound fields) per keystroke for no reachable case. The map is
 * weak, so a counter dies with the signal it belongs to.
 */
const reportedEdits = new WeakMap<object, Signal<number>>();

function editsOf(value: object): Signal<number> {
  let counter = reportedEdits.get(value);
  if (counter === undefined) {
    counter = signal(0, { equals: false, ownedWrite: true });
    reportedEdits.set(value, counter);
  }
  return counter;
}

/**
 * `bind:` — §3.10 whole. The property, the event that reports a user edit and
 * the coercion are all resolved at compile time; what is left is the write, the
 * read-back, and the two things that make a controlled input actually work.
 *
 * **The write compares against the ELEMENT** (`writeLive`), not against the
 * last framework write, and it preserves the caret and the focus of whatever
 * the user is inside.
 *
 * **The signal is re-asserted after every reported edit**, and that is the half
 * a DOM-compare alone cannot supply. When a setter REJECTS or NORMALISES a
 * keystroke the signal does not change, so the effect never re-runs and no
 * comparison of any kind gets a chance to run: without this line the element
 * keeps text the signal never held, permanently. With it the repair is
 * synchronous — inside the same event, before paint, so there is no flash of
 * the rejected character — and it is a no-op in the ordinary case because the
 * DOM already holds what the signal holds.
 */
export function bindValue(
  s: Scope | null,
  element: Element,
  name: string,
  type: string,
  value: unknown,
): void {
  const given = requireScope(s, "bind");
  const target = element as Element & Record<string, unknown>;
  const set = (value as { set?: (next: unknown) => void } | null)?.set;
  if (typeof set !== "function") {
    emitDiagnostic(
      "BIND_TARGET_NOT_WRITABLE",
      "error",
      `bind:${name} needs a writable signal; it was given ${typeof value}, which can be read but not written.`,
    );
  }
  const write = (next: unknown): void => {
    if (name === "group") {
      writeLive(element, "checked", next === target.value);
      return;
    }
    // A `FileList` is the only thing `files` accepts and the only thing an
    // author can have got hold of; anything else — a signal that starts `null`
    // — would throw where skipping is what the author meant.
    if (name === "files" && !(next !== null && typeof next === "object")) return;
    writeLive(element, name, next);
  };

  const edits = isSignalGetter(value) ? editsOf(value as unknown as object) : null;
  if (edits !== null) {
    ownedBy(given, "bind", () => {
      renderEffect(() => {
        edits();
        write(readSlot(value, `bind:${name}`));
      });
    });
  } else {
    write(value);
  }
  if (typeof set !== "function") return;
  listen(given, element, type, () => {
    // `bind:group` is the one channel whose reported value is not the property
    // it writes: a radio reports the VALUE of the button that is now checked,
    // and the one being turned OFF reports nothing — its newly-checked sibling
    // fires its own `change` and that is the event carrying the answer.
    if (name === "group") {
      if (target.checked !== true) return;
      set.call(value, target.value);
    } else {
      set.call(value, target[name]);
    }
    if (edits === null) return;
    // Synchronously, inside the event: see the paragraph above.
    write(untrack(() => readSlot(value, `bind:${name}`)));
    // And once more at the next flush, through the counter every two-way
    // binding subscribes to. The EFFECT cannot be relied on for the rest of the
    // turn: if anything else — another handler for the same event, a veto in the
    // author's own `onChange`, the sibling radio the browser just unchecked —
    // leaves the signal holding the value it held BEFORE the edit, the scheduler
    // sees no change at all and correctly declines to re-run, while the elements
    // are holding what the user did. That is B6's two-writer problem one level
    // down, in the dedupe rather than in the channel, and it cannot be fixed
    // per-element: a radio group is N elements and one signal, and the edit is
    // reported on exactly one of them.
    //
    // So a reported edit invalidates every two-way binding ON THE SAME SIGNAL.
    // Each re-run costs one signal read and one DOM-compare that skips, which is
    // nothing against the keystroke that caused it, and it is the only mechanism
    // that sees a pair the scheduler cannot: (signal, element).
    edits.set(edits.peek() + 1);
  });
}

/**
 * Name → channel, for the UN-COMPILED path only. The compiled path never calls
 * this: `CODESIGN.md` §3.5 says there is no `setProp` dispatcher on it, and this
 * is the dispatcher, kept alive for `createElement` and `spread` — which §4.1
 * retires at M9 — and as the definition the generated Rust tables are read out
 * of, so the two resolutions cannot drift.
 */
function channelOf(key: string, isSvg: boolean, tag: string): Channel {
  if (key === "class") return setClass;
  if (key === "className") return setClass;
  if (key === "style") return setStyle;
  if (key === "classList") return setClassList;
  if (key === "ref") return setRef;
  if (key === "dangerouslySetInnerHTML") return setHtml;
  // §3.10.1 before the plain property channel: these are properties too, and
  // what separates them is who else writes them.
  if (!isSvg && isUserMutable(tag, key)) return setLive as Channel;
  // Form-field exceptions stay properties (value, checked, selected, ...). The
  // runtime takes that branch only outside the SVG namespace.
  if (!isSvg && key in DOM_PROPS) return setDomProp;
  return setAttr;
}

/**
 * The attribute name the channel is handed: `className`/`htmlFor` normalised,
 * and kebab-cased inside the SVG namespace with the two documented exemptions.
 */
function attrNameOf(name: string, isSvg: boolean): string {
  let propKey = name === "className" ? "class" : name === "htmlFor" ? "for" : name;
  if (isSvg && propKey !== "class" && propKey !== "viewBox") {
    propKey = toKebabCase(propKey);
  }
  return propKey;
}

const STYLE_MAP = Symbol("barq-style-map");

interface StyleMap extends Record<string, string> {}

function isStyleMap(value: unknown): value is StyleMap {
  return typeof value === "object" && value !== null && STYLE_MAP in value;
}

/**
 * Apply a style object, removing properties that vanished and only
 * writing properties whose value changed. Returns the applied css map.
 */
function diffStyleObjects(
  style: CSSStyleDeclaration,
  next: Record<string, unknown>,
  prev: StyleMap | null,
): StyleMap {
  const applied = Object.defineProperty({} as StyleMap, STYLE_MAP, { value: true });

  for (const prop in next) {
    const raw = next[prop];
    const cssProp = toKebabCase(prop);

    // Per-property reactive values keep their own effect (static object case)
    if (isSignalGetter(raw)) {
      renderEffect(() => {
        setStylePropDirect(style, cssProp, (raw as () => unknown)());
      });
      continue;
    }

    if (raw === null || raw === undefined || raw === false) continue;

    const cssValue =
      typeof raw === "number" && raw !== 0 && !(cssProp in CSS_NUMBER_PROPS)
        ? `${raw}px`
        : toString(raw);
    applied[cssProp] = cssValue;
    if (!prev || prev[cssProp] !== cssValue) {
      style.setProperty(cssProp, cssValue);
    }
  }

  if (prev) {
    for (const cssProp in prev) {
      if (!(cssProp in applied)) {
        style.removeProperty(cssProp);
      }
    }
  }

  return applied;
}

const CLASS_MAP = Symbol("barq-class-map");

interface ClassMap extends Record<string, true> {}

function isClassMap(value: unknown): value is ClassMap {
  return typeof value === "object" && value !== null && CLASS_MAP in value;
}

/**
 * Apply a classList object: toggle every truthy key on, remove the keys that
 * vanished since the previous run, and leave every other class on the element
 * alone. A key may name several classes ("a b"), matching `classList.add`.
 */
function diffClassList(
  element: Element,
  next: Record<string, unknown> | null,
  prev: ClassMap | null,
): ClassMap {
  const applied = Object.defineProperty({} as ClassMap, CLASS_MAP, { value: true });
  const tokens = element.classList;

  for (const key in next) {
    const raw = next[key];

    // Per-key reactive values keep their own effect (static object case)
    if (isSignalGetter(raw)) {
      renderEffect(() => {
        toggleClassTokens(tokens, key, Boolean((raw as () => unknown)()));
      });
      continue;
    }

    if (!raw) continue;
    applied[key] = true;
    if (!prev || !prev[key]) toggleClassTokens(tokens, key, true);
  }

  if (prev) {
    for (const key in prev) {
      if (!(key in applied)) toggleClassTokens(tokens, key, false);
    }
  }

  return applied;
}

function toggleClassTokens(tokens: DOMTokenList, key: string, on: boolean): void {
  for (const token of key.split(/\s+/)) {
    if (token === "") continue;
    if (on) {
      tokens.add(token);
    } else {
      tokens.remove(token);
    }
  }
}

/** Normalize a class value (string, array, or object) to a string or null */
export function classToString(value: unknown): string | null {
  if (isNullish(value) || value === false) return null;
  if (isString(value)) return value;
  if (isArray<string>(value)) return value.filter(Boolean).join(" ");
  if (isObject(value)) {
    let className = "";
    for (const k in value) {
      if (value[k]) {
        className += (className ? " " : "") + k;
      }
    }
    return className;
  }
  return null;
}

/**
 * Serialize a style value the way `diffStyleObjects` writes it into the CSSOM,
 * for the string backend. A string is returned untouched, matching
 * `applyResolvedProp`'s deliberate `setAttribute` path.
 */
export function styleToString(value: unknown): string | null {
  if (isString(value)) return value;
  if (!isObject(value)) return null;
  let css = "";
  for (const prop in value) {
    let raw: unknown = value[prop];
    if (isSignalGetter(raw)) raw = (raw as () => unknown)();
    if (raw === null || raw === undefined || raw === false) continue;
    const cssProp = toKebabCase(prop);
    const cssValue =
      typeof raw === "number" && raw !== 0 && !(cssProp in CSS_NUMBER_PROPS)
        ? `${raw}px`
        : toString(raw);
    css += `${css ? " " : ""}${cssProp}: ${cssValue};`;
  }
  return css === "" ? null : css;
}

/**
 * Brand carried by every value the compiler's SSR string mode produces. A
 * module that fell back to this DOM backend (DESIGN §5's eight non-inlinable
 * flow components) can still render a component compiled to strings, and
 * without this it would insert the markup as escaped text.
 *
 * A REGISTERED SYMBOL, and that is the security property: this brand decides
 * whether a value is written as markup or escaped as text, so a shape
 * `JSON.parse` can produce would make every deserialised object an injection
 * point. `Symbol.for` is unreachable from JSON and still identical across two
 * copies of this module, which the `.` and `./server` entries really are.
 */
export const SSR_HTML_BRAND: unique symbol = Symbol.for("barq.ssr.html");

export function isSsrHtml(value: unknown): value is { readonly t: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[SSR_HTML_BRAND] === true &&
    typeof (value as { t?: unknown }).t === "string"
  );
}

function ssrHtmlNodes(value: { readonly t: string }): Node[] {
  const holder = document.createElement("template");
  holder.innerHTML = value.t;
  return Array.from(holder.content.childNodes);
}

/**
 * Set a single style property with pre-computed CSS property name
 */
function setStylePropDirect(style: CSSStyleDeclaration, cssProperty: string, value: unknown): void {
  if (value === null || value === undefined || value === false) {
    style.removeProperty(cssProperty);
    return;
  }

  if (typeof value === "number" && value !== 0 && !(cssProperty in CSS_NUMBER_PROPS)) {
    style.setProperty(cssProperty, `${value}px`);
  } else {
    style.setProperty(cssProperty, toString(value));
  }
}

/**
 * Reading a fragment's children is destructive: whoever reads them inserts
 * them, which MOVES them out, so a second read of the same eager
 * `children`/`fallback` finds an empty fragment and the content is gone for
 * good. Remembering the drained list is what makes a multi-node body survive a
 * hide/show cycle — and target #8 hands the runtime eager bodies as a matter of
 * course, so this is the ordinary path rather than an edge of it.
 */
const drainedFragments = new WeakMap<DocumentFragment, Node[]>();

function drainFragment(fragment: DocumentFragment): Node[] {
  if (fragment.firstChild === null) {
    const remembered = drainedFragments.get(fragment);
    return remembered === undefined ? [] : remembered.slice();
  }
  const nodes: Node[] = [];
  while (fragment.firstChild) {
    nodes.push(fragment.firstChild);
    fragment.removeChild(fragment.firstChild);
  }
  drainedFragments.set(fragment, nodes);
  return nodes.slice();
}

/**
 * Flatten a child value to nodes, reusing previous text nodes positionally
 * when their content matches (avoids re-creating text per update).
 */
function normalizeChildToNodes(value: Child, prev: Node[]): Node[] {
  const out: Node[] = [];

  const visit = (child: Child): void => {
    if (child === null || child === undefined || typeof child === "boolean") return;

    if (child instanceof DocumentFragment) {
      // Fragments dissolve into their children
      for (const node of drainFragment(child)) out.push(node);
      return;
    }

    if (child instanceof Node) {
      out.push(child);
      return;
    }

    if (isSsrHtml(child as unknown)) {
      for (const node of ssrHtmlNodes(child as unknown as { readonly t: string })) out.push(node);
      return;
    }

    if (typeof child === "function") {
      visit((child as (s: unknown) => Child)(getOwner()));
      return;
    }

    if (Array.isArray(child)) {
      for (let i = 0; i < child.length; i++) visit(child[i]);
      return;
    }

    // Primitive: reuse the previous text node at this position when equal
    const text = String(child);
    const candidate = prev[out.length];
    if (candidate && candidate.nodeType === 3 && (candidate as Text).data === text) {
      out.push(candidate);
    } else {
      out.push(document.createTextNode(text));
    }
  };

  visit(value);
  return out;
}

/**
 * Reconcile two node arrays in place (udomdiff: common prefix/suffix,
 * swap shortcut, lazy Map fallback). Keys are node identities - exactly
 * right for fine-grained rendering where rows keep their DOM nodes.
 * Adapted from https://github.com/WebReflection/udomdiff
 */
function reconcileNodeArrays(parent: Node, a: Node[], b: Node[], after: Node | null): void {
  const bLength = b.length;
  let aEnd = a.length;
  let bEnd = bLength;
  let aStart = 0;
  let bStart = 0;
  let map: Map<Node, number> | null = null;

  while (aStart < aEnd || bStart < bEnd) {
    // Common prefix
    if (a[aStart] === b[bStart]) {
      aStart++;
      bStart++;
      continue;
    }
    // Common suffix
    while (a[aEnd - 1] === b[bEnd - 1]) {
      aEnd--;
      bEnd--;
    }
    if (aEnd === aStart) {
      // Append remaining new nodes
      const anchor =
        bEnd < bLength ? (bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart]) : after;
      while (bStart < bEnd) parent.insertBefore(b[bStart++], anchor);
    } else if (bEnd === bStart) {
      // Remove remaining old nodes
      while (aStart < aEnd) {
        if (!map || !map.has(a[aStart])) {
          (a[aStart] as ChildNode).remove();
        }
        aStart++;
      }
    } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
      // Swap backward
      const node = a[--aEnd].nextSibling as Node;
      parent.insertBefore(b[bStart++], a[aStart++].nextSibling);
      parent.insertBefore(b[--bEnd], node);
      a[aEnd] = b[bEnd];
    } else {
      // Map-based fallback
      if (!map) {
        map = new Map();
        for (let i = bStart; i < bEnd; i++) map.set(b[i], i);
      }
      const index = map.get(a[aStart]);
      if (index === undefined) {
        (a[aStart++] as ChildNode).remove();
      } else if (index < bStart || index >= bEnd) {
        aStart++;
      } else {
        // Longest stationary sequence: insert b-prefix or replace
        let sequence = 1;
        let t: number | undefined;
        while (
          aStart + sequence < aEnd &&
          (t = map.get(a[aStart + sequence])) !== undefined &&
          t === index + sequence
        ) {
          sequence++;
        }
        if (sequence > index - bStart) {
          const node = a[aStart];
          while (bStart < index) parent.insertBefore(b[bStart++], node);
        } else {
          parent.replaceChild(b[bStart++], a[aStart++]);
        }
      }
    }
  }
}

const EMPTY_NODES: Node[] = [];

/**
 * Removal, in ONE DOM call when the run being removed is every child its parent
 * has.
 *
 * `clear rows` at 1,000 rows is 1,000 `removeChild` calls where Solid issues a
 * single `textContent = ""`, and in a real Chrome that per-node loop is the
 * dominant term of the whole benchmark: 2.85 ms of the 3.95 ms of JS, against
 * Solid's 2.56 ms for the one call. Each `removeChild` re-checks mutation
 * observers, invalidates style and detaches a layout object on its own; the
 * bulk write does that work once for the parent.
 *
 * The guard is EXACT, not a heuristic, because being wrong here deletes markup
 * this hole does not own. Counting is not enough on its own — a run whose nodes
 * were moved out from under this parent (a `portal`, a directive) could match
 * the count while naming different nodes — so membership is verified as well.
 * That is one `parentNode` read per node against a `removeChild` per node, and
 * the reads do not touch layout.
 */
function removeNodes(nodes: readonly Node[]): void {
  const count = nodes.length;
  if (count === 0) return;
  const host = nodes[0].parentNode;
  if (host !== null && count === host.childNodes.length && allUnder(host, nodes)) {
    host.textContent = "";
    return;
  }
  for (let i = 0; i < count; i++) {
    nodes[i].parentNode?.removeChild(nodes[i]);
  }
}

function allUnder(host: Node, nodes: readonly Node[]): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].parentNode !== host) return false;
  }
  return true;
}

/**
 * Apply `value` into `parent`, replacing whatever this hole rendered last time
 * (`current`), anchored before `marker` (null = end of parent). Returns the
 * nodes the hole now owns.
 *
 * A hole tracks its own nodes instead of fencing them with comment markers, so
 * it costs the nodes it actually renders: a lone text hole is one text node,
 * not a text node between two comments.
 */
function applyInsert(parent: Node, value: Child, current: Node[], marker: Node | null): Node[] {
  const primitive = typeof value === "string" || typeof value === "number";

  if (primitive) {
    // Same text node as last time: write through it
    if (current.length === 1 && current[0].nodeType === 3) {
      (current[0] as Text).data = String(value);
      return current;
    }
    // Sole occupant of its parent: the element is the range, so no bookkeeping
    if (marker === null && current.length === 0 && parent.firstChild === null) {
      parent.textContent = String(value);
      const node = parent.firstChild;
      return node === null ? EMPTY_NODES : [node];
    }
  }

  const next = normalizeChildToNodes(value, current);

  if (current.length === 0) {
    for (let i = 0; i < next.length; i++) parent.insertBefore(next[i], marker);
    return next;
  }

  if (next.length === 0) {
    removeNodes(current);
    return EMPTY_NODES;
  }

  const liveParent = current[0].parentNode ?? parent;
  reconcileNodeArrays(liveParent, current, next, marker);
  return next;
}

/**
 * Run `build` with `given` as `CURRENT`, so everything it creates is owned by
 * the scope the call was HANDED rather than by whatever the call site left
 * current. That is O4.5, and it is what the four flow primitives already do.
 *
 * `null` is left alone deliberately. `requireScope` admits it — the compiler
 * emits `const _s$ = null` for a module-level root — and it names NO owner, so
 * there is nothing for the argument to win. Forcing `CURRENT` to null there
 * turns the effect into an ORPHAN, which `enterRoot` then CLAIMS: ownership
 * would be RELOCATED rather than decided, and relocating it is the M2 bridge
 * O5's registry row is about. Measured, not assumed — doing it unconditionally
 * makes `render(<Tree/>, host)` stop emitting RENDER_SUBTREE_NOT_OWNED, because
 * the root ends up holding the argument's effects after all. That belongs to
 * O5's milestone, with the fixture re-cut in the same change.
 */
function ownedBy(given: Scope | null, origin: string, build: () => void): void {
  if (given === null) {
    build();
    return;
  }
  underScope(given, origin, build);
}

/**
 * Insert a child into `parent` before `marker` (or append when absent), under
 * the scope the enclosing Block was given. CODESIGN §3.3 C6: scope FIRST.
 *
 * Taking it as an argument is what makes §3.0 rule 3 enforceable at no cost. A
 * compiled Block that builds anything reaches here, so a Block invoked with no
 * scope throws where it was mistimed rather than silently constructing under
 * whatever happened to be current — and the ownership trace gets a `given` that
 * was threaded rather than read back off `CURRENT`, which is the one comparison
 * that cannot fail.
 */
export function insert(
  s: Scope | null,
  parent: Node,
  value: Child | (() => Child),
  marker?: Node | null,
  /**
   * `hydration.ts`'s `WHOLE`, emitted only by a `hydratable` build and only at a
   * hole that owns its parent's child list. §12: the string backend wrote no
   * boundary comments there, so the claim is every child of `parent`.
   */
  mode?: number,
): void {
  const given = requireScope(s, "insert");
  let anchor = marker ?? null;

  // An ARRAY holding a function is a live hole, and it is ONE hole.
  //
  // Without this the array went straight to `childToNodes`, which calls each
  // function exactly once and returns nodes — so `<table>{a()}-{b()}</table>`
  // rendered `A-B` and never moved again. It is only reachable where the
  // compiler cannot split the children into holes of their own: `element`'s
  // props, `dyn`'s, a component's `children` (§3.13). Everywhere else P1 emits
  // one `_$insert` per hole and never gets here.
  //
  // ONE effect for the whole array, not one per element, which is what Solid's
  // `insertExpression` does with `normalizeIncomingArray`'s `dynamic` flag and
  // is the right shape for two reasons. It is cheaper — N reads share one
  // effect and one range instead of N of each. And it is the only one that
  // keeps ORDER: N anchorless holes in one parent each append at the end, so
  // the moment one of them re-renders from empty it lands after its siblings
  // instead of between them. That is the interleaving `Anchor::Marker` is
  // mandatory for (DESIGN P5 rule 2), and a single range has no way to hit it.
  if (isArray(value) && (value as Child[]).some(holdsAFunction)) {
    insert(s, parent, () => value as Child, marker, mode);
    return;
  }

  // H1 plus the single-hole blocker, in one line.
  //
  // `<span>{x}</span>` compiles to `<span></span>` and an `insert` with no
  // anchor, and `applyInsert`'s sole-occupant fast path then writes through
  // `parent.textContent` — which on a hydrating page DESTROYS the text node the
  // server sent. Seeding `current` with the claimed nodes is what stops it:
  // that path requires `current.length === 0`, and here it never is. The value
  // then goes through the ordinary reconciler, which writes `.data` on the
  // claimed text node and keeps its identity.
  //
  // This is the "marker restored" answer to `CODESIGN.md` §10 Q4, and it costs
  // the payload §11 Q4 agreed to pay. The alternative — a hydration-aware
  // insert that adopts whatever children it finds — needs no marker but cannot
  // tell an adjacent static text run from the dynamic one beside it, because
  // the parser fuses them into a single node before the client ever sees them.
  const claim: Range | null = hydrating() ? claimRange(parent, anchor, mode) : null;
  // From here on this position IS the range. Every later update writes before
  // the close comment, so the boundary stays well formed for the life of the
  // page rather than only for the first paint — and a hole whose neighbour is
  // a static text run keeps an addressable edge it otherwise loses the moment
  // the parser fuses them.
  //
  // A `WHOLE` claim has no close comment and needs none: it owns the element,
  // so appending is already writing at the end of the position.
  if (claim !== null && claim.close !== null) anchor = claim.close;

  if (typeof value === "function") {
    let current: Node[] = claim === null ? EMPTY_NODES : claim.nodes;
    let first = claim;
    // O4.5: the effect belongs to the scope this call was GIVEN, not to
    // whatever happened to be current at the call site. Without this the
    // argument is decoration — a hole inserted under scope A while B is ambient
    // put its cleanup on B, so disposing A left the effect running and writing
    // into a detached tree. `branch`, `each`, `boundary` and `portal` have all
    // taken their scope this way since M4; this is the same line in `insert`.
    ownedBy(given, "insert", () => {
      renderEffect(() => {
        const owner = getOwner();
        if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockEnter("insert", given);
        // The FIRST run is the claiming one, and only the first: the nodes it
        // produces are the server's, and every later run is an ordinary update
        // against them. `first` is cleared before `applyInsert` so a value that
        // throws does not leave the cursor open over a range nobody owns.
        const claiming = first;
        first = null;
        const produced =
          claiming === null
            ? (value as (s: unknown) => Child)(owner)
            : withRange(claiming, () => (value as (s: unknown) => Child)(owner));
        if (claiming !== null) detectTextDrift(current, produced);
        current = applyInsert(parent, produced, current, anchor);
        if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockExit("insert");
      });
    });
    return;
  }

  if (value === null || value === undefined || value === true || value === false) {
    // A static hole whose value renders nothing still owns a range on the wire,
    // and the server wrote it empty. Nothing to claim and nothing to remove.
    return;
  }

  // A static hole under a claim: the same reconcile, seeded with the server's
  // nodes, so a value that matches costs no write at all.
  if (claim !== null) {
    detectTextDrift(claim.nodes, value as Child);
    applyInsert(parent, value as Child, claim.nodes, anchor);
    return;
  }

  if (value instanceof Node) {
    parent.insertBefore(value, anchor);
  } else if (isSsrHtml(value as unknown)) {
    for (const node of ssrHtmlNodes(value as unknown as { readonly t: string })) {
      parent.insertBefore(node, anchor);
    }
  } else if (Array.isArray(value)) {
    const nodes = childToNodes(value, given);
    for (let i = 0; i < nodes.length; i++) parent.insertBefore(nodes[i], anchor);
  } else {
    const text = String(value);
    // `applyInsert`'s sole-occupant fast path, which the static branch never
    // had: the element IS the range, so the text needs no node of its own to
    // track. `textContent = ""` creates NO text node where `appendChild`
    // creates an empty one, so the empty string keeps the old path.
    if (anchor === null && text !== "" && parent.firstChild === null) {
      parent.textContent = text;
      return;
    }
    parent.insertBefore(document.createTextNode(text), anchor);
  }
}

/**
 * A hole whose server text and client text differ.
 *
 * This is the divergence that RECOVERS: `applyInsert` writes the client's value
 * through the claimed text node, so the node survives and the content is right.
 * It still gets a row, because the point of the whole scheme is that "no
 * mismatch was reported" means something — a timestamp rendered on the server
 * and re-rendered on the client is the textbook case, and a framework that
 * cannot name it is the framework that cannot name any of them.
 */
function detectTextDrift(claimed: readonly Node[], produced: Child): void {
  if (typeof produced !== "string" && typeof produced !== "number") return;
  const want = String(produced);
  const have =
    claimed.length === 0
      ? ""
      : claimed.length === 1 && claimed[0].nodeType === 3
        ? (claimed[0] as Text).data
        : null;
  if (have === want) return;
  report(
    "text",
    have === null
      ? `the server wrote ${claimed.length} nodes where the client renders the text ${JSON.stringify(want)}`
      : `the server wrote ${JSON.stringify(have)} where the client renders ${JSON.stringify(want)}`,
  );
}

/**
 * The UN-COMPILED path's prop entry: resolve the name to a channel, then bind.
 *
 * `CODESIGN.md` §3.5 removes this from the compiled path — every attribute
 * resolves to exactly one channel at compile time — and what is left here is
 * what `createElement` and `spread` need, plus the namespace syntax so the two
 * paths accept the same source. §4.1 retires it with `createElement` at M9.
 */
export function setProp(s: Scope | null, element: Element, key: string, value: unknown): void {
  const given = requireScope(s, "setProp");
  const isSvg = element.namespaceURI === SVG_NS;

  const colon = key.indexOf(":");
  if (colon > 0) {
    const rest = key.slice(colon + 1);
    switch (key.slice(0, colon)) {
      case "on":
        // Verbatim: no lowercasing, which is the other half of the
        // custom-element story.
        bindEvent(given, element, rest, value);
        return;
      case "prop":
        bindProp(given, element, setDomProp, rest, value);
        return;
      case "attr":
        bindProp(given, element, setAttr, attrNameOf(rest, isSvg), value);
        return;
      case "bool":
        bindProp(given, element, setBool, attrNameOf(rest, isSvg), value);
        return;
      case "style":
        bindProp(given, element, setStyleProp, toKebabCase(rest), value);
        return;
      case "bind": {
        if (rest === "this") {
          ref(given, element, value);
          return;
        }
        const [name, type] = bindChannelOf(element, rest);
        bindValue(given, element, name, type, value);
        return;
      }
      default:
        break;
    }
  }

  // `applyProp`'s original test: `key[0] === "o" && key[1] === "n"`, so
  // `onceUpon` really does bind a `ceupon` listener and the compiler agrees.
  if (key[0] === "o" && key[1] === "n") {
    bindEvent(given, element, key.slice(2).toLowerCase(), value);
    return;
  }

  if (key === "ref") {
    ref(given, element, value);
    return;
  }

  bindProp(given, element, channelOf(key, isSvg, element.tagName), attrNameOf(key, isSvg), value);
}

/**
 * `bind:x` → the property to write and the event that reports a user edit. The
 * compiler answers this at compile time from the tag and the `type` attribute;
 * this is the same table for the un-compiled path.
 */
export function bindChannelOf(element: Element, name: string): [string, string] {
  if (name === "group") return ["group", "change"];
  if (name === "files") return ["files", "change"];
  if (name !== "value") return [name, name === "open" ? "toggle" : "change"];
  const tag = element.tagName;
  if (tag === "SELECT") return ["value", "change"];
  if (tag !== "INPUT" && tag !== "TEXTAREA") {
    // A contenteditable host has no `value`. Its text IS the channel, and
    // `input` is the event it reports an edit on exactly as a field does.
    return element.hasAttribute("contenteditable") ? ["textContent", "input"] : ["value", "input"];
  }
  const type = (element as Partial<HTMLInputElement>).type;
  if (type === "checkbox" || type === "radio") return ["checked", "change"];
  if (type === "number" || type === "range") return ["valueAsNumber", "input"];
  if (type === "date" || type === "month" || type === "week" || type === "time") {
    return ["valueAsDate", "input"];
  }
  return ["value", "input"];
}

/**
 * The delegated/direct split, applied to a value the compiler could not prove
 * is a handler. The runtime's own `isEventHandlerValue` is what decides whether
 * anything binds at all — which is the oracle's test, on a value neither side
 * can see.
 */
export function bindEvent(s: Scope | null, element: Element, type: string, value: unknown): void {
  if (!isEventHandlerValue(value)) return;
  if (DELEGATED_EVENTS.has(type)) {
    delegate(s, element, type, value as DelegatedHandler);
    return;
  }
  listen(s, element, type, toListener(value as DelegatedHandler));
}

/**
 * Reactively spread a props object onto an element (compiled output for
 * `<div {...props} />`). Diffs every prop against the previously applied
 * value, clears props that vanished, replaces event listeners, and applies
 * `ref` once on mount. `children` is not handled here.
 *
 * Its non-delegated listeners are owned exactly as `listen`'s are — removed
 * when `s` is disposed (B4) and routed to the enclosing boundary on a throw
 * (E2.2). They were neither until M5's repair: `directListeners` was consulted
 * when a prop CHANGED or VANISHED and never at teardown, and the handler was
 * bound raw.
 */
export function spread(
  s: Scope | null,
  element: Element,
  props: Record<string, unknown> | (() => Record<string, unknown>),
): void {
  const given = requireScope(s, "spread");
  const isSvg = element.namespaceURI === SVG_NS;
  const applied: Record<string, unknown> = {};
  const directListeners: Record<string, EventListener> = {};
  // B4: one cleanup per (element, event name), installed the first time that
  // name binds. `listen` registers one per call, which would accumulate here
  // because a spread re-applies its props on every run of the effect below.
  const owned = new Set<string>();
  let first = true;

  const applyOne = (key: string, value: unknown): void => {
    // Events: delegated handlers swap by expando; direct ones re-listen
    if (key[0] === "o" && key[1] === "n") {
      const eventName = key.slice(2).toLowerCase();
      if (DELEGATED_EVENTS.has(eventName)) {
        delegate(
          given,
          element,
          eventName,
          isEventHandlerValue(value) ? (value as DelegatedHandler) : undefined,
        );
      } else {
        const prevListener = directListeners[eventName];
        if (prevListener) {
          element.removeEventListener(eventName, prevListener);
          delete directListeners[eventName];
        }
        if (isEventHandlerValue(value)) {
          const listener = routedListener(given, element, toListener(value as DelegatedHandler));
          directListeners[eventName] = listener;
          element.addEventListener(eventName, listener);
          if (given !== null && !owned.has(eventName)) {
            owned.add(eventName);
            underScope(given, "spread", () => {
              onCleanup(() => {
                const last = directListeners[eventName];
                if (last !== undefined) element.removeEventListener(eventName, last);
              });
            });
          }
        }
      }
      applied[key] = value;
      return;
    }

    // Getter values unwrap inline: the surrounding effect already tracks.
    // `style` was excluded so a style OBJECT reached `diffStyleObjects` whole —
    // but an object is not a function, so the exclusion only ever reached a
    // FUNCTION in the style key, and `setStyle` returns `prev` for one. A Cell
    // there applied nothing at all and a Block landed in the one Cell slot on
    // this surface that neither threw nor rendered.
    const resolved = isSignalGetter(value) ? (value as () => unknown)() : value;
    applied[key] = channelOf(key, isSvg, element.tagName)(
      element,
      attrNameOf(key, isSvg),
      resolved,
      applied[key],
    );
  };

  renderEffect(() => {
    const next = typeof props === "function" ? props() : props;

    // Removal pass: props that vanished since the last run are cleared
    for (const key in applied) {
      if (!(key in next)) {
        applyOne(key, null);
        delete applied[key];
      }
    }

    for (const key in next) {
      if (key === "children") continue;
      if (key === "ref") {
        if (first) setRef(element, "ref", next[key]);
        continue;
      }
      applyOne(key, next[key]);
    }
    first = false;
  });
}

/**
 * Convert a Child to an array of Nodes, under the scope this construction was
 * handed. `s` is threaded from `insert`'s parameter, never read back off the
 * ambient owner.
 */
/**
 * Whether a child value holds a function anywhere inside it — the test that
 * decides whether an array is a LIVE hole. Recursive, because a nested array is
 * flattened into the same range and a function two levels down is as live as
 * one at the top.
 */
function holdsAFunction(child: Child): boolean {
  if (typeof child === "function") return true;
  return isArray(child) && (child as Child[]).some(holdsAFunction);
}

export function childToNodes(child: Child, s: Scope | null = getOwner()): Node[] {
  if (child === null || child === undefined || child === true || child === false) {
    return [];
  }

  if (child instanceof DocumentFragment) {
    return drainFragment(child);
  }

  if (child instanceof Node) {
    return [child];
  }

  if (isSsrHtml(child as unknown)) {
    return ssrHtmlNodes(child as unknown as { readonly t: string });
  }

  // §3.0 rules 1-2: a Cell ignores the argument, a Block needs it, and one
  // call serves both.
  //
  // The scope handed to the Block is the AMBIENT one, not the `s` this call was
  // given, and that is an O4.5 violation with a reason: `render` opens its root,
  // makes it current and then reaches here with the caller's `s`, so passing `s`
  // puts the whole mount under whatever was current at the `render` call site.
  // Handing `s` down here is half of that row's fix and belongs in the same
  // change as the other half, the lowering of `render`'s argument to a Block.
  // Passing `s` on its own fails five of this fixture's claims, which is how
  // this comment was found to be describing code that did the opposite.
  //
  // M9 narrowed what that costs. An ARRAY holding a function no longer reaches
  // here un-owned: `insert` routes it through its own effect first, so the
  // ambient owner at this line IS a descendant of the scope `insert` was given.
  // What is left is a bare function reaching `childToNodes` directly, which is
  // the `render` path above and nothing else.
  if (typeof child === "function") {
    if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockEnter("children", s);
    const built = (child as (s: unknown) => Child)(getOwner());
    if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockExit("children");
    return childToNodes(built, s);
  }

  if (Array.isArray(child)) {
    const nodes: Node[] = [];
    for (let i = 0; i < child.length; i++) {
      const childNodes = childToNodes(child[i], s);
      for (let j = 0; j < childNodes.length; j++) {
        nodes.push(childNodes[j]);
      }
    }
    return nodes;
  }

  return [document.createTextNode(String(child))];
}

/**
 * O5: open a root scope, build under it, insert, flush, and return a disposer
 * that disposes the scope AND removes its range.
 *
 * `block` is the O5 shape: `(s: Scope) => Out`, invoked with the root, and it
 * is the only form under which O5 holds unconditionally.
 *
 * **The already-built form and its precondition.** `render(<Tree/>, host)`
 * constructs the subtree as an ARGUMENT, before `render` is entered. With no
 * ambient owner at the call site its effects are created with `CURRENT` null,
 * and `enterRoot` claims them (`adoptOrphans`), so the disposer disposes. With
 * an ambient owner they are that owner's kids at the instant they are created,
 * and no code running after the call can tell them from anything else that
 * owner holds — the watermark would have to have been taken before the
 * argument was evaluated. Ownership is not lost, it is RELOCATED: disposing
 * the ambient owner disposes the subtree. But this disposer cannot, so it says
 * so rather than pretending. M3's calling convention removes the form.
 *
 * **The claim is the eager form's alone.** The orphan list is bounded by TIME,
 * not by provenance, so claiming it from the Block form would let this mount's
 * disposer stop a library's ownerless effect that merely happened to be created
 * in the same turn. Pinned by `sem-own-render-disposer-disposes`.
 */
export function render(
  block: JSXElement | ((scope: Scope | null) => JSXElement),
  container: HTMLElement,
): () => void {
  container.textContent = ""; // Faster than innerHTML = ""

  const eager = typeof block !== "function";
  const ambient = eager ? getOwner() : null;
  // Only the already-built form claims. The orphan list is bounded in time, not
  // in provenance, so a Block-form mount that claimed it would adopt — and its
  // disposer would destroy — whatever ownerless work the same synchronous turn
  // happened to produce elsewhere. The Block builds under `root` anyway.
  const root = enterRoot(eager);
  if (ambient !== null && root.kids === null) {
    emitDiagnostic(
      "RENDER_SUBTREE_NOT_OWNED",
      "warning",
      "render() was given an already-built subtree while an owner was current, so that owner owns it and this disposer will only remove the range. Pass a function — render((scope) => <App/>, host) — to have the root own what it mounts.",
    );
  }
  let element: JSXElement;
  try {
    element =
      typeof block === "function" ? (block as (s: Scope | null) => JSXElement)(root) : block;
    insertRendered(root, element, container);
  } finally {
    exit(root);
  }

  ownRange(root, () => {
    container.textContent = "";
  });
  flush();

  return () => {
    disposeScope(root);
  };
}

function insertRendered(scope: Scope | null, element: JSXElement, container: HTMLElement): void {
  if (element === null || element === undefined || typeof element === "boolean") {
    return;
  }
  if (element instanceof Node) {
    // A claimed root is already exactly here. `appendChild` would remove it and
    // put it back, and the DOM's own definition of that is a removal — which
    // blurs whatever inside it had focus. H6 is one `if`.
    if (element.parentNode !== container) container.appendChild(element);
    return;
  }
  // `Out` admits `Cell<Out>` (§3.0). A mount whose block returned one is a live
  // hole at the root, so it is inserted as one rather than stringified.
  if (typeof element === "function") {
    insert(scope, container, element as unknown as () => Child);
    return;
  }
  if (isSsrHtml(element as unknown)) {
    for (const node of ssrHtmlNodes(element as unknown as { readonly t: string })) {
      container.appendChild(node);
    }
    return;
  }
  if (Array.isArray(element)) {
    for (const child of element) {
      const nodes = childToNodes(child, scope);
      for (const node of nodes) {
        container.appendChild(node);
      }
    }
    return;
  }
  container.appendChild(document.createTextNode(String(element)));
}

/**
 * Hydrate server-rendered markup.
 *
 * Seeds keyed async values from the `__BARQ_DATA__` payload emitted by
 * generateHydrationScript, then renders the app over the server markup in
 * one synchronous pass: seeded async values resolve synchronously, so the
 * client produces identical markup immediately (no fallback flash, no
 * refetch). Delegated event listeners are document-level and active from
 * this point on.
 *
 * Node-reuse (claim-based) hydration requires compiler-emitted hydration
 * keys; this replace-based pass is the runtime-only strategy.
 */
interface CapturedEvent {
  /** A DOM event type, or `@state` — a value/caret/focus record, not an event. */
  type: string;
  /** Child indices from `document.body`. Stable only because nodes are claimed. */
  path: number[];
  x?: number;
  y?: number;
  button?: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  key?: string;
  code?: string;
  value?: string;
  checked?: boolean;
  start?: number;
  end?: number;
  focus?: boolean;
}

/** The node a capture record points at, resolved through the claimed tree. */
function atPath(path: readonly number[]): Node | null {
  let node: Node | null = document.body;
  for (const index of path) {
    if (node === null) return null;
    node = node.childNodes[index] ?? null;
  }
  return node;
}

/**
 * Replay what the user did before the bundle arrived.
 *
 * Claiming is what makes this possible at all. The old capture was
 * COORDINATE-based and pointer-only, and `server.ts` said why: the nodes get
 * replaced, so there is no node to aim a key event at and no input to put a
 * value back into. With the nodes preserved, a child-index path resolves to the
 * SAME element it was recorded against, so the three things a user can be in
 * the middle of — a value they typed, where the caret is, and which element has
 * focus — are restorable, and the events replay against real targets.
 *
 * Order matters and is the recorded order: state first (so a handler that reads
 * `event.target.value` sees what the user typed), then the events.
 */
function replayCapturedEvents(): void {
  const g = globalThis as {
    __BARQ_EVTS__?: CapturedEvent[];
    __BARQ_EVTS_STOP__?: () => void;
  };
  g.__BARQ_EVTS_STOP__?.();
  const queue = g.__BARQ_EVTS__;
  g.__BARQ_EVTS__ = undefined;
  g.__BARQ_EVTS_STOP__ = undefined;
  if (!queue || queue.length === 0) return;

  for (const rec of queue) {
    if (rec.type !== "@state" || rec.path === undefined) continue;
    const target = atPath(rec.path) as HTMLInputElement | null;
    if (target === null) continue;
    if (rec.value !== undefined) target.value = rec.value;
    if (rec.checked !== undefined) target.checked = rec.checked;
    if (rec.focus === true && typeof target.focus === "function") target.focus();
    if (rec.start !== undefined && typeof target.setSelectionRange === "function") {
      try {
        target.setSelectionRange(rec.start, rec.end ?? rec.start);
      } catch {
        // A type with no selection (checkbox, number in some engines). The
        // value and the focus are the part that mattered.
      }
    }
  }

  for (const rec of queue) {
    if (rec.type === "@state") continue;
    // A record with no path came from an older snippet — or from a page whose
    // hydration was RECOVERED, where a path resolves to a node the client built
    // and the coordinates are the only honest target left.
    const path = rec.path;
    const target = (path !== undefined && path.length > 0 ? atPath(path) : null) ?? pointAt(rec);
    if (target === null) continue;
    target.dispatchEvent(eventFor(rec));
  }
  flush();
}

function pointAt(rec: CapturedEvent): Node | null {
  if (rec.x === undefined || rec.y === undefined) return null;
  if (typeof document.elementFromPoint !== "function") return null;
  return document.elementFromPoint(rec.x, rec.y);
}

const KEYBOARD = new Set(["keydown", "keyup", "keypress"]);

function eventFor(rec: CapturedEvent): Event {
  if (KEYBOARD.has(rec.type)) {
    return new KeyboardEvent(rec.type, {
      bubbles: true,
      cancelable: true,
      key: rec.key ?? "",
      code: rec.code ?? "",
      ctrlKey: rec.ctrlKey,
      metaKey: rec.metaKey,
      shiftKey: rec.shiftKey,
      altKey: rec.altKey,
    });
  }
  if (rec.type === "input" || rec.type === "change") {
    return new Event(rec.type, { bubbles: true, cancelable: true });
  }
  return new MouseEvent(rec.type, {
    bubbles: true,
    cancelable: true,
    clientX: rec.x ?? 0,
    clientY: rec.y ?? 0,
    button: rec.button ?? 0,
    ctrlKey: rec.ctrlKey,
    metaKey: rec.metaKey,
    shiftKey: rec.shiftKey,
    altKey: rec.altKey,
    view: typeof window === "undefined" ? undefined : window,
  });
}

/**
 * Claim-based hydration (`SEMANTICS.md` H1–H4, H6).
 *
 * The container is NOT cleared. The compiled walk claims the server's nodes as
 * it goes, and the only two outcomes are the claim succeeding or a
 * `HydrationMismatch` reaching here — in which case the container is cleared
 * and the page is rendered cold, which is exactly the behaviour this replaces.
 * "Detectably incorrect, degrading to today" is the bar M6 was given, and the
 * `recovered` row on the report is where it is read off.
 *
 * `fn` runs under a root, mirroring the one `renderToString` and `renderPage`
 * put around theirs: without it the client's owner tree is a level shallower
 * than the server's, and `computed`'s auto-keys — which are owner-tree ids —
 * address different values on the two sides.
 */
export function hydrate(
  fn: () => JSXElement,
  container: HTMLElement,
  options?: { data?: Record<string, unknown> },
): () => void {
  hydrate.report = { mismatches: [], claimed: 0, ranges: 0, built: 0, recovered: false };
  if (options?.data) {
    const target = globalThis as { __BARQ_DATA__?: Record<string, unknown> };
    target.__BARQ_DATA__ = { ...target.__BARQ_DATA__, ...options.data };
  }

  let clear: (() => void) | null = null;
  let failure: HydrationMismatch | null = null;
  const served = container.firstChild !== null;
  // The seeds a recovery has to give back. A positional auto-key is CONSUMED by
  // the read that claims it, so an attempt that is thrown away would otherwise
  // leave the second render with an empty payload — and a `Loading` whose value
  // was on the wire would show its fallback, which is a worse failure than the
  // mismatch that caused it. Recovery means "as if nothing happened", and the
  // id epoch is the other half of that.
  const seeds = { ...(globalThis as { __BARQ_DATA__?: Record<string, unknown> }).__BARQ_DATA__ };
  beginHydration(container);
  const marked = wireIsMarked();
  try {
    clear = mount(fn, container, true);
  } catch (error) {
    if (!(error instanceof HydrationMismatch)) {
      endHydration();
      throw error;
    }
    failure = error;
  }
  const claimReport = endHydration();

  // Nothing was claimed and there WAS markup to claim. That is a page the
  // compiler never made hydratable — an un-compiled tree, or a module built
  // without the flag — and the client has just built a second copy of it beside
  // the first. It is the one failure that raises no mismatch of its own,
  // because a walk that never happened cannot disagree with anything, so it is
  // detected here by what did not happen rather than by what did.
  if (failure === null && served && claimReport.claimed === 0 && claimReport.ranges === 0) {
    failure = new HydrationMismatch(
      "not-hydratable",
      marked
        ? "the container held markup with range comments and the render claimed none of it — " +
            "the CLIENT module was not compiled with `hydratable`"
        : "the container held server markup the render claimed none of it, and there are no " +
            "range comments to say which half is at fault — since `CODESIGN.md` §12 a page " +
            "whose every position owns its element writes none, so this is either half " +
            "compiled without `hydratable`",
    );
  }

  if (failure !== null) {
    // Svelte's answer, and barq already owns the fallback: throw the attempt
    // away and render the page the client's own way. Nothing partial survives —
    // `render` clears the container — so the failure mode is a slower first
    // paint, never a tree half-built from two disagreeing sources.
    clear?.();
    (globalThis as { __BARQ_DATA__?: Record<string, unknown> }).__BARQ_DATA__ = seeds;
    resetChildIds();
    clear = mount(fn, container, false);
    hydrate.report = {
      mismatches: [...claimReport.mismatches, { kind: failure.kind, detail: failure.message }],
      claimed: claimReport.claimed,
      ranges: claimReport.ranges,
      built: claimReport.built,
      recovered: true,
    };
    emitDiagnostic(
      "HYDRATION_MISMATCH",
      "warning",
      `${failure.message} — the server's markup was discarded and the page rendered on the client.`,
    );
  } else {
    hydrate.report = { ...claimReport, recovered: false };
  }

  flush();
  // A seed nobody claimed is the only evidence a positional auto-key can give
  // that the client tree is not the server's; the read that drifted has
  // already resolved by now.
  unclaimedSeeds();
  replayCapturedEvents();
  return clear ?? ((): void => {});
}

/**
 * What the last `hydrate` call claimed, built, and had to recover from.
 *
 * On the function rather than returned beside the disposer because `hydrate`'s
 * return value is the disposer and always has been. A caller that wants the
 * report reads it; a caller that does not is unaffected.
 */
export interface HydrationOutcome extends HydrationReport {
  /** The claim failed and the page was rendered cold — today's behaviour. */
  recovered: boolean;
}
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace hydrate {
  // eslint-disable-next-line no-var
  export let report: HydrationOutcome;
}
hydrate.report = {
  mismatches: [],
  claimed: 0,
  ranges: 0,
  built: 0,
  recovered: false,
} satisfies HydrationOutcome;

/**
 * `render`, with the one line that makes it hydration or not.
 *
 * §3.11: "`container.textContent = ""` … currently throws the entire server
 * render away". It is still exactly right for a cold render and exactly wrong
 * for a claim, so it is the parameter rather than a second copy of the mount
 * sequence — there is one root, one insertion, one disposer, and the claim path
 * cannot drift from the path everything else is measured on.
 */
function mount(
  block: (scope: Scope | null) => JSXElement,
  container: HTMLElement,
  claiming: boolean,
): () => void {
  if (!claiming) container.textContent = "";
  // The Block form only, so there is nothing built before the root exists and
  // nothing to claim — see `render`.
  const root = enterRoot(false);
  try {
    insertRendered(root, block(root), container);
  } finally {
    exit(root);
  }
  ownRange(root, () => {
    container.textContent = "";
  });
  flush();
  return () => {
    disposeScope(root);
  };
}

/**
 * Create a template function for fast DOM cloning (like SolidJS)
 * The template is parsed once and cloned for each use
 */
export function template(html: string, isSVG = false, detect = false): () => Node {
  let cached: Node | null = null;

  const create = (): Node => {
    if (isSVG) {
      // For SVG, wrap in svg element and extract
      const wrapper = document.createElement("template");
      wrapper.innerHTML = `<svg xmlns="${SVG_NS}">${html}</svg>`;
      const svgEl = wrapper.content.firstChild;
      const innerEl = svgEl?.firstChild;
      if (!innerEl) {
        throw new Error("Invalid SVG template");
      }
      return innerEl;
    }
    const t = document.createElement("template");
    t.innerHTML = html;
    const node = t.content.firstChild;
    if (!node) {
      throw new Error("Invalid template");
    }
    return node;
  };

  return () => {
    if (!cached) {
      cached = create();
    }
    // The compiler-addressed position: this template belongs to exactly one
    // compiled unit, and the static ownership tree says which constructs must
    // own it. Recording the owner HERE is what makes "the child ran under the
    // root rather than under the provider" an assertion rather than a story.
    if (OWNERSHIP.sink !== null) OWNERSHIP.sink.clone(html, getOwner());
    // H1. The claim is here and only here: every unit root the compiler emits
    // reaches the DOM through this call, so claiming one node is claiming the
    // whole subtree — the walk below it is `child`/`sib` over the node this
    // returned, which is now the SERVER's node. A clone is what happens when
    // nothing is being hydrated, and `claimNode` throws rather than returning
    // one when the server's tree is not the client's.
    if (hydrating()) {
      // `detect` is §12's axis, threaded from the compiler to the one call that
      // holds both trees at once. A production build passes nothing and the
      // subtree comparison never runs.
      const claimed = claimNode(cached, detect);
      if (claimed !== null) return claimed;
    }
    builtNode();
    return cached.cloneNode(true);
  };
}
