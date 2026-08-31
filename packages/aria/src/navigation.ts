/**
 * A navigation menu's state: which item is open, and which way it moved.
 *
 * This is the piece `@barqjs/ui`'s `<NavigationMenu>` needed and nothing here
 * had. It is not a menu: a menu opens one panel at a time from a press and
 * closes on choosing, and a navigation menu opens on HOVER, keeps the panel
 * while the pointer travels to it, and slides sideways when the pointer moves
 * to the next trigger rather than closing and reopening.
 *
 * Three things follow from that and each is a decision rather than a detail.
 *
 * **Opening is immediate once one is open.** The first panel waits, so brushing
 * the bar on the way somewhere else opens nothing; after that the menu is
 * "active" and moving between triggers is instant, because a delay there reads
 * as lag rather than as intent.
 *
 * **Closing waits.** The pointer has to cross the gap between the trigger and
 * the panel, and a menu that closes the moment it leaves the trigger cannot be
 * reached at all.
 *
 * **The previous key is kept**, because the panel's animation depends on which
 * side it came from. That is upstream's `data-motion`, and it is the only
 * reason a navigation menu looks different from a row of popovers.
 */

import { signal, type Accessor } from "@barqjs/core";

import { access, type MaybeAccessor } from "./utils.ts";
import type { Key } from "./collections.ts";

/** How long the FIRST panel waits before opening on hover. */
const OPEN_DELAY = 200;
/** How long any panel stays after the pointer leaves it and its trigger. */
const CLOSE_DELAY = 300;

export interface NavigationMenuStateOptions {
  value?: MaybeAccessor<Key | null | undefined>;
  defaultValue?: MaybeAccessor<Key | null | undefined>;
  /** How long the first panel waits. @default 200 */
  delay?: MaybeAccessor<number | undefined>;
  /** How long a panel stays once the pointer has left. @default 300 */
  closeDelay?: MaybeAccessor<number | undefined>;
  onValueChange?: (value: Key | null) => void;
}

export type MotionDirection = "from-start" | "from-end" | "to-start" | "to-end" | null;

export interface NavigationMenuState {
  /** The open item, or `null`. */
  readonly value: Accessor<Key | null>;
  /** What was open immediately before, which is what the direction is measured from. */
  readonly previous: Accessor<Key | null>;
  /** Open it now, with no delay. A press and the keyboard both want this. */
  open(value: Key): void;
  /** Open it after the delay, unless something is already open. */
  openSoon(value: Key): void;
  close(): void;
  /** Close after the delay, so the pointer can cross the gap to the panel. */
  closeSoon(): void;
  /** Cancel a pending close, which is what entering the panel does. */
  keep(): void;
  /**
   * Which way a panel is arriving or leaving, given the order of the items.
   *
   * `null` when there is nothing to compare against, and the caller writes no
   * `data-motion` at all rather than writing a direction it made up.
   */
  motion(value: Key, order: readonly Key[]): MotionDirection;
}

export function navigationMenuState(options: NavigationMenuStateOptions = {}): NavigationMenuState {
  const inner = signal<Key | null>(access(options.defaultValue) ?? null);
  const previous = signal<Key | null>(null);
  let openTimer: ReturnType<typeof setTimeout> | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  const clear = (timer: ReturnType<typeof setTimeout> | null): null => {
    if (timer !== null) clearTimeout(timer);
    return null;
  };

  const value = (): Key | null => access(options.value) ?? inner();

  const set = (next: Key | null): void => {
    const now = value();
    if (now === next) return;
    previous.set(now);
    if (access(options.value) === undefined) inner.set(next);
    options.onValueChange?.(next);
  };

  const open = (next: Key): void => {
    openTimer = clear(openTimer);
    closeTimer = clear(closeTimer);
    set(next);
  };

  return {
    value,
    previous,
    open,
    openSoon(next) {
      closeTimer = clear(closeTimer);
      // Already open: move NOW. A delay between triggers reads as lag, where
      // the same delay before the first one reads as not having meant it.
      if (value() !== null) {
        open(next);
        return;
      }
      openTimer = clear(openTimer);
      openTimer = setTimeout(() => open(next), access(options.delay) ?? OPEN_DELAY);
    },
    close() {
      openTimer = clear(openTimer);
      closeTimer = clear(closeTimer);
      set(null);
    },
    closeSoon() {
      openTimer = clear(openTimer);
      closeTimer = clear(closeTimer);
      closeTimer = setTimeout(() => set(null), access(options.closeDelay) ?? CLOSE_DELAY);
    },
    keep() {
      closeTimer = clear(closeTimer);
    },
    motion(item, order) {
      const now = value();
      const before = previous();
      const at = order.indexOf(item);
      if (at < 0) return null;

      // Arriving: which side of the one that was open is this?
      if (now === item) {
        if (before === null) return null;
        const from = order.indexOf(before);
        if (from < 0) return null;
        return from < at ? "from-end" : "from-start";
      }

      // Leaving: which side is the one that took its place?
      if (before === item && now !== null) {
        const to = order.indexOf(now);
        if (to < 0) return null;
        return to < at ? "to-end" : "to-start";
      }

      return null;
    },
  };
}
