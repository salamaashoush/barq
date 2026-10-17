import {
  NotReadyError,
  createRenderEffect,
  createSignal,
  createStore,
  onCleanup,
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import {
  type DefaultError,
  type DefaultedQueryObserverOptions,
  type Query,
  type QueryClient,
  type QueryKey,
  type QueryObserver,
  type QueryObserverOptions,
  type QueryObserverResult,
  notifyManager,
  shouldThrowError,
} from "@tanstack/query-core";

import { useIsRestoring, useQueryClient } from "./client.ts";
import { retriedBy, useQueryErrorResetBoundary } from "./reset.ts";
import { carried, firstAnswer, seededByRead } from "./seed.ts";

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
  const [state, publish] = mirrored(first);
  subscribed(observer, publish);
  return state;
}

/** The store half of `observed`, for a caller that decides when to subscribe. */
export function mirrored<TResult extends object>(
  first: TResult,
): [state: TResult, publish: (result: TResult) => void] {
  const [state, setState] = createStore<TResult>({ ...first } as never);

  // Field by field: an assignment of the value a field already holds is
  // dropped before it reaches a subscriber.
  const publish = (result: TResult): void => {
    setState((draft) => {
      Object.assign(draft, result);
    });
  };

  return [state, publish];
}

const ALWAYS = (): boolean => true;

/**
 * The subscription half of `observed`.
 *
 * `when` is tracked: an observer fetches the moment it is subscribed, so a
 * caller that must not fetch yet (a persister is restoring, a server's answer
 * is still on its way) holds the subscription back rather than the fetch.
 */
export function subscribed<TResult extends object>(
  observer: Observable<TResult>,
  publish: (result: TResult) => void,
  when: () => boolean = ALWAYS,
  after?: () => void,
): void {
  createRenderEffect(
    () => (when() ? observer : undefined),
    (source) => {
      if (source === undefined) return undefined;
      // Always through the notify manager, the first delivery included. The
      // subscription is made while the component that called this is still being
      // built, and a store is not written from inside a scope under construction;
      // the manager delivers once that has returned.
      const deliver = notifyManager.batchCalls(publish);
      const unsubscribe = source.subscribe(deliver);
      // The result can move between construction and subscription — a cached
      // query resolves synchronously — and nothing would deliver that one.
      source.updateResult?.();
      deliver(source.getCurrentResult());
      after?.();
      return unsubscribe;
    },
  );
}

export interface BaseOptions {
  /** Park the enclosing `Loading` boundary while the first fetch is in flight. */
  suspense?: boolean;
}

/**
 * `throwOnError` for a query that parks: an error with nothing to show is the
 * boundary's, and one that arrives over data already on screen is not.
 */
export function defaultThrowOnError<
  TQueryFnData = unknown,
  TError = DefaultError,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(_error: TError, query: Query<TQueryFnData, TError, TQueryData, TQueryKey>): boolean {
  return query.state.data === undefined;
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
  const resetBoundary = useQueryErrorResetBoundary();
  const suspense = base?.suspense === true;

  /**
   * `answered` is whether a server's answer is what the cache holds. Mounting
   * over one must not fetch it again, which `staleTime: 0` would otherwise do
   * on every hydration.
   */
  const defaultedFor = (
    answered: boolean,
  ): DefaultedQueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey> => {
    const resolved = client.defaultQueryOptions(options());
    // `optimistic` is what lets the first read report `isPending` for a query
    // that has never run, instead of the observer's pre-fetch blank.
    resolved._optimisticResults = isRestoring() ? "isRestoring" : "optimistic";
    if (suspense) {
      resolved.suspense = true;
      resolved.enabled = true;
      resolved.placeholderData = undefined;
      resolved.throwOnError = defaultThrowOnError;
    }
    if (answered) resolved.refetchOnMount = false;
    // A query that failed into a boundary is not fetched again just because
    // the boundary rebuilt it: the retry is the reset's to ask for.
    if ((resolved.suspense === true || failing(resolved)) && !resetBoundary.isReset()) {
      resolved.retryOnMount = false;
    }
    return resolved;
  };

  const failing = (
    resolved: DefaultedQueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>,
  ): boolean => {
    const query = client
      .getQueryCache()
      .get<TQueryFnData, TError, TQueryData, TQueryKey>(resolved.queryHash);
    if (query === undefined || query.state.error === null) return false;
    return shouldThrowError(resolved.throwOnError, [query.state.error, query]);
  };

  const initial = untrack(() => defaultedFor(false));
  const observer = new Observer(client, initial);

  const answer = firstAnswer(client, `query:${initial.queryHash}`, () => {
    const asked = [initial.queryHash];
    const result = observer.getOptimisticResult(initial);
    if (result.isPending && result.fetchStatus !== "idle") {
      seededByRead(client).add(initial.queryHash);
      return observer.fetchOptimistic(initial).then(() => asked);
    }
    // In the cache before this render read it, by a loader or a prefetch. It
    // is rendered from, so the page needs it as much as a fetch made here.
    const cached = observer.getCurrentQuery().state.dataUpdateCount > 0;
    if (!cached || carried(client).has(initial.queryHash)) return undefined;
    seededByRead(client).add(initial.queryHash);
    return Promise.resolve(asked);
  });

  // Whether the observer is still holding the options it mounts over a
  // server's answer with. A plain flag: it is read where it is written, in the
  // effects below, and nothing renders from it.
  let held = answer.seeded || answer.arriving;
  const [arrived, setArrived] = createSignal(!answer.arriving);
  const defaulted = (): DefaultedQueryObserverOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryData,
    TQueryKey
  > => defaultedFor(false);

  if (held) observer.setOptions(untrack(() => defaultedFor(true)));

  const [state, publish] = mirrored<QueryObserverResult<TData, TError>>(
    observer.getOptimisticResult(untrack(() => defaultedFor(held))),
  );

  subscribed(
    observer,
    publish,
    // A string render has one pass and no listener to deliver to: the flight
    // above is what it waits for.
    () => !isServer && arrived() && !isRestoring(),
    () => {
      resetBoundary.clearReset();
      if (!held) return;
      held = false;
      observer.setOptions(untrack(defaulted));
    },
  );

  // Options are their own effect. Folding it into the subscription would tear
  // the socket down and rebuild it on every keystroke that touches a query key.
  // A fetch the new options start calls the caller's `queryFn` from inside
  // `setOptions`, and what that reads is the query's, not this callback's.
  createRenderEffect(defaulted, (resolved) => {
    if (!held) untrack(() => observer.setOptions(resolved));
  });

  /**
   * `throwOnError`, routed the way barq routes everything else.
   *
   * An effect that throws reaches the enclosing `Errored` boundary, so this
   * needs no special channel — and unlike React, where the throw happens during
   * a render that runs again, a barq component body runs once, so the check has
   * to live somewhere that re-runs. This is that somewhere.
   */
  createRenderEffect(
    () => {
      if (!state.isError || state.isFetching) return;
      if (
        shouldThrowError(observer.options.throwOnError, [state.error, observer.getCurrentQuery()])
      ) {
        throw state.error;
      }
    },
    () => {},
  );

  onCleanup(
    retriedBy(resetBoundary, () => {
      if (!observer.getCurrentResult().isError) return;
      void observer.refetch().then(() => resetBoundary.clearReset());
    }),
  );

  // The store is behind the cache wherever nothing has published into it: for
  // the whole of a string render, and on the client until a streamed answer
  // lands.
  let behind = isServer || answer.arriving;
  answer.landed((seed) => {
    const resolved = untrack(() => defaultedFor(seed !== undefined));
    observer.setOptions(resolved);
    publish(observer.getOptimisticResult(resolved));
    behind = false;
    held = seed !== undefined;
    setArrived(true);
  });

  const result = behind
    ? through(
        state,
        () => behind,
        () => {
          const seed = answer.read();
          return observer.getOptimisticResult(untrack(() => defaultedFor(seed !== undefined)));
        },
      )
    : state;

  return suspense ? suspending(result) : result;
}

/**
 * The result while the store cannot be trusted to hold it.
 *
 * `current` parks the reader until the first answer is in the cache and then
 * reads the observer directly. The store is still read first, so a reader that
 * outlives this window is subscribed to the field it asked for.
 */
export function through<TResult extends object>(
  state: TResult,
  behind: () => boolean,
  current: () => TResult,
): TResult {
  return new Proxy(state, {
    get(target, property, receiver) {
      const published = Reflect.get(target, property, receiver) as unknown;
      if (typeof property === "symbol" || !behind()) return published;
      return Reflect.get(current(), property) as unknown;
    },
  });
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
        // No source to name: the reads above are what bring this reader back.
        if (status === "pending") throw new NotReadyError(undefined);
      }
      return value;
    },
  });
}
