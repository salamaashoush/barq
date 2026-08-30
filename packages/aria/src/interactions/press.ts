/**
 * A press, across mouse, touch, pen, keyboard and screen reader.
 *
 * `onClick` is not this. A click fires for a keyboard activation on a `button`
 * and for nothing else, so a `div` with `role="button"` gets no keyboard
 * support; it fires after the pointer is released with no event for the press
 * beginning, so nothing can show a pressed state; it fires on a drag that
 * started elsewhere and ended over the element; and on touch it arrives up to
 * 300ms late, after the browser has decided the tap was not a double tap.
 *
 * What is here is the set of behaviours a native button has and a click
 * handler does not:
 *
 * - Enter and Space activate, with the platform's own rules about which one a
 *   link, a checkbox or a text field should ignore.
 * - The press ends when the pointer leaves and resumes when it returns, so a
 *   press begun by accident can be abandoned by sliding off.
 * - A press cancelled by a scroll, a drag or a `pointercancel` fires no press.
 * - Text selection is suppressed for the duration on the platforms that would
 *   otherwise start one.
 * - Focus can be kept where it is without `preventDefault()` cancelling the
 *   drag and selection behaviour that call would also cancel.
 */

import { type Accessor, effect, isServer, signal } from "@barqjs/core";
import { tryCleanup } from "@barqjs/primitives/utils";
import {
  contains,
  focusWithoutScrolling,
  ownerDocument,
  ownerWindow,
  targetElement,
} from "../dom.ts";
import { isMac } from "../platform.ts";
import { access, type DOMProps, type MaybeAccessor } from "../utils.ts";
import { isOpeningLink } from "./flags.ts";
import { globalListeners } from "./listeners.ts";
import { isVirtualClick, isVirtualPointerEvent, type PointerType } from "./modality.ts";
import { openLink } from "./open-link.ts";
import { preventFocus } from "./prevent-focus.ts";
import { disableTextSelection, restoreTextSelection } from "./text-selection.ts";

/** The element a hook needs, as a value or an accessor. */
export type ElementRef<T extends Element = Element> = MaybeAccessor<T | null | undefined>;

export interface PressEvent {
  type: "pressstart" | "pressend" | "pressup" | "press";
  /** What produced the press. */
  pointerType: PointerType;
  /** The element the press handler is bound to. */
  target: Element;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** Where the press landed, relative to the target's top-left corner. */
  x: number;
  y: number;
  /** The key, for a keyboard press. */
  key?: string | undefined;
  /**
   * Let the event keep bubbling.
   *
   * A press stops propagation by default, so a pressable row inside a
   * pressable list activates one of the two rather than both.
   */
  continuePropagation(): void;
}

interface EventLike {
  currentTarget: EventTarget | null;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  clientX?: number | undefined;
  clientY?: number | undefined;
  key?: string | undefined;
}

class Press implements PressEvent {
  type: PressEvent["type"];
  pointerType: PointerType;
  target: Element;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  x: number;
  y: number;
  key: string | undefined;
  #stopPropagation = true;

  constructor(
    type: PressEvent["type"],
    pointerType: PointerType,
    original: EventLike,
    target?: Element | null,
  ) {
    const element = (target ?? original.currentTarget) as Element | null;
    const rect = element?.getBoundingClientRect();
    let x = 0;
    let y = 0;
    if (rect !== undefined) {
      if (original.clientX !== undefined && original.clientY !== undefined) {
        x = original.clientX - rect.left;
        y = original.clientY - rect.top;
      } else {
        x = rect.width / 2;
        y = rect.height / 2;
      }
    }

    this.type = type;
    this.pointerType = pointerType;
    this.target = original.currentTarget as Element;
    this.shiftKey = original.shiftKey;
    this.metaKey = original.metaKey;
    this.ctrlKey = original.ctrlKey;
    this.altKey = original.altKey;
    this.x = x;
    this.y = y;
    this.key = original.key;
  }

  continuePropagation(): void {
    this.#stopPropagation = false;
  }

  get shouldStopPropagation(): boolean {
    return this.#stopPropagation;
  }
}

export interface PressOptions {
  /** The element the press is bound to. Needed only for the touch-action style. */
  ref?: ElementRef;
  /** Whether the press should be inert. */
  isDisabled?: MaybeAccessor<boolean | undefined>;
  /** Force the pressed state on, for a trigger whose overlay is open. */
  isPressed?: MaybeAccessor<boolean | undefined>;
  /** Keep focus where it is when the element is pressed. */
  preventFocusOnPress?: MaybeAccessor<boolean | undefined>;
  /**
   * End the press for good when the pointer leaves, rather than resuming it if
   * the pointer comes back.
   */
  shouldCancelOnPointerExit?: MaybeAccessor<boolean | undefined>;
  /** Allow the platform's own text selection during the press. */
  allowTextSelectionOnPress?: MaybeAccessor<boolean | undefined>;
  onPress?: (event: PressEvent) => void;
  onPressStart?: (event: PressEvent) => void;
  onPressEnd?: (event: PressEvent) => void;
  onPressUp?: (event: PressEvent) => void;
  onPressChange?: (isPressed: boolean) => void;
  /**
   * The native click, for interoperability.
   *
   * Fired for a real click and synthesised for a keyboard or touch activation,
   * which is what the platform does for a `button`.
   */
  onClick?: (event: MouseEvent) => void;
}

export interface PressResult {
  /** Props to spread on the pressable element. */
  pressProps: DOMProps;
  /** Whether the element is pressed right now. */
  isPressed: Accessor<boolean>;
}

interface PressState {
  isPressed: boolean;
  didFirePressStart: boolean;
  isTriggeringEvent: boolean;
  activePointerId: number | null;
  target: Element | null;
  isOverTarget: boolean;
  pointerType: PointerType | null;
  metaKeyEvents: Map<string, KeyboardEvent> | undefined;
  disposables: (() => void)[];
}

const LINK_CLICKED = Symbol.for("barq.aria.linkClicked");
const PRESSABLE_ATTRIBUTE = "data-barq-pressable";
const STYLE_ID = "barq-aria-pressable-style";

const NON_TEXT_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "range",
  "color",
  "file",
  "image",
  "button",
  "submit",
  "reset",
]);

function isAnchorLink(target: Element): target is HTMLAnchorElement {
  return target.tagName === "A" && target.hasAttribute("href");
}

function isValidInputKey(target: HTMLInputElement, key: string): boolean {
  // Space toggles a checkbox or radio. Enter submits the form instead.
  return target.type === "checkbox" || target.type === "radio"
    ? key === " "
    : NON_TEXT_INPUT_TYPES.has(target.type);
}

/**
 * Whether the key activates the element.
 *
 * Space and Enter, minus every case where the platform means something else
 * by them: a text field, a textarea, a contenteditable, and a link, which only
 * Enter activates.
 */
function isActivationKey(event: KeyboardEvent, currentTarget: Element): boolean {
  const { key, code } = event;
  const element = currentTarget as HTMLElement;
  const role = element.getAttribute("role");
  const view = ownerWindow(element);

  if (key !== "Enter" && key !== " " && key !== "Spacebar" && code !== "Space") return false;
  if (element instanceof view.HTMLInputElement && !isValidInputKey(element, key)) return false;
  if (element instanceof view.HTMLTextAreaElement) return false;
  if (element.isContentEditable) return false;
  if ((role === "link" || (!role && isAnchorLink(element))) && key !== "Enter") return false;
  return true;
}

function shouldPreventDefaultUp(target: Element): boolean {
  if (target instanceof HTMLInputElement) return false;
  if (target instanceof HTMLButtonElement)
    return target.type !== "submit" && target.type !== "reset";
  if (isAnchorLink(target)) return false;
  return true;
}

function shouldPreventDefaultKeyboard(target: Element, key: string): boolean {
  // Control-Enter opens the context menu on macOS.
  if (isMac() && key === "Enter") return false;

  if (target instanceof HTMLInputElement) {
    // Enter on a checkbox or radio submits the form; it must not also toggle.
    if (key === "Enter" && (target.type === "checkbox" || target.type === "radio")) return false;
    return !isValidInputKey(target, key);
  }

  return shouldPreventDefaultUp(target);
}

interface Rect {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function touchRect(touch: Touch): Rect {
  const offsetX = touch.radiusX ?? 0;
  const offsetY = touch.radiusY ?? 0;
  return {
    top: touch.clientY - offsetY,
    right: touch.clientX + offsetX,
    bottom: touch.clientY + offsetY,
    left: touch.clientX - offsetX,
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  if (a.left > b.right || b.left > a.right) return false;
  if (a.top > b.bottom || b.top > a.bottom) return false;
  return true;
}

function isOverTarget(touch: Touch, target: Element): boolean {
  return overlaps(target.getBoundingClientRect(), touchRect(touch));
}

function touchById(event: TouchEvent, pointerId: number | null): Touch | null {
  for (let i = 0; i < event.changedTouches.length; i++) {
    const touch = event.changedTouches[i];
    if (touch !== undefined && touch.identifier === pointerId) return touch;
  }
  return null;
}

function fromTouchEvent(target: Element, event: TouchEvent): EventLike {
  const touch = event.targetTouches.length === 1 ? event.targetTouches[0] : undefined;
  return {
    currentTarget: target,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    clientX: touch?.clientX ?? 0,
    clientY: touch?.clientY ?? 0,
  };
}

function retarget(target: Element, event: EventLike): EventLike {
  return {
    currentTarget: target,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    clientX: event.clientX,
    clientY: event.clientY,
    key: event.key,
  };
}

/**
 * The stylesheet that keeps a double tap from waiting 300ms for a zoom.
 *
 * `touch-action: manipulation` is supposed to be equivalent, but in WebKit it
 * stops `pointercancel` firing on scroll, which is how a press knows it was
 * abandoned.
 */
function installPressableStyle(doc: Document): void {
  if (doc.head === null || doc.getElementById(STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  const nonce = doc.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')?.content;
  if (nonce !== undefined && nonce !== "") style.nonce = nonce;
  style.textContent = `@layer{[${PRESSABLE_ATTRIBUTE}]{touch-action:pan-x pan-y pinch-zoom}}`;
  doc.head.prepend(style);
}

/**
 * Press handling for one element.
 *
 * ```tsx
 * const { pressProps, isPressed } = press({ onPress: () => count.update((n) => n + 1) });
 * <div {...pressProps} role="button" tabIndex={0} data-pressed={isPressed} />
 * ```
 */
export function press(options: PressOptions): PressResult {
  const pressed = signal(false);
  const listeners = globalListeners();

  const state: PressState = {
    isPressed: false,
    didFirePressStart: false,
    isTriggeringEvent: false,
    activePointerId: null,
    target: null,
    isOverTarget: false,
    pointerType: null,
    metaKeyEvents: undefined,
    disposables: [],
  };

  const isDisabled = (): boolean => access(options.isDisabled) === true;
  const allowTextSelection = (): boolean => access(options.allowTextSelectionOnPress) === true;

  const triggerPressStart = (original: EventLike, pointerType: PointerType): boolean => {
    if (isDisabled() || state.didFirePressStart) return false;

    let stopPropagation = true;
    state.isTriggeringEvent = true;
    if (options.onPressStart !== undefined) {
      const event = new Press("pressstart", pointerType, original);
      options.onPressStart(event);
      stopPropagation = event.shouldStopPropagation;
    }
    options.onPressChange?.(true);

    state.isTriggeringEvent = false;
    state.didFirePressStart = true;
    pressed.set(true);
    return stopPropagation;
  };

  const triggerPressEnd = (
    original: EventLike,
    pointerType: PointerType,
    wasPressed = true,
  ): boolean => {
    if (!state.didFirePressStart) return false;

    state.didFirePressStart = false;
    state.isTriggeringEvent = true;

    let stopPropagation = true;
    if (options.onPressEnd !== undefined) {
      const event = new Press("pressend", pointerType, original);
      options.onPressEnd(event);
      stopPropagation = event.shouldStopPropagation;
    }
    options.onPressChange?.(false);
    pressed.set(false);

    if (options.onPress !== undefined && wasPressed && !isDisabled()) {
      const event = new Press("press", pointerType, original);
      options.onPress(event);
      stopPropagation &&= event.shouldStopPropagation;
    }

    state.isTriggeringEvent = false;
    return stopPropagation;
  };

  const triggerPressUp = (original: EventLike, pointerType: PointerType): boolean => {
    if (isDisabled()) return false;
    if (options.onPressUp === undefined) return true;

    state.isTriggeringEvent = true;
    const event = new Press("pressup", pointerType, original);
    options.onPressUp(event);
    state.isTriggeringEvent = false;
    return event.shouldStopPropagation;
  };

  const cancel = (original: EventLike): void => {
    if (!state.isPressed || state.target === null) return;

    if (state.didFirePressStart && state.pointerType !== null) {
      triggerPressEnd(retarget(state.target, original), state.pointerType, false);
    }
    state.isPressed = false;
    state.isOverTarget = false;
    state.activePointerId = null;
    state.pointerType = null;
    listeners.removeAll();
    if (!allowTextSelection()) restoreTextSelection(state.target);
    for (const dispose of state.disposables) dispose();
    state.disposables = [];
  };

  const cancelOnPointerExit = (original: EventLike): void => {
    if (access(options.shouldCancelOnPointerExit) === true) cancel(original);
  };

  const triggerClick = (event: MouseEvent): void => {
    if (isDisabled()) return;
    options.onClick?.(event);
  };

  /**
   * The click a keyboard or touch activation would have produced.
   *
   * The platform fires one for a `button` activated by Enter, and third-party
   * code passing `onClick` rather than `onPress` has no other way to hear it.
   */
  const triggerSyntheticClick = (source: Event, target: Element): void => {
    if (isDisabled() || options.onClick === undefined) return;
    const event = new MouseEvent("click", source);
    Object.defineProperty(event, "target", { value: target });
    Object.defineProperty(event, "currentTarget", { value: target });
    options.onClick(event);
  };

  // ---------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------

  const onKeyUp = (event: KeyboardEvent): void => {
    if (state.isPressed && state.target !== null && isActivationKey(event, state.target)) {
      const target = targetElement(event);
      if (shouldPreventDefaultKeyboard(target ?? state.target, event.key)) event.preventDefault();

      const wasPressed = contains(state.target, target);
      triggerPressEnd(retarget(state.target, event), "keyboard", wasPressed);
      if (wasPressed) triggerSyntheticClick(event, state.target);
      listeners.removeAll();

      // A key other than Enter on an element whose role is `link` means the
      // browser will not follow it, so this has to.
      const marked = event as KeyboardEvent & { [LINK_CLICKED]?: boolean };
      if (
        event.key !== "Enter" &&
        isAnchorLink(state.target) &&
        contains(state.target, target) &&
        marked[LINK_CLICKED] !== true
      ) {
        // Marked on the event, so two press hooks on one element open it once.
        marked[LINK_CLICKED] = true;
        openLink(state.target, event, false);
      }

      state.isPressed = false;
      state.metaKeyEvents?.delete(event.key);
      return;
    }

    if (event.key === "Meta" && state.metaKeyEvents !== undefined && state.metaKeyEvents.size > 0) {
      // macOS fires no keyup while Meta is held. When Meta itself is released,
      // act as though every key recorded since had been released too.
      const recorded = state.metaKeyEvents;
      state.metaKeyEvents = undefined;
      for (const recordedEvent of recorded.values()) {
        state.target?.dispatchEvent(new KeyboardEvent("keyup", recordedEvent));
      }
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const currentTarget = event.currentTarget as Element | null;
    if (currentTarget === null) return;

    if (!isActivationKey(event, currentTarget) || !contains(currentTarget, targetElement(event))) {
      if (event.key === "Meta") state.metaKeyEvents = new Map();
      return;
    }

    if (shouldPreventDefaultKeyboard(targetElement(event) ?? currentTarget, event.key)) {
      event.preventDefault();
    }

    // A repeat may have begun on another element that then lost focus. Only
    // the first keydown starts a press.
    let stopPropagation = true;
    if (!state.isPressed && !event.repeat) {
      state.target = currentTarget;
      state.isPressed = true;
      state.pointerType = "keyboard";
      stopPropagation = triggerPressStart(event, "keyboard");
    }

    // On the document, capturing: focus may move before the key is released,
    // and a child's own keyboard handler may stop propagation before this
    // element would have heard it.
    const origin = currentTarget;
    const pressUp = (keyUp: Event): void => {
      const keyboardEvent = keyUp as KeyboardEvent;
      if (
        isActivationKey(keyboardEvent, origin) &&
        !keyboardEvent.repeat &&
        contains(origin, targetElement(keyboardEvent)) &&
        state.target !== null
      ) {
        triggerPressUp(retarget(state.target, keyboardEvent), "keyboard");
      }
      onKeyUp(keyboardEvent);
    };

    listeners.add(ownerDocument(currentTarget), "keyup", pressUp, true);

    if (stopPropagation) event.stopPropagation();

    if (event.metaKey && isMac()) state.metaKeyEvents?.set(event.key, event);
  };

  // ---------------------------------------------------------------------
  // Click
  // ---------------------------------------------------------------------

  const onClick = (event: MouseEvent): void => {
    const currentTarget = event.currentTarget as Element | null;
    if (currentTarget !== null && !contains(currentTarget, targetElement(event))) return;
    if (event.button !== 0 || state.isTriggeringEvent || isOpeningLink()) return;

    let stopPropagation = true;
    if (isDisabled()) event.preventDefault();

    if (!state.isPressed && (state.pointerType === "virtual" || isVirtualClick(event))) {
      // A screen reader, or `element.click()`. There was no pointer sequence,
      // so the whole press runs here.
      const start = triggerPressStart(event, "virtual");
      const up = triggerPressUp(event, "virtual");
      const end = triggerPressEnd(event, "virtual");
      triggerClick(event);
      stopPropagation = start && up && end;
    } else if (state.isPressed && state.pointerType !== "keyboard") {
      const pointerType =
        state.pointerType ?? ((event as PointerEvent).pointerType as PointerType) ?? "virtual";
      const target = (currentTarget ?? state.target) as Element;
      const up = triggerPressUp(retarget(target, event), pointerType);
      const end = triggerPressEnd(retarget(target, event), pointerType, true);
      stopPropagation = up && end;
      state.isOverTarget = false;
      triggerClick(event);
      cancel(event);
    }

    if (stopPropagation) event.stopPropagation();
  };

  // ---------------------------------------------------------------------
  // Pointer
  // ---------------------------------------------------------------------

  const onPointerUpGlobal = (event: Event): void => {
    const pointer = event as PointerEvent;
    if (
      pointer.pointerId !== state.activePointerId ||
      !state.isPressed ||
      pointer.button !== 0 ||
      state.target === null
    ) {
      return;
    }

    if (contains(state.target, targetElement(pointer)) && state.pointerType !== null) {
      // The press fires from the click, not from here: the DOM may be mutated
      // between the two, and third-party code listens for click.
      //
      // iOS and Android fire neither focus nor click after a long press, so a
      // click is synthesised after a delay if the real one has not arrived.
      // 32ms is the floor: WebKit on iOS delays the click on elements without
      // certain roles, to emulate hover.
      let clicked = false;
      const timeout = setTimeout(() => {
        if (!state.isPressed || !(state.target instanceof HTMLElement)) return;
        if (clicked) {
          cancel(pointer);
        } else {
          focusWithoutScrolling(state.target);
          state.target.click();
        }
      }, 80);

      // Capturing, because a handler in between may stop propagation.
      listeners.add(
        pointer.currentTarget as EventTarget,
        "click",
        () => {
          clicked = true;
        },
        true,
      );
      state.disposables.push(() => clearTimeout(timeout));
    } else {
      cancel(pointer);
    }

    // Ignore the pointerleave iOS fires before the click.
    state.isOverTarget = false;
  };

  const onPointerCancelGlobal = (event: Event): void => {
    cancel(event as PointerEvent);
  };

  const onPointerDown = (event: PointerEvent): void => {
    const currentTarget = event.currentTarget as Element | null;
    if (event.button !== 0 || currentTarget === null) return;
    if (!contains(currentTarget, targetElement(event))) return;

    // iOS WebKit fires pointer events from VoiceOver with the wrong
    // coordinates and target. The click handler takes it instead.
    if (isVirtualPointerEvent(event)) {
      state.pointerType = "virtual";
      return;
    }

    state.pointerType = event.pointerType as PointerType;

    let stopPropagation = true;
    if (!state.isPressed) {
      state.isPressed = true;
      state.isOverTarget = true;
      state.activePointerId = event.pointerId;
      state.target = currentTarget;

      if (!allowTextSelection()) disableTextSelection(state.target);

      stopPropagation = triggerPressStart(event, state.pointerType);

      // Releasing capture is what lets a touch leave the original target, so
      // pointerenter and pointerleave fire at all.
      const target = targetElement(event);
      if (target !== null && "releasePointerCapture" in target) {
        if (!("hasPointerCapture" in target) || target.hasPointerCapture(event.pointerId)) {
          target.releasePointerCapture(event.pointerId);
        }
      }

      const doc = ownerDocument(currentTarget);
      listeners.add(doc, "pointerup", onPointerUpGlobal, false);
      listeners.add(doc, "pointercancel", onPointerCancelGlobal, false);
    }

    if (stopPropagation) event.stopPropagation();
  };

  const onMouseDown = (event: MouseEvent): void => {
    const currentTarget = event.currentTarget as Element | null;
    if (currentTarget === null || !contains(currentTarget, targetElement(event))) return;
    if (event.button !== 0) return;

    if (access(options.preventFocusOnPress) === true) {
      const dispose = preventFocus(targetElement(event));
      if (dispose !== undefined) state.disposables.push(dispose);
    }

    event.stopPropagation();
  };

  const onPointerUp = (event: PointerEvent): void => {
    const currentTarget = event.currentTarget as Element | null;
    if (currentTarget === null || !contains(currentTarget, targetElement(event))) return;
    // iOS reports a zero-sized pointerup, so the type recorded at pointerdown
    // is the one to trust.
    if (state.pointerType === "virtual") return;

    // While pressed, the press ends at the click instead.
    if (event.button === 0 && !state.isPressed) {
      triggerPressUp(event, state.pointerType ?? (event.pointerType as PointerType));
    }
  };

  const onPointerEnter = (event: PointerEvent): void => {
    if (
      event.pointerId === state.activePointerId &&
      state.target !== null &&
      !state.isOverTarget &&
      state.pointerType !== null
    ) {
      state.isOverTarget = true;
      triggerPressStart(retarget(state.target, event), state.pointerType);
    }
  };

  const onPointerLeave = (event: PointerEvent): void => {
    if (
      event.pointerId === state.activePointerId &&
      state.target !== null &&
      state.isOverTarget &&
      state.pointerType !== null
    ) {
      state.isOverTarget = false;
      triggerPressEnd(retarget(state.target, event), state.pointerType, false);
      cancelOnPointerExit(event);
    }
  };

  const onDragStart = (event: DragEvent): void => {
    const currentTarget = event.currentTarget as Element | null;
    if (currentTarget === null || !contains(currentTarget, targetElement(event))) return;
    // WebKit fires no pointercancel when a drag starts; the others do.
    cancel(event);
  };

  // ---------------------------------------------------------------------
  // Touch, for engines without pointer events
  // ---------------------------------------------------------------------

  const onScrollWhilePressed = (): void => {
    if (!state.isPressed || state.target === null) return;
    cancel({
      currentTarget: state.target,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    });
  };

  const onTouchStart = (event: TouchEvent): void => {
    const currentTarget = event.currentTarget as Element | null;
    if (currentTarget === null || !contains(currentTarget, targetElement(event))) return;

    const touch = event.targetTouches[0];
    if (touch === undefined) return;

    state.activePointerId = touch.identifier;
    state.isOverTarget = true;
    state.isPressed = true;
    state.target = currentTarget;
    state.pointerType = "touch";

    if (!allowTextSelection()) disableTextSelection(state.target);

    if (triggerPressStart(fromTouchEvent(state.target, event), "touch")) event.stopPropagation();
    listeners.add(ownerWindow(currentTarget), "scroll", onScrollWhilePressed, true);
  };

  const onTouchMove = (event: TouchEvent): void => {
    const currentTarget = event.currentTarget as Element | null;
    if (currentTarget === null || !contains(currentTarget, targetElement(event))) return;
    if (!state.isPressed) {
      event.stopPropagation();
      return;
    }

    const touch = touchById(event, state.activePointerId);
    let stopPropagation = true;
    if (touch !== null && isOverTarget(touch, currentTarget)) {
      if (!state.isOverTarget && state.pointerType !== null) {
        state.isOverTarget = true;
        stopPropagation = triggerPressStart(
          fromTouchEvent(state.target as Element, event),
          state.pointerType,
        );
      }
    } else if (state.isOverTarget && state.pointerType !== null) {
      state.isOverTarget = false;
      stopPropagation = triggerPressEnd(
        fromTouchEvent(state.target as Element, event),
        state.pointerType,
        false,
      );
      cancelOnPointerExit(fromTouchEvent(state.target as Element, event));
    }

    if (stopPropagation) event.stopPropagation();
  };

  const onTouchEnd = (event: TouchEvent): void => {
    const currentTarget = event.currentTarget as Element | null;
    if (currentTarget === null || !contains(currentTarget, targetElement(event))) return;
    if (!state.isPressed) {
      event.stopPropagation();
      return;
    }

    const touch = touchById(event, state.activePointerId);
    let stopPropagation = true;
    const target = state.target as Element;
    if (touch !== null && isOverTarget(touch, currentTarget) && state.pointerType !== null) {
      triggerPressUp(fromTouchEvent(target, event), state.pointerType);
      stopPropagation = triggerPressEnd(fromTouchEvent(target, event), state.pointerType);
      triggerSyntheticClick(event, target);
    } else if (state.isOverTarget && state.pointerType !== null) {
      stopPropagation = triggerPressEnd(fromTouchEvent(target, event), state.pointerType, false);
    }

    if (stopPropagation) event.stopPropagation();

    state.isPressed = false;
    state.activePointerId = null;
    state.isOverTarget = false;
    if (state.target !== null && !allowTextSelection()) restoreTextSelection(state.target);
    listeners.removeAll();
  };

  const onTouchCancel = (event: TouchEvent): void => {
    const currentTarget = event.currentTarget as Element | null;
    if (currentTarget === null || !contains(currentTarget, targetElement(event))) return;
    event.stopPropagation();
    if (state.isPressed) cancel(fromTouchEvent(state.target as Element, event));
  };

  // ---------------------------------------------------------------------

  // A press in flight when the element is disabled has to be abandoned, or the
  // pressed state sticks for as long as the element exists.
  effect(() => {
    if (isDisabled() && state.isPressed && state.target !== null) {
      cancel({
        currentTarget: state.target,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      });
    }
  });

  if (!isServer && options.ref !== undefined) {
    effect(() => {
      const element = access(options.ref);
      if (element === null || element === undefined) return;
      installPressableStyle(ownerDocument(element));
    });
  }

  tryCleanup(() => {
    if (!allowTextSelection()) restoreTextSelection(state.target);
    for (const dispose of state.disposables) dispose();
    state.disposables = [];
  });

  const pressProps: DOMProps = {
    [PRESSABLE_ATTRIBUTE]: true,
    onKeyDown,
    onClick,
  };

  if (typeof PointerEvent !== "undefined") {
    pressProps.onPointerDown = onPointerDown;
    pressProps.onMouseDown = onMouseDown;
    pressProps.onPointerUp = onPointerUp;
    pressProps.onPointerEnter = onPointerEnter;
    pressProps.onPointerLeave = onPointerLeave;
    pressProps.onDragStart = onDragStart;
  } else {
    pressProps.onMouseDown = onMouseDown;
    pressProps.onTouchStart = onTouchStart;
    pressProps.onTouchMove = onTouchMove;
    pressProps.onTouchEnd = onTouchEnd;
    pressProps.onTouchCancel = onTouchCancel;
    pressProps.onDragStart = onDragStart;
  }

  return {
    pressProps,
    isPressed: () => access(options.isPressed) === true || pressed(),
  };
}
