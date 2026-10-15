import type {
  DefaultError,
  InfiniteData,
  InitialDataFunction,
  NonUndefinedGuard,
  OmitKeyof,
  QueryFunction,
  QueryKey,
  QueryKeyWithDataTag,
  SkipToken,
  WithRequired,
} from "@tanstack/query-core";

import type { UseInfiniteQueryOptions, UseMutationOptions, UseQueryOptions } from "./hooks.ts";

export type UndefinedInitialDataOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
  initialData?:
    | undefined
    | InitialDataFunction<NonUndefinedGuard<TQueryFnData>>
    | NonUndefinedGuard<TQueryFnData>;
};

export type UnusedSkipTokenOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = OmitKeyof<UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>, "queryFn"> & {
  queryFn?: Exclude<
    UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>["queryFn"],
    SkipToken | undefined
  >;
};

export type DefinedInitialDataOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = Omit<UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>, "queryFn"> & {
  initialData: NonUndefinedGuard<TQueryFnData> | (() => NonUndefinedGuard<TQueryFnData>);
  queryFn?: QueryFunction<TQueryFnData, TQueryKey>;
};

/**
 * Options, typed and shared.
 *
 * The value is the identity function; the point is entirely in the types. A
 * key declared here carries its data and error type with it, so
 * `client.getQueryData(userQuery(1).queryKey)` is typed without a cast — which
 * is the thing that makes a query key worth sharing between a loader, a
 * prefetch and a component rather than being retyped at each.
 *
 * The overloads are ordered by what they can promise: `initialData` that is
 * certainly there makes `data` certainly there, and only then the general case.
 */
export function queryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: DefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>,
): DefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey> &
  QueryKeyWithDataTag<TQueryKey, TQueryFnData, TError>;
export function queryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UnusedSkipTokenOptions<TQueryFnData, TError, TData, TQueryKey>,
): UnusedSkipTokenOptions<TQueryFnData, TError, TData, TQueryKey> &
  QueryKeyWithDataTag<TQueryKey, TQueryFnData, TError>;
export function queryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UndefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>,
): UndefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey> &
  QueryKeyWithDataTag<TQueryKey, TQueryFnData, TError>;
export function queryOptions(options: unknown): unknown {
  return options;
}

export type UndefinedInitialDataInfiniteOptions<
  TQueryFnData,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
> = UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam> & {
  initialData?:
    | undefined
    | NonUndefinedGuard<InfiniteData<TQueryFnData, TPageParam>>
    | InitialDataFunction<NonUndefinedGuard<InfiniteData<TQueryFnData, TPageParam>>>;
};

export type UnusedSkipTokenInfiniteOptions<
  TQueryFnData,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
> = OmitKeyof<
  UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
  "queryFn"
> & {
  queryFn?: Exclude<
    UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>["queryFn"],
    SkipToken | undefined
  >;
};

export type DefinedInitialDataInfiniteOptions<
  TQueryFnData,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
> = UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam> & {
  initialData:
    | NonUndefinedGuard<InfiniteData<TQueryFnData, TPageParam>>
    | (() => NonUndefinedGuard<InfiniteData<TQueryFnData, TPageParam>>)
    | undefined;
};

export function infiniteQueryOptions<
  TQueryFnData,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: DefinedInitialDataInfiniteOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
): DefinedInitialDataInfiniteOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam> &
  QueryKeyWithDataTag<TQueryKey, InfiniteData<TQueryFnData>, TError>;
export function infiniteQueryOptions<
  TQueryFnData,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: UnusedSkipTokenInfiniteOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
): UnusedSkipTokenInfiniteOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam> &
  QueryKeyWithDataTag<TQueryKey, InfiniteData<TQueryFnData>, TError>;
export function infiniteQueryOptions<
  TQueryFnData,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: UndefinedInitialDataInfiniteOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
): UndefinedInitialDataInfiniteOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam> &
  QueryKeyWithDataTag<TQueryKey, InfiniteData<TQueryFnData>, TError>;
export function infiniteQueryOptions(options: unknown): unknown {
  return options;
}

/**
 * A mutation's options, shared between the component that runs it and the
 * `useMutationState` or `useIsMutating` that watches it. With a `mutationKey`
 * the key stays required in the result, so a filter built from it type-checks.
 */
export function mutationOptions<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
>(
  options: WithRequired<UseMutationOptions<TData, TError, TVariables, TContext>, "mutationKey">,
): WithRequired<UseMutationOptions<TData, TError, TVariables, TContext>, "mutationKey">;
export function mutationOptions<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
>(
  options: Omit<UseMutationOptions<TData, TError, TVariables, TContext>, "mutationKey">,
): Omit<UseMutationOptions<TData, TError, TVariables, TContext>, "mutationKey">;
export function mutationOptions(options: unknown): unknown {
  return options;
}
