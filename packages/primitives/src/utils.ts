import { type Accessor, getOwner, onCleanup, root, runWithOwner } from "@barqjs/core";

/** A value, or a zero-argument function producing one. */
export type MaybeAccessor<T> = T | Accessor<T>;

/** The value behind a {@link MaybeAccessor}. */
export type MaybeAccessorValue<T extends MaybeAccessor<unknown>> = T extends () => infer V ? V : T;

/** What every subscription in this package hands back. */
export type Clear = () => void;

export type AnyFunction = (...args: never[]) => unknown;

/** Does nothing, returns nothing. */
export const noop = (): void => {};

export const trueFn = (): true => true;
export const falseFn = (): false => false;

/**
 * Read a {@link MaybeAccessor}.
 *
 * The arity test is what keeps this from calling a value that happens to be a
 * function: an event handler, a component, a class. A barq accessor takes no
 * arguments, so `length === 0` is the whole discriminator, and anything
 * declaring a parameter is returned as-is.
 */
export function access<T extends MaybeAccessor<unknown>>(value: T): MaybeAccessorValue<T> {
  return typeof value === "function" && value.length === 0
    ? (value as () => MaybeAccessorValue<T>)()
    : (value as MaybeAccessorValue<T>);
}

/** A {@link MaybeAccessor} as an accessor, without wrapping one that already is. */
export function asAccessor<T extends MaybeAccessor<unknown>>(
  value: T,
): Accessor<MaybeAccessorValue<T>> {
  return typeof value === "function" && value.length === 0
    ? (value as Accessor<MaybeAccessorValue<T>>)
    : () => value as MaybeAccessorValue<T>;
}

/** `[]` for nullish, the array itself for an array, a single-element array otherwise. */
export function asArray<T>(value: T | readonly T[] | null | undefined): readonly T[] {
  return value === null || value === undefined ? [] : Array.isArray(value) ? value : [value as T];
}

export function clamp(n: number, min: number, max: number): number {
  return n < min ? min : n > max ? max : n;
}

/** Shallow element-wise equality. */
export function arrayEquals(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

/** One function calling each of `fns` in order with the same arguments. */
export function chain<Args extends unknown[]>(
  ...fns: (((...args: Args) => void) | undefined | null)[]
): (...args: Args) => void {
  return (...args: Args) => {
    for (const fn of fns) fn?.(...args);
  };
}

/**
 * `onCleanup`, but only when there is an owner to register with.
 *
 * Without the guard a primitive used at module scope files its cleanup in the
 * runtime's orphan list, which the next `render()` adopts: the listener would
 * then be removed when an unrelated tree unmounts. Returns whether the cleanup
 * was registered, so a caller can decide to tear down by hand.
 */
export function tryCleanup(fn: Clear): boolean {
  if (getOwner() === null) return false;
  onCleanup(fn);
  return true;
}

/**
 * `fn`, bound to the owner in scope right now.
 *
 * Reactive primitives created inside the returned function belong to that
 * owner, so an async continuation or an event handler can still create an
 * effect that is disposed with the component.
 */
export function owned<T extends AnyFunction>(fn: T): T {
  const owner = getOwner();
  if (owner === null) return fn;
  return ((...args: Parameters<T>) =>
    runWithOwner(owner, () => fn(...(args as never[])))) as unknown as T;
}

/**
 * A callback deferred to the microtask queue, coalescing repeat calls within
 * one tick and cancelled when its owner disposes. Only the last arguments are
 * delivered.
 */
export function microtask<Args extends unknown[]>(
  fn: (...args: Args) => void,
): (...args: Args) => void {
  let queued = false;
  let disposed = false;
  let last: Args;
  tryCleanup(() => {
    disposed = true;
  });
  return (...args: Args) => {
    last = args;
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!disposed) fn(...last);
    });
  };
}

/**
 * A root shared by every caller asking for the same key, created on the first
 * call for that key and disposed when the last owner that asked for it goes
 * away.
 *
 * This is what makes a global source cost one subscription instead of one per
 * component: fifty components asking for `(min-width: 600px)` share one
 * `MediaQueryList` and one listener, while a different query gets its own.
 *
 * A call with no owner cannot be counted — nothing would ever release it — so
 * it pins that key open for the life of the program rather than handing back a
 * value some later disposal can pull out from under it.
 */
export function sharedKeyed<K, T>(factory: (key: K) => T): (key: K) => T {
  const entries = new Map<K, { count: number; pinned: boolean; value: T; dispose: Clear }>();

  return (key: K): T => {
    let entry = entries.get(key);
    if (entry === undefined) {
      const created = { count: 0, pinned: false, value: undefined as T, dispose: noop };
      entries.set(key, created);
      created.value = root((dispose) => {
        created.dispose = dispose;
        return factory(key);
      });
      entry = created;
    }
    const held = entry;

    if (getOwner() === null) {
      held.pinned = true;
    } else {
      held.count++;
      onCleanup(() => {
        held.count--;
        // Deferred: a component that unmounts in the same tick as another
        // mounts must not tear the root down between the two.
        queueMicrotask(() => {
          if (held.count > 0 || held.pinned || entries.get(key) !== held) return;
          entries.delete(key);
          held.dispose();
        });
      });
    }

    return held.value;
  };
}

const SINGLETON = Symbol("shared");

/**
 * A root shared by every caller. {@link sharedKeyed} with one key.
 *
 * ```ts
 * const windowSize = shared(() => { … });
 * ```
 */
export function shared<T>(factory: () => T): Accessor<T> {
  const keyed = sharedKeyed<symbol, T>(factory);
  return () => keyed(SINGLETON);
}
