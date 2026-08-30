import { type Signal, isServer, renderEffect, signal } from "@barqjs/core";
import { on } from "./event.ts";

export interface PersistOptions<T> {
  /** Defaults to `localStorage`. Pass `sessionStorage`, or your own implementation. */
  storage?: Storage;
  serialize?: (value: T) => string;
  deserialize?: (raw: string) => T;
  /**
   * Follow writes from other tabs through the `storage` event. On by default,
   * and only meaningful for a real `Storage`, which is the only thing that
   * fires it.
   */
  sync?: boolean;
  /**
   * Called when reading or writing throws. A full quota and a blocked
   * third-party context both throw on `setItem`, and neither should take a
   * render down; without a handler they are swallowed.
   */
  onError?: (error: unknown, phase: "read" | "write") => void;
}

/**
 * A signal backed by web storage.
 *
 * Reads once at creation and writes on every change afterwards. The initial
 * value is not written back, so a key that was never set stays unset until
 * something changes it — which is what makes `Object.keys(localStorage)` stay
 * meaningful.
 *
 * ```ts
 * const theme = persisted("theme", "system");
 * theme.set("dark"); // and it is still dark on the next load
 * ```
 */
export function persisted<T>(key: string, initial: T, options?: PersistOptions<T>): Signal<T> {
  const store = options?.storage ?? (isServer ? undefined : localStorage);
  const serialize = options?.serialize ?? (JSON.stringify as (value: T) => string);
  const deserialize = options?.deserialize ?? (JSON.parse as (raw: string) => T);
  const fail = options?.onError;

  let start = initial;
  if (store !== undefined) {
    try {
      const raw = store.getItem(key);
      if (raw !== null) start = deserialize(raw);
    } catch (error) {
      fail?.(error, "read");
    }
  }

  const value = signal(start);
  if (store === undefined) return value;

  /**
   * What storage is known to hold.
   *
   * A flag set around the write from another tab cannot do this job: the effect
   * that mirrors the signal runs on the next flush, by which point the flag is
   * long back down, and the value another tab just wrote would be written
   * straight back. Comparing the serialised form answers both questions at
   * once — it is also what keeps the initial value from being written when
   * nothing has changed.
   */
  let mirrored: string | undefined;
  try {
    mirrored = serialize(start);
  } catch (error) {
    fail?.(error, "write");
  }

  renderEffect(() => {
    const next = value();
    try {
      const raw = serialize(next);
      if (raw === mirrored) return;
      // After the write, not before: a full quota throws, and storage does not
      // hold what the throw prevented it from holding.
      store.setItem(key, raw);
      mirrored = raw;
    } catch (error) {
      fail?.(error, "write");
    }
  });

  if (options?.sync !== false && !isServer) {
    on(window, "storage", (event) => {
      if (event.key !== key || event.storageArea !== store) return;
      try {
        if (event.newValue === null) {
          mirrored = serialize(initial);
          value.set(initial);
        } else {
          mirrored = event.newValue;
          value.set(deserialize(event.newValue));
        }
      } catch (error) {
        fail?.(error, "read");
      }
    });
  }

  return value;
}

/** {@link persisted} against `sessionStorage`. */
export function persistedSession<T>(
  key: string,
  initial: T,
  options?: Omit<PersistOptions<T>, "storage">,
): Signal<T> {
  return persisted(key, initial, {
    ...options,
    storage: isServer ? undefined : sessionStorage,
  });
}

/**
 * Remove a persisted key and every signal's memory of it.
 *
 * A bare `localStorage.removeItem` leaves any live {@link persisted} signal
 * holding the old value, because nothing in this tab hears its own `storage`
 * event. This writes through the same channel, so the signal follows.
 */
export function clearPersisted(key: string, storage?: Storage): void {
  const store = storage ?? (isServer ? undefined : localStorage);
  if (store === undefined) return;
  const previous = store.getItem(key);
  store.removeItem(key);
  if (isServer) return;
  window.dispatchEvent(
    new StorageEvent("storage", { key, oldValue: previous, newValue: null, storageArea: store }),
  );
}

/** The current value without subscribing, for code outside a reactive scope. */
export function peekPersisted<T>(key: string, fallback: T, storage?: Storage): T {
  const store = storage ?? (isServer ? undefined : localStorage);
  if (store === undefined) return fallback;
  try {
    const raw = store.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
