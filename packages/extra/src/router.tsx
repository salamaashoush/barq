/**
 * barq-router - Minimal type-safe router with loaders, layouts, and search params
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
  createScope,
  insertNodes,
  onCleanup,
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
  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)\*/g, (_: string, name: string) => {
    paramNames.push(name);
    return "(.*)";
  });

  // Replace :param+ (one or more segments)
  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)\+/g, (_: string, name: string) => {
    paramNames.push(name);
    return "(.+)";
  });

  // Replace :param? (optional param - single segment)
  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)\?/g, (_: string, name: string) => {
    paramNames.push(name);
    return "([^/]*)";
  });

  // Replace :param (required param - single segment)
  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_: string, name: string) => {
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

      if (exactMatch && route.children) {
        // Exact match on layout route - look for index child route ("/")
        const indexMatch = matchRoutes("/", route.children, [...parents, route]);
        if (indexMatch) {
          return {
            ...indexMatch,
            params: { ...exactMatch, ...indexMatch.params },
          };
        }
        // No index route - just render the layout
        return { route, params: exactMatch, parents };
      }

      if (exactMatch) {
        // Exact match on leaf layout route (no children matched)
        return { route, params: exactMatch, parents };
      }

      if (prefixMatch && route.children) {
        // Prefix match - try to match children
        let childPathname = pathname.slice(route.path.length) || "/";
        // Ensure child pathname has leading slash (handles root "/" case)
        if (!childPathname.startsWith("/")) {
          childPathname = `/${childPathname}`;
        }
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
  // Navigate function for this router instance
  navigate: (to: string, options?: { replace?: boolean; state?: unknown }) => void;
}

// Global router state - for the main browser router
let globalRouterState: RouterState | null = null;

// Event listener cleanup references
let popstateHandler: (() => void) | null = null;
let clickHandler: ((e: MouseEvent) => void) | null = null;

// ============================================================================
// Router Context - for nested/memory routers
// ============================================================================

// Context holds the current router state (null means use global)
const RouterContext = createContext<RouterState | null>(null);

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

/** Cleanup global router state and event listeners */
function cleanupGlobalRouter(): void {
  if (popstateHandler) {
    window.removeEventListener("popstate", popstateHandler);
    popstateHandler = null;
  }
  if (clickHandler) {
    document.removeEventListener("click", clickHandler);
    clickHandler = null;
  }
  globalRouterState = null;
}

/** Create a location object from a path string */
function createLocation(pathname: string, search = "", hash = ""): Location {
  return {
    pathname,
    search,
    hash,
    params: {},
    searchParams: new URLSearchParams(search),
  };
}

/** Initialize the global browser router */
function initBrowserRouter(config: RouterConfig): RouterState {
  const base = config.base || "";
  const [location, setLocation] = useState<Location>(parseLocation(base));
  const [params, setParams] = useState<Params>({});
  const [matchedRoutes, setMatchedRoutes] = useState<RouteDefinition[]>([]);
  const [loaderData, setLoaderData] = useState<unknown[]>([]);

  // Navigation function for browser router
  const browserNavigate = (to: string, options: { replace?: boolean; state?: unknown } = {}) => {
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

    setLocation(createLocation(pathname, url.search, url.hash));
  };

  const state: RouterState = {
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
    navigate: browserNavigate,
  };

  return state;
}

/** Initialize a memory router (isolated, no browser history) */
function initMemoryRouter(config: RouterConfig, initialPath: string): RouterState {
  const base = config.base || "";
  const [location, setLocation] = useState<Location>(createLocation(initialPath));
  const [params, setParams] = useState<Params>({});
  const [matchedRoutes, setMatchedRoutes] = useState<RouteDefinition[]>([]);
  const [loaderData, setLoaderData] = useState<unknown[]>([]);

  // Navigation function for memory router - only updates internal state
  const memoryNavigate = (to: string, _options: { replace?: boolean; state?: unknown } = {}) => {
    // Parse the path
    const url = new URL(to, "http://localhost");
    const pathname = url.pathname.startsWith(base)
      ? url.pathname.slice(base.length) || "/"
      : url.pathname;

    setLocation(createLocation(pathname, url.search, url.hash));
  };

  const state: RouterState = {
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
    navigate: memoryNavigate,
  };

  return state;
}

/** Setup global browser event listeners */
function setupBrowserListeners(state: RouterState): () => void {
  const base = state.base;

  // Listen for popstate (back/forward)
  popstateHandler = () => {
    state.setLocation(parseLocation(base));
  };
  window.addEventListener("popstate", popstateHandler);

  // Intercept link clicks for SPA navigation
  clickHandler = (e: MouseEvent) => {
    // Skip if already handled by another router (e.g., MemoryRouter)
    if (e.defaultPrevented) return;

    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
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
    state.navigate(href);
  };
  document.addEventListener("click", clickHandler);

  // Return cleanup function
  return cleanupGlobalRouter;
}

// ============================================================================
// Navigation
// ============================================================================

/** Navigate to a new path (uses global router) */
export function navigate(to: string, options: { replace?: boolean; state?: unknown } = {}): void {
  if (!globalRouterState) {
    throw new Error("Router not initialized. Use <Router> component first.");
  }
  globalRouterState.navigate(to, options);
}

// ============================================================================
// Hooks
// ============================================================================

/** Get current router state from context or global */
function useRouterState(): RouterState {
  // Try to get from context first (for MemoryRouter)
  const contextState = useContext(RouterContext);
  const state = contextState() || globalRouterState;

  if (!state) {
    throw new Error("Router not initialized. Use <Router> or <MemoryRouter> component first.");
  }
  return state;
}

/** Get current location */
export function useLocation(): () => Location {
  const state = useRouterState();
  return state.location;
}

/** Get current route params */
export function useParams<P extends Params = Params>(): () => P {
  const state = useRouterState();
  return state.params as () => P;
}

/** Get current search params */
export function useSearchParams(): [
  () => SearchParams,
  (params: Record<string, string> | ((prev: SearchParams) => Record<string, string>)) => void,
] {
  const state = useRouterState();
  const location = state.location;

  const getSearchParams = () => location().searchParams;

  const setSearchParams = (
    params: Record<string, string> | ((prev: SearchParams) => Record<string, string>),
  ) => {
    const current = location().searchParams;
    const newParams = typeof params === "function" ? params(current) : params;
    const searchString = new URLSearchParams(newParams).toString();
    const search = searchString ? `?${searchString}` : "";
    state.navigate(location().pathname + search, { replace: true });
  };

  return [getSearchParams, setSearchParams];
}

/** Get navigate function for current router */
export function useNavigate(): (
  to: string,
  options?: { replace?: boolean; state?: unknown },
) => void {
  const state = useRouterState();
  return state.navigate;
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
  state: RouterState,
  route: RouteDefinition<T>,
  params: Params,
  searchParams: SearchParams,
  signal: AbortSignal,
): Promise<T | undefined> {
  if (!route.loader) return undefined;

  const cacheKey = loaderCacheKey(route.path, params, searchParams.toString());
  const cached = state.loaderCache.get(cacheKey);

  // Return cached if fresh (5 seconds)
  if (cached && Date.now() - cached.timestamp < 5000) {
    return cached.data as T;
  }

  const data = await route.loader({ params, searchParams, signal });

  state.loaderCache.set(cacheKey, { data, timestamp: Date.now() });

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
  // Get navigate at render time - captures the current router context
  const state = useRouterState();

  const handleClick = (e: MouseEvent) => {
    // Skip if modifier keys or not left click
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    e.stopPropagation(); // Stop event from bubbling to document handler
    state.navigate(props.href, { replace: props.replace });
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
  const state = useRouterState();

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

  const handleClick = (e: MouseEvent) => {
    // Skip if modifier keys or not left click
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    e.stopPropagation(); // Stop event from bubbling to document handler
    state.navigate(props.href);
  };

  return (
    <a href={props.href} class={() => className()} onClick={handleClick}>
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

  // Get router state from context or global
  const contextState = useContext(RouterContext);
  const state = contextState() || globalRouterState;

  if (!state) {
    insertNodes(endMarker, [document.createTextNode("Router not initialized")]);
    return fragment;
  }

  // Get our level from context (0 for root outlet)
  const levelGetter = useContext(OutletLevelContext);
  const level = levelGetter();

  // Track the previous route path at this level to detect changes
  let prevRoutePath: string | null = null;
  let currentNodes: Node[] = [];
  // Track dispose function for current route's reactive scope
  let disposeCurrentRoute: (() => void) | null = null;

  // Helper to render the current route
  const renderRoute = () => {
    // Read matchedRoutes directly to establish dependency tracking
    const routes = state.matchedRoutes();
    const allData = state.loaderData();
    const params = state.params();

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

    // Dispose previous route's effects before clearing DOM
    if (disposeCurrentRoute) {
      disposeCurrentRoute();
      disposeCurrentRoute = null;
    }

    // Clear current content at this level
    clearRange(startMarker, endMarker);
    currentNodes = [];

    if (!route) {
      // No route at this level - show fallback if root, nothing if nested
      if (level === 0 && state.config.fallback) {
        const fallbackNodes = childToNodes(state.config.fallback());
        insertNodes(endMarker, fallbackNodes);
        currentNodes = fallbackNodes;
      } else if (level === 0) {
        const textNode = document.createTextNode("404 - Not Found");
        insertNodes(endMarker, [textNode]);
        currentNodes = [textNode];
      }
      return;
    }

    // Render the route component inside a scope so its effects can be disposed
    // when the route changes. This prevents orphaned effects from accumulating.
    const RouteComp = route.component as (props: RouteComponentProps) => Child;

    createScope((dispose) => {
      disposeCurrentRoute = dispose;

      // Render with proper context for nested outlets
      // Must wrap in RouterContext.Provider so Links/NavLinks inside get the correct router
      const content = (
        <RouterContext.Provider value={() => state}>
          {() => (
            <OutletLevelContext.Provider value={() => level + 1}>
              {() =>
                RouteComp({
                  params,
                  data,
                  children: undefined,
                })
              }
            </OutletLevelContext.Provider>
          )}
        </RouterContext.Provider>
      );

      const nodes = childToNodes(content);
      insertNodes(endMarker, nodes);
      currentNodes = nodes;
    });
  };

  // Use queueMicrotask to defer effect creation to outside any parent effect context
  // This ensures this outlet's effect is truly independent
  queueMicrotask(() => {
    useEffect(renderRoute);
  });

  // Only do initial render synchronously if routes are already available
  // (avoids 404 flash when Router effect hasn't run yet)
  if (state.matchedRoutes().length > 0) {
    renderRoute();
  }

  return fragment;
}

interface RouterProps {
  config: RouterConfig;
  children?: Child;
}

/** Shared route matching effect logic */
function useRouteMatching(state: RouterState): void {
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
    const loc = state.location();

    // Cancel previous loaders
    if (currentController) {
      currentController.abort();
    }
    currentController = new AbortController();
    const signal = currentController.signal;

    const match = matchRoutes(loc.pathname, state.config.routes);

    if (!match) {
      // No match - clear routes (Outlet will show 404)
      batch(() => {
        state.setMatchedRoutes([]);
        state.setLoaderData([]);
        state.setParams({});
      });
      return;
    }

    // Build route chain
    const allRoutes = [...match.parents, match.route];

    // Load data for all routes in parallel
    const loadData = async () => {
      const loaderPromises = allRoutes.map((route) =>
        executeLoader(state, route, match.params, loc.searchParams, signal),
      );

      try {
        const results = await Promise.all(loaderPromises);
        if (signal.aborted) return;

        // Update routes, data, and params atomically - this triggers Outlet effects
        batch(() => {
          state.setMatchedRoutes(allRoutes);
          state.setLoaderData(results);
          state.setParams(match.params);
        });
      } catch (err) {
        if (signal.aborted) return;
        console.error("Router loader error:", err);
        // Still set routes so UI can show error state
        batch(() => {
          state.setMatchedRoutes(allRoutes);
          state.setLoaderData(allRoutes.map(() => undefined));
          state.setParams(match.params);
        });
      }
    };

    // For routes without loaders, update immediately
    const hasLoaders = allRoutes.some((r) => r.loader);
    if (!hasLoaders) {
      batch(() => {
        state.setMatchedRoutes(allRoutes);
        state.setLoaderData(allRoutes.map(() => undefined));
        state.setParams(match.params);
      });
    } else {
      void loadData();
    }
  });
}

/**
 * Main Router component - uses browser history
 *
 * Use this for your main application router. Only one Router should exist
 * at the root of your app. For embedded routing demos or isolated routing,
 * use MemoryRouter instead.
 */
export function Router(props: RouterProps): JSXElement {
  // Clean up any existing global router
  cleanupGlobalRouter();

  // Initialize browser router state
  const state = initBrowserRouter(props.config);
  globalRouterState = state;

  // Setup browser event listeners
  const cleanup = setupBrowserListeners(state);
  onCleanup(cleanup);

  // Setup route matching
  useRouteMatching(state);

  // Return outlet or children
  if (props.children) {
    return <Fragment>{props.children}</Fragment>;
  }

  return <Outlet />;
}

interface MemoryRouterProps {
  config: RouterConfig;
  /** Initial path for the memory router (defaults to "/") */
  initialPath?: string;
  children?: Child;
}

/**
 * Memory Router - isolated router that doesn't affect browser URL
 *
 * Use this for:
 * - Embedded routing demos
 * - Testing
 * - Isolated routing areas within a page
 *
 * The MemoryRouter maintains its own internal location state and doesn't
 * interact with browser history. Multiple MemoryRouters can coexist.
 *
 * @example
 * ```tsx
 * // Embedded routing demo
 * <MemoryRouter
 *   initialPath="/dashboard"
 *   config={{ routes: demoRoutes }}
 * />
 * ```
 */
export function MemoryRouter(props: MemoryRouterProps): JSXElement {
  const initialPath = props.initialPath || "/";

  // Initialize memory router state
  const state = initMemoryRouter(props.config, initialPath);

  // Do initial route match synchronously so first render has routes
  const initialMatch = matchRoutes(initialPath, state.config.routes);
  if (initialMatch) {
    const allRoutes = [...initialMatch.parents, initialMatch.route];
    batch(() => {
      state.setMatchedRoutes(allRoutes);
      state.setLoaderData(allRoutes.map(() => undefined));
      state.setParams(initialMatch.params);
    });
  }

  // Setup route matching for future navigations
  useRouteMatching(state);

  // Provide state via context so hooks and Outlet use this router
  // Also reset OutletLevelContext to 0 so nested Outlets start fresh
  // NOTE: Must use function children for RouterContext.Provider so inner JSX
  // is evaluated AFTER the context is pushed onto the stack
  return (
    <RouterContext.Provider value={() => state}>
      {() => (
        <OutletLevelContext.Provider value={() => 0}>
          {() => (props.children ? <Fragment>{props.children}</Fragment> : <Outlet />)}
        </OutletLevelContext.Provider>
      )}
    </RouterContext.Provider>
  );
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
export function defineRoutes(routes: RouteDefinition[]): RouteDefinition[] {
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
