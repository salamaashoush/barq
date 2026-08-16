// A runtime library beside `flow.ts`, written on the primitive ABI the compiler
// emits rather than authored in JSX — one implementation in the app bundle and
// in the test process.

import {
  type Block,
  type Cell,
  type Child,
  type JSXElement,
  type Scope,
  type StrictAccessor,
  batch,
  bindProp,
  block,
  boundary,
  branch,
  cell,
  computed,
  createContext,
  flush,
  insert,
  listen,
  onCleanup,
  props as sources,
  provide,
  read,
  readSlot,
  setAttr,
  setClass,
  signal,
  template,
  untrack,
} from "@barqjs/core";

// ============================================================================
// Debug
// ============================================================================

let DEBUG_MODE = false;

/** Enable or disable router debug logging. */
export function setRouterDebugMode(enabled: boolean): void {
  DEBUG_MODE = enabled;
}

function debug(...args: unknown[]): void {
  if (DEBUG_MODE) console.log("[barq-router]", ...args);
}

// ============================================================================
// Type-safe path parameters
// ============================================================================

/**
 * Extract parameter names from a path string at compile time.
 *
 * @example
 * ExtractRouteParams<"/users/:id/posts/:postId"> = "id" | "postId"
 * ExtractRouteParams<"/files/*"> = "*"
 * ExtractRouteParams<"/docs/:path*"> = "path"
 */
export type ExtractRouteParams<Path extends string> =
  Path extends `${infer _Start}:${infer Param}*${infer Rest}`
    ? Param | ExtractRouteParams<Rest>
    : Path extends `${infer _Start}:${infer Param}+${infer Rest}`
      ? Param | ExtractRouteParams<Rest>
      : Path extends `${infer _Start}:${infer Param}?${infer Rest}`
        ? Param | ExtractRouteParams<Rest>
        : Path extends `${infer _Start}:${infer Param}/${infer Rest}`
          ? Param | ExtractRouteParams<`/${Rest}`>
          : Path extends `${infer _Start}:${infer Param}`
            ? Param
            : Path extends `${infer _Start}*${infer Rest}`
              ? "*" | ExtractRouteParams<Rest>
              : never;

export type PathParams<Path extends string> = { [K in ExtractRouteParams<Path>]: string };

// ============================================================================
// Types
// ============================================================================

export type Params = Record<string, string>;
export type SearchParams = URLSearchParams;

export interface Location {
  pathname: string;
  search: string;
  hash: string;
  params: Params;
  searchParams: SearchParams;
}

export interface NavigationGuardContext {
  from: Location;
  to: Location;
  params: Params;
}

export type NavigationGuard = (
  ctx: NavigationGuardContext,
) => boolean | string | Promise<boolean | string>;

export interface LoaderContext<P extends Params = Params> {
  params: P;
  searchParams: SearchParams;
  signal: AbortSignal;
}

export type Loader<T = unknown, P extends Params = Params> = (
  ctx: LoaderContext<P>,
) => T | Promise<T>;

/** `children` is a Block, so a layout constructs the next route in its OWN scope. */
export interface RouteComponentProps<T = unknown, P extends Params = Params> {
  params: Cell<P>;
  data: Cell<T>;
  /** The next matched route, as a Block taking a scope. */
  children: Child;
}

/** The spelling. C1 rewrites the declaration to `(scope, props)`; `Invoked` is the call. */
export type RouteComponent<T = unknown, P extends Params = Params> = (
  props: RouteComponentProps<T, P>,
) => unknown;

type Invoked = (scope: Scope | null, props: RouteComponentProps) => unknown;

export interface ErrorBoundaryProps {
  error: Cell<Error>;
  reset: () => void;
}

export type ErrorComponent = (props: ErrorBoundaryProps) => unknown;

type InvokedError = (scope: Scope | null, props: ErrorBoundaryProps) => unknown;

export interface RouteDefinition<T = unknown, P extends Params = Params> {
  path: string;
  component: RouteComponent<T, P>;
  loader?: Loader<T, P>;
  children?: RouteDefinition[];
  beforeEnter?: NavigationGuard;
  errorElement?: ErrorComponent;
}

/** The leaf of a match, with the chain that reached it. */
export interface MatchedRoute<T = unknown> {
  route: RouteDefinition<T>;
  params: Params;
  parents: RouteDefinition[];
}

export interface CacheConfig {
  ttl: number;
  maxSize: number;
}

export interface ScrollRestorationConfig {
  enabled: boolean;
  behavior: ScrollBehavior;
}

export interface ViewTransitionConfig {
  enabled: boolean;
  onTransitionStart?: () => void;
  onTransitionEnd?: () => void;
}

export interface PrefetchConfig {
  strategy: "hover" | "visible" | "none";
  hoverDelay?: number;
}

export interface RouterConfig {
  routes: RouteDefinition[];
  base?: string;
  fallback?: RouteComponent;
  cache?: Partial<CacheConfig>;
  scrollRestoration?: Partial<ScrollRestorationConfig>;
  viewTransitions?: ViewTransitionConfig;
  prefetch?: PrefetchConfig;
  beforeEach?: NavigationGuard[];
  afterEach?: ((ctx: NavigationGuardContext) => void)[];
  loadingMinTime?: number;
}

export interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
  noScroll?: boolean;
}

// ============================================================================
// Path matching
// ============================================================================

interface PathPattern {
  regex: RegExp;
  paramNames: string[];
  path: string;
}

const compiledPathCache = new Map<string, PathPattern>();

/** Clear the path compilation cache. */
export function clearPathCache(): void {
  compiledPathCache.clear();
}

/**
 * Compile a path pattern to a regex, memoised.
 *
 * - `/users/:id` — required segment
 * - `/users/:id?` — optional segment
 * - `/files/*` — catch-all, captured as `params["*"]`
 * - `/docs/:path*` — named splat, captures the rest including slashes
 * - `/api/:resource+` — one or more segments
 */
export function compilePath(path: string): PathPattern {
  const cached = compiledPathCache.get(path);
  if (cached) return cached;

  const paramNames: string[] = [];

  const SPLAT = "\x00SPLAT\x00";
  const PLUS = "\x00PLUS\x00";
  const OPT = "\x00OPT\x00";
  const PARAM = "\x00PARAM\x00";
  const WILD = "\x00WILD\x00";

  let pattern = path.replace(/[.^${}()|[\]\\]/g, "\\$&");

  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)\*/g, (_: string, name: string) => {
    paramNames.push(name);
    return SPLAT;
  });
  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)\+/g, (_: string, name: string) => {
    paramNames.push(name);
    return PLUS;
  });
  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)\?/g, (_: string, name: string) => {
    paramNames.push(name);
    return OPT;
  });
  pattern = pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_: string, name: string) => {
    paramNames.push(name);
    return PARAM;
  });
  pattern = pattern.replace(/\*/g, () => {
    paramNames.push("*");
    return WILD;
  });

  pattern = pattern.split(SPLAT).join("(.*)");
  pattern = pattern.split(PLUS).join("(.+)");
  pattern = pattern.split(OPT).join("([^/]*)");
  pattern = pattern.split(PARAM).join("([^/]+)");
  pattern = pattern.split(WILD).join("(.*)");

  const compiled: PathPattern = { regex: new RegExp(`^${pattern}$`), paramNames, path };
  compiledPathCache.set(path, compiled);
  return compiled;
}

/** Match a pathname against a compiled pattern. */
export function matchPath(pathname: string, pattern: PathPattern): Params | null {
  const match = pathname.match(pattern.regex);
  if (!match) return null;

  const params: Params = {};
  pattern.paramNames.forEach((name, i) => {
    params[name] = match[i + 1];
  });
  return params;
}

/**
 * The prefix pattern for a layout route: the same path with the rest of the
 * pathname captured, so the CONSUMED length is what the match reports rather
 * than what the source pattern happens to be long.
 *
 * The old form appended `/*` and then sliced the child pathname by
 * `route.path.length`. `"/u/:id"` is six characters and the text it matched at
 * `/u/7` is four, so a nested route under a parameterised parent matched only
 * when the parameter's value was two or three characters long — every UUID
 * missed. The `*` it introduced also leaked into `params` at every layout level.
 * Both are gone: the rest is captured under a private name that is deleted
 * before the params are published.
 */
function prefixPattern(path: string): PathPattern {
  return compilePath(path.endsWith("/") ? `${path}*` : `${path}/*`);
}

function splitPrefix(pathname: string, path: string): { params: Params; rest: string } | null {
  const matched = matchPath(pathname, prefixPattern(path));
  if (!matched) return null;
  const rest = matched["*"] ?? "";
  const params: Params = { ...matched };
  delete params["*"];
  return { params, rest: rest === "" ? "/" : `/${rest}` };
}

/** Match a pathname against a route table, returning the matched chain. */
export function matchRoutes(
  pathname: string,
  routes: RouteDefinition[],
  parents: RouteDefinition[] = [],
): MatchedRoute | null {
  for (const route of routes) {
    const children = route.children;
    const isLayout = children !== undefined && children.length > 0;
    const exact = matchPath(pathname, compilePath(route.path));

    if (!isLayout) {
      if (exact) return { route, params: exact, parents };
      continue;
    }

    if (exact) {
      // An exact hit on a layout renders its index child when it has one.
      const index = matchRoutes("/", children, [...parents, route]);
      if (index) return { ...index, params: { ...exact, ...index.params } };
      return { route, params: exact, parents };
    }

    const split = splitPrefix(pathname, route.path);
    if (split) {
      const child = matchRoutes(split.rest, children, [...parents, route]);
      if (child) return { ...child, params: { ...split.params, ...child.params } };
    }
  }
  return null;
}

/** The chain a match renders, outermost first. */
function chainOf(match: MatchedRoute | null): RouteDefinition[] {
  return match === null ? [] : [...match.parents, match.route];
}

function precompileRoutes(routes: RouteDefinition[]): void {
  for (const route of routes) {
    compilePath(route.path);
    if (route.children && route.children.length > 0) {
      prefixPattern(route.path);
      precompileRoutes(route.children);
    }
  }
}

// ============================================================================
// Locations
// ============================================================================

function createLocation(pathname: string, search = "", hash = ""): Location {
  return { pathname, search, hash, params: {}, searchParams: new URLSearchParams(search) };
}

function parsePath(path: string): { pathname: string; search: string; hash: string } {
  let pathname = path;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");
  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex);
  }

  const searchIndex = pathname.indexOf("?");
  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex);
  }

  return { pathname, search, hash };
}

function strip(pathname: string, base: string): string {
  return base && pathname.startsWith(base) ? pathname.slice(base.length) || "/" : pathname;
}

/**
 * An href the router is not a view of: another scheme (`https:`, `mailto:`,
 * `tel:`), or a fragment. `//host/path` is protocol-relative and also leaves.
 */
function leavesTheApp(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("#");
}

/** Resolve a possibly relative path against a base pathname. */
export function resolvePath(to: string, from: string): string {
  // Not relative to anything. Splitting an absolute URL on "/" produced
  // `/a/https:/example.com/x`, which is a path this router would then try to
  // match.
  if (leavesTheApp(to)) return to;
  if (to.startsWith("/")) return to;

  const fromParts = from.split("/").filter(Boolean);
  let rest = to;
  if (rest.startsWith("./")) rest = rest.slice(2);
  while (rest.startsWith("../")) {
    fromParts.pop();
    rest = rest.slice(3);
  }
  return `/${[...fromParts, ...rest.split("/").filter(Boolean)].join("/")}`;
}

/** Segment-aware prefix test — `/user-settings` is not under `/user`. */
function isUnder(pathname: string, prefix: string): boolean {
  if (pathname === prefix) return true;
  if (prefix === "/") return pathname.startsWith("/");
  return pathname.startsWith(prefix) && pathname.charAt(prefix.length) === "/";
}

// ============================================================================
// Router state
// ============================================================================

interface LoadState {
  /** The location key this data belongs to. */
  key: string;
  data: unknown[];
  errors: (Error | null)[];
}

const EMPTY_LOAD: LoadState = { key: "", data: [], errors: [] };

/**
 * `user` writes history and animates. `replay` is a back/forward the history has
 * already performed. `entry` is the URL the document opened on: it is a real
 * navigation and runs the whole guard pipeline, but there is no previous view to
 * animate away from and nothing to write.
 */
type NavKind = "user" | "replay" | "entry";

const MAX_REDIRECTS = 10;

interface History {
  /** The location the router opens on, read once at construction. */
  initial(): Location;
  /** Commit a navigation to whatever the router is a view of. */
  push(path: string, replace: boolean, state: unknown): void;
  /**
   * Register a listener for external location changes. `replay` is true when
   * the history has already moved and the router is catching up.
   */
  watch(onExternal: (path: string, replay: boolean) => void): void;
}

interface RouterState {
  location: Cell<Location>;
  matched: Cell<MatchedRoute | null>;
  chain: Cell<RouteDefinition[]>;
  params: Cell<Params>;
  loads: Cell<LoadState>;
  isLoading: Cell<boolean>;
  navigate: (to: string, options?: NavigateOptions) => Promise<void>;
  prefetch: (path: string) => Promise<void>;
  /** Re-run the current location's loaders. What `errorElement`'s `reset` is. */
  reload: () => Promise<void>;
  config: RouterConfig;
  base: string;
}

function locationKey(location: Location): string {
  return location.pathname + location.search;
}

let transitionsMadeInert = false;

/**
 * A running view transition paints a snapshot overlay above the page, and the
 * overlay takes the hit-test. Without this the first click after a route commit
 * lands on the snapshot and is discarded — for the whole animation, which is a
 * second or more, and silently, which is worse.
 */
function inertTransitions(): void {
  if (transitionsMadeInert || typeof document === "undefined") return;
  transitionsMadeInert = true;
  const sheet = document.createElement("style");
  sheet.textContent =
    "::view-transition-group(*),::view-transition-old(*),::view-transition-new(*)" +
    "{pointer-events:none}";
  document.head.append(sheet);
}

/** One source — the location. Everything structural derives from it, so nothing can be late. */
function createRouter(config: RouterConfig, history: History): RouterState {
  const base = config.base || "";
  precompileRoutes(config.routes);

  debug("router created with", config.routes.length, "route(s)");

  const location = signal<Location>(history.initial());
  const loads = signal<LoadState>(EMPTY_LOAD);
  const loading = signal(0);
  const loaderCache = new Map<string, { data: unknown; timestamp: number }>();
  const scrollPositions = new Map<string, { x: number; y: number }>();
  const prefetched = new Set<string>();

  const matched = computed(() => matchRoutes(location().pathname, config.routes));
  const chain = computed(() => chainOf(matched()));
  const params = computed(() => matched()?.params ?? {});

  let navSeq = 0;
  let navAbort: AbortController | null = null;
  let transitionInFlight = false;

  const state: RouterState = {
    location: () => location(),
    matched,
    chain,
    params,
    loads: () => loads(),
    isLoading: () => loading() > 0,
    navigate: go,
    prefetch,
    reload,
    config,
    base,
  };

  // ── loaders ───────────────────────────────────────────────────────────────

  const ttl = (): number => config.cache?.ttl ?? 5000;

  function cacheKey(route: RouteDefinition, forParams: Params, search: string): string {
    return `${route.path}:${JSON.stringify(forParams)}:${search}`;
  }

  function trimCache(): void {
    const maxSize = config.cache?.maxSize ?? 100;
    const now = Date.now();
    for (const [key, value] of loaderCache) {
      if (now - value.timestamp > ttl()) loaderCache.delete(key);
    }
    if (loaderCache.size > maxSize) {
      const entries = [...loaderCache.entries()].toSorted(
        (a, b) => a[1].timestamp - b[1].timestamp,
      );
      for (const [key] of entries.slice(0, loaderCache.size - maxSize)) loaderCache.delete(key);
    }
  }

  async function runLoader(
    route: RouteDefinition,
    forParams: Params,
    searchParams: SearchParams,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (!route.loader) return undefined;
    const key = cacheKey(route, forParams, searchParams.toString());
    const hit = loaderCache.get(key);
    if (hit && Date.now() - hit.timestamp < ttl()) return hit.data;

    const data = await route.loader({ params: forParams, searchParams, signal });
    if (!signal.aborted) {
      loaderCache.set(key, { data, timestamp: Date.now() });
      trimCache();
    }
    return data;
  }

  /**
   * `Promise.allSettled` is the error channel. The previous form returned
   * `{ __routeError, __routeIndex }` through `Promise.all`'s DATA channel and
   * unpacked it by sniffing for the key.
   */
  async function loadChain(
    routes: RouteDefinition[],
    forParams: Params,
    searchParams: SearchParams,
    signal: AbortSignal,
  ): Promise<{ data: unknown[]; errors: (Error | null)[] }> {
    const settled = await Promise.allSettled(
      routes.map((route) => runLoader(route, forParams, searchParams, signal)),
    );
    const data: unknown[] = [];
    const errors: (Error | null)[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") {
        data.push(result.value);
        errors.push(null);
      } else {
        data.push(undefined);
        const reason = result.reason;
        errors.push(reason instanceof Error ? reason : new Error(String(reason)));
      }
    }
    return { data, errors };
  }

  // ── guards ────────────────────────────────────────────────────────────────

  async function runGuards(
    from: Location,
    to: Location,
    forParams: Params,
    routes: RouteDefinition[],
  ): Promise<{ allowed: boolean; redirect?: string }> {
    const ctx: NavigationGuardContext = { from, to, params: forParams };
    for (const guard of config.beforeEach ?? []) {
      const result = await guard(ctx);
      if (result === false) return { allowed: false };
      if (typeof result === "string") return { allowed: false, redirect: result };
    }
    for (const route of routes) {
      if (!route.beforeEnter) continue;
      const result = await route.beforeEnter(ctx);
      if (result === false) return { allowed: false };
      if (typeof result === "string") return { allowed: false, redirect: result };
    }
    return { allowed: true };
  }

  // ── scroll ────────────────────────────────────────────────────────────────

  function saveScroll(key: string): void {
    if (config.scrollRestoration?.enabled === false) return;
    scrollPositions.set(key, { x: window.scrollX, y: window.scrollY });
  }

  function restoreScroll(key: string): void {
    if (config.scrollRestoration?.enabled === false) return;
    const behavior = config.scrollRestoration?.behavior ?? "auto";
    const at = scrollPositions.get(key);
    window.scrollTo({ left: at?.x ?? 0, top: at?.y ?? 0, behavior });
  }

  // ── the commit ────────────────────────────────────────────────────────────

  /**
   * One commit, one schedule. The view transition wraps the synchronous write
   * and nothing else: loaders and guards have already finished.
   */
  async function commit(apply: () => void, animate: boolean): Promise<void> {
    // The write has to LAND inside the commit, not on the microtask after it.
    // A view transition snapshots whatever the DOM is when its callback
    // returns, and the scroll restore below needs the new document to measure.
    const written = (): void => {
      apply();
      flush();
    };
    const view = config.viewTransitions;
    const supported = typeof document !== "undefined" && "startViewTransition" in document;
    if (
      !animate ||
      !view?.enabled ||
      !supported ||
      transitionInFlight ||
      document.visibilityState === "hidden"
    ) {
      written();
      return;
    }

    inertTransitions();

    transitionInFlight = true;
    view.onTransitionStart?.();
    try {
      const transition = (
        document as unknown as {
          startViewTransition: (cb: () => void) => { finished: Promise<void> };
        }
      ).startViewTransition(written);
      await transition.finished.catch(() => {});
    } catch (error) {
      debug("view transition failed, committing directly:", error);
      written();
    } finally {
      transitionInFlight = false;
      view.onTransitionEnd?.();
    }
  }

  // ── navigation ────────────────────────────────────────────────────────────

  /**
   * `replay` is a navigation the history ALREADY performed — a back/forward
   * step, or the entry URL. Writing history for one destroys the forward stack,
   * so a `back()` followed by a `forward()` would land where `back()` left it.
   * The entry additionally has no previous view to animate away from.
   */
  async function go(
    to: string,
    options: NavigateOptions = {},
    kind: NavKind = "user",
    hops = 0,
  ): Promise<void> {
    const replay = kind !== "user";
    if (hops > MAX_REDIRECTS) {
      console.error(
        `Router: ${MAX_REDIRECTS} redirects without settling, stopping at "${to}". ` +
          "A guard is redirecting to a path its own predicate also rejects.",
      );
      return;
    }
    const seq = ++navSeq;
    navAbort?.abort();
    const controller = new AbortController();
    navAbort = controller;

    const from = untrack(location);
    const resolved = resolvePath(to, from.pathname);
    const parsed = parsePath(resolved);
    const to_ = createLocation(strip(parsed.pathname, base), parsed.search, parsed.hash);

    const match = matchRoutes(to_.pathname, config.routes);
    debug("navigate", to_.pathname, match ? match.route.path : "(no match)");

    const routes = chainOf(match);
    const forParams = match?.params ?? {};

    const guard = await runGuards(from, to_, forParams, routes);
    if (seq !== navSeq) return;
    if (!guard.allowed) {
      // A redirect always writes history, whatever provoked it: the URL bar has
      // to stop showing the route the guard refused.
      if (guard.redirect) await go(guard.redirect, { replace: true }, "user", hops + 1);
      return;
    }

    if (!options.noScroll) saveScroll(locationKey(from));

    if (match === null) {
      if (!replay) history.push(resolved, options.replace ?? false, options.state);
      await commit(() => {
        batch(() => {
          loads.set(EMPTY_LOAD);
          location.set(to_);
        });
      }, kind !== "entry");
      return;
    }

    const hasLoaders = routes.some((route) => route.loader);
    if (hasLoaders) loading.update((n) => n + 1);
    const started = Date.now();

    try {
      const { data, errors } = await loadChain(
        routes,
        forParams,
        to_.searchParams,
        controller.signal,
      );
      if (controller.signal.aborted || seq !== navSeq) return;

      const minimum = config.loadingMinTime ?? 0;
      const elapsed = Date.now() - started;
      if (hasLoaders && elapsed < minimum) {
        await new Promise((r) => setTimeout(r, minimum - elapsed));
        if (seq !== navSeq) return;
      }

      for (const [index, error] of errors.entries()) {
        if (error && !routes[index].errorElement) console.error("Router loader error:", error);
      }

      if (!replay) history.push(resolved, options.replace ?? false, options.state);
      await commit(() => {
        batch(() => {
          loads.set({ key: locationKey(to_), data, errors });
          location.set(to_);
        });
      }, kind !== "entry");

      if (!options.noScroll) restoreScroll(locationKey(to_));
      for (const hook of config.afterEach ?? []) hook({ from, to: to_, params: forParams });
    } finally {
      if (hasLoaders) loading.update((n) => Math.max(0, n - 1));
    }
  }

  /**
   * A failed loader is never cached, so re-running the chain is the whole of a
   * retry. When it succeeds `errors[depth]` becomes null, the branch key stops
   * being the error and starts being the route again, and `branch` rebuilds the
   * depth — the error arm needs no separate teardown.
   */
  async function reload(): Promise<void> {
    const at = untrack(location);
    await go(at.pathname + at.search + at.hash, { noScroll: true }, "replay");
  }

  async function prefetch(path: string): Promise<void> {
    if (prefetched.has(path)) return;
    prefetched.add(path);
    const match = matchRoutes(path, config.routes);
    if (!match) return;
    const signal = new AbortController().signal;
    await Promise.all(
      chainOf(match).map((route) =>
        runLoader(route, match.params, new URLSearchParams(), signal).catch(() => {}),
      ),
    );
  }

  // The entry URL is a navigation. Whether it needs a LOAD is a property of its
  // routes; whether it is subject to `beforeEach`, `beforeEnter` and `afterEach`
  // is not, and gating the pipeline on the loader check let a deep link walk
  // straight into a guarded route.
  const opening = untrack(location);
  void go(opening.pathname + opening.search + opening.hash, { noScroll: true }, "entry");

  history.watch((path, replay) => {
    void go(path, { noScroll: false }, replay ? "replay" : "user");
  });

  return state;
}

// ============================================================================
// History adapters
// ============================================================================

function browserHistory(base: string, signal: AbortSignal): History {
  return {
    initial(): Location {
      return createLocation(
        strip(window.location.pathname, base),
        window.location.search,
        window.location.hash,
      );
    },
    push(path: string, replace: boolean, state: unknown): void {
      const full = path.startsWith("/") ? base + path : path;
      if (replace) window.history.replaceState(state ?? null, "", full);
      else window.history.pushState(state ?? null, "", full);
    },
    watch(onExternal): void {
      window.addEventListener(
        "popstate",
        () => {
          const at = window.location;
          onExternal(strip(at.pathname, base) + at.search + at.hash, true);
        },
        { signal },
      );

      // A plain `<a href>` written by hand, rather than through `Link`. `Link`
      // calls `preventDefault` itself, so its own clicks are already excluded
      // here — which is why the `$$click` expando sniff this file used to carry
      // is gone.
      document.addEventListener(
        "click",
        (event: MouseEvent) => {
          if (event.defaultPrevented) return;
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          if (event.button !== 0) return;
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;
          const anchor = target.closest("a");
          const href = anchor?.getAttribute("href");
          if (!anchor || !href) return;
          if (
            anchor.hasAttribute("download") ||
            anchor.getAttribute("target") === "_blank" ||
            anchor.getAttribute("rel")?.includes("external") ||
            /^[a-z][a-z0-9+.-]*:/i.test(href) ||
            href.startsWith("#")
          ) {
            return;
          }
          event.preventDefault();
          onExternal(href, false);
        },
        { signal },
      );
    },
  };
}

function memoryHistory(initialPath: string): History {
  const parsed = parsePath(initialPath);
  return {
    initial: () => createLocation(parsed.pathname, parsed.search, parsed.hash),
    push: () => {},
    watch: () => {},
  };
}

// ============================================================================
// Context
// ============================================================================

const RouterContext = createContext<RouterState>(undefined, "barq-router");

/** Resolved through the scope chain at READ time, so two routers can coexist. */
function useRouterState(): RouterState {
  return read(RouterContext)();
}

export function useLocation(): Cell<Location> {
  const state = useRouterState();
  return state.location;
}

export function useParams<P extends Params = Params>(): Cell<P> {
  return useRouterState().params as Cell<P>;
}

export function useNavigate(): (to: string, options?: NavigateOptions) => Promise<void> {
  return useRouterState().navigate;
}

export function useIsLoading(): Cell<boolean> {
  return useRouterState().isLoading;
}

export function useMatchedRoutes(): Cell<RouteDefinition[]> {
  return useRouterState().chain;
}

export function useSearchParams(): [
  Cell<SearchParams>,
  (params: Record<string, string> | ((prev: SearchParams) => Record<string, string>)) => void,
] {
  const state = useRouterState();
  const get = (): SearchParams => state.location().searchParams;

  const set = (
    params: Record<string, string> | ((prev: SearchParams) => Record<string, string>),
  ): void => {
    const current = state.location().searchParams;
    const next = typeof params === "function" ? params(current) : params;
    const kept = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== ""));
    const query = new URLSearchParams(kept).toString();
    void state.navigate(state.location().pathname + (query ? `?${query}` : ""), { replace: true });
  };

  return [get, set];
}

// ============================================================================
// Rendering the chain
// ============================================================================

const NOT_FOUND = "404 - Not Found";

/**
 * One `branch` per depth, keyed on the route definition's identity or on the
 * error at that depth. Data is deliberately NOT in the key: it arrives as a
 * Cell, so a fresh loader result updates the route instead of remounting it.
 */
function renderDepth(
  scope: Scope | null,
  state: RouterState,
  depth: number,
  parent: Node | null,
  anchor: Node | null,
): Node | null {
  const routeAt = (): RouteDefinition | null => state.chain()[depth] ?? null;
  const errorAt = (): Error | null => {
    const load = state.loads();
    return load.key === locationKey(state.location()) ? (load.errors[depth] ?? null) : null;
  };
  const key = (): unknown => errorAt() ?? routeAt();

  const body = (instance: Scope | null): unknown => {
    const route = untrack(routeAt);
    if (route === null) {
      if (depth > 0) return null;
      const fallback = state.config.fallback;
      if (fallback) return (fallback as unknown as Invoked)(instance, routeProps(state, depth));
      return document.createTextNode(NOT_FOUND);
    }

    const content = (contentScope: Scope | null): unknown => {
      const failure = untrack(errorAt);
      // The error reaches the boundary the way every other construction failure
      // does. There is no second error channel.
      if (failure !== null && route.errorElement) throw failure;
      return (route.component as unknown as Invoked)(contentScope, routeProps(state, depth));
    };

    if (!route.errorElement) return content(instance);

    const recover = route.errorElement as unknown as InvokedError;
    return boundary(
      instance,
      null,
      null,
      "error",
      ((fallbackScope: Scope | null, error: Cell<Error>, reset: () => void) =>
        recover(fallbackScope, {
          error,
          reset: () => {
            reset();
            void state.reload();
          },
        })) as unknown as Block<unknown>,
      content,
    );
  };

  return branch(scope, parent, anchor, key, body);
}

/** `children` is a Block, so a layout's provider is visible to the route it wraps. */
function routeProps(state: RouterState, depth: number): RouteComponentProps {
  return sources([
    {
      params: () => state.params(),
      data: () => {
        const load = state.loads();
        return load.key === locationKey(state.location()) ? load.data[depth] : undefined;
      },
      children: block((childScope: Scope | null) =>
        renderDepth(childScope, state, depth + 1, null, null),
      ),
    },
  ]) as unknown as RouteComponentProps;
}

// ============================================================================
// Components
// ============================================================================

const anchorTemplate = template("<a></a>");

interface AnchorOptions {
  href: Cell<string>;
  replace: Cell<boolean | undefined>;
  className: Cell<string | undefined>;
  prefetchStrategy: Cell<"hover" | "visible" | "none">;
  children: unknown;
}

/**
 * The href resolves INSIDE the computation that writes the attribute, so a
 * relative href re-resolves when the location moves.
 */
function anchorElement(
  scope: Scope | null,
  state: RouterState,
  options: AnchorOptions,
): HTMLAnchorElement {
  const element = anchorTemplate() as HTMLAnchorElement;

  bindProp(scope, element, setAttr, "href", options.href);
  bindProp(scope, element, setClass, "class", options.className);

  listen(scope, element, "click", ((event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.button !== 0) return;
    if (leavesTheApp(options.href())) return;
    event.preventDefault();
    void state.navigate(options.href(), { replace: options.replace() ?? false });
  }) as EventListener);

  // Both the strategy and the target are read WHEN the listener fires, so a link
  // whose href or prefetch prop moves acts on what it now says. Capturing either
  // at construction is what made both components prefetch a stale path forever.
  const delay = state.config.prefetch?.hoverDelay ?? 100;
  let timer: ReturnType<typeof setTimeout> | undefined;
  listen(scope, element, "mouseenter", () => {
    if (options.prefetchStrategy() !== "hover") return;
    timer = setTimeout(() => void state.prefetch(options.href()), delay);
  });
  listen(scope, element, "mouseleave", () => clearTimeout(timer));

  if (typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver(
      (entries) => {
        if (options.prefetchStrategy() !== "visible") return;
        if (entries[0]?.isIntersecting) {
          void state.prefetch(options.href());
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  }

  insert(scope, element, options.children as never);
  return element;
}

export interface LinkProps {
  href: string;
  replace?: boolean;
  class?: string;
  prefetch?: "hover" | "visible" | "none";
  children?: unknown;
}

type Incoming<P> = { [K in keyof P]-?: StrictAccessor<P[K]> };

function slot<T>(value: unknown, origin: string): Cell<T> {
  return () => readSlot(value, origin) as T;
}

function LinkImpl(scope: Scope | null, props: Incoming<LinkProps>): HTMLAnchorElement {
  const state = useRouterState();
  const href = computed(() =>
    resolvePath(readSlot(props.href, "Link.href") as string, state.location().pathname),
  );

  return anchorElement(scope, state, {
    href,
    replace: slot<boolean | undefined>(props.replace, "Link.replace"),
    className: slot<string | undefined>(props.class, "Link.class"),
    prefetchStrategy: () =>
      (readSlot(props.prefetch, "Link.prefetch") as "hover" | "visible" | "none" | undefined) ??
      state.config.prefetch?.strategy ??
      "none",
    children: props.children,
  });
}

export interface NavLinkProps extends LinkProps {
  activeClass?: string;
  /** @deprecated use `end` */
  exact?: boolean;
  /** Match only when the pathname ends at this href. */
  end?: boolean;
}

function NavLinkImpl(scope: Scope | null, props: Incoming<NavLinkProps>): HTMLAnchorElement {
  const state = useRouterState();
  const href = computed(() =>
    resolvePath(readSlot(props.href, "NavLink.href") as string, state.location().pathname),
  );

  const className = computed(() => {
    const pathname = state.location().pathname;
    const target = href();
    const end =
      (readSlot(props.end, "NavLink.end") as boolean | undefined) ??
      (readSlot(props.exact, "NavLink.exact") as boolean | undefined) ??
      false;
    const active = end ? pathname === target : isUnder(pathname, target);

    const classes: string[] = [];
    const base = readSlot(props.class, "NavLink.class") as string | undefined;
    const activeClass = readSlot(props.activeClass, "NavLink.activeClass") as string | undefined;
    if (base) classes.push(base);
    if (active && activeClass) classes.push(activeClass);
    return classes.join(" ");
  });

  return anchorElement(scope, state, {
    href,
    replace: slot<boolean | undefined>(props.replace, "NavLink.replace"),
    className,
    prefetchStrategy: () =>
      (readSlot(props.prefetch, "NavLink.prefetch") as "hover" | "visible" | "none" | undefined) ??
      state.config.prefetch?.strategy ??
      "none",
    children: props.children,
  });
}

export interface RedirectProps {
  to: string;
  replace?: boolean;
}

/** Navigates as it is constructed and renders nothing. */
function RedirectImpl(_scope: Scope | null, props: Incoming<RedirectProps>): null {
  const state = useRouterState();
  const to = readSlot(props.to, "Redirect.to") as string;
  const replace = (readSlot(props.replace, "Redirect.replace") as boolean | undefined) ?? true;
  void state.navigate(to, { replace });
  return null;
}

export interface RouterProps {
  config: RouterConfig;
  children?: unknown;
}

export interface MemoryRouterProps extends RouterProps {
  initialPath?: string;
}

/**
 * `Router` and `MemoryRouter` differ by ONE expression — which history they are
 * a view of. Everything else was ~46 lines of copy-paste.
 */
function mount(
  scope: Scope | null,
  config: RouterConfig,
  children: unknown,
  history: History,
): unknown {
  const state = createRouter(config, history);
  return provide(scope as Scope, RouterContext, cell(state), (inner: Scope | null) => {
    if (children === undefined || children === null)
      return renderDepth(inner, state, 0, null, null);
    return typeof children === "function"
      ? (children as (s: Scope | null) => unknown)(inner)
      : children;
  });
}

function RouterImpl(scope: Scope | null, props: Incoming<RouterProps>): unknown {
  const config = readSlot(props.config, "Router.config") as RouterConfig;
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  return mount(scope, config, props.children, browserHistory(config.base || "", controller.signal));
}

function MemoryRouterImpl(scope: Scope | null, props: Incoming<MemoryRouterProps>): unknown {
  const config = readSlot(props.config, "MemoryRouter.config") as RouterConfig;
  const initialPath =
    (readSlot(props.initialPath, "MemoryRouter.initialPath") as string | undefined) || "/";
  return mount(scope, config, props.children, memoryHistory(initialPath));
}

/**
 * This module is not compiled, so it applies `block()` itself — the brand plus
 * the ambient-owner establishment the compiler does at an authored declaration.
 * The declared type omits the scope because TypeScript resolves a component's
 * props from its FIRST parameter and offers no hook to say otherwise.
 */
type Authored<P> = (props: P) => JSXElement;

export const Link = block(LinkImpl) as unknown as Authored<LinkProps>;
export const NavLink = block(NavLinkImpl) as unknown as Authored<NavLinkProps>;
export const Redirect = block(RedirectImpl) as unknown as Authored<RedirectProps>;
export const Router = block(RouterImpl) as unknown as Authored<RouterProps>;
export const MemoryRouter = block(MemoryRouterImpl) as unknown as Authored<MemoryRouterProps>;

// ============================================================================
// Route definition helpers
// ============================================================================

/**
 * A route table is a LITERAL data structure, never a JSX tree: route discovery
 * must not be route construction. Types are inferred from the literal, so no
 * generator is needed.
 */
export function route<TPath extends string, TData = unknown>(definition: {
  path: TPath;
  component: RouteComponent<TData, PathParams<TPath>>;
  loader?: Loader<TData, PathParams<TPath>>;
  children?: RouteDefinition[];
  beforeEnter?: NavigationGuard;
  errorElement?: ErrorComponent;
}): RouteDefinition {
  return definition as unknown as RouteDefinition;
}

/** @deprecated use `route()` */
export function defineRoute<T, P extends Params = Params>(
  definition: RouteDefinition<T, P>,
): RouteDefinition<T, P> {
  return definition;
}

export function defineRoutes(routes: RouteDefinition[]): RouteDefinition[] {
  return routes;
}
