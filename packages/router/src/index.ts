/**
 * `@barqjs/router` — routing for barq, with SSR, streaming and server-function
 * loaders.
 *
 * Two things a reader should know before anything else:
 *
 *  - **A loader is an ordinary isomorphic function, not a server function.** It
 *    runs on the server for the first request and on the client for every
 *    navigation after it, and its body ships to the browser. Anything that must
 *    not ship lives behind a `createServerFn()` the loader calls.
 *  - **A route guard is not an authorization boundary.** The server function a
 *    loader calls is a separately reachable endpoint, so the check belongs on
 *    that function's middleware. Every framework surveyed documents this hole;
 *    closing it is what the route-action manifest is for.
 */

export {
  type Location,
  type History,
  type NavigationAction,
  addBase,
  browserHistory,
  hashHistory,
  href,
  memoryHistory,
  normalizeBase,
  parseLocation,
  stripBase,
} from "./history.ts";

export {
  type FlatRoute,
  type Match,
  type Matcher,
  type MatcherOptions,
  createMatcher,
} from "./matcher.ts";

export {
  type ScrollRestoration,
  type ViewTransitionOptions,
  SCROLL_ID_ATTRIBUTE,
  scrollKey,
  scrollRestoration,
  withViewTransition,
} from "./scroll.ts";

export {
  type SearchMiddleware,
  type SearchMiddlewareContext,
  type SearchValidator,
  SearchParamError,
  applySearchMiddleware,
  retainSearchParams,
  searchRecord,
  stripSearchParams,
  toSearchString,
  validateSearch,
} from "./search.ts";

export {
  type Segment,
  type TrailingSlash,
  SPLAT_KEY,
  applyTrailingSlash,
  interpolate,
  isNavigable,
  isUnder,
  joinPattern,
  leavesTheApp,
  normalize,
  parsePattern,
  resolvePath,
  splitPath,
  withoutTrailingSlash,
} from "./path.ts";

/**
 * A loader is isomorphic, so what a loader THROWS has to be importable from the
 * isomorphic entry. `@barqjs/router/server` re-exports the same bindings for
 * code that already imports the page handler.
 *
 * The `Redirect` CLASS is deliberately not re-exported here: `components.ts`
 * already exports a `Redirect` COMPONENT and the two collide. Bun's resolver
 * tolerated it; Rolldown refused the build, which is the gate that caught it.
 * `isRedirect` is the predicate a consumer actually wants, and
 * `@barqjs/router/server` still exports the class for code that needs it.
 */
export {
  type RedirectLike,
  NOT_FOUND,
  NotFound,
  REDIRECT,
  isNotFound,
  isRedirect,
  notFound,
  redirect,
} from "./errors.ts";

export {
  type Loader,
  type AnyRouteDefinition,
  type BeforeLoadContext,
  type ErrorComponent,
  type ErrorProps,
  type InvokedRouteComponent,
  type Route,
  type RouteComponent,
  type RouteDefinition,
  type RouteHandler,
  type RouteLifecycle,
  type RouteHandlerContext,
  type RouteMethod,
  type RouteProps,
  type RouteServer,
  flattenRoutes,
  pathOf,
  preloadMatched,
  route,
} from "./route.ts";

export {
  type ActiveOptions,
  type ClientOnlyProps,
  type LinkProps,
  type NavLinkProps,
  type PreloadStrategy,
  type RedirectProps,
  type RouterProps,
  type RouteMatchInfo,
  ClientOnly,
  Link,
  NavLink,
  Outlet,
  Redirect,
  Router,
  RouterContext,
  RouterProvider,
  linkAttrHref,
  renderDepth,
  useRouteMatch,
  useRouter,
} from "./components.ts";

export {
  type FileRoutesById,
  type Register,
  type RegisteredRouteTree,
  type RouteId,
  type RoutePath,
  type ToPath,
} from "./register.ts";

export {
  type FileRoute,
  type RootRouteOptions,
  ROOT_ROUTE_ID,
  createFileRoute,
  createRootRoute,
  createRootRouteWithContext,
} from "./file-route.ts";
export {
  type HeadAssets,
  Document,
  HeadContent,
  Scripts,
  clientHeadAssets,
  resolveHeadFor,
  useHeadAssets,
} from "./components.ts";

export { type RouterDevtoolsProps, RouterDevtools } from "./devtools.ts";

export {
  type BodyScripts,
  type Head,
  type HeadContentTag,
  type HeadContext,
  type HeadMeta,
  type HeadResult,
  type HeadTag,
  type ManagedTag,
  type MatchAssets,
  projectHead,
  renderTag,
  renderTags,
  resolveHead,
  resolveScripts,
} from "./head.ts";

export {
  useBlocker,
  useCanGoBack,
  useInvalidate,
  useLocation,
  useMatch,
  useRouteContext,
  useRouterState,
  useMatches,
  useNavigate,
  useParams,
  useSearch,
  useSearchParams,
} from "./hooks.ts";

export {
  type BeforeLoadResult,
  type BeforeLoadSeed,
  type Blocker,
  type Guard,
  type LoadCause,
  type NavigateOptions,
  type RouteDefaults,
  type RouterConfig,
  type RouterState,
  type SsrMode,
  ROUTE_CONTEXT_GLOBAL,
  createRouter,
  depsKey,
  unmask,
  loaderKey,
  resolveSsr,
  searchKey,
} from "./router.ts";

/**
 * The route-action manifest is NOT exported here.
 *
 * `manifest.ts` imports `middlewareOf` from `@barqjs/start`, which reaches
 * `context.ts` and `node:async_hooks` — so re-exporting it from the isomorphic
 * entry put the whole server runtime in the CLIENT graph. Measured on
 * `packages/kitchen-sink`: removing this export removes the
 * "node:async_hooks has been externalized for browser compatibility" warning and
 * 12 modules with it.
 *
 * These are BUILD-time helpers with no runtime caller, so they live on
 * `@barqjs/router/vite`, beside the hook that uses them.
 */
