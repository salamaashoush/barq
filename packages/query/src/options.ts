import type {
  DataTag,
  DefaultError,
  InfiniteData,
  QueryKey,
  SkipToken,
} from "@tanstack/query-core";

import type { UseInfiniteQueryOptions, UseMutationOptions, UseQueryOptions } from "./hooks.ts";

/**
 * Options, typed and shared.
 *
 * The value is the identity function; the point is entirely in the types. A
 * key declared here carries its data and error type with it, so
 * `client.getQueryData(userQuery(1).queryKey)` is typed without a cast — which
 * is the thing that makes a query key worth sharing between a loader, a
 * prefetch and a component rather than being retyped at each.
 */
export function queryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
    queryFn?: Exclude<
      UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>["queryFn"],
      SkipToken
    >;
  },
): UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>;
} {
  return options as never;
}

export function infiniteQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
): UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>;
} {
  return options as never;
}

export function mutationOptions<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
): UseMutationOptions<TData, TError, TVariables, TContext> {
  return options;
}
