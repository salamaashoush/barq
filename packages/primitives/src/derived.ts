import {
  type Accessor,
  type Signal,
  createMemo,
  createRenderEffect,
  createSignal,
  getObserver,
  untrack,
} from "@barqjs/core";
import { type MaybeAccessor, access } from "./utils.ts";
import { type Schedule, debounce, scheduleIdle, throttle } from "./scheduled.ts";

/**
 * `source`, republished on the trailing edge `wait` milliseconds after it stops
 * changing. Reads the source's current value immediately, so there is no
 * `undefined` window on the first read.
 */
export function debounced<T>(source: Accessor<T>, wait: number): Accessor<T> {
  return rateLimited(source, debounce, wait);
}

/** `source`, republished at most once per `wait` milliseconds. */
export function throttled<T>(source: Accessor<T>, wait: number): Accessor<T> {
  return rateLimited(source, throttle, wait);
}

/**
 * `source`, republished when the browser is next idle — the cheap way to keep
 * an expensive derived view off the critical path of a keystroke.
 */
export function deferred<T>(source: Accessor<T>, timeout?: number): Accessor<T> {
  return rateLimited(source, scheduleIdle, timeout);
}

/**
 * A signal over a value of any type.
 *
 * `createSignal` takes a function argument as a derivation and a setter takes
 * one as an updater, so a source whose value is itself a function has to be
 * wrapped on the way in or it is called instead of held.
 */
function holding<T>(initial: T): Signal<T> {
  return typeof initial === "function"
    ? createSignal<T>(() => initial)
    : createSignal<T>(initial as Exclude<T, Function>);
}

function rateLimited<T>(source: Accessor<T>, schedule: Schedule, wait?: number): Accessor<T> {
  const [published, setPublished] = holding(untrack(source));
  const publish = schedule((value: T) => {
    setPublished(() => value);
  }, wait);

  createRenderEffect(
    () => source(),
    (value) => publish(value),
    { defer: true },
  );

  return published;
}

/**
 * The value `source` held before its current one.
 *
 * Driven by a render-phase effect rather than a memo: a memo with no owner
 * only advances when someone reads it, so a `previous` nobody read for three
 * changes would hand back the value from three changes ago.
 */
export function previous<T>(source: Accessor<T>, initial?: T): Accessor<T | undefined> {
  const [held, setHeld] = holding<T | undefined>(initial);
  let current = untrack(source);

  createRenderEffect(
    () => source(),
    (next) => {
      if (Object.is(next, current)) return;
      const before = current;
      current = next;
      setHeld(() => before);
    },
    { defer: true },
  );

  return held;
}

/**
 * Run `fn` while `condition` is truthy, and only then.
 *
 * `fn` receives the narrowed value and may return a cleanup, which runs when
 * the condition changes or goes falsy. Nothing runs, and no cleanup is due,
 * while the condition is falsy.
 */
export function whenever<T>(
  condition: Accessor<T>,
  fn: (value: NonNullable<T>) => void | (() => void),
): void {
  createRenderEffect(condition, (value) => (value ? fn(value) : undefined));
}

/** True when every source is truthy. Short-circuits, so later sources are not tracked. */
export function every(...sources: MaybeAccessor<unknown>[]): Accessor<boolean> {
  return createMemo(() => {
    for (const source of sources) {
      if (!access(source)) return false;
    }
    return true;
  });
}

/** True when any source is truthy. Short-circuits, so later sources are not tracked. */
export function some(...sources: MaybeAccessor<unknown>[]): Accessor<boolean> {
  return createMemo(() => {
    for (const source of sources) {
      if (access(source)) return true;
    }
    return false;
  });
}

/** The negation of a source, as an accessor. */
export function not(source: MaybeAccessor<unknown>): Accessor<boolean> {
  return () => !access(source);
}

/**
 * Turn "which one is selected" into a per-key subscription.
 *
 * A thousand rows each deriving `id === selected()` is a thousand computations
 * re-run on every change. A selector subscribes each row to its own key, so a
 * change wakes the row that lost the selection and the row that gained it, and
 * nothing else.
 *
 * ```tsx
 * const isSelected = selector(selectedId);
 * <For each={rows}>{(row) => <li classList={{ on: isSelected(row.id) }}>…</li>}</For>
 * ```
 *
 * With the default comparison a change costs two map lookups. A custom
 * `equals` cannot be inverted that way — any key might match — so it costs one
 * pass over the keys currently subscribed, which is still one comparison per
 * row against one recomputation per row.
 */
export function selector<T, K = T>(
  source: Accessor<T>,
  equals?: (key: K, value: T) => boolean,
): (key: K) => boolean {
  const subs = new Map<K, Signal<boolean>>();
  let value = untrack(source);

  const matches = (key: K, against: T): boolean =>
    equals === undefined ? (key as unknown as T) === against : equals(key, against);

  createRenderEffect(
    () => source(),
    (next) => {
      const prev = value;
      if (Object.is(next, prev)) return;
      value = next;

      if (equals === undefined) {
        subs.get(prev as unknown as K)?.[1](false);
        subs.get(next as unknown as K)?.[1](true);
        return;
      }
      for (const [key, entry] of subs) entry[1](equals(key, next));
    },
    { defer: true },
  );

  return (key: K): boolean => {
    if (getObserver() === null) return matches(key, untrack(source));
    let entry = subs.get(key);
    if (entry === undefined) {
      const created: Signal<boolean> = createSignal(matches(key, untrack(source)), {
        // Dropped with its last reader rather than left in place: a virtual
        // list scrolling through a million ids would otherwise grow this map
        // by one entry per id seen.
        unobserved: () => {
          if (subs.get(key) === created) subs.delete(key);
        },
      });
      subs.set(key, created);
      entry = created;
    }
    return entry[0]();
  };
}
