/**
 * zest-extra
 *
 * Extra utilities for zest: CSS-in-JS, clsx, variants, and utility hooks
 */

// CSS-in-JS (goober wrapper)
export {
  css,
  styled,
  keyframe,
  globalCss,
  getStyleTag,
  setupCss,
  // Class utilities
  clsx,
  type ClassValue,
  // Tokens & Theming
  createTheme,
  token,
  type DesignTokens,
  // Variants (like CVA)
  variants,
  type VariantConfig,
  // CSS variable utilities
  cssVar,
  defineVars,
} from "./css.ts";

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

// Router
export type {
  Location,
  Params,
  SearchParams,
  LoaderContext,
  Loader,
  RouteDefinition,
  RouteComponentProps,
  RouteComponent,
  RouterConfig,
} from "./router.tsx";
export {
  Router,
  Outlet,
  Link,
  NavLink,
  Redirect,
  navigate,
  useLocation,
  useParams,
  useSearchParams,
  useNavigate,
  route,
  defineRoute,
  defineRoutes,
} from "./router.tsx";

// TanStack Query adapter
// Re-export QueryClient from @tanstack/query-core for convenience
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
  setQueryClient,
  getQueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useInfiniteQuery,
  useQueryClient,
  useIsFetching,
  useIsMutating,
  useSuspenseQuery,
  prefetchQuery,
  prefetchInfiniteQuery,
} from "./query.ts";
