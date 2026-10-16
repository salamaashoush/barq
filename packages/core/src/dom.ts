/**
 * DOM rendering and reconciliation
 * Fine-grained reactive DOM updates using comment markers
 */

import {
  CONTEXT_MISS,
  disposeScope,
  emitDiagnostic,
  followAsync,
  ERROR_BOUNDARY,
  isBlock,
  lookupContext,
  NotReadyError,
  OBSERVE,
  onCleanup,
  getObserver,
  installClaimEffect,
  getOwner,
  isDisposed,
  ScopeMissingError,
  jsxAsValue,
  flush,
  ownRange,
  OWNERSHIP,
  readSlot,
  renderEffect,
  resetChildIds,
  resetErrorHalt,
  rootScope,
  runWithOwner,
  unclaimedSeeds,
  underScope,
  untrack,
  createSignal,
  type Accessor,
  type Scope,
  type Setter,
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
import { coerceLive, writeLive } from "./forms.ts";
import {
  HydrationMismatch,
  claimingTemplate,
  abandonedClaim,
  adopted,
  beginHydration,
  built as builtNode,
  WHOLE,
  claimElement,
  claimNode,
  claimRange,
  claimText,
  endHydration,
  hole,
  hydrating,
  mismatchIn,
  report,
  usualCauses,
  inDocumentOrder,
  takenAtHole,
  wireIsMarked,
  withRangeTaken,
  withoutClaim,
  type HydrationReport,
  type Range,
  type Taken,
} from "./hydration.ts";

/**
 * A function child is a `Cell<Child>` or a `Block<Child>` and the two are
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
export type Component<P = Props> = (props: P) => JSXElement;

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
  desc: 1,
  feDropShadow: 1,
  metadata: 1,
  mpath: 1,
  set: 1,
  switch: 1,
  view: 1,
};

// CSS properties whose bare number is a count or a ratio, not a length.
const CSS_NUMBER_PROPS: Record<string, 1> = {
  "animation-iteration-count": 1,
  "aspect-ratio": 1,
  "border-image-outset": 1,
  "border-image-slice": 1,
  "border-image-width": 1,
  "column-count": 1,
  columns: 1,
  "fill-opacity": 1,
  flex: 1,
  "flex-grow": 1,
  "flex-shrink": 1,
  "flood-opacity": 1,
  "font-weight": 1,
  "grid-area": 1,
  "grid-column": 1,
  "grid-column-end": 1,
  "grid-column-start": 1,
  "grid-row": 1,
  "grid-row-end": 1,
  "grid-row-start": 1,
  "line-clamp": 1,
  "line-height": 1,
  opacity: 1,
  order: 1,
  orphans: 1,
  scale: 1,
  "stop-opacity": 1,
  "stroke-miterlimit": 1,
  "stroke-opacity": 1,
  "tab-size": 1,
  widows: 1,
  "z-index": 1,
  zoom: 1,
};

// The properties the USER also writes. Their channel compares
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
  // The `muted` ATTRIBUTE is read once, when the parser creates the element;
  // set afterwards it moves `defaultMuted` and the element goes on playing.
  "audio:muted": 1,
  "video:muted": 1,
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

// Events delegated to one listener per render root (Solid's list). Handlers are
// stored on the element as `__bq_<type>`, and not under Solid's `$$<type>`: a
// Solid 1 document listener calls what it finds there, so one such widget on
// the page ran every handler here twice. A root's listener walks up from the
// event target calling them, respecting stopPropagation.
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

// A root's listener for one of these can never fire from a descendant, so a
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
 * The expando the compiler writes beside `__bq_<type>`: the scope that owned the
 * element when the handler was bound. One per element rather than one per event
 * type, so `__bq_<type>` keeps its shape exactly (a function or a `[fn, data]`
 * tuple, and no `__bq_<type>Data` in this runtime).
 */
const SCOPE_KEY = "__bqs";

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
    // Under no owner: a boundary takes a routed error by writing it down, and
    // the throw may have come from a `ref` called while a scope is being
    // built, or from a dispatch made inside one.
    runWithOwner(null, () => (routed as (err: unknown) => void)(error));
    return;
  }
  throw error;
}

function scopeOf(node: Node): Scope | null {
  return ((node as Node & Record<string, unknown>)[SCOPE_KEY] as Scope | undefined) ?? null;
}

/**
 * One container a delegated listener sits on, and the roots it delivers for.
 *
 * A container is either a render root, which delivers for itself, or the box a
 * portal mounted outside its root, which delivers for that root. `owners`
 * counts registrations per root because a root can be rendered into the same
 * container more than once and only the last disposal may take the listeners.
 */
interface DelegatedContainer {
  owners: Map<Node, number>;
  listeners: Map<string, EventListener>;
  roots: number;
}

/** Every type a compiled module or a runtime binding has asked to delegate. */
const delegatedEvents = new Set<string>();
const delegatedContainers = new Map<Node, DelegatedContainer>();

/**
 * Written on an event by the first root that walks it: the root, so a root
 * further out resumes from that root's container instead of walking the inner
 * tree a second time, and an unrelated root does not walk it at all.
 */
const EVENT_OWNER = "__bqo";

/**
 * On a portal's box: the marker standing at the portal's place in the tree.
 * The walk climbs from the box to the marker's parent, so an event inside a
 * portal reaches the handlers around the portal, as it does in Solid.
 */
const PORTAL_HOST = "__bqh";

function above(node: Node): Node | null {
  const marker = (node as Node & Record<string, unknown>)[PORTAL_HOST] as Node | undefined;
  if (marker !== undefined) return marker.parentNode;
  return node.parentNode ?? ((node as Partial<ShadowRoot>).host as Node | undefined) ?? null;
}

function ownerIn(state: DelegatedContainer, from: Node | null): Node | null {
  for (let node = from; node !== null; node = above(node)) {
    if (state.owners.has(node)) return node;
  }
  return null;
}

function dispatchDelegated(e: Event, container: Node, state: DelegatedContainer): void {
  const marked = (e as Event & Record<string, unknown>)[EVENT_OWNER] as Node | undefined;
  const target = ((e.composedPath?.()[0] as Node | undefined) ?? e.target) as Node | null;
  let resume: Node | null = null;
  if (marked !== undefined) {
    if (marked === container || !container.contains(marked)) return;
    resume = marked;
  }
  const root =
    state.owners.size === 1 && state.owners.has(container) ? container : ownerIn(state, target);
  if (root === null || root === resume) return;
  (e as Event & Record<string, unknown>)[EVENT_OWNER] = root;

  const key = `__bq_${e.type}`;
  // The inner root already ran the target's handler when the target is the
  // inner root's own container.
  let node: Node | null = resume === null ? target : resume === target ? above(resume) : resume;

  // Reflect the element whose handler is running, like native bubbling
  Object.defineProperty(e, "currentTarget", {
    configurable: true,
    get() {
      return node ?? container;
    },
  });

  try {
    while (node !== null) {
      const handler = (node as Node & Record<string, unknown>)[key] as DelegatedHandler | undefined;
      if (handler && !(node as Partial<HTMLButtonElement>).disabled) {
        const owner = scopeOf(node);
        try {
          // The compiled path writes this expando ITSELF — `_el$1.__bq_click = h` —
          // so `delegate`'s guard never sees it and this is the only place a
          // Block forwarded into a handler slot can be caught. Invoked, it would
          // take the Event as its scope: rule 3's guard tests `undefined` and an
          // Event is not undefined.
          refuseBlock(handler, `The \`on${e.type}\` handler`);
          if (Array.isArray(handler)) refuseBlock(handler[0], `The \`on${e.type}\` handler`);
          // The owner is where a throw is ROUTED, and not what the handler
          // runs under. A handler is the application's reply to the user, so it
          // writes state, and the engine refuses a write made under an owner:
          // an owner is a scope that is being built. It runs under none, as an
          // effect's callback does, and one that needs to own what it creates
          // names the owner itself.
          runWithOwner(null, () => {
            // The RETURN is tested for the same reason `applyRefs` tests one:
            // the LAUNDERED shape, `() => aBlock`, carries no brand for the
            // value test above to see, and a handler is invoked with the Event
            // so `block`'s entry guard can never fire either. The Block arrives
            // as what the handler returned, and left alone it is a handler that
            // silently does nothing.
            if (typeof handler === "function") {
              refuseBlock(handler.call(node, e), `The \`on${e.type}\` handler`, true);
            } else if (Array.isArray(handler) && typeof handler[0] === "function") {
              refuseBlock(
                handler[0].call(node, handler[1], e),
                `The \`on${e.type}\` handler`,
                true,
              );
            }
          });
        } catch (error) {
          routeError(owner, error);
        }
        if (e.cancelBubble) return;
      }
      if (node === root) return;
      const next = above(node);
      if (next === root) return;
      node = next;
    }
  } finally {
    // The override outlives the walk otherwise, so anything reading
    // currentTarget after dispatch would see the container forever.
    delete (e as Partial<Record<"currentTarget", unknown>>).currentTarget;
  }
}

function isEventHandlerValue(value: unknown): boolean {
  return typeof value === "function" || (Array.isArray(value) && typeof value[0] === "function");
}

/**
 * The event type an `on…Capture` prop names, or `null` if it names none.
 *
 * The capture phase is not a nicety. It is the only way to see an event BEFORE
 * a descendant handles it, which is what a component has to do when the
 * meaning of a key depends on state a child does not have: a listbox's
 * typeahead has to claim a Space as a search character before the option below
 * it reads the same key as "select me". Delegation cannot express it — the
 * root's listener runs after the whole bubble path — so a capture prop is
 * always a direct listener.
 */
const CAPTURE_SUFFIX = "Capture";

function captureTypeOf(key: string): string | null {
  // "on" + at least one character + "Capture".
  if (key.length <= CAPTURE_SUFFIX.length + 3) return null;
  if (key.charCodeAt(0) !== 111 || key.charCodeAt(1) !== 110) return null;
  if (!key.endsWith(CAPTURE_SUFFIX)) return null;
  const type = key.slice(2, -CAPTURE_SUFFIX.length).toLowerCase();
  // Two events are NAMED with the suffix: `onGotPointerCapture` is a bubble
  // listener for `gotpointercapture`, not a capture one for `gotpointer`.
  if (type === "gotpointer" || type === "lostpointer") return null;
  return type;
}

/** Wrap a tuple handler for direct (non-delegated) listeners */
function toListener(value: DelegatedHandler): EventListener {
  if (typeof value === "function") return value;
  return (e: Event) => value[0](value[1], e);
}

function listenOn(container: Node, state: DelegatedContainer, type: string): void {
  if (state.listeners.has(type)) return;
  const listener = (e: Event): void => dispatchDelegated(e, container, state);
  state.listeners.set(type, listener);
  container.addEventListener(type, listener);
}

function declareDelegated(type: string): void {
  if (delegatedEvents.has(type)) return;
  delegatedEvents.add(type);
  for (const [container, state] of delegatedContainers) listenOn(container, state, type);
}

/**
 * Listen for every delegated type on `container`, on behalf of the root
 * `owner`. A root registers its own container; a portal mounted outside its
 * root registers the box it mounted, on behalf of that root.
 */
export function registerDelegatedContainer(container: Node, owner: Node = container): void {
  let state = delegatedContainers.get(container);
  if (state === undefined) {
    state = { owners: new Map(), listeners: new Map(), roots: 0 };
    delegatedContainers.set(container, state);
  }
  state.owners.set(owner, (state.owners.get(owner) ?? 0) + 1);
  for (const type of delegatedEvents) listenOn(container, state, type);
}

export function unregisterDelegatedContainer(container: Node, owner: Node = container): void {
  const state = delegatedContainers.get(container);
  if (state === undefined) return;
  const count = state.owners.get(owner) ?? 0;
  if (count > 1) state.owners.set(owner, count - 1);
  else state.owners.delete(owner);
  if (state.owners.size > 0) return;
  for (const [type, listener] of state.listeners) container.removeEventListener(type, listener);
  delegatedContainers.delete(container);
}

function registerDelegatedRoot(container: Node): void {
  registerDelegatedContainer(container);
  delegatedContainers.get(container)!.roots++;
}

function unregisterDelegatedRoot(container: Node): void {
  const state = delegatedContainers.get(container);
  if (state !== undefined) state.roots--;
  unregisterDelegatedContainer(container);
}

/** The container of the render root `node` was rendered under, if it was. */
export function delegatedRootOf(node: Node | null): Node | null {
  for (let at = node; at !== null; at = above(at)) {
    if ((delegatedContainers.get(at)?.roots ?? 0) > 0) return at;
  }
  return null;
}

/**
 * Mark a portal's box as standing where `marker` stands, for the walk.
 */
export function hostPortal(box: Node, marker: Node): void {
  (box as Node & Record<string, unknown>)[PORTAL_HOST] = marker;
}

/**
 * Declare event types as delegated, idempotently. Every render root listens
 * for each declared type on its own container, from now on and for the roots
 * mounted later.
 *
 * Compiled output writes handlers straight to the element as `__bq_<type>`
 * (a function, or a `[fn, data]` tuple) and calls this once per module for
 * the types it emitted; without it those expandos are dead, because nothing
 * is listening.
 */
export function delegateEvents(types: string[]): void {
  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    if (NON_BUBBLING_EVENTS.has(type) && !warnedNonBubbling.has(type)) {
      warnedNonBubbling.add(type);
      emitDiagnostic({
        code: "DELEGATED_EVENT_DOES_NOT_BUBBLE",
        kind: "render",
        severity: "warn",
        message:
          `\`delegateEvents(["${type}"])\` asks for a listener on each render root, but ` +
          `the \`${type}\` event does not bubble, so a handler registered this way never runs. ` +
          `Attach it to the element itself: \`listen(element, "${type}", handler)\`.`,
      });
    }
    declareDelegated(type);
  }
}

// Cache for kebab-case conversions
const kebabCache = new Map<string, string>();

/**
 * A style object's key as the declaration's name. A custom property is the
 * author's own spelling and is case-sensitive, so it is written as given.
 */
function cssName(property: string): string {
  return property.startsWith("--") ? property : toKebabCase(property);
}

/** A declaration's value as text: a bare number is a length unless the property counts. */
function cssValue(cssProperty: string, raw: unknown): string {
  return typeof raw === "number" &&
    raw !== 0 &&
    !(cssProperty in CSS_NUMBER_PROPS) &&
    !cssProperty.startsWith("--")
    ? `${raw}px`
    : toString(raw);
}

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

/**
 * A fragment: JSX elements, and the CELLS among them.
 *
 * A member that is a function is a live hole rather than a value, which is what
 * `<>{() => cond() ? <a/> : <b/>}</>` compiles to — an array whose only member
 * is a Cell. `insert` has always placed one; the type said otherwise, so the
 * capability was reachable from the runtime and not from typed code.
 */
export type ArrayElement = (JSXElement | (() => JSXElement))[];

/**
 * JSXElement type that components can return
 * Matches SolidJS's JSX.Element type exactly
 * The (string & {}) pattern allows string literals while avoiding widening
 */
export type JSXElement = Node | ArrayElement | (string & {}) | number | boolean | null | undefined;

// Re-export as Element for convenience
export type { JSXElement as Element };

/**
 * The body of every `dynamic` instance: a component or a tag whose value is not
 * a module-local `const` cannot be resolved at compile time, so the choice is
 * made here and nowhere else.
 *
 * The key is a `branch`'s, so the swap and the teardown are the primitive's;
 * the props are the call site's SOURCE LIST (C9), not a copied object; the
 * children are a Block inside it. What is left is one `typeof` — and the string
 * arm builds through `spread` and `insert`, the same two entry points every
 * other element goes through, rather than the fifth element-creation path
 * `createDynamicElement` used to be.
 */
export function resolveDynamic(
  component: Cell<string | ((props: Record<string, unknown>) => unknown)>,
  props: Record<string, unknown>,
): unknown {
  // The branch key already tracks this; reading it again inside the body would
  // make the body's own construction a dependency of the swap that created it.
  const resolved = untrack(component as () => unknown);
  if (resolved === null || resolved === undefined || resolved === false) return null;
  if (typeof resolved !== "string") {
    return (resolved as (props: Record<string, unknown>) => unknown)(props);
  }
  return element(resolved, props);
}

/**
 * One element, by tag NAME, with a props source list — the shape a template
 * cannot express and the only element-creation path beside `template()`.
 *
 * Two callers, both of them the compiler's: `resolveDynamic`'s string arm, and the
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
export function element(tag: string, props: Record<string, unknown>): Element {
  // CLAIMED when the server wrote one here. `<html>`, `<head>` and `<body>` reach
  // this function rather than a template — the parser strips them out of
  // `<template>` — so a document-hydrated page has its whole frame on this path,
  // and an unconditional `withoutClaim` here meant it claimed nothing at all.
  const claimed = claimElement(tag);
  if (claimed !== null) {
    spread(claimed, props);
    const children = props.children;
    // `WHOLE`, because that is exactly what this position is: the server wrote
    // this element's children with no boundary comments, so the claim is every
    // child of `claimed` read off the document. Without it the range claim looks
    // for a `<!--]-->` that was never written — measured as "expected <!--]-->
    // before the end of <html>, found <body>".
    if (children !== undefined && children !== null) {
      insert(claimed, children as Child, null, WHOLE);
    }
    return claimed;
  }
  return withoutClaim(() => {
    const node =
      tag in SVG_TAGS ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    spread(node, props);
    const children = props.children;
    if (children !== undefined && children !== null) insert(node, children as Child);
    return node;
  });
}

/**
 * A resolved CHANNEL.
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
/**
 * Attributes where `false` means "false", not "absent".
 *
 * A boolean HTML attribute is its own presence: `disabled=""` and no
 * `disabled` are the only two states, so `false` removes it. Every `aria-*`
 * attribute is an ENUMERATED one instead, and the distinction is load-bearing:
 * `aria-pressed="false"` says "this is a toggle button that is off", which a
 * screen reader announces, while no `aria-pressed` at all says "this is not a
 * toggle button". Removing the attribute changes what the control IS.
 *
 * The same holds for the three global attributes that spell their values out.
 */
const ENUMERATED_ATTRS = new Set([
  "contenteditable",
  "contentEditable",
  "draggable",
  "spellcheck",
  "spellCheck",
]);

function isEnumeratedAttr(name: string): boolean {
  return name.startsWith("aria-") || ENUMERATED_ATTRS.has(name);
}

export function setAttr(element: Element, name: string, value: unknown, prev?: unknown): unknown {
  // Only a caller that PASSED what it last applied is asking for the compare.
  // The compiled record makes its own and calls with three arguments, where an
  // absent `prev` read as `undefined` made `"x"` to `undefined` look like no
  // change: the attribute stayed.
  if (value === prev && arguments.length > 3) return prev;
  // C5.1 item 2: a NODE is never an attribute value, so a Block that reached
  // this channel and was built is caught here rather than serialised.
  //
  // The read is where the rule says the test belongs, and for a props member in
  // an attribute the compiler emits a direct call — `() => props.badge()` —
  // which no `readSlot` sees. While a Block refused to run without a scope the
  // call itself threw; ownership is ambient now, so it runs, returns a subtree,
  // and `toString` writes `title="<b>…</b>"`. This is the same refusal one step
  // later, at the only place the value is visible.
  if (value instanceof Node) {
    throw new ScopeMissingError(
      `setAttr ${name}`,
      `The \`${name}\` attribute on \`<${element.localName}>\` was given a DOM node, and an ` +
        "attribute can only hold text. This happens when JSX passed as a prop or as children " +
        `is called and its result is written into an attribute, as in \`${name}={props.icon()}\`. ` +
        "Render it as a child, `<span>{props.icon}</span>`, or pass a string.",
    );
  }
  // An accessor that was not called is the commonest way here:
  // `title={on() ? label : "x"}` picks the function, and its source text is
  // what the page shows.
  if (typeof value === "function") {
    emitDiagnostic({
      code: "FUNCTION_AS_ATTRIBUTE",
      kind: "render",
      severity: "warn",
      message:
        `The \`${name}\` attribute on \`<${element.localName}>\` was given a function, so the ` +
        "function's source text is written to the page instead of its value. Call the accessor " +
        `where the value is chosen: \`${name}={open() ? label() : "closed"}\`.`,
    });
  }
  if (isBoolean(value)) {
    if (isEnumeratedAttr(name)) {
      element.setAttribute(name, value ? "true" : "false");
      return value;
    }
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
  if (value === prev && arguments.length > 3) return prev;
  // The `setHtml` rule, for `innerHTML` written as a prop: the server's nodes
  // are already what this write would build.
  if (
    name === "innerHTML" &&
    prev === undefined &&
    typeof value === "string" &&
    hydrating() &&
    parsesTo(element, value)
  ) {
    return value;
  }
  // Text over the one text node the last write left is that node's `data`:
  // `textContent` would remove it and make another. The empty string is not,
  // because it leaves the element with no child at all.
  if (name === "textContent" && (typeof value === "string" || typeof value === "number")) {
    const only = element.firstChild;
    if (value !== "" && only !== null && only.nodeType === 3 && only.nextSibling === null) {
      (only as Text).data = String(value);
      return value;
    }
  }
  // `undefined` is not a value a property has: assigned as it is, a string
  // property spells it out and `innerHTML` renders the word.
  setProperty(element, name, value === undefined ? coerceLive(name, value) : value);
  return value;
}

/**
 * The user-mutable channel. It takes NO `prev`, and that is the whole
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
 * The `class` channel, normalised from a string, array or object — and it emits
 * only the tokens it OWNS.
 *
 * `element.className = …` owns the whole attribute, so every class another
 * channel put there — a `ref`, a directive — is erased the moment
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
 * (`$$class`, beside `__bqs`), which is what "what this channel last applied"
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
    } else {
      // The attribute rather than `className`, which is a read-only
      // SVGAnimatedString on an SVG element and so needed a namespace read first.
      element.setAttribute("class", className);
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
    // A string was the whole attribute, so nothing of it is in a map to diff
    // against and all of it has to go before the object's declarations land.
    if (isString(prev)) element.removeAttribute("style");
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
  // Nothing to apply, so what the last value applied is taken back.
  if (isString(prev)) {
    element.removeAttribute("style");
  } else if (isStyleMap(prev)) {
    for (const cssProperty in prev) style.removeProperty(cssProperty);
  }
  return undefined;
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
  if (prev === undefined && hydrating() && parsesTo(element, html)) return html;
  if (html !== prev) element.innerHTML = html;
  return html;
}

let inert: Document | null = null;

/**
 * Whether `html`, parsed where `element` stands, gives the children it already
 * has. The server wrote the author's bytes and the browser serialises what it
 * parsed, so `<path/>` or an unquoted attribute never compares equal as a
 * string. Parsed in a document with no scripting and no custom elements, with
 * an element of the same namespace as the context, it is the write itself.
 */
function parsesTo(element: Element, html: string): boolean {
  const own = element.innerHTML;
  if (own === html) return true;
  inert ??= document.implementation.createHTMLDocument("");
  const probe = inert.createElementNS(element.namespaceURI, element.localName);
  probe.innerHTML = html;
  return probe.innerHTML === own;
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
 * The no-scope guard at the `ref` slot. `block`'s entry guard fires on `scope
 * === undefined`, and this is one of the two slots where the value is invoked
 * with something ELSE — the Element — so the guard is structurally unreachable
 * and a forwarded Block would run with a DOM node as its scope.
 * `requireScope` accepts it, everything below it is parented to that node, and
 * root disposal never reaches any of it. The brand is a property of the VALUE
 * (C3.8), so the test belongs here, at the read, exactly as `readSlot` puts it.
 */
function refuseBlock(target: unknown, origin: string, returned = false): void {
  if (isBlock(target)) throw jsxAsValue(origin, returned);
}

/** Every ref shape, returning whatever the callbacks handed back as cleanups. */
function applyRefs(element: Element, value: unknown): (() => void)[] {
  const undo: (() => void)[] = [];
  const one = (target: unknown): void => {
    refuseBlock(target, "A `ref`");
    if (isRefCallback(target)) {
      const back = target(element);
      // The LAUNDERED shape: an un-compiled caller wrapping a forwarded prop in
      // `() => x` carries no brand, so the test above walks past it and the
      // Block arrives here as the "cleanup" the callback returned. Registering
      // it as a cleanup would run a Block at disposal with no arguments at all.
      refuseBlock(back, "A `ref`", true);
      if (typeof back === "function") undo.push(back);
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
 * belongs to: a callback that returns a function has it run at disposal.
 *
 * A callback that throws is left to throw. A ref runs inside the computation
 * that is building its element, and a throw out of a computation is what the
 * engine already takes to the enclosing boundary. Routed by hand instead, the
 * boundary's own content would be writing the error it is in the middle of
 * reading, and nothing re-runs for that.
 */
export function ref(element: Element, value: unknown): void {
  const owner = getOwner();
  const undo = applyRefs(element, value);
  if (undo.length === 0 || owner === null) return;
  underScope(owner, "ref", () => {
    onCleanup(() => {
      for (const fn of undo) fn();
    });
  });
}

/**
 * `<form action={…}>`: the handler-channel rule applied to the one attribute
 * that carries either kind of value.
 *
 * `action` on a `<form>` is a URL when it holds a string and a SUBMIT HANDLER
 * when it holds a function, which is what React 19 and Solid 2.0 both settled
 * on. Nothing about the expression can tell them apart — an `action()` is
 * `(...args) => Promise<R>`, so its `length` is 0 and the arity rule reads it
 * as a Cell — so the SLOT decides, exactly as it does for `on*`: a function
 * arriving here is the handler, never a Cell yielding a URL.
 *
 * The compiler used to route this down the attribute channel, where `bindProp`
 * applied the arity rule to it. Both halves of that were wrong and both were
 * silent: the action was CALLED at mount, and the promise it returned was
 * stringified into the form's target as `action="[object Promise]"`. No console
 * error, and the form posted to a relative URL named after a promise.
 *
 * The listener is installed once per element and reads the current handler out
 * of the expando, so a live `action` is one `addEventListener` for the life of
 * the position rather than one per update. `listen` owns the removal (B4) and
 * routes a throw to the enclosing boundary (E2 #6).
 */
export function formAction(form: HTMLFormElement, value: unknown): void {
  const el = form as HTMLFormElement & { $$action?: unknown; $$actionBound?: true };
  if (typeof value !== "function") {
    el.$$action = undefined;
    setAttr(form, "action", value);
    return;
  }
  // A handler replaces whatever URL was written before it, because the two are
  // one attribute and the last write wins — `setAttr(el, "action", undefined)`
  // is how that is spelled.
  if (el.$$action === undefined) setAttr(form, "action", undefined);
  el.$$action = value;
  if (el.$$actionBound === true) return;
  el.$$actionBound = true;
  listen(form, "submit", (event: Event): void => {
    const handler = el.$$action;
    if (typeof handler !== "function") return;
    event.preventDefault();
    // The submitter's own name/value belong in the payload; a `<button
    // name="intent" value="delete">` is how a form says WHICH action it means,
    // and dropping it would make every submitter look alike.
    const submitter = (event as SubmitEvent).submitter;
    const data =
      submitter instanceof HTMLElement ? new FormData(form, submitter) : new FormData(form);
    (handler as (data: FormData, event: Event) => unknown)(data, event);
  });
}

/**
 * B4 — a listener dies with its position. `addEventListener` paired with a
 * cleanup on the scope the element belongs to, so removal costs no bookkeeping
 * and cannot be forgotten. A handler that throws routes to the boundary (E2 #6).
 *
 * The delegated set never reaches here: those are `__bq_<type>` expandos plus one
 * `delegateEvents` call per module, and that protocol is unchanged.
 */
export function listen(
  element: EventTarget,
  type: string,
  handler: EventListener,
  options?: boolean | AddEventListenerOptions,
): void {
  const owner = getOwner();
  refuseBlock(handler, `The \`on${type}\` handler`);
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
      runWithOwner(null, () => {
        // C3.8's laundered shape, tested on the RETURN — the same move
        // `applyRefs` already makes for `ref`, and for the same reason: a
        // handler is invoked with the EVENT, so `block`'s entry guard can never
        // fire and a `() => aBlock` carries no brand for the value test to see.
        // The Block arrives as what the handler returned. Left alone it is a
        // handler that silently does nothing, which is the failure this rule is
        // about; the cost is one property probe per dispatch, against a DOM
        // event.
        refuseBlock(handler.call(element, e), `The \`on${e.type}\` handler`, true);
      });
    } catch (error) {
      routeError(owner, error);
    }
  };
}

/**
 * The delegated half of the same registration. Compiled code writes the expando
 * itself — `_n1.__bq_click = h` — and this exists for the un-compiled walk and for
 * `spread`, so both record the owning scope the dispatcher routes a throw
 * through.
 *
 * @param owner The scope a throw from the handler is routed through. A caller
 * that binds from an effect's write has no ambient owner to read, and names the
 * one it captured.
 */
export function delegate(
  element: Element,
  type: string,
  handler: DelegatedHandler | undefined,
  owner: Scope | null = getOwner(),
): void {
  refuseBlock(handler, `The \`on${type}\` handler`);
  if (Array.isArray(handler)) refuseBlock(handler[0], `The \`on${type}\` handler`);
  (element as Element & Record<string, unknown>)[`__bq_${type}`] = handler;
  (element as Element & Record<string, unknown>)[SCOPE_KEY] = owner;
  if (handler !== undefined) declareDelegated(type);
}

/**
 * The one question channel resolution CANNOT answer at compile time:
 * whether the value that arrived is a live Cell. The CHANNEL is the compiler's,
 * passed in; only liveness is decided here.
 */
export function bindProp(element: Element, write: Channel, name: string, value: unknown): void {
  const given = getOwner();
  // An attribute is a CELL slot. A Block forwarded into one is the asymmetry
  // the rule is about, and it throws here rather than being invoked with
  // `undefined` and stringified into the attribute.
  if (isBlock(value)) {
    throw jsxAsValue(`The \`${name}\` attribute on \`<${element.localName}>\``);
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
  const keyed = write === setStyle;
  const property = write === setDomProp;
  const read = (): unknown => readOpaque(value(), name, property);
  let prev: unknown;
  effectUnder(
    given,
    "setProp",
    // C3.8 on the READ, not only on the value: a Cell that YIELDS a Block
    // carries no brand, so only a test at the read site can see it.
    keyed ? () => readKeys(read()) : read,
    (next) => {
      prev = write(element, name, next, prev);
    },
  );
}

/**
 * What a Cell in an attribute yields, given what the Cell returned. A Block
 * is refused rather than stringified into the attribute: a Cell that YIELDS
 * one walks past the brand test on the Cell itself. A property is the one
 * channel a function can be the value of; everywhere else a Cell that yields a
 * Cell is read through, which is what a compiled call is when it hands back an
 * accessor: `title={labelOf(row)}`.
 *
 * `bindProp` reads through it, and so does a compiled template effect for an
 * opaque call that joined it, so the two cannot disagree about a value.
 */
export function readOpaque(value: unknown, name: string, property?: boolean): unknown {
  if (typeof value !== "function") return value;
  if (isBlock(value)) throw jsxAsValue(`The \`${name}\` attribute`, true);
  if (property === true) return value;
  const read = (value as () => unknown)();
  if (isBlock(read)) throw jsxAsValue(`The \`${name}\` attribute`, true);
  return read;
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
  compute: (prev: T | undefined) => T,
  apply: (value: T, prev: T | undefined) => void | (() => void),
): void {
  effectUnder(getOwner(), "bindEffect", compute, apply);
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
const reportedEdits = new WeakMap<object, [Accessor<number>, Setter<number>]>();

function editsOf(value: object): [Accessor<number>, Setter<number>] {
  let counter = reportedEdits.get(value);
  if (counter === undefined) {
    counter = createSignal(0, { equals: false, ownedWrite: true });
    reportedEdits.set(value, counter);
  }
  return counter;
}

/**
 * `bind:` whole. The property, the event that reports a user edit and the
 * coercion are all resolved at compile time; what is left is the write, the
 * read-back, and the two things that make a controlled input actually work.
 *
 * `value` is a signal as the engine hands one out: the `[read, write]` pair.
 * `bind:value={name}` takes the pair `createSignal` returned, and
 * `bind:value={[name, setName]}` one put back together.
 *
 * **The write compares against the ELEMENT** (`writeLive`), not against the
 * last framework write, and it preserves the caret and the focus of whatever
 * the user is inside.
 *
 * **The signal is re-asserted after every reported edit**, and that is the half
 * a DOM-compare alone cannot supply. When a setter REJECTS or NORMALISES a
 * keystroke the signal does not change, so the effect never re-runs and no
 * comparison of any kind gets a chance to run: without it the element keeps
 * text the signal never held, permanently. The repair lands at the flush the
 * edit scheduled, which is a microtask and so before paint: there is no frame
 * showing the rejected character.
 */
export function bindValue(element: Element, name: string, type: string, value: unknown): void {
  const given = getOwner();
  const target = element as Element & Record<string, unknown>;
  const pair = Array.isArray(value) ? (value as [unknown, unknown]) : null;
  const read = pair !== null && typeof pair[0] === "function" ? (pair[0] as () => unknown) : null;
  const set =
    pair !== null && typeof pair[1] === "function" ? (pair[1] as (next: unknown) => unknown) : null;
  if (read === null || set === null) {
    emitDiagnostic({
      code: "BIND_TARGET_NOT_WRITABLE",
      kind: "render",
      severity: "error",
      message:
        `\`bind:${name}\` on \`<${element.localName}>\` was given a value of type ` +
        `\`${typeof value}\` instead of a signal, so the element does not follow the value and ` +
        "what the user types is never written back. Pass the whole signal, the `[read, write]` " +
        `pair \`createSignal\` returns: \`const text = createSignal("")\` and then ` +
        `\`bind:${name}={text}\`.`,
    });
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

  if (read === null) {
    write(value);
    return;
  }
  const [edits, reportEdit] = editsOf(read);
  effectUnder(
    given,
    "bind",
    () => {
      edits();
      return readSlot(read, `\`bind:${name}\``);
    },
    write,
  );
  if (set === null) return;
  listen(element, type, () => {
    // `bind:group` is the one channel whose reported value is not the property
    // it writes: a radio reports the VALUE of the button that is now checked,
    // and the one being turned OFF reports nothing — its newly-checked sibling
    // fires its own `change` and that is the event carrying the answer.
    if (name === "group") {
      if (target.checked !== true) return;
      set(target.value);
    } else {
      set(target[name]);
    }
    // The EFFECT cannot be relied on to re-assert the signal: if anything —
    // another handler for the same event, a veto in the author's own
    // `onChange`, the sibling radio the browser just unchecked — leaves the
    // signal holding the value it held BEFORE the edit, the scheduler sees no
    // change at all and correctly declines to re-run, while the elements are
    // holding what the user did. That is B6's two-writer problem one level
    // down, in the dedupe rather than in the channel, and it cannot be fixed
    // per-element: a radio group is N elements and one signal, and the edit is
    // reported on exactly one of them.
    //
    // So a reported edit invalidates every two-way binding ON THE SAME SIGNAL.
    // Each re-run costs one signal read and one DOM-compare that skips, which is
    // nothing against the keystroke that caused it, and it is the only mechanism
    // that sees a pair the scheduler cannot: (signal, element).
    reportEdit((n) => n + 1);
  });
}

/**
 * Name → channel, for the UN-COMPILED path only. The compiled path never calls
 * this, because there is no `setProp` dispatcher on it. This is that
 * dispatcher, kept alive for `createElement` and `spread`, and it is the
 * definition the generated Rust tables are read out of, so the two resolutions
 * cannot drift.
 */
function channelOf(key: string, isSvg: boolean, tag: string): Channel {
  if (key === "class") return setClass;
  if (key === "className") return setClass;
  if (key === "style") return setStyle;
  if (key === "ref") return setRef;
  if (key === "dangerouslySetInnerHTML") return setHtml;
  // The user-mutable channel comes before the plain property one: these are
  // properties too, and what separates them is who else writes them.
  if (!isSvg && isUserMutable(tag, key)) return setLive;
  // Form-field exceptions stay properties (value, checked, selected, ...). The
  // runtime takes that branch only outside the SVG namespace.
  if (!isSvg && key in DOM_PROPS) return setDomProp;
  return setAttr;
}

/**
 * The attribute name the channel is handed: `className`/`htmlFor` normalised,
 * and kebab-cased inside the SVG namespace with the two documented exemptions.
 */
/**
 * One spelling per thing a prop writes, so a name the compiler resolved can be
 * compared with a key that only exists at run time: `onClick` and `onclick`
 * are one listener, `className` and `class` one attribute.
 */
function spreadKey(key: string, isSvg: boolean): string {
  const captured = captureTypeOf(key);
  if (captured !== null) return `oncapture:${captured}`;
  if (key[0] === "o" && key[1] === "n") return `on:${key.slice(2).toLowerCase()}`;
  return attrNameOf(key, isSvg);
}

function attrNameOf(name: string, isSvg: boolean): string {
  let propKey = name === "className" ? "class" : name === "htmlFor" ? "for" : name;
  if (isSvg && propKey !== "class" && propKey !== "viewBox") {
    propKey = toKebabCase(propKey);
  }
  return propKey;
}

const STYLE_MAP = Symbol("barq-style-map");

interface StyleMap extends Record<string, string> {}

/**
 * A `style` object with every getter it holds called.
 *
 * A key may be live on its own, `{ color: () => tone() }`, and the read is the
 * tracked half of a binding: called here, the key is a dependency of the
 * binding that writes it. Left for the write half to find, it would need an
 * effect of its own created where nothing owns one. The object comes back
 * untouched when it holds no getter, which is every object but that shape.
 */
export function readKeys<T>(value: T): T {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  let read: Record<string, unknown> | null = null;
  for (const key in value) {
    const held = (value as Record<string, unknown>)[key];
    if (!isSignalGetter(held)) continue;
    read ??= { ...(value as Record<string, unknown>) };
    read[key] = held();
  }
  return read === null ? value : (read as T);
}

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
  // The rule is WRONG here and `tsc` says so: `defineProperty<T>(o: T)`
  // returns `T`, so without the annotation `applied` is `{}` and every
  // write below is TS7053. `oxlint --fix` removed it and broke the build.
  // oxlint-disable-next-line typescript/no-unnecessary-type-assertion
  const applied = Object.defineProperty({} as StyleMap, STYLE_MAP, { value: true });

  for (const prop in next) {
    const raw = next[prop];
    const cssProp = cssName(prop);

    // Per-property reactive values keep their own effect (static object case)
    if (isSignalGetter(raw)) {
      renderEffect(raw, (value) => {
        setStylePropDirect(style, cssProp, value);
      });
      continue;
    }

    if (raw === null || raw === undefined || raw === false) continue;

    const text = cssValue(cssProp, raw);
    applied[cssProp] = text;
    if (!prev || prev[cssProp] !== text) {
      style.setProperty(cssProp, text);
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

/**
 * Normalize a class value to a string, or null for no class at all. A list may
 * hold strings, maps and further lists, joined in order, as Solid 2.0's `class`
 * takes them.
 */
export function classToString(value: unknown): string | null {
  if (isNullish(value) || value === false) return null;
  if (isString(value)) return value;
  if (isArray(value) || isObject(value)) return appendClasses("", value);
  return null;
}

function appendClasses(into: string, value: unknown): string {
  if (isArray(value)) {
    let out = into;
    for (let i = 0; i < value.length; i++) out = appendClasses(out, value[i]);
    return out;
  }
  if (isObject(value)) {
    let out = into;
    for (const k in value) {
      if (value[k]) out += (out ? " " : "") + k;
    }
    return out;
  }
  if (typeof value !== "string" && typeof value !== "number") return into;
  if (value === "" || value === 0) return into;
  const name = String(value);
  return into ? `${into} ${name}` : name;
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
    if (isSignalGetter(raw)) raw = raw();
    if (raw === null || raw === undefined || raw === false) continue;
    const cssProp = cssName(prop);
    css += `${css ? " " : ""}${cssProp}: ${cssValue(cssProp, raw)};`;
  }
  return css === "" ? null : css;
}

/**
 * Brand carried by every value the compiler's SSR string mode produces. A
 * module that fell back to this DOM backend can still render a component
 * compiled to strings, and without this it would insert the markup as escaped
 * text.
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

  style.setProperty(cssProperty, cssValue(cssProperty, value));
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
function normalizeChildToNodes(value: Child, prev: Node[], s: Scope | null): Node[] {
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

    if (isSsrHtml(child)) {
      for (const node of ssrHtmlNodes(child)) out.push(node);
      return;
    }

    // O4.5: the scope the INSERT was given, not the ambient owner. This is the
    // site the O4.5 row named as `childToNodes` and it is not that function —
    // an array holding a function goes `insert` → the live-hole effect →
    // `applyInsert` → here, and never through `childToNodes` at all. The row's
    // diagnosis was describing a path M9 had already restructured.
    if (typeof child === "function") {
      // `buildChild`, so a Block reached through an array hole — a component's
      // children, `<>{props.children}</>` — is built untracked. Called bare,
      // every signal the component's BODY read became a dependency of the one
      // effect placing the whole array, and the next change rebuilt all of it:
      // a popover constructed twice, two entries in the overlay stack, and the
      // one holding the mounted element no longer the top.
      if (isBlock(child)) {
        visit(buildChild(child as (s: unknown) => Child, s));
        return;
      }
      for (const node of liveHole(child as (s: unknown) => Child, s)) out.push(node);
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
      out.push(claimText(text) ?? document.createTextNode(text));
    }
  };

  visit(value);
  return out;
}

/**
 * Reconcile two node arrays in place (udomdiff: common prefix/suffix,
 * swap shortcut, lazy Map fallback). Keys are node identities - exactly
 * right for fine-grained rendering where rows keep their DOM nodes.
 * * Adapted from udomdiff.
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
 * Whether the claiming run handed back nothing the DOM does not already hold.
 *
 * A nested region returns nothing at all, and that case has been handled since
 * regions existed. An ARRAY of children is the same answer written differently:
 * `[<Title/>, <Badge/>]` where the badge renders a `<Show>` produces
 * `[element, undefined]`, because the branch claimed the server's span and
 * needed no anchor to put it back. Testing only for a wholly nullish value let
 * that array through to the reconciler, which saw one node where the claim held
 * four and REMOVED the span — silently, with no mismatch recorded, because
 * nothing about it was a mismatch.
 *
 * Measured on a card: the server wrote its badge and the hydrated page did not
 * have one.
 */
function claimedItAll(produced: Child, taken: readonly Node[]): boolean {
  if (produced === null || produced === undefined) return true;
  if (!isArray(produced)) return false;
  // An empty array is a hole that produced nothing, which is not the same as
  // one that claimed: leave it to the reconciler.
  if (produced.length === 0) return false;
  return produced.every((entry) => {
    if (entry === null || entry === undefined) return true;
    return entry instanceof Node && taken.includes(entry);
  });
}

/** The hole adopted the server's nodes whole, so there is nothing to place. */
const CLAIMED: unique symbol = Symbol("barq-claimed");

/** What a hole resolved to: text it can write through, or the nodes it owns. */
type Resolved = string | number | Node[];

/**
 * The READ half of a hole: call what has to be called and flatten to nodes.
 * Everything a hole depends on is read here, inside its effect's compute, so
 * the write half below touches the document and nothing else.
 */
function resolveInsert(value: Child, current: Node[], s: Scope | null): Resolved {
  if (typeof value === "string" || typeof value === "number") return value;
  return normalizeChildToNodes(value, current, s);
}

/**
 * The WRITE half: put `value` into `parent`, replacing whatever this hole
 * rendered last time (`current`), anchored before `marker` (null = end of
 * parent). Returns the nodes the hole now owns.
 *
 * A hole tracks its own nodes instead of fencing them with comment markers, so
 * it costs the nodes it actually renders: a lone text hole is one text node,
 * not a text node between two comments.
 */
function placeInsert(parent: Node, value: Resolved, current: Node[], marker: Node | null): Node[] {
  let next: Node[];
  if (typeof value === "string" || typeof value === "number") {
    // Same text node as last time: write through it
    if (current.length === 1 && current[0].nodeType === 3) {
      writeText(current[0] as Text, value);
      return current;
    }
    // Sole occupant of its parent: the element is the range, so no bookkeeping
    if (marker === null && current.length === 0 && parent.firstChild === null) {
      fillText(parent, value);
      const node = parent.firstChild;
      return node === null ? EMPTY_NODES : [node];
    }
    next = [textNode(value)];
  } else {
    next = value;
  }

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
 * Text is handed to the DOM as it arrived. The DOM converts a number itself,
 * where `String()` adds an entry to V8's number-to-string cache for every
 * distinct number, and a table of row ids is a thousand of them.
 */
type TextValue = string | number;

interface NumericText {
  createTextNode(data: TextValue): Text;
}

function textNode(value: TextValue): Text {
  return (document as NumericText).createTextNode(value);
}

function writeText(node: Text, value: TextValue): void {
  (node as { data: TextValue }).data = value;
}

/**
 * Fill an empty element with text. A string goes through `textContent`, which
 * creates no node for `""`; a number is appended as a node, because a DOM that
 * tests the value's truthiness before converting it renders `0` as nothing.
 */
function fillText(parent: Node, value: TextValue): void {
  if (typeof value === "number") {
    parent.appendChild(textNode(value));
  } else {
    parent.textContent = value;
  }
}

/**
 * What a live hole holds between runs: its nodes, or `SOLE_TEXT` while it is
 * its parent's only content and that content is text. The text node is then
 * the parent's first child and is not kept: holding it would give every text
 * hole a JS wrapper for its node, and an array around it besides.
 */
const SOLE_TEXT: unique symbol = Symbol("barq-sole-text");

type Held = Node[] | typeof SOLE_TEXT;

function heldNodes(parent: Node, held: Held): Node[] {
  if (held !== SOLE_TEXT) return held;
  const text = parent.firstChild;
  return text !== null && text.nodeType === 3 ? [text] : EMPTY_NODES;
}

/**
 * A live hole with nothing to claim. Its own function so the effect's two
 * closures share one context that holds only what an update needs.
 */
function insertLive(
  parent: Node,
  value: (s: unknown) => Child,
  anchor: Node | null,
  given: Scope | null,
): void {
  let held: Held = EMPTY_NODES;
  effectUnder<Resolved>(
    given,
    "insert",
    () => {
      const owner = getOwner();
      if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockEnter("insert", given);
      const produced = yielded(buildChild(value, owner), owner);
      if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockExit("insert");
      if (typeof produced === "string" || typeof produced === "number") return produced;
      return normalizeChildToNodes(produced, heldNodes(parent, held), given);
    },
    (resolved) => {
      held = placeHeld(parent, resolved, held, anchor);
    },
  );
}

function placeHeld(parent: Node, value: Resolved, held: Held, marker: Node | null): Held {
  const text = typeof value === "string" || typeof value === "number";
  if (held === SOLE_TEXT) {
    const node = parent.firstChild;
    if (text && node !== null && node.nodeType === 3) {
      writeText(node as Text, value);
      return held;
    }
    held = heldNodes(parent, held);
  }
  if (text && marker === null && held.length === 0 && parent.firstChild === null) {
    fillText(parent, value);
    return parent.firstChild === null ? EMPTY_NODES : SOLE_TEXT;
  }
  return placeInsert(parent, value, held, marker);
}

function applyInsert(
  parent: Node,
  value: Child,
  current: Node[],
  marker: Node | null,
  s: Scope | null,
): Node[] {
  return placeInsert(parent, resolveInsert(value, current, s), current, marker);
}

/**
 * Run `build` with `given` as `CURRENT`, so everything it creates is owned by
 * the scope the call was HANDED rather than by whatever the call site left
 * current. That is O4.5, and it is what the four flow primitives already do.
 *
 * `null` is left alone deliberately: it names NO owner, so there is nothing for
 * the argument to win, and forcing `CURRENT` to null would detach the build
 * from an owner the call site does have.
 */
/**
 * Build the value at a hole, with a COMPONENT's construction untracked.
 *
 * A component reads signals while it builds — a prop, a piece of state it
 * derives a class from — and inside `insert`'s effect those reads become
 * dependencies of the HOLE. The next change to any of them then re-runs the
 * insert and rebuilds the whole subtree: new elements, new listeners, focus
 * gone, and every piece of state the DOM itself was holding (a checkbox's
 * `checked`, a field's caret, a scroll offset) gone with them. What looked
 * like a fine-grained update was a teardown and a re-mount.
 *
 * The reads that are meant to be live are inside the effects the body creates,
 * and an effect created here establishes its own tracking, so nothing that
 * should update stops updating. Only a BLOCK is untracked: the compiler emits
 * one for a scope-taking JSX body and a plain arrow for an expression hole, so
 * `<Foo>{count()}</Foo>` keeps tracking its expression.
 *
 * A body that SUSPENDS is retried tracked, for the reason `flow.ts`'s
 * `swapMaybeSuspending` states: nothing was built, and an untracked read
 * registered no dependency, so the position could never wake and the boundary
 * above would sit on its fallback for good.
 */
function buildChild(value: (s: unknown) => Child, owner: Scope | null): Child {
  if (!isBlock(value)) return value(owner);
  try {
    return untrack(() => value(owner));
  } catch (error) {
    if (!(error instanceof NotReadyError)) throw error;
    return value(owner);
  }
}

/**
 * What a Cell comes to once every Cell it yields has been read as well.
 *
 * `{() => value()}` where the value is itself a getter is ONE hole watching
 * two reads, not a hole holding a second hole.
 */
function yielded(value: Child, owner: Scope | null): Child {
  while (typeof value === "function" && !isBlock(value)) {
    value = (value as (s: unknown) => Child)(owner);
  }
  return value;
}

/**
 * A render effect owned by `given`. Entering `given` makes it current and the
 * build untracked; when it already is both, entering it again changes nothing,
 * and every binding of every row would pay two closures and a `runWithOwner`
 * for it. A disposed `given` still goes through `runWithOwner`, whose
 * development build reports it.
 */
function effectUnder<T>(
  given: Scope | null,
  origin: string,
  compute: (prev: T | undefined) => T,
  apply: (value: T, prev: T | undefined) => void | (() => void),
): void {
  if (given === null || (given === getOwner() && getObserver() === null && !isDisposed(given))) {
    renderEffect(compute, apply);
    return;
  }
  underScope(given, origin, () => renderEffect(compute, apply));
}

/**
 * Insert a child into `parent` before `marker` (or append when absent), under
 * the scope the enclosing Block was given. Scope FIRST.
 *
 * Taking it as an argument is what makes the no-scope guard enforceable at no
 * cost. A
 * compiled Block that builds anything reaches here, so a Block invoked with no
 * scope throws where it was mistimed rather than silently constructing under
 * whatever happened to be current — and the ownership trace gets a `given` that
 * was threaded rather than read back off `CURRENT`, which is the one comparison
 * that cannot fail.
 *
 * @param mode `hydration.ts`'s `WHOLE`, emitted only by a `hydratable` build
 * and only at a hole that owns its parent's child list. The string backend
 * wrote no boundary comments there, so the claim is every child of `parent`.
 */
export function insert(
  parent: Node,
  value: Child | (() => Child),
  marker?: Node | null,
  mode?: number,
): void {
  const given = getOwner();
  let anchor = marker ?? null;

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
  // This is the "marker restored" answer, and it costs the payload that
  // decision agreed to pay. The alternative — a hydration-aware insert that
  // adopts whatever children it finds — needs no marker but cannot tell an
  // adjacent static text run from the dynamic one beside it, because the parser
  // fuses them into a single node before the client ever sees them.
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

  // A Block is a construction, so it is run ONCE and what it built is placed
  // like any other value. Nothing here follows a signal: the parts of it that
  // move are holes of their own, each with its own effect, and a hole wrapped
  // around the whole of it re-ran the construction for every one of them.
  if (typeof value === "function" && isBlock(value)) {
    const build = value as (s: unknown) => Child;
    if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockEnter("insert", given);
    try {
      if (claim !== null) {
        claims().placeClaimed(parent, claim, anchor, () =>
          childToNodes(buildChild(build, given), given),
        );
        return;
      }
      value = buildChild(build, given);
    } finally {
      if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockExit("insert");
    }
    if (typeof value === "function") {
      insert(parent, value, marker, mode);
      return;
    }
  }

  if (typeof value === "function" && claim === null) {
    insertLive(parent, value as (s: unknown) => Child, anchor, given);
    return;
  }

  if (typeof value === "function") {
    let current: Node[] = claim === null ? EMPTY_NODES : claim.nodes;
    let first = claim;
    // O4.5: the effect belongs to the scope this call was GIVEN, not to
    // whatever happened to be current at the call site. Without this the
    // argument is decoration — a hole inserted under scope A while B is ambient
    // put its cleanup on B, so disposing A left the effect running and writing
    // into a detached tree. `branch`, `each`, `boundary` and `portal` have all
    // taken their scope this way since M4; this is the same line in `insert`.
    effectUnder<Resolved | typeof CLAIMED>(
      given,
      "insert",
      () => {
        const owner = getOwner();
        if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockEnter("insert", given);
        // The FIRST run is the claiming one, and only the first: the nodes it
        // produces are the server's, and every later run is an ordinary update
        // against them. `first` is cleared before the build so a value that
        // throws does not leave the cursor open over a range nobody owns.
        const claiming = first;
        first = null;
        let produced: Child;
        let taken: Node[] | null = null;
        if (claiming === null) {
          produced = yielded(buildChild(value as (s: unknown) => Child, owner), owner);
        } else {
          const run = withRangeTaken(claiming, () => {
            const built = yielded(buildChild(value as (s: unknown) => Child, owner), owner);
            // RESOLVED INSIDE THE CURSOR. A thunk in the produced array is
            // called on the way to the document, which is AFTER
            // `withRangeTaken` has closed the cursor — so a `template()`
            // inside one claimed from the position after this range instead
            // of from it. Measured on a document-hydrated page as "the server
            // wrote <body> where the client builds <meta>": `<head>`'s
            // children were resolved once `<head>`'s range had already been
            // left.
            //
            // Only on the CLAIMING run. Later runs re-call the thunks through
            // the ordinary path, so nothing about reactivity changes.
            //
            // A bare thunk as much as an array of them: a hole that hands
            // back `props.children` produces the Block itself. And an array
            // of strings as much as either: its text is the server's, and
            // only the cursor knows which text node each string is.
            return holdsAFunction(built) || isArray(built)
              ? inDocumentOrder(() => childToNodes(built, given))
              : built;
          });
          produced = run.value;
          taken = run.taken;
        }
        if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockExit("insert");
        // A value that CLAIMED the server's nodes and handed nothing back — a
        // nested region does exactly that, since a claimed site needs no
        // synthesised anchor to insert. Reconciling `null` against the claim
        // would remove the whole subtree the region just adopted; measured on
        // a router page as a `<div>shell:` with its route emptied out of it.
        if (taken !== null && taken.length > 0 && claims().claimedItAll(produced, taken)) {
          current = taken;
          return CLAIMED;
        }
        if (claiming !== null) {
          claims().detectTextDrift(current, produced);
          claims().adoptText(current, produced);
        }
        return resolveInsert(produced, current, given);
      },
      (resolved) => {
        if (resolved !== CLAIMED) current = placeInsert(parent, resolved, current, anchor);
      },
    );
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
    const taken = takenAtHole(claim);
    if (holdsAFunction(value)) {
      claims().placeClaimed(parent, claim, anchor, () => childToNodes(value, given), taken);
      return;
    }
    // The same question the live path asks its cursor: a value that is all
    // nodes the build took in place, or nothing at all beside them, was
    // adopted where it stands. Reconciled, the range comments a region inside
    // it anchors on would be removed, and the region would then insert beside
    // a node that is no longer in the document.
    if (taken.taken.length > 0 && claims().claimedItAll(value, taken.taken)) return;
    // An array's strings are made into nodes against the cursor, which is the
    // only thing that knows which of the server's text nodes each one is.
    if (isArray(value)) {
      claims().placeClaimed(parent, claim, anchor, () => childToNodes(value, given), taken);
      return;
    }
    claims().detectTextDrift(claim.nodes, value);
    claims().adoptText(claim.nodes, value);
    applyInsert(parent, value, claim.nodes, anchor, given);
    return;
  }

  if (value instanceof Node) {
    parent.insertBefore(value, anchor);
  } else if (isSsrHtml(value)) {
    for (const node of ssrHtmlNodes(value)) {
      parent.insertBefore(node, anchor);
    }
  } else if (Array.isArray(value)) {
    const nodes = childToNodes(value, given);
    for (let i = 0; i < nodes.length; i++) parent.insertBefore(nodes[i], anchor);
  } else {
    // `applyInsert`'s sole-occupant fast path, which the static branch never
    // had: the element IS the range, so the text needs no node of its own to
    // track. `textContent = ""` creates NO text node where `appendChild`
    // creates an empty one, so the empty string keeps the old path.
    if (anchor === null && value !== "" && parent.firstChild === null) {
      fillText(parent, value);
      return;
    }
    parent.insertBefore(textNode(value), anchor);
  }
}

/**
 * Build a value over the range the server wrote for it, and leave the range
 * holding exactly what was built.
 *
 * The build runs with the cursor open and in document order, so every template
 * and every string in it takes the node it is level with. What comes back is
 * the whole of the value in order, and placing it is by identity: a node the
 * build took stays where it is, one it had to make goes in beside it, and one
 * the server wrote that nothing took comes out.
 */
function placeClaimed(
  parent: Node,
  claim: Range,
  anchor: Node | null,
  build: () => Node[],
  after?: Taken,
): void {
  const built = withRangeTaken(claim, () => inDocumentOrder(build), after).value;
  placeInsert(parent, built, claim.nodes, anchor);
}

/**
 * The halves of `insert` that only a claim reaches, installed by `hydrate` for
 * the reason `hydration.ts` installs its walk: reached directly from `insert`,
 * a page that never hydrates shipped them.
 */
const INSERT_CLAIMS = { placeClaimed, adoptText, detectTextDrift, claimedItAll };
let insertClaims: typeof INSERT_CLAIMS | null = null;

function claims(): typeof INSERT_CLAIMS {
  if (insertClaims === null) {
    throw new Error("barq: a server range was claimed while no `hydrate` call was running");
  }
  return insertClaims;
}

/** Text written through the one text node the server sent is that node, reused. */
function adoptText(claimed: readonly Node[], produced: Child): void {
  if (typeof produced !== "string" && typeof produced !== "number") return;
  if (claimed.length === 1 && claimed[0].nodeType === 3) adopted();
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
      ? `The server sent ${claimed.length} nodes where the browser renders the text ${JSON.stringify(want)}. ${usualCauses("text")} The browser's text replaced what the server sent, so the page is correct but its content changed after load.`
      : `The server sent the text ${JSON.stringify(have)} where the browser renders ${JSON.stringify(want)}. ${usualCauses("text")} The browser's text was written into the server's node, so the page is correct but its content changed after load.`,
  );
}

/**
 * The UN-COMPILED path's prop entry: resolve the name to a channel, then bind.
 *
 * The compiled path never reaches this: every attribute resolves to exactly one
 * channel at compile time. What is left here is what `createElement` and
 * `spread` need, plus the `prop:` and `bind:` namespaces so the two paths accept
 * the same source. Any other prefix is part of an attribute's name, `on:click`
 * included.
 */
export function setProp(element: Element, key: string, value: unknown): void {
  const isSvg = element.namespaceURI === SVG_NS;

  const colon = key.indexOf(":");
  if (colon > 0) {
    const rest = key.slice(colon + 1);
    switch (key.slice(0, colon)) {
      case "prop":
        bindProp(element, setDomProp, rest, value);
        return;
      case "bind": {
        if (rest === "this") {
          ref(element, value);
          return;
        }
        const [name, type] = bindChannelOf(element, rest);
        bindValue(element, name, type, value);
        return;
      }
      default:
        break;
    }
  }

  // `applyProp`'s original test: `key[0] === "o" && key[1] === "n"`, so
  // `onceUpon` really does bind a `ceupon` listener and the compiler agrees.
  // The `Capture` suffix is tested FIRST, or `onKeyDownCapture` would bind a
  // bubble-phase listener for an event called `keydowncapture`.
  if (colon < 0) {
    const captured = captureTypeOf(key);
    if (captured !== null) {
      bindEvent(element, captured, value, true);
      return;
    }
    if (key[0] === "o" && key[1] === "n") {
      bindEvent(element, key.slice(2).toLowerCase(), value);
      return;
    }
  }

  if (key === "ref") {
    ref(element, value);
    return;
  }

  bindProp(element, channelOf(key, isSvg, element.tagName), attrNameOf(key, isSvg), value);
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
export function bindEvent(element: Element, type: string, value: unknown, capture = false): void {
  if (!isEventHandlerValue(value)) return;
  // Delegation is one listener per render root in the BUBBLE phase, so it
  // cannot serve a capture binding at all.
  if (!capture && DELEGATED_EVENTS.has(type)) {
    delegate(element, type, value as DelegatedHandler);
    return;
  }
  listen(element, type, toListener(value as DelegatedHandler), capture);
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
 *
 * @param later The names written on the element AFTER this spread, in
 * `spreadKey`'s spelling. They are the later writer's:
 * `<div {...rest} title={label()}>` keeps the explicit title, as the object it
 * reads like would, and a spread that applied its own on every update took it
 * back each time `rest` moved.
 */
export function spread(
  element: Element,
  props: Record<string, unknown> | (() => Record<string, unknown>),
  later?: readonly string[],
): void {
  const given = getOwner();
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
    const captured = captureTypeOf(key);
    if (captured !== null || (key[0] === "o" && key[1] === "n")) {
      const eventName = captured ?? key.slice(2).toLowerCase();
      // A capture binding is always direct: delegation is bubble-phase only.
      if (captured === null && DELEGATED_EVENTS.has(eventName)) {
        delegate(
          element,
          eventName,
          isEventHandlerValue(value) ? (value as DelegatedHandler) : undefined,
          given,
        );
      } else {
        // Keyed by the PROP, not the event type: `onKeyDown` and
        // `onKeyDownCapture` are two listeners for one type, and one would
        // otherwise remove the other.
        const prevListener = directListeners[key];
        if (prevListener) {
          element.removeEventListener(eventName, prevListener, captured !== null);
          delete directListeners[key];
        }
        if (isEventHandlerValue(value)) {
          const listener = routedListener(given, element, toListener(value as DelegatedHandler));
          directListeners[key] = listener;
          element.addEventListener(eventName, listener, captured !== null);
          if (given !== null && !owned.has(key)) {
            owned.add(key);
            underScope(given, "spread", () => {
              onCleanup(() => {
                const last = directListeners[key];
                if (last !== undefined) {
                  element.removeEventListener(eventName, last, captured !== null);
                }
              });
            });
          }
        }
      }
      applied[key] = value;
      return;
    }

    applied[key] = channelOf(key, isSvg, element.tagName)(
      element,
      attrNameOf(key, isSvg),
      value,
      applied[key],
    );
  };

  const isEventKey = (key: string): boolean =>
    captureTypeOf(key) !== null || (key[0] === "o" && key[1] === "n");

  /**
   * The READ half: every getter a prop holds is called here, so the write half
   * below sees values only. An event handler and a `ref` are functions that are
   * NOT getters, and they pass through as they are.
   */
  const read = (): Record<string, unknown> => {
    const next = typeof props === "function" ? props() : props;
    const resolved: Record<string, unknown> = {};
    for (const key in next) {
      if (key === "children") continue;
      if (later !== undefined && later.includes(spreadKey(key, isSvg))) continue;
      const value = next[key];
      if (key === "ref" || isEventKey(key)) {
        resolved[key] = value;
        continue;
      }
      // `style` included: a style OBJECT reaches `diffStyleObjects` whole, and
      // a FUNCTION in the style key is a Cell like any other.
      //
      // The Block refusal is spelled HERE rather than left to the invocation.
      // Ownership is ambient, so a Block is an ordinary zero-arity function and
      // calling one no longer throws for want of a scope; `style` would take
      // the Node it built and read the DOM constants off it as css declarations.
      refuseBlock(value, `The \`${key}\` prop in a spread`);
      const held = isSignalGetter(value) ? value() : value;
      resolved[key] = key === "style" ? readKeys(held) : held;
    }
    return resolved;
  };

  renderEffect(read, (next) => {
    // Removal pass: props that vanished since the last run are cleared
    for (const key in applied) {
      if (!(key in next)) {
        applyOne(key, null);
        delete applied[key];
      }
    }

    for (const key in next) {
      if (key === "ref") {
        // Under the scope the spread was given, so what the callback hands
        // back is run when that scope goes.
        if (first) runWithOwner(given, () => ref(element, next[key]));
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
  return isArray(child) && child.some(holdsAFunction);
}

/**
 * The nodes that stand at the END of something whose content changes after it
 * is built: a live hole's text node, a region's anchor.
 *
 * Whoever built a list of nodes and kept it has, wherever one of these is in
 * it, a snapshot of what stood before the edge on the day it was taken. `each`
 * asks, so that a row it moves is the row as it stands.
 */
export const LIVE_EDGES: WeakSet<Node> = new WeakSet<Node>();

/**
 * A Cell that is not the whole value of a hole: one entry of a children array,
 * or the body of a unit with no element around it.
 *
 * It gets an effect of its own and one text node to stand on, so it updates
 * where it is without anything around it being asked again. Called inline, its
 * reads became the enclosing hole's, and the next change to any of them
 * re-ran that hole: every sibling in the array was built a second time, state
 * and focus gone with the nodes, for a change that concerned one of them.
 *
 * The text node is the value when the value is text, and the edge the nodes
 * are placed before when it is not.
 */
function liveHole(cell: (s: unknown) => Child, given: Scope | null): Node[] {
  let tail: Text | null = null;
  let current: Node[] = EMPTY_NODES;
  // What the creating run resolved, which is taken here rather than in the
  // write below: a hole made while another effect is computing has its write
  // queued behind that effect's, and the caller needs the nodes now.
  let initial = UNRESOLVED as Resolved | typeof UNRESOLVED;
  let written = false;
  let standing = false;

  const write = (resolved: Resolved): void => {
    if (typeof resolved !== "object") {
      const text = String(resolved);
      if (tail === null) {
        tail = claimText(text) ?? document.createTextNode(text);
        return;
      }
      if (current.length > 0) {
        removeNodes(current);
        current = EMPTY_NODES;
      }
      if (tail.data !== text) tail.data = text;
      return;
    }
    if (tail === null) {
      tail = document.createTextNode("");
      current = resolved;
      return;
    }
    if (tail.data !== "") tail.data = "";
    const parent = tail.parentNode;
    current = parent === null ? resolved : placeInsert(parent, resolved, current, tail);
  };

  renderEffect<Resolved>(
    () => {
      const owner = getOwner();
      const resolved = resolveInsert(yielded(cell(owner), owner), current, given);
      if (!standing) initial = resolved;
      return resolved;
    },
    (resolved) => {
      if (!standing) {
        written = true;
        return;
      }
      const first = resolved === initial;
      initial = UNRESOLVED;
      if (!first) write(resolved);
    },
  );
  standing = true;
  const took = initial;
  if (written) initial = UNRESOLVED;
  if (took !== UNRESOLVED) write(took);
  tail ??= document.createTextNode("");
  LIVE_EDGES.add(tail);
  return current.length === 0 ? [tail] : [...current, tail];
}

const UNRESOLVED: unique symbol = Symbol("barq-unresolved");

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

  if (isSsrHtml(child)) {
    return ssrHtmlNodes(child);
  }

  // A Cell ignores the argument, a Block needs it, and one
  // call serves both.
  //
  // O4.5: the Block is invoked with the scope this call was GIVEN.
  //
  // It used to be handed the AMBIENT one, and the reason was `render`: it opens
  // its root, makes it current, and used to reach here with the CALLER's `s`,
  // so passing `s` put the whole mount under whatever was current at the
  // `render` call site. Passing `s` on its own therefore failed five of
  // `sem-own-render-disposer-disposes`'s claims, and the two halves had to land
  // together.
  //
  // They have. The compiler wraps a bare JSX argument in `render`/`hydrate`'s
  // first position into a Block (O5), so a mount reaches `render` as a function
  // and `render` invokes it with the root — there is no longer a path that
  // arrives here with a scope that is not the one the subtree belongs under.
  //
  // M9 narrowed what that costs. An ARRAY holding a function no longer reaches
  // here un-owned: `insert` routes it through its own effect first, so the
  // ambient owner at this line IS a descendant of the scope `insert` was given.
  // What is left is a bare function reaching `childToNodes` directly, which is
  // the `render` path above and nothing else.
  if (typeof child === "function") {
    if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockEnter("children", s);
    // `buildChild`, not a bare call: a Block reached through an array hole is
    // a component's construction, and it must no more be a dependency of the
    // hole that placed it here than it is anywhere else. A Cell stays tracked,
    // because a Cell in an array IS what the hole is watching.
    if (!isBlock(child)) {
      if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockExit("children");
      return liveHole(child as (s: unknown) => Child, s);
    }
    const built = buildChild(child as (s: unknown) => Child, s);
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

  const text = String(child);
  return [claimText(text) ?? document.createTextNode(text)];
}

/**
 * O5: open a root scope, build under it, insert, flush, and return a disposer
 * that disposes the scope AND removes its range.
 *
 * `block` is the O5 shape: a function, invoked with the root current, and it
 * is the only form under which the root owns what it mounts.
 *
 * **The already-built form.** `render(<Tree/>, host)` constructs the subtree as
 * an ARGUMENT, before `render` is entered, so whatever was current at the call
 * site owns it: the surrounding owner if there is one, and nothing at all
 * otherwise. Either way this disposer can only remove the range, and it says so
 * rather than pretending.
 */
/**
 * Solid 2.0's mount options. `owner` parents the root, so the mounted tree
 * reads the contexts that owner sees and goes with it when it is disposed.
 * `renderId` namespaces the ids the tree numbers its async values and
 * `createUniqueId` from: a page with two roots gives each its own, and the
 * server render of a root takes the same one.
 */
export interface MountOptions {
  readonly owner?: Scope | null;
  readonly renderId?: string;
}

/** Where a tree can be mounted. A Document is hydrated whole. */
export type MountTarget = HTMLElement | ShadowRoot | DocumentFragment;

export function render(
  block: JSXElement | (() => JSXElement),
  container: MountTarget,
  options?: MountOptions,
): () => void {
  container.textContent = ""; // Faster than innerHTML = ""

  if (typeof block !== "function") {
    emitDiagnostic({
      code: "RENDER_SUBTREE_NOT_OWNED",
      kind: "owner",
      severity: "warn",
      message:
        "`render` was given nodes that were built before the call, as in `const view = <App />` " +
        "followed by `render(view, host)`, so the function it returns removes the nodes but " +
        "cannot dispose their effects and listeners. Pass a function instead: " +
        "`render(() => <App />, host)`.",
    });
  }
  const root = rootScope(options?.owner ?? null, options?.renderId);
  ownRange(root, () => {
    container.textContent = "";
  });
  registerDelegatedRoot(container);
  try {
    runWithOwner(root, () => {
      insertRendered(root, typeof block === "function" ? block() : block, container);
    });
    flush();
  } catch (error) {
    unregisterDelegatedRoot(container);
    throw error;
  }

  let disposed = false;
  return () => {
    disposeScope(root);
    if (disposed) return;
    disposed = true;
    unregisterDelegatedRoot(container);
  };
}

/**
 * How a live hole at the ROOT claims the server's markup: all of it.
 *
 * The string backend writes a root's value straight into the container, with
 * no comments around it, because nothing else is there to tell it from. A hole
 * anywhere else claims the range the server delimited, and asked to do that
 * here it found none and the whole page was thrown away and built again.
 */
function rootClaim(): number | undefined {
  return hydrating() ? WHOLE : undefined;
}

function insertRendered(
  scope: Scope | null,
  element: JSXElement,
  container: MountTarget | Document,
): void {
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
  // `Out` admits `Cell<Out>`. A mount whose block returned one is a live
  // hole at the root, so it is inserted as one rather than stringified.
  if (typeof element === "function") {
    insert(container, element, null, rootClaim());
    return;
  }
  if (isSsrHtml(element)) {
    for (const node of ssrHtmlNodes(element)) {
      container.appendChild(node);
    }
    return;
  }
  if (Array.isArray(element)) {
    // A fragment root holding a Cell is a live hole, exactly as one is
    // anywhere else. `childToNodes` calls each function once and returns
    // nodes, so `render(() => <>{() => cond() ? <A/> : null}</>)` rendered the
    // first value and never moved again — and a component whose whole output
    // is a conditional is the ordinary shape for an overlay.
    //
    // Hydrating, every array is: `mount` built the page's value as the hole
    // over the container's whole content, and the insert is that hole's second
    // half, going on from where the build stopped.
    if (element.some(holdsAFunction) || hydrating()) {
      insert(container, element, null, rootClaim());
      return;
    }
    // Right to left against the node that follows, so one the claim left in
    // position is not removed and put back: that blurs whatever inside it has
    // focus, and appending it moved it past everything that claimed in place.
    const nodes = inDocumentOrder(() => childToNodes(element, scope));
    let before: Node | null = null;
    for (let i = nodes.length; i--;) {
      const node = nodes[i];
      if (node.parentNode !== container || node.nextSibling !== before) {
        container.insertBefore(node, before);
      }
      before = node;
    }
    return;
  }
  // Hydrating, the server's text is already the container's, and appended it
  // would stand there twice.
  if (hydrating()) {
    insert(container, element, null, WHOLE);
    return;
  }
  container.appendChild(document.createTextNode(String(element)));
}

/**
 * Hydrate server-rendered markup.
 *
 * Seeds keyed async values from the `__BARQ_DATA__` payload a server render's
 * seed script assigned, then renders the app over the server markup in
 * one synchronous pass: seeded async values resolve synchronously, so the
 * client produces identical markup immediately (no fallback flash, no
 * refetch). Delegated event listeners are on `container` and active from
 * this point on, until the returned function disposes the root.
 *
 * Node-reuse (claim-based) hydration requires compiler-emitted hydration
 * keys; this replace-based pass is the runtime-only strategy.
 */
interface CapturedEvent {
  /** A DOM event type, or `@state` — a value/caret/focus record, not an event. */
  type: string;
  /**
   * The element the user actually acted on, held by reference.
   *
   * The queue never leaves the document it was recorded in, so a node costs
   * nothing to carry and answers the one question a path cannot: whether this
   * element is still the one at that place. Absent only for a record written by
   * an older snippet.
   */
  node?: Node;
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
function replayCapturedEvents(recovered: boolean): void {
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
    if (rec.type !== "@state") continue;
    const target = stateTargetOf(rec, recovered) as HTMLInputElement | null;
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
    const target = targetOf(rec, recovered);
    if (target === null) continue;
    target.dispatchEvent(eventFor(rec));
  }
  flush();
}

/** Still in the document, and therefore still the node the user acted on. */
function live(node: Node | undefined): Node | null {
  return node !== undefined && node.isConnected ? node : null;
}

/**
 * Where to aim a replayed event, in the order the answers are trustworthy.
 *
 * The captured node wins whenever it is still in the document — it IS the
 * element the user hit, whatever else moved around it.
 *
 * A detached one means the region it lived in was replaced, and the two ways
 * that happens want opposite answers. A RECOVERED hydration rebuilt the same
 * markup cold, so every node is new and equivalent: the path and then the
 * coordinates find the element that stands where the old one did. A swap
 * replaced a `pending` fallback with different content, so both of those now
 * address a control the user never saw — and dispatching a click into it is a
 * phantom press on a live button. Nothing is the right answer there.
 */
function targetOf(rec: CapturedEvent, recovered: boolean): Node | null {
  const node = live(rec.node);
  if (node !== null) return node;
  if (rec.node !== undefined && !recovered) return null;
  const path = rec.path;
  return (path !== undefined && path.length > 0 ? atPath(path) : null) ?? pointAt(rec);
}

/**
 * Where to put back a value the user typed.
 *
 * Coordinates are never an answer here — a value belongs in the input it was
 * typed into, and `elementFromPoint` can hand back a `<div>`.
 */
function stateTargetOf(rec: CapturedEvent, recovered: boolean): Node | null {
  const node = live(rec.node);
  if (node !== null) return node;
  if (rec.node !== undefined && !recovered) return null;
  return rec.path === undefined ? null : atPath(rec.path);
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
 * Claim-based hydration.
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
 *
 * @param container `document` hydrates the WHOLE page, which is what a tree
 * rooted at `<html>` needs — the shell is a component like any other, so the
 * head is reactive and a navigation updates it without a second mechanism
 * beside the render.
 */
function hydrateContainer(
  fn: () => JSXElement,
  container: MountTarget | Document,
  options?: HydrateOptions,
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
  registerDelegatedRoot(container);
  insertClaims = INSERT_CLAIMS;
  installClaimEffect();
  beginHydration(container);
  const marked = wireIsMarked();
  // The server numbered every scope it opened, whether or not a value was
  // waiting under it, and an id is a position in that numbering. A page with
  // nothing seeded counts the same way while it claims.
  const followed = followAsync(true);
  try {
    clear = mount(fn, container, true, options);
  } catch (error) {
    failure = mismatchIn(error);
    if (failure === null) {
      endHydration();
      unregisterDelegatedRoot(container);
      throw error;
    }
    // Wrapped means it left a computation with nothing to catch it, and the
    // engine stops scheduling for good when that happens. The tree it stopped
    // for is discarded below, so there is nothing left to protect.
    if (failure !== error) resetErrorHalt();
  } finally {
    followAsync(followed);
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
        ? "the container holds server-rendered markup with hydration markers and `hydrate` " +
            "reused none of it, so the browser bundle was compiled without `hydratable: true`"
        : "the container holds markup and `hydrate` reused none of it, so the server build or " +
            "the browser bundle was compiled without `hydratable: true`, or the markup did not " +
            "come from barq's server renderer",
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
    try {
      clear = mount(fn, container, false, options);
    } catch (error) {
      unregisterDelegatedRoot(container);
      throw error;
    }
    hydrate.report = {
      mismatches: [...claimReport.mismatches, { kind: failure.kind, detail: failure.message }],
      claimed: claimReport.claimed,
      ranges: claimReport.ranges,
      built: claimReport.built,
      recovered: true,
    };
    emitDiagnostic({
      code: "HYDRATION_MISMATCH",
      kind: "ssr",
      severity: "warn",
      message:
        `${failure.message}${OBSERVE !== undefined && failure.template !== undefined ? ` The template being hydrated is at ${failure.template}.` : ""} ` +
        "The server's markup was discarded and the whole page was rendered again in the browser, " +
        "so it works but the server-rendered first paint was thrown away.",
      data: OBSERVE === undefined ? undefined : { kind: failure.kind, template: failure.template },
      ownerPath: OBSERVE === undefined ? undefined : failure.ownerPath,
    });
  } else {
    hydrate.report = { ...claimReport, recovered: false };
  }

  flush();
  // A seed nobody claimed is the only evidence a positional auto-key can give
  // that the client tree is not the server's; the read that drifted has
  // already resolved by now.
  unclaimedSeeds();
  replayCapturedEvents(hydrate.report.recovered);
  let disposed = false;
  return (): void => {
    clear?.();
    if (disposed) return;
    disposed = true;
    unregisterDelegatedRoot(container);
  };
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
export interface HydrateOptions extends MountOptions {
  /** Seeds for this hydration, beside what the page's seed scripts assigned. */
  readonly data?: Record<string, unknown>;
}

export interface Hydrate {
  (fn: () => JSXElement, container: MountTarget | Document, options?: HydrateOptions): () => void;
  report: HydrationOutcome;
}

// Attached in one pure expression rather than assigned at module scope: the
// assignment is a side effect, and it kept `hydrate` and the whole claim walk
// in every bundle that only ever calls `render`.
export const hydrate: Hydrate = /* @__PURE__ */ Object.assign(hydrateContainer, {
  report: {
    mismatches: [],
    claimed: 0,
    ranges: 0,
    built: 0,
    recovered: false,
  } satisfies HydrationOutcome,
});

/**
 * `render`, with the one line that makes it hydration or not.
 *
 * "`container.textContent = ""` … currently throws the entire server
 * render away". It is still exactly right for a cold render and exactly wrong
 * for a claim, so it is the parameter rather than a second copy of the mount
 * sequence — there is one root, one insertion, one disposer, and the claim path
 * cannot drift from the path everything else is measured on.
 */
/**
 * Empty a container.
 *
 * `textContent = ""` is a NO-OP on a Document — its `textContent` is null and
 * the setter is specified to do nothing — so a document-hydrated page would keep
 * the markup it was told to drop. Removing `documentElement` is the equivalent,
 * and it is the only child a Document has that is not its doctype.
 */
function clearContainer(container: MountTarget | Document): void {
  if (container.nodeType === 9 /* DOCUMENT_NODE */) {
    (container as Document).documentElement?.remove();
    return;
  }
  (container as MountTarget).textContent = "";
}

function mount(
  block: () => JSXElement,
  container: MountTarget | Document,
  claiming: boolean,
  options?: MountOptions,
): () => void {
  if (!claiming) clearContainer(container);
  const root = rootScope(options?.owner ?? null, options?.renderId);
  ownRange(root, () => {
    clearContainer(container);
  });
  try {
    runWithOwner(root, () => {
      // The page's value is a hole over the whole container, built before
      // anything places it: what the build claims has to be known to the
      // insert that places the rest, as at every hole the compiler writes.
      insertRendered(root, claiming ? hole(container, null, block, WHOLE) : block(), container);
    });
    // Raised before the flush, so the effects of an attempt about to be
    // discarded never run.
    const abandoned = claiming ? abandonedClaim() : null;
    if (abandoned !== null) throw abandoned;
  } catch (error) {
    // `hydrate` recovers from a mismatch by rendering again, and the bindings
    // this attempt already filed must not outlive it beside the second tree.
    if (mismatchIn(error) !== null) disposeScope(root);
    throw error;
  }
  // The walk ends with the build. What the flush runs is the first round of
  // effects, and a write one of them makes is a change the browser makes to the
  // page it was sent: whatever that rebuilds is new, and the cursor the walk
  // left behind is standing at the end of the container, not at the position
  // being rebuilt. Left open, a template in the rebuild claimed from it.
  withoutClaim(flush);
  return () => {
    disposeScope(root);
  };
}

/**
 * Create a template function for fast DOM cloning (like SolidJS)
 * The template is parsed once and cloned for each use
 */
export function template(
  html: string,
  foreign: boolean | 2 = false,
  detect: boolean | string = false,
): () => Node {
  let cached: Node | null = null;

  const create = (): Node => {
    if (foreign !== false) {
      // A root that is foreign content by position is parsed inside the parent
      // that makes it so, and taken back out: `true` is `<svg>`, `2` `<math>`.
      const wrapper = document.createElement("template");
      wrapper.innerHTML = foreign === 2 ? `<math>${html}</math>` : `<svg>${html}</svg>`;
      const inner = wrapper.content.firstChild?.firstChild;
      if (!inner) {
        throw new Error(
          `\`template\` was given ${foreign === 2 ? "MathML" : "SVG"} markup that parses to no ` +
            `element: ${JSON.stringify(html)}. Nothing can be cloned from it, so the component ` +
            'cannot render. Pass markup with one root element, such as `<circle r="4"></circle>`.',
        );
      }
      return inner;
    }
    const t = document.createElement("template");
    t.innerHTML = html;
    const node = t.content.firstChild;
    if (!node) {
      throw new Error(
        `\`template\` was given markup that parses to no node: ${JSON.stringify(html)}. Nothing ` +
          "can be cloned from it, so the component cannot render. Pass markup with one root " +
          "element, such as `<div></div>`.",
      );
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
      // `detect` is the detection axis, threaded from the compiler to the one
      // call that holds both trees at once. A production build passes nothing
      // and the subtree comparison never runs. A development compile passes
      // the JSX's `file:line:column` in its place, for the report of a
      // mismatch; only a development engine has `OBSERVE`, so a production
      // bundle drops this arm whole.
      if (OBSERVE !== undefined && typeof detect === "string") {
        try {
          const claimed = claimNode(cached, detect);
          claimingTemplate(detect);
          if (claimed !== null) return claimed;
        } catch (error) {
          if (error instanceof HydrationMismatch) error.template = detect;
          throw error;
        }
      } else {
        const claimed = claimNode(cached, detect);
        if (claimed !== null) return claimed;
      }
    }
    builtNode();
    return cached.cloneNode(true);
  };
}
