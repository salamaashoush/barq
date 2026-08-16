/**
 * barq-extra — the router, the query adapter, and utility hooks.
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
  NavigateOptions,
  ExtractRouteParams,
  PathParams,
  NavigationGuard,
  NavigationGuardContext,
  CacheConfig,
  ScrollRestorationConfig,
  ViewTransitionConfig,
  PrefetchConfig,
  ErrorBoundaryProps,
  ErrorComponent,
  LinkProps,
  NavLinkProps,
  RouterProps,
  MemoryRouterProps,
  RedirectProps,
  MatchedRoute,
} from "./router.ts";
export {
  // Components
  Router,
  MemoryRouter,
  Link,
  NavLink,
  Redirect,
  // Hooks — the only way to reach a router. There is no module-global
  // `navigate()` and no `prefetch()` beside it: a router is reached through the
  // scope chain that provided it, which is what makes two on one page possible.
  useLocation,
  useParams,
  useSearchParams,
  useNavigate,
  useIsLoading,
  useMatchedRoutes,
  // Route builders
  route,
  defineRoute,
  defineRoutes,
  // Path utilities
  resolvePath,
  compilePath,
  matchPath,
  matchRoutes,
  clearPathCache,
  setRouterDebugMode,
} from "./router.ts";

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
