/**
 * Keyboard handling with propagation stopped by default.
 *
 * A component nested inside another that also handles keys — a menu inside a
 * dialog inside a listbox — must not let one Escape close all three. So a
 * handler here consumes the event unless it says otherwise, which inverts the
 * platform default and makes composition the easy case rather than the one
 * every caller has to remember.
 *
 * `continuePropagation()` is added to the native event rather than to a
 * synthetic copy of it, because barq has no synthetic event system and a copy
 * would break `preventDefault`, `currentTarget` and every other live property.
 */

import { contains, targetElement } from "../dom.ts";
import { isMac } from "../platform.ts";
import { access, type DOMProps, type MaybeAccessor } from "../utils.ts";

/** A native event with the opt-out from this module's default. */
export type BaseEvent<E extends Event> = E & { continuePropagation(): void };

const CONTINUE = Symbol.for("barq.aria.continuePropagation");

interface Marked {
  [CONTINUE]?: boolean;
}

/**
 * Wrap a handler so the event it receives stops propagating unless the handler
 * calls `continuePropagation()`.
 *
 * Nesting composes: an inner wrapper that was told to continue tells the outer
 * one too, so an event a child chose to let through is not swallowed by the
 * parent that delegated to it.
 */
export function createEventHandler<E extends Event>(
  handler?: (event: BaseEvent<E>) => void,
): ((event: E) => void) | undefined {
  if (handler === undefined) return undefined;

  return (event: E): void => {
    const marked = event as E & Marked;
    const outer = (event as unknown as Partial<BaseEvent<E>>).continuePropagation;
    let shouldStop = true;

    Object.defineProperty(event, "continuePropagation", {
      configurable: true,
      writable: true,
      value: (): void => {
        shouldStop = false;
        marked[CONTINUE] = true;
        // A wrapper further out has already decided to stop; tell it not to.
        outer?.call(event);
      },
    });

    try {
      handler(event as BaseEvent<E>);
    } finally {
      if (outer === undefined) {
        delete (event as unknown as Partial<BaseEvent<E>>).continuePropagation;
      } else
        Object.defineProperty(event, "continuePropagation", { configurable: true, value: outer });
    }

    if (shouldStop && !event.cancelBubble) event.stopPropagation();
  };
}

// ---------------------------------------------------------------------------
// Shortcuts
// ---------------------------------------------------------------------------

/**
 * What a shortcut does. Returning nothing or `true` prevents the default and
 * stops the event; `false` lets it through untouched; an object decides each.
 */
export type KeyboardShortcutAction = (
  event: BaseEvent<KeyboardEvent>,
) =>
  | void
  | boolean
  | Partial<{ shouldContinuePropagation: boolean; shouldPreventDefault: boolean }>;

/** Shortcut strings (`"Mod+s"`, `"Control+Shift+a"`, `"Escape"`) to what they do. */
export type KeyboardShortcutBindings = Record<string, KeyboardShortcutAction>;

export interface ParsedKeyboardShortcut {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  /** Command on Apple platforms, Control everywhere else. */
  mod: boolean;
  key: string;
}

const MODIFIER_ORDER = ["Alt", "Control", "Meta", "Shift"] as const;

const KEY_ALIASES: Record<string, string> = {
  space: " ",
  esc: "escape",
  del: "delete",
  ins: "insert",
  left: "arrowleft",
  right: "arrowright",
  up: "arrowup",
  down: "arrowdown",
};

/** `"Mod+Shift+z"` into its parts. Modifiers ignore case and order. */
export function parseKeyboardShortcut(spec: string): ParsedKeyboardShortcut {
  const parsed: ParsedKeyboardShortcut = {
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    mod: false,
    key: "",
  };
  for (const part of spec.split("+")) {
    const lower = part.toLowerCase();
    if (lower === "shift") parsed.shift = true;
    else if (lower === "alt") parsed.alt = true;
    else if (lower === "control") parsed.ctrl = true;
    else if (lower === "meta") parsed.meta = true;
    else if (lower === "mod") parsed.mod = true;
    else parsed.key = part;
  }
  if (parsed.key === "") {
    throw new Error(
      `Invalid keyboard shortcut: "${spec}". Must include exactly one non-modifier key (e.g. "a", "Enter", "ArrowDown"). Combine any of Shift, Alt, Control, Meta, and Mod.`,
    );
  }
  return parsed;
}

function joinShortcut(modifiers: Set<string>, key: string): string {
  const ordered = MODIFIER_ORDER.filter((name) => modifiers.has(name));
  return ordered.length > 0 ? `${ordered.join("+")}+${key}` : key;
}

/** One spelling per shortcut, so `Shift+Mod+a` and `Mod+Shift+a` are the same key. */
export function canonicalKeyboardShortcut(parsed: ParsedKeyboardShortcut): string {
  const modifiers = new Set<string>();
  if (parsed.alt) modifiers.add("Alt");
  if (parsed.shift) modifiers.add("Shift");
  if (parsed.ctrl) modifiers.add("Control");
  if (parsed.meta) modifiers.add("Meta");
  if (parsed.mod) modifiers.add(isMac() ? "Meta" : "Control");
  const key = parsed.key.toLowerCase();
  return joinShortcut(modifiers, KEY_ALIASES[key] ?? key);
}

/** The canonical shortcut a keydown spells. */
export function keyboardEventToCanonicalShortcut(event: KeyboardEvent): string {
  const modifiers = new Set<string>();
  if (event.altKey) modifiers.add("Alt");
  if (event.ctrlKey) modifiers.add("Control");
  if (event.metaKey) modifiers.add("Meta");
  if (event.shiftKey) modifiers.add("Shift");
  return joinShortcut(modifiers, event.key.toLowerCase());
}

/**
 * A keydown handler that runs the binding whose modifiers and key match the
 * event exactly. Two bindings that spell the same shortcut: the later wins.
 *
 * ```ts
 * const onKeyDown = createKeyboardShortcutHandler({ "Mod+s": () => save() });
 * ```
 */
export function createKeyboardShortcutHandler(
  bindings: KeyboardShortcutBindings,
): (event: BaseEvent<KeyboardEvent>) => void {
  const map = new Map<string, KeyboardShortcutAction>();
  for (const [spec, action] of Object.entries(bindings)) {
    map.set(canonicalKeyboardShortcut(parseKeyboardShortcut(spec)), action);
  }

  return (event) => {
    const action = map.get(keyboardEventToCanonicalShortcut(event));
    if (action === undefined) {
      event.continuePropagation();
      return;
    }
    const result = action(event);
    const outcome =
      result === undefined
        ? { shouldContinuePropagation: false, shouldPreventDefault: true }
        : typeof result === "boolean"
          ? { shouldContinuePropagation: !result, shouldPreventDefault: result }
          : result;
    if (outcome.shouldPreventDefault === true) event.preventDefault();
    if (outcome.shouldContinuePropagation === true) event.continuePropagation();
  };
}

/**
 * Call a handler that does not decide propagation. It still receives a
 * `continuePropagation`, the enclosing handler's when there is one.
 */
function callUndecided(
  handler: ((event: BaseEvent<KeyboardEvent>) => void) | undefined,
  event: KeyboardEvent,
): void {
  if (handler === undefined) return;
  const base = event as Partial<BaseEvent<KeyboardEvent>>;
  if (typeof base.continuePropagation === "function") {
    handler(event as BaseEvent<KeyboardEvent>);
    return;
  }
  Object.defineProperty(event, "continuePropagation", {
    configurable: true,
    writable: true,
    value: (): void => {},
  });
  try {
    handler(event as BaseEvent<KeyboardEvent>);
  } finally {
    delete base.continuePropagation;
  }
}

export interface KeyboardOptions {
  isDisabled?: MaybeAccessor<boolean | undefined>;
  onKeyDown?: (event: BaseEvent<KeyboardEvent>) => void;
  onKeyUp?: (event: BaseEvent<KeyboardEvent>) => void;
  /**
   * Keyboard shortcuts on keydown. With these, `onKeyDown` and `onKeyUp` run
   * as they are and only the shortcuts decide whether the event goes on.
   */
  shortcuts?: KeyboardShortcutBindings;
  /** Run shortcuts for a held key's repeats too. */
  allowRepeats?: MaybeAccessor<boolean | undefined>;
  /** Run shortcuts while an input method is composing. */
  allowComposing?: MaybeAccessor<boolean | undefined>;
}

export interface KeyboardResult {
  keyboardProps: DOMProps;
}

/**
 * Key handling for a focusable element.
 *
 * ```tsx
 * const { keyboardProps } = keyboard({
 *   onKeyDown: (e) => {
 *     if (e.key !== "Escape") e.continuePropagation();
 *     else close();
 *   },
 * });
 * ```
 */
export function keyboard(options: KeyboardOptions = {}): KeyboardResult {
  const enabled = (): boolean => access(options.isDisabled) !== true;
  let down: ((event: KeyboardEvent) => void) | undefined;
  let up: ((event: KeyboardEvent) => void) | undefined;

  if (options.shortcuts === undefined) {
    down = createEventHandler(options.onKeyDown);
    up = createEventHandler(options.onKeyUp);
  } else {
    const shortcut = createKeyboardShortcutHandler(options.shortcuts);
    const onShortcut = createEventHandler<KeyboardEvent>((event) => {
      // A key from a portalled subtree is not this element's.
      if (!contains(event.currentTarget as Element | null, targetElement(event))) {
        event.continuePropagation();
        return;
      }
      if (
        (event.repeat && access(options.allowRepeats) !== true) ||
        (event.isComposing && access(options.allowComposing) !== true)
      ) {
        event.continuePropagation();
        return;
      }
      shortcut(event);
    });
    down = (event) => {
      callUndecided(options.onKeyDown, event);
      onShortcut?.(event);
    };
    up = (event) => callUndecided(options.onKeyUp, event);
  }

  return {
    keyboardProps: {
      onKeyDown: (event: KeyboardEvent) => {
        if (enabled()) down?.(event);
      },
      onKeyUp: (event: KeyboardEvent) => {
        if (enabled()) up?.(event);
      },
    },
  };
}
