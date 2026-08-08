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
  createOwner,
  enforceLoadingBoundary,
  getOwner,
  hasEscapedError,
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

/** What a coordinated boundary should show right now */
export type RevealDisplay = "content" | "fallback" | "nothing";

export interface RevealEntry {
  settled: () => boolean;
}

export interface RevealHandle {
  register(entry: RevealEntry): { display: () => RevealDisplay };
}

/** Context key a Reveal group publishes for descendant Loading boundaries */
export const REVEAL_COORD: unique symbol = Symbol("barq-reveal");

/**
 * Build the coordinator that decides, for each registered boundary, whether it
 * shows content, its fallback, or nothing at all.
 *
 * - `natural` - each boundary reveals as soon as it settles
 * - `together` - nobody reveals until every registered boundary has settled
 * - `sequential` - boundaries reveal in registration order; with `collapsed`,
 *   the ones past the frontier render nothing rather than a fallback
 */
export function createRevealCoordinator(
  order: () => RevealOrder,
  collapsed: () => boolean,
): RevealHandle {
  const entries: RevealEntry[] = [];
  const registrations = signal(0, BOUNDARY_SIGNAL);

  const frontier = computed(() => {
    registrations();
    for (let i = 0; i < entries.length; i++) {
      if (!entries[i].settled()) return i;
    }
    return entries.length;
  });

  return {
    register(entry) {
      const index = entries.length;
      entries.push(entry);
      registrations.update((n) => n + 1);

      const display = computed<RevealDisplay>(() => {
        const mode = order();
        if (mode === "natural") {
          return entry.settled() ? "content" : "fallback";
        }
        const f = frontier();
        if (mode === "together") {
          return f === entries.length ? "content" : "fallback";
        }
        if (index < f) return "content";
        if (index === f) return "fallback";
        return collapsed() ? "nothing" : "fallback";
      });

      return { display: () => display() };
    },
  };
}

/**
 * Coordinate the reveal timing of the Loading boundaries created inside `fn`.
 * Returns whatever `fn` returns.
 *
 * Both options are accessors so the order can change reactively.
 */
export function createRevealOrder<T>(
  fn: () => T,
  options?: { order?: () => RevealOrder; collapsed?: () => boolean },
): T {
  const order = options?.order ?? ((): RevealOrder => "sequential");
  const collapsed = options?.collapsed ?? ((): boolean => false);
  const owner = createOwner();
  const handle = runWithOwner(owner, () => createRevealCoordinator(order, collapsed));
  owner._context = { ...owner._context, [REVEAL_COORD]: handle };
  return runWithOwner(owner, fn);
}

// ============================================================================
// Loading
// ============================================================================

/**
 * Catch pending async reads inside `fn` and yield `fallback()` until they
 * settle. The accessor swaps back to the content once nothing below is
 * pending.
 *
 * `options.on` re-arms the fallback: when that expression changes while work
 * is in flight, the boundary shows the fallback again instead of holding
 * stale content.
 */
export function createLoadingBoundary<T, U>(
  fn: () => T,
  fallback: () => U,
  options?: { on?: () => unknown },
): Computed<T | U> {
  const owner = createOwner();
  const pendingNodes = new Set<object>();
  const pendingCount = signal(0, BOUNDARY_SIGNAL);

  const handle: LoadingBoundaryHandle = {
    add(node) {
      if (!pendingNodes.has(node)) {
        pendingNodes.add(node);
        pendingCount.set(pendingNodes.size);
      }
    },
    delete(node) {
      if (pendingNodes.delete(node)) {
        pendingCount.set(pendingNodes.size);
      }
    },
  };
  owner._context = { ...owner._context, [LOADING_BOUNDARY]: handle };

  const content = runWithOwner(owner, () => computed(fn));

  const onFn = options?.on;
  let lastOn: unknown;
  let hasLastOn = false;
  let showFallbackUntilSettled = false;

  return computed<T | U>(() => {
    if (onFn !== undefined) {
      const next = onFn();
      if (hasLastOn && next !== lastOn) {
        // The question changed: stale content must not survive the transition
        showFallbackUntilSettled = untrack(() => pendingCount()) > 0;
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

    if (pendingCount() > 0) return fallback();
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
export function createErrorBoundary<T, U>(
  fn: () => T,
  fallback: (error: () => unknown, reset: () => void) => U,
): Computed<T | U> {
  const owner = createOwner();
  const error = signal<unknown>(undefined, BOUNDARY_SIGNAL);
  const failed = signal(false, BOUNDARY_SIGNAL);

  owner._context = {
    ...owner._context,
    [ERROR_BOUNDARY]: (err: unknown) => {
      error.set(err);
      failed.set(true);
    },
  };

  const content = runWithOwner(owner, () => computed(fn));

  const reset = (): void => {
    failed.set(false);
    error.set(undefined);
    refresh(content);
  };

  const errorAccessor = (): unknown => error();

  return computed<T | U>(() => {
    if (failed()) return fallback(errorAccessor, reset);
    try {
      return content();
    } catch (err) {
      if (err instanceof NotReadyError) throw err;
      error.set(err);
      failed.set(true);
      return fallback(errorAccessor, reset);
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
  return getOwner()?._context[REVEAL_COORD] as RevealHandle | undefined;
}
