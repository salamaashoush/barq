/**
 * zest-router - Minimal type-safe router with loaders, layouts, and search params
 *
 * Features:
 * - Type-safe route definitions
 * - Path params and search params
 * - Route loaders with caching
 * - Nested layouts with <Outlet />
 * - History API integration
 * - Fine-grained reactivity via signals
 *
 * @example Nested layouts with Outlet
 * ```tsx
 * // Layout uses <Outlet /> to render child routes
 * function DashboardLayout() {
 *   return (
 *     <div class="dashboard">
 *       <nav>...</nav>
 *       <main>
 *         <Outlet />  {/* Child routes render here *}
 *       </main>
 *     </div>
 *   );
 * }
 *
 * const routes = [
 *   route({
 *     path: "/dashboard",
 *     component: DashboardLayout,
 *     children: [
 *       route({ path: "/", component: Overview }),
 *       route({ path: "/users", component: Users }),
 *       route({ path: "/users/:id", component: UserDetail }),
 *     ]
 *   })
 * ];
 * ```
 */

import {
  type Child,
  Fragment,
  type JSXElement,
  batch,
  childToNodes,
  clearRange,
  createContext,
  createMarkerPair,
  insertNodes,
  onCleanup,
  untrack,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "@barqjs/core";

// ============================================================================
// Types
// ============================================================================

/** Route params extracted from path */
export type Params = Record<string, string>;

/** Search/query params */
export type SearchParams = URLSearchParams;

/** Current location state */
export interface Location {
  pathname: string;
  search: string;
  hash: string;
  params: Params;
  searchParams: SearchParams;
}

/** Loader context passed to route loaders */
export interface LoaderContext<P extends Params = Params> {
  params: P;
  searchParams: SearchParams;
  /** Abort signal for cancellation */
  signal: AbortSignal;
}

/** Route loader function */
export type Loader<T = unknown, P extends Params = Params> = (
  ctx: LoaderContext<P>,
) => T | Promise<T>;

/**
 * Route component props - flexible typing for route components
 * Components can accept any subset of these props
 */
export interface RouteComponentProps<T = unknown, P extends Params = Params> {
  params: P;
  data: T;
  children?: Child;
}

/**
 * Route component type - accepts components with flexible prop requirements
 * Components don't need to accept all props, just the ones they use
 */
export type RouteComponent<T = unknown, P extends Params = Params> =
  | ((props: RouteComponentProps<T, P>) => Child)
  | ((props: { params: P; data: T }) => Child)
  | ((props: { data: T; children?: Child }) => Child)
  | ((props: { params: P; children?: Child }) => Child)
  | ((props: { data: T }) => Child)
  | ((props: { params: P }) => Child)
  | ((props: { children?: Child }) => Child)
  | ((props: Record<string, never>) => Child)
  | (() => Child);

/** Route definition - use `route()` helper for type-safe route creation */
export interface RouteDefinition<T = unknown, P extends Params = Params> {
  path: string;
  component: RouteComponent<T, P>;
  loader?: Loader<T, P>;
  children?: RouteDefinition[];
}

/** Matched route with extracted params */
interface MatchedRoute<T = unknown> {
  route: RouteDefinition<T>;
  params: Params;
  /** Parent routes for layout rendering */
  parents: RouteDefinition[];
}

/** Router configuration */
export interface RouterConfig {
  routes: RouteDefinition[];
  /** Base path for all routes (e.g., "/app") */
  base?: string;
  /** Fallback component for 404 */
  fallback?: () => Child;
}

// ============================================================================
// Path Matching
// ============================================================================

interface PathPattern {
  regex: RegExp;
  paramNames: string[];
  path: string;
}

/**
 * Compile a path pattern to regex
 *
 * Supported patterns:
 * - `/users/:id` - dynamic param (required)
 * - `/users/:id?` - optional param
 * - `/files/*` - catch-all wildcard (captured as params["*"])
 * - `/docs/:path*` - named splat (captures rest of path including slashes)
 * - `/api/:version/:resource+` - one-or-more segments
 *
 * @example
 * ```
 * /users/:id         matches /users/123       -> { id: "123" }
 * /users/:id?        matches /users or /users/123
 * /files/*           matches /files/a/b/c     -> { "*": "a/b/c" }
 * /docs/:path*       matches /docs/a/b/c      -> { path: "a/b/c" }
 * ```
 */
function compilePath(path: string): PathPattern {
  const paramNames: string[] = [];

  // Escape special regex chars except : * + ?
  let pattern = path.replace(/[.^${}()|[\]\\]/g, "\\$&");

  // Replace :param* (named splat - captures rest including slashes)
  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)\*/g, (_, name) => {
    paramNames.push(name);
    return "(.*)";
  });

  // Replace :param+ (one or more segments)
  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)\+/g, (_, name) => {
    paramNames.push(name);
    return "(.+)";
  });

  // Replace :param? (optional param - single segment)
  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)\?/g, (_, name) => {
    paramNames.push(name);
    return "([^/]*)";
  });

  // Replace :param (required param - single segment)
  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
    paramNames.push(name);
    return "([^/]+)";
  });

  // Replace standalone * with wildcard capture (catch-all)
  // Must come after :param* to avoid double replacement
  pattern = pattern.replace(/\*/g, () => {
    paramNames.push("*");
    return "(.*)";
  });

  // Exact match (no trailing content unless it's a layout route)
  const regex = new RegExp(`^${pattern}$`);

  return { regex, paramNames, path };
}

/** Match a pathname against a pattern */
function matchPath(pathname: string, pattern: PathPattern): Params | null {
  const match = pathname.match(pattern.regex);
  if (!match) return null;

  const params: Params = {};
  pattern.paramNames.forEach((name, i) => {
    params[name] = match[i + 1];
  });

  return params;
}

/** Match pathname against routes, returning matched route chain */
function matchRoutes(
  pathname: string,
  routes: RouteDefinition[],
  parents: RouteDefinition[] = [],
): MatchedRoute | null {
  for (const route of routes) {
    // For routes with children, match as prefix
    const isLayout = route.children && route.children.length > 0;
    const pattern = compilePath(route.path);

    if (isLayout) {
      // Check if pathname starts with this route's path
      const prefixPattern = compilePath(
        route.path.endsWith("/") ? `${route.path}*` : `${route.path}/*`,
      );
      const exactMatch = matchPath(pathname, pattern);
      const prefixMatch = matchPath(pathname, prefixPattern);

      if (exactMatch) {
        // Exact match on layout route (e.g., /dashboard matches /dashboard)
        return { route, params: exactMatch, parents };
      }

      if (prefixMatch && route.children) {
        // Prefix match - try to match children
        const childPathname = pathname.slice(route.path.length) || "/";
        const childMatch = matchRoutes(childPathname, route.children, [...parents, route]);
        if (childMatch) {
          // Merge params from parent
          return {
            ...childMatch,
            params: { ...prefixMatch, ...childMatch.params },
          };
        }
      }
    } else {
      // Leaf route - exact match only
      const params = matchPath(pathname, pattern);
      if (params) {
        return { route, params, parents };
      }
    }
  }

  return null;
}

// ============================================================================
// Router State
// ============================================================================

interface RouterState {
  location: () => Location;
  setLocation: (loc: Location) => void;
  params: () => Params;
  setParams: (params: Params) => void;
  // Matched routes chain - updated on navigation
  matchedRoutes: () => RouteDefinition[];
  setMatchedRoutes: (routes: RouteDefinition[]) => void;
  // Loader data for each route in chain
  loaderData: () => unknown[];
  setLoaderData: (data: unknown[]) => void;
  config: RouterConfig;
  loaderCache: Map<string, { data: unknown; timestamp: number }>;
  base: string;
}

// Global router state - single router per page
let routerState: RouterState | null = null;

// Event listener cleanup references
let popstateHandler: (() => void) | null = null;
let clickHandler: ((e: MouseEvent) => void) | null = null;

// ============================================================================
// Outlet Context - tracks the outlet level in the component tree
// ============================================================================

// Context just tracks the current outlet level
const OutletLevelContext = createContext<number>(0);

/** Parse current browser location */
function parseLocation(base: string): Location {
  const pathname = window.location.pathname;
  const adjustedPathname = pathname.startsWith(base)
    ? pathname.slice(base.length) || "/"
    : pathname;

  return {
    pathname: adjustedPathname,
    search: window.location.search,
    hash: window.location.hash,
    params: {},
    searchParams: new URLSearchParams(window.location.search),
  };
}

/** Cleanup router state and event listeners */
function cleanupRouter(): void {
  if (popstateHandler) {
    window.removeEventListener("popstate", popstateHandler);
    popstateHandler = null;
  }
  if (clickHandler) {
    document.removeEventListener("click", clickHandler);
    clickHandler = null;
  }
  routerState = null;
}

/** Initialize the router */
function initRouter(config: RouterConfig): () => void {
  // Clean up any existing router first
  cleanupRouter();

  const base = config.base || "";
  const [location, setLocation] = useState<Location>(parseLocation(base));
  const [params, setParams] = useState<Params>({});
  const [matchedRoutes, setMatchedRoutes] = useState<RouteDefinition[]>([]);
  const [loaderData, setLoaderData] = useState<unknown[]>([]);

  routerState = {
    location,
    setLocation,
    params,
    setParams,
    matchedRoutes,
    setMatchedRoutes,
    loaderData,
    setLoaderData,
    config,
    loaderCache: new Map(),
    base,
  };

  // Listen for popstate (back/forward)
  popstateHandler = () => {
    if (routerState) {
      routerState.setLocation(parseLocation(base));
    }
  };
  window.addEventListener("popstate", popstateHandler);

  // Intercept link clicks for SPA navigation
  clickHandler = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest("a");
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    // Skip external links, downloads, new tabs, modifier keys
    if (
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      e.button !== 0 ||
      anchor.hasAttribute("download") ||
      anchor.getAttribute("target") === "_blank" ||
      anchor.getAttribute("rel")?.includes("external") ||
      href.startsWith("http://") ||
      href.startsWith("https://") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("#")
    ) {
      return;
    }

    e.preventDefault();
    navigate(href);
  };
  document.addEventListener("click", clickHandler);

  // Return cleanup function
  return cleanupRouter;
}

// ============================================================================
// Navigation
// ============================================================================

/** Navigate to a new path */
export function navigate(to: string, options: { replace?: boolean; state?: unknown } = {}): void {
  if (!routerState) {
    throw new Error("Router not initialized. Use <Router> component first.");
  }

  const base = routerState.config.base || "";
  const fullPath = to.startsWith("/") ? base + to : to;

  if (options.replace) {
    window.history.replaceState(options.state ?? null, "", fullPath);
  } else {
    window.history.pushState(options.state ?? null, "", fullPath);
  }

  // Parse and set new location
  const url = new URL(fullPath, window.location.origin);
  const pathname = url.pathname.startsWith(base)
    ? url.pathname.slice(base.length) || "/"
    : url.pathname;

  const newLocation: Location = {
    pathname,
    search: url.search,
    hash: url.hash,
    params: {},
    searchParams: new URLSearchParams(url.search),
  };

  routerState.setLocation(newLocation);
}

// ============================================================================
// Hooks
// ============================================================================

/** Get current location */
export function useLocation(): () => Location {
  if (!routerState) {
    throw new Error("Router not initialized. Use <Router> component first.");
  }
  return routerState.location;
}

/** Get current route params */
export function useParams<P extends Params = Params>(): () => P {
  if (!routerState) {
    throw new Error("Router not initialized. Use <Router> component first.");
  }
  return routerState.params as () => P;
}

/** Get current search params */
export function useSearchParams(): [
  () => SearchParams,
  (params: Record<string, string> | ((prev: SearchParams) => Record<string, string>)) => void,
] {
  const location = useLocation();

  const getSearchParams = () => location().searchParams;

  const setSearchParams = (
    params: Record<string, string> | ((prev: SearchParams) => Record<string, string>),
  ) => {
    const current = location().searchParams;
    const newParams = typeof params === "function" ? params(current) : params;
    const searchString = new URLSearchParams(newParams).toString();
    const search = searchString ? `?${searchString}` : "";
    navigate(location().pathname + search, { replace: true });
  };

  return [getSearchParams, setSearchParams];
}

/** Get navigate function */
export function useNavigate(): typeof navigate {
  return navigate;
}

// ============================================================================
// Loader Execution
// ============================================================================

/** Cache key for loader */
function loaderCacheKey(path: string, params: Params, search: string): string {
  return `${path}:${JSON.stringify(params)}:${search}`;
}

/** Execute loader with caching */
async function executeLoader<T>(
  route: RouteDefinition<T>,
  params: Params,
  searchParams: SearchParams,
  signal: AbortSignal,
): Promise<T | undefined> {
  if (!route.loader) return undefined;
  if (!routerState) return undefined;

  const cacheKey = loaderCacheKey(route.path, params, searchParams.toString());
  const cached = routerState.loaderCache.get(cacheKey);

  // Return cached if fresh (5 seconds)
  if (cached && Date.now() - cached.timestamp < 5000) {
    return cached.data as T;
  }

  const data = await route.loader({ params, searchParams, signal });

  routerState.loaderCache.set(cacheKey, { data, timestamp: Date.now() });

  return data;
}

// ============================================================================
// Components
// ============================================================================

interface LinkProps {
  href: string;
  replace?: boolean;
  class?: string;
  children?: Child;
}

/** Link component for SPA navigation */
export function Link(props: LinkProps): JSXElement {
  const handleClick = (e: MouseEvent) => {
    if (props.replace) {
      e.preventDefault();
      navigate(props.href, { replace: true });
    }
    // Normal clicks are handled by the global click handler
  };

  return (
    <a href={props.href} class={props.class} onClick={handleClick}>
      {props.children}
    </a>
  );
}

interface NavLinkProps {
  href: string;
  class?: string;
  activeClass?: string;
  exact?: boolean;
  children?: Child;
}

/** NavLink - link with active state */
export function NavLink(props: NavLinkProps): JSXElement {
  const location = useLocation();

  // Use useMemo for reactive class computation
  const className = useMemo(() => {
    const loc = location();
    const isActive = props.exact
      ? loc.pathname === props.href
      : loc.pathname.startsWith(props.href);

    const classes: string[] = [];
    if (props.class) classes.push(props.class);
    if (isActive && props.activeClass) classes.push(props.activeClass);

    return classes.join(" ");
  });

  return (
    <a href={props.href} class={() => className()}>
      {props.children}
    </a>
  );
}

/**
 * Router outlet - renders matched route at current level
 *
 * Each Outlet independently subscribes to route changes at its level.
 * Parent layouts persist when only child routes change.
 *
 * Use <Outlet /> inside layout components to render child routes:
 * ```tsx
 * function Layout() {
 *   return (
 *     <div>
 *       <nav>...</nav>
 *       <Outlet />  // Child routes render here
 *     </div>
 *   );
 * }
 * ```
 */
export function Outlet(): JSXElement {
  const [startMarker, endMarker] = createMarkerPair("Outlet");

  const fragment = document.createDocumentFragment();
  fragment.appendChild(startMarker);
  fragment.appendChild(endMarker);

  if (!routerState) {
    insertNodes(endMarker, [document.createTextNode("Router not initialized")]);
    return fragment;
  }

  // Get our level from context (0 for root outlet)
  const levelGetter = useContext(OutletLevelContext);
  const level = levelGetter();

  // Track the previous route path at this level to detect changes
  let prevRoutePath: string | null = null;
  let currentNodes: Node[] = [];

  // Helper to render the current route
  const renderRoute = () => {
    // Read matchedRoutes directly to establish dependency tracking
    const routes = routerState?.matchedRoutes() ?? [];
    const allData = routerState?.loaderData() ?? [];
    const params = routerState?.params() ?? {};

    // Get route at our level
    const route = level < routes.length ? routes[level] : null;
    const data = level < allData.length ? allData[level] : undefined;

    // Check if the route at this level actually changed
    const currentRoutePath = route?.path ?? null;

    if (currentRoutePath === prevRoutePath && currentNodes.length > 0) {
      // Route at this level hasn't changed - don't re-render
      return;
    }

    prevRoutePath = currentRoutePath;

    // Clear current content at this level
    clearRange(startMarker, endMarker);
    currentNodes = [];

    if (!route) {
      // No route at this level - show fallback if root, nothing if nested
      if (level === 0 && routerState?.config.fallback) {
        const fallbackNodes = childToNodes(routerState?.config.fallback());
        insertNodes(endMarker, fallbackNodes);
        currentNodes = fallbackNodes;
      } else if (level === 0) {
        const textNode = document.createTextNode("404 - Not Found");
        insertNodes(endMarker, [textNode]);
        currentNodes = [textNode];
      }
      return;
    }

    // Render the route component with level+1 context for nested outlets
    const RouteComp = route.component as (props: RouteComponentProps) => Child;
    const content = (
      <OutletLevelContext.Provider value={() => level + 1}>
        {() =>
          RouteComp({
            params,
            data,
            children: undefined,
          })
        }
      </OutletLevelContext.Provider>
    );

    const nodes = childToNodes(content);
    insertNodes(endMarker, nodes);
    currentNodes = nodes;
  };

  // Use queueMicrotask to defer effect creation to outside any parent effect context
  // This ensures this outlet's effect is truly independent
  queueMicrotask(() => {
    useEffect(renderRoute);
  });

  // Only do initial render synchronously if routes are already available
  // (avoids 404 flash when Router effect hasn't run yet)
  if (routerState.matchedRoutes().length > 0) {
    renderRoute();
  }

  return fragment;
}

interface RouterProps {
  config: RouterConfig;
  children?: Child;
}

/** Main Router component */
export function Router(props: RouterProps): JSXElement {
  const cleanup = initRouter(props.config);

  // Register cleanup when router unmounts
  onCleanup(cleanup);

  let currentController: AbortController | null = null;

  // Cleanup abort controller
  onCleanup(() => {
    if (currentController) {
      currentController.abort();
      currentController = null;
    }
  });

  // Effect to match routes and load data when location changes
  useEffect(() => {
    if (!routerState) return;

    const loc = routerState.location();

    // Cancel previous loaders
    if (currentController) {
      currentController.abort();
    }
    currentController = new AbortController();
    const signal = currentController.signal;

    const match = matchRoutes(loc.pathname, routerState.config.routes);

    if (!match) {
      // No match - clear routes (Outlet will show 404)
      batch(() => {
        routerState?.setMatchedRoutes([]);
        routerState?.setLoaderData([]);
        routerState?.setParams({});
      });
      return;
    }

    // Build route chain
    const allRoutes = [...match.parents, match.route];

    // Load data for all routes in parallel
    const loadData = async () => {
      const loaderPromises = allRoutes.map((route) =>
        executeLoader(route, match.params, loc.searchParams, signal),
      );

      try {
        const results = await Promise.all(loaderPromises);
        if (signal.aborted) return;

        // Update routes, data, and params atomically - this triggers Outlet effects
        batch(() => {
          routerState?.setMatchedRoutes(allRoutes);
          routerState?.setLoaderData(results);
          routerState?.setParams(match.params);
        });
      } catch (err) {
        if (signal.aborted) return;
        console.error("Router loader error:", err);
        // Still set routes so UI can show error state
        batch(() => {
          routerState?.setMatchedRoutes(allRoutes);
          routerState?.setLoaderData(allRoutes.map(() => undefined));
          routerState?.setParams(match.params);
        });
      }
    };

    // For routes without loaders, update immediately
    const hasLoaders = allRoutes.some((r) => r.loader);
    if (!hasLoaders) {
      batch(() => {
        routerState?.setMatchedRoutes(allRoutes);
        routerState?.setLoaderData(allRoutes.map(() => undefined));
        routerState?.setParams(match.params);
      });
    } else {
      loadData();
    }
  });

  // Return outlet or children
  if (props.children) {
    return <Fragment>{props.children}</Fragment>;
  }

  return <Outlet />;
}

// ============================================================================
// Route Definition Helpers (for type inference)
// ============================================================================

/**
 * Type-safe route builder with inference from loader return type
 *
 * @example
 * ```tsx
 * // Route with loader - data type inferred from loader
 * const usersRoute = route({
 *   path: "/users",
 *   loader: async () => {
 *     const users = await fetchUsers();
 *     return { users, total: users.length };
 *   },
 *   component: (props) => <UsersList data={props.data} />
 * });
 *
 * // Route without loader - no data prop needed
 * const homeRoute = route({
 *   path: "/",
 *   component: () => <Home />
 * });
 *
 * // Route with children (layout)
 * const dashboardRoute = route({
 *   path: "/dashboard",
 *   component: (props) => <Layout>{props.children}</Layout>,
 *   children: [usersRoute, homeRoute]
 * });
 * ```
 */
export function route<T, P extends Params = Params>(
  definition: RouteDefinition<T, P>,
): RouteDefinition<T, P> {
  return definition;
}

/** @deprecated Use `route()` instead */
export function defineRoute<T, P extends Params = Params>(
  definition: RouteDefinition<T, P>,
): RouteDefinition<T, P> {
  return definition;
}

/**
 * Define routes array - automatically widens types for mixed route array
 * For better type inference on individual routes, use route() for each
 */
export function defineRoutes(
  routes: RouteDefinition<unknown, Params>[],
): RouteDefinition<unknown, Params>[] {
  return routes;
}

// ============================================================================
// Utility: Redirect
// ============================================================================

interface RedirectProps {
  to: string;
  replace?: boolean;
}

/** Redirect component - navigates on render, returns null (renders nothing) */
export function Redirect(props: RedirectProps): null {
  useEffect(() => {
    navigate(props.to, { replace: props.replace ?? true });
  });
  return null;
}
