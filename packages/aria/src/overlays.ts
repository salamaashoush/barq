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
  createContext,
  createEffect,
  getContext,
  getOwner,
  install,
  provide,
  createSignal,
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import {
  addEvent,
  contains,
  isScrollable,
  ownerDocument,
  ownerWindow,
  propagationTargets,
  scrollIntoViewport,
  scrollParents,
  setStyle,
  targetElement,
  TOP_LAYER_ATTRIBUTE,
} from "./dom.ts";
import { resizeObserver } from "@barqjs/primitives/observers";

import { focusWithin } from "./interactions/focus-events.ts";
import { interactOutside } from "./interactions/interact-outside.ts";
import { isTextEntry } from "./interactions/modality.ts";
import type { ElementRef } from "./interactions/press.ts";
import { StringDictionary, stringFormatter } from "./i18n.ts";
import { isIOS, isWebKit } from "./platform.ts";
import {
  access,
  chain,
  clamp,
  controllable,
  id,
  mergeProps,
  type DOMProps,
  type MaybeAccessor,
} from "./utils.ts";

// ---------------------------------------------------------------------------
// Open state
// ---------------------------------------------------------------------------

/**
 * Do something for as long as an overlay is open, and undo it after.
 *
 * `read` is where the open state and anything else that matters is READ, and
 * `apply` is what is done about the answer; what `apply` returns undoes it
 * before the next answer and on disposal.
 *
 * The two are apart on purpose. A tracked effect reads inside its own first
 * run, and that run can fall in the same pass as a write made by an effect
 * before it: it then sees the value from before the write and is never woken
 * for the one after. An overlay opened from `onSettled` is exactly that, a
 * welcome popover or a dialog restored from the URL, and it stayed closed
 * while its owner's signal said open. A read made here is part of the graph,
 * which is kept consistent across that pass.
 */
export function followOpen<T>(read: () => T, apply: (value: T) => (() => void) | undefined): void {
  // `apply` measures and reads refs as they are at that moment, on purpose:
  // what it depends on is what `read` returned.
  createEffect(read, (value) => untrack(() => apply(value)));
}

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

const PortalTargetContext = createContext<PortalTarget | null>(null);

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

/**
 * Build `children` with every overlay inside them sent to `target`.
 *
 * {@link providePortalTarget} installs on whatever scope is current, which is
 * right in a component that owns one and wrong in one that does not: there it
 * lands on the surrounding scope and the siblings read it too.
 */
export function withPortalTarget(target: PortalTarget | null, children: () => unknown): unknown {
  return provide(PortalTargetContext, () => target, children);
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
  /**
   * Hear Escape wherever focus is, not only inside the overlay.
   *
   * For an overlay that never takes focus: a hover card opened from the
   * keyboard leaves focus on its trigger, which is outside it, and a handler
   * on the overlay alone would never hear the key.
   *
   * @default false
   */
  shouldCloseOnEscapeAnywhere?: MaybeAccessor<boolean | undefined>;
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

  // Not on the server, where the effects of a render still run: the stack is
  // module state, and a request that opened an overlay would leave it there
  // for every request after.
  if (!isServer) {
    followOpen(
      () => access(options.isOpen) === true,
      (isOpen) => {
        if (!isOpen || openOverlays.includes(ref)) return undefined;
        openOverlays.push(ref);
        return () => {
          const at = openOverlays.indexOf(ref);
          if (at >= 0) openOverlays.splice(at, 1);
        };
      },
    );
  }

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
    // The server has no document to hear a press on.
    isDisabled: () =>
      isServer || access(options.isDismissable) !== true || access(options.isOpen) !== true,
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
      // Focus going into a submenu, or into an overlay this one opened, has
      // not left: both are this overlay's own, wherever they are mounted.
      if (contains(access(inside), related)) return;
      const above = openOverlays.slice(openOverlays.indexOf(ref) + 1);
      if (above.some((child) => contains(access(child), related))) return;
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

  if (!isServer) {
    followOpen(
      () => access(options.isOpen) === true && access(options.shouldCloseOnEscapeAnywhere) === true,
      (listens) => {
        if (!listens) return undefined;
        const doc = ownerDocument(access(ref));
        const onDocumentKeyDown = (event: KeyboardEvent): void => {
          // Inside the overlay its own handler has already answered, and an
          // overlay further up the stack is the one Escape belongs to.
          if (event.defaultPrevented || !isTopMost()) return;
          onKeyDown(event);
        };
        doc.addEventListener("keydown", onDocumentKeyDown);
        return () => doc.removeEventListener("keydown", onDocumentKeyDown);
      },
    );
  }

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
  if (isServer) return;

  followOpen(
    () =>
      access(options.isOpen) !== true || options.onClose === null
        ? null
        : ((access(options.triggerRef) as Element | null) ?? null),
    (trigger) => {
      if (trigger === null) return undefined;

      const onScroll = (event: Event): void => {
        const target = targetElement(event);
        // A scroller elsewhere in the page does not move the trigger.
        if (target !== null && !contains(target, trigger)) return;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
        options.onClose?.();
      };

      return addEvent(propagationTargets(trigger), "scroll", onScroll, true);
    },
  );
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
  if (isServer) return;

  followOpen(
    () => access(options.isDisabled) !== true,
    (locks) => {
      if (!locks) return undefined;

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
    },
  );
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
  const nonce = cspNonce(document);
  if (nonce !== undefined) style.nonce = nonce;
  style.textContent = "@layer{*{overscroll-behavior:contain}}";
  document.head.prepend(style);

  const restoreFocus = overrideFocus();
  const removeEvents = chain(
    addEvent(document, "touchstart", onTouchStart, { passive: false, capture: true }),
    addEvent(document, "touchmove", onTouchMove, { passive: false, capture: true }),
    addEvent(document, "blur", onBlurForKeyboard, true),
  );

  return () => {
    restoreOverflow();
    removeEvents();
    style.remove();
    restoreFocus();
  };
}

/**
 * The nonce a Content Security Policy wants on an injected `<style>`, as the
 * page publishes it: a `csp-nonce` meta tag, or the bundler's global.
 */
function cspNonce(doc: Document): string | undefined {
  const view = doc.defaultView;
  const meta = doc.querySelector('meta[name="csp-nonce"], meta[property="csp-nonce"]');
  if (view !== null && meta instanceof view.HTMLMetaElement) {
    const declared = meta.nonce || meta.content;
    if (declared) return declared;
  }
  const bundled =
    (view as { __webpack_nonce__?: string } | null)?.__webpack_nonce__ ??
    (globalThis as { __webpack_nonce__?: string }).__webpack_nonce__;
  return bundled === undefined || bundled === "" ? undefined : bundled;
}

/**
 * Run once the on-screen keyboard has finished appearing, if focus is about to
 * bring it up, and straight away otherwise.
 *
 * Two frames for focus to land, then the visual viewport's resize, which is
 * the keyboard arriving. A keyboard that never arrives (a hardware one is
 * attached) is given up on after the time iOS takes to animate one in.
 */
function afterKeyboard(run: () => void): void {
  const view = window;
  view.requestAnimationFrame(() => {
    view.requestAnimationFrame(() => {
      const visual = view.visualViewport;
      if (visual === null || visual === undefined || !isTextEntry(document.activeElement)) {
        run();
        return;
      }
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        visual.removeEventListener("resize", finish);
        clearTimeout(timer);
        run();
      };
      const timer = setTimeout(finish, KEYBOARD_TIMEOUT);
      visual.addEventListener("resize", finish);
    });
  });
}

/** How long iOS takes to bring the on-screen keyboard in. */
const KEYBOARD_TIMEOUT = 600;

/**
 * Programmatic focus that does not scroll the page.
 *
 * WebKit on iOS scrolls the whole page to centre a focused field, which moves
 * even a fixed modal off the screen. Focus is taken without scrolling, and the
 * field is brought into view by its own scroll parents once the keyboard has
 * taken its share of the screen.
 */
function overrideFocus(): () => void {
  const prototype = HTMLElement.prototype;
  const own = Object.getOwnPropertyDescriptor(prototype, "focus");
  const focus = Reflect.get(prototype, "focus");
  Reflect.defineProperty(prototype, "focus", {
    configurable: true,
    writable: true,
    value(this: HTMLElement, options?: FocusOptions) {
      focus.call(this, { ...options, preventScroll: true });
      if (options?.preventScroll === true) return;
      afterKeyboard(() => {
        if (ownerDocument(this).activeElement === this) scrollIntoViewport(this);
      });
    },
  });
  return () => {
    if (own === undefined) Reflect.deleteProperty(prototype, "focus");
    else Reflect.defineProperty(prototype, "focus", own);
  };
}

/**
 * Route focus moves that WebKit makes itself through {@link overrideFocus}.
 *
 * Tapping a field focuses it natively, which scrolls the page; focusing it
 * again from here takes the path that does not. The keyboard's Done button
 * sends focus to the body, and the next tap on the same field then fires no
 * blur at all, so focus goes to the nearest focusable ancestor instead.
 */
function onBlurForKeyboard(event: Event): void {
  const blur = event as FocusEvent;
  const target = targetElement(blur);
  const related = blur.relatedTarget as HTMLElement | null;
  if (related !== null && isTextEntry(related)) {
    related.focus();
  } else if (related === null) {
    const holder = target?.parentElement?.closest<HTMLElement>("[tabindex]") ?? null;
    holder?.focus({ preventScroll: true });
  }
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

/** Which edge of the trigger an overlay hangs off, as Radix and Base UI name it. */
export type Side = "top" | "right" | "bottom" | "left" | "inline-start" | "inline-end";

/** Where along that edge it sits. */
export type Align = "start" | "center" | "end";

/**
 * The {@link Placement} a side and an alignment name.
 *
 * Two vocabularies for one position: `side="bottom" align="start"` is
 * `"bottom start"`, and `side="right" align="end"` is `"right bottom"`, because
 * a placement names the cross axis by the edge it lines up with.
 */
export function placementFor(side: Side, align: Align = "center"): Placement {
  const main = side === "inline-start" ? "start" : side === "inline-end" ? "end" : side;
  if (align === "center") return main;
  if (main === "top" || main === "bottom") return `${main} ${align}`;
  return `${main} ${align === "start" ? "top" : "bottom"}`;
}

/** The alignment a {@link Placement} asks for, in the other vocabulary. */
export function alignOf(placement: Placement): Align {
  const cross = placement.split(" ")[1];
  if (cross === "start" || cross === "top") return "start";
  if (cross === "end" || cross === "bottom") return "end";
  return "center";
}

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
  /**
   * The least distance between the arrow and the overlay's ends, so it stays
   * clear of a rounded corner. @default 0
   */
  arrowBoundaryOffset?: MaybeAccessor<number | undefined>;
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
  // `start` and `end` under or over a trigger are its inline edges, so they
  // trade places with the text direction.
  if (direction === "rtl" && (side === "top" || side === "bottom")) {
    return [side, align === "start" ? "end" : align === "end" ? "start" : align];
  }
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
  panel: { width: number; height: number },
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
    if (align === "top" || align === "start") top = target.top;
    else if (align === "bottom" || align === "end") top = target.top + target.height - panel.height;
    else top = target.top + target.height / 2 - panel.height / 2;
    top += cross;
  }

  return { top, left };
}

/** The room between the target and the boundary on one side, past the offset and the padding. */
function spaceOn(axis: Axis, target: Box, boundary: Box, offset: number, padding: number): number {
  const room =
    axis === "top"
      ? target.top - boundary.top
      : axis === "bottom"
        ? boundary.top + boundary.height - (target.top + target.height)
        : axis === "left"
          ? target.left - boundary.left
          : boundary.left + boundary.width - (target.left + target.width);
  return Math.max(0, room - offset - padding);
}

/**
 * How far to move an overlay along one axis so it stays inside the boundary.
 *
 * When it is bigger than the boundary its START edge wins, so the beginning of
 * a list too long for the screen is what stays in view.
 */
function shiftInto(start: number, size: number, low: number, high: number): number {
  if (start < low) return low - start;
  if (start + size > high) return Math.max(high - (start + size), low - start);
  return 0;
}

/**
 * What an overlay inside the page is laid out in: the area the user can see.
 *
 * The visual viewport where there is one. A pinch-zoomed page and an iOS page
 * with the on-screen keyboard up both show less than `innerHeight`, and an
 * overlay sized to the layout viewport is cut off behind the keyboard.
 */
function visibleViewport(view: Window): Box {
  const visual = view.visualViewport;
  if (visual !== null && visual !== undefined) {
    return {
      top: visual.offsetTop,
      left: visual.offsetLeft,
      width: visual.width,
      height: visual.height,
    };
  }
  return { top: 0, left: 0, width: view.innerWidth, height: view.innerHeight };
}

/** A computed value that is set, which happy-dom reports as "" rather than "none". */
function isSet(value: string | undefined): boolean {
  return value !== undefined && value !== "" && value !== "none";
}

function establishesContainingBlock(style: CSSStyleDeclaration): boolean {
  const backdrop = (style as CSSStyleDeclaration & { webkitBackdropFilter?: string })
    .webkitBackdropFilter;
  return (
    (style.position !== "" && style.position !== "static") ||
    isSet(style.transform) ||
    /transform|perspective/.test(style.willChange) ||
    isSet(style.filter) ||
    style.contain === "paint" ||
    isSet(style.backdropFilter) ||
    isSet(backdrop)
  );
}

/**
 * The element an absolutely positioned overlay is placed relative to, or
 * `null` for the initial containing block.
 *
 * An overlay portalled into a container of the page's own (a transformed
 * shell, a `position: relative` panel) is offset from THAT box, so page
 * coordinates put it wherever the container happens to sit away from the
 * page's origin.
 */
function containingBlock(element: Element): Element | null {
  const view = ownerWindow(element);
  const doc = ownerDocument(element);
  let node = element.parentElement;
  while (node !== null && node !== doc.documentElement) {
    if (establishesContainingBlock(view.getComputedStyle(node))) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Place an overlay next to its trigger.
 *
 * The order is: try the requested side; flip to the opposite side if it does
 * not fit, flipping is allowed and the opposite side has more room; then shift
 * along the cross axis to stay inside the boundary; then cap the height to
 * what is left. Shifting after
 * flipping rather than instead of it is what keeps a popover pointing at its
 * trigger rather than sliding across the screen.
 */
export function overlayPosition(options: PositionOptions): PositionResult {
  const [position, setPosition] = createSignal<{
    top: number;
    left: number;
    maxHeight: number;
    maxWidth: number;
    targetWidth: number;
    targetHeight: number;
    originX: number;
    originY: number;
  }>({
    top: 0,
    left: 0,
    maxHeight: Number.POSITIVE_INFINITY,
    maxWidth: Number.POSITIVE_INFINITY,
    targetWidth: 0,
    targetHeight: 0,
    originX: 0,
    originY: 0,
  });
  const [arrowOffset, setArrowOffset] = createSignal<number | undefined>(undefined);
  const [resolvedAxis, setResolvedAxis] = createSignal<Axis>("bottom");

  const update = (): void => {
    const target = access(options.targetRef) ?? null;
    const rect = access(options.targetRect) ?? null;
    const element = access(options.overlayRef) as Element | null;
    if (element === null || access(options.isOpen) === false) return;
    const targetBox = rect ?? (target === null ? null : boxOf(target));
    if (targetBox === null) return;

    const boundaryElement = access(options.boundaryRef ?? undefined) as Element | null;
    const view = ownerWindow(element);
    const viewport = visibleViewport(view);
    const boundary: Box =
      boundaryElement !== null && boundaryElement !== undefined ? boxOf(boundaryElement) : viewport;

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

    // Flip only on the MAIN axis, and to whichever side has more room. Whether
    // the overlay also overhangs sideways is the cross-axis shift's business,
    // and an overlay that fits neither side still belongs on the larger one,
    // where the height cap below costs it least.
    if (access(options.shouldFlip) !== false) {
      const size = axis === "top" || axis === "bottom" ? overlayBox.height : overlayBox.width;
      const room = spaceOn(axis, targetBox, boundary, offset, padding);
      if (size > room && spaceOn(OPPOSITE[axis], targetBox, boundary, offset, padding) > room) {
        axis = OPPOSITE[axis];
      }
    }

    // What the height may grow to, inside both the boundary and what is
    // visible of the page.
    const visibleTop = Math.max(boundary.top, viewport.top);
    const visibleBottom = Math.min(boundary.top + boundary.height, viewport.top + viewport.height);

    // An arrow is measured by its layout box too: it is usually a rotated
    // square, and `getBoundingClientRect` reports the box the rotation sweeps
    // out, wider than the arrow itself.
    const arrow = access(options.arrowRef ?? undefined) as Element | null;
    const arrowBox = arrow === null || arrow === undefined ? null : layoutSize(arrow);
    const vertical = axis === "top" || axis === "bottom";
    const arrowSize = arrowBox === null ? 0 : vertical ? arrowBox.width : arrowBox.height;
    const arrowEdge = access(options.arrowBoundaryOffset) ?? 0;

    // Shift along the cross axis, never the main one: moving along the main
    // axis would detach the overlay from its trigger. An overlay with an arrow
    // first keeps enough of itself over the trigger for the arrow to point at
    // it, however far a cross offset asked it to go.
    const shift = (at: { top: number; left: number }, height: number): void => {
      if (vertical) {
        if (arrowSize > 0) {
          at.left = clamp(
            at.left,
            targetBox.left - overlayBox.width + arrowSize + arrowEdge,
            targetBox.left + targetBox.width - arrowSize - arrowEdge,
          );
        }
        at.left += shiftInto(
          at.left,
          overlayBox.width,
          boundary.left + padding,
          boundary.left + boundary.width - padding,
        );
      } else {
        if (arrowSize > 0) {
          at.top = clamp(
            at.top,
            targetBox.top - height + arrowSize + arrowEdge,
            targetBox.top + targetBox.height - arrowSize - arrowEdge,
          );
        }
        at.top += shiftInto(
          at.top,
          height,
          boundary.top + padding,
          boundary.top + boundary.height - padding,
        );
      }
    };

    let placed = place(targetBox, overlayBox, axis, align, offset, cross);
    shift(placed, overlayBox.height);

    const maxHeight =
      axis === "top"
        ? targetBox.top - offset - visibleTop - padding
        : axis === "bottom"
          ? visibleBottom - padding - (targetBox.top + targetBox.height + offset)
          : align === "bottom" || align === "end"
            ? placed.top + overlayBox.height - visibleTop - padding
            : visibleBottom - padding - placed.top;

    // Placed again at the height it will have once capped. An overlay above
    // its trigger is positioned by its top edge, and it is the capped height
    // that puts its bottom edge against the trigger.
    const height = Math.min(overlayBox.height, Math.max(0, maxHeight));
    placed = place(targetBox, { width: overlayBox.width, height }, axis, align, offset, cross);
    shift(placed, height);

    // The same question along the other axis. A menu placed to the RIGHT has
    // the space between its trigger and the boundary edge to grow into, and a
    // popup asked to fill the available width has no other way to know it: the
    // overlay is portalled to the body, so a percentage resolves against the
    // page rather than against anything to do with the trigger.
    const maxWidth =
      axis === "left"
        ? targetBox.left - offset - boundary.left - padding
        : axis === "right"
          ? boundary.left + boundary.width - padding - (targetBox.left + targetBox.width + offset)
          : boundary.width - padding * 2;

    // Where the overlay grows FROM: the point on its own edge nearest the
    // trigger, so a scale animation appears to come out of the control that
    // opened it rather than out of the overlay's own middle. After a cross-axis
    // shift the two are no longer aligned, which is why this is measured from
    // the trigger's centre and not from the overlay's.
    const originX =
      axis === "right"
        ? 0
        : axis === "left"
          ? overlayBox.width
          : clamp(targetBox.left + targetBox.width / 2 - placed.left, 0, overlayBox.width);
    const originY =
      axis === "bottom"
        ? 0
        : axis === "top"
          ? height
          : clamp(targetBox.top + targetBox.height / 2 - placed.top, 0, height);

    // Everything so far is in client coordinates. Relative to the page, the
    // scroll offset is part of the answer; relative to a containing block of
    // the page's own, that block's box and its scroll are.
    const container = containingBlock(element);
    let originTop = -view.scrollY;
    let originLeft = -view.scrollX;
    if (container !== null) {
      const containerBox = container.getBoundingClientRect();
      const style = view.getComputedStyle(container);
      originTop =
        containerBox.top + (Number.parseFloat(style.borderTopWidth) || 0) - container.scrollTop;
      originLeft =
        containerBox.left + (Number.parseFloat(style.borderLeftWidth) || 0) - container.scrollLeft;
    }

    setPosition({
      top: placed.top - originTop,
      left: placed.left - originLeft,
      maxHeight: Math.max(0, maxHeight),
      maxWidth: Math.max(0, maxWidth),
      targetWidth: targetBox.width,
      targetHeight: targetBox.height,
      originX,
      originY,
    });
    setResolvedAxis(axis);

    if (arrowBox !== null) {
      // Centred on the TARGET, not on the overlay: after a shift the two are
      // no longer aligned, and the arrow has to keep pointing at the trigger.
      // Kept over the trigger, then inside the overlay clear of its ends.
      const from = vertical ? targetBox.left - placed.left : targetBox.top - placed.top;
      const along = vertical ? targetBox.width : targetBox.height;
      const extent = vertical ? overlayBox.width : height;
      const centre = clamp(
        clamp(from + along / 2, from + arrowSize / 2, from + along - arrowSize / 2),
        arrowSize / 2 + arrowEdge,
        extent - arrowSize / 2 - arrowEdge,
      );
      setArrowOffset(centre - arrowSize / 2);
    }
  };

  if (!isServer) {
    const onChange = (): void => update();
    const whileOpen = (ref: ElementRef): Element | null =>
      access(options.isOpen) === false ? null : (access(ref) as Element | null);

    // The FIRST measurement is taken the moment the ref resolves, which is
    // before the browser has laid the overlay out: a popover measured 275px
    // wide, was centred on that, and then rendered at 288px, sitting 7px off
    // its trigger until something else forced a resize. Observing both boxes
    // re-places it once the real sizes exist, and again whenever the content
    // grows.
    resizeObserver(() => whileOpen(options.targetRef), onChange);
    resizeObserver(() => whileOpen(options.overlayRef), onChange);

    followOpen(
      // Everything the placement is computed from, so it is recomputed when the
      // refs resolve and whenever one of the answers changes. A fresh array
      // each time: any of them moving is a reason to place again.
      () =>
        access(options.isOpen) === false
          ? null
          : [
              access(options.targetRef),
              access(options.targetRect),
              access(options.overlayRef),
              access(options.boundaryRef ?? undefined),
              access(options.arrowRef ?? undefined),
              access(options.arrowBoundaryOffset),
              access(options.placement),
              access(options.offset),
              access(options.crossOffset),
              access(options.shouldFlip),
              access(options.containerPadding),
              access(options.direction),
            ],
      (measured) => {
        if (measured === null) return undefined;
        update();

        const view = window;
        view.addEventListener("resize", onChange);
        view.addEventListener("scroll", onChange, true);

        return () => {
          view.removeEventListener("resize", onChange);
          view.removeEventListener("scroll", onChange, true);
        };
      },
    );
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
          // On the POSITIONER, which is the positioned element. A popup's own
          // `z-index` does nothing, because the popup is static — so an overlay
          // portalled to the body painted in document order and lost to any
          // page chrome that had a stacking context of its own. Measured on the
          // gallery: a picker's menu opened underneath the card that owns it.
          // 50 is what Radix and Base UI both put on theirs.
          zIndex: 50,
          maxHeight: Number.isFinite(current.maxHeight) ? `${current.maxHeight}px` : undefined,
          // What the trigger measures, for an overlay that wants to match it.
          // A listbox under a combobox is the case: `width: 100%` resolves
          // against the PORTAL container, which is the body, so a popover asked
          // to be as wide as its trigger came out as wide as the page.
          "--barq-trigger-width": `${current.targetWidth}px`,
          "--barq-trigger-height": `${current.targetHeight}px`,
          // And what the overlay has to grow into, for one that sizes itself
          // rather than its trigger. `max-height` above is the same number,
          // applied; this is the number, for a rule that wants to compute with
          // it — `w-[calc(var(--available-width)-1.5rem)]` is shadcn's.
          //
          // Left UNSET until there is a measurement rather than defaulted to
          // something plausible: an undefined `var()` makes the declaration
          // invalid at computed-value time, so the rule reading it falls back
          // to `width: auto`, which is what an unmeasured overlay should be. A
          // stand-in number would size it wrongly and look deliberate.
          ...(Number.isFinite(current.maxWidth)
            ? { "--barq-available-width": `${current.maxWidth}px` }
            : {}),
          ...(Number.isFinite(current.maxHeight)
            ? { "--barq-available-height": `${current.maxHeight}px` }
            : {}),
          "--barq-transform-origin": `${current.originX}px ${current.originY}px`,
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
  /** Nothing outside is hidden from assistive technology, and it is not marked modal. */
  isNonModal?: MaybeAccessor<boolean | undefined>;
  /**
   * Still animating in. The rest of the page is hidden only once it has
   * arrived: moving a screen reader's cursor into a modal that is still sliding
   * in scrolls, and on iOS that interrupts the animation. Until then the modal
   * is only kept visible inside whatever is already hiding the page.
   *
   * Moving focus in waits for the same moment, and is the caller's: a focus
   * scope's `autoFocus`.
   *
   * @default false
   */
  isEntering?: MaybeAccessor<boolean | undefined>;
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

  followOpen(
    () =>
      state.isOpen() && access(options.isNonModal) !== true
        ? ([(access(ref) as Element | null) ?? null, access(options.isEntering) === true] as const)
        : null,
    (open) => {
      if (open === null || open[0] === null) return undefined;
      const [element, isEntering] = open;
      return isEntering ? keepVisible(element) : ariaHideOutside([element]);
    },
  );

  return {
    modalProps: { "data-barq-modal": () => access(options.isNonModal) !== true || undefined },
    overlayProps,
    underlayProps,
  };
}

const overlayStrings = new StringDictionary<"dismiss">({
  "ar-AE": { dismiss: "تجاهل" },
  "bg-BG": { dismiss: "Отхвърляне" },
  "cs-CZ": { dismiss: "Odstranit" },
  "da-DK": { dismiss: "Luk" },
  "de-DE": { dismiss: "Schließen" },
  "el-GR": { dismiss: "Απόρριψη" },
  "en-US": { dismiss: "Dismiss" },
  "es-ES": { dismiss: "Descartar" },
  "et-EE": { dismiss: "Lõpeta" },
  "fi-FI": { dismiss: "Hylkää" },
  "fr-FR": { dismiss: "Rejeter" },
  "he-IL": { dismiss: "התעלם" },
  "hr-HR": { dismiss: "Odbaci" },
  "hu-HU": { dismiss: "Elutasítás" },
  "it-IT": { dismiss: "Ignora" },
  "ja-JP": { dismiss: "閉じる" },
  "ko-KR": { dismiss: "무시" },
  "lt-LT": { dismiss: "Atmesti" },
  "lv-LV": { dismiss: "Nerādīt" },
  "nb-NO": { dismiss: "Lukk" },
  "nl-NL": { dismiss: "Negeren" },
  "pl-PL": { dismiss: "Zignoruj" },
  "pt-BR": { dismiss: "Descartar" },
  "pt-PT": { dismiss: "Dispensar" },
  "ro-RO": { dismiss: "Revocare" },
  "ru-RU": { dismiss: "Пропустить" },
  "sk-SK": { dismiss: "Zrušiť" },
  "sl-SI": { dismiss: "Opusti" },
  "sr-SP": { dismiss: "Odbaci" },
  "sv-SE": { dismiss: "Avvisa" },
  "tr-TR": { dismiss: "Kapat" },
  "uk-UA": { dismiss: "Скасувати" },
  "zh-CN": { dismiss: "取消" },
  "zh-TW": { dismiss: "關閉" },
});

/**
 * A button that closes the overlay, rendered at its end and visible only to a
 * screen reader.
 *
 * iOS VoiceOver has no way out of a popover otherwise: the user swipes to the
 * last element and the next swipe leaves the overlay without closing it.
 */
export function dismissButtonProps(onDismiss: () => void): DOMProps {
  const message = stringFormatter(overlayStrings);
  return {
    type: "button",
    tabIndex: -1,
    "aria-label": () => message().format("dismiss"),
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
