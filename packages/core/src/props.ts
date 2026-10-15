/**
 * The props model.
 *
 * Every own property of a props object is a `Cell` (`() => T`) or a `Block`
 * (`(s, ...cells) => Out`). Never a getter. A spread is an ordered list of
 * SOURCES resolved on read, never a JavaScript spread, so there is no object
 * to flatten and the only way to reach a value is through its carrier.
 *
 * That is what makes the getter-flattening class impossible rather than
 * diagnosable: `{...props}`, a rest destructure, `Object.assign`, `for…in`,
 * `merge` and `omit` all copy Cells, and copying a Cell
 * evaluates nothing. `props.test.ts` is the falsification procedure.
 */

import type { Cell } from "./scope.ts";

export { BLOCK, block, isBlock } from "./signals.ts";

type Held = Record<string, unknown> | null | undefined;

/**
 * One entry of a source list: a props record, a nested source list's owner, or
 * a function that answers with one.
 *
 * The function is a spread whose object is itself read from something that
 * moves, `<Foo {...rest()} />`. It is asked on every read, by whoever reads,
 * so the reader's effect is what subscribes; evaluated at the call site the
 * component held the first object for good.
 */
export type Source = Held | (() => Held);

function recordOf(source: Source): Held {
  return typeof source === "function" ? source() : source;
}

/** The key a source list is published under, so a merge over a merge stays flat. */
export const SOURCES = "$";

/** Which keys a view drops. `null` drops none. */
interface Filter {
  readonly keys: ReadonlySet<string> | null;
  /**
   * Whether a plain value is presented as the Cell the props model says every
   * prop is. See {@link carrier}.
   *
   * True for the COMPILER's carrier and nothing else. `omit` and `merge` are
   * utilities over ordinary objects, and a
   * caller merging `{ count: 1 }` wants `count` to be `1`.
   */
  readonly carriers: boolean;
}

const ALL: Filter = { keys: null, carriers: false };
/** {@link props}: the compiler's source list, where every prop is a Cell. */
const ALL_AS_CARRIERS: Filter = { keys: null, carriers: true };

function admits(filter: Filter, key: string): boolean {
  return filter.keys === null || !filter.keys.has(key);
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
    if (typeof source === "object" && source !== null && Array.isArray(source[SOURCES])) {
      nested = true;
      break;
    }
  }
  if (!nested) return sources as Source[];

  const flat: Source[] = [];
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    if (source === null || source === undefined) continue;
    if (typeof source === "function") {
      flat.push(source);
      continue;
    }
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

/**
 * The prop, as the Cell the model says every prop is.
 *
 * A source list holds two kinds of record. The compiler's are all carriers by
 * construction — `{ onPress: () => handler, title: _k$1 }` — and a SPREAD is
 * whatever the caller wrote, which is ordinarily plain values. Both arrive
 * here, and a callee reads `props.k()` without knowing which it got: a spread
 * of `{ trend: "up" }` therefore reached it as `props.trend is not a function`,
 * on code the type checker passed, because `Outgoing` admits a bare `T` on the
 * understanding that the compiler wraps it and the compiler cannot wrap a key
 * it only sees at run time.
 *
 * So the wrap happens on the read instead, and the rule is the one `cell_for`
 * already applies per attribute: a value already carrying the calling
 * convention is FORWARDED BY NAME and never re-wrapped, and anything else
 * crosses as a Cell. That makes this a no-op on every compiler-built record,
 * which is what lets it sit on the shared path rather than behind a flag.
 *
 * `undefined` is left alone, and that is load-bearing: a prop the caller
 * omitted is not an own property, the read is `props.k?.()`, and the default
 * lives beside it. Wrapping absence would make every optional prop present.
 *
 * The Cell reads THROUGH rather than closing over the value, so a source
 * object mutated after the first read is still seen.
 */
function carrier(
  sources: readonly Source[],
  filter: Filter,
  key: string,
  minted: Map<string, Cell<unknown>>,
): unknown {
  const value = lookup(sources, filter, key);
  if (!filter.carriers || typeof value === "function" || value === undefined) return value;
  let held = minted.get(key);
  if (held === undefined) {
    held = (): unknown => lookup(sources, filter, key);
    minted.set(key, held);
  }
  return held;
}

function lookup(sources: readonly Source[], filter: Filter, key: string): unknown {
  if (!admits(filter, key)) return undefined;
  for (let i = sources.length - 1; i >= 0; i--) {
    const source = recordOf(sources[i]);
    if (source === null || source === undefined) continue;
    if (!(key in source)) continue;
    return source[key];
  }
  return undefined;
}

function present(sources: readonly Source[], filter: Filter, key: string): boolean {
  if (!admits(filter, key)) return false;
  for (let i = sources.length - 1; i >= 0; i--) {
    const source = recordOf(sources[i]);
    if (source === null || source === undefined) continue;
    if (!(key in source)) continue;
    return true;
  }
  return false;
}

function keysOf(sources: readonly Source[], filter: Filter): string[] {
  const seen = new Set<string>();
  for (let i = 0; i < sources.length; i++) {
    const source = recordOf(sources[i]);
    if (source === null || source === undefined) continue;
    for (const key of Object.keys(source)) {
      if (key === SOURCES) continue;
      if (!admits(filter, key)) continue;
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
 * keys `omit` exists to remove.
 */
function view(sources: readonly Source[], filter: Filter): Record<string, unknown> {
  const list = flatten(sources);
  // One Cell per key, minted on first read and kept. A consumer can observe a
  // prop's IDENTITY — a handler compared across renders, an array in a `For` —
  // so `props.k === props.k` has to hold, and a fresh closure per read would
  // break exactly the claim C3.4 makes about copying a Cell.
  const minted = new Map<string, Cell<unknown>>();
  // A fresh, EXTENSIBLE target: the ownKeys invariant rejects a key the target
  // does not have unless the target can grow, and a frozen one cannot.
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(_target, key: string | symbol): unknown {
      if (typeof key === "symbol") return undefined;
      if (key === SOURCES) return filter.keys === null ? list : undefined;
      return carrier(list, filter, key, minted);
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
        value: carrier(list, filter, key, minted),
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
    // Returned UNCHANGED only when it is already all carriers, which every
    // compiler-built record is and which is the overwhelming case. A lone
    // spread — `<Foo {...values} />` emits one source and nothing else — is
    // the one shape that would otherwise skip the read path entirely and hand
    // the callee raw values.
    if (
      typeof only === "object" &&
      only !== null &&
      !Array.isArray(only[SOURCES]) &&
      carriers(only)
    ) {
      return only;
    }
  }
  return view(sources, ALL_AS_CARRIERS);
}

/** Whether every own value is already a Cell or a Block, so a view buys nothing. */
function carriers(source: Record<string, unknown>): boolean {
  for (const key in source) {
    const value = source[key];
    if (typeof value !== "function" && value !== undefined) return false;
  }
  return true;
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
 * Whether reading a key from `source` has to go through a live lookup.
 *
 * A props VIEW resolves its keys from a source list on read, and a STORE
 * resolves them from its own nodes, so copying either one flattens a thing
 * whose whole point is not to be flattened. An ordinary object is not like
 * that: its keys are already there, and its values are Cells that copying does
 * not evaluate.
 */
function isLive(source: Held): boolean {
  if (source === null || source === undefined || typeof source !== "object") return false;
  if (SOURCES in source) return true;
  return (source as { [Symbol.toStringTag]?: string })[Symbol.toStringTag] === "Store";
}

/**
 * Merge sources that are all ordinary objects into an ordinary object, or
 * `null` when one of them resolves on read and the view is needed.
 *
 * The view buys nothing over plain objects and costs the three things the
 * specification asks about: a merge of ONE source is no longer that source,
 * `Object.keys` goes through a trap rather than being the object's own, and a
 * plain value stays LIVE — mutating the source after the merge changes what the
 * merge answers, which nobody merging `{ type: "button" }` into props means.
 */
function fold(sources: readonly Source[]): Record<string, unknown> | null {
  let last: Record<string, unknown> | null = null;
  let lastIndex = -1;
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    if (source === null || source === undefined) continue;
    if (typeof source === "function" || isLive(source)) return null;
    last = source;
    lastIndex = i;
  }
  if (last === null) return null;

  const out: Record<string, unknown> = {};
  let fromLastOnly = true;
  for (let i = 0; i < sources.length; i++) {
    const source = recordOf(sources[i]);
    if (source === null || source === undefined) continue;
    for (const key of Object.keys(source)) {
      if (key === "__proto__" || key === "constructor") continue;
      if (i !== lastIndex) fromLastOnly = false;
      out[key] = source[key];
    }
  }
  // Every key came from the last source, so the merge IS that source.
  return fromLastOnly && Object.keys(out).length === Object.keys(last).length ? last : out;
}

/** What a source yields: itself, or what a function source answers with. */
type Yielded<S> = S extends (...args: never[]) => infer R ? R : S;

/**
 * The record a source contributes. A source that may be absent contributes
 * every key optionally, which is what makes a possibly `undefined` spread
 * merge without claiming keys it may not have.
 */
type SourceRecord<S> =
  undefined extends Yielded<S>
    ? Partial<NonNullable<Yielded<S>>>
    : null extends Yielded<S>
      ? Partial<NonNullable<Yielded<S>>>
      : NonNullable<Yielded<S>>;

type Flatten<T> = T extends unknown ? { [K in keyof T]: T[K] } : never;

type OptionalKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? K : never }[keyof T];

/**
 * One source laid over another where `undefined` is a value. A key the later
 * source requires is the later source's, whatever it holds. A key it declares
 * optional may be absent, and then the earlier source still answers, so the
 * result is either.
 */
type Over<T, U> = T extends unknown
  ? U extends unknown
    ? Flatten<
        Pick<T, Exclude<keyof T, keyof U>> &
          Pick<U, Exclude<keyof U, OptionalKeys<U>>> & {
            [K in keyof Pick<T, OptionalKeys<U> & keyof T>]: T[K] | U[K & keyof U];
          } & Pick<U, Exclude<OptionalKeys<U>, keyof T>>
      >
    : never
  : never;

/** What `merge` answers with: its sources, each laid over the ones before it. */
export type Merge<T extends unknown[]> = T extends []
  ? object
  : T extends [infer Only]
    ? SourceRecord<Only>
    : T extends [infer First, infer Second, ...infer Rest]
      ? Merge<[Over<SourceRecord<First>, SourceRecord<Second>>, ...Rest]>
      : Record<string, unknown>;

/**
 * Later sources override earlier ones, and a later `undefined` is a value that
 * overrides too. Copies nothing: over a props view the result is a view over
 * the same carriers, so a Cell that has not been called still has not been
 * called.
 */
export function merge<T extends unknown[]>(...sources: T): Merge<T> {
  const list = sources as Source[];
  return (fold(list) ?? view(list, ALL)) as Merge<T>;
}

/** The props without `keys`. What a rest destructure would do, without copying. */
export function omit<T extends Record<string, unknown>, K extends keyof T & string>(
  source: T,
  ...keys: K[]
): Omit<T, K> {
  return view([source], { keys: new Set(keys), carriers: false }) as Omit<T, K>;
}
