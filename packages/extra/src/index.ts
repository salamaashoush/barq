/**
 * barq-extra — the query adapter and utility hooks.
 *
 * The router that used to live here is gone; `@barqjs/router` replaces it. It
 * was the no-build option and it is not missed: the new one is a plain code-based
 * table that works with no build step either, and keeping a second
 * implementation of matching, history and navigation meant two answers to every
 * question. Its behaviour survives as the new package's test corpus and its
 * matcher survives as `packages/benchmark/src/legacy-matcher.ts`, the comparand
 * the measurement that replaced it is against.
 *
 * CSS-in-JS is GONE from this package. `CODESIGN.md` §4.1 indicts the goober
 * wrapper for re-implementing element creation a fifth time in its JSX pragma,
 * and CSS scoping is ecosystem rather than framework: an application that wants
 * goober depends on goober. `packages/kitchen-sink/src/styles.ts` is where this
 * package's copy went, unchanged apart from the three exports that needed the
 * pragma.
 */

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
