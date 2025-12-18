/**
 * DOM rendering and reconciliation
 * Fine-grained reactive DOM updates using comment markers
 */

import { clearRange, createMarkerPair, insertNodes } from "./markers.ts";
import { effect } from "./signals.ts";
import {
  isString,
  isBoolean,
  isObject,
  isArray,
  isNullish,
  isHTMLElement,
  toString,
  isEventListener,
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
  // Event handlers (onClick -> click)
  if (key[0] === "o" && key[1] === "n") {
    const eventName = key.slice(2).toLowerCase();
    if (isEventListener(value)) {
      element.addEventListener(eventName, value);
    }
    return;
  }

  // Ref callback or object
  if (key === "ref") {
    if (isRefCallback(value)) {
      value(element);
    } else if (isObject(value) && "current" in value) {
      setProperty(value, "current", element);
    }
    return;
  }

  // Reactive props (signals)
  if (isSignalGetter(value)) {
    effect(() => {
      applyResolvedProp(element, key, value(), isSvg);
    });
    return;
  }

  applyResolvedProp(element, key, value, isSvg);
}

/**
 * Apply a resolved (non-reactive) prop value
 */
function applyResolvedProp(element: Element, key: string, value: unknown, isSvg: boolean): void {
  // Style object
  if (key === "style") {
    if (isObject(value)) {
      if (isHTMLElement(element)) {
        applyStyles(element, value);
      }
    } else if (isString(value) && isHTMLElement(element)) {
      element.style.cssText = value;
    }
    return;
  }

  // Class handling (class, className, classList object)
  if (key === "class" || key === "className") {
    applyClass(element, value);
    return;
  }

  // Dangerous innerHTML
  if (key === "dangerouslySetInnerHTML" && isObject(value) && isHTMLElement(element)) {
    const html = value as { __html?: string };
    element.innerHTML = html.__html ?? "";
    return;
  }

  setProp(element, key, value, isSvg);
}

/**
 * Apply class value (string, array, or object)
 */
function applyClass(element: Element, value: unknown): void {
  if (isNullish(value) || value === false) {
    element.removeAttribute("class");
    return;
  }

  if (isString(value)) {
    element.className = value;
    return;
  }

  if (isArray<string>(value)) {
    element.className = value.filter(Boolean).join(" ");
    return;
  }

  if (isObject(value)) {
    let className = "";
    for (const k in value) {
      if (value[k]) {
        className += (className ? " " : "") + k;
      }
    }
    element.className = className;
  }
}

/**
 * Set a single prop value
 */
function setProp(element: Element, key: string, value: unknown, isSvg: boolean): void {
  // Normalize key
  let propKey = key === "className" ? "class" : key;

  // SVG attributes use kebab-case
  if (isSvg && propKey !== "class" && propKey !== "viewBox") {
    propKey = toKebabCase(propKey);
  }

  // Boolean attributes
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

  // Convert value to string for attributes
  const stringValue = toString(value);

  // SVG always uses setAttribute
  if (isSvg) {
    element.setAttribute(propKey, stringValue);
    return;
  }

  // DOM properties (value, checked, etc.) set directly
  if (propKey in DOM_PROPS) {
    setProperty(element, propKey, value);
    return;
  }

  // Try property first for HTML, fall back to attribute
  if (propKey in element && propKey !== "list" && propKey !== "form" && propKey !== "type") {
    if (setProperty(element, propKey, value)) {
      return;
    }
  }

  element.setAttribute(propKey, stringValue);
}

/**
 * Apply styles object to element
 */
function applyStyles(element: HTMLElement, styles: Record<string, unknown>): void {
  const style = element.style;

  for (const prop in styles) {
    const value = styles[prop];

    if (isSignalGetter(value)) {
      // Reactive style property - cache kebab-case conversion outside effect
      const cssProperty = toKebabCase(prop);
      effect(() => {
        setStylePropDirect(style, cssProperty, prop, value());
      });
    } else {
      setStyleProp(style, prop, value);
    }
  }
}

/**
 * Set a single style property
 */
function setStyleProp(style: CSSStyleDeclaration, prop: string, value: unknown): void {
  setStylePropDirect(style, toKebabCase(prop), prop, value);
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
    const [startMarker, endMarker] = createMarkerPair("r");
    parent.appendChild(startMarker);
    parent.appendChild(endMarker);

    // Track if we have a single text node for fast primitive updates
    let textNode: Text | null = null;

    effect(() => {
      const value = (child as () => Child)();

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
        return;
      }

      // Complex value - clear and rebuild
      textNode = null;
      clearRange(startMarker, endMarker);
      insertNodes(endMarker, childToNodes(value));
    });
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
