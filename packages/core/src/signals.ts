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

import type { OwnershipSink, ScopeKind } from "./trace.ts";

/**
 * The L2b ownership trace's attachment point (CODESIGN.md §6). `null` until
 * `beginOwnershipTrace()` installs a sink.
 *
 * why: a `const` holder rather than an `export let`, and `import type` above
 * rather than a value import, because Bun inlines a module-scope numeric
 * `const` (`REACTIVE_DISPOSED` → `32`) only while a module has neither a value
 * import nor a reassigned top-level binding — and a signal accessor's
 * `toString()` is observable, since `diagnostic-accessor-coercion.tsx` renders
 * it into the DOM and snapshots it. Either of the obvious spellings moves that
 * snapshot.
 */
export const OWNERSHIP: { sink: OwnershipSink | null } = { sink: null };

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
const REACTIVE_CHILDREN_FORBIDDEN = 1 << 9; // Leaf effect: may not own primitives
const REACTIVE_AFFECTED = 1 << 10; // Declared in motion: reads as pending until released
const REACTIVE_IN_SNAPSHOT_SCOPE = 1 << 11; // Reads captured values, not live ones
const REACTIVE_SNAPSHOT_STALE = 1 << 12; // Was served a snapshot that diverged

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
 * §3.0 rule 3's brand. The compiler wraps every Block that USES its scope in
 * `_$b`, once per definition site; this marks the function in place and hands
 * it back, so a branded Block costs one property write and no extra closure.
 *
 * The brand is POSITIVE: it means "this value requires a scope". An unbranded
 * function is a Cell, or a Block that ignores its scope (an arity-0
 * `template()`, C6) — which is simultaneously a legal Cell, which is why rule 2
 * lets one call site serve both kinds. Kind travels with the value (rule 4),
 * so a forwarded Block is still branded and an arity guess is never consulted.
 *
 * It lives here rather than in `props.ts` for the reason `scope.ts` states at
 * the top of the file: this module may acquire no VALUE import, because Bun
 * stops inlining a module-scope numeric `const` once it has one, and a signal
 * accessor's own `toString()` is snapshotted by a fixture.
 */
export const BLOCK: unique symbol = Symbol.for("barq.block");

export function block<F extends (...args: never[]) => unknown>(fn: F): F {
  (fn as unknown as Record<symbol, boolean>)[BLOCK] = true;
  return fn;
}

/** Whether `value` is a Block that declared it needs the scope it is handed. */
export function isBlock(value: unknown): boolean {
  return (
    typeof value === "function" && Boolean((value as unknown as Record<symbol, boolean>)[BLOCK])
  );
}

/**
 * §3.0 rule 3. A construct invoked without a scope throws and NEVER falls back
 * to the ambient owner: that fallback is the Provider bug reintroduced at the
 * one place nobody would look for it.
 *
 * `null` is a scope VALUE, not a missing one — it is what the compiler emits
 * for a module-level root (`const _s$ = null`). Only `undefined` is missing.
 */
export class ScopeMissingError extends Error {
  constructor(readonly origin: string) {
    super(
      `${origin} was invoked without a scope. A Block takes the scope it must run under as its ` +
        `first argument; calling it with none is a mistimed construction, and falling back to ` +
        `the ambient owner would put the subtree under whatever happened to be current instead.`,
    );
    this.name = "ScopeMissingError";
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
  /**
   * `_sub._depGen` when this link was created or last revalidated in read
   * order. A link stamped with the subscriber's current generation sits in
   * the already-validated `[_deps.._depsTail]` prefix - an O(1) stand-in for
   * scanning the dep list.
   */
  _gen: number;
}

/** Options for signal/computed creation */
export interface SignalOptions<T> {
  name?: string;
  equals?: false | ((prev: T, next: T) => boolean);
  /** Called when the computed loses its last subscriber */
  unobserved?: () => void;
  /** Suppress the REACTIVE_WRITE_IN_OWNED_SCOPE diagnostic for this signal */
  ownedWrite?: boolean;
  /** Exclude this signal from snapshot capture */
  noSnapshot?: boolean;
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
/** Mirrors `diagnosticListeners.size !== 0` as a single load for hot paths */
let diagnosticsOn = false;

function addDiagnosticListener(listener: (event: DiagnosticEvent) => void): void {
  diagnosticListeners.add(listener);
  diagnosticsOn = true;
}

function removeDiagnosticListener(listener: (event: DiagnosticEvent) => void): void {
  diagnosticListeners.delete(listener);
  diagnosticsOn = diagnosticListeners.size !== 0;
}

export function emitDiagnostic(
  code: string,
  severity: "error" | "warning",
  message: string,
  nodeName?: string,
  data?: unknown,
): void {
  if (!diagnosticsOn) return;
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
 * INFINITE_LOOP, HYDRATION_SEED_DRIFT, PRIMITIVE_IN_FORBIDDEN_SCOPE,
 * RENDER_SUBTREE_NOT_OWNED.
 */
export const DEV = {
  diagnostics: {
    subscribe(listener: (event: DiagnosticEvent) => void): () => void {
      addDiagnosticListener(listener);
      return () => removeDiagnosticListener(listener);
    },
    capture(): { stop(): DiagnosticEvent[] } {
      const events: DiagnosticEvent[] = [];
      const listener = (event: DiagnosticEvent) => {
        events.push(event);
      };
      addDiagnosticListener(listener);
      return {
        stop() {
          removeDiagnosticListener(listener);
          return events;
        },
      };
    },
  },
};

/** Context record for owner */
export type ContextRecord = Record<string | symbol, unknown>;

/**
 * Base signal node. Every field is present on every instance: the engine
 * reads `_fn`/`_equals`/`_epoch` off both node kinds, so a missing slot
 * would make those loads polymorphic.
 */
interface SignalNode<T> {
  _value: T;
  _subs: Link | null; // Head of subscribers linked list
  _subsTail: Link | null; // Tail of subscribers linked list
  _equals: false | ((a: T, b: T) => boolean);
  _name: string | undefined;
  _unobserved: (() => void) | undefined;
  _epoch: number; // Last mark epoch this node propagated in (write dedupe)
  _fn: ((prev?: T) => T) | undefined; // undefined on plain signals; discriminates the two kinds
  _affected: number; // affects() refcount; non-zero means the value reads as pending
  _snapshot: unknown; // Captured value, or NO_SNAPSHOT when nothing was captured
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
  _depGen: number; // Bumped when a recompute starts re-reading dependencies
  _cleanup: (() => void) | undefined;
  // --- Q6: the Scope split. CODESIGN.md §4.2 / §10 Q6. Two slots replace the
  // six this node used to carry (cleanups, children, disposed, dispose,
  // _parent, _context).
  //
  // The revert is these four edits and nothing else: put the six fields back
  // in the literal below, drop `_owner`/`_scope`, make `hostScope` and
  // `lookupNodeContext` treat the node as its own scope, and drop
  // `currentHost` so `getCurrentOwner` is again a plain read of
  // `currentOwner`. Every other site already goes through those three.
  _owner: Scope | null; // the scope this node was created under
  _scope: Scope | null; // what this node owns; allocated on first demand, usually null
  _apply: ((value: unknown, prev: unknown) => void | (() => void)) | undefined; // Split-form effect phase
  _error: unknown; // Stored error when STATUS_ERROR
  _wave: number; // Last propagation epoch that visited this node
  // Cold: only ever touched on async / SSR paths, so they stay off the base
  // shape - paying 6 slots on every computed costs more than the rare
  // structure transition on the few nodes that actually go async.
  _appliedValue?: unknown; // Last value passed to _apply
  _asyncId?: number; // Guards stale async resolutions
  _boundary?: LoadingBoundaryHandle | null; // Boundary this pending effect registered with
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
  _min: number; // Lowest occupied height (maintained by insert/delete)
  _max: number; // Highest occupied height
  _count: number;
}

/** Sentinel for "no occupied height"; any real height compares lower */
const HEAP_EMPTY_MIN = 0x7fffffff;

function createHeap(): Heap {
  return {
    _heap: new Array(256).fill(undefined),
    _min: HEAP_EMPTY_MIN,
    _max: 0,
    _count: 0,
  };
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
    if (dep._fn !== undefined && dep._height >= newHeight) {
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
    // _min/_max are maintained by insert/delete, so a node re-inserted below
    // the cursor lowers _min and is picked up by the next pass
    const end = heap._max;
    for (let height = heap._min; height <= end; height++) {
      let node = heap._heap[height];
      while (node !== undefined) {
        if (node._flags & REACTIVE_IN_HEAP) {
          updateIfNecessary(node);
          // updateIfNecessary may not recompute (deps reverted); ensure removal
          deleteFromHeap(node, heap);
        } else {
          adjustHeight(node, heap);
        }
        node = heap._heap[height];
      }
    }
  }
  // Drained: widen the window back so stale bounds never shrink a later scan.
  // (deleteFromHeap deliberately leaves them alone - it is inlined into the
  // recompute/dispose paths and must stay small.)
  heap._min = HEAP_EMPTY_MIN;
  heap._max = 0;
}

// ============================================================================
// Global State
// ============================================================================

let currentObserver: ComputedNode<unknown> | null = null;
let tracking = false; // Only true during computation
let batchDepth = 0;
let scheduled = false;
let latestDepth = 0; // Inside latest(): pending reads return stale values
// oxlint-disable-next-line no-unused-vars -- flush-pass counter, not read yet
let clock = 0;

const defaultContext: ContextRecord = {};

// ============================================================================
// Scope — the unit of ownership and the unit of death (SEMANTICS.md §2)
// ============================================================================

/**
 * The nearest ancestor scope that catches, copied onto every scope at `enter`
 * so E1's lookup is O(1) and never walks. M2 lands the field and the copy; the
 * routing that reads it is M4's `boundary`.
 */
export interface Boundary {
  handle(error: unknown, scope: Scope): void;
}

/** A scope owns child scopes and child computations, in one ordered list. */
type Kid = Scope | ComputedNode<unknown>;

export interface Scope {
  parent: Scope | null;
  /** Prototype-chained; shared by reference until a provide forks it (X6). */
  ctx: ContextRecord;
  /** LIFO on disposal (O3.3); lazily allocated. */
  cleanups: (() => void)[] | null;
  /** Reverse creation order on disposal (O3.2); lazily allocated. */
  kids: Kid[] | null;
  catcher: Boundary | null;
  /** Bumped by dispose and by every unwind; async continuations compare it. */
  gen: number;
  dead: boolean;
  origin: string | undefined;
  dispose: () => void;
  /**
   * O4.3's restore target. `CURRENT` as it stood on the statement before this
   * scope's own `enter`, so `exit` puts back what was there rather than
   * `parent` — which is a different scope whenever `pin` is involved.
   *
   * CURRENT is the pair (`currentOwner`, `currentHost`), not `currentOwner`
   * alone: under Q6 a running computation whose scope is still unmaterialised
   * has `currentOwner === null` and the owner recorded only by `currentHost`.
   * Saving half of it made `exit` restore `null` and silently detach
   * everything the computation created afterwards.
   */
  _prev: Scope | null;
  /** The other half of O4.3's restore target; see `_prev`. */
  _prevHost: ComputedNode<unknown> | null;
  /** Whether `_prev`/`_prevHost` hold a live capture, so `exit` is idempotent. */
  _open: boolean;
  /** O3.4; allocated on the first `abortSignal()` read. */
  _abort: AbortController | null;
  /** O3.5; installed by whichever backend owns nodes under this scope. */
  _range: (() => void) | null;
  /** Whether `ctx` is this scope's own record rather than an inherited one. */
  _forked: boolean;
  /** Root of a snapshot scope (see markSnapshotScope) */
  _snapshotScope?: boolean;
}

/** The pre-split name. `Owner` and `Scope` are the same object now. */
export type Owner = Scope;

/**
 * The ambient owner. O4.5: this is an OBSERVATION channel — user-written
 * `onCleanup()` and `Ctx.use()` find their owner through it — and never a
 * decision channel. A primitive with a `Scope` argument in scope that reads
 * this instead is the defect the redesign exists to remove.
 */
let currentOwner: Scope | null = null;
/**
 * The computation whose scope `currentOwner` stands for, while that scope is
 * still unallocated. Q6: a computation that owns nothing never pays for a
 * Scope, so the owner is materialised on the first thing that needs one.
 */
let currentHost: ComputedNode<unknown> | null = null;

let scopesAllocated = 0;

/**
 * O1's falsification procedure counts `Scope` ALLOCATIONS, and the ownership
 * trace counts scopes some construct *declared* through `enter`. Q6 makes
 * those different numbers: `hostScope` materialises a computation's scope
 * through no `enter`, so a backend that allocated one per component inside a
 * computation would satisfy the trace and falsify the rule. This is the other
 * count.
 */
export function scopeAllocations(): number {
  return scopesAllocated;
}

function makeScope(parent: Scope | null): Scope {
  scopesAllocated++;
  return {
    parent,
    ctx: parent !== null ? parent.ctx : defaultContext,
    cleanups: null,
    kids: null,
    catcher: parent !== null ? parent.catcher : null,
    gen: 0,
    dead: false,
    origin: undefined,
    dispose: null as unknown as () => void,
    _prev: null,
    _prevHost: null,
    _open: false,
    _abort: null,
    _range: null,
    _forked: false,
  };
}

/** The scope a computation owns its children through, allocated on demand. */
function hostScope(node: ComputedNode<unknown>): Scope {
  let scope = node._scope;
  if (scope === null) {
    scope = makeScope(node._owner);
    scope.dispose = () => disposeNode(node);
    node._scope = scope;
  }
  return scope;
}

function getCurrentOwner(): Scope | null {
  if (currentOwner === null && currentHost !== null) currentOwner = hostScope(currentHost);
  return currentOwner;
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
 * Errors propagate to the caller; the previous owner is always restored.
 */
export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  if (owner?.dead) {
    emitDiagnostic(
      "RUN_WITH_DISPOSED_OWNER",
      "warning",
      "runWithOwner called with a disposed owner; computations created inside will never be cleaned up by it.",
    );
  }
  const prevOwner = currentOwner;
  const prevHost = currentHost;
  currentOwner = owner;
  currentHost = null;
  try {
    return fn();
  } finally {
    currentOwner = prevOwner;
    currentHost = prevHost;
  }
}

/**
 * O2/§3.0: open a fresh child of `parent`, make it current, and hand it back.
 * `exit` is the other half and is required on both paths (O4.1).
 *
 * `parent` has no default, deliberately. O4.5: a primitive that reads the
 * ambient owner where a `Scope` argument is in scope is the defect shape this
 * redesign removes, and a defaulted parameter is that read with a nicer name.
 */
export function enter(parent: Scope | null, kind: ScopeKind = "scope"): Scope {
  if (parent !== null && parent.dead) {
    emitDiagnostic(
      "RUN_WITH_DISPOSED_OWNER",
      "warning",
      "enter() was called on a disposed scope; the child and everything created under it will never be cleaned up by it.",
    );
  }
  const scope = makeScope(parent);
  scope.dispose = () => disposeScope(scope);
  if (parent !== null) (parent.kids ??= []).push(scope);
  scope._prev = currentOwner;
  scope._prevHost = currentHost;
  scope._open = true;
  currentOwner = scope;
  currentHost = null;
  if (OWNERSHIP.sink !== null) OWNERSHIP.sink.enter(scope, parent, kind, parent !== null);
  return scope;
}

/** The scope a construct was handed, or a throw naming where it was missing. */
export function requireScope(scope: Scope | null | undefined, origin: string): Scope | null {
  if (scope === undefined) throw new ScopeMissingError(origin);
  return scope;
}

/**
 * §3.0 rule 2 / §3.13: a CELL-slot read. A Cell is called with no scope and
 * yields its value; a Block reaching here would be called with `s === undefined`
 * and rule 3 says that throws rather than silently building under `CURRENT` or
 * silently yielding `undefined`. The brand makes it a property test, so the
 * throw names both ends instead of waiting for a downstream `TypeError`.
 */
export function readSlot(value: unknown, origin: string): unknown {
  if (typeof value !== "function") return value;
  if (isBlock(value)) throw new ScopeMissingError(`${origin} (a Block reached a Cell slot)`);
  return (value as () => unknown)();
}

/**
 * O2/O4.5: run `fn` with the scope a construct was GIVEN as `CURRENT`, so every
 * ambient read below it resolves to that argument rather than to whatever
 * happened to be current at the call site. Handing a construct scope A while B
 * is ambient must put its subtree under A; without this the argument is
 * decoration and `pin` has nothing to override.
 */
export function underScope<T>(
  scope: Scope | null | undefined,
  origin: string,
  fn: (scope: Scope | null) => T,
): T {
  const given = requireScope(scope, origin);
  const prevOwner = currentOwner;
  const prevHost = currentHost;
  currentOwner = given;
  currentHost = null;
  try {
    return fn(given);
  } finally {
    currentOwner = prevOwner;
    currentHost = prevHost;
  }
}

/** Restore `CURRENT` to what it was before `scope`'s `enter` (O4.1, O4.3). */
export function exit(scope: Scope): void {
  if (!scope._open) return;
  scope._open = false;
  currentOwner = scope._prev;
  currentHost = scope._prevHost;
  scope._prev = null;
  scope._prevHost = null;
  if (OWNERSHIP.sink !== null) OWNERSHIP.sink.exit(scope);
}

/**
 * Non-zero while a parent is walking its own `kids`, which is the one case
 * where a child must NOT splice itself out: the walk clears the array whole.
 */
let unwindDepth = 0;

/** O3.2: kids in reverse creation order, depth-first. */
function unwindKids(scope: Scope): void {
  const kids = scope.kids;
  if (kids === null) return;
  unwindDepth++;
  try {
    unwindKidsInner(kids);
  } finally {
    unwindDepth--;
  }
  kids.length = 0;
}

function unwindKidsInner(kids: Kid[]): void {
  for (let i = kids.length - 1; i >= 0; i--) {
    const kid = kids[i];
    // `kids` is `null` on a scope that has none and absent on a computation,
    // so one load discriminates the two without a tag field on either.
    if ((kid as Scope).kids !== undefined) {
      disposeScope(kid as Scope);
    } else {
      disposeNode(kid as ComputedNode<unknown>);
    }
  }
}

/** O3.3: cleanups LIFO, after every kid is gone. */
function unwindCleanups(scope: Scope): void {
  const cleanups = scope.cleanups;
  if (cleanups === null) return;
  for (let i = cleanups.length - 1; i >= 0; i--) {
    runUntracked(cleanups[i], scope.catcher, scope);
  }
  cleanups.length = 0;
}

/**
 * O3: total and ordered, and idempotent. Mark dead and bump `gen` first, so a
 * cleanup that schedules work observes a dead scope; then kids, then cleanups,
 * then the abort signal, then the range.
 */
export function disposeScope(scope: Scope): void {
  if (scope.dead) return;
  scope.dead = true;
  scope.gen++;
  if (OWNERSHIP.sink !== null) OWNERSHIP.sink.dispose(scope);
  // O3.7 for the PARENT: a scope disposed on its own leaves its slot behind
  // otherwise, so repeatedly creating and disposing children of a long-lived
  // scope retains every dead one. Skipped under `unwindKids`, which is
  // clearing the whole array anyway.
  const parent = scope.parent;
  if (unwindDepth === 0 && parent !== null && parent.kids !== null) {
    const at = parent.kids.indexOf(scope);
    if (at !== -1) parent.kids.splice(at, 1);
  }
  unwindKids(scope);
  unwindCleanups(scope);
  const abort = scope._abort;
  if (abort !== null) {
    scope._abort = null;
    abort.abort();
  }
  const range = scope._range;
  if (range !== null) {
    scope._range = null;
    range();
  }
}

/**
 * O3.4: an `AbortSignal` that fires when the scope dies, so native listeners
 * and in-flight fetches are killed by the same act that kills the scope.
 */
export function abortSignal(scope: Scope): AbortSignal {
  const controller = (scope._abort ??= new AbortController());
  return controller.signal;
}

/** O3.5: the range removal this scope owns; disposal runs it last. */
export function ownRange(scope: Scope, remove: () => void): void {
  scope._range = remove;
}

/**
 * X6/§3.3: share the parent record by reference until the first provide, then
 * `Object.create` once. A scope that provides nothing costs nothing, and a
 * provider costs one prototype link regardless of how many keys are in scope.
 */
export function provideOn(scope: Scope, key: string | symbol, value: unknown): void {
  if (!scope._forked) {
    scope.ctx = Object.create(scope.ctx) as ContextRecord;
    scope._forked = true;
  }
  scope.ctx[key] = value;
}

/** Returned by `lookupContext` for a key no scope on the chain binds. */
export const CONTEXT_MISS: unique symbol = Symbol("context-miss");

/**
 * X3: resolution is a walk of the scope chain, performed when the read
 * happens. Only a scope's OWN record counts, so a provider installed above a
 * consumer that already exists is still found — which is the whole point of
 * X3 and the reason `ErrorBoundary`'s build-then-install ordering is harmless.
 * Resolving through `ctx`'s prototype chain instead captures the record at
 * scope-creation time, which X3 forbids in as many words.
 */
export function lookupContext(scope: Scope | null, key: string | symbol): unknown {
  for (let at = scope; at !== null; at = at.parent) {
    if (at._forked && Object.hasOwn(at.ctx, key)) return at.ctx[key];
  }
  return CONTEXT_MISS;
}

/** The same walk from a computation, which may not have materialised a scope. */
function lookupNodeContext(node: ComputedNode<unknown>, key: string | symbol): unknown {
  return lookupContext(node._scope !== null ? node._scope : node._owner, key);
}

/**
 * Effects and cleanups created while `CURRENT` was null, in creation order.
 *
 * O5 says `render(block, container)` opens the root scope and invokes the
 * block under it, and once M3's calling convention lands that is the whole
 * story. Until it does, the compiler emits `render(Tree({}), host)` — the
 * subtree is an ARGUMENT, so it is built before `render` is entered and there
 * is no owner in existence at the moment its effects are created. Dropping
 * them on the floor is what makes every barq mount leak its reactive graph.
 *
 * So they are held here instead, and the next root scope claims them. Pure
 * computeds are not collected: nothing schedules them, and disposing the
 * effects that read them unlinks them anyway, so a list would only retain
 * garbage.
 *
 * **The window is one turn.** A mount claims what the same synchronous turn
 * built, and `flushSync` drops whatever is still unclaimed when the turn's work
 * settles. Holding them for the lifetime of the process instead made every
 * ownerless effect immortal — 217 bytes retained per effect, measured, and a
 * 14–30% slowdown on the DOM rows — and let an unrelated later `render` adopt
 * and destroy work it had nothing to do with.
 *
 * **This list dies with M3.** A Block-taking `render` builds under the root,
 * `adoptOrphans` has nothing to find, and the three functions below go with it.
 */
const orphans: Kid[] = [];

/** Move everything built with no owner onto `scope`, oldest first. */
function adoptOrphans(scope: Scope): void {
  if (orphans.length === 0) return;
  const kids = (scope.kids ??= []);
  for (let i = 0; i < orphans.length; i++) {
    const kid = orphans[i];
    if ((kid as Scope).kids !== undefined) {
      (kid as Scope).parent = scope;
    } else {
      (kid as ComputedNode<unknown>)._owner = scope;
      const own = (kid as ComputedNode<unknown>)._scope;
      if (own !== null) own.parent = scope;
    }
    kids.push(kid);
  }
  release(orphans);
}

/** Cleanups registered with no owner; adopted by the same root scope. */
const orphanCleanups: (() => void)[] = [];

function adoptOrphanCleanups(scope: Scope): void {
  if (orphanCleanups.length === 0) return;
  const cleanups = (scope.cleanups ??= []);
  for (let i = 0; i < orphanCleanups.length; i++) cleanups.push(orphanCleanups[i]);
  release(orphanCleanups);
}

/**
 * `list.length = 0` publishes a shorter length and leaves the old values in
 * the backing vector, where they go on holding everything they reference. On a
 * module-level list that is a permanent leak — 253 bytes per ownerless effect,
 * measured, with the list reading as empty the whole time — so the slots are
 * released before the length is.
 */
function release(list: unknown[]): void {
  for (let i = 0; i < list.length; i++) list[i] = undefined;
  list.length = 0;
}

/** Close the claim window: unclaimed at flush time is unclaimed for good. */
function dropOrphans(): void {
  if (orphans.length !== 0) release(orphans);
  if (orphanCleanups.length !== 0) release(orphanCleanups);
}

/**
 * O5: open the root scope a mount is owned by. It is a catcher by
 * construction, so E1's "the nearest catching scope always exists" is true
 * without a walk, and it claims whatever the mount built before it existed.
 */
export function enterRoot(): Scope {
  const scope = makeScope(null);
  scope.dispose = () => disposeScope(scope);
  scope.catcher = { handle: rootCatch };
  scope._prev = currentOwner;
  scope._prevHost = currentHost;
  scope._open = true;
  currentOwner = scope;
  currentHost = null;
  if (OWNERSHIP.sink !== null) OWNERSHIP.sink.enter(scope, null, "root", false);
  adoptOrphans(scope);
  adoptOrphanCleanups(scope);
  return scope;
}

function rootCatch(error: unknown): void {
  throw error;
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
      nextDep._gen = sub._depGen;
      sub._depsTail = nextDep;
      return;
    }
  }

  // Already subscribed, and the link was validated earlier in THIS pass, so
  // it sits in the [_deps.._depsTail] prefix and needs no re-linking. A link
  // left over from a previous pass does not qualify: the read order changed,
  // and reusing it here would leave it beyond _depsTail, where the stale-dep
  // trim at the end of recompute unsubscribes a dependency that was read.
  const prevSub = dep._subsTail;
  if (
    prevSub !== null &&
    prevSub._sub === sub &&
    (!isRecomputing || prevSub._gen === sub._depGen)
  ) {
    return;
  }

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
    _gen: sub._depGen,
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

/**
 * Bumped whenever any invalidation mark is consumed (recompute, validation,
 * self-mark drop) or the topology changes. While the epoch is unchanged,
 * marks already placed are still standing, so neither a signal that already
 * propagated nor a pure node already visited needs to be walked again.
 * Doubles as the propagation wave id.
 */
let markEpoch = 1;
let markWave = 0;

/**
 * Mark a node CHECK or DIRTY. Effects are inserted into their heap;
 * pure computeds propagate CHECK to their subscribers (lazy pull).
 *
 * Epoch stamps make a propagation re-traverse pure nodes that are still
 * marked from an earlier epoch (a downstream effect may have dropped its
 * self-mark since), while deduplicating within one epoch - diamonds visit
 * each node once, and so do repeated writes that consumed no marks.
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
    // Already visited this epoch: only handle a CHECK -> DIRTY upgrade.
    // Subscribers are already CHECK from that visit, which is enough.
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
 * Notify subscribers of a changed node.
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
    if (dep._fn !== undefined) {
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
/**
 * O3.6: a cleanup that throws routes to the scope's catcher and MUST NOT abort
 * the remaining cleanups. `catcher` is copied at `enter`, so reaching it is a
 * field read rather than a walk — and it is the reader that field was missing:
 * it was written by `makeScope` and `enterRoot` and consulted by nothing, which
 * made E1 look covered by a cost with no behaviour attached.
 *
 * A catcher that rethrows (the root's) still may not abort the unwind, so the
 * rethrow is caught here and reported. What routing buys is that a boundary
 * ABOVE the dying scope sees the error at all.
 */
function runUntracked(fn: () => void, catcher: Boundary | null = null, scope?: Scope): void {
  const prevTracking = tracking;
  const prevObserver = currentObserver;
  tracking = false;
  currentObserver = null;
  try {
    fn();
  } catch (err) {
    if (catcher !== null) {
      try {
        catcher.handle(err, scope as Scope);
        return;
      } catch {
        // The root's catcher rethrows. O3.6's second half says the remaining
        // cleanups still run, so it lands in the report below rather than out.
      }
    }
    console.error("Error in cleanup:", err);
  } finally {
    tracking = prevTracking;
    currentObserver = prevObserver;
  }
}

/** Effect cleanup before re-run/dispose: children first, then own cleanups */
function runEffectCleanups(node: ComputedNode<unknown>): void {
  const scope = node._scope;
  if (scope !== null) {
    scope.gen++;
    unwindKids(scope);
  }

  if (node._cleanup) {
    const cleanup = node._cleanup;
    node._cleanup = undefined;
    runUntracked(cleanup);
  }

  if (scope !== null) unwindCleanups(scope);
}

/** When set, a pending read with no Loading boundary above it is an error */
let loadingBoundaryRequired = false;

/**
 * Make a pending async read with no enclosing Loading boundary throw instead
 * of warning. Off by default.
 */
export function enforceLoadingBoundary(enabled: boolean): void {
  loadingBoundaryRequired = enabled;
}

/** Latched when an error escaped every boundary during a flush */
let escapedError = false;

/**
 * Clear the latched "an error escaped every boundary" state. barq rethrows
 * such errors rather than halting the graph, so this only drops the latch.
 */
export function resetErrorHalt(): void {
  escapedError = false;
}

/** Whether an error has escaped every boundary since the last reset */
export function hasEscapedError(): boolean {
  return escapedError;
}

function registerWithBoundary(node: ComputedNode<unknown>): void {
  const found = lookupNodeContext(node, LOADING_BOUNDARY);
  const handle = (found === CONTEXT_MISS ? undefined : found) as LoadingBoundaryHandle | undefined;
  if (handle) {
    node._boundary = handle;
    handle.add(node);
    return;
  }
  const message =
    "An effect read a pending async value with no Loading boundary above it; it will retry when the value resolves but nothing renders a fallback.";
  emitDiagnostic("ASYNC_OUTSIDE_LOADING_BOUNDARY", "warning", message, node._name);
  if (loadingBoundaryRequired) {
    throw new Error(`[ASYNC_OUTSIDE_LOADING_BOUNDARY] ${message}`);
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
  const routed = lookupNodeContext(node, ERROR_BOUNDARY);
  const handler = (routed === CONTEXT_MISS ? undefined : routed) as
    | ((err: unknown) => void)
    | undefined;
  if (handler) {
    handler(error);
    return;
  }
  escapedError = true;
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
  const owned = node._scope;
  if (
    node._cleanup !== undefined ||
    (owned !== null &&
      ((owned.cleanups !== null && owned.cleanups.length > 0) ||
        (owned.kids !== null && owned.kids.length > 0)))
  ) {
    runEffectCleanups(node);
  }

  const wasPending = (node._flags & STATUS_PENDING) !== 0;

  // Clear invalidation BEFORE running: anything set during the run is a
  // feedback write and must survive to trigger another pass
  // AFFECTED deliberately survives: it is released by its declarer, not by a run
  node._flags &= ~(REACTIVE_CHECK | REACTIVE_DIRTY | STATUS_PENDING | STATUS_ERROR);
  node._error = undefined;

  // Reset deps tail for fresh tracking; the generation bump invalidates every
  // link stamp from the previous pass so read-order changes are detected
  node._depsTail = null;
  node._depGen++;

  const prevObserver = currentObserver;
  const prevTracking = tracking;
  const prevOwner = currentOwner;
  const prevHost = currentHost;
  currentObserver = node;
  node._flags |= REACTIVE_RECOMPUTING_DEPS;
  tracking = true;

  // The node owns what its run creates. Q6: it stands in for a scope it may
  // never allocate, so the scope is materialised only if something asks.
  currentOwner = node._scope;
  currentHost = node;

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
    currentHost = prevHost;
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

  if (node._inFlight) {
    inFlight.delete(node._inFlight);
    node._inFlight = undefined;
  }

  unregisterFromBoundary(node);

  const scope = node._scope;
  if (scope !== null) {
    scope.dead = true;
    scope.gen++;
    unwindKids(scope);
  }

  if (node._cleanup) {
    const cleanup = node._cleanup;
    node._cleanup = undefined;
    runUntracked(cleanup);
  }

  if (scope !== null) {
    unwindCleanups(scope);
    const abort = scope._abort;
    if (abort !== null) {
      scope._abort = null;
      abort.abort();
    }
    const range = scope._range;
    if (range !== null) {
      scope._range = null;
      range();
    }
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
  dropOrphans();

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
    _epoch: 0,
    _fn: undefined,
    _affected: 0,
    _snapshot: NO_SNAPSHOT,
  };

  if (slowSignalRead !== 0 && snapshotCaptureActive && options?.noSnapshot !== true) {
    node._snapshot = initialValue;
    snapshotSources.add(node as SignalNode<unknown>);
  }

  const read = (): T => {
    // One global load decides whether any of the rare read modes are live.
    // Zero in every ordinary app, so the common path stays two branches.
    if (slowSignalRead !== 0) return readSignalSlow(node as SignalNode<unknown>) as T;
    if (!tracking) return node._value;
    if (currentObserver && !(currentObserver._flags & REACTIVE_DISPOSED)) {
      link(node as SignalNode<unknown>, currentObserver);
    }
    return node._value;
  };

  const ownedWrite = options?.ownedWrite === true;

  const write = (newValue: T): void => {
    if (
      diagnosticsOn &&
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
  const host = currentHost;
  const owner = getCurrentOwner();

  let inheritedFlags = 0;
  if (
    host !== null
      ? (host._flags & REACTIVE_IN_SNAPSHOT_SCOPE) !== 0
      : owner?._snapshotScope === true
  ) {
    inheritedFlags = REACTIVE_IN_SNAPSHOT_SCOPE;
  }

  if (host !== null && host._flags & REACTIVE_CHILDREN_FORBIDDEN) {
    emitDiagnostic(
      "PRIMITIVE_IN_FORBIDDEN_SCOPE",
      "error",
      "Reactive primitives cannot be created inside createTrackedEffect; it is a leaf effect for wiring external sources.",
      options?.name,
    );
  }

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
    _epoch: 0,
    _fn: fn,
    _affected: 0,
    _snapshot: NO_SNAPSHOT,
    _deps: null,
    _depsTail: null,
    _flags: REACTIVE_DIRTY | REACTIVE_UNINITIALIZED | inheritedFlags,
    _height: initialHeight,
    _nextHeap: undefined,
    _prevHeap: null as never,
    _kind: kind,
    _depGen: 0,
    // Q6: two slots, not six. What this node owns lives on `_scope`, which
    // most nodes never allocate.
    _owner: owner,
    _scope: null,
    _cleanup: undefined,
    _apply: undefined,
    _error: undefined,
    _wave: 0,
  };
  node._prevHeap = node as ComputedNode<unknown>;

  if (owner !== null) {
    (owner.kids ??= []).push(node as ComputedNode<unknown>);
  } else if (kind !== EFFECT_PURE) {
    orphans.push(node as ComputedNode<unknown>);
  }

  if (externalSource !== null) {
    wireExternalSource(node as ComputedNode<unknown>, owner);
  }

  return node;
}

/** Shared read implementation for computed/writable-derived accessors */
function computedRead<T>(node: ComputedNode<T>): T {
  const flags = node._flags;

  // Fast path: clean, settled, not tracking
  if (
    !tracking &&
    !(
      flags &
      (REACTIVE_CHECK |
        REACTIVE_DIRTY |
        REACTIVE_DISPOSED |
        STATUS_PENDING |
        STATUS_ERROR |
        REACTIVE_AFFECTED)
    )
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

  if (node._flags & (STATUS_PENDING | REACTIVE_AFFECTED)) {
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
  recompute(node);

  return () => disposeNode(node);
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
 * Effect for bridging external sources (event emitters, sockets, stores from
 * other libraries). Tracked like a normal effect, but pinned ahead of the
 * ordered user effects and forbidden from creating child reactive primitives,
 * so it stays a leaf that only wires subscriptions up.
 *
 * The returned function, if any, is the cleanup: it runs before each re-run
 * and on disposal.
 */
export function createTrackedEffect(
  compute: () => void | (() => void),
  options?: { name?: string },
): () => void {
  const node = createComputedNode(
    compute as (prev?: unknown) => unknown,
    EFFECT_USER,
    options as SignalOptions<unknown>,
  );
  // Leaf effect: no graph position of its own, and no owned primitives
  node._height = 0;
  node._flags |= REACTIVE_CHILDREN_FORBIDDEN;
  recompute(node);
  return () => disposeNode(node);
}

/**
 * Manual tracking: `track(fn)` subscribes to whatever `fn` reads and fires
 * `onInvalidate` once when any of it changes. The subscription is consumed by
 * that single fire - call `track` again to re-arm.
 *
 * `onInvalidate` may return a cleanup, run before the next fire and on
 * disposal of the owner that created the reaction.
 */
export function createReaction(
  onInvalidate: () => void | (() => void),
): (tracking: () => void) => void {
  let pendingCleanup: (() => void) | undefined;
  const owner = getCurrentOwner();
  let disposeArm: (() => void) | undefined;

  if (owner !== null) {
    (owner.cleanups ??= []).push(() => {
      disposeArm?.();
      disposeArm = undefined;
      pendingCleanup?.();
      pendingCleanup = undefined;
    });
  }

  return (tracking: () => void): void => {
    // Replacing an arm must dispose the old one, otherwise its sources stay
    // live and a superseded dependency still fires the callback
    disposeArm?.();
    disposeArm = undefined;

    runWithOwner(owner, () => {
      let armed = false;
      let disposeSelf: (() => void) | undefined;
      const dispose = createEffectNode(
        () => {
          tracking();
        },
        () => {
          // The arming run itself is not an invalidation
          if (!armed) {
            armed = true;
            return;
          }
          disposeArm = undefined;
          pendingCleanup?.();
          pendingCleanup = onInvalidate() as (() => void) | undefined;
          disposeSelf?.();
        },
        EFFECT_USER,
      );
      disposeSelf = dispose;
      disposeArm = dispose;
    });
  };
}

/**
 * Resolve a reactive expression to its first fully settled value.
 * Pending async reads are awaited; the promise rejects if the expression
 * settles with an error. Does not subscribe - call it outside tracking.
 */
export function resolve<T>(fn: () => T): Promise<T> {
  if (tracking && currentObserver !== null) {
    return Promise.reject(
      new Error("resolve() cannot be called inside a tracked scope; it does not subscribe."),
    );
  }
  return new Promise<T>((res, rej) => {
    const owner = createOwnerScope(false);
    let settled = false;
    const finish = (): void => {
      settled = true;
      // Deferred: the effect node is mid-run, so tear down after it unwinds
      queueMicrotask(() => owner.dispose());
    };
    // A private boundary pair: pending reads retry silently instead of warning
    // about a missing Loading boundary, and errors reject rather than escape
    provideOn(owner, LOADING_BOUNDARY, {
      add() {},
      delete() {},
    } satisfies LoadingBoundaryHandle);
    provideOn(owner, ERROR_BOUNDARY, (err: unknown) => {
      if (settled) return;
      finish();
      rej(err);
    });
    runInOwner(owner, () => {
      createEffectNode(
        fn as (prev?: unknown) => unknown,
        (value) => {
          if (settled) return;
          finish();
          res(value as T);
        },
        EFFECT_USER,
      );
    });
    schedule();
  });
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
    orphanCleanups.push(fn);
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
    if (owner && !owner.dead) {
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
export function createScope<T>(
  fn: (dispose: () => void, scope: Scope) => T,
  detached = false,
  kind: ScopeKind = "scope",
): T {
  const owner = createOwnerScope(!detached, kind);
  return runInOwner(owner, fn);
}

/**
 * Internal: create a scope, optionally registered with the scope above it.
 *
 * A child scope goes into `kids`, never into `cleanups`. O3 spells out why:
 * while a scope held its kids and its cleanups in one list, O3.2's ordering
 * claim and O3.3's had no observation that could tell them apart, so a
 * FIFO-cleanup bug reported as a kid-ordering violation.
 */
function createOwnerScope(registerWithParent: boolean, kind: ScopeKind = "scope"): Scope {
  const parent = getCurrentOwner();
  const scope = makeScope(parent);
  scope.dispose = () => disposeScope(scope);

  const holder = registerWithParent ? parent : null;
  if (holder !== null) (holder.kids ??= []).push(scope);

  if (OWNERSHIP.sink !== null) {
    OWNERSHIP.sink.enter(scope, parent, kind, holder !== null);
  }
  return scope;
}

/** Internal: Run function within an owner context */
function runInOwner<T>(owner: Scope, fn: (dispose: () => void, scope: Scope) => T): T {
  const prevOwner = currentOwner;
  const prevHost = currentHost;
  currentOwner = owner;
  currentHost = null;
  try {
    return fn(owner.dispose, owner);
  } finally {
    currentOwner = prevOwner;
    currentHost = prevHost;
    if (OWNERSHIP.sink !== null) OWNERSHIP.sink.exit(owner);
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
 * Create an owner scope without running anything in it; pair with
 * runWithOwner. Disposed with its parent, or manually via dispose().
 */
export function createOwner(kind: ScopeKind = "scope"): Owner {
  return createOwnerScope(true, kind);
}

/**
 * `pin(s, block)` — the one sanctioned way to break dynamic ownership (O2).
 * The returned Block ignores the scope it is handed and runs under `s`, and
 * because it is visible in the emitted text the exception is auditable.
 */
export function pin<A extends unknown[], R>(
  scope: Scope,
  block: (owner: Scope, ...args: A) => R,
): (ignored?: Scope, ...args: A) => R {
  return (_ignored?: Scope, ...args: A): R => {
    const prevOwner = currentOwner;
    const prevHost = currentHost;
    currentOwner = scope;
    currentHost = null;
    try {
      return block(scope, ...args);
    } finally {
      currentOwner = prevOwner;
      currentHost = prevHost;
    }
  };
}

/**
 * The computation currently tracking reads, or null outside a tracked scope.
 * O6: the observer is a different ambient from the owner and a different kind
 * of thing — a reactive node, never a scope. `untrack` moves this one and
 * `enter`/`exit` move the other, and neither touches the other's.
 */
export function getObserver(): object | null {
  return tracking ? currentObserver : null;
}

/** Whether a scope has been disposed. */
export function isDisposed(scope: Owner): boolean {
  return scope.dead;
}

/** The default signal comparator: strict equality, with NaN equal to NaN. */
export function isEqual<T>(a: T, b: T): boolean {
  return a === b || (a !== a && b !== b);
}

/** Whether the runtime has Proxy (stores degrade without it). */
export const SUPPORTS_PROXY: boolean = typeof Proxy === "function";

// ============================================================================
// Stable child ids (hydration / SSR correlation)
// ============================================================================

const childCounts = new WeakMap<Owner, number>();
const ownerIds = new WeakMap<Owner, string>();
const rootCounts = new Map<symbol | null, number>();

function formatChildId(prefix: string, index: number): string {
  const num = index.toString(36);
  const len = num.length - 1;
  return prefix + (len ? String.fromCharCode(64 + len) : "") + num;
}

// Root ids are numbered per render epoch, not per process: a server that
// reuses its module graph across requests would otherwise hand out r1, r2, …
// while every fresh client page starts again at r0, and the seeded data would
// land under keys nobody looks up.
function nextRootId(): string {
  const epoch = activeAsyncSession;
  const next = rootCounts.get(epoch) ?? 0;
  rootCounts.set(epoch, next + 1);
  return `r${next.toString(36)}`;
}

function ownerId(owner: Owner): string {
  let id = ownerIds.get(owner);
  if (id === undefined) {
    const parent = owner.parent;
    id = parent !== null ? getNextChildId(parent) : nextRootId();
    ownerIds.set(owner, id);
  }
  return id;
}

/**
 * Start a fresh id epoch. Server renders get one for free (each carries its
 * own async session); the client's epoch spans the page, so only reused
 * processes and tests need to call this.
 */
export function resetChildIds(session?: symbol): void {
  if (session !== undefined) {
    rootCounts.delete(session);
  } else {
    rootCounts.clear();
  }
}

/** Allocate the next stable child id for `owner` (consumes the counter). */
export function getNextChildId(owner: Owner): string {
  const next = childCounts.get(owner) ?? 0;
  childCounts.set(owner, next + 1);
  return formatChildId(ownerId(owner), next);
}

/** The id getNextChildId would return next, without consuming it. */
export function peekNextChildId(owner: Owner): string {
  return formatChildId(ownerId(owner), childCounts.get(owner) ?? 0);
}

/**
 * The serialization key of an auto-keyed read. The counter is consumed either
 * way, so naming one read never renumbers its siblings.
 */
function autoKey(owner: Owner, name: string | undefined): string {
  const id = getNextChildId(owner);
  return name === undefined ? id : `${id}~${name}`;
}

/**
 * Read signals without creating dependencies.
 * Note: Owner context is maintained (only tracking is disabled).
 */
export function untrack<T>(fn: () => T): T {
  if (externalSource !== null) {
    return externalSource.untrack(() => untrackInner(fn));
  }
  return untrackInner(fn);
}

function untrackInner<T>(fn: () => T): T {
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
  resetChildIds(session);
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
 * Seeded values the client never claimed, reported once hydration has settled.
 *
 * An auto-key is an owner-tree POSITION, so a client tree that is not the
 * server's shifts every key after the divergence: a read can then claim a value
 * recorded for a different call and resolve synchronously with it, which is
 * wrong data rather than a refetch. Nothing positional can tell those apart at
 * the moment of the read — the key carries no information about what was
 * fetched — but the leftovers prove it afterwards, because a shifted tree
 * always strands the tail of the payload.
 *
 * `{ name }` folds an identity into the auto-key, and `{ key }` replaces it
 * outright; either takes a read out of the positional scheme.
 */
export function unclaimedSeeds(): string[] {
  const store = (globalThis as { __BARQ_DATA__?: Record<string, unknown> }).__BARQ_DATA__;
  const unclaimed = store === undefined ? [] : Object.keys(store);
  if (unclaimed.length !== 0) {
    emitDiagnostic(
      "HYDRATION_SEED_DRIFT",
      "warning",
      `${unclaimed.length} seeded async value(s) were never claimed (${unclaimed.join(", ")}). ` +
        "The client's owner tree is not the one the server rendered, so a positional auto-key " +
        "may have resolved a read with another call's value. Give the reads a `name` or a `key`.",
      undefined,
      unclaimed,
    );
  }
  return unclaimed;
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
  if (!node || node._fn === undefined) return;
  node._flags = (node._flags & ~REACTIVE_CHECK) | REACTIVE_DIRTY;
  propagate(node, REACTIVE_DIRTY);
  if (node._kind !== EFFECT_PURE) {
    insertIntoHeap(node, heapFor(node));
  }
  schedule();
}

// ============================================================================
// Snapshot capture (hydration resume)
// ============================================================================

/** Distinguishes "nothing captured" from a captured `undefined` */
const NO_SNAPSHOT: unique symbol = Symbol("no-snapshot");

/**
 * Non-zero while any rare read mode is live (snapshot capture, affects marks).
 * The signal read tests this one global before doing anything unusual.
 */
let slowSignalRead = 0;

let snapshotCaptureActive = false;
const snapshotSources = new Set<SignalNode<unknown>>();

/**
 * Start or stop recording snapshots. While active, every signal created
 * captures its initial value, and computations inside a snapshot scope read
 * that captured value instead of the live one.
 */
export function setSnapshotCapture(active: boolean): void {
  if (active === snapshotCaptureActive) return;
  snapshotCaptureActive = active;
  slowSignalRead += active ? 1 : -1;
}

/**
 * Mark an owner's subtree as reading snapshot values. Computations created
 * under it see the captured values until the scope is released.
 */
export function markSnapshotScope(owner: Owner): void {
  owner._snapshotScope = true;
  for (const kid of owner.kids ?? []) {
    if ((kid as Scope).kids === undefined) {
      (kid as ComputedNode<unknown>)._flags |= REACTIVE_IN_SNAPSHOT_SCOPE;
    }
  }
}

/**
 * Release a snapshot scope: computations that were served a snapshot value
 * differing from the live one are re-run against live state.
 */
export function releaseSnapshotScope(owner: Owner): void {
  owner._snapshotScope = false;
  releaseSnapshotSubtree(owner);
  schedule();
}

function releaseSnapshotSubtree(owner: Scope): void {
  const kids = owner.kids;
  if (kids === null) return;
  for (const kid of kids) {
    if ((kid as Scope).kids !== undefined) {
      if ((kid as Scope)._snapshotScope === true) continue; // nested scope owns its release
      releaseSnapshotSubtree(kid as Scope);
      continue;
    }
    const child = kid as ComputedNode<unknown>;
    child._flags &= ~REACTIVE_IN_SNAPSHOT_SCOPE;
    if (child._flags & REACTIVE_SNAPSHOT_STALE) {
      child._flags = (child._flags & ~REACTIVE_SNAPSHOT_STALE) | REACTIVE_DIRTY;
      if (child._kind !== EFFECT_PURE) insertIntoHeap(child, heapFor(child));
      propagate(child, REACTIVE_DIRTY);
    }
    const own = child._scope;
    if (own !== null) releaseSnapshotSubtree(own);
  }
}

/** Drop every captured snapshot and stop capturing. */
export function clearSnapshots(): void {
  for (const source of snapshotSources) {
    source._snapshot = NO_SNAPSHOT;
  }
  snapshotSources.clear();
  setSnapshotCapture(false);
}

/**
 * The read path taken while snapshot capture or an affects mark is live.
 * Kept out of line so the ordinary read stays small enough to inline.
 */
function readSignalSlow<T>(node: SignalNode<T>): T {
  if (node._affected !== 0 && latestDepth === 0) {
    if (tracking && currentObserver !== null && !(currentObserver._flags & REACTIVE_DISPOSED)) {
      link(node as SignalNode<unknown>, currentObserver);
    }
    throw new NotReadyError();
  }

  if (!tracking) return node._value;

  const observer = currentObserver;
  if (observer === null || observer._flags & REACTIVE_DISPOSED) return node._value;
  link(node as SignalNode<unknown>, observer);

  if (
    snapshotCaptureActive &&
    observer._flags & REACTIVE_IN_SNAPSHOT_SCOPE &&
    node._snapshot !== NO_SNAPSHOT
  ) {
    const captured = node._snapshot as T;
    // Remember that the snapshot diverged, so releasing the scope re-runs this
    if (captured !== node._value) observer._flags |= REACTIVE_SNAPSHOT_STALE;
    return captured;
  }

  return node._value;
}

/**
 * Declare that a derived value is in motion: it and everything downstream read
 * as pending (Loading boundaries show fallbacks, `latest()` keeps the last
 * settled value) until the returned release is called.
 *
 * Marks stack, so overlapping declarations each need their own release.
 * Targets must be derived (`computed` / `createAsync`); a plain signal has no
 * status channel to carry the mark.
 */
export function markInMotion(target: () => unknown): () => void {
  const node = (target as unknown as { _node?: SignalNode<unknown> })._node;
  if (!node) {
    throw new Error("affects() needs a signal or derived value created by this runtime.");
  }

  const derived = node._fn !== undefined;
  const count = node._affected + 1;
  node._affected = count;

  if (count === 1) {
    if (derived) {
      (node as ComputedNode<unknown>)._flags |= REACTIVE_AFFECTED;
    } else {
      slowSignalRead++;
    }
    propagate(node, REACTIVE_DIRTY);
    schedule();
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--node._affected > 0) return;
    if (derived) {
      (node as ComputedNode<unknown>)._flags &= ~REACTIVE_AFFECTED;
    } else {
      slowSignalRead--;
    }
    propagate(node, REACTIVE_DIRTY);
    schedule();
  };
}

// ============================================================================
// External reactive sources
// ============================================================================

export interface ExternalSource {
  track: (prev: unknown) => unknown;
  dispose: () => void;
}

export type ExternalSourceFactory = (
  fn: (prev?: unknown) => unknown,
  trigger: () => void,
) => ExternalSource;

export interface ExternalSourceConfig {
  factory: ExternalSourceFactory;
  untrack?: <T>(fn: () => T) => T;
}

let externalSource: { factory: ExternalSourceFactory; untrack: <T>(fn: () => T) => T } | null =
  null;

/**
 * Bridge another reactive library (MobX, Vue refs, ...) into the graph: every
 * computation created afterwards runs inside the external tracker, and an
 * external change re-runs it.
 *
 * Repeat calls compose - each factory wraps the previous one.
 */
export function enableExternalSource(config: ExternalSourceConfig): void {
  const factory = config.factory;
  const untrackFn = config.untrack ?? (<T>(fn: () => T): T => fn());

  if (externalSource !== null) {
    const previous = externalSource;
    externalSource = {
      factory: (fn, trigger) => {
        const outer = previous.factory(fn, trigger);
        const inner = factory((prev) => outer.track(prev), trigger);
        return {
          track: (prev) => inner.track(prev),
          dispose() {
            inner.dispose();
            outer.dispose();
          },
        };
      },
      untrack: <T>(fn: () => T): T => previous.untrack(() => untrackFn(fn)),
    };
  } else {
    externalSource = { factory, untrack: untrackFn };
  }
}

/** Remove any registered external source bridge (does not rewire existing nodes). */
export function resetExternalSource(): void {
  externalSource = null;
}

function wireExternalSource(node: ComputedNode<unknown>, owner: Scope | null): void {
  const bridge = signal<undefined>(undefined, { equals: false, ownedWrite: true });
  const source = externalSource!.factory(node._fn, () => bridge.set(undefined));
  if (owner !== null) {
    (owner.cleanups ??= []).push(() => source.dispose());
  }
  node._fn = (prev?: unknown): unknown => {
    bridge();
    return source.track(prev);
  };
}

/**
 * Async derived value: a computed whose function returns a promise.
 * Reading it before resolution throws NotReadyError (caught by Loading
 * boundaries / isPending / latest).
 *
 * The resolved value is recorded on the server (see getHydrationData /
 * generateHydrationScript) and consumed from `__BARQ_DATA__` on the
 * client: the first read resolves synchronously with the server value
 * instead of refetching. Note the seeded first run doesn't track fn's
 * dependencies; use refresh() to refetch.
 *
 * The serialization key defaults to the owner-tree id of this call
 * (getNextChildId), so server and client agree as long as they build the
 * same owner tree. Called with no owner there is no tree to key off and
 * nothing is serialized.
 *
 * A position is not an identity: if the client tree diverges from the
 * server's, the ids after the divergence shift, and a read can claim the
 * value recorded for a DIFFERENT call and resolve synchronously with it.
 * `name` folds an identity into the auto-key — siblings only have to differ
 * from each other, and a drifted key then misses and refetches instead of
 * seeding the wrong value. `key` replaces the auto-key outright and has to be
 * unique across the page. `unclaimedSeeds()` reports the drift after the
 * fact; `hydrate()` calls it once the first render has settled.
 */
export function createAsync<T>(
  fn: (prev?: T) => Promise<T> | T,
  options?: SignalOptions<T> & { key?: string },
): Computed<T> {
  const owner = currentOwner;
  const key = options?.key ?? (owner !== null ? autoKey(owner, options?.name) : undefined);
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
import type { JSXElement } from "./dom.ts";

/**
 * Context object type
 */
export interface Context<T> {
  readonly id: symbol;
  readonly defaultValue: T | undefined;
  /** C1/X1: `Comp(s, props)`. `value` is a Cell, `children` a Block. */
  Provider: (s: Scope, props: { value: MaybeAccessor<T>; children: unknown }) => JSXElement;
}

/**
 * Create a context for dependency injection.
 */
export function createContext<T>(defaultValue?: T, description?: string): Context<T> {
  const id = Symbol(description ?? "context");

  /**
   * X1: enter -> fork -> write -> INVOKE, in that order, under the scope the
   * caller passed. `children` is a Block, so there is no expression in the
   * emitted language that means "children, already built": the only party
   * holding the instance scope is this function, and it writes the binding
   * before it hands the scope over.
   */
  const Provider = (
    s: Scope,
    props: { value: MaybeAccessor<T>; children: unknown },
  ): JSXElement => {
    const instance = enter(requireScope(s, "Ctx.Provider"), "provide");
    provideOn(instance, id, cellOf(props.value));
    let built = false;
    try {
      if (typeof props.children !== "function") return props.children as JSXElement;
      if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockEnter("Provider.children", instance);
      let out = unwrapBlocks((props.children as (scope: Scope) => JSXElement)(instance), instance);
      if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockExit("Provider.children");
      built = true;
      return out;
    } finally {
      exit(instance);
      // O4.4: a subtree that threw half-way is disposed, not abandoned.
      if (!built) disposeScope(instance);
    }
  };

  return {
    id,
    defaultValue,
    Provider,
  };
}

/**
 * A Block that arrived wrapped in a Cell — `children: () => props.children` —
 * is still a Block, and it has to run inside the scope that carries the
 * binding. Resolving it at the INSERTION site instead runs it after `exit`,
 * under the caller's scope, which is O2's negation with extra steps.
 *
 * Rule 4: kind travels with the value. Only a BRANDED Block is unwrapped, so a
 * live hole (`() => count()`) survives as the `Cell<Out>` that `Out` admits and
 * a row callback in a children slot is never handed the scope where its item
 * belongs. An arity guess would call both wrong, in opposite directions.
 *
 * The one speculative call left is an unbranded Cell whose value is a Block,
 * which only an uncompiled caller can produce: C5 forwards by identity, so a
 * compiled wrapper emits `children: props.children` and the brand arrives
 * intact. It is guarded on the RESULT being branded, so a hole is read once and
 * returned live rather than recursed into.
 */
function unwrapBlocks<R>(out: R, instance: Scope): R {
  let at = out;
  for (;;) {
    if (isBlock(at)) {
      at = (at as unknown as (s: Scope) => R)(instance);
      continue;
    }
    if (typeof at !== "function") return at;
    const peeked = untrack(() => (at as unknown as (s: Scope) => R)(instance));
    if (!isBlock(peeked)) return at;
    at = peeked;
  }
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

  const stored = lookupContext(owner, context.id);
  const value = stored === CONTEXT_MISS ? context.defaultValue : (cellOf(stored) as () => T)();

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

  const resolved = value === undefined ? context.defaultValue : value;
  provideOn(owner, context.id, () => resolved);
}

/**
 * Check if a context has been set on the owner or its ancestors.
 */
export function hasContext<T>(context: Context<T>, owner: Owner | null = getOwner()): boolean {
  if (!owner) return false;
  return lookupContext(owner, context.id) !== CONTEXT_MISS;
}

/**
 * X2/§3.0: what a scope stores for a context key is a Cell. Every write site
 * that can take a plain value wraps here, so a stored function is always the
 * Cell and never a value that happens to be callable — the ambiguity that had
 * `getContext` hand back the accessor while `read` handed back its result.
 */
export function cellOf(value: unknown): () => unknown {
  return typeof value === "function" ? (value as () => unknown) : (): unknown => value;
}

/**
 * Get the current value from a context.
 * Always returns an accessor function for consistent API.
 */
export function useContext<T>(context: Context<T>): () => T {
  const stored = lookupContext(getCurrentOwner(), context.id);

  if (stored !== CONTEXT_MISS) {
    return cellOf(stored) as () => T;
  }

  if (context.defaultValue !== undefined) {
    return () => context.defaultValue as T;
  }

  throw new ContextNotFoundError();
}
