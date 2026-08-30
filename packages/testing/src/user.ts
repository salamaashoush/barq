/**
 * What a user does, as the events a browser would actually fire.
 *
 * `fireEvent.click(button)` dispatches one `click`. A real click dispatches
 * eleven events, and an accessible widget listens to most of them: it starts a
 * press on `pointerdown`, takes focus on `mousedown`, ends the press on the
 * `click`, and cancels the whole thing on a `pointercancel` in between. A
 * component tested with a single synthetic `click` is a component whose press
 * handling was never exercised.
 *
 * The sequences below follow the pointer events specification and what the
 * engines do around it, including the parts that are not in it: focus moving
 * on `mousedown` and being cancellable with `preventDefault`, `detail`
 * counting clicks, `buttons` being a mask rather than a button number, and a
 * screen reader's click carrying `detail: 0` and no pointer type at all.
 *
 * Every call flushes barq's queue, so an assertion straight after one sees the
 * DOM the interaction produced.
 */

import { flush } from "@barqjs/core";

const FOCUSABLE =
  "input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled])," +
  "button:not([disabled]),a[href],area[href],summary,iframe,object,embed,audio[controls]," +
  'video[controls],[contenteditable]:not([contenteditable^="false"]),' +
  "[tabindex]:not([disabled])";

const TABBABLE =
  "input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled])," +
  "button:not([disabled]),a[href],area[href],summary,iframe,object,embed,audio[controls]," +
  'video[controls],[contenteditable]:not([contenteditable^="false"]),' +
  '[tabindex]:not([tabindex="-1"]):not([disabled])';

export interface PointerOptions {
  pointerType?: "mouse" | "pen" | "touch";
  pointerId?: number;
  button?: number;
  clientX?: number;
  clientY?: number;
  /** Modifier keys held for the duration. */
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  /** For a screen reader's pointer: zero-sized, zero-pressure. */
  virtual?: boolean;
}

interface Modifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

function modifiers(options: PointerOptions | KeyOptions = {}): Modifiers {
  return {
    shiftKey: options.shiftKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    altKey: options.altKey ?? false,
    metaKey: options.metaKey ?? false,
  };
}

function centreOf(element: Element): { clientX: number; clientY: number } {
  const rect = element.getBoundingClientRect();
  // happy-dom reports a zero rect for everything, so the centre of nothing is
  // the origin. A test asserting on coordinates must pass them explicitly.
  return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
}

function pointerInit(
  element: Element,
  options: PointerOptions,
  overrides: PointerEventInit,
): PointerEventInit {
  const centre = centreOf(element);
  const pointerType = options.pointerType ?? "mouse";
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: options.pointerId ?? (pointerType === "touch" ? 2 : 1),
    pointerType,
    isPrimary: true,
    // A screen reader's pointer has no size and no pressure; a real one does.
    width: options.virtual === true ? 0 : 1,
    height: options.virtual === true ? 0 : 1,
    pressure: options.virtual === true ? 0 : 0.5,
    button: options.button ?? 0,
    clientX: options.clientX ?? centre.clientX,
    clientY: options.clientY ?? centre.clientY,
    ...modifiers(options),
    ...overrides,
  };
}

function mouseInit(
  element: Element,
  options: PointerOptions,
  overrides: MouseEventInit,
): MouseEventInit {
  const centre = centreOf(element);
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: options.button ?? 0,
    clientX: options.clientX ?? centre.clientX,
    clientY: options.clientY ?? centre.clientY,
    ...modifiers(options),
    ...overrides,
  };
}

function dispatch(element: Element, event: Event): boolean {
  const notCancelled = element.dispatchEvent(event);
  flush();
  return notCancelled;
}

function focusableAncestor(element: Element): HTMLElement | null {
  let at: Element | null = element;
  while (at !== null) {
    if (at.matches(FOCUSABLE) && at instanceof HTMLElement) return at;
    at = at.parentElement;
  }
  return null;
}

/**
 * Everything in the document the browser would stop at when tabbing.
 *
 * A group of radios sharing a `name` is ONE stop, not one per radio: the
 * browser stops at the checked one, or at the first when none is checked, and
 * the arrows move within the group. A test that tabs through a form and lands
 * on every radio is testing something no browser does.
 */
export function tabbableElements(root: ParentNode = document): HTMLElement[] {
  const candidates = [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (element) =>
      !element.hasAttribute("hidden") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.closest("[inert]") === null,
  );

  const seenRadioGroups = new Set<string>();
  return candidates.filter((element) => {
    if (!(element instanceof HTMLInputElement) || element.type !== "radio") return true;

    const group = candidates.filter(
      (other): other is HTMLInputElement =>
        other instanceof HTMLInputElement &&
        other.type === "radio" &&
        other.name === element.name &&
        other.form === element.form,
    );
    if (group.length === 0) return true;

    const groupKey = `${element.name}\u0000${group[0]?.id ?? ""}`;
    const checked = group.find((radio) => radio.checked);
    const stop = checked ?? group[0];
    if (element !== stop) return false;
    if (seenRadioGroups.has(groupKey)) return false;
    seenRadioGroups.add(groupKey);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Pointer
// ---------------------------------------------------------------------------

/**
 * The element and everything above it, nearest first.
 *
 * `pointerenter` and `pointerleave` do not bubble, and the browser does not
 * need them to: it fires ONE at each element the pointer entered or left, from
 * the target up. Dispatching a single non-bubbling event at the target instead
 * leaves every wrapper around it — the span a tooltip binds to, a row that
 * highlights around a button — never hearing that the pointer arrived.
 */
function enterChain(element: Element): Element[] {
  const chain: Element[] = [];
  let at: Element | null = element;
  while (at !== null) {
    chain.push(at);
    at = at.parentElement;
  }
  return chain;
}

/** `pointerover`, `pointerenter`, `pointermove`, `mouseover`, `mousemove`. */
export function hover(element: Element, options: PointerOptions = {}): void {
  // A pointer arrives at an element by TRAVELLING there, and the moves it made
  // on the way are what tell the page a pointer is in use at all. Without one,
  // a hover straight after a keypress still reads as keyboard interaction, and
  // anything that asks — a tooltip, a focus ring — answers for the keyboard.
  const elsewhere = element.ownerDocument.body;
  if (elsewhere !== element) {
    dispatch(elsewhere, new PointerEvent("pointermove", pointerInit(element, options, {})));
  }
  dispatch(element, new PointerEvent("pointerover", pointerInit(element, options, {})));
  // Root-first, as the browser fires them.
  for (const at of enterChain(element).toReversed()) {
    dispatch(at, new PointerEvent("pointerenter", pointerInit(element, options, { bubbles: false })));
  }
  dispatch(element, new MouseEvent("mouseover", mouseInit(element, options, {})));
  for (const at of enterChain(element).toReversed()) {
    dispatch(at, new MouseEvent("mouseenter", mouseInit(element, options, { bubbles: false })));
  }
  dispatch(element, new PointerEvent("pointermove", pointerInit(element, options, {})));
  dispatch(element, new MouseEvent("mousemove", mouseInit(element, options, {})));
}

/** `pointerout`, `pointerleave`, `mouseout`, `mouseleave`. */
export function unhover(element: Element, options: PointerOptions = {}): void {
  dispatch(element, new PointerEvent("pointerout", pointerInit(element, options, {})));
  // Target-first on the way out, as the browser fires them.
  for (const at of enterChain(element)) {
    dispatch(at, new PointerEvent("pointerleave", pointerInit(element, options, { bubbles: false })));
  }
  dispatch(element, new MouseEvent("mouseout", mouseInit(element, options, {})));
  for (const at of enterChain(element)) {
    dispatch(at, new MouseEvent("mouseleave", mouseInit(element, options, { bubbles: false })));
  }
}

/**
 * `pointerdown`, then `mousedown`, then focus.
 *
 * Focus moves to the nearest focusable ancestor unless `mousedown` was
 * cancelled, which is exactly how a browser decides and is what
 * `preventFocusOnPress` has to work against.
 */
export function pointerDown(element: Element, options: PointerOptions = {}): void {
  dispatch(
    element,
    new PointerEvent("pointerdown", pointerInit(element, options, { buttons: 1, detail: 1 })),
  );

  const proceed = dispatch(
    element,
    new MouseEvent("mousedown", mouseInit(element, options, { buttons: 1, detail: 1 })),
  );

  if (!proceed) return;
  const target = focusableAncestor(element);
  if (target !== null && target !== document.activeElement) {
    target.focus();
    flush();
  }
}

/** `pointerup`, then `mouseup`. */
export function pointerUp(element: Element, options: PointerOptions = {}): void {
  dispatch(
    element,
    new PointerEvent(
      "pointerup",
      pointerInit(element, options, { buttons: 0, pressure: 0, detail: 1 }),
    ),
  );
  dispatch(
    element,
    new MouseEvent("mouseup", mouseInit(element, options, { buttons: 0, detail: 1 })),
  );
}

/** `pointercancel`: the press was abandoned by a scroll, a drag or a gesture. */
export function pointerCancel(element: Element, options: PointerOptions = {}): void {
  dispatch(
    element,
    new PointerEvent("pointercancel", pointerInit(element, options, { buttons: 0 })),
  );
}

export function pointerMove(element: Element, options: PointerOptions = {}): void {
  dispatch(element, new PointerEvent("pointermove", pointerInit(element, options, {})));
  dispatch(element, new MouseEvent("mousemove", mouseInit(element, options, {})));
}

/**
 * A full click: hover, down, up, click.
 *
 * `detail` counts the click, which is what separates a real one from the
 * synthetic click a screen reader dispatches. See {@link virtualClick}.
 */
export function click(element: Element, options: PointerOptions = {}): void {
  hover(element, options);
  pointerDown(element, options);
  pointerUp(element, options);
  dispatch(element, new MouseEvent("click", mouseInit(element, options, { detail: 1 })));
}

export function dblClick(element: Element, options: PointerOptions = {}): void {
  click(element, options);
  hover(element, options);
  pointerDown(element, options);
  pointerUp(element, options);
  dispatch(element, new MouseEvent("click", mouseInit(element, options, { detail: 2 })));
  dispatch(element, new MouseEvent("dblclick", mouseInit(element, options, { detail: 2 })));
}

/** The secondary button, and the context menu that follows it. */
export function rightClick(element: Element, options: PointerOptions = {}): void {
  const right = { ...options, button: 2 };
  hover(element, right);
  dispatch(
    element,
    new PointerEvent("pointerdown", pointerInit(element, right, { buttons: 2, detail: 1 })),
  );
  dispatch(
    element,
    new MouseEvent("mousedown", mouseInit(element, right, { buttons: 2, detail: 1 })),
  );
  dispatch(element, new MouseEvent("contextmenu", mouseInit(element, right, { detail: 0 })));
  dispatch(element, new PointerEvent("pointerup", pointerInit(element, right, { buttons: 0 })));
  dispatch(element, new MouseEvent("mouseup", mouseInit(element, right, { buttons: 0 })));
}

/**
 * The click a screen reader or `element.click()` produces: no pointer events
 * at all, `detail: 0`, and no pointer type.
 *
 * This is the case that separates a widget with real ARIA support from one
 * that only responds to a mouse.
 */
export function virtualClick(element: Element, options: PointerOptions = {}): void {
  dispatch(element, new MouseEvent("click", mouseInit(element, options, { detail: 0 })));
}

/** A touch tap: the pointer sequence with `pointerType: "touch"`, then a click. */
export function tap(element: Element, options: PointerOptions = {}): void {
  const touch = { ...options, pointerType: "touch" as const };
  dispatch(element, new PointerEvent("pointerover", pointerInit(element, touch, {})));
  dispatch(
    element,
    new PointerEvent("pointerenter", pointerInit(element, touch, { bubbles: false })),
  );
  pointerDown(element, touch);
  pointerUp(element, touch);
  dispatch(element, new MouseEvent("click", mouseInit(element, touch, { detail: 1 })));
}

/** Press and hold, without releasing. Pair with {@link pointerUp}. */
export function pointerHold(element: Element, options: PointerOptions = {}): void {
  hover(element, options);
  pointerDown(element, options);
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

export interface KeyOptions {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
  /** Where to send it. The active element by default, as the browser does. */
  target?: Element;
}

/** `code` for the keys whose `key` does not imply it. */
const CODES: Record<string, string> = {
  " ": "Space",
  Enter: "Enter",
  Tab: "Tab",
  Escape: "Escape",
  Backspace: "Backspace",
  Delete: "Delete",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
};

function codeFor(name: string): string {
  const known = CODES[name];
  if (known !== undefined) return known;
  if (name.length === 1) {
    if (name >= "a" && name <= "z") return `Key${name.toUpperCase()}`;
    if (name >= "A" && name <= "Z") return `Key${name}`;
    if (name >= "0" && name <= "9") return `Digit${name}`;
  }
  return name;
}

function keyInit(name: string, options: KeyOptions): KeyboardEventInit {
  return {
    key: name,
    code: codeFor(name),
    bubbles: true,
    cancelable: true,
    composed: true,
    repeat: options.repeat ?? false,
    ...modifiers(options),
  };
}

function keyTarget(options: KeyOptions): Element {
  return options.target ?? (document.activeElement) ?? document.body;
}

export function keyDown(name: string, options: KeyOptions = {}): boolean {
  return dispatch(keyTarget(options), new KeyboardEvent("keydown", keyInit(name, options)));
}

export function keyUp(name: string, options: KeyOptions = {}): boolean {
  return dispatch(keyTarget(options), new KeyboardEvent("keyup", keyInit(name, options)));
}

/**
 * One key pressed and released.
 *
 * When the key is printable, the target is editable, and the `keydown` was not
 * cancelled, the value is updated and an `input` event fired — which is what
 * makes a controlled field observable without reaching for `fireEvent.input`.
 */
export function key(name: string, options: KeyOptions = {}): void {
  const target = keyTarget(options);
  const proceed = keyDown(name, options);

  if (proceed && name.length === 1) insertText(target, name);
  else if (proceed && name === "Backspace") deleteBackward(target);

  keyUp(name, options);
}

function editableValue(element: Element): { get(): string; set(value: string): void } | null {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.readOnly || element.disabled) return null;
    return {
      get: () => element.value,
      set: (value) => {
        element.value = value;
      },
    };
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    return {
      get: () => element.textContent ?? "",
      set: (value) => {
        element.textContent = value;
      },
    };
  }
  return null;
}

function insertText(element: Element, text: string): void {
  const value = editableValue(element);
  if (value === null) return;

  const beforeInput = new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    data: text,
    inputType: "insertText",
  });
  if (!dispatch(element, beforeInput)) return;

  value.set(value.get() + text);
  dispatch(
    element,
    new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }),
  );
}

function deleteBackward(element: Element): void {
  const value = editableValue(element);
  if (value === null) return;
  const current = value.get();
  if (current === "") return;
  value.set(current.slice(0, -1));
  dispatch(
    element,
    new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }),
  );
}

const KEY_TOKEN = /\{([^}]+)\}|(.)/gs;

/**
 * A sequence of keys, with `{...}` naming the ones that are not a character.
 *
 * ```ts
 * user.keyboard("hello{Enter}");
 * user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
 * ```
 */
export function keyboard(sequence: string, options: KeyOptions = {}): void {
  for (const match of sequence.matchAll(KEY_TOKEN)) {
    const named = match[1];
    const character = match[2];
    key(named ?? (character), options);
  }
}

/** Type into a field, focusing it first as a user would by clicking. */
export function type(element: Element, text: string, options: KeyOptions = {}): void {
  if (document.activeElement !== element) {
    click(element);
  }
  keyboard(text, { ...options, target: element });
}

/** Empty a field, reporting the change. */
export function clear(element: Element): void {
  const value = editableValue(element);
  if (value === null) return;
  value.set("");
  dispatch(
    element,
    new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }),
  );
}

/**
 * Move focus as Tab would.
 *
 * The engine's own Tab handling does not exist in a headless DOM, so the next
 * tabbable element is computed here — which also means a `keydown` handler
 * that calls `preventDefault`, as focus containment does, is honoured.
 */
export function tab(options: { shift?: boolean } = {}): void {
  const proceed = keyDown("Tab", { shiftKey: options.shift ?? false });
  if (!proceed) {
    keyUp("Tab", { shiftKey: options.shift ?? false });
    return;
  }

  const order = tabbableElements();
  const active = document.activeElement as HTMLElement | null;
  const index = active === null ? -1 : order.indexOf(active);

  let next: HTMLElement | undefined;
  if (options.shift === true) {
    next = index <= 0 ? order[order.length - 1] : order[index - 1];
  } else {
    next = index === -1 || index === order.length - 1 ? order[0] : order[index + 1];
  }

  if (next !== undefined) {
    next.focus();
    flush();
  } else {
    active?.blur();
    flush();
  }

  keyUp("Tab", { shiftKey: options.shift ?? false });
}

// ---------------------------------------------------------------------------
// Focus
// ---------------------------------------------------------------------------

/** Focus an element the way a screen reader does: no pointer, no key. */
export function focus(element: HTMLElement): void {
  element.focus();
  flush();
}

export function blur(element: HTMLElement): void {
  element.blur();
  flush();
}

/** Paste, as the clipboard would deliver it. */
export function paste(element: Element, text: string): void {
  const value = editableValue(element);
  const event = new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    data: text,
    inputType: "insertFromPaste",
  });
  if (!dispatch(element, event) || value === null) return;
  value.set(value.get() + text);
  dispatch(
    element,
    new InputEvent("input", { bubbles: true, data: text, inputType: "insertFromPaste" }),
  );
}

/**
 * Every interaction, on one object.
 *
 * ```ts
 * import { user } from "@barqjs/testing";
 *
 * user.click(screen.getByRole("button"));
 * user.keyboard("{ArrowDown}{Enter}");
 * user.tab({ shift: true });
 * ```
 */
export const user = {
  blur,
  clear,
  click,
  dblClick,
  focus,
  hover,
  key,
  keyboard,
  keyDown,
  keyUp,
  paste,
  pointerCancel,
  pointerDown,
  pointerHold,
  pointerMove,
  pointerUp,
  rightClick,
  tab,
  tap,
  type,
  unhover,
  virtualClick,
};
