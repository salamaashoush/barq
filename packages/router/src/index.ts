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
  type LocationRewrite,
  type LocationRewriteFunction,
  composeRewrites,
  rewriteHistory,
  rewriteHref,
} from "./rewrite.ts";

export {
  type ScrollPosition,
  type ScrollRestoration,
  type ViewTransitionInfo,
  type ViewTransitionOptions,
  SCROLL_ID_ATTRIBUTE,
  type ScrollOptions,
  savedScrollPosition,
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
  type NotFoundOptions,
  type RedirectLike,
  type RedirectOptions,
  NOT_FOUND,
  NotFound,
  PathParamError,
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
  type RouteHandlerEntry,
  type RouteHandlers,
  type RouteLifecycle,
  type RouteHandlerContext,
  type RouteMethod,
  type RouteProps,
  type RouteServer,
  type SsrDecider,
  type Validated,
  flattenRoutes,
  pathOf,
  preloadMatched,
  route,
} from "./route.ts";

export {
  type ActiveOptions,
  type AwaitProps,
  type ClientOnlyProps,
  type LinkProps,
  type NavLinkProps,
  type PreloadStrategy,
  type RedirectProps,
  type RouterProps,
  type RouteMatchInfo,
  type MatchRouteProps,
  Await,
  ClientOnly,
  useHydrated,
  MatchRoute,
  Link,
  NavLink,
  Outlet,
  Redirect,
  Router,
  RouterContext,
  RouterProvider,
  createLink,
  linkAttrHref,
  linkOptions,
  renderDepth,
  useLinkProps,
  useRouteMatch,
  useRouter,
} from "./components.ts";

export {
  type CatchBoundaryProps,
  type CatchNotFoundProps,
  CatchBoundary,
  CatchNotFound,
} from "./catch.ts";

export {
  type BlockProps,
  type BlockerResolver,
  type ShouldBlockArgs,
  type UseBlockerOptions,
  Block,
} from "./blocker.ts";

export { type MatchHookOptions, type RouteApi, getRouteApi, useAwaited } from "./match.ts";

export {
  type FileRoutesById,
  type NavigateFn,
  type NavigateOptionsFor,
  type ParamsOfPath,
  type Register,
  type RegisteredRouteTree,
  type ResolveRelativePath,
  type RouteId,
  type RoutePath,
  type SearchOfRoute,
  type ToOptionsFor,
  type ToPath,
} from "./register.ts";

export {
  type FileRoute,
  type RootRouteOptions,
  type Selecting,
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
  type RouterStateValue,
  useBlocker,
  useCanGoBack,
  useChildMatches,
  useElementScrollRestoration,
  useInvalidate,
  useLoaderData,
  useLoaderDeps,
  useLocation,
  useMatch,
  useParentMatches,
  useRouteContext,
  useRouterState,
  useMatches,
  useMatchRoute,
  useNavigate,
  useServerFn,
  useParams,
  useSearch,
  useSearchParams,
} from "./hooks.ts";

export {
  type BeforeLoadResult,
  type BeforeLoadSeed,
  type BlockOptions,
  type Blocker,
  type BlockerLocation,
  type BuiltLocation,
  type Guard,
  type HistoryAction,
  type LoadCause,
  type NavigateOptions,
  type RouteDefaults,
  type MatchRouteOptions,
  type RouteMask,
  type RouteMatch,
  type RouterEvent,
  type RouterEventType,
  type RouterListener,
  type RouterConfig,
  type RouterSnapshot,
  type RouterState,
  type SsrMode,
  type ToMaskOptions,
  type ToOptions,
  ROUTE_CONTEXT_GLOBAL,
  createRouteMask,
  createRouter,
  depsKey,
  unmask,
  loaderKey,
  resolveSsr,
  searchKey,
} from "./router.ts";

export {
  type RouterOptions,
  type ServerSsr,
  type WrapComponent,
  type WrapProps,
  ROUTER_DEHYDRATED_GLOBAL,
  hydrateRouter,
  takeDehydrated,
  withRouterOverrides,
} from "./ssr.ts";

/**
 * The route-action manifest is not exported here. `manifest.ts` imports
 * `middlewareOf` from `@barqjs/start`, which reaches `node:async_hooks`, and
 * this entry is in the client graph. `@barqjs/router/server` runs the check.
 */
