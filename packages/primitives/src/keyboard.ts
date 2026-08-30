import { type Accessor, computed, isServer, signal } from "@barqjs/core";
import { on } from "./event.ts";
import { type Clear, type MaybeAccessor, access, shared } from "./utils.ts";

/**
 * Which keys are held down, lower-cased, in the order they went down.
 *
 * Cleared when the window loses focus: a key released while another
 * application had focus never reports its `keyup`, and without this the key
 * stays stuck down forever.
 */
export const keysDown: () => Accessor<readonly string[]> = shared(() => {
  const held = signal<readonly string[]>([]);
  if (isServer) return held;

  on(window, "keydown", (event) => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    const current = held.peek();
    if (current.includes(key)) return;
    held.set([...current, key]);
  });
  on(window, "keyup", (event) => {
    const key = event.key.toLowerCase();
    held.set(held.peek().filter((k) => k !== key));
  });
  on(window, "blur", () => held.set([]));

  return held;
});

/** Whether a key is currently held. The name is matched against `event.key`, case-insensitively. */
export function isKeyDown(key: MaybeAccessor<string>): Accessor<boolean> {
  const held = keysDown();
  return computed(() => held().includes(access(key).toLowerCase()));
}

const APPLE =
  !isServer &&
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);

interface Combo {
  key: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

/**
 * `"mod+shift+k"` and the like. `mod` is Command on Apple platforms and
 * Control everywhere else, which is the difference every hand-rolled shortcut
 * handler gets wrong.
 */
export function parseCombo(combo: string): Combo {
  const parsed: Combo = { key: "", ctrl: false, meta: false, shift: false, alt: false };
  for (const part of combo.toLowerCase().split("+")) {
    const name = part.trim();
    if (name === "mod") {
      if (APPLE) parsed.meta = true;
      else parsed.ctrl = true;
    } else if (name === "ctrl" || name === "control") parsed.ctrl = true;
    else if (name === "meta" || name === "cmd" || name === "command") parsed.meta = true;
    else if (name === "shift") parsed.shift = true;
    else if (name === "alt" || name === "option") parsed.alt = true;
    else if (name !== "") parsed.key = name;
  }
  return parsed;
}

export interface ShortcutOptions {
  /** Where to listen. Defaults to `window`. */
  target?: MaybeAccessor<Window | Document | HTMLElement | null | undefined>;
  /** Call `preventDefault` on a match. On by default, since a shortcut that fires and also scrolls is a bug. */
  preventDefault?: boolean;
  /** Fire again while the key is held. Off by default. */
  repeat?: boolean;
  /**
   * Fire even when the event came from a text field. Off by default: `mod+k`
   * should open the palette, but a bare `k` must not while someone is typing.
   */
  whileTyping?: boolean;
}

const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isTyping(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof Element)) return false;
  return TYPING.has(target.tagName) || (target as HTMLElement).isContentEditable;
}

/**
 * Bind a keyboard shortcut.
 *
 * Modifiers must match exactly, so `"k"` does not fire on `mod+k` and
 * `"mod+k"` does not fire on `mod+shift+k`. That exactness is what lets two
 * shortcuts share a key.
 *
 * ```ts
 * shortcut("mod+k", () => palette.open());
 * shortcut("escape", () => dialog.close(), { whileTyping: true });
 * ```
 */
export function shortcut(
  combo: MaybeAccessor<string>,
  handler: (event: KeyboardEvent) => void,
  options?: ShortcutOptions,
): Clear {
  const preventDefault = options?.preventDefault !== false;

  return on(options?.target ?? (isServer ? null : window), "keydown", (event: KeyboardEvent) => {
    if (event.repeat && options?.repeat !== true) return;
    const wanted = parseCombo(access(combo));
    if (wanted.key === "") return;
    if (event.key.toLowerCase() !== wanted.key) return;
    if (
      event.ctrlKey !== wanted.ctrl ||
      event.metaKey !== wanted.meta ||
      event.shiftKey !== wanted.shift ||
      event.altKey !== wanted.alt
    ) {
      return;
    }
    if (!options?.whileTyping && wanted.key.length === 1 && !wanted.ctrl && !wanted.meta) {
      if (isTyping(event.target)) return;
    }
    if (preventDefault) event.preventDefault();
    handler(event);
  });
}
