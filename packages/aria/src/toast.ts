/**
 * A queue of toasts, and the timers that take them away.
 *
 * This is the piece `@barqjs/ui`'s `<Toaster>` needed. shadcn's is the `sonner`
 * package, which is React to its foundations, so the engine is written here and
 * only the shape of it is upstream's.
 *
 * Four things are decisions rather than details.
 *
 * **A toast is announced, not focused.** Moving focus to something that appeared
 * on its own takes the keyboard away from whatever the person was doing, so the
 * region is a live one and the toast waits to be reached. That is why `dismiss`
 * is on the toast and not only on a timer: something has to be able to remove
 * it deliberately.
 *
 * **The timer pauses.** A toast that expires while the pointer is over it, or
 * while the tab is in the background, was never read. Hovering the region stops
 * every timer in it, and leaving starts them again from where they stopped.
 *
 * **A queue has a limit and it is visible.** Beyond it the oldest goes, because
 * the alternative is a column that grows past the viewport and hides the newest
 * behind the ones it replaced.
 *
 * **An id is returned so the caller can update.** A promise that resolves wants
 * to become "Saved" rather than stack a second toast under "Saving"; without an
 * id there is no way to say which one.
 */

import { signal, type Accessor } from "@barqjs/core";

import { access, type MaybeAccessor } from "./utils.ts";

export type ToastKind = "default" | "success" | "info" | "warning" | "error" | "loading";

export interface ToastOptions {
  readonly title?: string;
  readonly description?: string;
  /** @default "default" */
  readonly kind?: ToastKind;
  /** How long before it goes, in ms. `Infinity` keeps it. @default 4000 */
  readonly duration?: number;
  /** A button on the toast, and what it does. */
  readonly action?: { readonly label: string; readonly onAction: () => void };
  readonly onDismiss?: () => void;
}

export interface Toast extends ToastOptions {
  readonly id: number;
  /** When the remaining time was last measured, so pausing can be resumed. */
  readonly kind: ToastKind;
  readonly duration: number;
}

export interface ToastQueueOptions {
  /** How many are on screen at once. @default 3 */
  limit?: MaybeAccessor<number | undefined>;
  /** The default lifetime. @default 4000 */
  duration?: MaybeAccessor<number | undefined>;
}

export interface ToastQueue {
  readonly toasts: Accessor<readonly Toast[]>;
  /** Adds one and returns its id, which is what an update needs. */
  add(options: ToastOptions): number;
  /** Replaces one in place, keeping its position. Unknown ids are ignored. */
  update(id: number, options: ToastOptions): void;
  dismiss(id: number): void;
  clear(): void;
  /** Stop every timer, which is what entering the region does. */
  pause(): void;
  /** Start them again from the time each had left. */
  resume(): void;
  readonly isPaused: Accessor<boolean>;
}

const DEFAULT_LIMIT = 3;
const DEFAULT_DURATION = 4000;

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  /** What is left of the duration, in ms. */
  remaining: number;
  /** When the current run started, for working out what is left on a pause. */
  startedAt: number;
}

export function toastQueue(options: ToastQueueOptions = {}): ToastQueue {
  const toasts = signal<readonly Toast[]>([]);
  const paused = signal(false);
  const timers = new Map<number, Timer>();
  let nextId = 1;

  const stop = (id: number): void => {
    const timer = timers.get(id);
    if (timer !== undefined && timer.handle !== null) {
      clearTimeout(timer.handle);
      timer.handle = null;
    }
  };

  const remove = (id: number): void => {
    stop(id);
    timers.delete(id);
    const going = toasts().find((each) => each.id === id);
    toasts.set(toasts().filter((each) => each.id !== id));
    going?.onDismiss?.();
  };

  const start = (id: number): void => {
    const timer = timers.get(id);
    if (timer === undefined || paused()) return;
    // `Infinity` is the documented way to keep one, and `setTimeout` would
    // treat it as zero and take it away at once.
    if (!Number.isFinite(timer.remaining)) return;
    timer.startedAt = Date.now();
    timer.handle = setTimeout(() => remove(id), timer.remaining);
  };

  return {
    toasts,
    isPaused: paused,
    add(given) {
      const id = nextId++;
      const toast: Toast = {
        ...given,
        id,
        kind: given.kind ?? "default",
        duration: given.duration ?? access(options.duration) ?? DEFAULT_DURATION,
      };
      const limit = access(options.limit) ?? DEFAULT_LIMIT;
      // The OLDEST goes. Dropping the newest would mean the thing that just
      // happened is the one nobody is told about.
      const kept = [...toasts(), toast].slice(-Math.max(1, limit));
      for (const each of toasts()) {
        if (!kept.some((one) => one.id === each.id)) {
          stop(each.id);
          timers.delete(each.id);
        }
      }
      toasts.set(kept);
      timers.set(id, { handle: null, remaining: toast.duration, startedAt: Date.now() });
      start(id);
      return id;
    },
    update(id, given) {
      const at = toasts().findIndex((each) => each.id === id);
      if (at < 0) return;
      const before = toasts()[at] as Toast;
      const next: Toast = {
        ...before,
        ...given,
        id,
        kind: given.kind ?? before.kind,
        duration: given.duration ?? before.duration,
      };
      // In PLACE, so a "Saving" that becomes "Saved" does not jump to the
      // bottom of the column and read as a second thing happening.
      toasts.set(toasts().map((each) => (each.id === id ? next : each)));
      stop(id);
      timers.set(id, { handle: null, remaining: next.duration, startedAt: Date.now() });
      start(id);
    },
    dismiss: remove,
    clear() {
      for (const each of toasts()) stop(each.id);
      timers.clear();
      toasts.set([]);
    },
    pause() {
      if (paused()) return;
      paused.set(true);
      const now = Date.now();
      for (const [id, timer] of timers) {
        if (timer.handle === null) continue;
        // What is LEFT, not the whole duration: pausing twice would otherwise
        // give a toast its full life back each time the pointer crossed it.
        timer.remaining = Math.max(0, timer.remaining - (now - timer.startedAt));
        stop(id);
      }
    },
    resume() {
      if (!paused()) return;
      paused.set(false);
      for (const id of timers.keys()) start(id);
    },
  };
}
