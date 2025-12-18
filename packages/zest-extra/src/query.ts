/**
 * TanStack Query adapter for zest
 *
 * Provides reactive query hooks that integrate with zest's signal-based reactivity.
 * Uses @tanstack/query-core for the framework-agnostic query logic.
 */

import {
  type DefaultError,
  type InfiniteData,
  InfiniteQueryObserver,
  type InfiniteQueryObserverOptions,
  type InfiniteQueryObserverResult,
  MutationObserver,
  type MutationObserverOptions,
  type MutationObserverResult,
  type QueryClient,
  type QueryKey,
  QueryObserver,
  type QueryObserverOptions,
  type QueryObserverResult,
  notifyManager,
} from "@tanstack/query-core";
import { useEffect, useState } from "@barqjs/core";

// ============================================================================
// Types
// ============================================================================

export type { QueryClient, QueryKey, DefaultError, InfiniteData };

/** Query options for useQuery */
export type UseQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = QueryObserverOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>;

/** Query result from useQuery */
export type UseQueryResult<TData = unknown, TError = DefaultError> = QueryObserverResult<
  TData,
  TError
>;

/** Mutation options for useMutation */
export type UseMutationOptions<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
> = MutationObserverOptions<TData, TError, TVariables, TContext>;

/** Mutation result from useMutation */
export interface UseMutationResult<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
> {
  data: TData | undefined;
  error: TError | null;
  isError: boolean;
  isIdle: boolean;
  isPending: boolean;
  isSuccess: boolean;
  status: "idle" | "pending" | "success" | "error";
  variables: TVariables | undefined;
  mutate: (variables: TVariables) => void;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  reset: () => void;
}

/** Infinite query options */
export type UseInfiniteQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
> = InfiniteQueryObserverOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>;

/** Infinite query result */
export type UseInfiniteQueryResult<
  TData = unknown,
  TError = DefaultError,
> = InfiniteQueryObserverResult<TData, TError>;

// ============================================================================
// Query Client Context (simple singleton for zest)
// ============================================================================

let globalQueryClient: QueryClient | null = null;

/** Set the global query client */
export function setQueryClient(client: QueryClient): void {
  globalQueryClient = client;
}

/** Get the global query client */
export function getQueryClient(): QueryClient {
  if (!globalQueryClient) {
    throw new Error("QueryClient not set. Call setQueryClient() or use QueryClientProvider first.");
  }
  return globalQueryClient;
}

/** QueryClientProvider component */
export function QueryClientProvider(props: { client: QueryClient; children: Node }): Node {
  setQueryClient(props.client);
  return props.children;
}

// ============================================================================
// useQuery
// ============================================================================

/**
 * Query hook for fetching and caching server state
 *
 * @example
 * ```tsx
 * const query = useQuery(() => ({
 *   queryKey: ['users', userId],
 *   queryFn: () => fetchUser(userId),
 * }));
 *
 * // Access reactive state
 * query().data    // TData | undefined
 * query().isLoading
 * query().error
 * ```
 */
export function useQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: () => UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): () => UseQueryResult<TData, TError> {
  const client = getQueryClient();
  const opts = options();

  const observer = new QueryObserver<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>(
    client,
    opts,
  );

  const [state, setState] = useState<UseQueryResult<TData, TError>>(observer.getCurrentResult());

  useEffect(() => {
    // Update options if they change
    observer.setOptions(options());

    // Subscribe to observer updates
    const unsubscribe = observer.subscribe(
      notifyManager.batchCalls((result: QueryObserverResult<TData, TError>) => {
        setState(result);
      }),
    );

    return () => {
      unsubscribe();
    };
  });

  return state;
}

// ============================================================================
// useMutation
// ============================================================================

/**
 * Mutation hook for modifying server state
 *
 * @example
 * ```tsx
 * const mutation = useMutation(() => ({
 *   mutationFn: (data: CreateUserData) => createUser(data),
 *   onSuccess: () => {
 *     queryClient.invalidateQueries({ queryKey: ['users'] });
 *   },
 * }));
 *
 * // Trigger mutation
 * mutation().mutate({ name: 'John' });
 *
 * // Access state
 * mutation().isPending
 * mutation().error
 * mutation().data
 * ```
 */
export function useMutation<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
>(
  options: () => UseMutationOptions<TData, TError, TVariables, TContext>,
): () => UseMutationResult<TData, TError, TVariables, TContext> {
  const client = getQueryClient();
  const opts = options();

  const observer = new MutationObserver<TData, TError, TVariables, TContext>(client, opts);

  const [state, setState] = useState<MutationObserverResult<TData, TError, TVariables, TContext>>(
    observer.getCurrentResult(),
  );

  useEffect(() => {
    observer.setOptions(options());

    const unsubscribe = observer.subscribe(
      notifyManager.batchCalls(
        (result: MutationObserverResult<TData, TError, TVariables, TContext>) => {
          setState(result);
        },
      ),
    );

    return () => {
      unsubscribe();
    };
  });

  const result = (): UseMutationResult<TData, TError, TVariables, TContext> => {
    const currentState = state();
    return {
      data: currentState.data,
      error: currentState.error,
      isError: currentState.isError,
      isIdle: currentState.isIdle,
      isPending: currentState.isPending,
      isSuccess: currentState.isSuccess,
      status: currentState.status,
      variables: currentState.variables,
      mutate: (variables: TVariables) => {
        observer.mutate(variables).catch(() => {
          // Error handled by observer
        });
      },
      mutateAsync: (variables: TVariables) => observer.mutate(variables),
      reset: () => observer.reset(),
    };
  };

  return result;
}

// ============================================================================
// useInfiniteQuery
// ============================================================================

/**
 * Infinite query hook for paginated/infinite scroll data
 *
 * @example
 * ```tsx
 * const query = useInfiniteQuery(() => ({
 *   queryKey: ['posts'],
 *   queryFn: ({ pageParam }) => fetchPosts(pageParam),
 *   initialPageParam: 0,
 *   getNextPageParam: (lastPage) => lastPage.nextCursor,
 * }));
 *
 * // Access pages
 * query().data?.pages
 *
 * // Load more
 * query().fetchNextPage()
 * ```
 */
export function useInfiniteQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: () => UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
): () => UseInfiniteQueryResult<TData, TError> {
  const client = getQueryClient();
  const opts = options();

  // Cast to unknown first to work around strict generic constraints in v5
  const observer = new InfiniteQueryObserver(
    client,
    opts as unknown as InfiniteQueryObserverOptions,
  );

  const [state, setState] = useState<UseInfiniteQueryResult<TData, TError>>(
    observer.getCurrentResult() as UseInfiniteQueryResult<TData, TError>,
  );

  useEffect(() => {
    observer.setOptions(options() as unknown as InfiniteQueryObserverOptions);

    const unsubscribe = observer.subscribe(
      notifyManager.batchCalls((result) => {
        setState(result as UseInfiniteQueryResult<TData, TError>);
      }),
    );

    return () => {
      unsubscribe();
    };
  });

  return state;
}

// ============================================================================
// useQueryClient
// ============================================================================

/**
 * Get the QueryClient instance
 *
 * @example
 * ```tsx
 * const queryClient = useQueryClient();
 * queryClient.invalidateQueries({ queryKey: ['users'] });
 * ```
 */
export function useQueryClient(): QueryClient {
  return getQueryClient();
}

// ============================================================================
// useIsFetching
// ============================================================================

/**
 * Get the number of queries currently fetching
 *
 * @example
 * ```tsx
 * const isFetching = useIsFetching();
 * if (isFetching() > 0) {
 *   // Show global loading indicator
 * }
 * ```
 */
export function useIsFetching(filters?: { queryKey?: QueryKey }): () => number {
  const client = getQueryClient();
  const [count, setCount] = useState(client.isFetching(filters));

  useEffect(() => {
    const unsubscribe = client.getQueryCache().subscribe(() => {
      setCount(client.isFetching(filters));
    });

    return unsubscribe;
  });

  return count;
}

// ============================================================================
// useIsMutating
// ============================================================================

/**
 * Get the number of mutations currently in progress
 *
 * @example
 * ```tsx
 * const isMutating = useIsMutating();
 * if (isMutating() > 0) {
 *   // Show saving indicator
 * }
 * ```
 */
export function useIsMutating(filters?: { mutationKey?: QueryKey }): () => number {
  const client = getQueryClient();
  const [count, setCount] = useState(client.isMutating(filters));

  useEffect(() => {
    const unsubscribe = client.getMutationCache().subscribe(() => {
      setCount(client.isMutating(filters));
    });

    return unsubscribe;
  });

  return count;
}

// ============================================================================
// Suspense Integration (optional)
// ============================================================================

/**
 * Query hook that throws promises for Suspense integration
 *
 * @example
 * ```tsx
 * <Suspense fallback={<Loading />}>
 *   <UserProfile />
 * </Suspense>
 *
 * function UserProfile() {
 *   const data = useSuspenseQuery(() => ({
 *     queryKey: ['user'],
 *     queryFn: fetchUser,
 *   }));
 *   return <div>{data().name}</div>;
 * }
 * ```
 */
export function useSuspenseQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(options: () => UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>): () => TData {
  const query = useQuery(() => ({
    ...options(),
    throwOnError: true,
  }));

  return () => {
    const result = query();

    if (result.isPending && result.fetchStatus !== "idle") {
      // Throw the promise for Suspense to catch
      throw new Promise<void>((resolve) => {
        const unsubscribe = getQueryClient()
          .getQueryCache()
          .subscribe(() => {
            const current = query();
            if (!current.isPending || current.fetchStatus === "idle") {
              unsubscribe();
              resolve();
            }
          });
      });
    }

    if (result.isError) {
      throw result.error;
    }

    return result.data as TData;
  };
}

// ============================================================================
// Prefetching utilities
// ============================================================================

/**
 * Prefetch a query for faster subsequent loads
 *
 * @example
 * ```tsx
 * // Prefetch on hover
 * <Link
 *   href="/user/123"
 *   onMouseEnter={() => prefetchQuery({
 *     queryKey: ['user', '123'],
 *     queryFn: () => fetchUser('123'),
 *   })}
 * >
 *   View User
 * </Link>
 * ```
 */
export async function prefetchQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>): Promise<void> {
  const client = getQueryClient();
  await client.prefetchQuery(options);
}

/**
 * Prefetch an infinite query
 */
export async function prefetchInfiniteQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: UseInfiniteQueryOptions<
    TQueryFnData,
    TError,
    InfiniteData<TQueryFnData>,
    TQueryKey,
    TPageParam
  >,
): Promise<void> {
  const client = getQueryClient();
  await client.prefetchInfiniteQuery(options);
}
