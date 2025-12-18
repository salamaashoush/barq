/**
 * Reactive signals layer built on alien-signals
 */

import {
  computed as alienComputed,
  effect as alienEffect,
  effectScope as alienEffectScope,
  signal as alienSignal,
  endBatch,
  pauseTracking,
  resumeTracking,
  startBatch,
} from "alien-signals";

// Track cleanup functions for the current effect/scope
let currentCleanups: (() => void)[] | null = null;

/**
 * Reactive signal - holds a value that can be read and written
 */
export interface Signal<T> {
  (): T;
  set(value: T): void;
  update(fn: (prev: T) => T): void;
  peek(): T;
}

/**
 * Computed signal - derives value from other signals
 */
export interface Computed<T> {
  (): T;
  peek(): T;
}

/**
 * Create a reactive signal
 */
export function signal<T>(initialValue: T): Signal<T> {
  const s = alienSignal(initialValue);

  const accessor = (() => s()) as Signal<T>;
  accessor.set = (value: T) => s(value);
  accessor.update = (fn: (prev: T) => T) => s(fn(s()));
  accessor.peek = () => {
    pauseTracking();
    const value = s();
    resumeTracking();
    return value;
  };

  return accessor;
}

/**
 * Create a computed signal that derives its value from other signals
 */
export function computed<T>(fn: () => T): Computed<T> {
  const c = alienComputed(fn);

  const accessor = (() => c()) as Computed<T>;
  accessor.peek = () => {
    pauseTracking();
    const value = c();
    resumeTracking();
    return value;
  };

  return accessor;
}

/**
 * Run a side effect when signals change
 * Returns a cleanup function
 */
export function effect(fn: () => void | (() => void)): () => void {
  let cleanup: (() => void) | undefined;
  let cleanups: (() => void)[] = [];

  const stop = alienEffect(() => {
    // Run previous cleanup
    if (cleanup) cleanup();
    // Run all registered onCleanup functions
    for (const c of cleanups) c();
    cleanups = [];

    // Set up cleanup tracking for this effect run
    const prevCleanups = currentCleanups;
    currentCleanups = cleanups;

    try {
      const result = fn();
      cleanup = typeof result === "function" ? result : undefined;
    } finally {
      currentCleanups = prevCleanups;
    }
  });

  return () => {
    if (cleanup) cleanup();
    for (const c of cleanups) c();
    stop();
  };
}

/**
 * Register a cleanup function for the current effect/scope
 * Like SolidJS's onCleanup - runs when effect re-runs or is disposed
 */
export function onCleanup(fn: () => void): void {
  if (currentCleanups) {
    currentCleanups.push(fn);
  }
}

/**
 * Run a callback after the component has mounted (after first render)
 * Like SolidJS's onMount - runs once after initial render
 */
export function onMount(fn: () => void): void {
  // Use queueMicrotask to run after the current synchronous rendering
  queueMicrotask(() => {
    untrack(fn);
  });
}

/**
 * Batch multiple signal updates into a single render
 */
export function batch(fn: () => void): void {
  startBatch();
  try {
    fn();
  } finally {
    endBatch();
  }
}

/**
 * Create an effect scope for automatic cleanup
 * Similar to SolidJS's createRoot - the callback receives a dispose function
 */
export function createScope<T>(fn: (dispose: () => void) => T): T {
  let result: T | undefined;
  const cleanups: (() => void)[] = [];
  const disposeRef: { current: (() => void) | undefined } = { current: undefined };

  const dispose = alienEffectScope(() => {
    // Set up cleanup tracking for this scope
    const prevCleanups = currentCleanups;
    currentCleanups = cleanups;

    try {
      result = fn(() => {
        // Run all cleanup functions when disposing
        for (const c of cleanups) c();
        disposeRef.current?.();
      });
    } finally {
      currentCleanups = prevCleanups;
    }
  });
  disposeRef.current = dispose;

  return result as T;
}

/**
 * Untrack - read signals without creating dependencies
 */
export function untrack<T>(fn: () => T): T {
  pauseTracking();
  try {
    return fn();
  } finally {
    resumeTracking();
  }
}

// ============================================================================
// Context API - like SolidJS's createContext/useContext
// ============================================================================

/**
 * Context object type
 * Provider accepts children as a render function for proper context scoping
 */
export interface Context<T> {
  id: symbol;
  defaultValue: T | undefined;
  Provider: (props: { value: T | (() => T); children: unknown }) => Node | null;
}

// Global context stack - each context can have nested providers
// Using a stack allows nested providers to shadow outer ones
const contextStacks: Map<symbol, Signal<unknown>[]> = new Map();

/**
 * Create a context for dependency injection
 * Like SolidJS's createContext
 *
 * Usage:
 * ```tsx
 * const ThemeContext = createContext<"light" | "dark">("light");
 *
 * // Provide a value (use render function for children)
 * // Value can be static or a getter for reactivity
 * <ThemeContext.Provider value={theme}>
 *   {() => <App />}
 * </ThemeContext.Provider>
 *
 * // Or with reactive getter:
 * <ThemeContext.Provider value={() => theme()}>
 *   {() => <App />}
 * </ThemeContext.Provider>
 *
 * // Consume the value (returns a getter for reactivity)
 * const theme = useContext(ThemeContext);
 * console.log(theme()); // Access the value
 * ```
 */
export function createContext<T>(defaultValue?: T): Context<T> {
  const id = Symbol("context");

  // Initialize stack with default value if provided
  if (defaultValue !== undefined) {
    const defaultSignal = signal(defaultValue);
    contextStacks.set(id, [defaultSignal]);
  }

  const Provider = (props: { value: T | (() => T); children: unknown }): Node | null => {
    // Create a signal for this provider's value
    // If value is a getter, create a computed to track it reactively
    const getValue = () =>
      typeof props.value === "function" ? (props.value as () => T)() : props.value;

    // Create a computed signal that tracks the value
    const valueSignal = computed(getValue);

    // Get or create the stack for this context
    let stack = contextStacks.get(id);
    if (!stack) {
      stack = [];
      contextStacks.set(id, stack);
    }

    // Push our signal onto the stack
    stack.push(valueSignal as Signal<unknown>);

    // If children is a function, call it to get the actual children
    // This ensures children render AFTER the context value is set
    let result: unknown;
    if (typeof props.children === "function") {
      result = (props.children as () => unknown)();
    } else {
      result = props.children;
    }

    // Pop this provider from the stack
    // Note: This happens synchronously, but consumers have already captured
    // a reference to our signal through useContext
    stack.pop();

    return result as Node | null;
  };

  return {
    id,
    defaultValue,
    Provider,
  };
}

/**
 * Get the current value from a context
 * Like SolidJS's useContext
 *
 * Returns a getter function that reactively reads the context value.
 * The getter will track the current provider's value signal.
 */
export function useContext<T>(context: Context<T>): () => T {
  const stack = contextStacks.get(context.id);

  if (stack && stack.length > 0) {
    // Get the topmost signal (current provider)
    const currentSignal = stack[stack.length - 1];
    // Return a getter that reads from this signal
    return () => currentSignal() as T;
  }

  if (context.defaultValue !== undefined) {
    // Return a getter for the default value
    return () => context.defaultValue as T;
  }

  throw new Error("Context not found and no default value provided");
}
