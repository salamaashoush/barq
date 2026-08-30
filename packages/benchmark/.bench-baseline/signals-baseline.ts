/**
 * Reactive signals - push-pull reactivity aligned with Solid 2.0 semantics
 *
 * - Writes push CHECK/DIRTY invalidation; pure computeds recompute lazily on read
 * - Only effects are scheduled (height-ordered heaps, render before user)
 * - Flushes are batched on a microtask by default; flush() drains synchronously
 * - Per-link value snapshots gate recomputation (reverted writes are no-ops)
 * - Async: computeds may return promises; pending/error status flows through
 *   the graph (NotReadyError) and is caught by Loading/Errored boundaries
 */

// ============================================================================
// Constants
// ============================================================================

const REACTIVE_CHECK = 1 << 0; // Might need update, verify deps first
const REACTIVE_DIRTY = 1 << 1; // Definitely needs recompute
const REACTIVE_RECOMPUTING_DEPS = 1 << 2; // Currently recomputing
const REACTIVE_IN_HEAP = 1 << 3; // In a heap for recompute
const REACTIVE_IN_HEAP_HEIGHT = 1 << 4; // In a heap for height adjustment only
const REACTIVE_DISPOSED = 1 << 5; // Has been disposed
const REACTIVE_UNINITIALIZED = 1 << 6; // Lazy computed not yet evaluated
const STATUS_PENDING = 1 << 7; // Async value in flight
const STATUS_ERROR = 1 << 8; // Last computation threw

const EFFECT_PURE = 0;
const EFFECT_RENDER = 1;
const EFFECT_USER = 2;

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
      "Context must either be created with a default value or a value must be provided before accessing it.",
    );
    this.name = "ContextNotFoundError";
  }
}

/**
 * Thrown when reading an async value that has not resolved yet.
 * Caught by Loading boundaries and by isPending()/latest().
 */
export class NotReadyError extends Error {
  constructor() {
    super("Async value is not ready yet.");
    this.name = "NotReadyError";
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
  _lastValue: unknown; // Dep value snapshot at link time (gates recompute)
}

/** Options for signal/computed creation */
export interface SignalOptions<T> {
  name?: string;
  equals?: false | ((prev: T, next: T) => boolean);
  /** Called when the computed loses its last subscriber */
  unobserved?: () => void;
  /** Suppress the REACTIVE_WRITE_IN_OWNED_SCOPE diagnostic for this signal */
  ownedWrite?: boolean;
}

// ============================================================================
// Dev diagnostics
// ============================================================================

export interface DiagnosticEvent {
  sequence: number;
  code: string;
  severity: "error" | "warning";
  message: string;
  nodeName?: string;
  data?: unknown;
}

let diagnosticSequence = 0;
const diagnosticListeners = new Set<(event: DiagnosticEvent) => void>();

function emitDiagnostic(
  code: string,
  severity: "error" | "warning",
  message: string,
  nodeName?: string,
  data?: unknown,
): void {
  if (diagnosticListeners.size === 0) return;
  const event: DiagnosticEvent = {
    sequence: diagnosticSequence++,
    code,
    severity,
    message,
    nodeName,
    data,
  };
  for (const listener of diagnosticListeners) {
    listener(event);
  }
}

/**
 * Structured dev diagnostics (Solid 2.0). Zero-cost when nothing is
 * subscribed. Codes: REACTIVE_WRITE_IN_OWNED_SCOPE,
 * ASYNC_OUTSIDE_LOADING_BOUNDARY, RUN_WITH_DISPOSED_OWNER,
 * NO_OWNER_CLEANUP, INFINITE_LOOP.
 */
export const DEV = {
  diagnostics: {
    subscribe(listener: (event: DiagnosticEvent) => void): () => void {
      diagnosticListeners.add(listener);
      return () => diagnosticListeners.delete(listener);
    },
    capture(): { stop(): DiagnosticEvent[] } {
      const events: DiagnosticEvent[] = [];
      const listener = (event: DiagnosticEvent) => {
        events.push(event);
      };
      diagnosticListeners.add(listener);
      return {
        stop() {
          diagnosticListeners.delete(listener);
          return events;
        },
      };
    },
  },
};

/** Context record for owner */
export type ContextRecord = Record<string | symbol, unknown>;

/** Base signal node */
interface SignalNode<T> {
  _value: T;
  _subs: Link | null; // Head of subscribers linked list
  _subsTail: Link | null; // Tail of subscribers linked list
  _equals: false | ((a: T, b: T) => boolean);
  _name?: string;
  _unobserved?: () => void;
  _epoch?: number; // Last mark epoch this node propagated in (write dedupe)
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
  _kind: number; // EFFECT_PURE | EFFECT_RENDER | EFFECT_USER
  _cleanup?: () => void;
  // Owner implementation (a computation owns what it creates during a run)
  cleanups: (() => void)[] | null;
  children: ComputedNode<unknown>[] | null;
  disposed: boolean;
  dispose: () => void;
  _parent: Owner | null;
  _context: ContextRecord;
  _apply?: (value: unknown, prev: unknown) => void | (() => void); // Split-form effect phase
  _appliedValue?: unknown; // Last value passed to _apply
  _error?: unknown; // Stored error when STATUS_ERROR
  _asyncId?: number; // Guards stale async resolutions
  _boundary?: LoadingBoundaryHandle | null; // Boundary this pending effect registered with
  _wave?: number; // Last propagation wave that visited this node
  _serializeKey?: string; // SSR: record resolved value under this key
  _inFlight?: Promise<unknown>; // Current async promise (settle registry hygiene)
  _session?: symbol | null; // Sticky async session (waterfall fetches keep attribution)
}

/** Handle that Loading boundaries provide via context */
export interface LoadingBoundaryHandle {
  add(node: object): void;
  delete(node: object): void;
}

/** Context key for Loading boundaries (used by components) */
export const LOADING_BOUNDARY: unique symbol = Symbol("loading-boundary");
/** Context key for error boundaries; value is (err: unknown) => void */
export const ERROR_BOUNDARY: unique symbol = Symbol("error-boundary");

// ============================================================================
// Heap Scheduler (height-ordered, effects only)
// ============================================================================

interface Heap {
  _heap: (ComputedNode<unknown> | undefined)[];
  _min: number;
  _max: number;
  _count: number;
}

function createHeap(): Heap {
  return { _heap: new Array(256).fill(undefined), _min: 0, _max: 0, _count: 0 };
}

const renderHeap = createHeap();
const userHeap = createHeap();

function heapFor(node: ComputedNode<unknown>): Heap {
  return node._kind === EFFECT_USER ? userHeap : renderHeap;
}

/** Actually insert node into heap at its height level */
function actualInsertIntoHeap(node: ComputedNode<unknown>, heap: Heap): void {
  const height = node._height;

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
  if (height < heap._min) heap._min = height;
  heap._count++;
}

/** Insert node into heap for recomputation */
function insertIntoHeap(node: ComputedNode<unknown>, heap: Heap): void {
  const flags = node._flags;
  if (flags & (REACTIVE_IN_HEAP | REACTIVE_RECOMPUTING_DEPS)) return;

  node._flags = flags | REACTIVE_IN_HEAP;

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
  heap._count--;
}

/** Adjust height of a node based on its dependencies */
function adjustHeight(node: ComputedNode<unknown>, heap: Heap): void {
  deleteFromHeap(node, heap);

  let newHeight = node._height;
  for (let d = node._deps; d !== null; d = d._nextDep) {
    const dep = d._dep as ComputedNode<unknown>;
    if ("_fn" in dep && dep._height >= newHeight) {
      newHeight = dep._height + 1;
    }
  }

  if (node._height !== newHeight) {
    node._height = newHeight;
    for (let s = node._subs; s !== null; s = s._nextSub) {
      const sub = s._sub;
      if (sub._kind !== EFFECT_PURE) {
        insertIntoHeapHeight(sub, heapFor(sub));
      }
    }
  }
}

/**
 * Run heap - process all scheduled effects in topological (height) order.
 * Re-scans until fully drained: effects may write signals that re-insert
 * nodes at lower heights (feedback writes).
 */
function runHeap(heap: Heap): void {
  while (heap._count > 0) {
    for (heap._min = 0; heap._min <= heap._max; heap._min++) {
      let node = heap._heap[heap._min];
      while (node !== undefined) {
        if (node._flags & REACTIVE_IN_HEAP) {
          updateIfNecessary(node);
          // updateIfNecessary may not recompute (deps reverted); ensure removal
          deleteFromHeap(node, heap);
        } else {
          adjustHeight(node, heap);
        }
        node = heap._heap[heap._min];
      }
    }
    heap._max = 0;
  }
}

// ============================================================================
// Global State
// ============================================================================

let currentObserver: ComputedNode<unknown> | null = null;
let tracking = false; // Only true during computation
let batchDepth = 0;
let scheduled = false;
let latestDepth = 0; // Inside latest(): pending reads return stale values
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
  /** Cleanup functions to run when disposed (LIFO order); lazily allocated */
  cleanups: (() => void)[] | null;
  /** Dispose function */
  dispose: () => void;
  /** Child computeds owned by this scope; lazily allocated */
  children: ComputedNode<unknown>[] | null;
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
 * Errors propagate to the caller; the previous owner is always restored.
 */
export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  if (owner?.disposed) {
    emitDiagnostic(
      "RUN_WITH_DISPOSED_OWNER",
      "warning",
      "runWithOwner called with a disposed owner; computations created inside will never be cleaned up by it.",
    );
  }
  const prevOwner = currentOwner;
  currentOwner = owner;
  try {
    return fn();
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
      nextDep._lastValue = dep._value;
      sub._depsTail = nextDep;
      return;
    }
  }

  // Check if already subscribed
  const prevSub = dep._subsTail;
  if (prevSub !== null && prevSub._sub === sub) return;

  // Create new link. Topology changed: write-propagation dedupe must reset
  // so the new subscriber sees the next write.
  markEpoch++;
  const newLink: Link = {
    _dep: dep,
    _sub: sub,
    _nextDep: nextDep,
    _prevSub: prevSub,
    _nextSub: null,
    _lastValue: dep._value,
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

  if (dep._subs === null && dep._unobserved) {
    dep._unobserved();
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
// Invalidation (push phase)
// ============================================================================

let markWave = 0;

/**
 * Bumped whenever any invalidation mark is consumed (recompute, validation,
 * self-mark drop). While the epoch is unchanged, a signal that already
 * propagated doesn't need to re-propagate: its marks are still standing.
 */
let markEpoch = 1;

/**
 * Mark a node CHECK or DIRTY. Effects are inserted into their heap;
 * pure computeds propagate CHECK to their subscribers (lazy pull).
 *
 * Wave stamps make each propagation re-traverse pure nodes that are
 * still marked from an earlier wave (a downstream effect may have
 * dropped its self-mark since), while deduplicating within one wave
 * (diamonds visit each node once).
 */
function markNode(node: ComputedNode<unknown>, newState: number): void {
  const flags = node._flags;
  if (flags & REACTIVE_DISPOSED) return;

  const current = flags & (REACTIVE_CHECK | REACTIVE_DIRTY);

  // Effects have no subscribers: no wave bookkeeping, just flag + enqueue
  if (node._kind !== EFFECT_PURE) {
    if (current < newState) {
      node._flags = (flags & ~(REACTIVE_CHECK | REACTIVE_DIRTY)) | newState;
    } else if (flags & (REACTIVE_IN_HEAP | REACTIVE_RECOMPUTING_DEPS)) {
      return; // already queued (or running) at equal-or-higher priority
    }
    insertIntoHeap(node, heapFor(node));
    schedule();
    return;
  }

  if (node._wave === markWave) {
    // Already visited this wave: only handle a CHECK -> DIRTY upgrade
    if (current < newState) {
      node._flags = (flags & ~(REACTIVE_CHECK | REACTIVE_DIRTY)) | newState;
    }
    return;
  }

  node._wave = markWave;
  if (current < newState) {
    node._flags = (flags & ~(REACTIVE_CHECK | REACTIVE_DIRTY)) | newState;
  }

  for (let l = node._subs; l !== null; l = l._nextSub) {
    markNode(l._sub, REACTIVE_CHECK);
  }
}

/**
 * Notify subscribers of a changed node (starts a new propagation wave).
 * `state` is DIRTY for unconditional recompute (equals: false sources,
 * errors, async transitions), CHECK otherwise (value comparison gates).
 */
function propagate(node: SignalNode<unknown>, state: number): void {
  markWave++;
  for (let l = node._subs; l !== null; l = l._nextSub) {
    markNode(l._sub, state);
  }
}

// ============================================================================
// Validation / recompute (pull phase)
// ============================================================================

function depEquals(dep: SignalNode<unknown>, a: unknown, b: unknown): boolean {
  const eq = dep._equals;
  if (eq === false || eq === defaultEquals) {
    return a === b || (a !== a && b !== b);
  }
  return eq(a, b);
}

/**
 * Resolve CHECK/DIRTY state. CHECK walks deps in read order: computed deps
 * are validated recursively, then each dep's current value is compared with
 * the snapshot taken at link time. Only an actual change recomputes.
 */
function updateIfNecessary(node: ComputedNode<unknown>): void {
  const flags = node._flags;
  if (flags & REACTIVE_DISPOSED) return;
  if (!(flags & (REACTIVE_CHECK | REACTIVE_DIRTY))) return;

  if (flags & REACTIVE_DIRTY) {
    recompute(node);
    return;
  }

  for (let d = node._deps; d !== null; d = d._nextDep) {
    const dep = d._dep;
    if ("_fn" in dep) {
      updateIfNecessary(dep as ComputedNode<unknown>);
      // A recomputed dep may have marked this node DIRTY (e.g. equals: false)
      if (node._flags & REACTIVE_DIRTY) {
        recompute(node);
        return;
      }
      // Pending/errored deps force recompute so status propagates
      if ((dep as ComputedNode<unknown>)._flags & (STATUS_PENDING | STATUS_ERROR)) {
        recompute(node);
        return;
      }
    }
    if (!depEquals(dep, d._lastValue, dep._value)) {
      recompute(node);
      return;
    }
  }

  node._flags &= ~REACTIVE_CHECK;
  markEpoch++; // a mark was consumed without recompute
}

/** Run disposal-phase callbacks untracked so reads don't leak into parents */
function runUntracked(fn: () => void): void {
  const prevTracking = tracking;
  const prevObserver = currentObserver;
  tracking = false;
  currentObserver = null;
  try {
    fn();
  } catch (err) {
    console.error("Error in cleanup:", err);
  } finally {
    tracking = prevTracking;
    currentObserver = prevObserver;
  }
}

/** Effect cleanup before re-run/dispose: children first, then own cleanups */
function runEffectCleanups(node: ComputedNode<unknown>): void {
  // Dispose children first (inner cleanups run before outer)
  const children = node.children;
  if (children !== null) {
    for (let i = children.length - 1; i >= 0; i--) {
      disposeNode(children[i]);
    }
    children.length = 0;
  }

  if (node._cleanup) {
    const cleanup = node._cleanup;
    node._cleanup = undefined;
    runUntracked(cleanup);
  }

  const cleanups = node.cleanups;
  if (cleanups !== null) {
    for (let i = cleanups.length - 1; i >= 0; i--) {
      runUntracked(cleanups[i]);
    }
    cleanups.length = 0;
  }
}

function registerWithBoundary(node: ComputedNode<unknown>): void {
  const handle = node._context[LOADING_BOUNDARY] as LoadingBoundaryHandle | undefined;
  if (handle) {
    node._boundary = handle;
    handle.add(node);
  } else {
    emitDiagnostic(
      "ASYNC_OUTSIDE_LOADING_BOUNDARY",
      "warning",
      "An effect read a pending async value with no Loading boundary above it; it will retry when the value resolves but nothing renders a fallback.",
      node._name,
    );
  }
}

function unregisterFromBoundary(node: ComputedNode<unknown>): void {
  if (node._boundary) {
    node._boundary.delete(node);
    node._boundary = null;
  }
}

let flushError: { error: unknown } | null = null;

/**
 * Route an effect error to the nearest error boundary, else rethrow.
 * During a flush the rethrow is deferred to the end of the flush so the
 * remaining queued effects still run (a failed effect must not strand
 * unrelated work in the queue).
 */
function handleEffectError(node: ComputedNode<unknown>, error: unknown): void {
  const handler = node._context[ERROR_BOUNDARY] as ((err: unknown) => void) | undefined;
  if (handler) {
    handler(error);
    return;
  }
  if (isFlushing) {
    if (!flushError) flushError = { error };
    return;
  }
  throw error;
}

function recompute(node: ComputedNode<unknown>): void {
  if (node._flags & REACTIVE_DISPOSED) return;

  markEpoch++; // marks are being consumed: future writes must re-propagate

  const isEffect = node._kind !== EFFECT_PURE;
  deleteFromHeap(node, isEffect ? heapFor(node) : renderHeap);

  // Dispose inner computations / run cleanups from the previous run
  if (
    node._cleanup !== undefined ||
    (node.cleanups !== null && node.cleanups.length > 0) ||
    (node.children !== null && node.children.length > 0)
  ) {
    runEffectCleanups(node);
  }

  const wasPending = (node._flags & STATUS_PENDING) !== 0;

  // Clear invalidation BEFORE running: anything set during the run is a
  // feedback write and must survive to trigger another pass
  node._flags &= ~(REACTIVE_CHECK | REACTIVE_DIRTY | STATUS_PENDING | STATUS_ERROR);
  node._error = undefined;

  // Reset deps tail for fresh tracking
  node._depsTail = null;

  const prevObserver = currentObserver;
  const prevTracking = tracking;
  const prevOwner = currentOwner;
  currentObserver = node;
  node._flags |= REACTIVE_RECOMPUTING_DEPS;
  tracking = true;

  // The node itself is the owner of computations created during its run
  node.disposed = false;
  currentOwner = node;

  let newValue: unknown;
  let threw = false;
  let notReady = false;
  let error: unknown;
  try {
    newValue = node._fn(node._flags & REACTIVE_UNINITIALIZED ? undefined : node._value);
  } catch (err) {
    threw = true;
    if (err instanceof NotReadyError) {
      notReady = true;
    } else {
      error = err;
    }
  } finally {
    tracking = prevTracking;
    currentObserver = prevObserver;
    node._flags &= ~REACTIVE_RECOMPUTING_DEPS;
    currentOwner = prevOwner;
  }

  // Cleanup old unused deps (depsTail may have changed during fn execution)
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

  if (threw) {
    if (notReady) {
      node._flags |= STATUS_PENDING;
      if (isEffect) {
        registerWithBoundary(node);
      } else {
        // Remember the session even before the first real fetch: the fetch
        // may start later from an unsessioned flush (waterfalls)
        if (activeAsyncSession !== null) node._session = activeAsyncSession;
        if (!wasPending) {
          propagate(node, REACTIVE_DIRTY);
        }
      }
    } else {
      if (isEffect) {
        clearSelfMarks(node);
        handleEffectError(node, error);
        return;
      }
      node._error = error;
      node._flags |= STATUS_ERROR;
      propagate(node, REACTIVE_DIRTY);
    }
    if (isEffect) clearSelfMarks(node);
    return;
  }

  // Async computed: keep previous value, mark pending, commit on resolve
  if (!isEffect && newValue instanceof Promise) {
    const id = (node._asyncId = (node._asyncId ?? 0) + 1);
    node._flags |= STATUS_PENDING;
    if (!wasPending) {
      propagate(node, REACTIVE_DIRTY);
    }
    if (node._inFlight) inFlight.delete(node._inFlight);
    node._inFlight = newValue;
    const session = activeAsyncSession ?? node._session ?? null;
    node._session = session;
    inFlight.set(newValue, session);
    newValue.then(
      (value) => {
        inFlight.delete(newValue as Promise<unknown>);
        if (node._flags & REACTIVE_DISPOSED || node._asyncId !== id) return;
        node._flags &= ~(STATUS_PENDING | REACTIVE_UNINITIALIZED);
        node._value = value;
        if (node._serializeKey !== undefined) {
          recordHydrationValue(node._session ?? null, node._serializeKey, value);
        }
        propagate(node, REACTIVE_DIRTY);
        schedule();
      },
      (err) => {
        inFlight.delete(newValue as Promise<unknown>);
        if (node._flags & REACTIVE_DISPOSED || node._asyncId !== id) return;
        node._flags = (node._flags & ~STATUS_PENDING) | STATUS_ERROR;
        node._error = err;
        propagate(node, REACTIVE_DIRTY);
        schedule();
      },
    );
    return;
  }

  if (isEffect && wasPending) {
    unregisterFromBoundary(node);
  }

  const first = (node._flags & REACTIVE_UNINITIALIZED) !== 0;
  const valueChanged =
    first ||
    wasPending ||
    node._equals === false ||
    !node._equals(node._value as never, newValue as never);

  if (valueChanged) {
    node._value = newValue;
    if (!isEffect) {
      propagate(node, node._equals === false || wasPending ? REACTIVE_DIRTY : REACTIVE_CHECK);
    }
  }

  if (isEffect) {
    if (node._apply) {
      const prev = node._appliedValue;
      node._appliedValue = newValue;
      const apply = node._apply;
      const prevT = tracking;
      const prevO = currentObserver;
      tracking = false;
      currentObserver = null;
      try {
        const cleanup = apply(newValue, prev);
        if (typeof cleanup === "function") node._cleanup = cleanup;
      } finally {
        tracking = prevT;
        currentObserver = prevO;
      }
    } else if (typeof newValue === "function") {
      node._cleanup = newValue as () => void;
    }
  }

  node._flags &= ~REACTIVE_UNINITIALIZED;
  if (isEffect) clearSelfMarks(node);
}

/**
 * Writes from an effect to its own dependencies do not re-trigger the
 * effect (self-marks are dropped after the run). Pure computeds keep
 * self-marks so the next read revalidates.
 *
 * When a self-mark is dropped, dep snapshots are resynced to the values
 * the effect itself wrote — those count as "seen", so only a later
 * external change re-triggers the effect.
 */
function clearSelfMarks(node: ComputedNode<unknown>): void {
  if (node._flags & (REACTIVE_CHECK | REACTIVE_DIRTY)) {
    for (let d = node._deps; d !== null; d = d._nextDep) {
      d._lastValue = d._dep._value;
    }
    node._flags &= ~(REACTIVE_CHECK | REACTIVE_DIRTY);
    markEpoch++; // marks dropped: future writes must re-propagate
  }
}

function disposeNode(node: ComputedNode<unknown>): void {
  if (node._flags & REACTIVE_DISPOSED) return;
  node._flags |= REACTIVE_DISPOSED;
  node.disposed = true;

  if (node._inFlight) {
    inFlight.delete(node._inFlight);
    node._inFlight = undefined;
  }

  unregisterFromBoundary(node);

  // Dispose children first (reverse order - LIFO)
  const children = node.children;
  if (children !== null) {
    for (let i = children.length - 1; i >= 0; i--) {
      disposeNode(children[i]);
    }
    children.length = 0;
  }

  if (node._cleanup) {
    const cleanup = node._cleanup;
    node._cleanup = undefined;
    runUntracked(cleanup);
  }

  const cleanups = node.cleanups;
  if (cleanups !== null) {
    for (let i = cleanups.length - 1; i >= 0; i--) {
      runUntracked(cleanups[i]);
    }
    cleanups.length = 0;
  }

  // Remove from heap
  deleteFromHeap(node, node._kind === EFFECT_USER ? userHeap : renderHeap);

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

/** Schedule an async flush on the microtask queue (latches until flush) */
function schedule(): void {
  // Inside batch() no microtask is needed: the batch flushes synchronously
  if (scheduled || isFlushing || batchDepth > 0) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    flushSync();
  });
}

/**
 * Synchronously drain all scheduled effects.
 * Render effects always run before user effects within each pass.
 */
function flushSync(): void {
  if (isFlushing || batchDepth > 0) return;
  isFlushing = true;

  flushError = null;
  try {
    let count = 0;
    while (renderHeap._count > 0 || userHeap._count > 0) {
      if (++count === 100000) {
        emitDiagnostic(
          "INFINITE_LOOP",
          "error",
          "Flush did not settle after 100000 iterations; an effect is likely writing a value it depends on.",
        );
        throw new Error("Potential infinite loop detected");
      }
      clock++;
      if (renderHeap._count > 0) {
        runHeap(renderHeap);
      } else {
        runHeap(userHeap);
      }
    }
    // TS can't see the handleEffectError assignment from inside runHeap
    const pendingError = flushError as { error: unknown } | null;
    if (pendingError) {
      flushError = null;
      throw pendingError.error;
    }
  } finally {
    isFlushing = false;
  }
}

/**
 * Synchronously flush all pending updates.
 * With a callback, runs it first so its writes are applied by the flush.
 */
export function flush(fn?: () => void): void {
  if (fn) fn();
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
  // Strict equality with NaN === NaN for reactivity purposes
  return a === b || (a !== a && b !== b);
}

/**
 * Create a reactive signal.
 *
 * `signal(value)` - plain writable signal
 * `signal(fn)` - writable derived signal: recomputed by fn(prev) when its
 * dependencies change, and writable via set/update until they do.
 */
export function signal<T>(
  initialValue: T | ((prev?: T) => T),
  options?: SignalOptions<T>,
): Signal<T> {
  if (typeof initialValue === "function") {
    return writableComputed(initialValue as (prev?: T) => T, options);
  }

  const node: SignalNode<T> = {
    _value: initialValue,
    _subs: null,
    _subsTail: null,
    _equals: options?.equals !== undefined ? options.equals : defaultEquals,
    _name: options?.name,
    _unobserved: options?.unobserved,
  };

  const read = (): T => {
    // Fast path: not tracking
    if (!tracking) return node._value;
    if (currentObserver && !(currentObserver._flags & REACTIVE_DISPOSED)) {
      link(node as SignalNode<unknown>, currentObserver);
    }
    return node._value;
  };

  const ownedWrite = options?.ownedWrite === true;

  const write = (newValue: T): void => {
    if (
      !ownedWrite &&
      tracking &&
      currentObserver !== null &&
      currentObserver._kind === EFFECT_PURE
    ) {
      emitDiagnostic(
        "REACTIVE_WRITE_IN_OWNED_SCOPE",
        "warning",
        "Signal written from inside a derived computation; derive the value instead, or create the signal with { ownedWrite: true }.",
        node._name,
      );
    }

    const eq = node._equals;
    const prev = node._value;
    if (eq === defaultEquals) {
      if (prev === newValue || (prev !== prev && newValue !== newValue)) return;
    } else if (eq !== false && eq(prev, newValue)) {
      return;
    }

    node._value = newValue;
    if (node._subs !== null && node._epoch !== markEpoch) {
      node._epoch = markEpoch;
      propagate(node as SignalNode<unknown>, eq === false ? REACTIVE_DIRTY : REACTIVE_CHECK);
    }
  };

  const accessor = read as Signal<T>;
  accessor.set = write;
  accessor.update = (fn: (prev: T) => T) => write(fn(node._value));
  accessor.peek = () => node._value;
  (accessor as unknown as { _node: SignalNode<T> })._node = node;

  return accessor;
}

function createComputedNode<T>(
  fn: (prev?: T) => T,
  kind: number,
  options?: SignalOptions<T>,
): ComputedNode<T> {
  const owner = getCurrentOwner();

  let initialHeight = 0;
  if (currentObserver) {
    initialHeight = currentObserver._height + 1;
  }

  const node: ComputedNode<T> = {
    _value: undefined as T,
    _subs: null,
    _subsTail: null,
    _equals:
      kind === EFFECT_PURE
        ? options?.equals !== undefined
          ? options.equals
          : defaultEquals
        : false,
    _name: options?.name,
    _unobserved: options?.unobserved,
    _fn: fn,
    _deps: null,
    _depsTail: null,
    _flags: REACTIVE_DIRTY | REACTIVE_UNINITIALIZED,
    _height: initialHeight,
    _nextHeap: undefined,
    _prevHeap: null as never,
    _kind: kind,
    // Owner fields: the node itself owns computations created during its
    // run (disposed before the next run and on node disposal)
    cleanups: null,
    children: null,
    disposed: false,
    dispose: null as unknown as () => void,
    _parent: owner,
    _context: owner !== null ? owner._context : defaultContext,
  };
  node._prevHeap = node as ComputedNode<unknown>;
  node.dispose = () => disposeNode(node as ComputedNode<unknown>);

  if (owner) {
    (owner.children ??= []).push(node as ComputedNode<unknown>);
  }

  return node;
}

/** Shared read implementation for computed/writable-derived accessors */
function computedRead<T>(node: ComputedNode<T>): T {
  const flags = node._flags;

  // Fast path: clean, settled, not tracking
  if (
    !tracking &&
    !(flags & (REACTIVE_CHECK | REACTIVE_DIRTY | REACTIVE_DISPOSED | STATUS_PENDING | STATUS_ERROR))
  ) {
    return node._value;
  }

  if (flags & REACTIVE_DISPOSED) {
    return node._value;
  }

  if (flags & (REACTIVE_CHECK | REACTIVE_DIRTY)) {
    updateIfNecessary(node as ComputedNode<unknown>);
  }

  // Link AFTER updating so the snapshot is the settled value, but BEFORE
  // throwing so pending/error resolution re-notifies the reader
  if (tracking && currentObserver && !(currentObserver._flags & REACTIVE_DISPOSED)) {
    link(node as ComputedNode<unknown>, currentObserver);
    if (node._height >= currentObserver._height) {
      currentObserver._height = node._height + 1;
    }
  }

  if (node._flags & STATUS_ERROR) {
    throw node._error;
  }

  if (node._flags & STATUS_PENDING) {
    if (latestDepth > 0 && !(node._flags & REACTIVE_UNINITIALIZED)) {
      return node._value;
    }
    throw new NotReadyError();
  }

  return node._value;
}

function computedPeek<T>(node: ComputedNode<T>): T {
  if (node._flags & (REACTIVE_CHECK | REACTIVE_DIRTY) && !(node._flags & REACTIVE_DISPOSED)) {
    const prevTracking = tracking;
    const prevObserver = currentObserver;
    tracking = false;
    currentObserver = null;
    try {
      updateIfNecessary(node as ComputedNode<unknown>);
    } finally {
      tracking = prevTracking;
      currentObserver = prevObserver;
    }
  }
  return node._value;
}

/**
 * Create a computed signal that derives its value from other signals.
 * Lazy: evaluated on first read, revalidated on read after invalidation.
 * May return a Promise - the computed then carries pending status until
 * resolution (see NotReadyError, latest, isPending).
 */
export function computed<T>(fn: (prev?: T) => T, options?: SignalOptions<T>): Computed<T> {
  const node = createComputedNode(fn, EFFECT_PURE, options);

  const accessor = (() => computedRead(node)) as Computed<T>;
  accessor.peek = () => computedPeek(node);
  (accessor as unknown as { _node: ComputedNode<T> })._node = node;

  return accessor;
}

/** Writable derived signal: signal(fn) */
function writableComputed<T>(fn: (prev?: T) => T, options?: SignalOptions<T>): Signal<T> {
  const node = createComputedNode(fn, EFFECT_PURE, options);

  const write = (newValue: T): void => {
    // Ensure initialized so a later dep change can recompute over the write
    if (node._flags & REACTIVE_UNINITIALIZED) {
      computedPeek(node);
    }
    const valueChanged =
      node._equals === false || !node._equals(node._value as never, newValue as never);
    if (!valueChanged) return;
    node._value = newValue;
    if (node._subs !== null) {
      propagate(
        node as ComputedNode<unknown>,
        node._equals === false ? REACTIVE_DIRTY : REACTIVE_CHECK,
      );
    }
  };

  const accessor = (() => computedRead(node)) as Signal<T>;
  accessor.set = write;
  accessor.update = (f: (prev: T) => T) => write(f(computedPeek(node)));
  accessor.peek = () => computedPeek(node);
  (accessor as unknown as { _node: ComputedNode<T> })._node = node;

  return accessor;
}

function createEffectNode(
  compute: (prev?: unknown) => unknown,
  apply: ((value: unknown, prev: unknown) => void | (() => void)) | undefined,
  kind: number,
): () => void {
  const node = createComputedNode(compute, kind);
  node._apply = apply;

  // First run is synchronous at creation; subsequent runs are scheduled
  recompute(node as ComputedNode<unknown>);

  return () => disposeNode(node as ComputedNode<unknown>);
}

/**
 * Run a side effect when signals change.
 *
 * `effect(fn)` - fn is tracked; an optionally returned function is the cleanup
 * `effect(compute, apply)` - split form: compute is tracked and returns a
 * value; apply(value, prev) runs untracked afterwards and may return cleanup
 *
 * User effects run after render effects, batched on the microtask queue.
 * The first run is deferred to the next flush (use flush() to force).
 */
export function effect<T>(
  compute: (prev?: T) => T | void | (() => void),
  apply?: (value: T, prev: T | undefined) => void | (() => void),
): () => void {
  return createEffectNode(
    compute as (prev?: unknown) => unknown,
    apply as ((value: unknown, prev: unknown) => void | (() => void)) | undefined,
    EFFECT_USER,
  );
}

/**
 * Render-phase effect: runs synchronously at creation and before user
 * effects on subsequent flushes. Used by the renderer for DOM bindings.
 */
export function renderEffect<T>(
  compute: (prev?: T) => T | void | (() => void),
  apply?: (value: T, prev: T | undefined) => void | (() => void),
): () => void {
  return createEffectNode(
    compute as (prev?: unknown) => unknown,
    apply as ((value: unknown, prev: unknown) => void | (() => void)) | undefined,
    EFFECT_RENDER,
  );
}

/**
 * Register a cleanup function for the current owner.
 * Returns the function for convenience.
 */
export function onCleanup<T extends () => void>(fn: T): T {
  const owner = getCurrentOwner();
  if (owner) {
    (owner.cleanups ??= []).push(fn);
  } else {
    emitDiagnostic(
      "NO_OWNER_CLEANUP",
      "warning",
      "onCleanup called outside a reactive owner; the cleanup will never run.",
    );
  }
  return fn;
}

/**
 * Schedule a callback to run after the current work settles.
 * Runs untracked in the captured owner context after the next flush.
 * Can return a cleanup function that runs when the owner is disposed.
 */
export function onMount(fn: () => void | (() => void)): void {
  let cleanup: (() => void) | void;
  const owner = getCurrentOwner();

  if (owner) {
    onCleanup(() => cleanup?.());
  }

  queueMicrotask(() => {
    flushSync();
    if (owner && !owner.disposed) {
      const prevOwner = currentOwner;
      currentOwner = owner;
      try {
        cleanup = untrack(fn);
      } finally {
        currentOwner = prevOwner;
      }
    } else if (!owner) {
      cleanup = untrack(fn);
      cleanup?.();
    }
  });
}

/** Solid 2.0 name for onMount */
export const onSettled = onMount;

/**
 * Compatibility shim: updates are batched on the microtask queue by default,
 * so batch() just runs fn and flushes synchronously at the end.
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
 */
export function createScope<T>(fn: (dispose: () => void) => T, detached = false): T {
  const owner = createOwnerScope(!detached);
  return runInOwner(owner, fn);
}

/** Internal: Create an owner scope */
function createOwnerScope(registerWithParent: boolean): Owner {
  let disposed = false;

  const owner: Owner = {
    cleanups: null,
    dispose: () => {},
    children: null,
    disposed: false,
    _parent: currentOwner,
    _context: currentOwner?._context ?? defaultContext,
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    owner.disposed = true;

    // Dispose children in reverse order (LIFO)
    const children = owner.children;
    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        disposeNode(children[i]);
      }
      children.length = 0;
    }

    // Run cleanups in reverse order (LIFO)
    const cleanups = owner.cleanups;
    if (cleanups !== null) {
      for (let i = cleanups.length - 1; i >= 0; i--) {
        runUntracked(cleanups[i]);
      }
      cleanups.length = 0;
    }
  };

  owner.dispose = dispose;

  if (registerWithParent && currentOwner) {
    (currentOwner.cleanups ??= []).push(dispose);
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
 * Whether a tracked computation is currently running.
 * Used by the store to skip node allocation on untracked reads.
 */
export function isTracking(): boolean {
  return tracking && currentObserver !== null;
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
// Async helpers (Solid 2.0)
// ============================================================================

/** In-flight async computations, stamped with the session that started them */
const inFlight = new Map<Promise<unknown>, symbol | null>();

/** Resolved values of keyed async computeds, bucketed by session (SSR) */
const hydrationData = new Map<symbol | null, Map<string, unknown>>();

function recordHydrationValue(session: symbol | null, key: string, value: unknown): void {
  let bucket = hydrationData.get(session);
  if (!bucket) {
    bucket = new Map();
    hydrationData.set(session, bucket);
  }
  bucket.set(key, value);
}

/** Session active while a fetch starts; lets settle() wait only its own work */
let activeAsyncSession: symbol | null = null;

/**
 * Set the active async session; fetches started while it's set are
 * attributed to it. Returns the previous session for restoring.
 * Used by renderToStringAsync to isolate concurrent server renders.
 */
export function setAsyncSession(session: symbol | null): symbol | null {
  const prev = activeAsyncSession;
  activeAsyncSession = session;
  return prev;
}

/**
 * Wait until the reactive graph is quiet: flushes synchronously, awaits
 * in-flight async computations, and repeats until nothing remains
 * (covers async waterfalls). The backbone of renderToStringAsync; also
 * handy in tests.
 *
 * With `session`, only waits for fetches attributed to that session (see
 * setAsyncSession) - required on servers where concurrent renders share
 * the module graph; fetches triggered by this settle's own flushes are
 * attributed automatically.
 */
export async function settle(session?: symbol): Promise<void> {
  const flushInSession = () => {
    if (session === undefined) {
      flushSync();
      return;
    }
    const prev = activeAsyncSession;
    activeAsyncSession = session;
    try {
      flushSync();
    } finally {
      activeAsyncSession = prev;
    }
  };

  flushInSession();
  while (true) {
    const waiting: Promise<unknown>[] = [];
    for (const [promise, owner] of inFlight) {
      if (session === undefined || owner === session) {
        waiting.push(promise);
      }
    }
    if (waiting.length === 0) break;
    await Promise.allSettled(waiting);
    flushInSession();
  }
}

/**
 * SSR: resolved values of keyed async computeds, for serialization.
 * With a session, returns that render's values (plus unsessioned ones).
 */
export function getHydrationData(session?: symbol): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const nullBucket = hydrationData.get(null);
  if (nullBucket) {
    for (const [key, value] of nullBucket) result[key] = value;
  }
  if (session !== undefined) {
    const bucket = hydrationData.get(session);
    if (bucket) {
      for (const [key, value] of bucket) result[key] = value;
    }
  } else {
    for (const [bucketSession, bucket] of hydrationData) {
      if (bucketSession === null) continue;
      for (const [key, value] of bucket) result[key] = value;
    }
  }
  return result;
}

/** SSR: reset recorded async data (one session's, or everything) */
export function clearHydrationData(session?: symbol): void {
  if (session !== undefined) {
    hydrationData.delete(session);
  } else {
    hydrationData.clear();
  }
}

/** Client: the payload emitted by generateHydrationScript, if present */
function getSeed(key: string): { found: boolean; value?: unknown } {
  const store = (globalThis as { __BARQ_DATA__?: Record<string, unknown> }).__BARQ_DATA__;
  if (store && key in store) {
    const value = store[key];
    delete store[key]; // consume: a later refresh() refetches for real
    return { found: true, value };
  }
  return { found: false };
}

/**
 * Returns whether any value read by fn is currently pending.
 * Reactive: subscribes to the values fn reads.
 */
export function isPending(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (err) {
    if (err instanceof NotReadyError) return true;
    throw err;
  }
}

/**
 * Read the latest settled value of pending computations instead of
 * throwing NotReadyError. Falls through (throws) for values that have
 * never resolved.
 */
export function latest<T>(fn: () => T): T {
  latestDepth++;
  try {
    return fn();
  } finally {
    latestDepth--;
  }
}

/**
 * Invalidate a derived/async computation and recompute it.
 * Observed computations re-run on the next flush; unobserved ones on next read.
 */
export function refresh(target: () => unknown): void {
  const node = (target as unknown as { _node?: ComputedNode<unknown> })._node;
  if (!node || !("_fn" in node)) return;
  node._flags = (node._flags & ~REACTIVE_CHECK) | REACTIVE_DIRTY;
  propagate(node, REACTIVE_DIRTY);
  if (node._kind !== EFFECT_PURE) {
    insertIntoHeap(node, heapFor(node));
  }
  schedule();
}

/**
 * Async derived value: a computed whose function returns a promise.
 * Reading it before resolution throws NotReadyError (caught by Loading
 * boundaries / isPending / latest).
 *
 * With `key`, the resolved value is recorded on the server (see
 * getHydrationData / generateHydrationScript) and consumed from
 * `__BARQ_DATA__` on the client: the first read resolves synchronously
 * with the server value instead of refetching. Note the seeded first run
 * doesn't track fn's dependencies; use refresh() to refetch.
 */
export function createAsync<T>(
  fn: (prev?: T) => Promise<T> | T,
  options?: SignalOptions<T> & { key?: string },
): Computed<T> {
  const key = options?.key;
  if (key === undefined) {
    return computed(fn as (prev?: T) => T, options);
  }

  let trySeed = true;
  const wrapped = (prev?: T): T => {
    if (trySeed) {
      trySeed = false;
      const seed = getSeed(key);
      if (seed.found) {
        return seed.value as T;
      }
    }
    return fn(prev) as T;
  };

  const accessor = computed(wrapped, options);
  (accessor as unknown as { _node: ComputedNode<T> })._node._serializeKey = key;
  return accessor;
}

// ============================================================================
// Context API
// ============================================================================

/** Value can be static or a reactive accessor */
type MaybeAccessor<T> = T | (() => T);

// Type-only: keeps Provider usable as a JSX component (no runtime cycle)
import type { JSXElement } from "@barqjs/core";

/**
 * Context object type
 */
export interface Context<T> {
  readonly id: symbol;
  readonly defaultValue: T | undefined;
  /** Provider component for JSX usage - accepts value or accessor */
  Provider: (props: { value: MaybeAccessor<T>; children: unknown }) => JSXElement;
}

/**
 * Create a context for dependency injection.
 */
export function createContext<T>(defaultValue?: T, description?: string): Context<T> {
  const id = Symbol(description ?? "context");

  // Provider creates an owned scope so it is disposed with its parent
  const Provider = (props: { value: MaybeAccessor<T>; children: unknown }): JSXElement => {
    return createScope(() => {
      const owner = getCurrentOwner();
      if (owner) {
        owner._context = {
          ...owner._context,
          [id]: props.value,
        };
      }

      if (typeof props.children === "function") {
        return (props.children as () => JSXElement)();
      }
      return props.children as JSXElement;
    });
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
export function setContext<T>(
  context: Context<T>,
  value?: T,
  owner: Owner | null = getOwner(),
): void {
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
 */
export function useContext<T>(context: Context<T>): () => T {
  const owner = getCurrentOwner();

  if (owner && hasContext(context, owner)) {
    const stored = owner._context[context.id];
    if (typeof stored === "function") {
      return stored as () => T;
    }
    return () => stored as T;
  }

  if (context.defaultValue !== undefined) {
    return () => context.defaultValue as T;
  }

  throw new ContextNotFoundError();
}
