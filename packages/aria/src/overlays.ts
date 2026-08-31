/**
 * Overlays: dialogs, popovers, menus, tooltips.
 *
 * Four problems, none of which the platform solves for a `<div>` positioned
 * over the page:
 *
 * - Dismissal. Escape closes the TOP overlay, not every open one, and an
 *   interaction outside closes it only if the interaction both began and ended
 *   outside.
 * - The rest of the page. A modal must be hidden from a screen reader, or the
 *   virtual cursor walks straight out of it into content the user cannot see.
 *   `aria-hidden` on everything else is the only mechanism that works, and it
 *   has to keep working as the page changes underneath.
 * - Scrolling. `overflow: hidden` on the root is enough everywhere except iOS
 *   WebKit, which scrolls anyway in four distinct situations.
 * - Position. A popover has to flip when it would go off screen, shift to stay
 *   inside its boundary, and cap its own height rather than overflow.
 */

import {
  type Accessor,
  context,
  effect,
  getContext,
  getOwner,
  install,
  isServer,
  signal,
} from "@barqjs/core";
import {
  addEvent,
  contains,
  isScrollable,
  ownerDocument,
  ownerWindow,
  propagationTargets,
  scrollParents,
  setStyle,
  targetElement,
  TOP_LAYER_ATTRIBUTE,
} from "./dom.ts";
import { resizeObserver } from "@barqjs/primitives/observers";

import { focusWithin } from "./interactions/focus-events.ts";
import { interactOutside } from "./interactions/interact-outside.ts";
import type { ElementRef } from "./interactions/press.ts";
import { isIOS, isWebKit } from "./platform.ts";
import {
  access,
  chain,
  controllable,
  id,
  mergeProps,
  type DOMProps,
  type MaybeAccessor,
} from "./utils.ts";

// ---------------------------------------------------------------------------
// Open state
// ---------------------------------------------------------------------------

export interface OverlayTriggerStateOptions {
  isOpen?: MaybeAccessor<boolean | undefined>;
  defaultOpen?: MaybeAccessor<boolean | undefined>;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * Every member is a PROPERTY rather than a method, because every one of them
 * is handed on detached: `onClose={state.close}` and `onOpenChange={setOpen}`
 * are the idiom this whole layer is built around. Method shorthand would
 * declare a `this` that no implementation here has and no caller could keep.
 */
export interface OverlayTriggerState {
  isOpen: Accessor<boolean>;
  setOpen: (isOpen: boolean) => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/** Whether an overlay is open, controlled or not. */
export function overlayTriggerState(options: OverlayTriggerStateOptions = {}): OverlayTriggerState {
  const [isOpen, setOpen] = controllable<boolean>(
    () => access(options.isOpen),
    () => access(options.defaultOpen) ?? false,
    options.onOpenChange,
  );

  return {
    isOpen,
    setOpen,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!isOpen()),
  };
}

export interface OverlayTriggerOptions {
  /** What the trigger opens. */
  type: "dialog" | "menu" | "listbox" | "tree" | "grid";
}

export interface OverlayTriggerResult {
  triggerProps: DOMProps;
  overlayProps: DOMProps;
}

/**
 * The trigger and the overlay it opens, wired together.
 *
 * `aria-haspopup` is only written for a menu and a listbox: screen readers
 * announce every other value as "menu", which is worse than saying nothing.
 */
export function overlayTrigger(
  options: OverlayTriggerOptions,
  state: OverlayTriggerState,
): OverlayTriggerResult {
  const overlayId = id();

  const hasPopup =
    options.type === "menu" ? true : options.type === "listbox" ? "listbox" : undefined;

  return {
    triggerProps: {
      "aria-haspopup": hasPopup,
      "aria-expanded": () => state.isOpen(),
      "aria-controls": () => (state.isOpen() ? overlayId() : undefined),
      onPress: () => state.toggle(),
    },
    overlayProps: { id: overlayId },
  };
}

// ---------------------------------------------------------------------------
// Where an overlay is rendered
// ---------------------------------------------------------------------------

/**
 * Where overlays below this point are portalled to.
 *
 * `null` means the default, which is `document.body`. A container is asked for
 * rather than held, because the element it names may not exist yet when the
 * provider runs — the root popover's own container is exactly that case.
 */
export type PortalTarget = () => Element | null;

const PortalTargetContext = context<PortalTarget | null>(null);

/**
 * Send every overlay below here somewhere other than the body.
 *
 * For an application that renders inside a shadow root, a fullscreen element,
 * or a container it styles: an overlay portalled to the body would leave that
 * subtree and lose the styles, the theme and the containing block with it.
 */
export function providePortalTarget(target: PortalTarget | null): void {
  const owner = getOwner();
  if (owner !== null) install(owner, PortalTargetContext, () => target);
}

/** The portal target in scope, if one was provided. */
export function usePortalTarget(): PortalTarget | null {
  return getContext(PortalTargetContext) ?? null;
}

/**
 * The element an overlay should be portalled into.
 *
 * `null` on the server and before the document exists, which is the signal to
 * render nothing rather than to render in the wrong place.
 */
export function portalContainer(target: PortalTarget | null): Element | null {
  const given = target?.() ?? null;
  if (given !== null) return given;
  if (isServer || typeof document === "undefined") return null;
  return document.body;
}

// ---------------------------------------------------------------------------
// Dismissal
// ---------------------------------------------------------------------------

/**
 * Every open overlay, innermost last.
 *
 * Escape and an outside press act on the last one only: a menu inside a dialog
 * must close the menu, leaving the dialog open.
 */
const openOverlays: ElementRef[] = [];

export interface OverlayOptions {
  isOpen?: MaybeAccessor<boolean | undefined>;
  onClose?: () => void;
  /** Close when the user interacts outside. @default false */
  isDismissable?: MaybeAccessor<boolean | undefined>;
  /** Close when focus leaves. */
  shouldCloseOnBlur?: MaybeAccessor<boolean | undefined>;
  /** @default false */
  isKeyboardDismissDisabled?: MaybeAccessor<boolean | undefined>;
  /** Veto a dismissal for an interaction with a particular element. */
  shouldCloseOnInteractOutside?: (element: Element) => boolean;
  /**
   * What counts as INSIDE, when that is more than the overlay itself.
   *
   * A submenu is portalled into its root popover's container rather than into
   * the body, so the whole group is one overlay as far as an outside press and
   * `aria-hidden` are concerned. Without this a press on a submenu item is a
   * press outside the menu that opened it.
   *
   * @default the overlay's own element
   */
  groupRef?: ElementRef;
}

export interface OverlayResult {
  overlayProps: DOMProps;
  underlayProps: DOMProps;
}

/** Dismissal behaviour for one overlay. */
export function overlay(options: OverlayOptions, ref: ElementRef): OverlayResult {
  let lastTopMost: ElementRef | undefined;
  const inside: ElementRef = options.groupRef ?? ref;

  effect(() => {
    if (access(options.isOpen) !== true) return undefined;
    if (openOverlays.includes(ref)) return undefined;
    openOverlays.push(ref);
    return () => {
      const at = openOverlays.indexOf(ref);
      if (at >= 0) openOverlays.splice(at, 1);
    };
  });

  const isTopMost = (): boolean => openOverlays[openOverlays.length - 1] === ref;

  const hide = (): void => {
    if (isTopMost()) options.onClose?.();
  };

  const shouldClose = (element: Element | null): boolean => {
    if (options.shouldCloseOnInteractOutside === undefined) return true;
    return element !== null && options.shouldCloseOnInteractOutside(element);
  };

  interactOutside({
    ref: inside,
    isDisabled: () => access(options.isDismissable) !== true || access(options.isOpen) !== true,
    onInteractOutsideStart: (event) => {
      lastTopMost = openOverlays[openOverlays.length - 1];
      if (shouldClose(targetElement(event)) && isTopMost()) event.stopPropagation();
    },
    onInteractOutside: (event) => {
      if (shouldClose(targetElement(event))) {
        if (isTopMost()) event.stopPropagation();
        // Only if this overlay was the top one when the press BEGAN: a press
        // that started while a menu was open must not close the dialog the
        // menu was in once the menu has gone.
        if (lastTopMost === ref) hide();
      }
      lastTopMost = undefined;
    },
  });

  const { focusWithinProps } = focusWithin({
    isDisabled: () => access(options.shouldCloseOnBlur) !== true,
    onBlurWithin: (event) => {
      // A null `relatedTarget` means focus went to the body: switching tabs,
      // or a VoiceOver quirk. An outside PRESS is handled above; this is only
      // for focus genuinely moving elsewhere.
      const related = event.relatedTarget as Element | null;
      if (related === null) return;
      if (shouldClose(related)) options.onClose?.();
    },
  });

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    if (access(options.isKeyboardDismissDisabled) === true) return;
    event.stopPropagation();
    event.preventDefault();
    hide();
  };

  return {
    overlayProps: mergeProps(focusWithinProps, { onKeyDown }),
    underlayProps: {},
  };
}

/**
 * Close when the trigger scrolls out from under the overlay.
 *
 * A popover anchored to something that has scrolled away is pointing at
 * nothing. Scrolling inside a field is ignored: a combobox input scrolls its
 * own text when the caret moves, which is not the page moving.
 */
export function closeOnScroll(options: {
  triggerRef: ElementRef;
  isOpen?: MaybeAccessor<boolean | undefined>;
  onClose?: (() => void) | null;
}): void {
  effect(() => {
    if (access(options.isOpen) !== true || options.onClose === null) return undefined;

    const trigger = access(options.triggerRef) as Element | null;
    if (trigger === null) return undefined;

    const onScroll = (event: Event): void => {
      const target = targetElement(event);
      // A scroller elsewhere in the page does not move the trigger.
      if (target !== null && !contains(target, trigger)) return;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      options.onClose?.();
    };

    return addEvent(propagationTargets(trigger), "scroll", onScroll, true);
  });
}

// ---------------------------------------------------------------------------
// Hiding the rest of the page
// ---------------------------------------------------------------------------

const supportsInert = typeof HTMLElement !== "undefined" && "inert" in HTMLElement.prototype;

/** How many overlays are hiding each element, so nesting unwinds correctly. */
const hiddenCounts = new WeakMap<Element, number>();

interface HideObserver {
  visible: Set<Element>;
  hidden: Set<Element>;
  observe(): void;
  disconnect(): void;
}

const hideStack: HideObserver[] = [];

function isAlwaysVisible(node: Element): boolean {
  const data = (node as HTMLElement).dataset;
  return data?.barqLiveAnnouncer === "true" || node.hasAttribute(TOP_LAYER_ATTRIBUTE);
}

/**
 * Hide everything except `targets` from assistive technology.
 *
 * A `MutationObserver` keeps it true as the page changes: a toast rendered
 * while a dialog is open would otherwise be readable by a screen reader that
 * is supposed to be trapped inside the dialog.
 *
 * Returns the undo.
 */
export function ariaHideOutside(
  targets: Element[],
  options: { root?: Element; shouldUseInert?: boolean } = {},
): () => void {
  if (isServer || typeof MutationObserver === "undefined") return () => {};

  const view = ownerWindow(targets[0]);
  const root = options.root ?? ownerDocument(targets[0]).body;
  const useInert = options.shouldUseInert === true && supportsInert;

  const visible = new Set<Element>(targets);
  const hidden = new Set<Element>();

  const isHidden = (element: Element): boolean =>
    useInert && element instanceof view.HTMLElement
      ? element.inert
      : element.getAttribute("aria-hidden") === "true";

  const setHidden = (element: Element, value: boolean): void => {
    if (useInert && element instanceof view.HTMLElement) {
      element.inert = value;
      return;
    }
    if (value) {
      element.setAttribute("aria-hidden", "true");
      return;
    }
    element.removeAttribute("aria-hidden");
    if (element instanceof view.HTMLElement) element.inert = false;
  };

  const hide = (node: Element): void => {
    const count = hiddenCounts.get(node) ?? 0;
    // Already hidden by the page itself: leave it alone entirely, so the undo
    // does not reveal something that was never ours.
    if (isHidden(node) && count === 0) return;
    if (count === 0) setHidden(node, true);
    hidden.add(node);
    hiddenCounts.set(node, count + 1);
  };

  const walk = (from: Element): void => {
    for (const element of from.querySelectorAll(
      `[data-barq-live-announcer], [${TOP_LAYER_ATTRIBUTE}]`,
    )) {
      visible.add(element);
    }

    const accept = (node: Element): number => {
      // `aria-hidden` is inherited, so a child of a hidden node needs nothing.
      // `role="row"` is the exception: iOS VoiceOver ignores `aria-hidden` on
      // a row, so its cells have to be hidden individually.
      if (
        hidden.has(node) ||
        visible.has(node) ||
        (node.parentElement !== null &&
          hidden.has(node.parentElement) &&
          node.parentElement.getAttribute("role") !== "row")
      ) {
        return NodeFilter.FILTER_REJECT;
      }

      // An ancestor of a target stays visible, but its other children do not.
      for (const target of visible) {
        if (contains(node, target)) return NodeFilter.FILTER_SKIP;
      }

      return NodeFilter.FILTER_ACCEPT;
    };

    const verdict = accept(from);
    if (verdict === NodeFilter.FILTER_ACCEPT) hide(from);
    if (verdict === NodeFilter.FILTER_REJECT) return;

    const walker = ownerDocument(from).createTreeWalker(from, NodeFilter.SHOW_ELEMENT, {
      acceptNode: accept,
    });
    let node = walker.nextNode();
    while (node !== null) {
      hide(node as Element);
      node = walker.nextNode();
    }
  };

  // A previous call's observer stops watching while this one is on top.
  hideStack[hideStack.length - 1]?.disconnect();

  walk(root);

  const observer = new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type !== "childList") continue;
      if (!change.target.isConnected) continue;
      if ([...visible, ...hidden].some((node) => contains(node, change.target))) continue;

      for (const node of change.addedNodes) {
        if (node instanceof Element && isAlwaysVisible(node)) visible.add(node);
        else if (node instanceof Element) walk(node);
      }
    }
  });

  observer.observe(root, { childList: true, subtree: true });

  const entry: HideObserver = {
    visible,
    hidden,
    observe: () => observer.observe(root, { childList: true, subtree: true }),
    disconnect: () => observer.disconnect(),
  };
  hideStack.push(entry);

  return () => {
    observer.disconnect();

    for (const node of hidden) {
      const count = hiddenCounts.get(node);
      if (count === undefined) continue;
      if (count === 1) {
        setHidden(node, false);
        hiddenCounts.delete(node);
      } else {
        hiddenCounts.set(node, count - 1);
      }
    }

    const at = hideStack.indexOf(entry);
    if (at === hideStack.length - 1) {
      hideStack.pop();
      hideStack[hideStack.length - 1]?.observe();
    } else if (at >= 0) {
      hideStack.splice(at, 1);
    }
  };
}

/** Keep an element visible to assistive technology inside the current overlay. */
export function keepVisible(element: Element): (() => void) | undefined {
  const entry = hideStack[hideStack.length - 1];
  if (entry === undefined || entry.visible.has(element)) return undefined;
  entry.visible.add(element);
  return () => entry.visible.delete(element);
}

// ---------------------------------------------------------------------------
// Preventing scroll
// ---------------------------------------------------------------------------

let scrollLocks = 0;
let releaseScroll: (() => void) | null = null;

/**
 * Stop the page scrolling behind a modal.
 *
 * `overflow: hidden` on the root is enough everywhere but iOS WebKit, where
 * the page still scrolls when the toolbars are collapsed, when the keyboard is
 * up, when an input is focused, and when the keyboard's next/previous buttons
 * move between fields. Each needs its own answer.
 */
export function preventScroll(
  options: { isDisabled?: MaybeAccessor<boolean | undefined> } = {},
): void {
  effect(() => {
    if (isServer || access(options.isDisabled) === true) return undefined;

    scrollLocks++;
    if (scrollLocks === 1) {
      releaseScroll = isIOS() && isWebKit() ? preventScrollWebKitIOS() : preventScrollStandard();
    }

    return () => {
      scrollLocks--;
      if (scrollLocks === 0) {
        releaseScroll?.();
        releaseScroll = null;
      }
    };
  });
}

function preventScrollStandard(): () => void {
  const root = document.documentElement;
  const scrollbarWidth = window.innerWidth - root.clientWidth;

  // `scrollbar-gutter` where it exists, because padding does not hold a fixed
  // element in place and the gutter does.
  const compensate =
    scrollbarWidth > 0
      ? "scrollbarGutter" in root.style
        ? setStyle(root, "scrollbar-gutter", "stable")
        : setStyle(root, "padding-right", `${scrollbarWidth}px`)
      : () => {};

  return chain(compensate, setStyle(root, "overflow", "hidden"));
}

function preventScrollWebKitIOS(): () => void {
  // Also what tells `scrollIntoViewport` to scroll only the scroll parents.
  const restoreOverflow = setStyle(document.documentElement, "overflow", "hidden");

  let scroller: Element | null = null;
  let allowTouchMove = false;

  const onTouchStart = (event: Event): void => {
    const touch = event as TouchEvent;
    const target = targetElement(touch);
    if (target === null) return;

    scroller = isScrollable(target) ? target : (scrollParents(target, true)[0] ?? null);
    allowTouchMove = false;

    // Adjusting a text selection, dragging a slider and moving a selection
    // handle are all touch moves the user meant.
    const selection = ownerWindow(target).getSelection();
    if (selection !== null && !selection.isCollapsed && selection.containsNode(target, true)) {
      allowTouchMove = true;
    }
    if (touch.composedPath().some((el) => el instanceof HTMLInputElement && el.type === "range")) {
      allowTouchMove = true;
    }
    if (
      target instanceof HTMLInputElement &&
      target.selectionStart !== null &&
      target.selectionEnd !== null &&
      target.selectionStart < target.selectionEnd &&
      ownerDocument(target).activeElement === target
    ) {
      allowTouchMove = true;
    }
  };

  const onTouchMove = (event: Event): void => {
    const touch = event as TouchEvent;
    if (touch.touches.length === 2 || allowTouchMove) return;

    if (scroller === null || scroller === document.documentElement || scroller === document.body) {
      touch.preventDefault();
      return;
    }

    // `overscroll-behavior: contain` should stop the chain to the page, and
    // does not when the element does not actually overflow.
    if (
      scroller.scrollHeight === scroller.clientHeight &&
      scroller.scrollWidth === scroller.clientWidth
    ) {
      touch.preventDefault();
    }
  };

  // Injected as a stylesheet because iOS 26 requires it to be in effect before
  // the touchstart, which a property set in the handler is not.
  const style = document.createElement("style");
  style.textContent = "@layer{*{overscroll-behavior:contain}}";
  document.head.prepend(style);

  const removeEvents = chain(
    addEvent(document, "touchstart", onTouchStart, { passive: false, capture: true }),
    addEvent(document, "touchmove", onTouchMove, { passive: false, capture: true }),
  );

  return () => {
    restoreOverflow();
    removeEvents();
    style.remove();
  };
}

// ---------------------------------------------------------------------------
// Positioning
// ---------------------------------------------------------------------------

export type Placement =
  | "top"
  | "top start"
  | "top end"
  | "bottom"
  | "bottom start"
  | "bottom end"
  | "left"
  | "left top"
  | "left bottom"
  | "right"
  | "right top"
  | "right bottom"
  | "start"
  | "start top"
  | "start bottom"
  | "end"
  | "end top"
  | "end bottom";

export type Axis = "top" | "bottom" | "left" | "right";

export interface PositionOptions {
  /** The element the overlay is anchored to. */
  targetRef: ElementRef;
  /**
   * A box in client coordinates to place against, instead of the target's own.
   *
   * A context menu is anchored to the point the pointer was at, which is not
   * an element and has no box to measure. `targetRef` stays whatever that
   * point was inside, so scrolling the region away still closes the overlay
   * and a resize there still re-places it.
   */
  targetRect?: MaybeAccessor<AnchorRect | null | undefined>;
  /** The overlay itself. */
  overlayRef: ElementRef;
  /** What the overlay must stay inside. @default the viewport */
  boundaryRef?: ElementRef;
  /** Which side, and how the cross axis aligns. @default "bottom" */
  placement?: MaybeAccessor<Placement | undefined>;
  /** Distance from the target, along the main axis. @default 0 */
  offset?: MaybeAccessor<number | undefined>;
  /** Distance along the cross axis. @default 0 */
  crossOffset?: MaybeAccessor<number | undefined>;
  /** Flip to the opposite side when there is no room. @default true */
  shouldFlip?: MaybeAccessor<boolean | undefined>;
  /** Keep this far from the boundary's edges. @default 12 */
  containerPadding?: MaybeAccessor<number | undefined>;
  /** The arrow element, so it can be centred on the target. */
  arrowRef?: ElementRef;
  isOpen?: MaybeAccessor<boolean | undefined>;
  onClose?: () => void;
  /** Text direction, for `start` and `end` placements. @default "ltr" */
  direction?: MaybeAccessor<"ltr" | "rtl" | undefined>;
}

export interface PositionResult {
  /** Style for the overlay: absolute position and a maximum height. */
  overlayProps: DOMProps;
  /** Style for the arrow: its offset along the cross axis. */
  arrowProps: DOMProps;
  /** Where the overlay ended up, which may not be where it was asked to go. */
  placement: Accessor<Axis>;
  /** Re-measure and re-place. */
  update(): void;
}

/** A box in client coordinates: what an overlay is placed against. */
export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

type Box = AnchorRect;

const OPPOSITE: Record<Axis, Axis> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

function resolveAxis(placement: Placement, direction: "ltr" | "rtl"): [Axis, string] {
  const [side, align = "center"] = placement.split(" ") as [string, string?];
  if (side === "start") return [direction === "rtl" ? "right" : "left", align];
  if (side === "end") return [direction === "rtl" ? "left" : "right", align];
  return [side as Axis, align];
}

function boxOf(element: Element): Box {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

/**
 * Width and height before any transform.
 *
 * `getBoundingClientRect` reports what is PAINTED, which for anything mid-
 * animation is the wrong number to place it by.
 */
function layoutSize(element: Element): { width: number; height: number } {
  const html = element as HTMLElement;
  return html.offsetWidth > 0 || html.offsetHeight > 0
    ? { width: html.offsetWidth, height: html.offsetHeight }
    : boxOf(element);
}

function place(
  target: Box,
  panel: Box,
  axis: Axis,
  align: string,
  offset: number,
  cross: number,
): {
  top: number;
  left: number;
} {
  let top = 0;
  let left = 0;

  if (axis === "top" || axis === "bottom") {
    top = axis === "top" ? target.top - panel.height - offset : target.top + target.height + offset;
    if (align === "start") left = target.left;
    else if (align === "end") left = target.left + target.width - panel.width;
    else left = target.left + target.width / 2 - panel.width / 2;
    left += cross;
  } else {
    left =
      axis === "left" ? target.left - panel.width - offset : target.left + target.width + offset;
    if (align === "top") top = target.top;
    else if (align === "bottom") top = target.top + target.height - panel.height;
    else top = target.top + target.height / 2 - panel.height / 2;
    top += cross;
  }

  return { top, left };
}

function fits(
  position: { top: number; left: number },
  panel: Box,
  boundary: Box,
  padding: number,
): boolean {
  return (
    position.top >= boundary.top + padding &&
    position.left >= boundary.left + padding &&
    position.top + panel.height <= boundary.top + boundary.height - padding &&
    position.left + panel.width <= boundary.left + boundary.width - padding
  );
}

/**
 * Place an overlay next to its trigger.
 *
 * The order is: try the requested side; flip to the opposite side if it does
 * not fit and flipping is allowed; then shift along the cross axis to stay
 * inside the boundary; then cap the height to what is left. Shifting after
 * flipping rather than instead of it is what keeps a popover pointing at its
 * trigger rather than sliding across the screen.
 */
export function overlayPosition(options: PositionOptions): PositionResult {
  const position = signal<{
    top: number;
    left: number;
    maxHeight: number;
    targetWidth: number;
    targetHeight: number;
  }>({
    top: 0,
    left: 0,
    maxHeight: Number.POSITIVE_INFINITY,
    targetWidth: 0,
    targetHeight: 0,
  });
  const arrowOffset = signal<number | undefined>(undefined);
  const resolvedAxis = signal<Axis>("bottom");

  const update = (): void => {
    const target = access(options.targetRef) ?? null;
    const rect = access(options.targetRect) ?? null;
    const element = access(options.overlayRef) as Element | null;
    if (element === null || access(options.isOpen) === false) return;
    const targetBox = rect ?? (target === null ? null : boxOf(target));
    if (targetBox === null) return;

    const boundaryElement = access(options.boundaryRef ?? undefined) as Element | null;
    const view = ownerWindow(element);
    const boundary: Box =
      boundaryElement !== null && boundaryElement !== undefined
        ? boxOf(boundaryElement)
        : { top: 0, left: 0, width: view.innerWidth, height: view.innerHeight };

    // The overlay's LAYOUT size, not its painted one. Every overlay here enters
    // with `zoom-in-95`, so the first measurement caught it at 95% — a 288px
    // popover measured 274 and was centred on that, then finished its animation
    // 7px off its trigger and stayed there. A transform on the thing being
    // placed must not decide where it goes.
    const overlayBox = { top: 0, left: 0, ...layoutSize(element) };
    const offset = access(options.offset) ?? 0;
    const cross = access(options.crossOffset) ?? 0;
    const padding = access(options.containerPadding) ?? 12;
    const direction = access(options.direction) ?? "ltr";

    const [start, align] = resolveAxis(access(options.placement) ?? "bottom", direction);
    let axis = start;
    let placed = place(targetBox, overlayBox, axis, align, offset, cross);

    if (!fits(placed, overlayBox, boundary, padding) && access(options.shouldFlip) !== false) {
      const flipped = place(targetBox, overlayBox, OPPOSITE[axis], align, offset, cross);
      if (fits(flipped, overlayBox, boundary, padding)) {
        axis = OPPOSITE[axis];
        placed = flipped;
      }
    }

    // Shift along the cross axis, never the main one: moving along the main
    // axis would detach the overlay from its trigger.
    if (axis === "top" || axis === "bottom") {
      placed.left = Math.min(
        Math.max(placed.left, boundary.left + padding),
        boundary.left + boundary.width - overlayBox.width - padding,
      );
    } else {
      placed.top = Math.min(
        Math.max(placed.top, boundary.top + padding),
        boundary.top + boundary.height - overlayBox.height - padding,
      );
    }

    const maxHeight =
      axis === "top"
        ? targetBox.top - offset - boundary.top - padding
        : axis === "bottom"
          ? boundary.top + boundary.height - padding - (targetBox.top + targetBox.height + offset)
          : boundary.height - padding * 2;

    // The overlay is positioned relative to the page, so the scroll offset is
    // part of the answer.
    position.set({
      top: placed.top + view.scrollY,
      left: placed.left + view.scrollX,
      maxHeight: Math.max(0, maxHeight),
      targetWidth: targetBox.width,
      targetHeight: targetBox.height,
    });
    resolvedAxis.set(axis);

    const arrow = access(options.arrowRef ?? undefined) as Element | null;
    if (arrow !== null && arrow !== undefined) {
      // The same reason, and one more: an arrow is a rotated square, so
      // `getBoundingClientRect` reports the box the rotation sweeps out — 14.1px
      // for a 10px arrow — which centred it 2px off its trigger.
      const arrowBox = layoutSize(arrow);
      // Centred on the TARGET, not on the overlay: after a shift the two are
      // no longer aligned, and the arrow has to keep pointing at the trigger.
      if (axis === "top" || axis === "bottom") {
        const centre = targetBox.left + targetBox.width / 2 - placed.left;
        arrowOffset.set(
          Math.min(Math.max(centre - arrowBox.width / 2, 0), overlayBox.width - arrowBox.width),
        );
      } else {
        const centre = targetBox.top + targetBox.height / 2 - placed.top;
        arrowOffset.set(
          Math.min(Math.max(centre - arrowBox.height / 2, 0), overlayBox.height - arrowBox.height),
        );
      }
    }
  };

  if (!isServer) {
    effect(() => {
      if (access(options.isOpen) === false) return undefined;
      // Read the refs so the position is recomputed once they resolve.
      void access(options.targetRef);
      void access(options.targetRect);
      void access(options.overlayRef);
      void access(options.placement);
      update();

      const view = window;
      const onChange = (): void => update();
      view.addEventListener("resize", onChange);
      view.addEventListener("scroll", onChange, true);

      // The FIRST measurement is taken the moment the ref resolves, which is
      // before the browser has laid the overlay out: a popover measured 275px
      // wide, was centred on that, and then rendered at 288px, sitting 7px off
      // its trigger until something else forced a resize. Observing both boxes
      // re-places it once the real sizes exist, and again whenever the content
      // grows.
      const stopTarget = resizeObserver(
        () => access(options.targetRef) as Element | null,
        onChange,
      );
      const stopOverlay = resizeObserver(
        () => access(options.overlayRef) as Element | null,
        onChange,
      );

      return () => {
        view.removeEventListener("resize", onChange);
        view.removeEventListener("scroll", onChange, true);
        stopTarget();
        stopOverlay();
      };
    });
  }

  closeOnScroll({
    triggerRef: options.targetRef,
    isOpen: options.isOpen,
    onClose: options.onClose ?? null,
  });

  return {
    overlayProps: {
      style: () => {
        const current = position();
        return {
          position: "absolute",
          top: `${current.top}px`,
          left: `${current.left}px`,
          maxHeight: Number.isFinite(current.maxHeight) ? `${current.maxHeight}px` : undefined,
          // What the trigger measures, for an overlay that wants to match it.
          // A listbox under a combobox is the case: `width: 100%` resolves
          // against the PORTAL container, which is the body, so a popover asked
          // to be as wide as its trigger came out as wide as the page.
          "--barq-trigger-width": `${current.targetWidth}px`,
          "--barq-trigger-height": `${current.targetHeight}px`,
        };
      },
    },
    arrowProps: {
      style: () => {
        const offset = arrowOffset();
        if (offset === undefined) return {};
        const axis = resolvedAxis();
        return axis === "top" || axis === "bottom"
          ? { position: "absolute", left: `${offset}px` }
          : { position: "absolute", top: `${offset}px` };
      },
      "data-placement": resolvedAxis,
    },
    placement: resolvedAxis,
    update,
  };
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export interface ModalOverlayOptions extends OverlayOptions {
  /** Let the page scroll behind the modal. @default false */
  isScrollDisabled?: MaybeAccessor<boolean | undefined>;
}

export interface ModalOverlayResult extends OverlayResult {
  modalProps: DOMProps;
}

/**
 * A modal: the page behind it is inert, unscrollable, and invisible to a
 * screen reader.
 */
export function modalOverlay(
  options: ModalOverlayOptions,
  state: OverlayTriggerState,
  ref: ElementRef,
): ModalOverlayResult {
  const { overlayProps, underlayProps } = overlay(
    { ...options, isOpen: state.isOpen, onClose: state.close },
    ref,
  );

  preventScroll({
    isDisabled: () => !state.isOpen() || access(options.isScrollDisabled) === true,
  });

  effect(() => {
    if (!state.isOpen()) return undefined;
    const element = access(ref) as Element | null;
    if (element === null) return undefined;
    return ariaHideOutside([element]);
  });

  return {
    modalProps: { "data-barq-modal": true },
    overlayProps,
    underlayProps,
  };
}

/**
 * A button that closes the overlay, rendered at its end and visible only to a
 * screen reader.
 *
 * iOS VoiceOver has no way out of a popover otherwise: the user swipes to the
 * last element and the next swipe leaves the overlay without closing it.
 */
export function dismissButtonProps(onDismiss: () => void): DOMProps {
  return {
    tabIndex: -1,
    "aria-label": "Dismiss",
    style: {
      width: "1px",
      height: "1px",
      position: "absolute",
      overflow: "hidden",
      clip: "rect(0 0 0 0)",
      clipPath: "inset(50%)",
      whiteSpace: "nowrap",
      border: "0",
      padding: "0",
      margin: "-1px",
    },
    onClick: onDismiss,
  };
}

export { TOP_LAYER_ATTRIBUTE };

/** Mark a subtree as being above every overlay: a toast region. */
export function topLayerProps(): DOMProps {
  return { [TOP_LAYER_ATTRIBUTE]: true };
}
