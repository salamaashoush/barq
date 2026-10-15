import { createRenderEffect, createStore, untrack } from "@barqjs/core";
import {
  type DefaultError,
  type DefinedInfiniteQueryObserverResult,
  type DefinedQueryObserverResult,
  type DistributiveOmit,
  type FetchInfiniteQueryOptions,
  type InfiniteData,
  InfiniteQueryObserver,
  type InfiniteQueryObserverOptions,
  type InfiniteQueryObserverResult,
  type MutateFunction,
  type Mutation,
  type MutationFilters,
  MutationObserver,
  type MutationObserverOptions,
  type MutationObserverResult,
  type MutationState,
  type OmitKeyof,
  type Override,
  type QueryClient,
  type QueryFilters,
  type QueryKey,
  QueryObserver,
  type QueryObserverOptions,
  type QueryObserverResult,
  type SkipToken,
  notifyManager,
  replaceEqualDeep,
  shouldThrowError,
} from "@tanstack/query-core";

import { baseQuery, observed, suspending, withHandles } from "./base.ts";
import { useQueryClient } from "./client.ts";
import type { DefinedInitialDataInfiniteOptions, DefinedInitialDataOptions } from "./options.ts";

export type UseQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = QueryObserverOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>;

export type UseQueryResult<TData = unknown, TError = DefaultError> = QueryObserverResult<
  TData,
  TError
>;

export type UseInfiniteQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
> = InfiniteQueryObserverOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>;

export type UseInfiniteQueryResult<
  TData = unknown,
  TError = DefaultError,
> = InfiniteQueryObserverResult<TData, TError>;

export type UseMutationOptions<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
> = MutationObserverOptions<TData, TError, TVariables, TContext>;

export type DefinedUseQueryResult<
  TData = unknown,
  TError = DefaultError,
> = DefinedQueryObserverResult<TData, TError>;

export type DefinedUseInfiniteQueryResult<
  TData = unknown,
  TError = DefaultError,
> = DefinedInfiniteQueryObserverResult<TData, TError>;

/** A parking query is never disabled and never shows a placeholder: it waits. */
export type UseSuspenseQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = OmitKeyof<
  UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  "queryFn" | "enabled" | "throwOnError" | "placeholderData"
> & {
  queryFn?: Exclude<UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>["queryFn"], SkipToken>;
};

export type UseSuspenseQueryResult<TData = unknown, TError = DefaultError> = DistributiveOmit<
  DefinedQueryObserverResult<TData, TError>,
  "isPlaceholderData"
>;

export type UseSuspenseInfiniteQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
> = OmitKeyof<
  UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
  "queryFn" | "enabled" | "throwOnError" | "placeholderData"
> & {
  queryFn?: Exclude<
    UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>["queryFn"],
    SkipToken
  >;
};

export type UseSuspenseInfiniteQueryResult<TData = unknown, TError = DefaultError> = OmitKeyof<
  DefinedInfiniteQueryObserverResult<TData, TError>,
  "isPlaceholderData"
>;

export type UseMutateFunction<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
> = (...args: Parameters<MutateFunction<TData, TError, TVariables, TContext>>) => void;

export type UseMutateAsyncFunction<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
> = MutateFunction<TData, TError, TVariables, TContext>;

/**
 * `Override` is distributive: `MutationObserverResult` is a discriminated union
 * over `status`, and an interface that extended it would flatten the union and
 * lose the narrowing `isSuccess` gives.
 */
export type UseMutationResult<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
> = Override<
  MutationObserverResult<TData, TError, TVariables, TContext>,
  { mutate: UseMutateFunction<TData, TError, TVariables, TContext> }
> & {
  mutateAsync: UseMutateAsyncFunction<TData, TError, TVariables, TContext>;
};

/**
 * A query, as a reactive result object.
 *
 * `options` is an accessor, not an object: a key built from a signal refetches
 * when that signal changes, because the observer re-reads the options rather
 * than being handed a snapshot of them once.
 *
 * The result is fine-grained — `query.data` and `query.isFetching` are separate
 * dependencies — so a component rendering the data is not re-run twice by every
 * background refetch.
 */
export function useQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  // First, and with `initialData` absent rather than optional: an accessor's
  // return type is settled against the first overload tried, and this is the
  // one whose `queryFn` admits `skipToken` as itself instead of as `symbol`.
  options: () => UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
    initialData?: undefined;
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError>;
export function useQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: () => DefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>,
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError>;
export function useQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: () => UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  queryClient?: QueryClient,
): UseQueryResult<TData, TError>;
export function useQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: () => UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> {
  return baseQuery<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>(
    QueryObserver,
    options,
    queryClient,
  );
}

/**
 * A query whose `data` read parks the enclosing `Loading` boundary until there
 * is data.
 *
 * TanStack's own answer to the same problem in React is `useSuspenseQuery`;
 * this is that, against barq's boundary rather than React's. `isPending` and
 * `error` stay readable, so a fallback and an inline indicator are both
 * expressible against one object.
 */
export function useSuspenseQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: () => UseSuspenseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  queryClient?: QueryClient,
): UseSuspenseQueryResult<TData, TError> {
  return baseQuery<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>(
    QueryObserver,
    options,
    queryClient,
    { suspense: true },
  ) as UseSuspenseQueryResult<TData, TError>;
}

export function useInfiniteQuery<
  TQueryFnData,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: () => UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam> & {
    initialData?: undefined;
  },
  queryClient?: QueryClient,
): UseInfiniteQueryResult<TData, TError>;
export function useInfiniteQuery<
  TQueryFnData,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: () => DefinedInitialDataInfiniteOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TPageParam
  >,
  queryClient?: QueryClient,
): DefinedUseInfiniteQueryResult<TData, TError>;
export function useInfiniteQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: () => UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
  queryClient?: QueryClient,
): UseInfiniteQueryResult<TData, TError>;
export function useInfiniteQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: () => UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
  queryClient?: QueryClient,
): UseInfiniteQueryResult<TData, TError> {
  // The infinite observer adds `fetchNextPage` and its flags to the result, so
  // the base's shape is widened at this boundary rather than inside it.
  return baseQuery<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>(
    InfiniteQueryObserver as never,
    options as never,
    queryClient,
  ) as UseInfiniteQueryResult<TData, TError>;
}

export function useSuspenseInfiniteQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: () => UseSuspenseInfiniteQueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TPageParam
  >,
  queryClient?: QueryClient,
): UseSuspenseInfiniteQueryResult<TData, TError> {
  return baseQuery<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>(
    InfiniteQueryObserver as never,
    options as never,
    queryClient,
    { suspense: true },
  ) as unknown as UseSuspenseInfiniteQueryResult<TData, TError>;
}

/**
 * A mutation, with the three imperative handles on the result object itself.
 *
 * They are defined once and never replaced, so `<button onClick={m.mutate}>`
 * binds a stable function — a result that rebuilt them per notification would
 * hand the DOM a new listener on every state change.
 */
export function useMutation<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
>(
  options: () => UseMutationOptions<TData, TError, TVariables, TContext>,
  queryClient?: QueryClient,
): UseMutationResult<TData, TError, TVariables, TContext> {
  const client = useQueryClient(queryClient);
  const observer = new MutationObserver<TData, TError, TVariables, TContext>(
    client,
    untrack(options),
  );

  const state = observed<MutationObserverResult<TData, TError, TVariables, TContext>>(
    observer,
    observer.getCurrentResult(),
  );

  createRenderEffect(options, (resolved) => {
    observer.setOptions(resolved);
  });

  createRenderEffect(
    () => {
      if (state.isError && shouldThrowError(observer.options.throwOnError, [state.error])) {
        throw state.error;
      }
    },
    () => {},
  );

  const mutateAsync: UseMutateAsyncFunction<TData, TError, TVariables, TContext> = (...args) =>
    observer.mutate(args[0] as TVariables, args[1]);

  const mutate: UseMutateFunction<TData, TError, TVariables, TContext> = (...args) => {
    // The rejection is the caller's to read off `error`; leaving it unhandled
    // here would surface as an unhandled rejection for a state the result
    // already reports.
    mutateAsync(...args).catch(() => {});
  };

  return withHandles(state, {
    mutate,
    mutateAsync,
    reset: () => observer.reset(),
  });
}

type MaybeAccessor<T> = T | (() => T);

function given<T extends object>(value: MaybeAccessor<T> | undefined): T | undefined {
  return typeof value === "function" ? value() : value;
}

/**
 * A count over one of the client's caches, recounted on every cache event.
 *
 * `count` is tracked, so filters handed in as a function recount when what
 * they read changes, without waiting for the cache to move.
 */
function counted(
  count: () => number,
  subscribe: (listener: () => void) => () => void,
): () => number {
  const [state, setState] = createStore({ count: untrack(count) });

  const publish = (next: number): void => {
    setState((draft) => {
      draft.count = next;
    });
  };
  createRenderEffect(count, (current) => {
    const deliver = notifyManager.batchCalls(publish);
    const unsubscribe = subscribe(() => deliver(untrack(count)));
    deliver(current);
    return unsubscribe;
  });

  return () => state.count;
}

/** How many queries are fetching right now. */
export function useIsFetching(
  filters?: MaybeAccessor<QueryFilters>,
  queryClient?: QueryClient,
): () => number {
  const client = useQueryClient(queryClient);
  return counted(
    () => client.isFetching(given(filters)),
    (listener) => client.getQueryCache().subscribe(listener),
  );
}

/** How many mutations are running right now. */
export function useIsMutating(
  filters?: MaybeAccessor<MutationFilters>,
  queryClient?: QueryClient,
): () => number {
  const client = useQueryClient(queryClient);
  return counted(
    () => client.isMutating(given(filters)),
    (listener) => client.getMutationCache().subscribe(listener),
  );
}

export interface MutationStateOptions<TResult = MutationState> {
  filters?: MutationFilters;
  select?: (mutation: Mutation) => TResult;
}

/**
 * The state of mutations matching `filters`, whoever started them.
 *
 * What a global "saving…" indicator needs, and the only way to see a mutation
 * a different component owns.
 */
export function useMutationState<TResult = MutationState>(
  options?: MaybeAccessor<MutationStateOptions<TResult>>,
  queryClient?: QueryClient,
): () => TResult[] {
  const client = useQueryClient(queryClient);
  const cache = client.getMutationCache();

  const read = (): TResult[] => {
    const { filters, select } = given(options) ?? {};
    return cache
      .findAll(filters)
      .map((mutation) => (select ? select(mutation) : (mutation.state as TResult)));
  };

  const [state, setState] = createStore<{ results: TResult[] }>({ results: untrack(read) });

  // Structurally shared against what is already published: every cache event
  // rebuilds the array, and a reader should hear only about the ones that
  // changed what it holds.
  let published = state.results;
  const publish = (results: TResult[]): void => {
    const next = replaceEqualDeep(published, results);
    if (next === published) return;
    published = next;
    setState((draft) => {
      draft.results = next;
    });
  };
  // `read` is tracked, so a change of filters delivers its own result and
  // subscribes again.
  createRenderEffect(read, (current) => {
    const deliver = notifyManager.batchCalls(publish);
    const unsubscribe = cache.subscribe(() => deliver(untrack(read)));
    deliver(current);
    return unsubscribe;
  });

  return () => state.results;
}

/**
 * Start a query without reading it.
 *
 * For a route that knows what the page below it will ask for: the fetch is in
 * flight before the component that wants it is built.
 */
export function usePrefetchQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: () => UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  queryClient?: QueryClient,
): void {
  const client = useQueryClient(queryClient);
  const resolved = untrack(options);
  if (client.getQueryState(resolved.queryKey) === undefined) {
    void client.prefetchQuery(resolved as never);
  }
}

/** `usePrefetchQuery` for a paged query: the first page is in flight before its reader is built. */
export function usePrefetchInfiniteQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: () => FetchInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
  queryClient?: QueryClient,
): void {
  const client = useQueryClient(queryClient);
  const resolved = untrack(options);
  if (client.getQueryState(resolved.queryKey) === undefined) {
    void client.prefetchInfiniteQuery(resolved);
  }
}

export { suspending };
