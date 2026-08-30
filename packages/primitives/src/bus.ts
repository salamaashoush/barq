import { type Accessor, signal } from "@barqjs/core";
import { type Clear, tryCleanup } from "./utils.ts";

export interface Emitter<T> {
  /** Subscribe. Unsubscribed with the owning scope, or through the returned function. */
  listen: (handler: (payload: T) => void) => Clear;
  emit: (payload: T) => void;
  clear: Clear;
  /** How many handlers are subscribed. */
  size: () => number;
}

/**
 * A typed event emitter whose subscriptions follow scope ownership.
 *
 * The point over an `EventTarget`: a component that subscribes and is then
 * unmounted does not have to remember to unsubscribe, which is where the leaks
 * in hand-rolled buses come from.
 *
 * Handlers are called on a snapshot, so a handler that unsubscribes — or
 * subscribes another — does not change who receives the event in flight.
 */
export function emitter<T = void>(): Emitter<T> {
  const handlers = new Set<(payload: T) => void>();

  return {
    listen(handler) {
      handlers.add(handler);
      const clear = (): void => {
        handlers.delete(handler);
      };
      tryCleanup(clear);
      return clear;
    },
    emit(payload) {
      if (handlers.size === 0) return;
      // A snapshot, so a handler that unsubscribes — or subscribes another —
      // does not change who receives the event in flight.
      const receiving = Array.from(handlers);
      for (const handler of receiving) handler(payload);
    },
    clear() {
      handlers.clear();
    },
    size: () => handlers.size,
  };
}

export interface Bus<T> extends Emitter<T> {
  /** The last payload emitted, or `undefined` before the first. */
  last: Accessor<T | undefined>;
}

/**
 * An {@link emitter} that also remembers its last payload as a signal, so a
 * component that mounts after an event can still see it.
 *
 * The signal compares as never equal, so two identical payloads in a row are
 * two updates. An event that happened twice is two events.
 */
export function bus<T>(): Bus<T> {
  const base = emitter<T>();
  const last = signal<T | undefined>(undefined, { equals: false });

  return {
    ...base,
    emit(payload) {
      last.set(payload);
      base.emit(payload);
    },
    last,
  };
}

/**
 * A dependency with no value: read it to subscribe, call `dirty()` to
 * invalidate every reader.
 *
 * What a cache invalidation or a manual refetch wants, and what a
 * `signal(0, { equals: false })` written by hand is trying to be.
 */
export function trigger(): [track: () => void, dirty: Clear] {
  const version = signal(0, { equals: false });
  return [
    () => {
      version();
    },
    () => version.set(0),
  ];
}
