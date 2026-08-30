import { type Accessor, type Signal, flush, renderEffect, signal, untrack } from "@barqjs/core";
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
 * const text = signal("");
 * const edits = history(text, { limit: 50 });
 * edits.undo();
 * ```
 */
export function history<T>(source: Signal<T>, options?: HistoryOptions): HistoryHandle<T> {
  const limit = options?.limit ?? 100;
  const past = signal<readonly T[]>([]);
  const future = signal<readonly T[]>([]);

  let current = untrack(source);
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

  renderEffect(() => {
    const next = source();
    if (Object.is(next, current)) return;
    const previous = current;
    current = next;
    if (replaying) return;

    const recorded = [...past.peek(), previous];
    past.set(limit > 0 && recorded.length > limit ? recorded.slice(-limit) : recorded);
    if (future.peek().length > 0) future.set([]);
  });

  const replay = (value: T): void => {
    replaying = true;
    try {
      current = value;
      source.set(value);
    } finally {
      replaying = false;
    }
  };

  return {
    undo() {
      // A write made this tick has not reached the recording effect yet, and
      // undoing past it would skip a step.
      flush();
      const stack = past.peek();
      if (stack.length === 0) return;
      const value = stack[stack.length - 1] as T;
      past.set(stack.slice(0, -1));
      future.set([...future.peek(), current]);
      replay(value);
    },
    redo() {
      flush();
      const stack = future.peek();
      if (stack.length === 0) return;
      const value = stack[stack.length - 1] as T;
      future.set(stack.slice(0, -1));
      past.set([...past.peek(), current]);
      replay(value);
    },
    canUndo: () => past().length > 0,
    canRedo: () => future().length > 0,
    past,
    future,
    clear() {
      past.set([]);
      future.set([]);
    },
    silently(fn) {
      replaying = true;
      try {
        const out = fn();
        current = untrack(source);
        return out;
      } finally {
        replaying = false;
      }
    },
  };
}
