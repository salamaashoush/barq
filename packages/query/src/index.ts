/**
 * @barqjs/query — TanStack Query for barq.
 *
 * The adapter is a thin layer over `@tanstack/query-core`, and the two things
 * it adds are the two that matter on this framework:
 *
 * - Results are STORES, so `query.data` and `query.isFetching` are separate
 *   dependencies. A background refetch flips `isFetching` twice and wakes
 *   nobody who is only rendering data.
 * - Options are accessors, so a key built from a signal refetches when that
 *   signal changes.
 *
 * The surface matches the other framework adapters: queries, infinite queries,
 * mutations, `useQueries`, `useMutationState`, the counters, the typed option
 * helpers, the hydration and error-reset boundaries, and `useIsRestoring` for a
 * persister. The persister's provider, the devtools and the router integration
 * are entries of their own (`/persist`, `/devtools`, `/router`), because each
 * needs a package this one does not.
 */

export {
  type IsRestoringProviderProps,
  type QueryClientProviderProps,
  IsRestoringProvider,
  QueryClientProvider,
  useIsRestoring,
  useQueryClient,
} from "./client.ts";

export {
  type DefinedUseInfiniteQueryResult,
  type DefinedUseQueryResult,
  type MutationStateOptions,
  type UseInfiniteQueryOptions,
  type UseInfiniteQueryResult,
  type UseMutateAsyncFunction,
  type UseMutateFunction,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
  type UseSuspenseInfiniteQueryOptions,
  type UseSuspenseInfiniteQueryResult,
  type UseSuspenseQueryOptions,
  type UseSuspenseQueryResult,
  useInfiniteQuery,
  useIsFetching,
  useIsMutating,
  useMutation,
  useMutationState,
  usePrefetchInfiniteQuery,
  usePrefetchQuery,
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "./hooks.ts";

export {
  type QueriesOptions,
  type QueriesResults,
  type SuspenseQueriesOptions,
  type SuspenseQueriesResults,
  type UseQueryOptionsForUseQueries,
  useQueries,
  useSuspenseQueries,
} from "./queries.ts";

export {
  type DefinedInitialDataInfiniteOptions,
  type DefinedInitialDataOptions,
  type UndefinedInitialDataInfiniteOptions,
  type UndefinedInitialDataOptions,
  type UnusedSkipTokenInfiniteOptions,
  type UnusedSkipTokenOptions,
  infiniteQueryOptions,
  mutationOptions,
  queryOptions,
} from "./options.ts";

export { type HydrationBoundaryProps, HydrationBoundary } from "./hydration.ts";

export {
  type QueryErrorResetBoundaryProps,
  type QueryErrorResetBoundaryValue,
  QueryErrorResetBoundary,
  useQueryErrorResetBoundary,
} from "./reset.ts";

/**
 * Re-exported whole, so an application needs one import, and so the version of
 * `query-core` the adapter was built against is the one it uses.
 */
export * from "@tanstack/query-core";
