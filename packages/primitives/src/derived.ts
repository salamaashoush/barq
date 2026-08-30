import { type Accessor, computed, renderEffect, signal, untrack } from "@barqjs/core";
import { type MaybeAccessor, access, tryCleanup } from "./utils.ts";
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

function rateLimited<T>(source: Accessor<T>, schedule: Schedule, wait?: number): Accessor<T> {
  const published = signal(untrack(source));
  const publish = schedule((value: T) => published.set(value), wait);
  let first = true;

  renderEffect(() => {
    const value = source();
    if (first) {
      first = false;
      return;
    }
    publish(value);
  });

  return published;
}

/**
 * The value `source` held before its current one.
 *
 * Driven by a render-phase effect rather than a memo: a lazy derivation only
 * advances when someone reads it, so a `previous` nobody read for three changes
 * would hand back the value from three changes ago.
 */
export function previous<T>(source: Accessor<T>, initial?: T): Accessor<T | undefined> {
  const held = signal<T | undefined>(initial);
  let current = untrack(source);

  renderEffect(() => {
    const next = source();
    if (Object.is(next, current)) return;
    held.set(current);
    current = next;
  });

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
  renderEffect(condition, (value) => (value ? fn(value) : undefined));
}

/** True when every source is truthy. Short-circuits, so later sources are not tracked. */
export function every(...sources: MaybeAccessor<unknown>[]): Accessor<boolean> {
  return computed(() => {
    for (const source of sources) {
      if (!access(source)) return false;
    }
    return true;
  });
}

/** True when any source is truthy. Short-circuits, so later sources are not tracked. */
export function some(...sources: MaybeAccessor<unknown>[]): Accessor<boolean> {
  return computed(() => {
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

interface SelectorEntry {
  count: number;
  readonly selected: ReturnType<typeof signal<boolean>>;
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
  const subs = new Map<K, SelectorEntry>();
  let value = untrack(source);

  const matches = (key: K, against: T): boolean =>
    equals === undefined ? (key as unknown as T) === against : equals(key, against);

  renderEffect(() => {
    const next = source();
    const prev = value;
    if (Object.is(next, prev)) return;
    value = next;

    if (equals === undefined) {
      subs.get(prev as unknown as K)?.selected.set(false);
      subs.get(next as unknown as K)?.selected.set(true);
      return;
    }
    for (const [key, entry] of subs) {
      const now = equals(key, next);
      if (entry.selected.peek() !== now) entry.selected.set(now);
    }
  });

  return (key: K): boolean => {
    let entry = subs.get(key);
    if (entry === undefined) {
      entry = { count: 0, selected: signal(matches(key, value)) };
      subs.set(key, entry);
    }
    const held = entry;
    held.count++;
    // Ref-counted rather than left in place: a virtual list scrolling through
    // a million ids would otherwise grow this map by one entry per id seen.
    tryCleanup(() => {
      if (--held.count === 0 && subs.get(key) === held) subs.delete(key);
    });
    return held.selected();
  };
}
