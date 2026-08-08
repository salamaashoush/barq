/**
 * DOM rendering and reconciliation
 * Fine-grained reactive DOM updates using comment markers
 */

import { clearRange, createMarkerPair, insertNodes } from "./markers.ts";
import { flush, renderEffect } from "./signals.ts";
import {
  isString,
  isBoolean,
  isObject,
  isArray,
  isNullish,
  isHTMLElement,
  toString,
  setProperty,
  isRefCallback,
  isSignalGetter,
} from "./type-utils.ts";

export type Child = Node | string | number | boolean | null | undefined | (() => Child) | Child[];
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

/** A delegated handler: plain listener or [handler, data] tuple (the tuple
 * form lets compiled list rows share one function without per-row closures) */
type DelegatedHandler = EventListener | [(data: unknown, e: Event) => void, unknown];

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

  while (node) {
    const handler = (node as Node & Record<string, unknown>)[key] as DelegatedHandler | undefined;
    if (handler && !(node as Partial<HTMLButtonElement>).disabled) {
      if (typeof handler === "function") {
        handler.call(node, e);
      } else if (Array.isArray(handler) && typeof handler[0] === "function") {
        handler[0].call(node, handler[1], e);
      }
      if (e.cancelBubble) return;
    }
    node =
      (node.parentNode as Node | null) ??
      ((node as Partial<ShadowRoot>).host as Node | undefined) ??
      null;
  }
}

function isEventHandlerValue(value: unknown): boolean {
  return (
    typeof value === "function" || (Array.isArray(value) && typeof value[0] === "function")
  );
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
  // Handle function components
  if (typeof tag === "function") {
    // Only override children if rest children were provided
    // This allows passing children as a prop (e.g., for For/Index render functions)
    const finalProps: Record<string, unknown> = { ...props };
    if (children.length > 0) {
      finalProps.children = children.length === 1 ? children[0] : children;
    }
    return tag(finalProps);
  }

  // Handle fragments
  if (tag === "fragment" || tag === "") {
    const fragment = document.createDocumentFragment();
    appendChildren(fragment, children);
    return fragment;
  }

  // Create element (SVG or HTML)
  const isSvg = tag in SVG_TAGS;
  const element = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);

  // Apply props
  if (props) {
    for (const key in props) {
      if (key !== "children") {
        applyProp(element, key, props[key], isSvg);
      }
    }
  }

  // Append children
  appendChildren(element, children);

  return element;
}

/**
 * Apply a prop to an element
 */
function applyProp(element: Element, key: string, value: unknown, isSvg: boolean): void {
  // Event handlers (onClick -> click); accepts fn or [fn, data] tuple
  if (key[0] === "o" && key[1] === "n") {
    const eventName = key.slice(2).toLowerCase();
    if (isEventHandlerValue(value)) {
      if (DELEGATED_EVENTS.has(eventName)) {
        (element as Element & Record<string, unknown>)[`$$${eventName}`] = value;
        ensureDelegatedListener(eventName);
      } else {
        element.addEventListener(eventName, toListener(value as DelegatedHandler));
      }
    }
    return;
  }

  // Ref callback, object, or array of refs (composable directives)
  if (key === "ref") {
    if (isArray(value)) {
      for (const ref of value) {
        if (isRefCallback(ref)) {
          ref(element);
        } else if (isObject(ref) && "current" in ref) {
          setProperty(ref, "current", element);
        }
      }
    } else if (isRefCallback(value)) {
      value(element);
    } else if (isObject(value) && "current" in value) {
      setProperty(value, "current", element);
    }
    return;
  }

  // Reactive props (signals): diff against the previous applied value so
  // unchanged values touch no DOM
  if (isSignalGetter(value)) {
    let prev: unknown;
    renderEffect(() => {
      prev = applyResolvedProp(element, key, value(), isSvg, prev);
    });
    return;
  }

  applyResolvedProp(element, key, value, isSvg, undefined);
}

/**
 * Apply a resolved (non-reactive) prop value.
 * Returns the "applied" representation for diffing on the next run.
 */
function applyResolvedProp(
  element: Element,
  key: string,
  value: unknown,
  isSvg: boolean,
  prev: unknown,
): unknown {
  // Style object: diff key-by-key against the previously applied map
  if (key === "style") {
    if (isObject(value)) {
      if (isHTMLElement(element)) {
        return diffStyleObjects(element, value, isStyleMap(prev) ? prev : null);
      }
      return prev;
    }
    if (isString(value) && isHTMLElement(element)) {
      if (value !== prev) element.style.cssText = value;
      return value;
    }
    return prev;
  }

  // Class handling: normalize string|array|object to one string, diff it
  if (key === "class" || key === "className") {
    const className = classToString(value);
    if (className !== prev) {
      if (className === null) {
        element.removeAttribute("class");
      } else {
        element.className = className;
      }
    }
    return className;
  }

  // Dangerous innerHTML
  if (key === "dangerouslySetInnerHTML" && isObject(value) && isHTMLElement(element)) {
    const html = (value as { __html?: string }).__html ?? "";
    if (html !== prev) element.innerHTML = html;
    return html;
  }

  // Everything else: identical value means no DOM write
  if (value === prev) return prev;
  setElementAttr(element, key, value, isSvg);
  return value;
}

const STYLE_MAP = Symbol("barq-style-map");

interface StyleMap extends Record<string, string> {}

function isStyleMap(value: unknown): value is StyleMap {
  return typeof value === "object" && value !== null && STYLE_MAP in (value as object);
}

/**
 * Apply a style object, removing properties that vanished and only
 * writing properties whose value changed. Returns the applied css map.
 */
function diffStyleObjects(
  element: HTMLElement,
  next: Record<string, unknown>,
  prev: StyleMap | null,
): StyleMap {
  const style = element.style;
  const applied = Object.defineProperty({} as StyleMap, STYLE_MAP, { value: true });

  for (const prop in next) {
    const raw = next[prop];
    const cssProp = toKebabCase(prop);

    // Per-property reactive values keep their own effect (static object case)
    if (isSignalGetter(raw)) {
      renderEffect(() => {
        setStylePropDirect(style, cssProp, prop, (raw as () => unknown)());
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

/** Normalize a class value (string, array, or object) to a string or null */
function classToString(value: unknown): string | null {
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
 * Set a single prop value.
 *
 * Attributes-over-properties (Solid 2.0): everything is written as an
 * attribute except the form-field property exceptions in DOM_PROPS.
 * Boolean values add/remove the attribute.
 */
function setElementAttr(element: Element, key: string, value: unknown, isSvg: boolean): void {
  // Normalize key
  let propKey = key === "className" ? "class" : key === "htmlFor" ? "for" : key;

  // SVG attributes use kebab-case
  if (isSvg && propKey !== "class" && propKey !== "viewBox") {
    propKey = toKebabCase(propKey);
  }

  // Form-field exceptions stay properties (value, checked, selected, ...)
  if (!isSvg && propKey in DOM_PROPS) {
    setProperty(element, propKey, value);
    return;
  }

  // Boolean values add/remove the attribute
  if (isBoolean(value)) {
    if (value) {
      element.setAttribute(propKey, "");
    } else {
      element.removeAttribute(propKey);
    }
    return;
  }

  // Null/undefined removes attribute
  if (isNullish(value)) {
    element.removeAttribute(propKey);
    return;
  }

  element.setAttribute(propKey, toString(value));
}

/**
 * Set a single style property with pre-computed CSS property name
 */
function setStylePropDirect(
  style: CSSStyleDeclaration,
  cssProperty: string,
  _prop: string,
  value: unknown,
): void {
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
function appendChildren(parent: Node, children: Child[]): void {
  for (let i = 0; i < children.length; i++) {
    appendChild(parent, children[i]);
  }
}

/**
 * Append a single child (handles all child types)
 */
function appendChild(parent: Node, child: Child): void {
  // Skip null, undefined, boolean
  if (child === null || child === undefined || child === true || child === false) {
    return;
  }

  // Node - append directly
  if (child instanceof Node) {
    parent.appendChild(child);
    return;
  }

  // Reactive child (function) - use markers for updates
  if (typeof child === "function") {
    mountReactiveChild(parent, child as () => Child, null);
    return;
  }

  // Array - flatten and append each
  if (Array.isArray(child)) {
    for (let i = 0; i < child.length; i++) {
      appendChild(parent, child[i]);
    }
    return;
  }

  // Primitive - create text node
  parent.appendChild(document.createTextNode(String(child)));
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
      while (child.firstChild) {
        out.push(child.firstChild);
        child.removeChild(child.firstChild);
      }
      return;
    }

    if (child instanceof Node) {
      out.push(child);
      return;
    }

    if (typeof child === "function") {
      visit((child as () => Child)());
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
function reconcileNodeArrays(parent: Node, a: Node[], b: Node[], after: Node): void {
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
      const anchor = bEnd < bLength ? (bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart]) : after;
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

/** Mount a reactive child between fresh markers, before `before` (or at end) */
function mountReactiveChild(parent: Node, child: () => Child, before: Node | null): void {
  const [startMarker, endMarker] = createMarkerPair("r");
  parent.insertBefore(startMarker, before);
  parent.insertBefore(endMarker, before);

  // Track if we have a single text node for fast primitive updates
  let textNode: Text | null = null;
  // Nodes currently mounted between the markers (for reconciliation)
  let currentNodes: Node[] = [];

  renderEffect(() => {
    const value = child();

    // Fast path: primitive value with existing text node
    if (textNode && (typeof value === "string" || typeof value === "number")) {
      textNode.data = String(value);
      return;
    }

    // Fast path: primitive value, create single text node
    if (
      (typeof value === "string" || typeof value === "number") &&
      startMarker.nextSibling === endMarker
    ) {
      textNode = document.createTextNode(String(value));
      parent.insertBefore(textNode, endMarker);
      currentNodes = [textNode];
      return;
    }

    textNode = null;
    const nextNodes = normalizeChildToNodes(value, currentNodes);

    if (currentNodes.length === 0) {
      insertNodes(endMarker, nextNodes);
    } else if (nextNodes.length === 0) {
      clearRange(startMarker, endMarker);
    } else {
      // Reconcile in place: unchanged nodes don't move, text reused
      const liveParent = endMarker.parentNode;
      if (liveParent) {
        reconcileNodeArrays(liveParent, currentNodes, nextNodes, endMarker);
      }
    }
    currentNodes = nextNodes;

    if (
      nextNodes.length === 1 &&
      nextNodes[0].nodeType === 3 &&
      nextNodes[0] === startMarker.nextSibling
    ) {
      textNode = nextNodes[0] as Text;
    }
  });
}

/**
 * Insert a child into `parent` before `marker` (replacing the marker's
 * placeholder role) or appending when no marker. Compiled-template output
 * calls this for dynamic holes; reactive (function) children update
 * fine-grained between comment markers.
 */
export function insert(parent: Node, value: Child | (() => Child), marker?: Node | null): void {
  const before = marker ?? null;

  if (typeof value === "function") {
    mountReactiveChild(parent, value as () => Child, before);
  } else if (value !== null && value !== undefined && value !== true && value !== false) {
    if (value instanceof Node) {
      parent.insertBefore(value, before);
    } else if (Array.isArray(value)) {
      for (const node of childToNodes(value)) {
        parent.insertBefore(node, before);
      }
    } else {
      parent.insertBefore(document.createTextNode(String(value)), before);
    }
  }

  // Placeholder comments from compiled templates are consumed
  if (marker && marker.nodeType === 8 /* comment */) {
    marker.parentNode?.removeChild(marker);
  }
}

/**
 * Apply a prop to an element (compiled-template output). Handles events
 * (delegated where possible), refs, class/style values, and reactive
 * (function) values via render effects.
 */
export function setProp(element: Element, key: string, value: unknown): void {
  applyProp(element, key, value, element.namespaceURI === SVG_NS);
}

/**
 * Reactively spread a props object onto an element (compiled output for
 * `<div {...props} />`). Diffs every prop against the previously applied
 * value, clears props that vanished, replaces event listeners, and applies
 * `ref` once on mount. `children` is not handled here.
 */
export function spread(
  element: Element,
  props: Record<string, unknown> | (() => Record<string, unknown>),
): void {
  const isSvg = element.namespaceURI === SVG_NS;
  const applied: Record<string, unknown> = {};
  const directListeners: Record<string, EventListener> = {};
  let first = true;

  const applyOne = (key: string, value: unknown): void => {
    // Events: delegated handlers swap by expando; direct ones re-listen
    if (key[0] === "o" && key[1] === "n") {
      const eventName = key.slice(2).toLowerCase();
      if (DELEGATED_EVENTS.has(eventName)) {
        (element as Element & Record<string, unknown>)[`$$${eventName}`] = isEventHandlerValue(
          value,
        )
          ? value
          : undefined;
        if (value) ensureDelegatedListener(eventName);
      } else {
        const prevListener = directListeners[eventName];
        if (prevListener) {
          element.removeEventListener(eventName, prevListener);
          delete directListeners[eventName];
        }
        if (isEventHandlerValue(value)) {
          const listener = toListener(value as DelegatedHandler);
          directListeners[eventName] = listener;
          element.addEventListener(eventName, listener);
        }
      }
      applied[key] = value;
      return;
    }

    // Getter values unwrap inline: the surrounding effect already tracks
    const resolved = key !== "style" && isSignalGetter(value) ? (value as () => unknown)() : value;
    applied[key] = applyResolvedProp(element, key, resolved, isSvg, applied[key]);
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
        if (first) {
          applyProp(element, "ref", next[key], isSvg);
        }
        continue;
      }
      applyOne(key, next[key]);
    }
    first = false;
  });
}

/**
 * Convert a Child to an array of Nodes
 */
function childToNodes(child: Child): Node[] {
  if (child === null || child === undefined || child === true || child === false) {
    return [];
  }

  if (child instanceof DocumentFragment) {
    return Array.from(child.childNodes);
  }

  if (child instanceof Node) {
    return [child];
  }

  if (typeof child === "function") {
    return childToNodes((child as () => Child)());
  }

  if (Array.isArray(child)) {
    const nodes: Node[] = [];
    for (let i = 0; i < child.length; i++) {
      const childNodes = childToNodes(child[i]);
      for (let j = 0; j < childNodes.length; j++) {
        nodes.push(childNodes[j]);
      }
    }
    return nodes;
  }

  return [document.createTextNode(String(child))];
}

/**
 * Render an element tree to a container element
 */
export function render(element: JSXElement, container: HTMLElement): () => void {
  container.textContent = ""; // Faster than innerHTML = ""

  // Handle all Element types
  if (element === null || element === undefined || typeof element === "boolean") {
    // null, undefined, boolean - render nothing
  } else if (element instanceof Node) {
    container.appendChild(element);
  } else if (Array.isArray(element)) {
    for (const child of element) {
      const nodes = childToNodes(child);
      for (const node of nodes) {
        container.appendChild(node);
      }
    }
  } else {
    // string or number
    container.appendChild(document.createTextNode(String(element)));
  }

  return () => {
    container.textContent = "";
  };
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
  const dispose = render(fn(), container);
  flush();
  // Clicks that landed before the bundle loaded replay against the
  // hydrated DOM (captured by generateHydrationScript's inline snippet)
  replayCapturedEvents();
  return dispose;
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
    return cached.cloneNode(true);
  };
}
