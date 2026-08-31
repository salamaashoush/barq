/**
 * The DOM questions every accessible widget has to ask, answered once.
 *
 * Three of them are not what the platform API says they are:
 *
 * - `node.contains(other)` stops at a shadow boundary, so a component whose
 *   trigger is slotted into a custom element decides the click landed outside
 *   itself and closes.
 * - `document.activeElement` reports the shadow HOST, not the element inside
 *   it that actually has focus.
 * - `event.target` is retargeted to the host for the same reason.
 *
 * The shadow-safe answers cost a walk per call, and the overwhelming majority
 * of applications have no shadow roots at all, so they are behind
 * {@link enableShadowDOM} rather than on by default. Adapted from Tabster's
 * `Shadowdomize/DOMFunctions`, which is where react-aria took them from.
 */

let shadowDOMEnabled = false;

/**
 * Make every DOM question in this package shadow-safe.
 *
 * Call it once, before rendering, if any part of the application renders into
 * a shadow root. It cannot be inferred: an open shadow root that exists is not
 * evidence that a component's own subtree crosses one, and paying the walk
 * everywhere to find out is the cost this flag avoids.
 */
export function enableShadowDOM(): void {
  shadowDOMEnabled = true;
}

/** Whether {@link enableShadowDOM} has been called. */
export function isShadowDOMEnabled(): boolean {
  return shadowDOMEnabled;
}

/** A value with a numeric `nodeType`. */
export function isNode(value: unknown): value is Node {
  return (
    value !== null &&
    typeof value === "object" &&
    "nodeType" in value &&
    typeof (value as Node).nodeType === "number"
  );
}

function isWindow(value: unknown): value is Window & typeof globalThis {
  return (
    typeof value === "object" &&
    value !== null &&
    "window" in value &&
    (value as Window).window === value
  );
}

export function isDocument(value: unknown): value is Document {
  return isNode(value) && value.nodeType === 9;
}

export function isShadowRoot(value: unknown): value is ShadowRoot {
  return isNode(value) && value.nodeType === 11 && "host" in value;
}

/**
 * The document `target` lives in.
 *
 * Not `document`: a portal into an `<iframe>` or a popped-out window has its
 * own, and a listener bound to the wrong one never fires.
 */
export function ownerDocument(target?: EventTarget | null): Document {
  if (isWindow(target)) return target.document;
  if (isDocument(target)) return target;
  const owned = (target as Node | null | undefined)?.ownerDocument;
  const fallback = typeof document !== "undefined" ? document : (undefined as never);
  // A node cloned from a `<template>` belongs to the INERT template document
  // until it is inserted, and that document has no browsing context: its
  // `activeElement` is null, its `defaultView` is null, and a listener added to
  // it never fires. barq builds every element by cloning a template, so any
  // question asked of a node before it is in the page was being asked of the
  // wrong document — which is why an overlay's focus scope recorded `null` as
  // the element to restore focus to, and gave the user back nothing when it
  // closed. `defaultView` is the test the platform itself uses for "has a
  // browsing context".
  if (owned === null || owned === undefined) return fallback;
  return owned.defaultView === null ? fallback : owned;
}

/** The window `target` lives in. See {@link ownerDocument}. */
export function ownerWindow(target?: EventTarget | null): Window & typeof globalThis {
  const doc = ownerDocument(target);
  return doc?.defaultView ?? (typeof window !== "undefined" ? window : (undefined as never));
}

/**
 * `node.contains(other)`, crossing shadow boundaries and slots when
 * {@link enableShadowDOM} is on.
 */
export function contains(
  node: Node | Element | null | undefined,
  other: Node | Element | null | undefined,
): boolean {
  if (node === null || node === undefined || other === null || other === undefined) return false;
  if (!shadowDOMEnabled) return node.contains(other);

  let current: Node | null | undefined = other;
  while (current !== null && current !== undefined) {
    if (current === node) return true;

    const slot: HTMLSlotElement | null = (current as HTMLSlotElement).assignedSlot;
    if (typeof (current as HTMLSlotElement).assignedElements !== "function" && slot?.parentNode) {
      current = slot.parentNode;
    } else if (isShadowRoot(current)) {
      current = current.host;
    } else {
      current = current.parentNode;
    }
  }

  return false;
}

/**
 * `document.activeElement`, descending into shadow roots when
 * {@link enableShadowDOM} is on.
 */
export function activeElement(doc?: Document): Element | null {
  const from = doc ?? (typeof document !== "undefined" ? document : undefined);
  if (from === undefined) return null;
  if (!shadowDOMEnabled) return from.activeElement;

  let active: Element | null = from.activeElement;
  while (active !== null && "shadowRoot" in active && active.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active;
}

/**
 * `event.target`, un-retargeted through the shadow boundary when
 * {@link enableShadowDOM} is on.
 */
export function eventTarget(event: Event): EventTarget | null {
  if (shadowDOMEnabled && event.target instanceof Element && event.target.shadowRoot) {
    if (typeof event.composedPath === "function") return event.composedPath()[0] ?? null;
  }
  return event.target;
}

/** {@link eventTarget}, narrowed to an Element, which is what every caller wants. */
export function targetElement(event: Event): Element | null {
  const target = eventTarget(event);
  return target instanceof Element ? target : null;
}

/**
 * Every target a listener must be bound to in order to observe an event
 * globally, given where it starts.
 *
 * An event dispatched inside a shadow root does not reach a listener on the
 * document until it crosses the boundary, and it is retargeted when it does.
 * A capturing listener on each intervening root is what makes an outside-click
 * check see the real element.
 */
export function propagationTargets(
  from: Element | null | undefined,
  to?: Document | Window | Element | null,
): EventTarget[] {
  if (to === null) return [];
  const root = to ?? ownerWindow(from);
  const targets: EventTarget[] = [root];
  if (!shadowDOMEnabled || !from || (from as unknown) === root) return targets;

  const stop = "getRootNode" in root ? root.getRootNode() : null;
  let current: Node | null = from.getRootNode() ?? null;
  while (isShadowRoot(current) && current !== stop) {
    targets.push(current);
    current = current.host.getRootNode();
  }

  return targets;
}

/**
 * Add a listener to one or many targets and get back the removal.
 *
 * Not owned by a scope: some callers unbind on their own schedule (a press
 * that ends, a transition that finishes). {@link listen} in the interactions
 * module is the owned form.
 */
export function addEvent(
  target: EventTarget | readonly EventTarget[] | null | undefined,
  type: string,
  listener: EventListenerOrEventListenerObject | null | undefined,
  options?: boolean | AddEventListenerOptions,
): () => void {
  if (listener === null || listener === undefined || target === null || target === undefined) {
    return () => {};
  }

  const targets = Array.isArray(target) ? target : [target as EventTarget];
  for (const one of targets) one.addEventListener(type, listener, options);

  return () => {
    for (const one of targets) one.removeEventListener(type, listener, options);
  };
}

/** Set a CSS property and get back the restoration of what was there. */
export function setStyle(
  target: HTMLElement | readonly HTMLElement[] | null | undefined,
  property: string,
  value: string,
  priority?: string,
): () => void {
  if (target === null || target === undefined) return () => {};

  const targets = Array.isArray(target) ? target : [target as HTMLElement];
  const restore: (() => void)[] = [];

  for (const one of targets) {
    const previous = one.style.getPropertyValue(property);
    const previousPriority = one.style.getPropertyPriority(property);
    one.style.setProperty(property, value, priority);
    restore.unshift(() => {
      if (previous) one.style.setProperty(property, previous, previousPriority);
      else one.style.removeProperty(property);
    });
  }

  return () => {
    for (const undo of restore) undo();
  };
}

// ---------------------------------------------------------------------------
// Focusability
// ---------------------------------------------------------------------------

const FOCUSABLE_TAGS = [
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "a[href]",
  "area[href]",
  "summary",
  "iframe",
  "object",
  "embed",
  "audio[controls]",
  "video[controls]",
  '[contenteditable]:not([contenteditable^="false"])',
];

const FOCUSABLE_SELECTOR = `${FOCUSABLE_TAGS.join(":not([hidden]),")},[tabindex]:not([disabled]):not([hidden])`;

const TABBABLE_SELECTOR = [
  ...FOCUSABLE_TAGS,
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(':not([hidden]):not([tabindex="-1"]),');

/**
 * The attribute an element carries to be skipped by the walker while still
 * being in the document: the hidden native input a custom widget keeps for
 * form participation, which must never be reachable by Tab.
 */
export const PREVENT_FOCUS_ATTRIBUTE = "data-barq-prevent-focus";

/** The attribute marking a subtree focus containment must always let through. */
export const TOP_LAYER_ATTRIBUTE = "data-barq-top-layer";

function isInert(element: Element): boolean {
  let node: Element | null = element;
  while (node !== null) {
    if (node instanceof ownerWindow(node).HTMLElement && node.inert) return true;
    node = node.parentElement;
  }
  return false;
}

const supportsCheckVisibility =
  typeof Element !== "undefined" && "checkVisibility" in Element.prototype;

function isStyleVisible(element: Element): boolean {
  const view = ownerWindow(element);
  if (!(element instanceof view.HTMLElement) && !(element instanceof view.SVGElement)) return false;

  const { display, visibility } = element.style;
  if (display === "none" || visibility === "hidden" || visibility === "collapse") return false;

  const computed = view.getComputedStyle(element);
  return (
    computed.display !== "none" &&
    computed.visibility !== "hidden" &&
    computed.visibility !== "collapse"
  );
}

function isAttributeVisible(element: Element, child?: Element): boolean {
  if (element.hasAttribute("hidden")) return false;
  if (element.hasAttribute(PREVENT_FOCUS_ATTRIBUTE)) return false;
  // A `<details>` that is closed renders only its `<summary>`.
  if (element.nodeName === "DETAILS" && child && child.nodeName !== "SUMMARY") {
    return element.hasAttribute("open");
  }
  return true;
}

/**
 * Whether the element renders at all: `display`, `visibility`, `hidden`, and
 * every ancestor's answer to the same question.
 */
export function isElementVisible(element: Element, child?: Element): boolean {
  if (supportsCheckVisibility) {
    return (
      element.checkVisibility({ visibilityProperty: true }) &&
      element.closest(`[${PREVENT_FOCUS_ATTRIBUTE}]`) === null
    );
  }

  return (
    element.nodeName !== "#comment" &&
    isStyleVisible(element) &&
    isAttributeVisible(element, child) &&
    (element.parentElement === null || isElementVisible(element.parentElement, element))
  );
}

/** Whether focus can be moved to the element programmatically. */
export function isFocusable(
  element: Element,
  options?: { skipVisibilityCheck?: boolean },
): boolean {
  return (
    element.matches(FOCUSABLE_SELECTOR) &&
    !isInert(element) &&
    (options?.skipVisibilityCheck === true || isElementVisible(element))
  );
}

/** Whether the element is in the browser's own Tab order. */
export function isTabbable(element: Element): boolean {
  return element.matches(TABBABLE_SELECTOR) && isElementVisible(element) && !isInert(element);
}

// ---------------------------------------------------------------------------
// Focus without scrolling
// ---------------------------------------------------------------------------

let supportsPreventScroll: boolean | null = null;

function preventScrollSupported(): boolean {
  if (supportsPreventScroll === null) {
    supportsPreventScroll = false;
    try {
      const probe = document.createElement("div");
      probe.focus({
        get preventScroll(): boolean {
          supportsPreventScroll = true;
          return true;
        },
      });
    } catch {
      // The probe cannot fail in a way that matters; `false` is the answer.
    }
  }
  return supportsPreventScroll;
}

interface ScrollState {
  element: HTMLElement;
  scrollTop: number;
  scrollLeft: number;
}

function scrollableAncestors(element: Element): ScrollState[] {
  const states: ScrollState[] = [];
  const rootScroller = document.scrollingElement ?? document.documentElement;

  let parent = element.parentNode;
  while (parent instanceof HTMLElement && parent !== rootScroller) {
    if (parent.offsetHeight < parent.scrollHeight || parent.offsetWidth < parent.scrollWidth) {
      states.push({ element: parent, scrollTop: parent.scrollTop, scrollLeft: parent.scrollLeft });
    }
    parent = parent.parentNode;
  }

  if (rootScroller instanceof HTMLElement) {
    states.push({
      element: rootScroller,
      scrollTop: rootScroller.scrollTop,
      scrollLeft: rootScroller.scrollLeft,
    });
  }

  return states;
}

/**
 * `element.focus({ preventScroll: true })`, with the restore-the-scroll
 * fallback for engines that ignore the option.
 */
export function focusWithoutScrolling(element: HTMLElement | SVGElement): void {
  if (preventScrollSupported()) {
    element.focus({ preventScroll: true });
    return;
  }

  const states = scrollableAncestors(element);
  element.focus();
  for (const { element: node, scrollTop, scrollLeft } of states) {
    node.scrollTop = scrollTop;
    node.scrollLeft = scrollLeft;
  }
}

// ---------------------------------------------------------------------------
// runAfterTransition
// ---------------------------------------------------------------------------

// Which properties are mid-transition, per element. A count would not do:
// Chrome sometimes fires both `transitionend` and `transitioncancel` for one
// property, and a count would go negative and never settle.
const transitioning = new Map<EventTarget, Set<string>>();
const pending = new Set<() => void>();
let transitionListenersInstalled = false;

function isTransitionEvent(event: Event): event is TransitionEvent {
  return "propertyName" in event;
}

function onTransitionEnd(event: Event): void {
  const target = eventTarget(event);
  if (!isTransitionEvent(event) || target === null) return;

  const properties = transitioning.get(target);
  if (properties === undefined) return;

  properties.delete(event.propertyName);
  if (properties.size === 0) {
    target.removeEventListener("transitioncancel", onTransitionEnd);
    transitioning.delete(target);
  }

  if (transitioning.size === 0) {
    for (const callback of pending) callback();
    pending.clear();
  }
}

function onTransitionRun(event: Event): void {
  const target = eventTarget(event);
  if (!isTransitionEvent(event) || target === null) return;

  let properties = transitioning.get(target);
  if (properties === undefined) {
    properties = new Set();
    transitioning.set(target, properties);
    // On the element itself, not the document: a node removed mid-transition
    // has nowhere to bubble its cancel to.
    target.addEventListener("transitioncancel", onTransitionEnd, { once: true });
  }

  properties.add(event.propertyName);
}

function installTransitionListeners(): void {
  if (transitionListenersInstalled || typeof document === "undefined") return;
  transitionListenersInstalled = true;

  const install = (): void => {
    document.body.addEventListener("transitionrun", onTransitionRun);
    document.body.addEventListener("transitionend", onTransitionEnd);
  };

  if (document.readyState !== "loading") install();
  else document.addEventListener("DOMContentLoaded", install, { once: true });
}

/**
 * Run `fn` once nothing on the page is mid-transition.
 *
 * Moving focus during a transition makes WebKit recompute style for the whole
 * document and, on iOS, scrolls the page under VoiceOver. Waiting one frame
 * first is what catches a transition that starts on mount.
 */
export function runAfterTransition(fn: () => void): void {
  installTransitionListeners();

  requestAnimationFrame(() => {
    // A node removed while transitioning never fires its end event, so its
    // entry would hold every queued callback forever.
    for (const [target] of transitioning) {
      if ("isConnected" in target && !(target as Node).isConnected) transitioning.delete(target);
    }

    if (transitioning.size === 0) fn();
    else pending.add(fn);
  });
}

// ---------------------------------------------------------------------------
// Scrolling
// ---------------------------------------------------------------------------

/** Whether the element scrolls, and optionally whether it has anything to scroll. */
export function isScrollable(node: Element | null, checkForOverflow?: boolean): boolean {
  if (node === null) return false;

  const style = ownerWindow(node).getComputedStyle(node);
  const root = ownerDocument(node).scrollingElement ?? ownerDocument(node).documentElement;
  let scrollable = /(auto|scroll)/.test(style.overflow + style.overflowX + style.overflowY);

  // The root scrolls despite its `visible` overflow.
  if (node === root && style.overflow !== "hidden") scrollable = true;

  if (scrollable && checkForOverflow === true) {
    scrollable = node.scrollHeight !== node.clientHeight || node.scrollWidth !== node.clientWidth;
  }

  return scrollable;
}

/** Every scrollable ancestor, nearest first. */
export function scrollParents(node: Element, checkForOverflow?: boolean): Element[] {
  const parents: Element[] = [];
  let at: Element | null = node;
  while (at !== null) {
    if (isScrollable(at, checkForOverflow)) parents.push(at);
    at = at.parentElement;
  }
  return parents;
}

export interface ScrollIntoViewOptions {
  block?: ScrollLogicalPosition;
  inline?: ScrollLogicalPosition;
}

/**
 * Scroll `view` so `element` is visible, without touching anything above it.
 *
 * `element.scrollIntoView({ block: "nearest" })` would do it, and also scrolls
 * every ancestor scroller including the page, which moves a popover out from
 * under the pointer. This computes the offset for one scroller only.
 */
export function scrollIntoView(
  view: HTMLElement,
  element: HTMLElement,
  options: ScrollIntoViewOptions = {},
): void {
  const { block = "nearest", inline = "nearest" } = options;
  if (view === element) return;

  let y = view.scrollTop;
  let x = view.scrollLeft;

  const target = element.getBoundingClientRect();
  const bounds = view.getBoundingClientRect();
  const win = ownerWindow(view);
  const itemStyle = win.getComputedStyle(element);
  const viewStyle = win.getComputedStyle(view);
  const root = ownerDocument(view).scrollingElement ?? ownerDocument(view).documentElement;
  const isRoot = view === root;

  const number = (value: string): number => Number.parseFloat(value) || 0;

  const viewTop = isRoot ? 0 : bounds.top;
  const viewBottom = isRoot ? view.clientHeight : bounds.bottom;
  const viewLeft = isRoot ? 0 : bounds.left;
  const viewRight = isRoot ? view.clientWidth : bounds.right;

  const borderTop = number(viewStyle.borderTopWidth);
  const borderBottom = number(viewStyle.borderBottomWidth);
  const borderLeft = number(viewStyle.borderLeftWidth);
  const borderRight = number(viewStyle.borderRightWidth);

  const areaTop = target.top - number(itemStyle.scrollMarginTop);
  const areaBottom = target.bottom + number(itemStyle.scrollMarginBottom);
  const areaLeft = target.left - number(itemStyle.scrollMarginLeft);
  const areaRight = target.right + number(itemStyle.scrollMarginRight);

  const barOffsetX = isRoot ? 0 : borderLeft + borderRight;
  const barOffsetY = isRoot ? 0 : borderTop + borderBottom;
  const barWidth = isRoot ? 0 : view.offsetWidth - view.clientWidth - barOffsetX;
  const barHeight = isRoot ? 0 : view.offsetHeight - view.clientHeight - barOffsetY;

  const portTop = viewTop + (isRoot ? 0 : borderTop) + number(viewStyle.scrollPaddingTop);
  const portBottom =
    viewBottom - (isRoot ? 0 : borderBottom) - number(viewStyle.scrollPaddingBottom) - barHeight;
  let portLeft = viewLeft + (isRoot ? 0 : borderLeft) + number(viewStyle.scrollPaddingLeft);
  let portRight = viewRight - (isRoot ? 0 : borderRight) - number(viewStyle.scrollPaddingRight);

  // WebKit on iOS puts the scrollbar on the right whichever way the text runs.
  if (viewStyle.direction === "rtl" && !isWebKitIOS()) portLeft += barWidth;
  else portRight -= barWidth;

  const scrollBlock = areaTop < portTop || areaBottom > portBottom;
  const scrollInline = areaLeft < portLeft || areaRight > portRight;

  if (scrollBlock) {
    if (block === "start") y += areaTop - portTop;
    else if (block === "center") y += (areaTop + areaBottom) / 2 - (portTop + portBottom) / 2;
    else if (block === "end") y += areaBottom - portBottom;
    else {
      const start = areaTop - portTop;
      const end = areaBottom - portBottom;
      y += Math.abs(start) <= Math.abs(end) ? start : end;
    }
  }

  if (scrollInline) {
    if (inline === "start") x += areaLeft - portLeft;
    else if (inline === "center") x += (areaLeft + areaRight) / 2 - (portLeft + portRight) / 2;
    else if (inline === "end") x += areaRight - portRight;
    else {
      const start = areaLeft - portLeft;
      const end = areaRight - portRight;
      x += Math.abs(start) <= Math.abs(end) ? start : end;
    }
  }

  // `scrollTo` is animated and a headless DOM does not implement it; the
  // assignment is what a test can observe.
  if (typeof view.scrollTo === "function") view.scrollTo({ left: x, top: y });
  else {
    view.scrollLeft = x;
    view.scrollTop = y;
  }
}

function isWebKitIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /AppleWebKit/i.test(navigator.userAgent) && /iPhone|iPad/i.test(navigator.platform ?? "");
}

/**
 * Scroll the element into the viewport, without scrolling the page when the
 * page's own scrolling has been prevented.
 *
 * A focused option inside an open modal must come into view; scrolling the
 * body to do it would move the modal off screen with no way back.
 */
export function scrollIntoViewport(
  target: Element | null,
  options: { containingElement?: Element | null } = {},
): void {
  if (target === null || !target.isConnected) return;

  const doc = ownerDocument(target);
  const root = doc.scrollingElement ?? doc.documentElement;
  const prevented = ownerWindow(target).getComputedStyle(root).overflow === "hidden";

  const before = target.getBoundingClientRect();

  if (!prevented) {
    target.scrollIntoView?.({ block: "nearest" });
    const after = target.getBoundingClientRect();
    if (Math.abs(before.left - after.left) > 1 || Math.abs(before.top - after.top) > 1) {
      options.containingElement?.scrollIntoView?.({ block: "center", inline: "center" });
      target.scrollIntoView?.({ block: "nearest" });
    }
    return;
  }

  for (const parent of scrollParents(target, true)) {
    scrollIntoView(parent as HTMLElement, target as HTMLElement);
  }

  const after = target.getBoundingClientRect();
  if (Math.abs(before.left - after.left) <= 1 && Math.abs(before.top - after.top) <= 1) return;

  const containing = options.containingElement;
  if (containing !== null && containing !== undefined) {
    for (const parent of scrollParents(containing, true)) {
      scrollIntoView(parent as HTMLElement, containing as HTMLElement, {
        block: "center",
        inline: "center",
      });
    }
  }
  for (const parent of scrollParents(target, true)) {
    scrollIntoView(parent as HTMLElement, target as HTMLElement);
  }
}
