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

import type { Incoming } from "./config.ts";
import type { Cell } from "./scope.ts";

import { BLOCK, type Arity } from "./signals.ts";

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

/** What a view answers `true` under, so it is known for the record it already is. */
const VIEW = Symbol.for("barq.props.view");

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
      if (key === VIEW) return true;
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

interface Tagged {
  [Symbol.toStringTag]?: string;
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
  return (source as Tagged)[Symbol.toStringTag] === "Store";
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
): Omit<T, K>;
export function omit<T extends object, K extends keyof T & string>(
  source: T,
  ...keys: K[]
): Omit<T, K>;
export function omit(source: object, ...keys: string[]): object {
  return view([source as Record<string, unknown>], { keys: new Set(keys), carriers: false });
}

/**
 * What a prop holds, read from the carrier it crossed as. A prop the caller
 * left out has no carrier and reads `undefined`. A Block is JSX the caller
 * passed, and it is the value: calling it here would build it at every read,
 * where the component means to place it once.
 */
export function readProp(held: unknown): unknown {
  if (typeof held !== "function") return held;
  return (held as unknown as Record<symbol, unknown>)[BLOCK] === true
    ? held
    : (held as () => unknown)();
}

/**
 * What an element's attribute reads from a prop: the value, or an accessor's
 * value where the prop holds one. An attribute never holds a function, so
 * `aria-current={() => …}` handed through a component is the accessor, and
 * reading it here is what makes the attribute's effect follow it.
 */
export function readAttr(held: unknown): unknown {
  if (typeof held !== "function") return held;
  if ((held as unknown as Record<symbol, unknown>)[BLOCK] === true) return held;
  const value = (held as () => unknown)();
  return typeof value === "function" &&
    (value as unknown as Record<symbol, unknown>)[BLOCK] !== true
    ? (value as () => unknown)()
    : value;
}

/**
 * What a tag that names a prop calls: `<props.as />`. The value, read as
 * `readProp` reads it, except that a function taking something is called by
 * the tag itself rather than read: a server component's slot is one, and
 * reading it would place it once with nothing.
 */
export function readTag(held: unknown): unknown {
  if (typeof held === "function" && (held as Arity).length > 0) return held;
  return readProp(held);
}

/**
 * The Cell of a prop that has a default. The default is made once, the first
 * time the prop reads `undefined`, so a default that builds an array or an
 * object is the same one at every read.
 */
export function withDefault<T>(
  record: Record<string, unknown>,
  key: string,
  fallback: () => T,
): Cell<T> {
  let made = false;
  let kept: T;
  return (): T => {
    const value = readProp(record[key]);
    if (value !== undefined) return value as T;
    if (!made) {
      kept = fallback();
      made = true;
    }
    return kept;
  };
}

/** The key a values view answers its record under, for {@link cells}. */
const RECORD = Symbol.for("barq.props.record");

/**
 * A props record as the values it carries: each read calls the prop's Cell,
 * so a read inside an effect follows the prop. This is what a component's
 * `props` is wherever it leaves the component whole, passed to a function or
 * read by a computed key.
 */
export function values<P>(record: Incoming<P>): P;
export function values(record: Record<string, unknown>): Record<string, unknown>;
export function values(record: object): object {
  const held = record as Record<string, unknown>;
  return new Proxy(held, {
    get(target, key: string | symbol): unknown {
      if (key === RECORD) return target;
      if (typeof key === "symbol" || key === "children") return Reflect.get(target, key);
      return readProp(target[key]);
    },
    getOwnPropertyDescriptor(target, key: string | symbol): PropertyDescriptor | undefined {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (descriptor === undefined || typeof key === "symbol" || key === "children") {
        return descriptor;
      }
      return { ...descriptor, value: readProp(target[key]) };
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
 * The record under a component's props, each prop as the Cell it crossed as.
 * For code that takes Cells: a hook that forwards them, or one that reads a
 * prop many times and wants no view between. In a compiled component
 * `cells(props)` is the record itself and costs nothing.
 */
export function cells<P>(given: P): Incoming<P> {
  const record = (given as Record<symbol, unknown> | null | undefined)?.[RECORD];
  return (record ?? given) as Incoming<P>;
}

/**
 * A component written without the compiler, which holds the record and calls
 * each prop: `fromCells((props) => text(props.title()))`. It is the function it
 * was given, typed as the component its callers see.
 */
export function fromCells<P, R>(component: (props: Incoming<P>) => R): (props: P) => R {
  return component as unknown as (props: P) => R;
}

const carried = new WeakMap<object, Record<string, unknown>>();

/**
 * An object of values as a props record: each key as the Cell that reads it.
 * This is what the compiler makes of `<Card {...options} />`, where `options`
 * is an object the author built. A function in it is a value like any other,
 * a handler, and is not taken for a Cell.
 *
 * A record is answered as it is: a view from `omit` or `merge`, and the record
 * under a values view. A function is a source that answers with the object,
 * such as a signal holding one, and is asked at every read. One object is carried once, so a Cell keeps its
 * identity across reads. A part branded by {@link asRecord} keeps its Cells
 * and carries everything else, its handlers included.
 */
export function carry(source: unknown): unknown {
  if (typeof source === "function") return (): unknown => carry((source as () => unknown)());
  if (typeof source !== "object" || source === null) return source;
  const held = source as Record<string | symbol, unknown>;
  if (held[VIEW] === true) return source;
  const record = held[RECORD];
  if (record !== undefined) return record;
  let made = carried.get(source);
  if (made === undefined) {
    made = {};
    const part = held[PART] === true;
    for (const key of Object.keys(source)) {
      const value = held[key];
      made[key] =
        key === "children" || (part && typeof value === "function" && !passesAsIs(key))
          ? value
          : (): unknown => held[key];
    }
    carried.set(source, made);
  }
  return made;
}

/** What {@link asRecord} brands a bag with, for {@link carry}. */
const PART = Symbol.for("barq.props.part");

/** The keys a DOM spread hands a function under as it is: a handler and a `ref`. */
function passesAsIs(key: string): boolean {
  if (key === "ref") return true;
  const third = key.charCodeAt(2);
  return key.startsWith("on") && third >= 65 && third <= 90;
}

/**
 * A props record as a DOM spread takes it. The spread attaches a handler or a
 * `ref` as the function it is handed, so those are read out of their Cells;
 * every other key keeps its Cell, which the spread calls as it calls any
 * getter, and a record with neither is answered as it is. What
 * `<button {...props} />` compiles to.
 */
export function elementProps(record: Record<string, unknown>): Record<string, unknown> {
  let out: Record<string, unknown> | null = null;
  for (const key in record) {
    const held = record[key];
    if (typeof held !== "function" || !passesAsIs(key)) continue;
    if (out === null) {
      out = {};
      for (const each in record) out[each] = record[each];
    }
    out[key] = readProp(held);
  }
  return out ?? record;
}

/**
 * Mark an object as the props of a part, written for a DOM spread: a handler
 * or a `ref` is the function itself, and every other function member is a
 * Cell. Spread onto a component it is taken key by key in the same terms, so a
 * handler crosses as the value it is and is not called when the component
 * reads it. For a library that builds the props of a part by hand and lets the
 * caller place them on an element or on a component.
 */
export function asRecord<T extends object>(bag: T): T {
  Object.defineProperty(bag, PART, { value: true });
  return bag;
}
