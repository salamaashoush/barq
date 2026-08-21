/**
 * `@barqjs/router` — routing for barq, with SSR, streaming and server-function
 * loaders.
 *
 * The design record is `DESIGN.md` beside this file. Two things a reader should
 * know before anything else:
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
  href,
  memoryHistory,
  normalizeBase,
  parseLocation,
  stripBase,
} from "./history.ts";

export { type FlatRoute, type Match, type Matcher, createMatcher } from "./matcher.ts";

export {
  type Segment,
  SPLAT_KEY,
  interpolate,
  isUnder,
  joinPattern,
  leavesTheApp,
  normalize,
  parsePattern,
  resolvePath,
  splitPath,
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
export { NotFound, isNotFound, isRedirect, notFound, redirect } from "./errors.ts";

export {
  type Loader,
  type AnyRouteDefinition,
  type ErrorComponent,
  type ErrorProps,
  type InvokedRouteComponent,
  type Route,
  type RouteComponent,
  type RouteDefinition,
  type RouteProps,
  flattenRoutes,
  pathOf,
  route,
} from "./route.ts";

export {
  type LinkProps,
  type NavLinkProps,
  type RedirectProps,
  type RouterProps,
  Link,
  NavLink,
  Redirect,
  Router,
  RouterContext,
  RouterProvider,
  renderDepth,
  useRouter,
} from "./components.ts";

export {
  useInvalidate,
  useLocation,
  useMatches,
  useNavigate,
  useParams,
  useSearch,
  useSearchParams,
} from "./hooks.ts";

export {
  type Guard,
  type NavigateOptions,
  type RouterConfig,
  type RouterState,
  createRouter,
  loaderKey,
  searchKey,
} from "./router.ts";

export {
  type Reachability,
  type VerifyOptions,
  type Violation,
  chainOf,
  describe as describeViolations,
  idsInStub,
  reachabilityFrom,
  verifyRouteChains,
} from "./manifest.ts";
