import { renderEffect, store, untrack } from "@barqjs/core";
import {
  type DefaultError,
  type InfiniteData,
  InfiniteQueryObserver,
  type InfiniteQueryObserverOptions,
  type InfiniteQueryObserverResult,
  type Mutation,
  type MutationFilters,
  MutationObserver,
  type MutationObserverOptions,
  type MutationObserverResult,
  type MutationState,
  QueriesObserver,
  type QueryClient,
  type QueryFilters,
  type QueryKey,
  QueryObserver,
  type QueryObserverOptions,
  type QueryObserverResult,
  notifyManager,
} from "@tanstack/query-core";

import { baseQuery, observed, suspending, withHandles } from "./base.ts";
import { useQueryClient } from "./client.ts";

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

/**
 * An intersection rather than an `extends`: `MutationObserverResult` is a
 * discriminated union over `status`, and an interface that extended it would
 * flatten the union and lose the narrowing `isSuccess` gives.
 */
export type UseMutationResult<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
> = MutationObserverResult<TData, TError, TVariables, TContext> & {
  mutate: (variables: TVariables) => void;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  reset: () => void;
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
  options: () => UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> {
  return baseQuery<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>(
    QueryObserver,
    options,
    queryClient,
    { suspense: true },
  );
}

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
  options: () => UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
  queryClient?: QueryClient,
): UseInfiniteQueryResult<TData, TError> {
  return baseQuery<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>(
    InfiniteQueryObserver as never,
    options as never,
    queryClient,
    { suspense: true },
  ) as UseInfiniteQueryResult<TData, TError>;
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

  renderEffect(() => {
    observer.setOptions(options());
  });

  const mutateAsync = (variables: TVariables): Promise<TData> => observer.mutate(variables);

  return withHandles(state, {
    mutate: (variables: TVariables) => {
      // The rejection is the caller's to read off `error`; leaving it unhandled
      // here would surface as an unhandled rejection for a state the result
      // already reports.
      mutateAsync(variables).catch(() => {});
    },
    mutateAsync,
    reset: () => observer.reset(),
  });
}

/**
 * Several queries at once, through ONE observer.
 *
 * Not a loop over `useQuery`: `QueriesObserver` batches the whole set into a
 * single notification, so a page fetching twelve resources re-renders once
 * rather than twelve times.
 */
export function useQueries<TQueryFnData = unknown, TError = DefaultError, TData = TQueryFnData>(
  options: () => {
    queries: readonly UseQueryOptions<TQueryFnData, TError, TData>[];
  },
  queryClient?: QueryClient,
): readonly UseQueryResult<TData, TError>[] {
  const client = useQueryClient(queryClient);
  const defaulted = (
    source: () => { queries: readonly UseQueryOptions<TQueryFnData, TError, TData>[] },
  ) => source().queries.map((each) => client.defaultQueryOptions(each as never));

  const observer = new QueriesObserver<UseQueryResult<TData, TError>[]>(
    client,
    untrack(() => defaulted(options)) as never,
  );

  const [first] = observer.getOptimisticResult(
    untrack(() => defaulted(options)),
    undefined,
  );
  const [state, setState] = store<{ results: QueryObserverResult[] }>({ results: [...first] });

  renderEffect(() => {
    observer.setQueries(defaulted(options));
  });

  renderEffect(() => {
    const unsubscribe = observer.subscribe(
      notifyManager.batchCalls((results: readonly QueryObserverResult[]) => {
        write(results);
      }),
    );
    return unsubscribe;
  });

  /**
   * Written INDEX BY INDEX, never replaced.
   *
   * The array a caller holds is read once, when the component body runs, so
   * swapping it for a new one leaves them holding the first. Writing through
   * the store keeps one array and makes `results[1].data` a dependency of its
   * own — which is the whole reason to run a set through one observer rather
   * than a loop of `useQuery`.
   */
  function write(results: readonly QueryObserverResult[]): void {
    for (const [index, result] of results.entries()) {
      const current = state.results[index] as QueryObserverResult | undefined;
      if (current === undefined) {
        setState("results", index, result as never);
        continue;
      }
      for (const key of Object.keys(result) as (keyof QueryObserverResult)[]) {
        setState("results", index, key, result[key] as never);
      }
    }
    if (results.length < state.results.length) {
      setState("results", (previous: QueryObserverResult[]) => previous.slice(0, results.length));
    }
  }

  return state.results as readonly UseQueryResult<TData, TError>[];
}

/** How many queries are fetching right now. */
export function useIsFetching(filters?: QueryFilters, queryClient?: QueryClient): () => number {
  const client = useQueryClient(queryClient);
  const [state, setState] = store({ count: client.isFetching(filters) });

  renderEffect(() => {
    const cache = client.getQueryCache();
    const unsubscribe = cache.subscribe(
      notifyManager.batchCalls(() => setState("count", client.isFetching(filters))),
    );
    setState("count", client.isFetching(filters));
    return unsubscribe;
  });

  return () => state.count;
}

/** How many mutations are running right now. */
export function useIsMutating(filters?: MutationFilters, queryClient?: QueryClient): () => number {
  const client = useQueryClient(queryClient);
  const [state, setState] = store({ count: client.isMutating(filters) });

  renderEffect(() => {
    const cache = client.getMutationCache();
    const unsubscribe = cache.subscribe(
      notifyManager.batchCalls(() => setState("count", client.isMutating(filters))),
    );
    setState("count", client.isMutating(filters));
    return unsubscribe;
  });

  return () => state.count;
}

/**
 * The state of mutations matching `filters`, whoever started them.
 *
 * What a global "saving…" indicator needs, and the only way to see a mutation
 * a different component owns.
 */
export function useMutationState<TResult = MutationState>(
  options?: () => {
    filters?: MutationFilters;
    select?: (mutation: Mutation) => TResult;
  },
  queryClient?: QueryClient,
): () => TResult[] {
  const client = useQueryClient(queryClient);
  const cache = client.getMutationCache();

  const read = (): TResult[] => {
    const { filters, select } = options?.() ?? {};
    return cache
      .findAll(filters)
      .map((mutation) => (select ? select(mutation) : (mutation.state as TResult)));
  };

  const [state, setState] = store<{ results: TResult[] }>({ results: untrack(read) });

  renderEffect(() => {
    const current = read();
    const unsubscribe = cache.subscribe(
      notifyManager.batchCalls(() => setState("results", read() as never)),
    );
    setState("results", current as never);
    return unsubscribe;
  });

  return () => state.results as TResult[];
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

export { suspending };
