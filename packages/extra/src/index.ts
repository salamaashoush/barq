/** barq-extra: the TanStack Query adapter and the utility hooks. */

// Extra hooks
export {
  useFetch,
  useDebounce,
  useThrottle,
  usePrevious,
  useToggle,
  useCounter,
  useLocalStorage,
  useMediaQuery,
  useWindowSize,
  useIntersection,
  useClickOutside,
  useKeyboard,
  useTitle,
  useInterval,
  useTimeout,
} from "./hooks.ts";

// TanStack Query adapter
export { QueryClient } from "@tanstack/query-core";
export type {
  QueryKey,
  DefaultError,
  InfiniteData,
  UseQueryOptions,
  UseQueryResult,
  UseMutationOptions,
  UseMutationResult,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
} from "./query.ts";
export {
  QueryClientProvider,
  useQuery,
  useMutation,
  useInfiniteQuery,
  useQueryClient,
  useIsFetching,
  useIsMutating,
} from "./query.ts";
