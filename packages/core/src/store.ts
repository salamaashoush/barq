/**
 * Store - Fine-grained reactive state management (Solid 2.0-style)
 *
 * Structural reactivity: every raw object in the store lazily owns a map of
 * per-property nodes (signals). Reads through the proxy track the property
 * node of the object actually holding the value; writes notify exactly that
 * node. No string paths, no prefix scans - replacing a nested object only
 * notifies its property node, and subscribers re-wire through the new value
 * when they re-run.
 */

import { type Signal, batch, isTracking, renderEffect, signal } from "./signals.ts";

/**
 * Deep readonly type for store state
 */
type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

/**
 * Path segment type for deep updates
 */
type PathSegment = string | number | symbol;

/**
 * Store setter function type with path-based overloads
 *
 * Supports multiple calling conventions:
 * - setState(updates) - partial object update
 * - setState(fn) - draft function: mutate the draft, or return a partial
 * - setState(key, value) - single property update
 * - setState(key, fn) - single property with updater function
 * - setState(key1, key2, value) - nested path update (2 levels)
 * - setState(key1, key2, key3, value) - nested path update (3 levels)
 * - setState(key1, key2, key3, key4, value) - nested path update (4 levels)
 * - setState(...path, value) - arbitrary depth path update
 */
type StoreSetter<T> = {
  // Single arg: partial updates or draft function (mutate draft, or return a partial)
  (updates: Partial<T>): void;
  (fn: (state: T) => Partial<T> | void): void;

  // Two args: key + value/function/partial
  <K extends keyof T>(key: K, value: T[K] | ((prev: T[K]) => T[K])): void;
  <K extends keyof T>(key: K, nested: Partial<T[K]>): void;

  // Three args: path of depth 2
  <K1 extends keyof T, K2 extends keyof T[K1]>(
    k1: K1,
    k2: K2,
    value: T[K1][K2] | ((prev: T[K1][K2]) => T[K1][K2]),
  ): void;

  // Four args: path of depth 3
  <K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2]>(
    k1: K1,
    k2: K2,
    k3: K3,
    value: T[K1][K2][K3] | ((prev: T[K1][K2][K3]) => T[K1][K2][K3]),
  ): void;

  // Five args: path of depth 4
  <
    K1 extends keyof T,
    K2 extends keyof T[K1],
    K3 extends keyof T[K1][K2],
    K4 extends keyof T[K1][K2][K3],
  >(
    k1: K1,
    k2: K2,
    k3: K3,
    k4: K4,
    value: T[K1][K2][K3][K4] | ((prev: T[K1][K2][K3][K4]) => T[K1][K2][K3][K4]),
  ): void;

  // Variadic for deeper paths (less type-safe but flexible)
  (...pathAndValue: [...PathSegment[], unknown]): void;
};

/**
 * Store tuple: [state, setState]
 */
export type Store<T extends object> = [DeepReadonly<T>, StoreSetter<T>];

/** Symbol to extract the raw target from a store proxy */
const RAW = Symbol("barq-store-raw");

/**
 * Read `store[$TRACK]` to subscribe to the object's shape - any key added or
 * removed - rather than to one property.
 */
export const $TRACK: unique symbol = Symbol("barq-store-track");

/** Read `store[$TARGET]` for the raw object behind a store proxy. */
export const $TARGET: unique symbol = RAW as unknown as typeof $TARGET;

// Internal state lives in non-enumerable symbol properties on the raw
// objects themselves (faster than WeakMap lookups on the hot path).
// Object.keys / for..in / spread (non-enumerable) / JSON all ignore them.
const $NODES = Symbol("barq-store-nodes");
const $SELF = Symbol("barq-store-self");
/** Read `raw[$PROXY]` for the store proxy wrapping a raw object, if any. */
export const $PROXY: unique symbol = Symbol("barq-store-proxy");
const $DRAFT = Symbol("barq-store-draft");

interface StoreTarget {
  [$NODES]?: Map<PropertyKey, Signal<unknown>>;
  [$SELF]?: Signal<number>;
  [$PROXY]?: object;
  [$DRAFT]?: object;
}

function setHidden<K extends PropertyKey>(target: object, key: K, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    writable: true,
    configurable: true,
  });
}

/** Whether a value would be wrapped in a store proxy (plain object or array). */
export function isWrappable(value: unknown): value is object {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function trackProperty(target: StoreTarget, prop: PropertyKey, value: unknown): void {
  let nodes = target[$NODES];
  if (!nodes) {
    nodes = new Map();
    setHidden(target, $NODES, nodes);
  }
  let node = nodes.get(prop);
  if (!node) {
    node = signal(value);
    nodes.set(prop, node);
  }
  node();
}

function trackSelf(target: StoreTarget): void {
  let node = target[$SELF];
  if (!node) {
    node = signal(0);
    setHidden(target, $SELF, node);
  }
  node();
}

function bumpSelf(target: StoreTarget): void {
  const node = target[$SELF];
  if (node) node.update((n) => n + 1);
}

const readHandler: ProxyHandler<object> = {
  get(target, prop) {
    if (prop === RAW) return target;
    if (prop === ($TRACK as symbol)) {
      if (isTracking()) trackSelf(target);
      return target;
    }
    if (prop === Symbol.toStringTag) return "Store";
    if (typeof prop === "symbol") return Reflect.get(target, prop);

    const value = (target as Record<string, unknown>)[prop];

    // Prototype methods (Array.prototype.map, ...) are returned as-is;
    // calling them with the proxy as `this` tracks indices/length reads
    if (typeof value === "function" && !Object.hasOwn(target, prop)) {
      return value;
    }

    if (isTracking()) {
      trackProperty(target, prop, value);
    }

    return isWrappable(value) ? wrap(value) : value;
  },

  has(target, prop) {
    if (typeof prop !== "symbol" && isTracking()) {
      trackProperty(target, prop, (target as Record<string, unknown>)[prop as string]);
    }
    return Reflect.has(target, prop);
  },

  ownKeys(target) {
    if (isTracking()) {
      trackSelf(target);
    }
    return Reflect.ownKeys(target);
  },

  set() {
    console.warn("Direct mutation not allowed. Use setState instead.");
    return false;
  },

  deleteProperty() {
    console.warn("Direct mutation not allowed. Use setState instead.");
    return false;
  },
};

/** Wrap a raw object in a (cached) read proxy */
function wrap<T extends object>(target: T): T {
  let proxy = (target as StoreTarget)[$PROXY];
  if (!proxy) {
    proxy = new Proxy(target, readHandler);
    setHidden(target, $PROXY, proxy);
  }
  return proxy as T;
}

/**
 * Write a property on a raw target, notifying exactly its node (if anyone
 * is subscribed). Array length changes implied by index writes notify the
 * length node too.
 */
function writeProperty(target: object, prop: PropertyKey, value: unknown): void {
  const record = target as Record<PropertyKey, unknown>;
  const had = prop in record;
  const prev = record[prop];
  if (had && (prev === value || (prev !== prev && value !== value))) return;

  const isArray = Array.isArray(target);
  const prevLength = isArray ? (target as unknown[]).length : 0;

  record[prop] = value;

  const nodes = (target as StoreTarget)[$NODES];
  if (nodes) {
    const node = nodes.get(prop);
    if (node) node.set(value);
  }

  if (!had) bumpSelf(target);

  if (isArray && prop !== "length") {
    const newLength = (target as unknown[]).length;
    if (newLength !== prevLength && nodes) {
      const lengthNode = nodes.get("length");
      if (lengthNode) lengthNode.set(newLength);
    }
  }
}

function deletePropertyOnTarget(target: object, prop: PropertyKey): void {
  const record = target as Record<PropertyKey, unknown>;
  if (!(prop in record)) return;
  delete record[prop];

  const nodes = (target as StoreTarget)[$NODES];
  if (nodes) {
    const node = nodes.get(prop);
    if (node) node.set(undefined);
  }
  bumpSelf(target);
}

const draftHandler: ProxyHandler<object> = {
  get(target, prop) {
    if (prop === RAW) return target;
    if (typeof prop === "symbol") return Reflect.get(target, prop);

    const value = (target as Record<string, unknown>)[prop];
    if (typeof value === "function" && !Object.hasOwn(target, prop)) {
      return value;
    }
    return isWrappable(value) ? draft(value) : value;
  },

  set(target, prop, value) {
    writeProperty(target, prop, value);
    return true;
  },

  deleteProperty(target, prop) {
    deletePropertyOnTarget(target, prop);
    return true;
  },
};

/** Wrap a raw object in a (cached) writable draft proxy */
function draft<T extends object>(target: T): T {
  let proxy = (target as StoreTarget)[$DRAFT];
  if (!proxy) {
    proxy = new Proxy(target, draftHandler);
    setHidden(target, $DRAFT, proxy);
  }
  return proxy as T;
}

/**
 * Create a reactive store with fine-grained reactivity
 *
 * @example
 * ```ts
 * const [state, setState] = useStore({
 *   user: { name: "John", age: 30 },
 *   todos: [{ id: 1, text: "Learn signals", done: false }]
 * });
 *
 * // Read (creates subscription)
 * console.log(state.user.name); // "John"
 *
 * // Draft-first update (Solid 2.0)
 * setState(s => { s.user.age++; s.todos.push({ id: 2, text: "x", done: false }); });
 *
 * // Update single property
 * setState("user", { name: "Jane" });
 *
 * // Deep path updates (SolidJS style)
 * setState("user", "address", "city", "NYC");
 *
 * // Array index updates
 * setState("todos", 0, "done", true);
 * ```
 */
export function useStore<T extends object>(initialState: T): Store<T> {
  const state = wrap(initialState) as DeepReadonly<T>;

  const setState: StoreSetter<T> = (...args: unknown[]) => {
    batch(() => {
      if (args.length === 0) return;

      if (args.length === 1) {
        const arg = args[0];
        if (typeof arg === "function") {
          // Draft-first setter (Solid 2.0): mutations on the draft commit
          // fine-grained as they happen; a returned object is applied as a
          // shallow partial update.
          const returned = (arg as (state: T) => unknown)(draft(initialState));
          if (returned !== undefined && typeof returned === "object" && returned !== null) {
            applyUpdates(initialState, returned as Partial<T>);
          }
        } else {
          // setState(updates)
          applyUpdates(initialState, arg as Partial<T>);
        }
      } else if (args.length === 2) {
        const [key, value] = args as [keyof T, unknown];
        if (typeof value === "function") {
          // setState(key, fn)
          const current = initialState[key];
          if (!tryProduceInPlace(value, current)) {
            const newValue = (value as (prev: T[keyof T]) => T[keyof T])(current);
            writeProperty(initialState, key as PropertyKey, newValue);
          }
        } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          // setState(key, partialUpdate) - merge into nested object
          const current = initialState[key];
          if (typeof current === "object" && current !== null) {
            applyUpdates(current as object, value as Partial<object>);
          } else {
            writeProperty(initialState, key as PropertyKey, value);
          }
        } else {
          // setState(key, value)
          writeProperty(initialState, key as PropertyKey, value);
        }
      } else {
        // Path-based setter: setState(k1, k2, ..., value)
        const path = args.slice(0, -1) as PathSegment[];
        const value = args[args.length - 1];
        setByPath(initialState, path, value);
      }
    });
  };

  return [state, setState];
}

/**
 * Set a value at a deep path in the store
 */
function setByPath(root: object, path: PathSegment[], value: unknown): void {
  if (path.length === 0) return;

  // Navigate raw objects to the parent
  let current: unknown = root;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i];
    if (current === null || current === undefined) {
      throw new Error(
        `Cannot set path ${path.map(String).join(".")}: parent is null/undefined at ${String(segment)}`,
      );
    }
    current = (current as Record<PropertyKey, unknown>)[segment];
  }

  if (current === null || typeof current !== "object") {
    throw new Error(`Cannot set path ${path.map(String).join(".")}: parent is not an object`);
  }

  const finalKey = path[path.length - 1];

  let finalValue = value;
  if (typeof value === "function") {
    const currentValue = (current as Record<PropertyKey, unknown>)[finalKey];
    if (tryProduceInPlace(value, currentValue)) return;
    finalValue = (value as (prev: unknown) => unknown)(currentValue);
  }

  writeProperty(current, finalKey, finalValue);
}

/**
 * Apply partial updates to a raw object
 */
function applyUpdates<T extends object>(target: T, updates: Partial<T>): void {
  for (const key of Object.keys(updates)) {
    writeProperty(target, key, (updates as Record<string, unknown>)[key]);
  }
}

/**
 * Unwrap a store proxy to get the underlying raw object
 *
 * Useful when you need to pass store data to external APIs that don't
 * work well with proxies (e.g., JSON.stringify, structuredClone).
 *
 * @example
 * ```ts
 * const [state] = useStore({ user: { name: "John" } });
 *
 * // Get raw object (no reactivity tracking)
 * const raw = unwrap(state);
 * console.log(raw.user.name); // "John" - no subscription created
 *
 * // Safe for serialization
 * JSON.stringify(unwrap(state));
 * ```
 */
export function unwrap<T extends object>(proxy: T): T {
  const raw = (proxy as { [RAW]?: T })[RAW];
  return raw ?? proxy;
}

/** Solid 2.0 name for unwrap: non-reactive plain value of a store */
export const snapshot = unwrap;

/**
 * Create a read-only derived store (Solid 2.0).
 *
 * The derive function runs reactively against a mutable draft of the
 * projection's state; reads of signals/stores inside it re-run the
 * projection, and only the properties that actually changed notify
 * their subscribers (fine-grained). Generalizes createSelector.
 *
 * @example
 * ```ts
 * const selected = createProjection<Record<string, boolean>>((draft) => {
 *   for (const key of Object.keys(draft)) draft[key] = false;
 *   draft[selectedId()] = true;
 * }, {});
 * ```
 */
export function createProjection<T extends object>(
  fn: (draft: T) => void | T,
  seed: T = {} as T,
): DeepReadonly<T> {
  const [state, setState] = useStore(seed);

  renderEffect(() => {
    setState((draftState) => fn(draftState as T) as Partial<T> | void);
  });

  return state;
}

/**
 * Produce - immutable update helper (like Immer)
 *
 * Uses a recording proxy to track mutations and only copies what's changed.
 * More efficient than structuredClone for large objects with small changes.
 * Works with both objects and arrays.
 *
 * @example
 * ```ts
 * setState("users", produce(draft => {
 *   const user = draft.find(u => u.id === 1);
 *   if (user) user.score += 10;
 * }));
 * ```
 */
/** Marks updaters created by produce() for the store's in-place fast path */
const PRODUCE_FN = Symbol("barq-produce-fn");

export function produce<T>(fn: (draft: T) => void): (state: T) => T {
  const updater = (state: T) => {
    // Track copies and parent relationships
    const copies = new Map<object, object>();
    const parents = new Map<object, { parent: object; key: string | symbol }>();
    const proxies = new Map<object, object>();

    // Create a draft proxy that records mutations
    const draftProxy = createDraftProxy(state as object, copies, parents, proxies, null) as T;

    // Run the mutation function
    fn(draftProxy);

    // If nothing was copied, return original
    if (copies.size === 0) {
      return state;
    }

    // Return the copy with modifications (or original if root wasn't copied)
    return (copies.get(state as object) as T) ?? state;
  };
  (updater as { [PRODUCE_FN]?: (draft: T) => void })[PRODUCE_FN] = fn;
  return updater;
}

/**
 * If `updater` came from produce() and the target is a store object, run
 * its mutation function directly against the store draft (fine-grained
 * in-place writes, no copying). Returns true if handled.
 */
function tryProduceInPlace(updater: unknown, current: unknown): boolean {
  const inner = (updater as { [PRODUCE_FN]?: (draft: unknown) => void })?.[PRODUCE_FN];
  if (!inner || !isWrappable(current)) return false;
  inner(draft(current));
  return true;
}

/**
 * Create a draft proxy for produce() that records mutations
 */
function createDraftProxy<T extends object>(
  target: T,
  copies: Map<object, object>,
  parents: Map<object, { parent: object; key: string | symbol }>,
  proxies: Map<object, object>,
  parentInfo: { parent: object; key: string | symbol } | null,
): T {
  // Track parent relationship
  if (parentInfo) {
    parents.set(target, parentInfo);
  }

  // Return existing proxy if we have one
  const existingProxy = proxies.get(target);
  if (existingProxy) {
    return existingProxy as T;
  }

  const handler: ProxyHandler<T> = {
    get(obj, prop) {
      // Get from copy if exists, otherwise from original
      const copy = copies.get(obj);
      const source = (copy ?? obj) as Record<string | symbol, unknown>;
      const value = source[prop];

      // Recursively wrap nested objects
      if (typeof value === "object" && value !== null) {
        return createDraftProxy(value as object, copies, parents, proxies, {
          parent: obj,
          key: prop,
        });
      }

      return value;
    },

    set(obj, prop, value) {
      // Ensure we have a copy of this object and all its ancestors
      ensureCopy(obj, copies, parents);

      // Get the copy and set on it
      const copy = copies.get(obj)!;
      (copy as Record<string | symbol, unknown>)[prop] = value;
      return true;
    },

    deleteProperty(obj, prop) {
      // Ensure we have a copy
      ensureCopy(obj, copies, parents);

      const copy = copies.get(obj)!;
      delete (copy as Record<string | symbol, unknown>)[prop];
      return true;
    },
  };

  const proxy = new Proxy(target, handler);
  proxies.set(target, proxy);
  return proxy;
}

/**
 * Ensure an object and all its ancestors have copies
 */
function ensureCopy(
  obj: object,
  copies: Map<object, object>,
  parents: Map<object, { parent: object; key: string | symbol }>,
): void {
  // If already copied, nothing to do
  if (copies.has(obj)) return;

  // Create copy
  const copy = Array.isArray(obj) ? [...obj] : { ...obj };
  copies.set(obj, copy);

  // Propagate to parent
  const parentInfo = parents.get(obj);
  if (parentInfo) {
    // Ensure parent has a copy too (recursive)
    ensureCopy(parentInfo.parent, copies, parents);

    // Update parent's copy to point to our copy
    const parentCopy = copies.get(parentInfo.parent)!;
    (parentCopy as Record<string | symbol, unknown>)[parentInfo.key] = copy;
  }
}

/**
 * Deep-read a store: subscribes to every nested property reached and returns
 * a plain (non-proxied) copy. Use when a consumer genuinely depends on the
 * whole subtree; prefer reading the specific properties otherwise.
 */
export function deep<T extends object>(store: T): T {
  return deepRead(store, new Map()) as T;
}

function deepRead(value: unknown, seen: Map<object, unknown>): unknown {
  if (!isWrappable(value)) return value;
  const existing = seen.get(value);
  if (existing !== undefined) return existing;

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    seen.set(value, out);
    // Reading through the proxy is what registers the dependencies
    for (let i = 0; i < value.length; i++) out.push(deepRead(value[i], seen));
    return out;
  }

  const out: Record<string, unknown> = {};
  seen.set(value, out);
  for (const key of Object.keys(value)) {
    out[key] = deepRead((value as Record<string, unknown>)[key], seen);
  }
  return out;
}

/** Passed as a storePath value to remove the property instead of setting it */
const STORE_DELETE: unique symbol = Symbol("barq-store-delete");

/** A slice of an array to address: inclusive from..to, stepping by `by` */
export interface StorePathRange {
  from?: number;
  to?: number;
  by?: number;
}

/** One segment of a store path */
export type Part<T = unknown> =
  | PropertyKey
  | readonly PropertyKey[]
  | StorePathRange
  | ((item: T, index: number) => boolean);

interface StorePathFn {
  (...pathAndValue: unknown[]): (state: never) => void;
  readonly DELETE: typeof STORE_DELETE;
}

function isRange(part: unknown): part is StorePathRange {
  if (part === null || typeof part !== "object" || Array.isArray(part)) return false;
  const r = part as StorePathRange;
  return r.from !== undefined || r.to !== undefined || r.by !== undefined;
}

function assign(current: Record<PropertyKey, unknown>, key: PropertyKey, value: unknown): void {
  let next = value;
  if (typeof next === "function") {
    next = (next as (prev: unknown) => unknown)(current[key]);
  }
  if (next === STORE_DELETE) {
    delete current[key];
    return;
  }
  current[key] = next;
}

function applyPath(current: unknown, parts: unknown[], index: number, value: unknown): void {
  if (current === null || typeof current !== "object") return;
  const record = current as Record<PropertyKey, unknown>;
  const part = parts[index];
  const isLast = index === parts.length - 1;

  const step = (key: PropertyKey): void => {
    if (isLast) assign(record, key, value);
    else applyPath(record[key], parts, index + 1, value);
  };

  if (Array.isArray(part)) {
    for (const key of part) step(key as PropertyKey);
    return;
  }
  if (typeof part === "function") {
    if (!Array.isArray(current)) return;
    const filter = part as (item: unknown, index: number) => boolean;
    for (let i = 0; i < current.length; i++) {
      if (filter(current[i], i)) step(i);
    }
    return;
  }
  if (isRange(part)) {
    if (!Array.isArray(current)) return;
    const from = part.from ?? 0;
    const to = part.to ?? current.length - 1;
    const by = part.by ?? 1;
    for (let i = from; i <= to; i += by) step(i);
    return;
  }
  step(part as PropertyKey);
}

/**
 * Path-style store update, for porting Solid 1.x `setStore("a", "b", value)`
 * calls. Returns a draft mutator, so it composes with the normal setter:
 * `setState(storePath("user", "name", "Grace"))`.
 *
 * A path segment can be a key, an array of keys, a `{ from, to, by }` range
 * over an array, or a `(item, index) => boolean` filter. The last argument is
 * the value or an updater `(prev) => next`; pass `storePath.DELETE` to remove.
 */
export const storePath: StorePathFn = Object.assign(
  (...pathAndValue: unknown[]) =>
    (state: never): void => {
      if (pathAndValue.length === 0) return;
      const value = pathAndValue[pathAndValue.length - 1];
      const parts = pathAndValue.slice(0, -1);
      if (parts.length === 0) {
        if (value !== null && typeof value === "object") {
          Object.assign(state as object, value);
        }
        return;
      }
      applyPath(state, parts, 0, value);
    },
  { DELETE: STORE_DELETE } as { readonly DELETE: typeof STORE_DELETE },
);

/**
 * Options for the reconcile function
 */
export interface ReconcileOptions<T> {
  /** Property to use as the unique key for diffing */
  key?: keyof T;
  /** Whether to merge existing items with new data (default: true) */
  merge?: boolean;
}

/**
 * Reconcile arrays - efficient array updates with key-based diffing
 *
 * @example
 * ```ts
 * const [state, setState] = useStore({ items: [] });
 *
 * // Update items with reconciliation using options object
 * setState("items", reconcile(newItems, { key: "id" }));
 *
 * // Or with just the key name
 * setState("items", reconcile(newItems, "id"));
 * ```
 */
export function reconcile<T extends Record<string, unknown>>(
  newData: T[],
  keyOrOptions?: keyof T | ReconcileOptions<T>,
): (prev: T[]) => T[] {
  // Parse options
  const options: ReconcileOptions<T> =
    typeof keyOrOptions === "object" ? keyOrOptions : { key: keyOrOptions };

  const key = options.key;
  const merge = options.merge !== false;

  return (prev: T[]) => {
    // If no key provided, just return new data
    if (!key) {
      return newData;
    }

    const prevMap = new Map(prev.map((item) => [item[key], item]));
    return newData.map((item) => {
      const existing = prevMap.get(item[key]);
      if (existing && merge) {
        // Merge with existing
        return { ...existing, ...item };
      }
      return item;
    });
  };
}
