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
 * helpers, and `useIsRestoring` for a persister.
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
  type UseInfiniteQueryOptions,
  type UseInfiniteQueryResult,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
  useInfiniteQuery,
  useIsFetching,
  useIsMutating,
  useMutation,
  useMutationState,
  usePrefetchQuery,
  useQueries,
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "./hooks.ts";

export { infiniteQueryOptions, mutationOptions, queryOptions } from "./options.ts";

/**
 * Re-exported so an application needs one import for the common case, and so
 * the version of `query-core` the adapter was built against is the one it uses.
 */
export {
  type DefaultError,
  type InfiniteData,
  type QueryClientConfig,
  type QueryFilters,
  type QueryKey,
  type MutationFilters,
  MutationCache,
  QueryCache,
  QueryClient,
  dehydrate,
  hydrate,
  keepPreviousData,
  skipToken,
} from "@tanstack/query-core";
