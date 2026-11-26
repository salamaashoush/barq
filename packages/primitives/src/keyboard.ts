import { type Accessor, createMemo, createSignal } from "@barqjs/core";
import { isServer } from "@barqjs/web";
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
  const [held, setHeld] = createSignal<readonly string[]>([]);
  if (isServer) return held;

  on(window, "keydown", (event) => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    setHeld((prev) => (prev.includes(key) ? prev : [...prev, key]));
  });
  on(window, "keyup", (event) => {
    const key = event.key.toLowerCase();
    setHeld((prev) => prev.filter((k) => k !== key));
  });
  on(window, "blur", () => setHeld([]));

  return held;
});

/** Whether a key is currently held. The name is matched against `event.key`, case-insensitively. */
export function isKeyDown(key: MaybeAccessor<string>): Accessor<boolean> {
  const held = keysDown();
  return createMemo(() => held().includes(access(key).toLowerCase()));
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
  /** How long a sequence such as `"g p"` waits for its next key, in milliseconds. @default 1000 */
  sequenceTimeout?: number;
}

const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isTyping(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof Element)) return false;
  return TYPING.has(target.tagName) || (target as HTMLElement).isContentEditable;
}

const MODIFIERS = new Set(["shift", "control", "alt", "meta", "os"]);

function steps(combo: string): Combo[] {
  return combo
    .replace(/\s*\+\s*/g, "+")
    .trim()
    .split(/\s+/)
    .filter((step) => step !== "")
    .map(parseCombo);
}

function pressed(event: KeyboardEvent, wanted: Combo): boolean {
  return (
    event.key.toLowerCase() === wanted.key &&
    event.ctrlKey === wanted.ctrl &&
    event.metaKey === wanted.meta &&
    event.shiftKey === wanted.shift &&
    event.altKey === wanted.alt
  );
}

/**
 * Bind a keyboard shortcut.
 *
 * Modifiers must match exactly, so `"k"` does not fire on `mod+k` and
 * `"mod+k"` does not fire on `mod+shift+k`. That exactness is what lets two
 * shortcuts share a key.
 *
 * Combos separated by spaces are a sequence: `"g p"` fires on G and then P,
 * pressed within `sequenceTimeout` of each other. Another key in between
 * starts it over; a modifier going down on its own does not.
 *
 * ```ts
 * shortcut("mod+k", () => palette.open());
 * shortcut("escape", () => dialog.close(), { whileTyping: true });
 * shortcut("g p", () => navigate("/projects"));
 * ```
 */
export function shortcut(
  combo: MaybeAccessor<string>,
  handler: (event: KeyboardEvent) => void,
  options?: ShortcutOptions,
): Clear {
  const preventDefault = options?.preventDefault !== false;
  let reached = 0;
  let at = 0;

  return on(options?.target ?? (isServer ? null : window), "keydown", (event: KeyboardEvent) => {
    if (event.repeat && options?.repeat !== true) return;
    const wanted = steps(access(combo));
    if (wanted.length === 0 || wanted.some((step) => step.key === "")) return;
    if (reached > 0 && event.timeStamp - at > (options?.sequenceTimeout ?? 1000)) reached = 0;
    let step = wanted[reached] as Combo;
    if (!pressed(event, step)) {
      if (MODIFIERS.has(event.key.toLowerCase())) return;
      reached = 0;
      step = wanted[0] as Combo;
      if (!pressed(event, step)) return;
    }
    if (!options?.whileTyping && step.key.length === 1 && !step.ctrl && !step.meta) {
      if (isTyping(event.target)) {
        reached = 0;
        return;
      }
    }
    if (preventDefault) event.preventDefault();
    if (reached < wanted.length - 1) {
      reached++;
      at = event.timeStamp;
      return;
    }
    reached = 0;
    handler(event);
  });
}
