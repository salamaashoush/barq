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
  unclaimedSeeds,
  underScope,
  type Scope,
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
        try {
          if (typeof handler === "function") {
            handler.call(node, e);
          } else if (Array.isArray(handler) && typeof handler[0] === "function") {
            handler[0].call(node, handler[1], e);
          }
        } catch (error) {
          routeError(scopeOf(node), error);
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
 * Create a DOM element with reactive props
 * Overloaded to support both intrinsic elements (strings) and components with proper type inference
 */
export function createElement(tag: string, props: Props | null, ...children: Child[]): JSXElement;
export function createElement<P>(
  tag: Component<P>,
  props: P | null,
  ...children: Child[]
): JSXElement;
export function createElement(
  tag: string | Component<unknown>,
  props: Record<string, unknown> | null,
  ...children: Child[]
): JSXElement {
  // C1: there is ONE calling convention, so this path invokes a component the
  // same way compiled code does. It stays only as the element builder core's
  // own DOM tests are written against; the compiler has not emitted it since
  // M1 and §4.1 retires it at M9.
  if (typeof tag === "function") {
    const finalProps: Record<string, unknown> = { ...props };
    if (children.length > 0) {
      finalProps.children = children.length === 1 ? children[0] : children;
    }
    return (tag as unknown as (s: unknown, p: Record<string, unknown>) => JSXElement)(
      getOwner(),
      finalProps,
    );
  }

  // Handle fragments
  if (tag === "fragment" || tag === "") {
    const fragment = document.createDocumentFragment();
    appendChildren(getOwner(), fragment, children);
    return fragment;
  }

  // Create element (SVG or HTML)
  const isSvg = tag in SVG_TAGS;
  const element = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);

  // Apply props
  if (props) {
    const owner = getOwner();
    for (const key in props) {
      if (key !== "children") {
        setProp(owner, element, key, props[key]);
      }
    }
  }

  // Append children
  appendChildren(getOwner(), element, children);

  return element;
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
 */
export function setClass(element: Element, _name: string, value: unknown, prev?: unknown): unknown {
  const className = classToString(value);
  if (className === prev) return prev;
  const current = element.getAttribute("class");
  if (prev === undefined ? current === null : current === prev) {
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
  for (const token of splitClass(prev === undefined ? null : (prev as string | null))) {
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

/** Every ref shape, returning whatever the callbacks handed back as cleanups. */
function applyRefs(element: Element, value: unknown): (() => void)[] {
  const undo: (() => void)[] = [];
  const one = (target: unknown): void => {
    if (isRefCallback(target)) {
      const back = (target as (el: Element) => unknown)(element);
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
      handler.call(element, e);
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
 * `bind:` — the CHANNEL half (§3.10). The property, the event that reports a
 * user edit and the coercion are all resolved at compile time; what is left is
 * the write and the read-back.
 *
 * The write compares against the ELEMENT, not against the last framework write:
 * a handler that rejects a keystroke leaves `prev` holding a value the DOM no
 * longer has, and a cached compare would then never repair it — the defining
 * case controlled inputs exist for. Selection and focus preservation are M7.
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
  if (isSignalGetter(value)) {
    ownedBy(given, "bind", () => {
      renderEffect(() => {
        const next = readSlot(value, `bind:${name}`);
        if (target[name] !== next) target[name] = next;
      });
    });
  } else {
    target[name] = value;
  }
  if (typeof set !== "function") return;
  listen(given, element, type, () => {
    set.call(value, target[name]);
  });
}

/**
 * Name → channel, for the UN-COMPILED path only. The compiled path never calls
 * this: `CODESIGN.md` §3.5 says there is no `setProp` dispatcher on it, and this
 * is the dispatcher, kept alive for `createElement` and `spread` — which §4.1
 * retires at M9 — and as the definition the generated Rust tables are read out
 * of, so the two resolutions cannot drift.
 */
function channelOf(key: string, isSvg: boolean): Channel {
  if (key === "class") return setClass;
  if (key === "className") return setClass;
  if (key === "style") return setStyle;
  if (key === "classList") return setClassList;
  if (key === "ref") return setRef;
  if (key === "dangerouslySetInnerHTML") return setHtml;
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
 * Append children to a parent node
 */
function appendChildren(s: Scope | null, parent: Node, children: Child[]): void {
  for (let i = 0; i < children.length; i++) {
    appendChild(s, parent, children[i]);
  }
}

/**
 * Append a single child (handles all child types)
 */
function appendChild(s: Scope | null, parent: Node, child: Child): void {
  // Skip null, undefined, boolean
  if (child === null || child === undefined || child === true || child === false) {
    return;
  }

  // Node - append directly
  if (child instanceof Node) {
    parent.appendChild(child);
    return;
  }

  if (isSsrHtml(child as unknown)) {
    for (const node of ssrHtmlNodes(child as unknown as { readonly t: string }))
      parent.appendChild(node);
    return;
  }

  // Reactive child: the hole tracks its own nodes, appended at the end
  if (typeof child === "function") {
    insert(s, parent, child as () => Child, null);
    return;
  }

  // Array - flatten and append each
  if (Array.isArray(child)) {
    for (let i = 0; i < child.length; i++) {
      appendChild(s, parent, child[i]);
    }
    return;
  }

  // Primitive - create text node
  parent.appendChild(document.createTextNode(String(child)));
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

export function drainFragment(fragment: DocumentFragment): Node[] {
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

function removeNodes(nodes: Node[]): void {
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].parentNode?.removeChild(nodes[i]);
  }
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
): void {
  const given = requireScope(s, "insert");
  const anchor = marker ?? null;

  if (typeof value === "function") {
    let current: Node[] = EMPTY_NODES;
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
        current = applyInsert(parent, (value as (s: unknown) => Child)(owner), current, anchor);
        if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockExit("insert");
      });
    });
    return;
  }

  if (value === null || value === undefined || value === true || value === false) return;

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

  bindProp(given, element, channelOf(key, isSvg), attrNameOf(key, isSvg), value);
}

/**
 * `bind:x` → the property to write and the event that reports a user edit. The
 * compiler answers this at compile time from the tag and the `type` attribute;
 * this is the same table for the un-compiled path.
 */
export function bindChannelOf(element: Element, name: string): [string, string] {
  if (name !== "value") return [name, name === "open" ? "toggle" : "change"];
  const tag = element.tagName;
  if (tag === "SELECT") return ["value", "change"];
  const type = (element as Partial<HTMLInputElement>).type;
  if (type === "checkbox" || type === "radio") return ["checked", "change"];
  if (type === "number" || type === "range") return ["valueAsNumber", "input"];
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

    // Getter values unwrap inline: the surrounding effect already tracks
    const resolved = key !== "style" && isSignalGetter(value) ? (value as () => unknown)() : value;
    applied[key] = channelOf(key, isSvg)(element, attrNameOf(key, isSvg), resolved, applied[key]);
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
  // puts the whole mount under whatever was current at the `render` call site —
  // which is the O5 defect the registry still carries. Handing `s` down here is
  // half of that row's fix and belongs in the same change as the other half,
  // the lowering of `render`'s argument to a Block. Passing `s` on its own
  // fails five of this fixture's claims, which is how this comment was found to
  // be describing code that did the opposite.
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
 */
export function render(
  block: JSXElement | ((scope: Scope | null) => JSXElement),
  container: HTMLElement,
): () => void {
  container.textContent = ""; // Faster than innerHTML = ""

  const eager = typeof block !== "function";
  const ambient = eager ? getOwner() : null;
  const root = enterRoot();
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
    container.appendChild(element);
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
  type: string;
  x: number;
  y: number;
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Replay interactions captured before hydration (coordinate-targeted) */
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
    const target = document.elementFromPoint(rec.x, rec.y);
    target?.dispatchEvent(
      new MouseEvent(rec.type, {
        bubbles: true,
        cancelable: true,
        clientX: rec.x,
        clientY: rec.y,
        button: rec.button,
        ctrlKey: rec.ctrlKey,
        metaKey: rec.metaKey,
        shiftKey: rec.shiftKey,
        altKey: rec.altKey,
        view: window,
      }),
    );
  }
  flush();
}

export function hydrate(
  fn: () => JSXElement,
  container: HTMLElement,
  options?: { data?: Record<string, unknown> },
): () => void {
  if (options?.data) {
    const target = globalThis as { __BARQ_DATA__?: Record<string, unknown> };
    target.__BARQ_DATA__ = { ...target.__BARQ_DATA__, ...options.data };
  }
  // fn() runs under a root, mirroring the one renderToString and renderPage
  // put around theirs. Without it the client's owner tree is a level
  // shallower than the server's, and createAsync's auto-keys - which are
  // owner-tree ids - address different values on the two sides. O5: that root
  // is render's own, and fn is handed to it as a Block, so the root owns what
  // it mounts. Building fn() at the call site instead left the subtree owned
  // by the wrapper and the returned disposer with nothing to dispose.
  const clear = render(fn, container);
  flush();
  // A seed nobody claimed is the only evidence a positional auto-key can give
  // that the client tree is not the server's; the read that drifted has
  // already resolved by now.
  unclaimedSeeds();
  // Clicks that landed before the bundle loaded replay against the
  // hydrated DOM (captured by generateHydrationScript's inline snippet)
  replayCapturedEvents();
  return clear;
}

/**
 * Create a ref object for element references
 */
export function useRef<T extends Element = HTMLElement>(): { current: T | null } {
  return { current: null };
}

/**
 * Create a template function for fast DOM cloning (like SolidJS)
 * The template is parsed once and cloned for each use
 */
export function template(html: string, isSVG = false): () => Node {
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
    return cached.cloneNode(true);
  };
}
