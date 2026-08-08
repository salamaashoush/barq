/**
 * barq-router - Minimal type-safe router with loaders, layouts, and search params
 *
 * Features:
 * - Type-safe route definitions with path parameter inference
 * - Path params and search params
 * - Route loaders with configurable caching
 * - Nested layouts with <Outlet />
 * - History API integration
 * - Fine-grained reactivity via signals
 * - Scroll restoration
 * - View Transitions API support
 * - Route guards (config and route level)
 * - Link prefetching
 * - Relative navigation
 * - Loading states
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
// Debug Mode
// ============================================================================

let DEBUG_MODE = false;

/** Enable or disable router debug logging */
export function setRouterDebugMode(enabled: boolean): void {
  DEBUG_MODE = enabled;
}

function debug(...args: unknown[]): void {
  if (DEBUG_MODE) console.log("[barq-router]", ...args);
}

// ============================================================================
// Type-Safe Path Parameter Types
// ============================================================================

/**
 * Extract parameter names from a path string at compile time
 *
 * @example
 * ExtractRouteParams<"/users/:id/posts/:postId"> = "id" | "postId"
 * ExtractRouteParams<"/files/*"> = "*"
 * ExtractRouteParams<"/docs/:path*"> = "path"
 */
export type ExtractRouteParams<Path extends string> =
  // Named splat :param*
  Path extends `${infer _Start}:${infer Param}*${infer Rest}`
    ? Param | ExtractRouteParams<Rest>
    : // One or more :param+
      Path extends `${infer _Start}:${infer Param}+${infer Rest}`
      ? Param | ExtractRouteParams<Rest>
      : // Optional :param?
        Path extends `${infer _Start}:${infer Param}?${infer Rest}`
        ? Param | ExtractRouteParams<Rest>
        : // Required :param followed by /
          Path extends `${infer _Start}:${infer Param}/${infer Rest}`
          ? Param | ExtractRouteParams<`/${Rest}`>
          : // Required :param at end
            Path extends `${infer _Start}:${infer Param}`
            ? Param
            : // Standalone wildcard *
              Path extends `${infer _Start}*${infer Rest}`
              ? "*" | ExtractRouteParams<Rest>
              : never;

/**
 * Create a params object type from extracted param names
 */
export type PathParams<Path extends string> = {
  [K in ExtractRouteParams<Path>]: string;
};

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

/** Navigation guard context */
export interface NavigationGuardContext {
  from: Location;
  to: Location;
  params: Params;
}

/**
 * Navigation guard function
 * Return true to allow, false to block, or a string to redirect
 */
export type NavigationGuard = (
  ctx: NavigationGuardContext,
) => boolean | string | Promise<boolean | string>;

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
export type RouteComponent<T = unknown, P extends Params = Params> = (
  props: RouteComponentProps<T, P>,
) => Child;

/** Error boundary component props */
export interface ErrorBoundaryProps {
  error: Error;
  reset: () => void;
}

/** Route definition - use `route()` helper for type-safe route creation */
export interface RouteDefinition<T = unknown, P extends Params = Params> {
  path: string;
  component: RouteComponent<T, P>;
  loader?: Loader<T, P>;
  children?: RouteDefinition[];
  /** Route-level navigation guard */
  beforeEnter?: NavigationGuard;
  /** Route-level error element */
  errorElement?: (props: ErrorBoundaryProps) => Child;
}

/** Matched route with extracted params */
interface MatchedRoute<T = unknown> {
  route: RouteDefinition<T>;
  params: Params;
  /** Parent routes for layout rendering */
  parents: RouteDefinition[];
}

/** Cache configuration */
export interface CacheConfig {
  /** Cache TTL in milliseconds (default: 5000) */
  ttl: number;
  /** Maximum cache entries (default: 100) */
  maxSize: number;
}

/** Scroll restoration configuration */
export interface ScrollRestorationConfig {
  /** Enable scroll restoration (default: true) */
  enabled: boolean;
  /** Scroll behavior (default: "auto") */
  behavior: ScrollBehavior;
}

/** View transitions configuration */
export interface ViewTransitionConfig {
  /** Enable view transitions (default: false) */
  enabled: boolean;
  /** Callback when transition starts */
  onTransitionStart?: () => void;
  /** Callback when transition ends */
  onTransitionEnd?: () => void;
}

/** Prefetch configuration */
export interface PrefetchConfig {
  /** Prefetch strategy (default: "none") */
  strategy: "hover" | "visible" | "none";
  /** Delay before prefetch on hover in ms (default: 100) */
  hoverDelay?: number;
}

/** Router configuration */
export interface RouterConfig {
  routes: RouteDefinition[];
  /** Base path for all routes (e.g., "/app") */
  base?: string;
  /** Fallback component for 404 */
  fallback?: () => Child;
  /** Cache configuration */
  cache?: Partial<CacheConfig>;
  /** Scroll restoration configuration */
  scrollRestoration?: Partial<ScrollRestorationConfig>;
  /** View transitions configuration */
  viewTransitions?: ViewTransitionConfig;
  /** Default prefetch configuration */
  prefetch?: PrefetchConfig;
  /** Config-level navigation guards (run for all routes) */
  beforeEach?: NavigationGuard[];
  /** Config-level after navigation hooks */
  afterEach?: ((ctx: NavigationGuardContext) => void)[];
  /** Global loading element */
  loadingElement?: () => Child;
  /** Minimum loading time in ms to prevent flicker */
  loadingMinTime?: number;
}

/** Navigate options */
export interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
  /** Skip scroll restoration */
  noScroll?: boolean;
}

// ============================================================================
// Path Matching - with Memoization
// ============================================================================

interface PathPattern {
  regex: RegExp;
  paramNames: string[];
  path: string;
}

/** Memoization cache for compiled path patterns */
const compiledPathCache = new Map<string, PathPattern>();

/** Clear the path compilation cache (useful for testing) */
export function clearPathCache(): void {
  compiledPathCache.clear();
}

/**
 * Compile a path pattern to regex (memoized)
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
export function compilePath(path: string): PathPattern {
  // Check cache first
  const cached = compiledPathCache.get(path);
  if (cached) return cached;

  const paramNames: string[] = [];

  // Use placeholders to avoid regex replacement conflicts
  const SPLAT_PLACEHOLDER = "\x00SPLAT\x00";
  const PLUS_PLACEHOLDER = "\x00PLUS\x00";
  const OPT_PLACEHOLDER = "\x00OPT\x00";
  const PARAM_PLACEHOLDER = "\x00PARAM\x00";
  const WILD_PLACEHOLDER = "\x00WILD\x00";

  // Escape special regex chars except : * + ?
  let pattern = path.replace(/[.^${}()|[\]\\]/g, "\\$&");

  // Replace :param* (named splat - captures rest including slashes)
  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)\*/g, (_: string, name: string) => {
    paramNames.push(name);
    return SPLAT_PLACEHOLDER;
  });

  // Replace :param+ (one or more segments)
  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)\+/g, (_: string, name: string) => {
    paramNames.push(name);
    return PLUS_PLACEHOLDER;
  });

  // Replace :param? (optional param - single segment)
  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)\?/g, (_: string, name: string) => {
    paramNames.push(name);
    return OPT_PLACEHOLDER;
  });

  // Replace :param (required param - single segment)
  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_: string, name: string) => {
    paramNames.push(name);
    return PARAM_PLACEHOLDER;
  });

  // Replace standalone * with wildcard capture (catch-all)
  // Now safe since all :param* patterns have been replaced with placeholders
  pattern = pattern.replace(/\*/g, () => {
    paramNames.push("*");
    return WILD_PLACEHOLDER;
  });

  // Replace placeholders with actual regex patterns
  pattern = pattern.split(SPLAT_PLACEHOLDER).join("(.*)");
  pattern = pattern.split(PLUS_PLACEHOLDER).join("(.+)");
  pattern = pattern.split(OPT_PLACEHOLDER).join("([^/]*)");
  pattern = pattern.split(PARAM_PLACEHOLDER).join("([^/]+)");
  pattern = pattern.split(WILD_PLACEHOLDER).join("(.*)");

  // Exact match (no trailing content unless it's a layout route)
  const regex = new RegExp(`^${pattern}$`);

  const compiled: PathPattern = { regex, paramNames, path };
  compiledPathCache.set(path, compiled);
  return compiled;
}

/** Match a pathname against a pattern */
export function matchPath(pathname: string, pattern: PathPattern): Params | null {
  const match = pathname.match(pattern.regex);
  if (!match) return null;

  const params: Params = {};
  pattern.paramNames.forEach((name, i) => {
    params[name] = match[i + 1];
  });

  return params;
}

/** Match pathname against routes, returning matched route chain */
export function matchRoutes(
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

/** Precompile all route patterns recursively */
function precompileRoutes(routes: RouteDefinition[]): void {
  for (const route of routes) {
    compilePath(route.path);
    // Also compile prefix pattern for layout routes
    if (route.children && route.children.length > 0) {
      compilePath(route.path.endsWith("/") ? `${route.path}*` : `${route.path}/*`);
      precompileRoutes(route.children);
    }
  }
}

// ============================================================================
// Router Registry (replaces global mutable state)
// ============================================================================

interface RouterState {
  id: string;
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
  // Error for each route in chain
  routeErrors: () => (Error | null)[];
  setRouteErrors: (errors: (Error | null)[]) => void;
  config: RouterConfig;
  loaderCache: Map<string, { data: unknown; timestamp: number }>;
  base: string;
  // Navigate function for this router instance
  navigate: (to: string, options?: NavigateOptions) => Promise<void>;
  // Abort controller for cleanup
  abortController: AbortController;
  // Monotonic navigation sequence: only the latest navigation may commit
  navSeq: number;
  // Abort controller for the in-flight navigation (superseded navs abort)
  navAbort: AbortController | null;
  // A view transition is currently animating (joins instead of skipping)
  transitionInFlight: boolean;
  // Loading state
  isLoading: () => boolean;
  setIsLoading: (loading: boolean) => void;
  // Scroll positions for restoration
  scrollPositions: Map<string, { x: number; y: number }>;
  // Prefetch cache
  prefetchCache: Set<string>;
}

// Router registry - allows multiple routers with proper cleanup
const routerRegistry = new Map<string, RouterState>();
let routerIdCounter = 0;

// The "main" browser router (for backward compatibility with navigate())
let mainBrowserRouterId: string | null = null;

function generateRouterId(): string {
  return `router-${++routerIdCounter}`;
}

function registerRouter(state: RouterState): void {
  routerRegistry.set(state.id, state);
}

function unregisterRouter(id: string): void {
  const state = routerRegistry.get(id);
  if (state) {
    state.abortController.abort();
    routerRegistry.delete(id);
    if (mainBrowserRouterId === id) {
      mainBrowserRouterId = null;
    }
  }
}

function getMainBrowserRouter(): RouterState | null {
  if (!mainBrowserRouterId) return null;
  return routerRegistry.get(mainBrowserRouterId) || null;
}

// ============================================================================
// Router Context
// ============================================================================

// Context holds the current router state (null means use main browser router)
const RouterContext = createContext<RouterState | null>(null);

// Context tracks the current outlet level
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

/** Parse a full path into pathname, search, and hash components */
function parsePath(path: string): { pathname: string; search: string; hash: string } {
  let pathname = path;
  let search = "";
  let hash = "";

  // Extract hash first
  const hashIndex = pathname.indexOf("#");
  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex);
  }

  // Extract search/query string
  const searchIndex = pathname.indexOf("?");
  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex);
  }

  return { pathname, search, hash };
}

/** Resolve a relative path against a base path */
export function resolvePath(to: string, from: string): string {
  // Absolute paths stay as-is
  if (to.startsWith("/")) {
    return to;
  }

  // Handle relative paths
  const fromParts = from.split("/").filter(Boolean);

  if (to.startsWith("./")) {
    // Current directory relative
    to = to.slice(2);
  }

  while (to.startsWith("../")) {
    fromParts.pop();
    to = to.slice(3);
  }

  const toParts = to.split("/").filter(Boolean);
  return "/" + [...fromParts, ...toParts].join("/");
}

// ============================================================================
// Navigation Guards
// ============================================================================

/** Run navigation guards and return result */
async function runGuards(
  state: RouterState,
  from: Location,
  to: Location,
  params: Params,
  routes: RouteDefinition[],
): Promise<{ allowed: boolean; redirect?: string }> {
  const ctx: NavigationGuardContext = { from, to, params };

  // Run config-level beforeEach guards
  if (state.config.beforeEach) {
    for (const guard of state.config.beforeEach) {
      const result = await guard(ctx);
      if (result === false) {
        return { allowed: false };
      }
      if (typeof result === "string") {
        return { allowed: false, redirect: result };
      }
    }
  }

  // Run route-level beforeEnter guards
  for (const route of routes) {
    if (route.beforeEnter) {
      const result = await route.beforeEnter(ctx);
      if (result === false) {
        return { allowed: false };
      }
      if (typeof result === "string") {
        return { allowed: false, redirect: result };
      }
    }
  }

  return { allowed: true };
}

/** Run after navigation hooks */
function runAfterHooks(state: RouterState, from: Location, to: Location, params: Params): void {
  if (state.config.afterEach) {
    const ctx: NavigationGuardContext = { from, to, params };
    for (const hook of state.config.afterEach) {
      hook(ctx);
    }
  }
}

// ============================================================================
// Scroll Restoration
// ============================================================================

function saveScrollPosition(state: RouterState, key: string): void {
  const config = state.config.scrollRestoration;
  if (config?.enabled === false) return;

  state.scrollPositions.set(key, {
    x: window.scrollX,
    y: window.scrollY,
  });
}

function restoreScrollPosition(state: RouterState, key: string): void {
  const config = state.config.scrollRestoration;
  if (config?.enabled === false) return;

  const pos = state.scrollPositions.get(key);
  if (pos) {
    window.scrollTo({
      left: pos.x,
      top: pos.y,
      behavior: config?.behavior ?? "auto",
    });
  } else {
    // New page - scroll to top
    window.scrollTo({
      left: 0,
      top: 0,
      behavior: config?.behavior ?? "auto",
    });
  }
}

// ============================================================================
// View Transitions
// ============================================================================

/** Check if View Transitions API is supported */
function supportsViewTransitions(): boolean {
  return typeof document !== "undefined" && "startViewTransition" in document;
}

/**
 * Run the synchronous DOM commit of a navigation, wrapped in a view
 * transition when enabled.
 *
 * Only the commit (state batch + render) goes inside the transition
 * callback: loaders/guards have already finished by then. Keeping the
 * transition short matters - while one is active the browser's snapshot
 * overlay swallows pointer events, so long transitions block clicks.
 */
async function commitWithViewTransition(state: RouterState, commit: () => void): Promise<void> {
  const config = state.config.viewTransitions;

  // Hidden/occluded tabs defer rendering: startViewTransition's callback
  // may never run there, which would stall navigation indefinitely
  if (
    !config?.enabled ||
    !supportsViewTransitions() ||
    state.transitionInFlight ||
    document.visibilityState === "hidden"
  ) {
    commit();
    return;
  }

  debug("Starting view transition");
  state.transitionInFlight = true;
  config.onTransitionStart?.();

  let committed = false;
  const doCommit = () => {
    if (committed) return;
    committed = true;
    commit();
  };

  try {
    const transition = (
      document as unknown as {
        startViewTransition: (cb: () => void) => {
          finished: Promise<void>;
          ready?: Promise<void>;
          updateCallbackDone?: Promise<void>;
          skipTransition?: () => void;
        };
      }
    ).startViewTransition(doCommit);
    // A skipped transition rejects every promise it exposes; unhandled
    // rejections surface to the page unless each one is observed
    transition.ready?.catch(() => {});
    transition.updateCallbackDone?.catch(() => {});

    // Safety net: if the browser defers the snapshot (occlusion, frame
    // throttling), commit anyway - navigation must never wait on paint
    const guard = setTimeout(() => {
      if (!committed) {
        debug("View transition stalled, committing directly");
        try {
          transition.skipTransition?.();
        } catch {
          // ignore
        }
        doCommit();
      }
    }, 200);

    await Promise.race([
      transition.finished.catch(() => {}),
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);
    clearTimeout(guard);
    doCommit(); // belt and braces: never exit without the commit applied
    debug("View transition finished");
  } catch (err) {
    doCommit();
    debug("View transition error:", err);
  } finally {
    state.transitionInFlight = false;
    config.onTransitionEnd?.();
  }
}

// ============================================================================
// Loader Execution
// ============================================================================

/** Cache key for loader */
function loaderCacheKey(path: string, params: Params, search: string): string {
  return `${path}:${JSON.stringify(params)}:${search}`;
}

/** Clean up old cache entries */
function cleanLoaderCache(state: RouterState): void {
  const maxSize = state.config.cache?.maxSize ?? 100;
  const ttl = state.config.cache?.ttl ?? 5000;
  const now = Date.now();

  // Remove expired entries
  for (const [key, value] of state.loaderCache) {
    if (now - value.timestamp > ttl) {
      state.loaderCache.delete(key);
    }
  }

  // Remove oldest entries if over max size
  if (state.loaderCache.size > maxSize) {
    const entries = Array.from(state.loaderCache.entries()).toSorted(
      (a, b) => a[1].timestamp - b[1].timestamp,
    );

    const toRemove = entries.slice(0, state.loaderCache.size - maxSize);
    for (const [key] of toRemove) {
      state.loaderCache.delete(key);
    }
  }
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
  const ttl = state.config.cache?.ttl ?? 5000;

  // Return cached if fresh
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data as T;
  }

  const data = await route.loader({ params, searchParams, signal });

  if (!signal.aborted) {
    state.loaderCache.set(cacheKey, { data, timestamp: Date.now() });
    cleanLoaderCache(state);
  }

  return data;
}

// ============================================================================
// Core Navigation
// ============================================================================

/** Perform the core navigation logic */
async function performCoreNavigation(
  state: RouterState,
  to: string,
  options: NavigateOptions = {},
): Promise<void> {
  // Latest navigation wins: supersede (and abort) any in-flight one
  const seq = ++state.navSeq;
  state.navAbort?.abort();
  const navController = new AbortController();
  state.navAbort = navController;

  const currentLocation = state.location();

  // Resolve relative paths
  const resolvedPath = resolvePath(to, currentLocation.pathname);

  // Parse the new location
  const url = new URL(resolvedPath, "http://localhost");
  let pathname = url.pathname;

  // Adjust for base path
  if (state.base && pathname.startsWith(state.base)) {
    pathname = pathname.slice(state.base.length) || "/";
  }

  const newLocation = createLocation(pathname, url.search, url.hash);

  // Match routes
  const match = matchRoutes(pathname, state.config.routes);
  debug(
    "Navigation match:",
    match ? { route: match.route.path, parents: match.parents.map((p) => p.path) } : null,
  );

  if (!match) {
    // No match - clear routes (Outlet will show 404)
    await commitWithViewTransition(state, () => {
      batch(() => {
        state.setMatchedRoutes([]);
        state.setLoaderData([]);
        state.setParams({});
        state.setRouteErrors([]);
        state.setLocation(newLocation);
      });
    });
    return;
  }

  // Build route chain
  const allRoutes = [...match.parents, match.route];

  // Run navigation guards
  const guardResult = await runGuards(state, currentLocation, newLocation, match.params, allRoutes);

  // Superseded while guards ran
  if (seq !== state.navSeq) return;

  if (!guardResult.allowed) {
    if (guardResult.redirect) {
      // Redirect to different path
      await performCoreNavigation(state, guardResult.redirect, { replace: true });
    }
    return;
  }

  // Save scroll position before navigation
  if (!options.noScroll) {
    saveScrollPosition(state, currentLocation.pathname + currentLocation.search);
  }

  // Set loading state
  const hasLoaders = allRoutes.some((r) => r.loader);
  debug(
    "Navigation hasLoaders:",
    hasLoaders,
    "routes:",
    allRoutes.map((r) => ({ path: r.path, hasLoader: !!r.loader })),
  );
  if (hasLoaders) {
    debug("Setting isLoading to true");
    state.setIsLoading(true);
  }

  // Load data for all routes in parallel
  const signal = navController.signal;
  const loadStart = Date.now();
  const minLoadTime = state.config.loadingMinTime ?? 0;

  try {
    const loaderPromises = allRoutes.map(async (route, index) => {
      try {
        return await executeLoader(state, route, match.params, newLocation.searchParams, signal);
      } catch (err) {
        if (route.errorElement && err instanceof Error) {
          // Store error for this route level
          return { __routeError: err, __routeIndex: index };
        }
        throw err;
      }
    });

    const results = await Promise.all(loaderPromises);

    if (signal.aborted || seq !== state.navSeq) {
      debug("Navigation superseded, discarding result");
      // The superseding navigation owns the loading state now
      return;
    }

    // Ensure minimum loading time
    const elapsed = Date.now() - loadStart;
    if (hasLoaders && elapsed < minLoadTime) {
      await new Promise((r) => setTimeout(r, minLoadTime - elapsed));
      if (seq !== state.navSeq) return;
    }

    // Process results and extract errors
    const loaderData: unknown[] = [];
    const routeErrors: (Error | null)[] = [];

    for (const result of results) {
      if (result && typeof result === "object" && "__routeError" in result) {
        loaderData.push(undefined);
        routeErrors.push((result as { __routeError: Error }).__routeError);
      } else {
        loaderData.push(result);
        routeErrors.push(null);
      }
    }

    // Update state atomically; the view transition (if enabled) wraps only
    // this synchronous commit, never the async loading above
    await commitWithViewTransition(state, () => {
      batch(() => {
        state.setMatchedRoutes(allRoutes);
        state.setLoaderData(loaderData);
        state.setParams(match.params);
        state.setRouteErrors(routeErrors);
        state.setLocation(newLocation);
        state.setIsLoading(false);
      });
    });

    // Restore scroll position after navigation
    if (!options.noScroll) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        restoreScrollPosition(state, newLocation.pathname + newLocation.search);
      }, 0);
    }

    // Run after hooks
    runAfterHooks(state, currentLocation, newLocation, match.params);
  } catch (err) {
    if (!signal.aborted && seq === state.navSeq) {
      console.error("Router loader error:", err);
      // Still set routes so UI can show error state
      batch(() => {
        state.setMatchedRoutes(allRoutes);
        state.setLoaderData(allRoutes.map(() => undefined));
        state.setParams(match.params);
        state.setRouteErrors(allRoutes.map(() => null));
        state.setLocation(newLocation);
        state.setIsLoading(false);
      });
    }
  }
}

// ============================================================================
// Router Initialization
// ============================================================================

/** Initialize the browser router state */
function initBrowserRouter(config: RouterConfig): RouterState {
  const id = generateRouterId();
  const base = config.base || "";
  const abortController = new AbortController();

  const [location, setLocation] = useState<Location>(parseLocation(base));
  const [params, setParams] = useState<Params>({});
  const [matchedRoutes, setMatchedRoutes] = useState<RouteDefinition[]>([]);
  const [loaderData, setLoaderData] = useState<unknown[]>([]);
  const [routeErrors, setRouteErrors] = useState<(Error | null)[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Precompile all routes
  precompileRoutes(config.routes);

  const state: RouterState = {
    id,
    location,
    setLocation,
    params,
    setParams,
    matchedRoutes,
    setMatchedRoutes,
    loaderData,
    setLoaderData,
    routeErrors,
    setRouteErrors,
    config,
    loaderCache: new Map(),
    base,
    navigate: async () => {}, // Will be set below
    abortController,
    navSeq: 0,
    navAbort: null,
    transitionInFlight: false,
    isLoading,
    setIsLoading,
    scrollPositions: new Map(),
    prefetchCache: new Set(),
  };

  // Navigation function for browser router
  state.navigate = async (to: string, options: NavigateOptions = {}) => {
    // Resolve relative paths
    const resolvedPath = resolvePath(to, state.location().pathname);
    const fullPath = resolvedPath.startsWith("/") ? base + resolvedPath : resolvedPath;

    // Update browser history
    if (options.replace) {
      window.history.replaceState(options.state ?? null, "", fullPath);
    } else {
      window.history.pushState(options.state ?? null, "", fullPath);
    }

    // Loading happens outside any view transition (commits are wrapped
    // inside performCoreNavigation), so input stays responsive
    await performCoreNavigation(state, resolvedPath, options);
  };

  registerRouter(state);
  mainBrowserRouterId = id;

  return state;
}

/** Initialize a memory router (isolated, no browser history) */
function initMemoryRouter(config: RouterConfig, initialPath: string): RouterState {
  const id = generateRouterId();
  const base = config.base || "";
  const abortController = new AbortController();

  // Parse the initial path to extract pathname, search, and hash
  const parsedPath = parsePath(initialPath);
  const [location, setLocation] = useState<Location>(
    createLocation(parsedPath.pathname, parsedPath.search, parsedPath.hash),
  );
  const [params, setParams] = useState<Params>({});
  const [matchedRoutes, setMatchedRoutes] = useState<RouteDefinition[]>([]);
  const [loaderData, setLoaderData] = useState<unknown[]>([]);
  const [routeErrors, setRouteErrors] = useState<(Error | null)[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Precompile all routes
  precompileRoutes(config.routes);

  const state: RouterState = {
    id,
    location,
    setLocation,
    params,
    setParams,
    matchedRoutes,
    setMatchedRoutes,
    loaderData,
    setLoaderData,
    routeErrors,
    setRouteErrors,
    config,
    loaderCache: new Map(),
    base,
    navigate: async () => {}, // Will be set below
    abortController,
    navSeq: 0,
    navAbort: null,
    transitionInFlight: false,
    isLoading,
    setIsLoading,
    scrollPositions: new Map(),
    prefetchCache: new Set(),
  };

  // Navigation function for memory router - only updates internal state
  state.navigate = async (to: string, options: NavigateOptions = {}) => {
    debug("MemoryRouter navigate to:", to);
    await performCoreNavigation(state, to, options);
  };

  registerRouter(state);

  return state;
}

/** Setup global browser event listeners */
function setupBrowserListeners(state: RouterState): () => void {
  const abortController = new AbortController();
  const { signal } = abortController;

  // Listen for popstate (back/forward)
  const handlePopstate = () => {
    const loc = parseLocation(state.base);
    void performCoreNavigation(state, loc.pathname + loc.search + loc.hash, { noScroll: false });
  };
  window.addEventListener("popstate", handlePopstate, { signal });

  // Intercept link clicks for SPA navigation
  const handleClick = (e: MouseEvent) => {
    // Skip if already handled by another router (e.g., MemoryRouter)
    if (e.defaultPrevented) return;

    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const anchor = target.closest("a");
    if (!anchor) return;

    // Link/NavLink manage their own navigation through barq's delegated
    // click handler ($$click); intercepting here would navigate twice
    if ((anchor as HTMLAnchorElement & { $$click?: unknown }).$$click) return;

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
    void state.navigate(href);
  };
  document.addEventListener("click", handleClick, { signal });

  // Return cleanup function
  return () => {
    abortController.abort();
    unregisterRouter(state.id);
  };
}

// ============================================================================
// Navigation (Public API)
// ============================================================================

/** Navigate to a new path (uses main browser router) */
export function navigate(to: string, options: NavigateOptions = {}): Promise<void> {
  const state = getMainBrowserRouter();
  if (!state) {
    throw new Error("Router not initialized. Use <Router> component first.");
  }
  return state.navigate(to, options);
}

// ============================================================================
// Hooks
// ============================================================================

/** Get current router state from context or main browser router */
function useRouterState(): RouterState {
  // Try to get from context first (for MemoryRouter)
  const contextState = useContext(RouterContext);
  const state = contextState() || getMainBrowserRouter();

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

    // Filter out empty values
    const filteredParams = Object.fromEntries(
      Object.entries(newParams).filter(([_, v]) => v !== ""),
    );

    const searchString = new URLSearchParams(filteredParams).toString();
    const search = searchString ? `?${searchString}` : "";
    void state.navigate(location().pathname + search, { replace: true });
  };

  return [getSearchParams, setSearchParams];
}

/** Get navigate function for current router */
export function useNavigate(): (to: string, options?: NavigateOptions) => Promise<void> {
  const state = useRouterState();
  return state.navigate;
}

/** Get loading state for current router */
export function useIsLoading(): () => boolean {
  const state = useRouterState();
  return state.isLoading;
}

/** Get matched routes for current router */
export function useMatchedRoutes(): () => RouteDefinition[] {
  const state = useRouterState();
  return state.matchedRoutes;
}

// ============================================================================
// Prefetching
// ============================================================================

/** Prefetch a route's data */
export async function prefetch(path: string): Promise<void> {
  const state = getMainBrowserRouter();
  if (!state || state.prefetchCache.has(path)) return;

  state.prefetchCache.add(path);

  const match = matchRoutes(path, state.config.routes);
  if (!match) return;

  const allRoutes = [...match.parents, match.route];
  const searchParams = new URLSearchParams();
  const signal = new AbortController().signal;

  // Load all route data in background
  await Promise.all(
    allRoutes.map((route) =>
      executeLoader(state, route, match.params, searchParams, signal).catch(() => {}),
    ),
  );
}

/** Setup prefetch listener based on strategy */
function setupPrefetch(
  element: HTMLAnchorElement,
  href: string,
  strategy: "hover" | "visible" | "none",
  delay: number,
): () => void {
  if (strategy === "none") return () => {};

  const abortController = new AbortController();
  const { signal } = abortController;

  if (strategy === "hover") {
    let timeout: ReturnType<typeof setTimeout>;
    element.addEventListener(
      "mouseenter",
      () => {
        timeout = setTimeout(() => void prefetch(href), delay);
      },
      { signal },
    );
    element.addEventListener(
      "mouseleave",
      () => {
        clearTimeout(timeout);
      },
      { signal },
    );
  } else if (strategy === "visible") {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void prefetch(href);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(element);

    return () => {
      observer.disconnect();
      abortController.abort();
    };
  }

  return () => abortController.abort();
}

// ============================================================================
// Components
// ============================================================================

interface LinkProps {
  href: string;
  replace?: boolean;
  class?: string;
  children?: Child;
  /** Prefetch strategy (overrides router config) */
  prefetch?: "hover" | "visible" | "none";
}

/** Link component for SPA navigation */
export function Link(props: LinkProps): JSXElement {
  const state = useRouterState();
  const currentLocation = state.location();

  // Resolve relative href
  const resolvedHref = useMemo(() => resolvePath(props.href, currentLocation.pathname));

  const handleClick = (e: MouseEvent) => {
    // Skip if modifier keys or not left click
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    void state.navigate(resolvedHref(), { replace: props.replace });
  };

  // Setup prefetch
  let prefetchCleanup: (() => void) | null = null;

  const setupPrefetchOnMount = (element: HTMLAnchorElement) => {
    const strategy = props.prefetch ?? state.config.prefetch?.strategy ?? "none";
    const delay = state.config.prefetch?.hoverDelay ?? 100;
    prefetchCleanup = setupPrefetch(element, resolvedHref(), strategy, delay);
  };

  onCleanup(() => {
    prefetchCleanup?.();
  });

  return (
    <a
      href={() => resolvedHref()}
      class={props.class}
      onClick={handleClick}
      ref={(el: HTMLAnchorElement) => setupPrefetchOnMount(el)}
    >
      {props.children}
    </a>
  );
}

interface NavLinkProps {
  href: string;
  class?: string;
  activeClass?: string;
  /** @deprecated Use `end` instead */
  exact?: boolean;
  /** Only match when pathname ends at this href (no child routes) */
  end?: boolean;
  children?: Child;
  /** Prefetch strategy (overrides router config) */
  prefetch?: "hover" | "visible" | "none";
}

/** NavLink - link with active state */
export function NavLink(props: NavLinkProps): JSXElement {
  const location = useLocation();
  const state = useRouterState();

  // end prop takes precedence, fall back to deprecated exact
  const useEndMatching = () => props.end ?? props.exact ?? false;

  // Resolve relative href
  const resolvedHref = useMemo(() => resolvePath(props.href, location().pathname));

  // Use useMemo for reactive class computation
  const className = useMemo(() => {
    const loc = location();
    const href = resolvedHref();
    const isActive = useEndMatching() ? loc.pathname === href : loc.pathname.startsWith(href);

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
    e.stopPropagation();
    void state.navigate(resolvedHref());
  };

  // Setup prefetch
  let prefetchCleanup: (() => void) | null = null;

  const setupPrefetchOnMount = (element: HTMLAnchorElement) => {
    const strategy = props.prefetch ?? state.config.prefetch?.strategy ?? "none";
    const delay = state.config.prefetch?.hoverDelay ?? 100;
    prefetchCleanup = setupPrefetch(element, resolvedHref(), strategy, delay);
  };

  onCleanup(() => {
    prefetchCleanup?.();
  });

  return (
    <a
      href={() => resolvedHref()}
      class={() => className()}
      onClick={handleClick}
      ref={(el: HTMLAnchorElement) => setupPrefetchOnMount(el)}
    >
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
  const state = contextState() || getMainBrowserRouter();

  if (!state) {
    insertNodes(endMarker, [document.createTextNode("Router not initialized")]);
    return fragment;
  }

  // Get our level from context (0 for root outlet)
  const levelGetter = useContext(OutletLevelContext);
  const level = levelGetter();

  // Track the previous route reference at this level for identity comparison
  let prevRoute: RouteDefinition | null = null;
  let prevData: unknown = undefined;
  let prevError: Error | null = null;
  let currentNodes: Node[] = [];
  // Track dispose function for current route's reactive scope
  let disposeCurrentRoute: (() => void) | null = null;

  // Helper to render the current route
  const renderRoute = () => {
    // Read matchedRoutes directly to establish dependency tracking
    const routes = state.matchedRoutes();
    const allData = state.loaderData();
    const allErrors = state.routeErrors();
    const params = state.params();

    // Get route at our level
    const route = level < routes.length ? routes[level] : null;
    const data = level < allData.length ? allData[level] : undefined;
    const error = level < allErrors.length ? allErrors[level] : null;

    // Use object identity comparison instead of path string comparison
    // This is more reliable and handles dynamic routes better
    // Also check if data or error changed - must re-render when loader data arrives
    if (
      route === prevRoute &&
      data === prevData &&
      error === prevError &&
      currentNodes.length > 0
    ) {
      // Route at this level hasn't changed - don't re-render
      debug(`Outlet level ${level}: Skipping render - route unchanged`);
      return;
    }

    debug(`Outlet level ${level}: Rendering route ${route?.path ?? "null"}`);
    prevRoute = route;
    prevData = data;
    prevError = error;

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

    // Handle route-level errors
    if (error && route.errorElement) {
      createScope((dispose) => {
        disposeCurrentRoute = dispose;

        const ErrorComp = route.errorElement!;
        const resetFn = () => {
          // Re-trigger navigation to retry
          void state.navigate(state.location().pathname, { replace: true });
        };

        const content = (
          <RouterContext.Provider value={() => state}>
            {() => ErrorComp({ error, reset: resetFn })}
          </RouterContext.Provider>
        );

        const nodes = childToNodes(content);
        insertNodes(endMarker, nodes);
        currentNodes = nodes;
      }, true);
      return;
    }

    // Render the route component inside a scope so its effects can be disposed
    // when the route changes. This prevents orphaned effects from accumulating.
    const RouteComp = route.component as (props: RouteComponentProps) => Child;

    // Use detached=true so the scope's dispose is NOT registered with the parent effect's cleanups.
    // This allows us to control disposal manually via disposeCurrentRoute, and prevents
    // the scope from being disposed when the Outlet effect re-runs but skips rendering.
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
    }, true);
  };

  // Create a proper scope for the effect to avoid queueMicrotask workaround
  createScope(() => {
    useEffect(renderRoute);
  });

  // Register cleanup for when the Outlet's parent scope is disposed
  // This ensures the current route's scope is cleaned up when unmounting
  onCleanup(() => {
    if (disposeCurrentRoute) {
      disposeCurrentRoute();
      disposeCurrentRoute = null;
    }
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
// oxlint-disable-next-line no-unused-vars -- not wired up yet
function useRouteMatching(state: RouterState): void {
  // Initial route match
  const loc = state.location();
  void performCoreNavigation(state, loc.pathname + loc.search + loc.hash, { noScroll: true });

  // Effect to match routes when location changes
  let lastPathKey: string | null = null;

  useEffect(() => {
    const loc = state.location();
    const pathKey = loc.pathname + loc.search + loc.hash;

    // Skip if location hasn't changed (prevents duplicate processing)
    if (pathKey === lastPathKey) return;
    lastPathKey = pathKey;

    debug("Location changed:", pathKey);

    // Navigation is triggered elsewhere (navigate function, popstate)
    // This effect just tracks the reactive dependency
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
  // Initialize browser router state
  const state = initBrowserRouter(props.config);

  // Setup browser event listeners
  const cleanup = setupBrowserListeners(state);
  onCleanup(cleanup);

  // Do initial route match
  const initialLoc = parseLocation(state.base);
  const initialMatch = matchRoutes(initialLoc.pathname, state.config.routes);
  if (initialMatch) {
    const allRoutes = [...initialMatch.parents, initialMatch.route];
    batch(() => {
      state.setMatchedRoutes(allRoutes);
      state.setLoaderData(allRoutes.map(() => undefined));
      state.setParams(initialMatch.params);
      state.setRouteErrors(allRoutes.map(() => null));
    });

    // Load initial data asynchronously
    const hasLoaders = allRoutes.some((r) => r.loader);
    if (hasLoaders) {
      void performCoreNavigation(state, initialLoc.pathname + initialLoc.search + initialLoc.hash, {
        noScroll: true,
      });
    }
  }

  // Provide state via context so hooks and Outlet use this router
  // Must use function children so inner JSX is evaluated AFTER context is set
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

  // Register cleanup
  onCleanup(() => {
    unregisterRouter(state.id);
  });

  // Do initial route match synchronously so first render has routes
  // Use just the pathname for matching (not query string or hash)
  const parsedInitial = parsePath(initialPath);
  const initialMatch = matchRoutes(parsedInitial.pathname, state.config.routes);
  if (initialMatch) {
    const allRoutes = [...initialMatch.parents, initialMatch.route];
    batch(() => {
      state.setMatchedRoutes(allRoutes);
      state.setLoaderData(allRoutes.map(() => undefined));
      state.setParams(initialMatch.params);
      state.setRouteErrors(allRoutes.map(() => null));
    });

    // Load initial data asynchronously if there are loaders
    const hasLoaders = allRoutes.some((r) => r.loader);
    if (hasLoaders) {
      void performCoreNavigation(state, initialPath, { noScroll: true });
    }
  }

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
// Route Definition Helpers (with Type-Safe Path Inference)
// ============================================================================

/**
 * Type-safe route builder with inference from path pattern and loader return type
 *
 * @example
 * ```tsx
 * // Path params are inferred from the path string
 * const userRoute = route({
 *   path: "/users/:id",
 *   loader: async ({ params }) => {
 *     // params.id is typed as string
 *     return fetchUser(params.id);
 *   },
 *   component: ({ params, data }) => {
 *     // params.id and data are both typed
 *     return <div>User {params.id}: {data.name}</div>;
 *   }
 * });
 *
 * // Route without params
 * const homeRoute = route({
 *   path: "/",
 *   component: () => <Home />
 * });
 *
 * // Route with children (layout)
 * const dashboardRoute = route({
 *   path: "/dashboard",
 *   component: (props) => <Layout>{props.children}</Layout>,
 *   children: [userRoute, homeRoute]
 * });
 * ```
 */
export function route<TPath extends string, TData = unknown>(definition: {
  path: TPath;
  component: RouteComponent<TData, PathParams<TPath>>;
  loader?: Loader<TData, PathParams<TPath>>;
  children?: RouteDefinition[];
  beforeEnter?: NavigationGuard;
  errorElement?: (props: ErrorBoundaryProps) => Child;
}): RouteDefinition {
  return definition as unknown as RouteDefinition;
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
  // Use router state from context instead of global navigate
  const state = useRouterState();

  useEffect(() => {
    void state.navigate(props.to, { replace: props.replace ?? true });
  });

  return null;
}

// ============================================================================
// Loading Component
// ============================================================================

interface LoadingProps {
  /** Custom loading content (falls back to router config loadingElement) */
  fallback?: () => Child;
  children?: Child;
}

/**
 * Show loading state while route is loading
 */
export function Loading(props: LoadingProps): JSXElement {
  const isLoading = useIsLoading();
  const state = useRouterState();

  return useMemo(() => {
    if (isLoading()) {
      const fallback = props.fallback ?? state.config.loadingElement;
      return fallback ? fallback() : null;
    }
    return props.children ?? null;
  }) as unknown as JSXElement;
}
