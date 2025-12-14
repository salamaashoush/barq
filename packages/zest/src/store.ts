/**
 * Store - Fine-grained reactive state management (SolidJS-style)
 *
 * Provides nested reactive objects where each property is independently tracked.
 * Updates to nested properties only trigger effects that read those specific paths.
 */

import { type Signal, signal, batch } from "./signals.ts";

/**
 * Deep readonly type for store state
 */
type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

/**
 * Store setter function type
 */
type StoreSetter<T> = {
  <K extends keyof T>(key: K, value: T[K] | ((prev: T[K]) => T[K])): void;
  <K extends keyof T>(key: K, nested: Partial<T[K]>): void;
  (updates: Partial<T>): void;
  (fn: (state: T) => Partial<T>): void;
};

/**
 * Store tuple: [state, setState]
 */
export type Store<T extends object> = [DeepReadonly<T>, StoreSetter<T>];

/**
 * Internal signal map for tracking nested properties
 */
const STORE_SIGNALS = new WeakMap<object, Map<string | symbol, Signal<unknown>>>();

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
 * // Batch updates
 * setState({ user: { name: "Bob", age: 25 } });
 * ```
 */
export function useStore<T extends object>(initialState: T): Store<T> {
  const signalMap = new Map<string | symbol, Signal<unknown>>();
  STORE_SIGNALS.set(initialState, signalMap);

  // Create reactive proxy
  const state = createReactiveProxy(initialState, signalMap, []) as DeepReadonly<T>;

  // Setter function - wrapped in batch() like SolidJS to prevent multiple effect runs
  const setState: StoreSetter<T> = (...args: unknown[]) => {
    batch(() => {
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
            applyUpdates(current as object, value as Partial<T[keyof T] & object>, signalMap, [String(key)]);
          } else {
            updateProperty(initialState, key, value as T[keyof T], signalMap, []);
          }
        } else {
          // setState(key, value)
          updateProperty(initialState, key, value as T[keyof T], signalMap, []);
        }
      }
    });
  };

  return [state, setState];
}

/**
 * Create a reactive proxy for an object
 */
function createReactiveProxy<T extends object>(
  target: T,
  signalMap: Map<string | symbol, Signal<unknown>>,
  path: string[]
): T {
  return new Proxy(target, {
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
      } else {
        // Sync signal with actual object value if they differ
        // This handles the case where a parent was replaced with a new object/array
        const signalValue = sig.peek();
        if (signalValue !== actualValue) {
          sig.set(actualValue);
        }
      }

      const value = sig();

      // Recursively wrap nested objects
      if (typeof value === "object" && value !== null) {
        return createReactiveProxy(value as object, signalMap, [...path, String(prop)]);
      }

      return value;
    },

    set() {
      console.warn("Direct mutation not allowed. Use setState instead.");
      return false;
    },
  });
}

/**
 * Update a single property
 */
function updateProperty<T extends object>(
  target: T,
  key: keyof T,
  value: T[keyof T],
  signalMap: Map<string | symbol, Signal<unknown>>,
  path: string[]
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
  signalMap: Map<string | symbol, Signal<unknown>>,
  path: string[]
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
    if (current == null) return undefined;
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
  signalMap: Map<string | symbol, Signal<unknown>>,
  prefix: string
): void {
  for (const [key, sig] of signalMap) {
    if (typeof key === "string" && key.startsWith(`${prefix}.`)) {
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
 * Produce - immutable update helper (like Immer)
 *
 * Returns a new copy with mutations applied, preserving the original.
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
    const draft = structuredClone(state);
    fn(draft);
    return draft;
  };
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
  keyOrOptions?: keyof T | ReconcileOptions<T>
): (prev: T[]) => T[] {
  // Parse options
  const options: ReconcileOptions<T> = typeof keyOrOptions === "object" ? keyOrOptions : { key: keyOrOptions };

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
