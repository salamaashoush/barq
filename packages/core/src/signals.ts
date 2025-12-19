/**
 * Reactive signals - custom implementation with fine-grained reactivity
 * Push-pull reactivity with automatic dependency tracking and disposal
 */

// ============================================================================
// Internal Types and State
// ============================================================================

/** Reactive node in the dependency graph */
interface ReactiveNode {
  /** Unique version for change detection */
  version: number;
  /** Nodes that depend on this one */
  subscribers: Set<Subscriber>;
}

/** Subscriber (computed or effect) that tracks dependencies */
interface Subscriber extends ReactiveNode {
  /** Sources this subscriber depends on */
  sources: Set<ReactiveNode>;
  /** Whether this needs to recompute */
  dirty: boolean;
  /** Function to execute */
  fn: () => unknown;
  /** Cleanup function from previous run */
  cleanup?: () => void;
  /** Cleanup functions registered via onCleanup */
  cleanups: (() => void)[];
  /** Whether this is an effect (vs computed) */
  isEffect: boolean;
  /** Whether disposed */
  disposed: boolean;
}

// Global state
let currentSubscriber: Subscriber | null = null;
let trackingEnabled = true;
let batchDepth = 0;
let isFlushing = false;
const pendingEffects: Set<Subscriber> = new Set();

// ============================================================================
// Owner Tracking
// ============================================================================

/**
 * Owner represents a reactive scope that can own child computations.
 * When an owner is disposed, all its children are automatically disposed.
 */
export interface Owner {
  /** Cleanup functions to run when disposed */
  cleanups: (() => void)[];
  /** Dispose function */
  dispose: () => void;
  /** Child subscribers owned by this scope */
  children: Subscriber[];
  /** Whether disposed */
  disposed: boolean;
}

/** Stack of active owners for nested scope tracking */
const ownerStack: Owner[] = [];

/** Get current owner (top of stack) */
function getCurrentOwner(): Owner | null {
  return ownerStack.length > 0 ? ownerStack[ownerStack.length - 1] : null;
}

/**
 * Get the current owner context.
 * Useful for capturing owner to restore later in async callbacks.
 */
export function getOwner(): Owner | null {
  return getCurrentOwner();
}

/**
 * Run a function with a specific owner context.
 * Use this to restore owner in async callbacks or setTimeout.
 */
export function runWithOwner<T>(owner: Owner | null, fn: () => T): T | undefined {
  if (owner) {
    ownerStack.push(owner);
  }
  try {
    return fn();
  } catch (err) {
    console.error("Error in runWithOwner:", err);
    return undefined;
  } finally {
    if (owner) {
      ownerStack.pop();
    }
  }
}

// ============================================================================
// Core Reactive Primitives
// ============================================================================

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
  let value = initialValue;
  const node: ReactiveNode = {
    version: 0,
    subscribers: new Set(),
  };

  const read = (): T => {
    if (trackingEnabled && currentSubscriber && !currentSubscriber.disposed) {
      node.subscribers.add(currentSubscriber);
      currentSubscriber.sources.add(node);
    }
    return value;
  };

  const write = (newValue: T): void => {
    if (Object.is(value, newValue)) return;

    value = newValue;
    node.version++;

    // Mark all subscribers dirty and queue effects
    markDirty(node);

    // Flush if not batching and not already flushing
    if (batchDepth === 0 && !isFlushing) {
      flushEffects();
    }
  };

  const accessor = read as Signal<T>;
  accessor.set = write;
  accessor.update = (fn: (prev: T) => T) => write(fn(value));
  accessor.peek = () => value;

  return accessor;
}

/**
 * Mark all subscribers of a node as dirty, recursively for computeds
 */
function markDirty(node: ReactiveNode): void {
  for (const sub of node.subscribers) {
    if (sub.disposed || sub.dirty) continue;

    sub.dirty = true;

    if (sub.isEffect) {
      pendingEffects.add(sub);
    } else {
      // Computed: propagate dirty to its subscribers
      markDirty(sub);
    }
  }
}

/**
 * Create a computed signal that derives its value from other signals
 */
export function computed<T>(fn: () => T): Computed<T> {
  let value: T;
  let initialized = false;

  const sub: Subscriber = {
    version: 0,
    subscribers: new Set(),
    sources: new Set(),
    dirty: true,
    fn,
    cleanups: [],
    isEffect: false,
    disposed: false,
  };

  // Register with owner for disposal
  const owner = getCurrentOwner();
  if (owner) {
    owner.children.push(sub);
  }

  const compute = (): T => {
    if (!sub.dirty && initialized) {
      return value;
    }

    // Clean up old dependencies
    cleanupSources(sub);

    // Track new dependencies
    const prevSubscriber = currentSubscriber;
    currentSubscriber = sub;

    try {
      value = fn();
      initialized = true;
      sub.dirty = false;
      sub.version++;
    } finally {
      currentSubscriber = prevSubscriber;
    }

    return value;
  };

  const read = (): T => {
    if (sub.disposed) {
      return value;
    }

    // Track dependency if there's an active subscriber
    if (trackingEnabled && currentSubscriber && !currentSubscriber.disposed) {
      sub.subscribers.add(currentSubscriber);
      currentSubscriber.sources.add(sub);
    }

    return compute();
  };

  const accessor = read as Computed<T>;
  accessor.peek = () => {
    if (sub.dirty || !initialized) {
      const prevTracking = trackingEnabled;
      trackingEnabled = false;
      try {
        return compute();
      } finally {
        trackingEnabled = prevTracking;
      }
    }
    return value;
  };

  return accessor;
}

/**
 * Clean up a subscriber's source dependencies
 */
function cleanupSources(sub: Subscriber): void {
  for (const source of sub.sources) {
    source.subscribers.delete(sub);
  }
  sub.sources.clear();
}

/**
 * Dispose a subscriber completely
 */
function disposeSubscriber(sub: Subscriber): void {
  if (sub.disposed) return;
  sub.disposed = true;

  // Run cleanup functions
  if (sub.cleanup) {
    try {
      sub.cleanup();
    } catch (err) {
      console.error("Error in effect cleanup:", err);
    }
    sub.cleanup = undefined;
  }

  for (const cleanup of sub.cleanups) {
    try {
      cleanup();
    } catch (err) {
      console.error("Error in onCleanup:", err);
    }
  }
  sub.cleanups.length = 0;

  // Remove from pending effects
  pendingEffects.delete(sub);

  // Clean up dependencies
  cleanupSources(sub);

  // Clear subscribers
  sub.subscribers.clear();
}

/**
 * Run an effect subscriber
 */
function runEffect(sub: Subscriber): void {
  if (sub.disposed || !sub.dirty) return;

  // Run previous cleanup
  if (sub.cleanup) {
    try {
      sub.cleanup();
    } catch (err) {
      console.error("Error in effect cleanup:", err);
    }
    sub.cleanup = undefined;
  }

  // Run onCleanup functions from previous run
  for (const cleanup of sub.cleanups) {
    try {
      cleanup();
    } catch (err) {
      console.error("Error in onCleanup:", err);
    }
  }
  sub.cleanups.length = 0;

  // Clean up old dependencies
  cleanupSources(sub);

  // Push effect owner for onCleanup registration
  const effectOwner: Owner = {
    cleanups: sub.cleanups,
    dispose: () => disposeSubscriber(sub),
    children: [],
    disposed: false,
  };
  ownerStack.push(effectOwner);

  // Track new dependencies
  const prevSubscriber = currentSubscriber;
  currentSubscriber = sub;

  try {
    const result = sub.fn();
    sub.cleanup = typeof result === "function" ? (result as () => void) : undefined;
    sub.dirty = false;
  } finally {
    currentSubscriber = prevSubscriber;
    ownerStack.pop();
  }
}

/**
 * Run a side effect when signals change.
 * Returns a cleanup function to manually stop the effect.
 */
export function effect(fn: () => void | (() => void)): () => void {
  const sub: Subscriber = {
    version: 0,
    subscribers: new Set(),
    sources: new Set(),
    dirty: true,
    fn,
    cleanups: [],
    isEffect: true,
    disposed: false,
  };

  // Register with owner for disposal
  const owner = getCurrentOwner();
  if (owner) {
    owner.children.push(sub);
  }

  // Run immediately
  runEffect(sub);

  // Return dispose function
  return () => disposeSubscriber(sub);
}

/**
 * Flush all pending effects
 */
function flushEffects(): void {
  if (isFlushing) return;
  isFlushing = true;

  try {
    // Keep flushing until no more pending effects
    while (pendingEffects.size > 0) {
      const effects = Array.from(pendingEffects);
      pendingEffects.clear();

      for (const eff of effects) {
        runEffect(eff);
      }
    }
  } finally {
    isFlushing = false;
  }
}

/**
 * Register a cleanup function for the current owner.
 */
export function onCleanup(fn: () => void): void {
  const owner = getCurrentOwner();
  if (owner) {
    owner.cleanups.push(fn);
  }
}

/**
 * Run a callback after the component has mounted (after first render).
 */
export function onMount(fn: () => void): void {
  const owner = getCurrentOwner();
  queueMicrotask(() => {
    if (owner) {
      runWithOwner(owner, () => untrack(fn));
    } else {
      untrack(fn);
    }
  });
}

/**
 * Batch multiple signal updates into a single render
 */
export function batch(fn: () => void): void {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      flushEffects();
    }
  }
}

/**
 * Create a new reactive scope.
 * All effects created inside are automatically disposed when the scope is disposed.
 */
export function createScope<T>(fn: (dispose: () => void) => T): T {
  let result: T;
  let disposed = false;

  const owner: Owner = {
    cleanups: [],
    dispose: () => {},
    children: [],
    disposed: false,
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    owner.disposed = true;

    // Dispose all child subscribers
    for (const child of owner.children) {
      disposeSubscriber(child);
    }
    owner.children.length = 0;

    // Run all cleanup functions
    for (const cleanup of owner.cleanups) {
      try {
        cleanup();
      } catch (err) {
        console.error("Error in scope cleanup:", err);
      }
    }
    owner.cleanups.length = 0;
  };

  owner.dispose = dispose;

  ownerStack.push(owner);
  try {
    result = fn(dispose);
  } finally {
    ownerStack.pop();
  }

  return result;
}

/**
 * Untrack - read signals without creating dependencies
 */
export function untrack<T>(fn: () => T): T {
  const prevTracking = trackingEnabled;
  trackingEnabled = false;
  try {
    return fn();
  } finally {
    trackingEnabled = prevTracking;
  }
}

// ============================================================================
// Context API
// ============================================================================

/**
 * Context object type
 */
export interface Context<T> {
  id: symbol;
  defaultValue: T | undefined;
  Provider: (props: { value: T | (() => T); children: unknown }) => Node | null;
}

const contextStacks: Map<symbol, Signal<unknown>[]> = new Map();

/**
 * Create a context for dependency injection
 */
export function createContext<T>(defaultValue?: T): Context<T> {
  const id = Symbol("context");

  if (defaultValue !== undefined) {
    const defaultSignal = signal(defaultValue);
    contextStacks.set(id, [defaultSignal]);
  }

  const Provider = (props: { value: T | (() => T); children: unknown }): Node | null => {
    const getValue = () =>
      typeof props.value === "function" ? (props.value as () => T)() : props.value;

    const valueSignal = computed(getValue);

    let stack = contextStacks.get(id);
    if (!stack) {
      stack = [];
      contextStacks.set(id, stack);
    }

    stack.push(valueSignal as Signal<unknown>);

    let result: unknown;
    if (typeof props.children === "function") {
      result = (props.children as () => unknown)();
    } else {
      result = props.children;
    }

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
 */
export function useContext<T>(context: Context<T>): () => T {
  const stack = contextStacks.get(context.id);

  if (stack && stack.length > 0) {
    const currentSignal = stack[stack.length - 1];
    return () => currentSignal() as T;
  }

  if (context.defaultValue !== undefined) {
    return () => context.defaultValue as T;
  }

  throw new Error("Context not found and no default value provided");
}
