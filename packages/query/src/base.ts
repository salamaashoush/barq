import { NotReadyError, isServer, renderEffect, store, untrack } from "@barqjs/core";
import {
  type DefaultedQueryObserverOptions,
  type QueryClient,
  type QueryKey,
  type QueryObserver,
  type QueryObserverOptions,
  type QueryObserverResult,
  notifyManager,
  shouldThrowError,
} from "@tanstack/query-core";

import { useIsRestoring, useQueryClient } from "./client.ts";

/**
 * The observer, wired to a STORE rather than to a signal.
 *
 * This is the whole efficiency argument for the adapter, and it is the same one
 * `@tanstack/solid-query` makes. An observer notifies on every state change a
 * query has: fetching starts, fetching ends, data arrives, `isStale` flips on a
 * timer. Holding the result in one signal makes each of those wake every reader
 * — a component rendering `data` re-runs when `isFetching` toggles, twice per
 * refetch, forever.
 *
 * A store writes the result field by field and skips a field whose value did
 * not change, so a `data` reader is woken by data and by nothing else. The
 * comparison is `===`, which is exactly what query-core's structural sharing is
 * for: an unchanged response comes back as the same reference, and the write is
 * dropped before it reaches a subscriber.
 */
/** The slice of an observer this module needs, whichever observer it is. */
export interface Observable<TResult> {
  subscribe: (listener: (result: TResult) => void) => () => void;
  getCurrentResult: () => TResult;
  updateResult?: () => void;
}

export function observed<TResult extends object>(
  observer: Observable<TResult>,
  first: TResult,
): TResult {
  const [state, setState] = store<TResult>({ ...first });

  renderEffect(() => {
    const unsubscribe = observer.subscribe(
      notifyManager.batchCalls((result: TResult) => {
        setState({ ...result } as Partial<TResult>);
      }),
    );
    // The result can move between construction and subscription — a cached
    // query resolves synchronously — and nothing would deliver that one.
    observer.updateResult?.();
    setState({ ...observer.getCurrentResult() } as Partial<TResult>);
    return unsubscribe;
  });

  return state as TResult;
}

export interface BaseOptions {
  /** Park the enclosing `Loading` boundary while the first fetch is in flight. */
  suspense?: boolean;
}

/**
 * Everything `useQuery` and `useInfiniteQuery` share.
 *
 * `Observer` is passed in rather than branched on, because the two differ only
 * in which class reads the options.
 */
export function baseQuery<TQueryFnData, TError, TData, TQueryData, TQueryKey extends QueryKey>(
  Observer: new (
    client: QueryClient,
    options: QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>,
  ) => QueryObserver<TQueryFnData, TError, TData, TQueryData, TQueryKey>,
  options: () => QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>,
  queryClient?: QueryClient,
  base?: BaseOptions,
): QueryObserverResult<TData, TError> {
  const client = useQueryClient(queryClient);
  const isRestoring = useIsRestoring();

  const defaulted = (): DefaultedQueryObserverOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryData,
    TQueryKey
  > => {
    const resolved = client.defaultQueryOptions(options());
    // `optimistic` is what lets the first read report `isPending` for a query
    // that has never run, instead of the observer's pre-fetch blank.
    resolved._optimisticResults = isRestoring() ? "isRestoring" : "optimistic";
    if (isServer) {
      // A string render has one pass: a retry cannot change what it emits, and
      // an error that is swallowed here reaches the client as an empty page.
      resolved.retry = false;
      resolved.throwOnError = true;
    }
    return resolved;
  };

  const observer = new Observer(client, untrack(defaulted));

  const state = observed<QueryObserverResult<TData, TError>>(
    observer,
    observer.getOptimisticResult(untrack(defaulted)),
  );

  // Options are their own effect. Folding it into the subscription would tear
  // the socket down and rebuild it on every keystroke that touches a query key.
  renderEffect(() => {
    observer.setOptions(defaulted());
  });

  /**
   * `throwOnError`, routed the way barq routes everything else.
   *
   * An effect that throws reaches the enclosing `Errored` boundary, so this
   * needs no special channel — and unlike React, where the throw happens during
   * a render that runs again, a barq component body runs once, so the check has
   * to live somewhere that re-runs. This is that somewhere.
   */
  renderEffect(() => {
    if (!state.isError || state.isFetching) return;
    if (
      shouldThrowError(observer.options.throwOnError, [state.error, observer.getCurrentQuery()])
    ) {
      throw state.error;
    }
  });

  if (base?.suspense === true) return suspending(state);
  return state;
}

/**
 * A store, plus methods that are not part of it.
 *
 * `Object.assign` cannot do this: a barq store is deeply read-only and its
 * proxy refuses the write. A reading proxy keeps the store's fine-grained
 * tracking — every key that is not a handle still goes through it — while
 * `mutate` and friends stay the same function objects for the life of the
 * result, so a `<button onClick={m.mutate}>` binds once.
 */
export function withHandles<TState extends object, THandles extends object>(
  state: TState,
  handles: THandles,
): TState & THandles {
  return new Proxy(state, {
    get(target, property, receiver) {
      if (property in handles) return (handles as Record<PropertyKey, unknown>)[property];
      return Reflect.get(target, property, receiver);
    },
    has: (target, property) => property in handles || Reflect.has(target, property),
  }) as TState & THandles;
}

/**
 * The result, with `data` parking the enclosing `Loading` boundary until there
 * is some.
 *
 * A proxy rather than a different result type, so `isPending` and `error` stay
 * readable while `data` is the one read that suspends — which is what makes a
 * fallback and an inline spinner both expressible against the same object.
 */
export function suspending<TResult extends object>(state: TResult): TResult {
  return new Proxy(state, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (property === "data" && value === undefined) {
        const status = Reflect.get(target, "status", receiver) as unknown;
        if (status === "pending") throw new NotReadyError();
      }
      return value;
    },
  });
}
