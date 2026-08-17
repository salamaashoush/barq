/**
 * Boundary primitives (Solid 2.0 parity).
 *
 * These are the DOM-free cores that the `<Loading>`, `<Errored>` and
 * `<Reveal>` components are built on: each takes a content thunk and returns
 * an accessor that yields either the content or the boundary's stand-in.
 * Reach for them when authoring custom boundary components.
 */

import {
  type Computed,
  type LoadingBoundaryHandle,
  type Owner,
  ERROR_BOUNDARY,
  LOADING_BOUNDARY,
  NotReadyError,
  computed,
  owner,
  enforceLoadingBoundary,
  getOwner,
  hasEscapedError,
  lookupContext,
  onCleanup,
  provideOn,
  refresh,
  resetErrorHalt,
  runWithOwner,
  signal,
  untrack,
} from "./signals.ts";

/** Boundary-owned signals are written from inside computations by design */
const BOUNDARY_SIGNAL = { ownedWrite: true } as const;

// ============================================================================
// Reveal coordination
// ============================================================================

export type RevealOrder = "sequential" | "together" | "natural";

/** What a coordinated slot should show right now */
export type RevealDisplay = "content" | "fallback" | "nothing";

/**
 * What a slot reports UPWARD (A6). Both are facts about DATA, never about what
 * the slot is currently showing: the coordinator maps readiness onto display
 * and never the reverse, which is what stops a held group from deadlocking
 * against its own hold.
 *
 * They are the same accessor for a leaf boundary and they differ for a nested
 * group, and that difference is the entire reason the channel carries two.
 */
export interface RevealSlot {
  /** every boundary in this slot has settled */
  ready: () => boolean;
  /** this slot has its own first visible content, under its own order */
  minimallyReady: () => boolean;
}

export interface RevealRegistration {
  display: () => RevealDisplay;
  unregister: () => void;
}

export interface RevealHandle extends RevealSlot {
  register(slot: RevealSlot, group?: boolean): RevealRegistration;
  /** leave the enclosing group, if this one joined an outer group */
  detach(): void;
}

/** Context key a Reveal group publishes for descendant Loading boundaries */
export const REVEAL_COORD: unique symbol = Symbol("barq-reveal");

/**
 * The group a construct joins, read from the scope it was GIVEN — before it
 * forks one of its own, because the fork is what shadows the answer (A6, X3).
 */
export function outerRevealHandle(scope: Owner | null | undefined): RevealHandle | undefined {
  const stored = lookupContext(scope ?? null, REVEAL_COORD);
  return typeof stored === "object" && stored !== null ? (stored as RevealHandle) : undefined;
}

/**
 * Build the coordinator that decides, for each registered slot, whether it
 * shows content, its fallback, or nothing at all.
 *
 * - `natural` - each slot reveals as soon as it settles
 * - `together` - nobody reveals until every slot is minimally ready
 * - `sequential` - slots reveal in registration order; with `collapsed`, the
 *   ones past the frontier render nothing rather than a fallback
 *
 * `outer` is the enclosing group this one joins as ONE composite slot (A6).
 */
export function createRevealCoordinator(
  order: () => RevealOrder,
  collapsed: () => boolean,
  outer?: RevealHandle,
): RevealHandle {
  const slots: RevealSlot[] = [];
  const groups = new WeakSet<RevealSlot>();
  const registrations = signal(0, BOUNDARY_SIGNAL);

  const frontier = computed(() => {
    registrations();
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i].ready()) return i;
    }
    return slots.length;
  });

  // Per order, what counts as "this group has something visible to show". An
  // enclosing `together` releases on this rather than on full readiness, which
  // is what lets it stay one cohesive reveal without waiting for every
  // grandchild.
  const minimallyReady = computed(() => {
    registrations();
    if (slots.length === 0) return true;
    const mode = order();
    if (mode === "together") return slots.every((slot) => slot.minimallyReady());
    if (mode === "natural") return slots.some((slot) => slot.minimallyReady());
    return slots[0].minimallyReady();
  });

  const held = (slot: RevealSlot): RevealDisplay => {
    const mode = order();
    if (mode === "natural") {
      // A nested group is always released here: the mode exists FOR nesting,
      // and holding a composite would make `natural` a `sequential` of one.
      if (groups.has(slot)) return "content";
      return slot.ready() ? "content" : "fallback";
    }
    if (mode === "together") return minimallyReady() ? "content" : "fallback";

    const f = frontier();
    const index = slots.indexOf(slot);
    if (index < 0 || index < f) return "content";
    // The frontier. Holding a LEAF is what keeps its fallback visible; a
    // composite is released instead, so its own leaves each show their own
    // fallback while it fills in. This group still waits on the composite's
    // full readiness before advancing past it.
    if (index === f) return groups.has(slot) ? "content" : "fallback";
    return collapsed() ? "nothing" : "fallback";
  };

  const handle: RevealHandle = {
    ready: () => frontier() === slots.length,
    minimallyReady: () => minimallyReady(),

    register(slot, group = false) {
      slots.push(slot);
      if (group) groups.add(slot);
      registrations.update((n) => n + 1);

      const display = computed<RevealDisplay>(() => {
        // A hold from an enclosing group propagates through the whole subtree,
        // carrying whatever collapsed policy the outer asked for. This group's
        // own order is ignored while held and resumes once the outer releases.
        const above = joined?.display();
        if (above !== undefined && above !== "content") return above;
        return held(slot);
      });

      return {
        display: () => display(),
        unregister() {
          const index = slots.indexOf(slot);
          if (index < 0) return;
          slots.splice(index, 1);
          registrations.update((n) => n + 1);
        },
      };
    },

    detach() {
      joined?.unregister();
      joined = undefined;
    },
  };

  let joined = outer?.register(handle, true);
  return handle;
}

/**
 * Coordinate the reveal timing of the Loading boundaries created inside `fn`.
 * Returns whatever `fn` returns.
 *
 * Both options are accessors so the order can change reactively.
 */
export function revealOrder<T>(
  fn: () => T,
  options?: { order?: () => RevealOrder; collapsed?: () => boolean },
): T {
  const order = options?.order ?? ((): RevealOrder => "sequential");
  const collapsed = options?.collapsed ?? ((): boolean => false);
  const own = owner("branch");
  const outer = currentRevealHandle();
  const handle = runWithOwner(own, () => createRevealCoordinator(order, collapsed, outer));
  runWithOwner(own, () => onCleanup(() => handle.detach()));
  provideOn(own, REVEAL_COORD, handle);
  return runWithOwner(own, fn);
}

// ============================================================================
// Loading
// ============================================================================

/**
 * Collects the pending async work below a boundary. Install the handle on an
 * owner and every pending computation under it registers here.
 *
 * Shared by loadingBoundary and the `<Loading>` component, which differ
 * only in what they do once `count()` is non-zero.
 */
export interface PendingCollector {
  handle: LoadingBoundaryHandle;
  count: () => number;
  install: (owner: Owner) => void;
}

export function createPendingCollector(): PendingCollector {
  const pendingNodes = new Set<object>();
  const count = signal(0, BOUNDARY_SIGNAL);

  const handle: LoadingBoundaryHandle = {
    add(node) {
      if (!pendingNodes.has(node)) {
        pendingNodes.add(node);
        count.set(pendingNodes.size);
      }
    },
    delete(node) {
      if (pendingNodes.delete(node)) {
        count.set(pendingNodes.size);
      }
    },
  };

  return {
    handle,
    count: () => count(),
    install(owner) {
      provideOn(owner, LOADING_BOUNDARY, handle);
    },
  };
}

/**
 * Captures errors raised below a boundary - both synchronous throws and
 * errors surfacing later from effects. Shared by errorBoundary and the
 * `<Errored>` component.
 */
export interface ErrorCollector {
  error: () => unknown;
  failed: () => boolean;
  capture: (err: unknown) => void;
  clear: () => void;
  install: (owner: Owner) => void;
}

export function createErrorCollector(): ErrorCollector {
  const error = signal<unknown>(undefined, BOUNDARY_SIGNAL);
  const failed = signal(false, BOUNDARY_SIGNAL);

  const capture = (err: unknown): void => {
    error.set(err);
    failed.set(true);
  };

  return {
    error: () => error(),
    failed: () => failed(),
    capture,
    clear() {
      failed.set(false);
      error.set(undefined);
    },
    install(owner) {
      provideOn(owner, ERROR_BOUNDARY, capture);
    },
  };
}

/**
 * Catch pending async reads inside `fn` and yield `fallback()` until they
 * settle. The accessor swaps back to the content once nothing below is
 * pending.
 *
 * `options.on` re-arms the fallback: when that expression changes while work
 * is in flight, the boundary shows the fallback again instead of holding
 * stale content.
 */
export function loadingBoundary<T, U>(
  fn: () => T,
  fallback: () => U,
  options?: { on?: () => unknown },
): Computed<T | U> {
  const own = owner("branch");
  const pending = createPendingCollector();
  pending.install(own);

  const content = runWithOwner(own, () => computed(fn));

  const onFn = options?.on;
  let lastOn: unknown;
  let hasLastOn = false;
  let showFallbackUntilSettled = false;

  return computed<T | U>(() => {
    if (onFn !== undefined) {
      const next = onFn();
      if (hasLastOn && next !== lastOn) {
        // The question changed: stale content must not survive the transition
        showFallbackUntilSettled = untrack(() => pending.count()) > 0;
      }
      lastOn = next;
      hasLastOn = true;
    }

    let value: T;
    try {
      value = content();
    } catch (err) {
      if (err instanceof NotReadyError) return fallback();
      throw err;
    }

    if (pending.count() > 0) return fallback();
    if (showFallbackUntilSettled) {
      showFallbackUntilSettled = false;
      return fallback();
    }
    return value;
  });
}

// ============================================================================
// Errored
// ============================================================================

/**
 * Catch errors thrown while producing `fn`'s value - synchronously, or later
 * by effects created under the boundary - and yield `fallback(error, reset)`
 * instead. `reset()` clears the error and recomputes the content.
 *
 * A pending async read is not an error: it propagates so an enclosing Loading
 * boundary can handle it.
 */
export function errorBoundary<T, U>(
  fn: () => T,
  fallback: (error: () => unknown, reset: () => void) => U,
): Computed<T | U> {
  const own = owner("branch");
  const collector = createErrorCollector();
  collector.install(own);

  const content = runWithOwner(own, () => computed(fn));

  const reset = (): void => {
    collector.clear();
    refresh(content);
  };

  return computed<T | U>(() => {
    if (collector.failed()) return fallback(collector.error, reset);
    try {
      return content();
    } catch (err) {
      if (err instanceof NotReadyError) throw err;
      collector.capture(err);
      return fallback(collector.error, reset);
    }
  });
}

// ============================================================================
// flatten
// ============================================================================

interface FlattenOptions {
  /** Drop values that render nothing: null, undefined, true, false, "" */
  skipNonRendered?: boolean;
  /** Leave zero-arg function children alone instead of calling them */
  doNotUnwrap?: boolean;
}

function isNonRendered(value: unknown): boolean {
  return value === null || value === undefined || value === true || value === false || value === "";
}

function unwrapAccessor(value: unknown): unknown {
  let current = value;
  while (typeof current === "function" && (current as () => unknown).length === 0) {
    current = (current as () => unknown)();
  }
  return current;
}

/**
 * Resolve a children value to its renderable form: call zero-arg accessors,
 * flatten nested arrays, and optionally drop values that render nothing.
 *
 * With `doNotUnwrap`, function children are kept as-is and an array that still
 * contains them comes back as a thunk the caller can invoke later.
 */
export function flatten(children: unknown, options?: FlattenOptions): unknown {
  let value = children;
  if (typeof value === "function" && (value as () => unknown).length === 0) {
    if (options?.doNotUnwrap) return value;
    value = unwrapAccessor(value);
  }

  if (options?.skipNonRendered && isNonRendered(value)) return undefined;

  if (Array.isArray(value)) {
    const results: unknown[] = [];
    if (flattenArray(value, results, options)) {
      return () => {
        const nested: unknown[] = [];
        flattenArray(results, nested, { ...options, doNotUnwrap: false });
        return nested;
      };
    }
    return results;
  }
  return value;
}

function flattenArray(
  children: readonly unknown[],
  results: unknown[],
  options?: FlattenOptions,
): boolean {
  let needsUnwrap = false;
  for (let i = 0; i < children.length; i++) {
    let child = children[i];
    if (typeof child === "function" && (child as () => unknown).length === 0) {
      if (options?.doNotUnwrap) {
        results.push(child);
        needsUnwrap = true;
        continue;
      }
      child = unwrapAccessor(child);
    }
    if (Array.isArray(child)) {
      if (flattenArray(child, results, options)) needsUnwrap = true;
    } else if (options?.skipNonRendered && isNonRendered(child)) {
      // renders nothing
    } else {
      results.push(child);
    }
  }
  return needsUnwrap;
}

export { enforceLoadingBoundary, hasEscapedError, resetErrorHalt };

/** Internal: boundary owners are plain owners; exposed for the components */
export type BoundaryOwner = Owner;

/** Internal: current owner, for components that need to find a coordinator */
export function currentRevealHandle(): RevealHandle | undefined {
  return getOwner()?.ctx[REVEAL_COORD] as RevealHandle | undefined;
}
