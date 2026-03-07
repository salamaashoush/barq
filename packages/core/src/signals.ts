/**
 * Reactive signals - SolidJS-inspired implementation with fine-grained reactivity
 * Push-pull reactivity with automatic dependency tracking, topological ordering, and disposal
 *
 * Key features:
 * - Linked list dependency tracking for O(1) operations
 * - Height-based topological ordering via heap scheduler
 * - CHECK/DIRTY flag pattern for efficient propagation
 * - Custom equality function support
 * - Glitch-free diamond dependency handling
 * - Owner-based context inheritance (like SolidJS)
 */

// ============================================================================
// Constants (matching SolidJS)
// ============================================================================

// @ts-ignore - Used for completeness, may be used in future
const REACTIVE_NONE = 0;
const REACTIVE_CHECK = 1 << 0; // Might need update, check deps first
const REACTIVE_DIRTY = 1 << 1; // Definitely needs recompute
const REACTIVE_RECOMPUTING_DEPS = 1 << 2; // Currently recomputing
const REACTIVE_IN_HEAP = 1 << 3; // In the dirty heap for recompute
const REACTIVE_IN_HEAP_HEIGHT = 1 << 4; // In heap for height adjustment only
const REACTIVE_DISPOSED = 1 << 5; // Has been disposed

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Error thrown when trying to access context outside a reactive root
 */
export class NoOwnerError extends Error {
  constructor() {
    super("Context can only be accessed under a reactive root.");
    this.name = "NoOwnerError";
  }
}

/**
 * Error thrown when context is not found and no default value provided
 */
export class ContextNotFoundError extends Error {
  constructor() {
    super(
      "Context must either be created with a default value or a value must be provided before accessing it."
    );
    this.name = "ContextNotFoundError";
  }
}

// ============================================================================
// Types
// ============================================================================

/** Linked list node for dependency tracking */
interface Link {
  _dep: SignalNode<unknown> | ComputedNode<unknown>;
  _sub: ComputedNode<unknown>;
  _nextDep: Link | null; // Next dependency of the subscriber
  _prevSub: Link | null; // Previous subscriber of the dependency
  _nextSub: Link | null; // Next subscriber of the dependency
}

/** Options for signal/computed creation */
export interface SignalOptions<T> {
  name?: string;
  equals?: false | ((prev: T, next: T) => boolean);
}

/** Context record for owner */
export type ContextRecord = Record<string | symbol, unknown>;

/** Base signal node */
interface SignalNode<T> {
  _value: T;
  _subs: Link | null; // Head of subscribers linked list
  _subsTail: Link | null; // Tail of subscribers linked list
  _equals: false | ((a: T, b: T) => boolean);
  _name?: string;
}

/** Computed node extends signal with computation state */
interface ComputedNode<T> extends SignalNode<T> {
  _fn: (prev?: T) => T;
  _deps: Link | null; // Head of dependencies linked list
  _depsTail: Link | null; // Tail of dependencies linked list
  _flags: number;
  _height: number; // Topological height for ordering
  _nextHeap: ComputedNode<unknown> | undefined;
  _prevHeap: ComputedNode<unknown>;
  _isEffect: boolean;
  _cleanup?: () => void;
  _cleanups: (() => void)[];
  _children: ComputedNode<unknown>[]; // Child computeds for disposal
  _owner: Owner | null;
  _effectOwner?: Owner; // Cached owner for effects (avoid allocation per run)
}

// ============================================================================
// Heap Scheduler (SolidJS-style)
// ============================================================================

interface Heap {
  _heap: (ComputedNode<unknown> | undefined)[];
  _marked: boolean;
  _min: number;
  _max: number;
}

const dirtyHeap: Heap = {
  _heap: new Array(2000).fill(undefined),
  _marked: false,
  _min: 0,
  _max: 0,
};

/** Actually insert node into heap at its height level */
function actualInsertIntoHeap(node: ComputedNode<unknown>, heap: Heap): void {
  const height = node._height;

  // Grow heap if needed
  if (height >= heap._heap.length) {
    heap._heap.length = height + 100;
  }

  const heapAtHeight = heap._heap[height];
  if (heapAtHeight === undefined) {
    heap._heap[height] = node;
    node._prevHeap = node;
    node._nextHeap = undefined;
  } else {
    // Add to end of circular list
    const tail = heapAtHeight._prevHeap;
    tail._nextHeap = node;
    node._prevHeap = tail;
    node._nextHeap = undefined;
    heapAtHeight._prevHeap = node;
  }

  if (height > heap._max) heap._max = height;
}

/** Insert node into heap for recomputation */
function insertIntoHeap(node: ComputedNode<unknown>, heap: Heap): void {
  const flags = node._flags;
  if (flags & (REACTIVE_IN_HEAP | REACTIVE_RECOMPUTING_DEPS)) return;

  // If already marked CHECK, upgrade to DIRTY
  if (flags & REACTIVE_CHECK) {
    node._flags = (flags & ~(REACTIVE_CHECK | REACTIVE_DIRTY)) | REACTIVE_DIRTY | REACTIVE_IN_HEAP;
  } else {
    node._flags = flags | REACTIVE_IN_HEAP;
  }

  // Only insert if not already in heap for height adjustment
  if (!(flags & REACTIVE_IN_HEAP_HEIGHT)) {
    actualInsertIntoHeap(node, heap);
  }
}

/** Insert node into heap for height adjustment only */
function insertIntoHeapHeight(node: ComputedNode<unknown>, heap: Heap): void {
  const flags = node._flags;
  if (flags & (REACTIVE_IN_HEAP | REACTIVE_RECOMPUTING_DEPS | REACTIVE_IN_HEAP_HEIGHT)) return;

  node._flags = flags | REACTIVE_IN_HEAP_HEIGHT;
  actualInsertIntoHeap(node, heap);
}

/** Remove node from heap */
function deleteFromHeap(node: ComputedNode<unknown>, heap: Heap): void {
  const flags = node._flags;
  if (!(flags & (REACTIVE_IN_HEAP | REACTIVE_IN_HEAP_HEIGHT))) return;

  node._flags = flags & ~(REACTIVE_IN_HEAP | REACTIVE_IN_HEAP_HEIGHT);

  const height = node._height;
  const heapHead = heap._heap[height];
  if (!heapHead) return;

  if (node._prevHeap === node) {
    // Only node at this height
    heap._heap[height] = undefined;
  } else {
    const next = node._nextHeap;
    const end = next ?? heapHead;
    if (node === heapHead) {
      heap._heap[height] = next;
    } else {
      node._prevHeap._nextHeap = next;
    }
    end._prevHeap = node._prevHeap;
  }

  node._prevHeap = node;
  node._nextHeap = undefined;
}

/** Adjust height of a node based on its dependencies */
function adjustHeight(node: ComputedNode<unknown>, heap: Heap): void {
  deleteFromHeap(node, heap);

  let newHeight = node._height;
  for (let d = node._deps; d !== null; d = d._nextDep) {
    const dep = d._dep as ComputedNode<unknown>;
    // Check if dep is a computed (has _fn) and update height
    if ("_fn" in dep && dep._height >= newHeight) {
      newHeight = dep._height + 1;
    }
  }

  if (node._height !== newHeight) {
    node._height = newHeight;
    // Propagate height change to subscribers
    for (let s = node._subs; s !== null; s = s._nextSub) {
      insertIntoHeapHeight(s._sub, heap);
    }
  }
}

/** Mark all nodes in heap with DIRTY flag and propagate CHECK to subscribers */
// @ts-ignore - Reserved for future microtask scheduling optimizations
function _markHeap(heap: Heap): void {
  if (heap._marked) return;
  heap._marked = true;

  for (let i = 0; i <= heap._max; i++) {
    for (let el = heap._heap[i]; el !== undefined; el = el._nextHeap) {
      if (el._flags & REACTIVE_IN_HEAP) {
        markNode(el, REACTIVE_DIRTY);
      }
    }
  }
}

/** Run heap - process all dirty nodes in topological order */
function runHeap(heap: Heap): void {
  heap._marked = false;

  for (heap._min = 0; heap._min <= heap._max; heap._min++) {
    let node = heap._heap[heap._min];
    while (node !== undefined) {
      if (node._flags & REACTIVE_IN_HEAP) {
        // Node needs recomputation
        recompute(node);
      } else {
        // Node only needs height adjustment
        adjustHeight(node, heap);
      }
      node = heap._heap[heap._min];
    }
  }

  heap._max = 0;
}

// ============================================================================
// Global State
// ============================================================================

let currentObserver: ComputedNode<unknown> | null = null;
let tracking = false; // Only true during computation (like SolidJS)
let batchDepth = 0;
let scheduled = false;
let clock = 0;

const defaultContext: ContextRecord = {};

// ============================================================================
// Owner Tracking
// ============================================================================

/**
 * Owner represents a reactive scope that can own child computations.
 * When an owner is disposed, all its children are automatically disposed.
 */
export interface Owner {
  /** Cleanup functions to run when disposed (LIFO order) */
  cleanups: (() => void)[];
  /** Dispose function */
  dispose: () => void;
  /** Child computeds owned by this scope */
  children: ComputedNode<unknown>[];
  /** Whether disposed */
  disposed: boolean;
  /** Parent owner for hierarchy */
  _parent: Owner | null;
  /** Context record inherited from parent */
  _context: ContextRecord;
}

let currentOwner: Owner | null = null;

function getCurrentOwner(): Owner | null {
  return currentOwner;
}

/**
 * Get the current owner context.
 * Useful for capturing owner to restore later in async callbacks.
 */
export function getOwner(): Owner | null {
  return currentOwner;
}

/**
 * Run a function with a specific owner context.
 * Use this to restore owner in async callbacks or setTimeout.
 */
export function runWithOwner<T>(owner: Owner | null, fn: () => T): T | undefined {
  const prevOwner = currentOwner;
  currentOwner = owner;
  try {
    return fn();
  } catch (err) {
    console.error("Error in runWithOwner:", err);
    return undefined;
  } finally {
    currentOwner = prevOwner;
  }
}

// ============================================================================
// Link Management (Dependency Graph)
// ============================================================================

function link(dep: SignalNode<unknown> | ComputedNode<unknown>, sub: ComputedNode<unknown>): void {
  const prevDep = sub._depsTail;

  // Quick check: if last dep is same, skip
  if (prevDep !== null && prevDep._dep === dep) return;

  let nextDep: Link | null = null;
  const isRecomputing = sub._flags & REACTIVE_RECOMPUTING_DEPS;

  if (isRecomputing) {
    // During recompute, try to reuse existing links
    nextDep = prevDep !== null ? prevDep._nextDep : sub._deps;
    if (nextDep !== null && nextDep._dep === dep) {
      sub._depsTail = nextDep;
      return;
    }
  }

  // Check if already subscribed
  const prevSub = dep._subsTail;
  if (prevSub !== null && prevSub._sub === sub) return;

  // Create new link
  const newLink: Link = {
    _dep: dep,
    _sub: sub,
    _nextDep: nextDep,
    _prevSub: prevSub,
    _nextSub: null,
  };

  // Add to subscriber's deps list
  sub._depsTail = newLink;
  if (prevDep !== null) {
    prevDep._nextDep = newLink;
  } else {
    sub._deps = newLink;
  }

  // Add to dependency's subs list
  dep._subsTail = newLink;
  if (prevSub !== null) {
    prevSub._nextSub = newLink;
  } else {
    dep._subs = newLink;
  }
}

function unlinkSubs(linkNode: Link): Link | null {
  const dep = linkNode._dep;
  const nextDep = linkNode._nextDep;
  const nextSub = linkNode._nextSub;
  const prevSub = linkNode._prevSub;

  if (nextSub !== null) {
    nextSub._prevSub = prevSub;
  } else {
    dep._subsTail = prevSub;
  }

  if (prevSub !== null) {
    prevSub._nextSub = nextSub;
  } else {
    dep._subs = nextSub;
  }

  return nextDep;
}

function cleanupDeps(sub: ComputedNode<unknown>): void {
  let link = sub._deps;
  while (link !== null) {
    link = unlinkSubs(link);
  }
  sub._deps = null;
  sub._depsTail = null;
}

// ============================================================================
// Mark/Propagate Pattern (SolidJS-style)
// ============================================================================

/** Mark node as dirty/check and propagate CHECK to subscribers */
function markNode(node: ComputedNode<unknown>, newState: number = REACTIVE_DIRTY): void {
  const flags = node._flags;
  if (flags & REACTIVE_DISPOSED) return;

  // Already marked with equal or higher priority
  if ((flags & (REACTIVE_CHECK | REACTIVE_DIRTY)) >= newState) return;

  node._flags = (flags & ~(REACTIVE_CHECK | REACTIVE_DIRTY)) | newState;

  // Propagate CHECK to subscribers
  for (let link = node._subs; link !== null; link = link._nextSub) {
    markNode(link._sub, REACTIVE_CHECK);
  }
}

/**
 * Notify all subscribers that a signal/computed has changed.
 * Inserts ALL subscribers into heap for processing in topological order.
 */
function notifySubs(node: SignalNode<unknown>): void {
  for (let link = node._subs; link !== null; link = link._nextSub) {
    const sub = link._sub;

    // Update heap min to process lower heights first
    if (dirtyHeap._min > sub._height) {
      dirtyHeap._min = sub._height;
    }

    // Mark DIRTY and insert into heap
    sub._flags |= REACTIVE_DIRTY;
    insertIntoHeap(sub, dirtyHeap);
  }
}

// ============================================================================
// Update Logic
// ============================================================================

function updateIfNecessary(node: ComputedNode<unknown>): void {
  if (node._flags & REACTIVE_DISPOSED) return;

  if (node._flags & REACTIVE_CHECK) {
    // Check all dependencies first
    for (let d = node._deps; d !== null; d = d._nextDep) {
      const dep = d._dep as ComputedNode<unknown>;
      // Check if dep is a computed (has _fn)
      if ("_fn" in dep) {
        updateIfNecessary(dep);
      }
      if (node._flags & REACTIVE_DIRTY) {
        break;
      }
    }
  }

  if (node._flags & REACTIVE_DIRTY) {
    recompute(node);
  }

  node._flags &= ~(REACTIVE_CHECK | REACTIVE_DIRTY);
}

function recompute(node: ComputedNode<unknown>): void {
  if (node._flags & REACTIVE_DISPOSED) return;

  deleteFromHeap(node, dirtyHeap);

  // Run cleanups for effects (in reverse order - LIFO)
  if (node._isEffect) {
    if (node._cleanup) {
      try {
        node._cleanup();
      } catch (err) {
        console.error("Error in effect cleanup:", err);
      }
      node._cleanup = undefined;
    }

    // Run cleanups in reverse order (LIFO like SolidJS)
    for (let i = node._cleanups.length - 1; i >= 0; i--) {
      try {
        node._cleanups[i]();
      } catch (err) {
        console.error("Error in onCleanup:", err);
      }
    }
    node._cleanups.length = 0;

    // Dispose children in reverse order (LIFO)
    for (let i = node._children.length - 1; i >= 0; i--) {
      disposeNode(node._children[i]);
    }
    node._children.length = 0;
  }

  // Reset deps tail for fresh tracking
  node._depsTail = null;

  const prevObserver = currentObserver;
  const prevTracking = tracking;
  currentObserver = node;
  node._flags |= REACTIVE_RECOMPUTING_DEPS;
  tracking = true; // Enable tracking during computation

  // For effects, use cached owner (avoid allocation per run)
  const prevOwner = currentOwner;
  if (node._isEffect && node._effectOwner) {
    node._effectOwner.disposed = false;
    currentOwner = node._effectOwner;
  }

  let newValue: unknown;
  try {
    newValue = node._fn(node._value);
  } catch (err) {
    console.error("Error in computation:", err);
    newValue = node._value;
  } finally {
    tracking = prevTracking;
    currentObserver = prevObserver;
    node._flags &= ~REACTIVE_RECOMPUTING_DEPS;
    currentOwner = prevOwner;
  }

  // Cleanup old unused deps (depsTail may have changed during fn execution via tracking)
  const depsTail = node._depsTail as Link | null;
  let toRemove = depsTail !== null ? depsTail._nextDep : node._deps;
  if (toRemove !== null) {
    if (depsTail !== null) {
      depsTail._nextDep = null;
    } else {
      node._deps = null;
    }
    while (toRemove !== null) {
      toRemove = unlinkSubs(toRemove);
    }
  }

  // Check if value changed
  const valueChanged =
    node._equals === false || !node._equals(node._value as any, newValue as any);

  if (valueChanged) {
    node._value = newValue as any;
    notifySubs(node);
  }

  if (node._isEffect) {
    node._cleanup = typeof newValue === "function" ? (newValue as () => void) : undefined;
  }

  node._flags &= ~(REACTIVE_CHECK | REACTIVE_DIRTY);
}

function disposeNode(node: ComputedNode<unknown>): void {
  if (node._flags & REACTIVE_DISPOSED) return;
  node._flags |= REACTIVE_DISPOSED;

  // Dispose children first (reverse order - LIFO)
  for (let i = node._children.length - 1; i >= 0; i--) {
    disposeNode(node._children[i]);
  }
  node._children.length = 0;

  // Run cleanup
  if (node._cleanup) {
    try {
      node._cleanup();
    } catch (err) {
      console.error("Error in cleanup:", err);
    }
    node._cleanup = undefined;
  }

  // Run cleanups in reverse order (LIFO)
  for (let i = node._cleanups.length - 1; i >= 0; i--) {
    try {
      node._cleanups[i]();
    } catch (err) {
      console.error("Error in onCleanup:", err);
    }
  }
  node._cleanups.length = 0;

  // Remove from heap
  deleteFromHeap(node, dirtyHeap);

  // Cleanup deps
  cleanupDeps(node);

  // Clear subs
  node._subs = null;
  node._subsTail = null;
}

// ============================================================================
// Scheduling
// ============================================================================

let isFlushing = false;

function schedule(): void {
  if (batchDepth > 0 || isFlushing) return;
  flushSync();
}

function flushSync(): void {
  if (isFlushing) return;
  isFlushing = true;
  scheduled = true;

  try {
    // Keep flushing until no more scheduled work
    let count = 0;
    while (scheduled) {
      if (++count === 100000) throw new Error("Potential infinite loop detected");
      scheduled = false;
      clock++;
      runHeap(dirtyHeap);
    }
  } finally {
    isFlushing = false;
  }
}

/**
 * Synchronously flush all pending updates
 */
export function flush(): void {
  flushSync();
}

// ============================================================================
// Public API
// ============================================================================

export interface Signal<T> {
  (): T;
  set(value: T): void;
  update(fn: (prev: T) => T): void;
  peek(): T;
}

export interface Computed<T> {
  (): T;
  peek(): T;
}

function defaultEquals<T>(a: T, b: T): boolean {
  // Fast path: strict equality (handles most cases)
  // Also handles NaN correctly (NaN !== NaN but we want NaN === NaN for reactivity)
  return a === b || (a !== a && b !== b);
}

/**
 * Create a reactive signal
 */
export function signal<T>(initialValue: T, options?: SignalOptions<T>): Signal<T> {
  const node: SignalNode<T> = {
    _value: initialValue,
    _subs: null,
    _subsTail: null,
    _equals: options?.equals !== undefined ? options.equals : defaultEquals,
    _name: options?.name,
  };

  const read = (): T => {
    // Fast path: not tracking
    if (!tracking) return node._value;
    // Track dependency during computation
    if (currentObserver && !(currentObserver._flags & REACTIVE_DISPOSED)) {
      link(node as SignalNode<unknown>, currentObserver);
    }
    return node._value;
  };

  const write = (newValue: T): void => {
    const valueChanged =
      node._equals === false || !node._equals(node._value, newValue);

    if (!valueChanged) return;

    node._value = newValue;
    notifySubs(node as SignalNode<unknown>);
    schedule();
  };

  const accessor = read as Signal<T>;
  accessor.set = write;
  accessor.update = (fn: (prev: T) => T) => write(fn(node._value));
  accessor.peek = () => node._value;

  return accessor;
}

/**
 * Create a computed signal that derives its value from other signals
 */
export function computed<T>(fn: () => T, options?: SignalOptions<T>): Computed<T> {
  const owner = getCurrentOwner();

  // Calculate initial height based on parent context (like SolidJS)
  let initialHeight = 0;
  if (currentObserver) {
    initialHeight = currentObserver._height + 1;
  }

  const node: ComputedNode<T> = {
    _value: undefined as T,
    _subs: null,
    _subsTail: null,
    _equals: options?.equals !== undefined ? options.equals : defaultEquals,
    _name: options?.name,
    _fn: fn as (prev?: T) => T,
    _deps: null,
    _depsTail: null,
    _flags: REACTIVE_DIRTY,
    _height: initialHeight,
    _nextHeap: undefined,
    _prevHeap: null as any,
    _isEffect: false,
    _cleanups: [],
    _children: [],
    _owner: owner,
  };
  node._prevHeap = node as ComputedNode<unknown>;

  // Register with owner
  if (owner) {
    owner.children.push(node as ComputedNode<unknown>);
  }

  // Compute immediately (eager like SolidJS)
  recompute(node as ComputedNode<unknown>);

  const read = (): T => {
    // Fast path: not disposed, not tracking, not dirty
    const flags = node._flags;
    if (!(flags & (REACTIVE_DISPOSED | REACTIVE_CHECK | REACTIVE_DIRTY)) && !tracking) {
      return node._value;
    }

    // Disposed - just return cached value
    if (flags & REACTIVE_DISPOSED) {
      return node._value;
    }

    // Track dependency during computation
    if (tracking && currentObserver && !(currentObserver._flags & REACTIVE_DISPOSED)) {
      link(node as ComputedNode<unknown>, currentObserver);
      if (node._height >= currentObserver._height) {
        currentObserver._height = node._height + 1;
      }
    }

    // Update if necessary
    if (flags & (REACTIVE_CHECK | REACTIVE_DIRTY)) {
      updateIfNecessary(node as ComputedNode<unknown>);
    }

    return node._value;
  };

  const accessor = read as Computed<T>;
  accessor.peek = (): T => {
    if (node._flags & (REACTIVE_CHECK | REACTIVE_DIRTY)) {
      const prevTracking = tracking;
      tracking = false;
      try {
        updateIfNecessary(node as ComputedNode<unknown>);
      } finally {
        tracking = prevTracking;
      }
    }
    return node._value;
  };

  return accessor;
}

/**
 * Run a side effect when signals change
 */
export function effect(fn: () => void | (() => void)): () => void {
  const owner = getCurrentOwner();

  // Calculate initial height based on parent context
  let initialHeight = 0;
  if (currentObserver) {
    initialHeight = currentObserver._height + 1;
  }

  const node: ComputedNode<void | (() => void)> = {
    _value: undefined,
    _subs: null,
    _subsTail: null,
    _equals: false, // Effects always run when deps change
    _fn: fn as (prev?: void | (() => void)) => void | (() => void),
    _deps: null,
    _depsTail: null,
    _flags: REACTIVE_DIRTY,
    _height: initialHeight,
    _nextHeap: undefined,
    _prevHeap: null as any,
    _isEffect: true,
    _cleanups: [],
    _children: [],
    _owner: owner,
  };
  node._prevHeap = node as ComputedNode<unknown>;

  // Create cached owner for effect (reused across reruns)
  node._effectOwner = {
    cleanups: node._cleanups,
    dispose: () => disposeNode(node as ComputedNode<unknown>),
    children: node._children as ComputedNode<unknown>[],
    disposed: false,
    _parent: owner,
    _context: owner?._context ?? defaultContext,
  };

  // Register with owner
  if (owner) {
    owner.children.push(node as ComputedNode<unknown>);
  }

  // Run immediately (synchronously)
  recompute(node as ComputedNode<unknown>);

  return () => disposeNode(node as ComputedNode<unknown>);
}

/**
 * Register a cleanup function for the current owner.
 * Returns the function for convenience (like SolidJS).
 * If no owner, returns the function immediately without registering.
 */
export function onCleanup<T extends () => void>(fn: T): T {
  const owner = getCurrentOwner();
  if (owner) {
    owner.cleanups.push(fn);
  }
  return fn;
}

/**
 * Schedule a callback to run after reactive setup is complete (like SolidJS onSettled).
 * The callback runs untracked after the current flush cycle.
 * Can return a cleanup function that runs when the owner is disposed.
 *
 * @param fn Callback to run after mount, can return cleanup function
 */
export function onMount(fn: () => void | (() => void)): void {
  let cleanup: (() => void) | void;
  const owner = getCurrentOwner();

  // Register cleanup handler if we have an owner
  if (owner) {
    onCleanup(() => cleanup?.());
  }

  // Schedule to run after current sync work
  queueMicrotask(() => {
    // Run in owner context if available
    if (owner && !owner.disposed) {
      const prevOwner = currentOwner;
      currentOwner = owner;
      try {
        cleanup = untrack(fn);
      } finally {
        currentOwner = prevOwner;
      }
    } else {
      cleanup = untrack(fn);
      // If no owner, run cleanup immediately if returned
      if (!owner) cleanup?.();
    }
  });
}

/**
 * Batch multiple signal updates into a single flush
 */
export function batch(fn: () => void): void {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      flushSync();
    }
  }
}

/**
 * Create a reactive scope with optional automatic disposal.
 *
 * - `createScope(fn)` - Auto-disposed when parent disposes (default)
 * - `createScope(fn, true)` - Detached, requires manual disposal
 *
 * Use this for:
 * - Top-level application roots (detached)
 * - Nested reactive scopes (attached)
 * - Conditional rendering contexts
 * - Component-like boundaries
 *
 * @param fn Function to run in the scope, receives dispose function
 * @param detached If true, scope is NOT auto-disposed with parent
 * @returns The return value of fn
 */
export function createScope<T>(
  fn: (dispose: () => void) => T,
  detached = false,
): T {
  const owner = createOwnerScope(!detached);
  return runInOwner(owner, fn);
}

/** Internal: Create an owner scope */
function createOwnerScope(registerWithParent: boolean): Owner {
  let disposed = false;

  const owner: Owner = {
    cleanups: [],
    dispose: () => {},
    children: [],
    disposed: false,
    _parent: currentOwner,
    _context: currentOwner?._context ?? defaultContext,
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    owner.disposed = true;

    // Dispose children in reverse order (LIFO)
    for (let i = owner.children.length - 1; i >= 0; i--) {
      disposeNode(owner.children[i]);
    }
    owner.children.length = 0;

    // Run cleanups in reverse order (LIFO)
    for (let i = owner.cleanups.length - 1; i >= 0; i--) {
      try {
        owner.cleanups[i]();
      } catch (err) {
        console.error("Error in scope cleanup:", err);
      }
    }
    owner.cleanups.length = 0;
  };

  owner.dispose = dispose;

  // Register with parent owner if requested
  if (registerWithParent && currentOwner) {
    currentOwner.cleanups.push(dispose);
  }

  return owner;
}

/** Internal: Run function within an owner context */
function runInOwner<T>(owner: Owner, fn: (dispose: () => void) => T): T {
  const prevOwner = currentOwner;
  currentOwner = owner;
  try {
    return fn(owner.dispose);
  } finally {
    currentOwner = prevOwner;
  }
}

/**
 * Read signals without creating dependencies.
 * Note: Owner context is maintained (only tracking is disabled).
 */
export function untrack<T>(fn: () => T): T {
  const prevTracking = tracking;
  tracking = false;
  try {
    return fn();
  } finally {
    tracking = prevTracking;
  }
}

// ============================================================================
// Context API (SolidJS-style)
// ============================================================================

/** Value can be static or a reactive accessor */
type MaybeAccessor<T> = T | (() => T);

/**
 * Context object type (matches SolidJS)
 */
export interface Context<T> {
  readonly id: symbol;
  readonly defaultValue: T | undefined;
  /** Provider component for JSX usage - accepts value or accessor */
  Provider: (props: { value: MaybeAccessor<T>; children: unknown }) => unknown;
}

/**
 * Create a context for dependency injection.
 * A default value can be provided which will be used when no value is set via setContext.
 *
 * @description https://docs.solidjs.com/reference/component-apis/create-context
 */
export function createContext<T>(defaultValue?: T, description?: string): Context<T> {
  const id = Symbol(description ?? "context");

  // Provider creates a new scope and sets context for children (like SolidJS)
  const Provider = (props: { value: MaybeAccessor<T>; children: unknown }): unknown => {
    // Create a new root scope for children with context set
    return createScope(() => {
      // Set context on the new scope - store value as-is (may be accessor)
      const owner = getCurrentOwner();
      if (owner) {
        owner._context = {
          ...owner._context,
          [id]: props.value,
        };
      }

      // Resolve children
      if (typeof props.children === "function") {
        return (props.children as () => unknown)();
      }
      return props.children;
    }, true);
  };

  return {
    id,
    defaultValue,
    Provider,
  };
}

/**
 * Get a context value for the given context.
 *
 * @throws `NoOwnerError` if there's no owner at the time of call.
 * @throws `ContextNotFoundError` if context value has not been set and no default.
 *
 * @description https://docs.solidjs.com/reference/component-apis/use-context
 */
export function getContext<T>(context: Context<T>, owner: Owner | null = getOwner()): T {
  if (!owner) {
    throw new NoOwnerError();
  }

  const value = hasContext(context, owner)
    ? (owner._context[context.id] as T)
    : context.defaultValue;

  if (value === undefined && context.defaultValue === undefined) {
    throw new ContextNotFoundError();
  }

  return value as T;
}

/**
 * Set a context value on the current owner.
 *
 * @throws `NoOwnerError` if there's no owner at the time of call.
 */
export function setContext<T>(context: Context<T>, value?: T, owner: Owner | null = getOwner()): void {
  if (!owner) {
    throw new NoOwnerError();
  }

  // Create new context object to avoid child values being exposed to parent
  owner._context = {
    ...owner._context,
    [context.id]: value === undefined ? context.defaultValue : value,
  };
}

/**
 * Check if a context has been set on the owner or its ancestors.
 */
export function hasContext<T>(context: Context<T>, owner: Owner | null = getOwner()): boolean {
  if (!owner) return false;
  return context.id in owner._context;
}

/**
 * Get the current value from a context.
 * Always returns an accessor function for consistent API.
 * If Provider received an accessor, that accessor is returned.
 * If Provider received a static value, a wrapper accessor is returned.
 *
 * @description https://docs.solidjs.com/reference/component-apis/use-context
 */
export function useContext<T>(context: Context<T>): () => T {
  const owner = getCurrentOwner();

  if (owner && hasContext(context, owner)) {
    const stored = owner._context[context.id];
    // If stored value is already an accessor, return it
    if (typeof stored === "function") {
      return stored as () => T;
    }
    // Otherwise wrap in accessor
    return () => stored as T;
  }

  if (context.defaultValue !== undefined) {
    return () => context.defaultValue as T;
  }

  throw new ContextNotFoundError();
}
