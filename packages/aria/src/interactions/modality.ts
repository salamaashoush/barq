/**
 * What the user is driving the page with, right now.
 *
 * `:focus-visible` answers a narrower question than a widget needs. It is a
 * per-element pseudo-class the engine decides, so a component cannot read it
 * to choose an ARIA attribute, cannot apply it to a wrapper that is not the
 * focused element, and gets no say in the one case the heuristic gets wrong:
 * a text input, where only Tab and Escape should raise a ring and every other
 * key should not.
 *
 * So the modality is tracked once for the page, from listeners installed on
 * the first call rather than at import, because this package declares
 * `sideEffects: false` and a module that installs listeners on evaluation
 * makes that a lie.
 */

import { type Accessor, isServer, signal } from "@barqjs/core";
import { activeElement, eventTarget, ownerDocument, ownerWindow } from "../dom.ts";
import { isAndroid, isMac } from "../platform.ts";
import { tryCleanup } from "@barqjs/primitives/utils";
import { isIgnoringFocus, isOpeningLink } from "./flags.ts";

/** How the user reached the element. */
export type Modality = "keyboard" | "pointer" | "virtual";

/** What produced the interaction. `virtual` is a screen reader or `.click()`. */
export type PointerType = "mouse" | "pen" | "touch" | "keyboard" | "virtual";

type ModalityEvent = PointerEvent | MouseEvent | KeyboardEvent | FocusEvent | null;

export type ModalityHandler = (modality: Modality, event: ModalityEvent) => void;

let currentModality: Modality | null = null;
let currentPointerType: PointerType = "keyboard";
const handlers = new Set<ModalityHandler>();
const trackedWindows = new Map<Window, { focus: (options?: FocusOptions) => void }>();

let hasEventBeforeFocus = false;
let hasBlurredWindowRecently = false;

// Only these two make a ring appear on a text input. Every other key is the
// user typing, and a ring that appears while typing is noise.
const TEXT_INPUT_FOCUS_KEYS = new Set(["Tab", "Escape"]);

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

function notify(next: Modality, event: ModalityEvent): void {
  for (const handler of handlers) handler(next, event);
}

/**
 * Whether the key could plausibly be a navigation the user wants a ring for.
 *
 * Control and Shift arrive on their own when the user tabs back into the
 * window from browser chrome, and a modifier held down is a shortcut rather
 * than navigation.
 */
function isModalityKey(event: KeyboardEvent): boolean {
  return !(
    event.metaKey ||
    (!isMac() && event.altKey) ||
    event.ctrlKey ||
    event.key === "Control" ||
    event.key === "Shift" ||
    event.key === "Meta"
  );
}

/**
 * Whether a click came from a keyboard, a screen reader, or `element.click()`.
 *
 * Every engine but one reports `detail === 0` only for such clicks. Android
 * TalkBack is the exception: its double tap arrives through a `click` listener
 * with a `pointerType` set, so the button mask is what separates it.
 */
export function isVirtualClick(event: MouseEvent | PointerEvent): boolean {
  // JAWS and NVDA under Firefox.
  if ((event as PointerEvent).pointerType === "" && event.isTrusted) return true;

  if (isAndroid() && Boolean((event as PointerEvent).pointerType)) {
    return event.type === "click" && event.buttons === 1;
  }

  return event.detail === 0 && !(event as PointerEvent).pointerType;
}

/**
 * Whether a pointer event was fabricated by a screen reader.
 *
 * A real pointer has a size. VoiceOver's has none, and TalkBack's double tap
 * reports a one-pixel `mouse` pointer at zero pressure.
 */
export function isVirtualPointerEvent(event: PointerEvent): boolean {
  const android = isAndroid();
  return (
    (!android && event.width === 0 && event.height === 0) ||
    (android &&
      event.width === 1 &&
      event.height === 1 &&
      event.pressure === 0 &&
      event.detail === 0 &&
      event.pointerType === "mouse")
  );
}

function onKeyboardEvent(event: Event): void {
  hasEventBeforeFocus = true;
  if (!isOpeningLink() && isModalityKey(event as KeyboardEvent)) {
    currentModality = "keyboard";
    currentPointerType = "keyboard";
    notify("keyboard", event as KeyboardEvent);
  }
}

function onPointerEvent(event: Event): void {
  const pointer = event as PointerEvent;
  currentModality = "pointer";
  currentPointerType = "pointerType" in pointer ? (pointer.pointerType as PointerType) : "mouse";
  if (event.type === "mousedown" || event.type === "pointerdown") {
    hasEventBeforeFocus = true;
    notify("pointer", pointer);
  }
}

function onClickEvent(event: Event): void {
  if (!isOpeningLink() && isVirtualClick(event as MouseEvent)) {
    hasEventBeforeFocus = true;
    currentModality = "virtual";
    currentPointerType = "virtual";
  }
}

function onFocusEvent(event: Event): void {
  if (isIgnoringFocus()) return;

  const target = eventTarget(event);
  const view = ownerWindow(target);
  const doc = ownerDocument(target);

  // Returning to the tab restores focus to where it was, firing a focus event
  // nobody initiated. `hasBlurredWindowRecently` keeps that from reading as
  // virtual modality, but WebKit fires the window/element pair twice and the
  // first element focus clears the flag, so re-arm it on the window's own.
  if ((target as unknown) === view) {
    hasBlurredWindowRecently = true;
    return;
  }

  // Firefox fires two extra focus events, on the window then the document,
  // when the user first clicks into an iframe.
  if ((target as unknown) === doc || !event.isTrusted) return;

  // A focus with no keyboard or pointer event before it is a virtual cursor:
  // the next/previous buttons above the iOS keyboard, or a screen reader.
  if (!hasEventBeforeFocus && !hasBlurredWindowRecently) {
    currentModality = "virtual";
    currentPointerType = "virtual";
    notify("virtual", event as FocusEvent);
  }

  hasEventBeforeFocus = false;
  hasBlurredWindowRecently = false;
}

function onWindowBlur(): void {
  if (isIgnoringFocus()) return;
  // Tabbing out of the window fires no subsequent focus event, so the state
  // has to be reset here or the next focus reads as virtual.
  hasEventBeforeFocus = false;
  hasBlurredWindowRecently = true;
}

/**
 * Install the page-level listeners, once per window.
 *
 * Called by every hook that reads the modality rather than at import time.
 * Idempotent, and cheap after the first call.
 */
export function trackModality(element?: Element | null): () => void {
  if (isServer || typeof window === "undefined") return () => {};

  const doc = ownerDocument(element);
  const setup = (): void => {
    setupModalityListeners(element);
  };

  if (doc.readyState !== "loading") {
    setup();
    return () => untrackModality(element);
  }

  doc.addEventListener("DOMContentLoaded", setup);
  return () => {
    doc.removeEventListener("DOMContentLoaded", setup);
    untrackModality(element);
  };
}

function setupModalityListeners(element?: Element | null): void {
  const view = ownerWindow(element);
  const doc = ownerDocument(element);
  if (trackedWindows.has(view)) return;

  // A programmatic `focus()` must not change the modality, but a focus with no
  // preceding user event must be read as virtual. Telling the two apart needs
  // to know that `focus()` was called, and the prototype is the only place
  // that fact exists.
  //
  // `defineProperty` rather than assignment: `@testing-library/user-event`
  // instruments `focus` as a getter, and assigning to one throws.
  //
  // Capturing the unbound method is the point: `focusWithModality` re-applies
  // the `this` it was called on.
  // oxlint-disable-next-line typescript/unbound-method
  const original = view.HTMLElement.prototype.focus;
  Reflect.defineProperty(view.HTMLElement.prototype, "focus", {
    configurable: true,
    writable: true,
    value: function focusWithModality(this: HTMLElement, ...args: [FocusOptions?]): void {
      hasEventBeforeFocus = true;
      original.apply(this, args);
    },
  });

  doc.addEventListener("keydown", onKeyboardEvent, true);
  doc.addEventListener("keyup", onKeyboardEvent, true);
  doc.addEventListener("click", onClickEvent, true);

  // On the window, so these run before any listener bound to the document.
  view.addEventListener("focus", onFocusEvent, true);
  view.addEventListener("blur", onWindowBlur, false);

  if (typeof PointerEvent !== "undefined") {
    doc.addEventListener("pointerdown", onPointerEvent, true);
    doc.addEventListener("pointermove", onPointerEvent, true);
    doc.addEventListener("pointerup", onPointerEvent, true);
  } else {
    doc.addEventListener("mousedown", onPointerEvent, true);
    doc.addEventListener("mousemove", onPointerEvent, true);
    doc.addEventListener("mouseup", onPointerEvent, true);
  }

  trackedWindows.set(view, { focus: original });
}

/** Undo {@link trackModality} for a window, including the prototype patch. */
export function untrackModality(element?: Element | null): void {
  if (typeof window === "undefined") return;
  const view = ownerWindow(element);
  const doc = ownerDocument(element);
  const tracked = trackedWindows.get(view);
  if (tracked === undefined) return;

  Reflect.defineProperty(view.HTMLElement.prototype, "focus", {
    configurable: true,
    writable: true,
    value: tracked.focus,
  });

  doc.removeEventListener("keydown", onKeyboardEvent, true);
  doc.removeEventListener("keyup", onKeyboardEvent, true);
  doc.removeEventListener("click", onClickEvent, true);
  view.removeEventListener("focus", onFocusEvent, true);
  view.removeEventListener("blur", onWindowBlur, false);

  if (typeof PointerEvent !== "undefined") {
    doc.removeEventListener("pointerdown", onPointerEvent, true);
    doc.removeEventListener("pointermove", onPointerEvent, true);
    doc.removeEventListener("pointerup", onPointerEvent, true);
  } else {
    doc.removeEventListener("mousedown", onPointerEvent, true);
    doc.removeEventListener("mousemove", onPointerEvent, true);
    doc.removeEventListener("mouseup", onPointerEvent, true);
  }

  trackedWindows.delete(view);
}

/** Whether a focus ring should be shown for whatever takes focus next. */
export function isFocusVisible(): boolean {
  return currentModality !== "pointer";
}

/** The last modality observed, or `null` before the user has done anything. */
export function getInteractionModality(): Modality | null {
  return currentModality;
}

/**
 * Declare the modality, as if the user had produced it.
 *
 * For a component that moves focus itself and knows why: a menu opened from a
 * keyboard shortcut must show its ring even though no key reached the menu.
 */
export function setInteractionModality(next: Modality): void {
  currentModality = next;
  currentPointerType = next === "pointer" ? "mouse" : next;
  notify(next, null);
}

/** The last pointer type observed. */
export function getPointerType(): PointerType {
  return currentPointerType;
}

/**
 * Subscribe to modality changes. Returns the unsubscribe.
 *
 * `isTextInput` narrows to the two keys that should raise a ring on a field.
 */
export function onModalityChange(
  fn: ModalityHandler,
  options: { isTextInput?: boolean } = {},
): () => void {
  const handler: ModalityHandler = (next, event) => {
    if (!shouldReportKeyboardFocus(options.isTextInput === true, next, event)) return;
    fn(next, event);
  };
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

function shouldReportKeyboardFocus(
  isTextInput: boolean,
  next: Modality,
  event: ModalityEvent,
): boolean {
  const target = event !== null ? (eventTarget(event) as Element | null) : null;
  const doc = ownerDocument(target);
  const view = ownerWindow(target);
  const active = activeElement(doc);

  // The caller passes `isTextInput` for the case the DOM cannot answer: a key
  // pressed on a button that is about to move focus INTO a field, where the
  // active element at this moment is still the button.
  const intoText =
    isTextInput ||
    (active instanceof view.HTMLInputElement && !NON_TEXT_INPUT_TYPES.has(active.type)) ||
    active instanceof view.HTMLTextAreaElement ||
    (active instanceof view.HTMLElement && active.isContentEditable);

  return !(
    intoText &&
    next === "keyboard" &&
    event instanceof view.KeyboardEvent &&
    !TEXT_INPUT_FOCUS_KEYS.has(event.key)
  );
}

/**
 * The current modality, as a signal.
 *
 * ```tsx
 * const how = modality();
 * <div data-modality={how} />
 * ```
 */
export function modality(): Accessor<Modality | null> {
  const current = signal(currentModality);
  if (isServer) return current;

  trackModality();
  tryCleanup(onModalityChange(() => current.set(currentModality)));

  return current;
}

/**
 * Whether a focus ring should be visible for the page, as a signal.
 *
 * This is the global answer. A component wants {@link focusRing} in
 * `../focus.ts`, which combines it with whether the element is focused at all.
 */
export function focusVisible(
  options: { isTextInput?: boolean; autoFocus?: boolean } = {},
): Accessor<boolean> {
  const current = signal(options.autoFocus === true || isFocusVisible());
  if (isServer) return current;

  trackModality();
  tryCleanup(
    onModalityChange(() => current.set(isFocusVisible()), { isTextInput: options.isTextInput }),
  );

  return current;
}
