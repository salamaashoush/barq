/**
 * The props model — `CODESIGN.md` §3.0/§3.3 C3–C5, `SEMANTICS.md` C3.*.
 *
 * Every own property of a props object is a `Cell` (`() => T`) or a `Block`
 * (`(s, ...cells) => Out`). Never a getter. A spread is an ordered list of
 * SOURCES resolved on read, never a JavaScript spread, so there is no object
 * to flatten and the only way to reach a value is through its carrier.
 *
 * That is what makes the getter-flattening class impossible rather than
 * diagnosable: `{...props}`, a rest destructure, `Object.assign`, `for…in`,
 * `mergeProps`, `splitProps` and `omit` all copy Cells, and copying a Cell
 * evaluates nothing. `props.test.ts` is the falsification procedure.
 */

import type { Cell } from "./scope.ts";

export { BLOCK, block, isBlock } from "./signals.ts";

/** One entry of a source list: a props record, or a nested source list's owner. */
export type Source = Record<string, unknown> | null | undefined;

/** The key a source list is published under, so a merge over a merge stays flat. */
export const SOURCES = "$";

/** Which keys a view admits. `null` means all of them. */
interface Filter {
  readonly keys: ReadonlySet<string> | null;
  /** With `keys`, whether they are the kept set or the dropped set. */
  readonly keep: boolean;
  /** `mergeProps`: a later `undefined` does not override an earlier value. */
  readonly skipUndefined: boolean;
}

const ALL: Filter = { keys: null, keep: false, skipUndefined: false };
const ALL_DEFINED: Filter = { keys: null, keep: false, skipUndefined: true };

function admits(filter: Filter, key: string): boolean {
  const keys = filter.keys;
  if (keys === null) return true;
  return filter.keep ? keys.has(key) : !keys.has(key);
}

/**
 * Flatten a source list one level: a source that is itself a view publishes
 * its own list under `$`, and splicing it in keeps a merge of a merge linear
 * instead of nesting a proxy per hop (Vue Vapor's `RawProps.$`).
 */
function flatten(sources: readonly Source[]): Source[] {
  let nested = false;
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    if (source !== null && source !== undefined && Array.isArray(source[SOURCES])) {
      nested = true;
      break;
    }
  }
  if (!nested) return sources as Source[];

  const flat: Source[] = [];
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    if (source === null || source === undefined) continue;
    const inner = source[SOURCES];
    if (Array.isArray(inner)) {
      const list = flatten(inner as readonly Source[]);
      for (let j = 0; j < list.length; j++) flat.push(list[j]);
    } else {
      flat.push(source);
    }
  }
  return flat;
}

function lookup(sources: readonly Source[], filter: Filter, key: string): unknown {
  if (!admits(filter, key)) return undefined;
  for (let i = sources.length - 1; i >= 0; i--) {
    const source = sources[i];
    if (source === null || source === undefined) continue;
    if (!(key in source)) continue;
    const value = source[key];
    if (filter.skipUndefined && value === undefined) continue;
    return value;
  }
  return undefined;
}

function present(sources: readonly Source[], filter: Filter, key: string): boolean {
  if (!admits(filter, key)) return false;
  for (let i = sources.length - 1; i >= 0; i--) {
    const source = sources[i];
    if (source === null || source === undefined) continue;
    if (!(key in source)) continue;
    if (filter.skipUndefined && source[key] === undefined) continue;
    return true;
  }
  return false;
}

function keysOf(sources: readonly Source[], filter: Filter): string[] {
  const seen = new Set<string>();
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    if (source === null || source === undefined) continue;
    for (const key of Object.keys(source)) {
      if (key === SOURCES) continue;
      if (!admits(filter, key)) continue;
      if (filter.skipUndefined && !present(sources, filter, key)) continue;
      seen.add(key);
    }
  }
  return [...seen];
}

/**
 * A live view of a source list. Reads walk the list backwards, so the last
 * source wins; `ownKeys`/`has` union it. Nothing is copied and nothing is
 * called, so the view is exactly as lazy as the carriers it holds.
 *
 * An unfiltered view republishes its list under `$`; a filtered one does not,
 * because a consumer that spliced the raw list back in would resurrect the
 * keys `omit` and `splitProps` exist to remove.
 */
function view(sources: readonly Source[], filter: Filter): Record<string, unknown> {
  const list = flatten(sources);
  // A fresh, EXTENSIBLE target: the ownKeys invariant rejects a key the target
  // does not have unless the target can grow, and a frozen one cannot.
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(_target, key: string | symbol): unknown {
      if (typeof key === "symbol") return undefined;
      if (key === SOURCES) return filter.keys === null ? list : undefined;
      return lookup(list, filter, key);
    },
    has(_target, key: string | symbol): boolean {
      if (typeof key === "symbol") return false;
      if (key === SOURCES) return filter.keys === null;
      return present(list, filter, key);
    },
    ownKeys(): string[] {
      return keysOf(list, filter);
    },
    getOwnPropertyDescriptor(_target, key: string | symbol): PropertyDescriptor | undefined {
      if (typeof key === "symbol" || key === SOURCES) return undefined;
      if (!present(list, filter, key)) return undefined;
      return {
        value: lookup(list, filter, key),
        writable: true,
        enumerable: true,
        configurable: true,
      };
    },
    set(): boolean {
      return false;
    },
    deleteProperty(): boolean {
      return false;
    },
  });
}

/**
 * The compiler's spread carrier. `<Foo {...a} b={x} {...c} />` emits
 * `Foo($s, props([a, { b: x }, c]))`.
 *
 * One plain record is returned UNCHANGED — the overwhelming case allocates
 * nothing and reads at object speed.
 */
export function props(sources: readonly Source[]): Record<string, unknown> {
  if (sources.length === 1) {
    const only = sources[0];
    if (only !== null && only !== undefined && !Array.isArray(only[SOURCES])) return only;
  }
  return view(sources, ALL);
}

/**
 * The carrier for a prop whose IDENTITY a consumer can observe — a handler, an
 * array, an object. It evaluates once, so `props.onClick() === props.onClick()`
 * holds under C3.1's totality. A Cell built from an expression is not memoised
 * (C3.2); a Cell built from a value has nothing to memoise.
 */
export function cell<T>(value: T): Cell<T> {
  return (): T => value;
}

/**
 * Later sources override earlier ones; a later `undefined` does not. Copies
 * nothing: the result is a view over the same carriers, so a Cell that has not
 * been called still has not been called.
 */
export function mergeProps(...sources: Source[]): Record<string, unknown> {
  return view(sources, ALL_DEFINED);
}

/** `mergeProps` with `undefined` treated as a value (Solid 2.0's `merge`). */
export function merge(...sources: Source[]): Record<string, unknown> {
  return view(sources, ALL);
}

/** The props without `keys`. What a rest destructure would do, without copying. */
export function omit<T extends Record<string, unknown>, K extends keyof T & string>(
  source: T,
  ...keys: K[]
): Omit<T, K> {
  return view([source], { keys: new Set(keys), keep: false, skipUndefined: false }) as Omit<T, K>;
}

/** Two views of one source list: the `keys` and everything else. */
export function splitProps<T extends Record<string, unknown>, K extends keyof T & string>(
  source: T,
  keys: readonly K[],
): [Pick<T, K>, Omit<T, K>] {
  const set = new Set<string>(keys);
  return [
    view([source], { keys: set, keep: true, skipUndefined: false }) as Pick<T, K>,
    view([source], { keys: set, keep: false, skipUndefined: false }) as Omit<T, K>,
  ];
}
