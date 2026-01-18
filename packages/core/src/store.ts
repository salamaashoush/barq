/**
 * Store - Fine-grained reactive state management (SolidJS-style)
 *
 * Provides nested reactive objects where each property is independently tracked.
 * Updates to nested properties only trigger effects that read those specific paths.
 */

import { type Signal, batch, signal } from "./signals.ts";

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
 * - setState(fn) - function returning updates
 * - setState(key, value) - single property update
 * - setState(key, fn) - single property with updater function
 * - setState(key1, key2, value) - nested path update (2 levels)
 * - setState(key1, key2, key3, value) - nested path update (3 levels)
 * - setState(key1, key2, key3, key4, value) - nested path update (4 levels)
 * - setState(...path, value) - arbitrary depth path update
 */
type StoreSetter<T> = {
  // Single arg: partial updates or function
  (updates: Partial<T>): void;
  (fn: (state: T) => Partial<T>): void;

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

/**
 * Internal signal map for tracking nested properties
 */
const STORE_SIGNALS = new WeakMap<object, Map<string, Signal<unknown>>>();

/**
 * Cache for nested proxies to avoid creating new ones on every access
 */
const PROXY_CACHE = new WeakMap<object, WeakMap<object, object>>();

/**
 * Map from proxy to its raw target for unwrap()
 */
const PROXY_TO_RAW = new WeakMap<object, object>();

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
 * // Update single property
 * setState("user", { name: "Jane" });
 *
 * // Update with function
 * setState("user", prev => ({ ...prev, age: prev.age + 1 }));
 *
 * // Deep path updates (SolidJS style)
 * setState("user", "address", "city", "NYC");
 *
 * // Array index updates
 * setState("todos", 0, "done", true);
 *
 * // Batch updates
 * setState({ user: { name: "Bob", age: 25 } });
 * ```
 */
export function useStore<T extends object>(initialState: T): Store<T> {
  const signalMap = new Map<string, Signal<unknown>>();
  STORE_SIGNALS.set(initialState, signalMap);

  // Initialize proxy cache for this store
  PROXY_CACHE.set(initialState, new WeakMap());

  // Create reactive proxy
  const state = createReactiveProxy(initialState, signalMap, [], initialState) as DeepReadonly<T>;

  // Setter function - wrapped in batch() like SolidJS to prevent multiple effect runs
  const setState: StoreSetter<T> = (...args: unknown[]) => {
    batch(() => {
      if (args.length === 0) return;

      if (args.length === 1) {
        const arg = args[0];
        if (typeof arg === "function") {
          // setState(fn: (state) => updates)
          const updates = (arg as (state: T) => Partial<T>)(initialState);
          applyUpdates(initialState, updates, signalMap, []);
        } else {
          // setState(updates)
          applyUpdates(initialState, arg as Partial<T>, signalMap, []);
        }
      } else if (args.length === 2) {
        const [key, value] = args as [keyof T, unknown];
        if (typeof value === "function") {
          // setState(key, fn)
          const current = initialState[key];
          const newValue = (value as (prev: T[keyof T]) => T[keyof T])(current);
          updateProperty(initialState, key, newValue, signalMap, []);
        } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          // setState(key, partialUpdate) - merge into nested object
          const current = initialState[key];
          if (typeof current === "object" && current !== null) {
            applyUpdates(current as object, value as Partial<T[keyof T] & object>, signalMap, [
              String(key),
            ]);
          } else {
            updateProperty(initialState, key, value as T[keyof T], signalMap, []);
          }
        } else {
          // setState(key, value)
          updateProperty(initialState, key, value as T[keyof T], signalMap, []);
        }
      } else {
        // Path-based setter: setState(k1, k2, ..., value)
        // Last argument is the value, rest are path segments
        const path = args.slice(0, -1) as PathSegment[];
        const value = args[args.length - 1];
        setByPath(initialState, path, value, signalMap);
      }
    });
  };

  return [state, setState];
}

/**
 * Set a value at a deep path in the store
 */
function setByPath(
  root: object,
  path: PathSegment[],
  value: unknown,
  signalMap: Map<string, Signal<unknown>>,
): void {
  if (path.length === 0) return;

  // Navigate to the parent object
  let current: unknown = root;
  const parentPath: string[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i];
    parentPath.push(String(segment));

    if (current === null || current === undefined) {
      throw new Error(`Cannot set path ${path.join(".")}: parent is null/undefined at ${segment}`);
    }

    current = (current as Record<string | number | symbol, unknown>)[segment];
  }

  // Get the final key and set the value
  const finalKey = path[path.length - 1];
  const finalPath = [...parentPath, String(finalKey)].join(".");

  // Handle function updater
  let finalValue = value;
  if (typeof value === "function") {
    const currentValue = (current as Record<string | number | symbol, unknown>)[finalKey];
    finalValue = (value as (prev: unknown) => unknown)(currentValue);
  }

  // Update the actual object
  (current as Record<string | number | symbol, unknown>)[finalKey] = finalValue;

  // Update signal
  const sig = signalMap.get(finalPath);
  if (sig) {
    sig.set(finalValue);
  }

  // If value is object/array, update nested signals
  if (typeof finalValue === "object" && finalValue !== null) {
    updateNestedSignals(finalValue, signalMap, finalPath);
  }
}

/**
 * Create a reactive proxy for an object with caching
 */
function createReactiveProxy<T extends object>(
  target: T,
  signalMap: Map<string, Signal<unknown>>,
  path: string[],
  rootObject: object,
): T {
  // Check cache first
  const cache = PROXY_CACHE.get(rootObject);
  if (cache) {
    const cached = cache.get(target);
    if (cached) return cached as T;
  }

  const proxy = new Proxy(target, {
    get(obj, prop) {
      if (prop === Symbol.toStringTag) return "Store";
      if (typeof prop === "symbol") return Reflect.get(obj, prop);

      const key = [...path, String(prop)].join(".");
      const actualValue = Reflect.get(obj, prop);
      let sig = signalMap.get(key);

      if (!sig) {
        // Create new signal with current value
        sig = signal(actualValue);
        signalMap.set(key, sig);
      }

      // Track dependency by reading the signal
      sig();

      // Return actual value from object (signal is just for tracking)
      const value = actualValue;

      // Recursively wrap nested objects (with caching)
      if (typeof value === "object" && value !== null) {
        return createReactiveProxy(value, signalMap, [...path, String(prop)], rootObject);
      }

      return value;
    },

    set() {
      console.warn("Direct mutation not allowed. Use setState instead.");
      return false;
    },
  });

  // Cache the proxy
  if (cache) {
    cache.set(target, proxy);
  }

  // Store reverse mapping for unwrap
  PROXY_TO_RAW.set(proxy, target);

  return proxy;
}

/**
 * Update a single property
 */
function updateProperty<T extends object>(
  target: T,
  key: keyof T,
  value: T[keyof T],
  signalMap: Map<string, Signal<unknown>>,
  path: string[],
): void {
  const fullKey = [...path, String(key)].join(".");

  // Update the actual object
  (target as Record<string, unknown>)[key as string] = value;

  // Update signal
  const sig = signalMap.get(fullKey);
  if (sig) {
    sig.set(value);
  }

  // If value is object/array, update nested signals with new values
  if (typeof value === "object" && value !== null) {
    updateNestedSignals(value, signalMap, fullKey);
  }
}

/**
 * Apply partial updates to an object
 */
function applyUpdates<T extends object>(
  target: T,
  updates: Partial<T>,
  signalMap: Map<string, Signal<unknown>>,
  path: string[],
): void {
  for (const [key, value] of Object.entries(updates)) {
    updateProperty(target, key as keyof T, value as T[keyof T], signalMap, path);
  }
}

/**
 * Get a nested value from an object by path
 */
function getValueByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Update nested signals when parent object/array changes
 * This ensures effects subscribed to nested paths get the new values
 */
function updateNestedSignals(
  newValue: unknown,
  signalMap: Map<string, Signal<unknown>>,
  prefix: string,
): void {
  for (const [key, sig] of signalMap) {
    if (key.startsWith(`${prefix}.`)) {
      // Get the relative path: "todos.0.text" -> "0.text"
      const relativePath = key.slice(prefix.length + 1);
      // Get the new value from the updated object
      const newNestedValue = getValueByPath(newValue, relativePath);
      // Update signal with new value (this notifies subscribed effects)
      sig.set(newNestedValue);
    }
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
  const raw = PROXY_TO_RAW.get(proxy);
  if (raw) return raw as T;

  // If not a proxy, return as-is
  return proxy;
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
 *
 * setState(produce(draft => {
 *   draft.user.name = "New Name";
 *   draft.todos.push({ id: 2, text: "New todo" });
 * }));
 * ```
 */
export function produce<T>(fn: (draft: T) => void): (state: T) => T {
  return (state: T) => {
    // Track copies and parent relationships
    const copies = new Map<object, object>();
    const parents = new Map<object, { parent: object; key: string | symbol }>();
    const proxies = new Map<object, object>();

    // Create a draft proxy that records mutations
    const draft = createDraftProxy(state as object, copies, parents, proxies, null) as T;

    // Run the mutation function
    fn(draft);

    // If nothing was copied, return original
    if (copies.size === 0) {
      return state;
    }

    // Return the copy with modifications (or original if root wasn't copied)
    return (copies.get(state as object) as T) ?? state;
  };
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
        return createDraftProxy(value as object, copies, parents, proxies, { parent: obj, key: prop });
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
