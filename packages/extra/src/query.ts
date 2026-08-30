import {
  type Cell,
  type JSXElement,
  type Scope,
  block,
  cell,
  context,
  provide,
  read,
  readSlot,
  effect,
  signal,
} from "@barqjs/core";
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

export type { QueryClient, QueryKey, DefaultError, InfiniteData };

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

export type UseMutationOptions<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
> = MutationObserverOptions<TData, TError, TVariables, TContext>;

export interface UseMutationResult<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  _TContext = unknown,
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

const QueryClientContext = context<QueryClient>(undefined, "barq-query-client");

/**
 * The provider is the only way to reach a client. A module-level default read
 * through a `catch` arm is the same fallback written as exception control flow,
 * and it lets an application work without ever entering the path it declares.
 */
function resolveClient(): QueryClient {
  try {
    return read(QueryClientContext)();
  } catch (cause) {
    throw new Error("No QueryClient in scope. Wrap the tree in <QueryClientProvider client={…}>.", {
      cause,
    });
  }
}

/**
 * Forks the context on its own instance scope and builds `children` INSIDE it,
 * so a consumer constructed below sees this client rather than an outer one.
 */
export const QueryClientProvider = block(
  (scope: Scope | null, props: { client: Cell<QueryClient>; children?: unknown }): unknown => {
    const client = readSlot(props.client, "QueryClientProvider.client") as QueryClient;
    return provide(scope as Scope, QueryClientContext, cell(client), (inner: Scope | null) => {
      const children = props.children;
      return typeof children === "function"
        ? (children as (s: Scope | null) => unknown)(inner)
        : children;
    });
  },
) as unknown as (props: QueryClientProviderProps) => JSXElement;

export interface QueryClientProviderProps {
  client: QueryClient;
  children?: unknown;
}

export function useQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: () => UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): () => UseQueryResult<TData, TError> {
  const client = resolveClient();
  const opts = options();

  const observer = new QueryObserver<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>(
    client,
    opts,
  );

  const state = signal<UseQueryResult<TData, TError>>(observer.getCurrentResult());

  effect(() => {
    observer.setOptions(options());

    const unsubscribe = observer.subscribe(
      notifyManager.batchCalls((result: QueryObserverResult<TData, TError>) => {
        state.set(result);
      }),
    );

    return () => {
      unsubscribe();
    };
  });

  return state;
}

export function useMutation<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
>(
  options: () => UseMutationOptions<TData, TError, TVariables, TContext>,
): () => UseMutationResult<TData, TError, TVariables, TContext> {
  const client = resolveClient();
  const opts = options();

  const observer = new MutationObserver<TData, TError, TVariables, TContext>(client, opts);

  const state = signal<MutationObserverResult<TData, TError, TVariables, TContext>>(
    observer.getCurrentResult(),
  );

  effect(() => {
    observer.setOptions(options());

    const unsubscribe = observer.subscribe(
      notifyManager.batchCalls(
        (result: MutationObserverResult<TData, TError, TVariables, TContext>) => {
          state.set(result);
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

export function useInfiniteQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: () => UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
): () => UseInfiniteQueryResult<TData, TError> {
  const client = resolveClient();
  const opts = options();

  // Cast to unknown first to work around strict generic constraints in v5
  const observer = new InfiniteQueryObserver(
    client,
    opts as unknown as InfiniteQueryObserverOptions,
  );

  const state = signal<UseInfiniteQueryResult<TData, TError>>(
    observer.getCurrentResult() as UseInfiniteQueryResult<TData, TError>,
  );

  effect(() => {
    observer.setOptions(options() as unknown as InfiniteQueryObserverOptions);

    const unsubscribe = observer.subscribe(
      notifyManager.batchCalls((result) => {
        state.set(result as UseInfiniteQueryResult<TData, TError>);
      }),
    );

    return () => {
      unsubscribe();
    };
  });

  return state;
}

export function useQueryClient(): QueryClient {
  return resolveClient();
}

export function useIsFetching(filters?: { queryKey?: QueryKey }): () => number {
  const client = resolveClient();
  const count = signal(client.isFetching(filters));

  effect(() => {
    const unsubscribe = client.getQueryCache().subscribe(() => {
      count.set(client.isFetching(filters));
    });

    return unsubscribe;
  });

  return count;
}

export function useIsMutating(filters?: { mutationKey?: QueryKey }): () => number {
  const client = resolveClient();
  const count = signal(client.isMutating(filters));

  effect(() => {
    const unsubscribe = client.getMutationCache().subscribe(() => {
      count.set(client.isMutating(filters));
    });

    return unsubscribe;
  });

  return count;
}
