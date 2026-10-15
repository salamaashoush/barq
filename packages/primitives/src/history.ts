import {
  type Accessor,
  type Signal,
  flush,
  createRenderEffect,
  createSignal,
  untrack,
} from "@barqjs/core";
import type { Clear } from "./utils.ts";

export interface HistoryHandle<T> {
  undo: Clear;
  redo: Clear;
  canUndo: Accessor<boolean>;
  canRedo: Accessor<boolean>;
  /** Values older than the current one, oldest first. */
  past: Accessor<readonly T[]>;
  /** Values undone past, next-to-redo last. */
  future: Accessor<readonly T[]>;
  /** Forget everything recorded, keeping the current value. */
  clear: Clear;
  /**
   * Run `fn` without recording what it changes. For a change that is not the
   * user's — a value arriving from the server, a normalisation pass.
   */
  silently: <R>(fn: () => R) => R;
}

export interface HistoryOptions {
  /** How many past values to keep. Defaults to 100; `0` for unbounded. */
  limit?: number;
}

/**
 * Undo and redo over an existing signal.
 *
 * Every change to the signal is recorded, whoever made it, because a history
 * that only sees writes through its own wrapper is a history with holes in it.
 * Undo and redo write through the same signal, so everything already bound to
 * it follows.
 *
 * The redo stack is dropped on the first new change after an undo, which is
 * what every editor does and what users expect.
 *
 * ```ts
 * const text = createSignal("");
 * const edits = history(text, { limit: 50 });
 * edits.undo();
 * ```
 */
export function history<T>(source: Signal<T>, options?: HistoryOptions): HistoryHandle<T> {
  const [read, write] = source;
  const limit = options?.limit ?? 100;
  const [past, setPast] = createSignal<readonly T[]>([]);
  const [future, setFuture] = createSignal<readonly T[]>([]);

  let current = untrack(read);
  /**
   * Two guards, because they cover different moments.
   *
   * Assigning `current` before the write is what makes the recording effect
   * see no change when it next runs, which covers the ordinary deferred case.
   * The flag covers a caller who flushes inside `silently`: the effect then
   * runs while `current` is still the old value, and without this it would
   * record a change the caller asked it not to see.
   */
  let replaying = false;

  createRenderEffect(
    () => read(),
    (next) => {
      if (Object.is(next, current)) return;
      const previous = current;
      current = next;
      if (replaying) return;

      setPast((stack) => {
        const recorded = [...stack, previous];
        return limit > 0 && recorded.length > limit ? recorded.slice(-limit) : recorded;
      });
      setFuture((stack) => (stack.length > 0 ? [] : stack));
    },
    { defer: true },
  );

  const replay = (value: T): void => {
    replaying = true;
    try {
      current = value;
      write(() => value);
    } finally {
      replaying = false;
    }
  };

  return {
    undo() {
      // A write made this tick has not reached the recording effect yet, and
      // undoing past it would skip a step.
      flush();
      const stack = untrack(past);
      if (stack.length === 0) return;
      const value = stack[stack.length - 1] as T;
      setPast(stack.slice(0, -1));
      setFuture((prev) => [...prev, current]);
      replay(value);
    },
    redo() {
      flush();
      const stack = untrack(future);
      if (stack.length === 0) return;
      const value = stack[stack.length - 1] as T;
      setFuture(stack.slice(0, -1));
      setPast((prev) => [...prev, current]);
      replay(value);
    },
    canUndo: () => past().length > 0,
    canRedo: () => future().length > 0,
    past,
    future,
    clear() {
      setPast([]);
      setFuture([]);
    },
    silently(fn) {
      replaying = true;
      try {
        const out = fn();
        // The write has to be PUBLISHED before the baseline is re-read: a
        // staged write is invisible to an untracked read, so `current` would
        // stay behind and the recording effect would then record the change
        // the caller asked it not to see.
        flush();
        current = untrack(read);
        return out;
      } finally {
        replaying = false;
      }
    },
  };
}
