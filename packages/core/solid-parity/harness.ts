/**
 * Solid 2.0 parity harness.
 *
 * `@solidjs/signals@2.0.0-rc.6`'s own suite is the specification barq's core is
 * being measured against, so it runs here unmodified apart from its import
 * specifier. Everything below maps Solid's names onto barq's; where barq has no
 * equivalent the export throws `GAP`, so a missing primitive fails as itself
 * rather than as `undefined is not a function` somewhere three frames down.
 *
 * The shim adapts SURFACE only — tuple-vs-accessor, argument order, option
 * names. It never emulates a semantic barq does not have, because a shim that
 * papers over the model is a shim that reports parity barq does not hold.
 */

import {
  computed,
  ContextNotFoundError,
  context as barqContext,
  DEV,
  effect as barqEffect,
  enableExternalSource,
  enforceLoadingBoundary,
  flush as barqFlush,
  getContext as barqGetContext,
  getNextChildId,
  getObserver,
  getOwner,
  isDisposed,
  isEqual,
  isPending,
  isTracking,
  latest,
  NotReadyError,
  onCleanup,
  onSettled,
  owner as barqOwner,
  peekNextChildId,
  reaction,
  refresh as barqRefresh,
  renderEffect,
  resetErrorHalt,
  resolve,
  runWithOwner,
  scope as barqScope,
  ScopeMissingError,
  setContext as barqSetContext,
  signal,
  SUPPORTS_PROXY,
  trackedEffect,
  untrack,
} from "../src/signals.ts";
import { errorBoundary, flatten, loadingBoundary, revealOrder } from "../src/boundaries.ts";
import {
  action as barqAction,
  affects as barqAffects,
  optimistic,
  optimisticStore,
} from "../src/actions.ts";
import { mapArray, repeat } from "../src/map.ts";
import { merge, omit } from "../src/props.ts";
import { dispose as barqDispose } from "../src/scope.ts";
import {
  $PROXY,
  $TARGET,
  $TRACK,
  deep,
  isWrappable,
  produce,
  projection,
  reconcile,
  snapshot,
  store,
  storePath,
  unwrap,
} from "../src/store.ts";

function root<T>(fn: (dispose: () => void) => T): T {
  return barqScope(fn as never, true) as T;
}

/** A Solid primitive barq does not have. Named so the failure is attributable. */
function gap(name: string, detail: string): never {
  throw new Error(`[SOLID-PARITY-GAP] ${name}: ${detail}`);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export { ContextNotFoundError, NotReadyError };

export class NoOwnerError extends Error {
  constructor() {
    super("Context can only be accessed under a reactive root.");
    this.name = "NoOwnerError";
  }
}

export class TimeoutError extends Error {
  constructor() {
    super("Timeout");
    this.name = "TimeoutError";
  }
}

// ---------------------------------------------------------------------------
// Core primitives
// ---------------------------------------------------------------------------

export type Accessor<T> = () => T;
export type Setter<T> = (value?: T | ((prev: T) => T)) => T;
export type Signal<T> = [get: Accessor<T>, set: Setter<T>];

/** Solid's `[get, set]` over barq's callable-with-`.set` signal. */
function pair<T>(node: {
  (): T;
  set(v: T): void;
  update(fn: (prev: T) => T): void;
  peek(): T;
}): Signal<T> {
  const get = (() => node()) as Accessor<T> & Record<string, unknown>;
  // `refresh(memo)` and `affects(accessor)` reach the node through `_node`.
  get._node = (node as unknown as { _node: unknown })._node;
  get.peek = () => node.peek();
  const set = ((value?: unknown) => {
    if (typeof value === "function") {
      node.update(value as (prev: T) => T);
    } else {
      node.set(value as T);
    }
    return node.peek();
  }) as Setter<T>;
  return [get as Accessor<T>, set];
}

export function createSignal<T>(first?: unknown, second?: unknown): Signal<T> {
  return pair(signal(first as T, second as never) as never);
}

export function createMemo<T>(compute: (prev?: T) => T, options?: unknown): Accessor<T> {
  return computed(compute as never, options as never) as unknown as Accessor<T>;
}

interface EffectOptions {
  defer?: boolean;
  schedule?: boolean;
  name?: string;
  sync?: boolean;
  transparent?: boolean;
}

type EffectBundle = {
  effect: (value: unknown, prev?: unknown) => unknown;
  error?: (err: unknown, cleanup: () => void) => void;
};

/**
 * barq's `effect` has no error arm and no `defer`, so both are built here out
 * of what it does have. The compute-phase catch is NOT equivalent to Solid's
 * settled-error channel — it fires per run rather than per settle — and a test
 * that depends on the difference is meant to fail.
 */
function makeEffect(
  create: typeof barqEffect,
  compute: (prev?: unknown) => unknown,
  effectFn: unknown,
  options?: EffectOptions,
): void {
  const bundle = (effectFn ?? {}) as Partial<EffectBundle>;
  const apply = (typeof effectFn === "function" ? effectFn : bundle.effect) as
    | ((value: unknown, prev?: unknown) => unknown)
    | undefined;
  const onError = bundle.error;
  const FAILED: unique symbol = Symbol.for("barq.parity.failed");
  let failure: unknown;
  let first = true;

  create(
    (prev?: unknown) => {
      if (onError === undefined) return compute(prev);
      try {
        return compute(prev);
      } catch (err) {
        if (err instanceof NotReadyError) throw err;
        failure = err;
        return FAILED;
      }
    },
    (value: unknown, prev: unknown) => {
      if (value === FAILED) {
        const captured = failure;
        failure = undefined;
        onError?.(captured, () => {});
        return;
      }
      if (first) {
        first = false;
        if (options?.defer) return;
      }
      return apply?.(value, prev) as void | (() => void);
    },
  );
}

export function createEffect(
  compute: (prev?: unknown) => unknown,
  effectFn: unknown,
  options?: EffectOptions,
): void {
  makeEffect(barqEffect, compute, effectFn, options);
}

export function createRenderEffect(
  compute: (prev?: unknown) => unknown,
  effectFn: unknown,
  options?: EffectOptions,
): void {
  makeEffect(renderEffect as typeof barqEffect, compute, effectFn, options);
}

export function createTrackedEffect(compute: () => void | (() => void), options?: unknown): void {
  trackedEffect(compute, options as never);
}

export function createReaction(effectFn: unknown, _options?: unknown) {
  const fn = (typeof effectFn === "function" ? effectFn : (effectFn as EffectBundle)?.effect) as
    | (() => void | (() => void))
    | undefined;
  return reaction(() => fn?.());
}

export function createRoot<T>(fn: (dispose: () => void) => T): T {
  return root(fn);
}

export function createOwner() {
  return barqOwner();
}

export function dispose(node: unknown): void {
  barqDispose(node as never);
}

export function createContext<T>(defaultValue?: T, options?: { name?: string }) {
  return barqContext(defaultValue, options?.name);
}

export function getContext<T>(ctx: unknown, owner?: unknown): T {
  return barqGetContext(ctx as never, owner as never) as T;
}

export function setContext<T>(ctx: unknown, value?: T, owner?: unknown): void {
  barqSetContext(ctx as never, value as never, owner as never);
}

export function flush(fn?: () => unknown): unknown {
  if (fn) {
    const out = fn();
    barqFlush();
    return out;
  }
  barqFlush();
  return undefined;
}

// ---------------------------------------------------------------------------
// Async layer
// ---------------------------------------------------------------------------

export { isPending, latest, resolve, onSettled, onCleanup, untrack, isEqual };
export { getOwner, runWithOwner, isDisposed, getObserver, getNextChildId, peekNextChildId };
export { SUPPORTS_PROXY, DEV, enableExternalSource, enforceLoadingBoundary, resetErrorHalt };
export { mapArray, repeat, flatten, isTracking, ScopeMissingError };

/** barq's `refresh` returns void; Solid's resolves with the next quiescent state. */
export function refresh<T>(target: T): Promise<unknown> {
  barqRefresh(target as never);
  return Promise.resolve(undefined);
}

export function until<T>(_fn: () => T, _options?: unknown): Promise<T> {
  return gap("until", "barq has no authoritative-view await primitive");
}

export function action<A extends unknown[], R>(fn: (...args: A) => unknown) {
  return barqAction(fn as never) as (...args: A) => Promise<R>;
}

export function affects(target: unknown, key?: PropertyKey): void {
  if (key !== undefined) gap("affects(store, key)", "barq's affects takes no key");
  barqAffects(target as never);
}

export function createOptimistic<T>(first?: unknown, second?: unknown): Signal<T> {
  if (typeof first === "function") {
    return gap("createOptimistic(fn)", "barq's optimistic() takes a plain value only");
  }
  return pair(optimistic(first as T, second as never) as never);
}

// ---------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------

export function createLoadingBoundary<T, U>(
  fn: () => T,
  fallback: () => U,
  options?: { on?: () => unknown },
): Accessor<T | U> {
  return loadingBoundary(fn, fallback, options) as unknown as Accessor<T | U>;
}

export function createErrorBoundary<T, U>(
  fn: () => T,
  fallback: (error: Accessor<unknown>, reset: () => void) => U,
): Accessor<T | U> {
  return errorBoundary(fn, fallback) as unknown as Accessor<T | U>;
}

export function createRevealOrder<T>(fn: () => T, options?: unknown): T {
  return revealOrder(fn, options as never);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export { reconcile, snapshot, deep, unwrap, merge, omit, isWrappable, storePath, produce };
export { $TRACK, $PROXY, $TARGET };

export function createStore(first: unknown, second?: unknown, third?: unknown): unknown {
  if (typeof first === "function") {
    void third;
    // barq's projection returns the proxy only and has no writable setter.
    return [
      projection(first as never, second as never),
      () => gap("createStore(fn)", "barq's projection has no setter"),
    ];
  }
  return store(first as never);
}

export function createProjection(fn: unknown, seed: unknown, _options?: unknown): unknown {
  return projection(fn as never, seed as never);
}

export function createOptimisticStore(first: unknown, second?: unknown): unknown {
  if (typeof first === "function") {
    return gap("createOptimisticStore(fn, seed)", "barq's optimisticStore takes a plain seed only");
  }
  void second;
  return optimisticStore(first as never);
}

export function setSnapshotCapture(): never {
  return gap("setSnapshotCapture", "barq removed snapshot capture (M9)");
}
export function markSnapshotScope(): never {
  return gap("markSnapshotScope", "barq removed snapshot capture (M9)");
}
export function releaseSnapshotScope(): never {
  return gap("releaseSnapshotScope", "barq removed snapshot capture (M9)");
}
export function clearSnapshots(): never {
  return gap("clearSnapshots", "barq removed snapshot capture (M9)");
}

// ---------------------------------------------------------------------------
// Types the ported suite imports
// ---------------------------------------------------------------------------

export type SourceAccessor<T> = Accessor<T>;
export type Refreshable<T> = T;
export type Owner = ReturnType<typeof barqOwner>;
export type { RevealOrder } from "../src/boundaries.ts";
export type Store<T> = T;
