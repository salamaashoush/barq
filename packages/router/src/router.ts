/**
 * Router state: the location, the match, and the loader cells.
 *
 * A loader's result is a KEYED async `computed`, not a promise stored in a
 * signal. That one decision is what makes SSR work with no second mechanism:
 * the server reads it during the render and the seed channel records it under
 * its key, and the client's first read of the same key consumes the seed
 * instead of fetching. `signals.ts` already does all of it — the router's whole
 * contribution is choosing a key that is stable across the two sides.
 *
 * The key is EXPLICIT and never the positional auto-key. A position is not an
 * identity: "if the client tree diverges from the server's, the ids after the
 * divergence shift, and a read can claim the value recorded for a DIFFERENT
 * call". A client-side navigation before hydration is exactly that divergence.
 */

import {
  type Cell,
  NotReadyError,
  computed,
  flush,
  latest,
  refresh,
  root,
  runWithOwner,
  signal,
  untrack,
} from "@barqjs/core";

import { Redirect } from "./errors.ts";
import { type History, type Location, href, memoryHistory, parseLocation } from "./history.ts";
import { type Match, type Matcher, createMatcher } from "./matcher.ts";
import { type AnyRouteDefinition, type Route, flattenRoutes } from "./route.ts";
import { leavesTheApp, resolvePath } from "./path.ts";
import { type ScrollRestoration, scrollRestoration, withViewTransition } from "./scroll.ts";
import {
  type SearchMiddleware,
  SearchParamError,
  applySearchMiddleware,
  searchRecord,
  toSearchString,
  validateSearch,
} from "./search.ts";

const NOOP = (): void => {};

/** How many resolved loader cells to keep. Beyond this the oldest go. */
const DEFAULT_CACHE_SIZE = 100;

/**
 * TanStack's defaults, and they are the right ones: a navigation revalidates by
 * default, a preload does not re-preload for half a minute, and nothing is
 * collected for five.
 */
const DEFAULT_STALE_TIME = 0;
const DEFAULT_PRELOAD_STALE_TIME = 30_000;
const DEFAULT_GC_TIME = 300_000;
const DEFAULT_PRELOAD_GC_TIME = 300_000;

/**
 * Why a route's loader is being asked for data.
 *
 * `preload` is STORED on the entry, unlike TanStack's, which synthesizes it into
 * an ephemeral context and never writes it to the match (`load-client.ts:374`,
 * `:588`) — so `match.cause` there is only ever `enter` or `stay` despite the
 * type saying otherwise. Storing it is what lets `shouldReload` see it and what
 * decides which stale budget applies.
 */
export type LoadCause = "preload" | "enter" | "stay";

/** What of a route runs on the server. See `RouteDefinition.ssr`. */
export type SsrMode = boolean | "data-only";

/**
 * The effective `ssr` for each depth of a chain, after inheritance.
 *
 * TanStack's rule, and the asymmetry is the whole of it: `false` is absorbing
 * downward, `"data-only"` clamps a child's `true`, and a child may always
 * declare `false` for itself.
 */
export function resolveSsr(chain: readonly Route[]): readonly SsrMode[] {
  const out: SsrMode[] = [];
  let parent: SsrMode = true;
  for (const route of chain) {
    const own = route.definition.ssr ?? true;
    let mode: SsrMode;
    if (parent === false) mode = false;
    else if (own === true && parent === "data-only") mode = "data-only";
    else mode = own;
    out.push(mode);
    parent = mode;
  }
  return out;
}

/** One cached loader result, and everything the reload policy reads. */
interface Entry {
  readonly key: string;
  readonly route: Route;
  /** The keyed async `computed`. Reloaded with `refresh`, never replaced. */
  readonly cell: Cell<unknown>;
  /**
   * Disposes the entry's own scope, which ABORTS whatever is in flight.
   *
   * Only ever called on an entry that has SETTLED and is not in the current
   * chain — see `sweep`. Disposing one a boundary is parked on aborts the fetch,
   * the promise never settles into the graph, the boundary never re-arms and
   * nothing surfaces: a permanent spinner, silently. Measured.
   */
  readonly dispose: () => void;
  /** When the loader last settled. `0` until it has. */
  updatedAt: number;
  /**
   * The last value this entry settled on, remembered so a FAILED reload can
   * keep showing it.
   *
   * Core's `latest()` throws the error for an errored cell rather than reading
   * through it, which would destroy exactly the stale content `background`
   * exists to preserve. TanStack keeps the page: a background reload runs on a
   * clone and a non-success leaves the old match renderable
   * (`load-client.ts:694-700`).
   */
  settled: { value: unknown } | null;
  /** The error from the most recent failed load, if the last one failed. */
  error: unknown;
  cause: LoadCause;
  /** What `loaderDeps` selected for this entry, so `shouldReload` can see it. */
  readonly deps: unknown;
  /**
   * Bumped to make a held read re-evaluate — see `pendingMinMs`.
   *
   * A signal rather than a timer the reader owns, because the READ is what has
   * to notice: the value may have settled while the fallback was still being
   * held, and nothing else would wake the boundary.
   */
  readonly hold: ReturnType<typeof signal<number>>;
  /** When this entry's `pending` fallback was first shown. `0` if it never was. */
  shownAt: number;
  /** Whether this entry was born of a preload, which picks the stale budget. */
  preload: boolean;
  /** Aborts the run in flight, if any. */
  abort: (reason: string) => void;
  inFlight: boolean;
}

/**
 * A key for anything a `loaderDeps` may return, stable under key order.
 *
 * TanStack uses a plain `JSON.stringify` here (`router.ts:1605`), so `{a,b}` and
 * `{b,a}` are two generations of the same data. `loaderKey` already sorts params
 * for that reason and deps get the same treatment.
 */
export function depsKey(value: unknown): string {
  if (value === undefined) return "";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "";
  if (Array.isArray(value)) return `[${value.map(depsKey).join(",")}]`;
  const record = value as Record<string, unknown>;
  const names = Object.keys(record).toSorted();
  return `{${names.map((name) => `${JSON.stringify(name)}:${depsKey(record[name])}`).join(",")}}`;
}

export interface NavigateOptions {
  readonly replace?: boolean;
  readonly state?: unknown;
  /**
   * Go to the top instead of wherever this location was left.
   *
   * A filter change is not a place you return to, so `useSearchParams` sets it.
   */
  readonly resetScroll?: boolean;
  /** Wrap this navigation's commit in a view transition. */
  readonly viewTransition?: boolean;
  /**
   * Show a DIFFERENT url than the one being rendered.
   *
   * A photo opened over a feed renders `/photos/5` while the address bar reads
   * `/feed` — so closing it is a back button and copying the link shares the
   * feed. The real target rides in `history.state`, which survives a reload in
   * the same tab and does NOT survive being pasted somewhere else: a shared
   * masked URL renders the MASK, which is the whole point of choosing it.
   */
  readonly mask?: string;
}

/**
 * What `runBeforeLoad` answers with.
 *
 * `contexts` is the merged context per depth, which is what everything reads.
 * `produced` is each `beforeLoad`'s OWN return, which is the only part worth
 * carrying across hydration — the merge is reproducible from it and the
 * synchronous `context()`s.
 */
export interface BeforeLoadResult {
  readonly contexts: readonly Record<string, unknown>[];
  readonly produced: readonly (Record<string, unknown> | undefined)[];
}

/**
 * The hydration handoff, as it goes on the wire.
 *
 * `href` is what the SERVER rendered. A client that has already navigated —
 * D9's server-matched-A/client-matched-B divergence — must not adopt a context
 * built for a different location, so the href is checked before it is used.
 *
 * WHAT THIS EXPOSES, stated rather than left to be discovered: a `beforeLoad`'s
 * return value reaches the browser. That is very nearly not a change —
 * `beforeLoad` is isomorphic and already runs in the browser on every
 * navigation after the first, so its output is client-visible either way. The
 * delta is the FIRST location, where the server's run may have read something a
 * browser cannot, such as a cookie. Authorization must not live here regardless:
 * `beforeEnter` and `beforeLoad` are UX, and the boundary is a server function's
 * middleware, which the route-action manifest verifies.
 */
export interface BeforeLoadSeed {
  readonly href: string;
  readonly produced: readonly (Record<string, unknown> | undefined)[];
}

/** Where the hydration handoff is left for the client router to find. */
export const ROUTE_CONTEXT_GLOBAL = "__BARQ_ROUTE_CONTEXT__";

/** Where the real target hides while the URL shows something else. */
const MASK = "__barqMask";

/** The path a location actually matches, which is not always the one it shows. */
export function unmask(location: Location): string {
  const state = location.state;
  if (state === null || typeof state !== "object") return location.pathname;
  const masked = (state as Record<string, unknown>)[MASK];
  return typeof masked === "string" ? masked : location.pathname;
}

/**
 * A guard runs before the location commits.
 *
 * `false` refuses, a string redirects, anything else allows. It is UX, not
 * authorization: it runs on the client on every navigation after the first, and
 * the server function a loader calls is reachable without it. TanStack's docs
 * say the same about theirs — "A route guard is not a data authorization
 * boundary" — and the difference here is that `@barqjs/start` gives the place
 * where the check does belong.
 */
export type Guard = (context: {
  readonly from: Location;
  readonly to: Location;
  readonly params: Record<string, string>;
}) => boolean | string | Promise<boolean | string>;

/**
 * Asked before a navigation commits. Return `true` to BLOCK it.
 *
 * The sense is "should block" rather than "may proceed", and that is a safety
 * choice rather than a style one: a blocker that forgets to return answers
 * `undefined`, and the falsy default has to be the one that lets the user keep
 * navigating. The other way round, one missing `return` makes an application
 * impossible to leave. TanStack's `shouldBlockFn` reads the same way.
 *
 * UX, like `beforeEnter` and unlike `middleware`: it runs on the client only,
 * and nothing about it reaches a server function.
 */
export type Blocker = (context: {
  readonly from: Location;
  readonly to: Location;
}) => boolean | void | Promise<boolean | void>;

export interface RouterConfig {
  /**
   * The route table, as `routeTree.gen.ts` exports it.
   *
   * Named for what it IS rather than for what it holds, which is TanStack's
   * name (`createRouter({ routeTree })`, `examples/react/start-basic/src/
   * router.tsx:7`) and worth matching: an application arriving from theirs
   * writes one word differently in one place, or none at all.
   */
  readonly routeTree: readonly AnyRouteDefinition[];
  readonly history?: History;
  /** Rendered at depth 0 when nothing matched. */
  readonly notFound?: AnyRouteDefinition["component"];
  readonly beforeEach?: readonly Guard[];
  readonly afterEach?: readonly ((location: Location) => void)[];
  readonly cacheSize?: number;
  /**
   * Remember and restore scroll positions across navigations. Default ON in a
   * browser, and a no-op without a DOM.
   */
  readonly scrollRestoration?: boolean;
  /** Wrap every commit in a view transition unless a navigation says otherwise. */
  readonly viewTransition?: boolean;
  /**
   * Told about every loader rejection, before it propagates.
   *
   * A loader that throws during SSR does NOT otherwise reach the page handler:
   * the value is an async `computed`, `settle` awaits it with `allSettled`, and
   * a rejection lands on an error boundary rather than unwinding out of
   * `renderPage`. So a `throw redirect(...)` or a middleware's
   * `throw new Response(401)` rendered as an error and answered 200.
   *
   * A callback rather than an ambient store, because it must be request-scoped
   * and a module-level "current answer" is GHSA-hgv7-v322-mmgr — one request's
   * answer handed to another under load. The router state is already
   * request-scoped on the server, so the callback rides it.
   */
  readonly onLoaderError?: (error: unknown) => void;
}

/**
 * What a loader cell is keyed by, and what the seed carries.
 *
 * `deps` is the third field because a loader is HANDED the search and was not
 * KEYED by it: `/posts?page=1` then `/posts?page=2` reused the first cell and
 * answered with page 1 forever, with one loader invocation and no error. The
 * fix is coarse on purpose — the whole search, so a route that reads any of it
 * is correct — and `loaderDeps` narrows it to the part a route actually uses,
 * which is what stops an unrelated `?ref=` busting every cache on the page.
 *
 * Delimited, unlike TanStack, whose match id is `route.id + interpolatedPath +
 * JSON.stringify(loaderDeps)` with no separator (`router.ts:1623-1629`).
 */
export function loaderKey(
  routeId: string,
  params: Readonly<Record<string, string>>,
  deps = "",
): string {
  // Sorted, so two renders of the same match agree byte for byte regardless of
  // the order the matcher happened to fill `params` in.
  const names = Object.keys(params).toSorted();
  const pairs = names.map((name) => `${name}=${params[name]}`).join("&");
  return deps === "" ? `r:${routeId}|${pairs}` : `r:${routeId}|${pairs}|${deps}`;
}

/**
 * The search, in a form two renders of the same URL agree on byte for byte.
 *
 * Sorted by name and then by value, because `?b=2&a=1` and `?a=1&b=2` are the
 * same request and a key that says otherwise refetches for nothing. Repeated
 * keys are kept — `?tag=a&tag=b` is not `?tag=b`.
 */
export function searchKey(search: URLSearchParams): string {
  const pairs: string[] = [];
  for (const [name, value] of search) pairs.push(`${name}=${value}`);
  return pairs.toSorted().join("&");
}

export interface RouterState {
  readonly location: Cell<Location>;
  readonly match: Cell<Match<Route> | null>;
  readonly params: Cell<Record<string, string>>;
  readonly search: Cell<URLSearchParams>;
  readonly chain: Cell<readonly Route[]>;
  /** The VALIDATED search for the deepest matched route. Raw when nothing validates. */
  readonly validSearch: Cell<Record<string, unknown>>;
  /**
   * The validation failure at one depth, if that route's validator refused.
   *
   * Read from inside the route's own boundary and re-thrown there, so a bad
   * `?page=banana` renders that route's `errorComponent` rather than taking the
   * whole page down.
   */
  searchErrorAt(depth: number): SearchParamError | null;
  readonly matcher: Matcher<Route>;
  readonly config: RouterConfig;
  readonly history: History;
  /**
   * Tell the router this depth's `pending` fallback is on screen.
   *
   * `pendingMinMs` needs a start time, and only the thing that RENDERS the
   * fallback knows when that was.
   */
  markPending(route: Route, params: Readonly<Record<string, string>>): void;
  /** The loader cell for one route at one set of params, created once per key. */
  dataFor(
    route: Route,
    params: Readonly<Record<string, string>>,
    /** The string backend passes `true`: see `readerFor`. */
    blocking?: boolean,
  ): Cell<unknown>;
  /**
   * Start every loader in the matched chain, without rendering anything.
   *
   * Loaders are PULL-based here: a read starts the fetch. A child's boundary is
   * built inside its parent's content, so a parent that parks means the child's
   * loader has NOT STARTED — and that is a waterfall on both backends: depth 1
   * begins only once depth 0 has settled and been resumed, so a chain of N costs
   * N round trips end to end instead of one.
   *
   * THE REASON THIS COMMENT USED TO GIVE IS STALE and is recorded because the
   * numbers below were measured against it: `renderPage` rendered TWICE, so
   * pass 1 parked at depth 0, pass 2 was depth 1's first read, and there was no
   * pass 3 — which made a deep chain not merely slow but WRONG, one depth of
   * three in the markup and one seed of three. That pass is gone; the buffered
   * arm parks and resumes like the stream, so the failure is now latency rather
   * than truncation. The fix is the same one either way.
   *
   * Priming is one pass over the chain and it fixes both. Measured, same chain
   * at 40 ms a loader: 121 ms to 41 ms, and the three loaders start in the same
   * millisecond instead of 40 ms apart.
   *
   * MUST be called from INSIDE the render, not before it. A value whose first
   * read happens outside a render session is attributed to the `null` bucket
   * and is seeded into nobody (`signals.ts` `getHydrationData`, and the reason
   * is `38eee03`).
   *
   * `server` skips the depths `resolveSsr` says do not run there.
   */
  prime(server?: boolean): void;
  navigate(to: string, options?: NavigateOptions): Promise<void>;
  /**
   * The merged route context, one entry per depth, outermost first.
   *
   * Empty until `runBeforeLoad` has produced one for the current location —
   * which `navigate` does before it commits, and which the page handler does
   * before the shell.
   */
  readonly contexts: Cell<readonly Record<string, unknown>[]>;
  /** Install a context array computed elsewhere — the page handler does this. */
  setContexts(next: readonly Record<string, unknown>[]): void;
  /**
   * Produce the context for the CURRENT location, if nothing has yet.
   *
   * Idempotent, and called by whichever component mounts the router. On the
   * server the page handler has already installed one, so this is a no-op
   * there; on the client it is what gives `useRouteContext()` an answer before
   * the first navigation. It duplicates the server's run — the cost stated on
   * `RouteDefinition.beforeLoad`.
   *
   * Returns the promise so a caller that needs the context settled — a test, a
   * server-side driver — can await it. The mount components do not.
   */
  start(): Promise<void>;
  /**
   * Run every `context` and `beforeLoad` in a candidate chain, outermost first.
   *
   * Serial by construction, because each one is handed everything the routes
   * above it contributed. Throws whatever a `beforeLoad` threw — a `Redirect`,
   * a `NotFound` or a `Response` — so the caller decides the answer while it
   * still can.
   */
  runBeforeLoad(
    to: Location,
    candidate: Match<Route> | null,
    options?: { readonly server?: boolean },
  ): Promise<BeforeLoadResult>;
  /**
   * Adopt a context the SERVER already produced, without re-running `beforeLoad`.
   *
   * The synchronous `context()`s re-run here — they take no I/O and re-running
   * one is cheaper than serializing it — and each depth's `produced` entry is
   * merged in on top.
   */
  hydrateContexts(to: Location, produced: BeforeLoadSeed["produced"]): void;
  /** What of each matched depth runs on the server, outermost first. */
  readonly ssrModes: Cell<readonly SsrMode[]>;
  /**
   * Apply the matched chain's search middlewares to a location being BUILT.
   *
   * `Link` and `navigate` both go through this; an inbound URL does not. An
   * inbound URL is a fact and a built one is an intent, and only an intent can
   * be edited — which is TanStack's placement (`router.ts:2006`) and the reason
   * theirs has exactly one call site too.
   */
  buildSearch(to: string): string;
  /**
   * Warm the cache for a path the user has not gone to yet.
   *
   * Runs `beforeLoad` — the loader is handed the context its ancestors build,
   * so skipping it would fetch with a different context than the navigation
   * will. TanStack's preload runs its `beforeLoad`s too.
   *
   * Nothing is remembered about a FAILURE. The old router kept a `prefetched`
   * Set, filled it BEFORE testing whether the path matched, and never evicted
   * from it — so one hover over a broken link disabled prefetch for that path
   * for the router's lifetime, and after the cache TTL expired the whole app
   * stopped prefetching. The entry cache is the dedupe here, and it expires.
   */
  preload(to: string): Promise<void>;
  /**
   * Refuse a navigation before it happens.
   *
   * Returns an unregister. A blocker that answers `true` stops the navigation
   * dead; anything falsy lets it through. Every registered blocker is asked, in
   * registration order, and the FIRST refusal ends it, so a form with unsaved
   * changes does not have to know about any other.
   *
   * It runs before `beforeLoad`, because a navigation nobody is going to make
   * should not be building context for it.
   */
  block(blocker: Blocker): () => void;
  /** Whether there is anything to go back TO. See `History.depth`. */
  canGoBack(): boolean;
  /**
   * A navigation has been asked for and has not committed.
   *
   * Not a loading counter — `packages/router/DESIGN.md` rules that out, because
   * loading is a boundary per route depth. This is the gap between `navigate`
   * being called and the location changing, which is where blockers, guards and
   * `beforeLoad` run.
   */
  readonly isNavigating: Cell<boolean>;
  /** Drop every cached loader result and re-read the current location. */
  invalidate(): void;
  dispose(): void;
}

export function createRouter(config: RouterConfig): RouterState {
  const history = config.history ?? memoryHistory();
  const matcher = createMatcher(flattenRoutes(config.routeTree));

  const location = signal<Location>(history.current());
  // Bumped by `invalidate`, and read by every loader cell, so invalidating is a
  // reactive fact rather than a cache the router has to reach into.
  const generation = signal(0);

  // MATCHED against the unmasked path, and displayed as `location()`. A mask is
  // the one place those differ, and keeping the split here means nothing else in
  // the router has to know about it: links stay active against what the user
  // sees, and the chain is built from what is actually being rendered.
  const match = computed<Match<Route> | null>(() => matcher.match(unmask(location())));
  const params = computed<Record<string, string>>(() => match()?.params ?? {});
  const search = computed(() => new URLSearchParams(location().search));

  /**
   * The validated search, one entry per depth, and the LAST one is what
   * `useSearch()` answers with.
   *
   * A route's validator sees the raw search with every ancestor's validated
   * output layered over it, so unknown keys survive; `_defaults` records what a
   * validator ADDED, which is how `stripSearchParams` tells a schema default
   * from a value the caller asked for.
   *
   * A failure does NOT throw here. `computed` is read during a render, and a
   * throw would take the page rather than the route: the error is stored and
   * re-thrown by `searchErrorAt`, from inside the route's own boundary.
   */
  const validated = computed<{
    readonly slices: readonly Record<string, unknown>[];
    readonly defaults: ReadonlyMap<string, unknown>;
    readonly failures: readonly (SearchParamError | null)[];
  }>(() => {
    const raw = searchRecord(search());
    const slices: Record<string, unknown>[] = [];
    const failures: (SearchParamError | null)[] = [];
    const defaults = new Map<string, unknown>();
    let merged: Record<string, unknown> = raw;
    for (const route of chain()) {
      const validator = route.definition.validateSearch;
      if (validator === undefined) {
        slices.push(merged);
        failures.push(null);
        continue;
      }
      try {
        const slice = validateSearch(validator, { ...merged });
        for (const [key, value] of Object.entries(slice)) {
          if (!(key in raw)) defaults.set(key, value);
        }
        merged = { ...merged, ...slice };
        slices.push(merged);
        failures.push(null);
      } catch (error) {
        failures.push(
          error instanceof SearchParamError
            ? error
            : new SearchParamError((error as Error).message ?? "search did not validate"),
        );
        slices.push(merged);
      }
    }
    return { slices, defaults, failures };
  });
  const chain = computed<readonly Route[]>(() => match()?.route.chain ?? []);

  const entries = new Map<string, Entry>();
  const limit = config.cacheSize ?? DEFAULT_CACHE_SIZE;
  const now = (): number => Date.now();

  /**
   * The key an entry is filed under, and the key its value is SEEDED under.
   *
   * `loaderDeps` narrows it; without one the whole search goes in, so a route
   * that reads any of it is correct by default. The generation is not in the
   * seed key — the server always renders at generation 0 and a client that has
   * invalidated since would look for a key the server never wrote.
   */
  const keyOf = (
    route: Route,
    forParams: Readonly<Record<string, string>>,
    forSearch: URLSearchParams,
  ): { seedKey: string; deps: unknown } => {
    const project = route.definition.loaderDeps;
    if (project === undefined) {
      return { seedKey: loaderKey(route.id, forParams, searchKey(forSearch)), deps: undefined };
    }
    const deps = project({ search: forSearch });
    return { seedKey: loaderKey(route.id, forParams, depsKey(deps)), deps };
  };

  /**
   * Build one entry.
   *
   * `runWithOwner(null, () => root(...))` and BOTH halves are load-bearing.
   *
   * `root` alone is not enough: a detached scope still does
   * `makeScope(getCurrentOwner())`, which copies `ctx` and `catcher` and keeps
   * the parent as a field. An entry minted during a render would then pin that
   * render's scope — including its DOM range — for its whole life, read that
   * render's context forever, and route its throws to whichever error boundary
   * happened to be above the FIRST reader. Measured: `entry.parent is null?
   * false`, and a cached entry kept answering with the tenant of the render that
   * created it.
   *
   * `runWithOwner(null, ...)` alone is not enough either: an owner-less pure
   * computed is in neither `owner.kids` nor `orphans`, `disposeNode` is not
   * exported, and dropping it from the Map leaks its dependency links and leaves
   * an unsettled promise in the module-global `inFlight` that `settle()` waits
   * on forever.
   *
   * Together: no inherited context, no pinned parent, and a `dispose` the router
   * owns.
   */
  const mint = (
    route: Route,
    forParams: Readonly<Record<string, string>>,
    forSearch: URLSearchParams,
    seedKey: string,
    deps: unknown,
    cause: LoadCause,
    /**
     * The context this entry's loader is handed.
     *
     * A PRELOAD's target chain is not the committed one, so `contextAt` — which
     * reads the committed chain — would hand it the context of the page the
     * user is still on. Passing it explicitly is the only correct answer.
     */
    forContext?: Record<string, unknown>,
  ): Entry => {
    const loader = route.definition.loader;
    let entry!: Entry;

    const cell = runWithOwner(null, () =>
      root<Cell<unknown>>((disposeScope) => {
        let controller: AbortController | null = null;
        const abort = (reason: string): void => {
          const live = controller;
          controller = null;
          if (live !== null) live.abort(reason);
        };

        const built: Cell<unknown> =
          loader === undefined
            ? () => undefined
            : computed(
                async () => {
                  // One controller per RUN, aborted when a newer run supersedes
                  // it and when the entry is disposed. `resource` has exactly
                  // this (its A1/A2) and cannot be used: a SEEDED resource can
                  // never be reloaded, because a seeded first run never enters
                  // `compute`, so `bump` never becomes a dependency and
                  // `refetch()` invalidates nothing. Measured — 0 fetches after
                  // a seed, against 1 for a keyed `computed` plus `refresh()`.
                  abort("a newer request was issued");
                  const own = new AbortController();
                  controller = own;
                  entry.inFlight = true;
                  // `null` when nothing is pending, so the common case does not
                  // pay even a microtask.
                  if (contextsReady !== null) await contextsReady;
                  try {
                    const value = await loader({
                      params: forParams as never,
                      search: route.definition.loaderDeps === undefined ? forSearch : undefined,
                      deps: deps as never,
                      cause: entry.cause,
                      context: forContext ?? contextAt(route),
                      signal: own.signal,
                    });
                    if (controller === own) controller = null;
                    entry.inFlight = false;
                    entry.updatedAt = now();
                    entry.settled = { value };
                    entry.error = undefined;
                    return value;
                  } catch (error) {
                    if (controller === own) controller = null;
                    entry.inFlight = false;
                    entry.error = error;
                    config.onLoaderError?.(error);
                    throw error;
                  }
                },
                { key: seedKey },
              );

        entry = {
          key: seedKey,
          route,
          cell: built,
          dispose: () => {
            abort("the router collected this cache entry");
            disposeScope();
          },
          updatedAt: 0,
          settled: null,
          error: undefined,
          cause,
          deps,
          hold: signal(0),
          shownAt: 0,
          preload: cause === "preload",
          abort,
          inFlight: false,
        };
        return built;
      }),
    );
    void cell;

    entries.set(seedKey, entry);
    evict();
    return entry;
  };

  /**
   * The ceiling, which is not the sweep.
   *
   * Only a SETTLED entry outside the current chain may go, for `Entry.dispose`'s
   * reason — and the oldest such, so this stays insertion-ordered. An entry
   * nothing can drop keeps the map above `limit`, which is correct: a bound that
   * hangs the page is not a bound worth having.
   */
  const evict = (): void => {
    if (entries.size <= limit) return;
    const live = liveKeys();
    for (const [key, entry] of entries) {
      if (entries.size <= limit) return;
      if (live.has(key) || entry.inFlight) continue;
      entry.dispose();
      entries.delete(key);
    }
  };

  const liveKeys = (): Set<string> => {
    const keys = new Set<string>();
    const forParams = untrack(params);
    const forSearch = untrack(search);
    for (const route of untrack(chain)) keys.add(keyOf(route, forParams, forSearch).seedKey);
    return keys;
  };

  /**
   * Collect on navigation, which is TanStack's shape and the right one — a
   * timer per entry buys nothing a commit-time pass does not.
   *
   * Unlike theirs, the sweep DISPOSES, which aborts what is in flight and is
   * what makes `gcTime` mean something rather than decorate a Map that grows
   * forever. That is only safe under the settled-and-unmatched rule.
   */
  const sweep = (): void => {
    const live = liveKeys();
    const at = now();
    for (const [key, entry] of entries) {
      if (live.has(key) || entry.inFlight || entry.updatedAt === 0) continue;
      const definition = entry.route.definition;
      const budget = entry.preload
        ? (definition.preloadGcTime ?? DEFAULT_PRELOAD_GC_TIME)
        : (definition.gcTime ?? DEFAULT_GC_TIME);
      if (at - entry.updatedAt < budget) continue;
      entry.dispose();
      entries.delete(key);
    }
  };

  /** Whether a cached entry should be asked again, and the three-way that decides. */
  const shouldReload = (entry: Entry, forParams: Readonly<Record<string, string>>): boolean => {
    if (entry.inFlight) return false;
    if (entry.updatedAt === 0) return false;
    const definition = entry.route.definition;
    const configured =
      typeof definition.shouldReload === "function"
        ? definition.shouldReload({
            params: forParams as never,
            deps: entry.deps as never,
            cause: entry.cause,
            updatedAt: entry.updatedAt,
          })
        : definition.shouldReload;
    if (configured !== undefined) return Boolean(configured);
    const budget = entry.preload
      ? (definition.preloadStaleTime ?? DEFAULT_PRELOAD_STALE_TIME)
      : (definition.staleTime ?? DEFAULT_STALE_TIME);
    return now() - entry.updatedAt >= budget;
  };

  const acquire = (
    route: Route,
    forParams: Readonly<Record<string, string>>,
    cause: LoadCause,
  ): Entry => {
    const forSearch = untrack(search);
    const { seedKey, deps } = keyOf(route, forParams, forSearch);
    const existing = entries.get(seedKey);
    if (existing === undefined) {
      return mint(route, forParams, forSearch, seedKey, deps, cause);
    }
    // A `stay` never downgrades an `enter`, and a real navigation upgrades a
    // preload — which is what moves the entry off the preload budget.
    if (cause !== "preload" && existing.preload) {
      existing.preload = false;
      existing.cause = cause;
    }
    return existing;
  };

  /**
   * The read one route depth gets, and the mode is a property of the READ.
   *
   * `blocking` is the plain read: a refreshing cell throws `NotReadyError` and
   * the boundary puts the fallback back. `background` reads through it with
   * `latest`, so the previous value stays on screen.
   *
   * On the SERVER both are the plain read, and `blocking` is passed by the
   * CALL SITE rather than sniffed. The string backend invokes a Block with no
   * observer, and `latest()` short-circuits on `currentObserver === null` and
   * hands back `node._value` — `undefined` for a cold cell. Measured: a
   * `background` route SSR'd as literal `<b>undefined</b>` with an empty seed,
   * because nothing parked so the seed channel never opened.
   *
   * Sniffing the environment was tried and is wrong: `typeof document` is not
   * the question, and answering it that way made the router's own SSR tests
   * take the client path, because happy-dom defines `document` in exactly the
   * process that renders the string backend. Each backend knows which it is.
   *
   * It is not a patch either: `staleReloadMode` governs a RELOAD of a settled
   * value, and on the server every value is cold.
   */
  const readerFor = (entry: Entry, blocking: boolean): Cell<unknown> => {
    const mode = entry.route.definition.staleReloadMode ?? "background";
    const held = (): boolean => {
      const minimum = entry.route.definition.pendingMinMs ?? 0;
      if (minimum === 0 || entry.shownAt === 0) return false;
      // Read the signal so this re-evaluates when the hold expires.
      entry.hold();
      const remaining = entry.shownAt + minimum - now();
      if (remaining <= 0) return false;
      setTimeout(() => entry.hold.set(untrack(entry.hold) + 1), remaining);
      return true;
    };
    const plain: Cell<unknown> = () => {
      // A settled value that arrived while the fallback was still being held
      // keeps throwing until the hold expires, so a skeleton that appeared does
      // not vanish two frames later.
      if (held()) throw new NotReadyError({ _flags: 0 });
      return entry.cell();
    };
    if (blocking || mode === "blocking") return plain;
    return () => {
      if (held()) throw new NotReadyError({ _flags: 0 });
      try {
        return latest(entry.cell);
      } catch (error) {
        // A FAILED reload keeps the last good value rather than replacing the
        // page with an error boundary — TanStack's behaviour, and the reason
        // `Entry.settled` is remembered. A cold failure has nothing to show and
        // goes to the boundary, which is where it belongs.
        if (entry.settled !== null) return entry.settled.value;
        throw error;
      }
    };
  };

  /**
   * Memoised per MATCH rather than rebuilt per read.
   *
   * `props([{...}])` returns a single plain record UNCHANGED, so nothing
   * memoises `props.data`: every read used to run `Object.keys().toSorted()`, a
   * `.map`, a `.join` and a template before the Map lookup. Measured at 152 ns
   * against 4.3 ns for a settled read over a memoised key.
   *
   * `params` is a `computed`, so its identity is stable for as long as the match
   * is — which makes an identity compare the whole of the invalidation rule.
   */
  const memo = new Map<Route, { params: unknown; blocking: boolean; reader: Cell<unknown> }>();

  const dataFor = (
    route: Route,
    forParams: Readonly<Record<string, string>>,
    blocking = false,
  ): Cell<unknown> => {
    const hit = memo.get(route);
    if (hit !== undefined && hit.params === forParams && hit.blocking === blocking) {
      return hit.reader;
    }
    const entry = acquire(route, forParams, causeFor(route));
    const reader = readerFor(entry, blocking);
    memo.set(route, { params: forParams, blocking, reader });
    return reader;
  };

  const contexts = signal<readonly Record<string, unknown>[]>([]);

  /**
   * Resolves once a context exists for the current location.
   *
   * A loader is handed the context its ancestors built, and on the client the
   * RENDER is synchronous while `beforeLoad` is not — so the first read minted
   * a cell and ran the loader with an empty context before `start()` had
   * finished. The loader body is async anyway, so awaiting one microtask here
   * costs nothing and removes the race.
   *
   * Armed only when the matched chain actually declares a `context` or a
   * `beforeLoad`: otherwise there is nothing to wait for, and a router driven
   * without ever being mounted — a test, a probe — would wait forever.
   */
  let releaseContexts = NOOP;
  let contextsReady: Promise<void> | null = null;
  const armContexts = (): void => {
    contextsReady = new Promise<void>((resolve) => {
      releaseContexts = resolve;
    });
  };
  const settleContexts = (next: readonly Record<string, unknown>[]): void => {
    contexts.set(next);
    releaseContexts();
    releaseContexts = NOOP;
    contextsReady = null;
  };
  const chainNeedsContext = (routes: readonly Route[]): boolean =>
    routes.some(
      (route) =>
        route.definition.beforeLoad !== undefined || route.definition.context !== undefined,
    );

  const runBeforeLoad = async (
    to: Location,
    candidate: Match<Route> | null,
    options?: { readonly server?: boolean },
  ): Promise<BeforeLoadResult> => {
    const modes = resolveSsr(candidate?.route.chain ?? []);
    const out: Record<string, unknown>[] = [];
    const produced: (Record<string, unknown> | undefined)[] = [];
    // Parent-to-child by SPREAD, child wins on a collision — TanStack's rule
    // (`load-client.ts:391-395`, `:455-458`) and its type-level `Assign` agrees.
    let merged: Record<string, unknown> = {};
    const forParams = candidate?.params ?? {};
    const forSearch = new URLSearchParams(to.search);

    for (const [depth, route] of (candidate?.route.chain ?? []).entries()) {
      // `ssr: false` means nothing of this route runs here — the client does it.
      if (options?.server === true && modes[depth] === false) {
        out.push(merged);
        produced.push(undefined);
        continue;
      }
      const given = { params: forParams, search: forSearch, location: to, context: merged };
      const sync = route.definition.context?.(given as never);
      if (sync !== undefined) merged = { ...merged, ...sync };
      const own = (await route.definition.beforeLoad?.({
        ...given,
        context: merged,
      } as never)) as Record<string, unknown> | undefined | null;
      if (own !== undefined && own !== null) merged = { ...merged, ...own };
      out.push(merged);
      produced.push(own ?? undefined);
    }
    return { contexts: out, produced };
  };

  /**
   * The same merge as `runBeforeLoad`, with the async half replaced by what the
   * server already answered.
   *
   * `context()` re-runs; `beforeLoad` does not. Nothing here awaits, which is
   * the point: on hydration the context is available in the same tick the
   * router mounts, so the first render sees it rather than an empty object.
   */
  const hydrateContexts = (to: Location, produced: BeforeLoadSeed["produced"]): void => {
    const candidate = matcher.match(unmask(to));
    const out: Record<string, unknown>[] = [];
    let merged: Record<string, unknown> = {};
    const forParams = candidate?.params ?? {};
    const forSearch = new URLSearchParams(to.search);

    for (const [depth, route] of (candidate?.route.chain ?? []).entries()) {
      const given = { params: forParams, search: forSearch, location: to, context: merged };
      const sync = route.definition.context?.(given as never);
      if (sync !== undefined) merged = { ...merged, ...sync };
      const own = produced[depth];
      if (own !== undefined) merged = { ...merged, ...own };
      out.push(merged);
    }
    settleContexts(out);
  };

  /**
   * The server's handoff, taken ONCE.
   *
   * Consumed on read so a later `invalidate()` or a navigation back to the same
   * url runs `beforeLoad` for real rather than replaying a context built for a
   * request that is over. TanStack's handoff is hydration-only for the same
   * reason.
   */
  const takeContextSeed = (): BeforeLoadSeed | null => {
    const holder = globalThis as Record<string, unknown>;
    const seed = holder[ROUTE_CONTEXT_GLOBAL] as BeforeLoadSeed | undefined;
    if (seed === undefined) return null;
    delete holder[ROUTE_CONTEXT_GLOBAL];
    return seed;
  };

  const buildSearch = (to: string): string => {
    const cut = to.search(/[?#]/);
    const pathPart = cut === -1 ? to : to.slice(0, cut);
    const rest = cut === -1 ? "" : to.slice(cut);
    const hashAt = rest.indexOf("#");
    const query = hashAt === -1 ? rest : rest.slice(0, hashAt);
    const hash = hashAt === -1 ? "" : rest.slice(hashAt);

    const candidate = matcher.match(pathPart === "" ? untrack(location).pathname : pathPart);
    const middlewares: SearchMiddleware[] = [];
    for (const route of candidate?.route.chain ?? []) {
      for (const step of route.definition.search?.middlewares ?? []) middlewares.push(step);
    }
    if (middlewares.length === 0) return to;

    const built = applySearchMiddleware(
      middlewares,
      searchRecord(untrack(search)),
      searchRecord(new URLSearchParams(query)),
      untrack(validated).defaults,
    );
    return `${pathPart}${toSearchString(built)}${hash}`;
  };

  const primeChain = (server = false): void => {
    const forParams = untrack(params);
    const modes = resolveSsr(untrack(chain));
    for (const [depth, route] of untrack(chain).entries()) {
      if (route.definition.loader === undefined) continue;
      // On the server a route that opted out runs nothing, so priming it would
      // be the one fetch `ssr: false` exists to prevent.
      if (server && modes[depth] === false) continue;
      try {
        // Blocking, always: priming exists to START the fetch, and a `latest()`
        // read of a cold cell on the string backend answers `undefined` instead
        // of parking, so nothing would start at all.
        dataFor(route, forParams, true)();
      } catch {
        // `NotReadyError` is the point — the fetch is now in flight. A cell that
        // has already FAILED throws its error here too, and swallowing it is
        // correct: the read inside the boundary throws it again with a boundary
        // to catch it, and `onLoaderError` has already fired.
      }
    }
  };

  /** The merged context as of one route's depth in the current chain. */
  const contextAt = (route: Route): Record<string, unknown> => {
    const at = untrack(chain).indexOf(route);
    return untrack(contexts)[at] ?? {};
  };

  /** `enter` the first time a route appears in the chain, `stay` while it stays. */
  let previous: readonly Route[] = [];
  const causeFor = (route: Route): LoadCause => (previous.includes(route) ? "stay" : "enter");

  /**
   * The reload decision happens ONCE PER NAVIGATION, not once per read.
   *
   * Putting it in `dataFor` was wrong in a way the tests caught immediately:
   * the memo is keyed on the identity of the `params` computed, which changes on
   * every location change including a HASH change, so `staleTime: 0` refetched
   * the whole chain when the fragment moved. TanStack reaches the same
   * conclusion from the other end — its reload decision lives in the load lane,
   * which a navigation enters and a render does not.
   */
  const revalidate = (): void => {
    const forParams = untrack(params);
    const forSearch = untrack(search);
    for (const route of untrack(chain)) {
      const { seedKey } = keyOf(route, forParams, forSearch);
      const entry = entries.get(seedKey);
      if (entry === undefined) continue;
      if (shouldReload(entry, forParams)) refresh(entry.cell);
    }
    previous = untrack(chain);
  };

  // Handed from `navigate` to the subscription, because the location is what
  // commits and the context has to land with it rather than after it.
  let pendingContexts: readonly Record<string, unknown>[] | null = null;

  const unsubscribe = history.subscribe((next) => {
    const asked = pendingNavigate;
    pendingNavigate = undefined;
    const before = untrack(chain);

    /**
     * Everything a commit IS, in one closure, because a view transition
     * snapshots the DOM as it stands when this returns.
     *
     * An earlier version set the location here and left the revalidate and the
     * prime outside — so the snapshot caught a half-committed page, and a
     * `blocking` reload rendered its OLD data instead of its fallback. The test
     * for `staleReloadMode: "blocking"` is what said so.
     */
    const commit = (): void => {
      location.set(next);

      // A popstate has no `navigate` to have run `beforeLoad`, so the context
      // for the entry it lands on is rebuilt asynchronously and the render sees
      // the ancestors' contribution as soon as it settles.
      if (pendingContexts !== null) {
        settleContexts(pendingContexts);
        pendingContexts = null;
      } else {
        const candidate = matcher.match(unmask(next));
        contexts.set([]);
        if (chainNeedsContext(candidate?.route.chain ?? [])) armContexts();
        void runBeforeLoad(next, candidate).then(
          (result) => settleContexts(result.contexts),
          () => {
            /* a guard's answer on a back button has nowhere to go; the boundary shows it */
            releaseContexts();
          },
        );
      }

      previous = before;
      revalidate();
      // Start every loader in the new chain at once, so the client does not
      // wait for each depth's parent to resolve before beginning the next.
      primeChain();
      sweep();

      // LAST, and synchronously: propagation here is microtask-scheduled, so
      // without this a transition animates old-to-old. The deleted router had
      // this line and it is the one thing about its transitions worth keeping.
      flush();
    };

    // AFTER the commit and not after the animation: `withViewTransition` awaits
    // `updateCallbackDone`, so this runs once the DOM is written rather than
    // once it has finished animating. Awaiting `finished` is what made the old
    // router's page visibly jump when the animation had already played.
    const restoreScroll = async (): Promise<void> => {
      await withViewTransition(commit, {
        enabled: asked?.viewTransition ?? config.viewTransition ?? false,
      });
      scroll.restore(next, { reset: asked?.resetScroll });
    };
    void restoreScroll();

    for (const hook of config.afterEach ?? []) hook(next);
  });

  const runGuards = async (to: Location): Promise<boolean | string> => {
    const from = untrack(location);
    const candidate = matcher.match(unmask(to));
    const context = { from, to, params: candidate?.params ?? {} };

    // Global first, then the matched chain outermost-in — so a layout's guard
    // decides before the route it wraps gets a say.
    const guards: Guard[] = [...(config.beforeEach ?? [])];
    for (const route of candidate?.route.chain ?? []) {
      const own = route.definition.beforeEnter;
      if (own !== undefined) guards.push(own);
    }

    for (const guard of guards) {
      const verdict = await guard(context);
      if (verdict !== true && verdict !== undefined) return verdict;
    }
    return true;
  };

  const blockers = new Set<Blocker>();
  const navigating = signal(0);
  const scroll: ScrollRestoration =
    config.scrollRestoration === false
      ? { save: () => {}, restore: () => {}, dispose: () => {} }
      : scrollRestoration();
  // Set by `navigate` and read by the subscription, because the COMMIT is where
  // both of these apply and only the caller knows what it asked for.
  let pendingNavigate: NavigateOptions | undefined;

  let hops = 0;
  const MAX_REDIRECTS = 10;

  const navigate = async (to: string, options?: NavigateOptions): Promise<void> => {
    navigating.set(untrack(navigating) + 1);
    try {
      return await attemptNavigate(to, options);
    } finally {
      navigating.set(untrack(navigating) - 1);
    }
  };

  const attemptNavigate = async (to: string, options?: NavigateOptions): Promise<void> => {
    if (leavesTheApp(to)) {
      if (typeof window !== "undefined") window.location.assign(to);
      return;
    }
    // Split the query and hash off BEFORE resolving. `resolvePath` works on
    // segments and treats `?role=user` as one, so resolving the whole string
    // and then re-appending the query wrote it twice — `/?role=user?role=user`.
    // Middlewares run on the way OUT, before the path is resolved, so a
    // retained key is present when the location is built rather than patched
    // onto it afterwards.
    const intended = buildSearch(to);
    const cut = intended.search(/[?#]/);
    const pathPart = cut === -1 ? intended : intended.slice(0, cut);
    const rest = cut === -1 ? "" : intended.slice(cut);
    const resolved = resolvePath(
      pathPart === "" ? untrack(location).pathname : pathPart,
      untrack(location).pathname,
    );
    const target = parseLocation(resolved + rest, options?.state ?? null);

    // Blockers first: a navigation nobody is going to make should not be
    // running guards, building context or warming a cache for itself.
    if (blockers.size > 0) {
      const from = untrack(location);
      // A snapshot, not the live Set: a blocker that unregisters another while
      // it is being asked must not break the iteration — the same reason
      // `history.ts` snapshots its listeners.
      // oxlint-disable-next-line unicorn/no-useless-spread
      for (const blocker of [...blockers]) {
        if (await blocker({ from, to: target })) return;
      }
    }

    const verdict = await runGuards(target);
    if (verdict === false) return;
    if (typeof verdict === "string") {
      if (hops++ >= MAX_REDIRECTS) {
        hops = 0;
        console.error(
          `[barq/router] more than ${MAX_REDIRECTS} redirects; giving up at ${verdict}`,
        );
        return;
      }
      // A refused route must not be left in the URL bar, so a guard's redirect
      // always replaces rather than pushing.
      await navigate(verdict, { replace: true });
      hops = 0;
      return;
    }
    hops = 0;

    // `beforeLoad` runs BEFORE the commit, so a `throw redirect(...)` from one
    // never leaves a refused location in the URL bar. Its result is the context
    // the new location renders under, set in the same breath as the location so
    // no frame sees one without the other.
    const candidate = matcher.match(target.pathname);
    let produced: readonly Record<string, unknown>[];
    try {
      produced = (await runBeforeLoad(target, candidate)).contexts;
    } catch (error) {
      if (error instanceof Redirect) {
        if (hops++ >= MAX_REDIRECTS) {
          hops = 0;
          console.error(`[barq/router] more than ${MAX_REDIRECTS} redirects; giving up`);
          return;
        }
        await navigate(error.to, { replace: true });
        hops = 0;
        return;
      }
      throw error;
    }
    pendingContexts = produced;
    pendingNavigate = options;
    const mask = options?.mask;
    // Where the page being LEFT is, recorded before it stops being current.
    scroll.save(untrack(location));
    if (mask === undefined) {
      history.push(href(target), { replace: options?.replace, state: options?.state });
      return;
    }
    // The mask goes in the URL; the real target goes in the state the URL
    // carries, so a reload in this tab still renders what was open.
    history.push(mask, {
      replace: options?.replace,
      state: { ...(options?.state as object | null), [MASK]: href(target) },
    });
  };

  return {
    location,
    match,
    params,
    search,
    chain,
    matcher,
    config,
    history,
    dataFor,
    navigate,
    buildSearch,
    validSearch: () => {
      const { slices } = validated();
      return slices[slices.length - 1] ?? searchRecord(search());
    },
    searchErrorAt(depth) {
      return untrack(validated).failures[depth] ?? null;
    },
    contexts,
    setContexts(next) {
      settleContexts(next);
    },
    async start() {
      if (untrack(contexts).length > 0) return;
      const here = untrack(location);
      const candidate = matcher.match(here.pathname);
      if (chainNeedsContext(candidate?.route.chain ?? [])) armContexts();
      // The server's `beforeLoad`s, if this is the page it rendered. A client
      // that has already navigated must not adopt a context built for a
      // different location — D9's server-matched-A/client-matched-B divergence
      // — so the href is checked rather than assumed.
      const seed = takeContextSeed();
      if (seed !== null && seed.href === href(here)) {
        hydrateContexts(here, seed.produced);
        primeChain();
        return;
      }
      try {
        settleContexts((await runBeforeLoad(here, candidate)).contexts);
      } catch {
        /* the boundary shows it; there is no navigation to refuse at mount */
        releaseContexts();
        return;
      }
      // AFTER the context lands, never before: a loader is handed the context
      // its ancestors built, and priming it first would hand it an empty one.
      primeChain();
    },
    runBeforeLoad,
    hydrateContexts,
    markPending(route, forParams) {
      const { seedKey } = keyOf(route, forParams, untrack(search));
      const entry = entries.get(seedKey);
      if (entry !== undefined && entry.shownAt === 0) entry.shownAt = now();
    },
    prime: primeChain,
    block(blocker) {
      blockers.add(blocker);
      return () => blockers.delete(blocker);
    },
    canGoBack: () => (history.depth?.() ?? 0) > 0,
    isNavigating: () => navigating() > 0,
    ssrModes: () => resolveSsr(chain()),
    async preload(to) {
      if (leavesTheApp(to)) return;
      // RESOLVED, parsed and base-stripped, exactly as `navigate` does it. The
      // old router handed the raw href straight to the matcher, so
      // `/about?x=1` matched nothing and `/users/7?tab=a` matched with
      // `id = "7?tab=a"` — a garbage param, cached under a key no navigation
      // would ever read.
      const intended = buildSearch(to);
      const cut = intended.search(/[?#]/);
      const pathPart = cut === -1 ? intended : intended.slice(0, cut);
      const rest = cut === -1 ? "" : intended.slice(cut);
      const resolved = resolvePath(
        pathPart === "" ? untrack(location).pathname : pathPart,
        untrack(location).pathname,
      );
      const target = parseLocation(resolved + rest, null);
      const candidate = matcher.match(target.pathname);
      if (candidate === null) return;

      let produced: readonly Record<string, unknown>[];
      try {
        produced = (await runBeforeLoad(target, candidate)).contexts;
      } catch {
        // A preload that would have been refused simply does not warm anything.
        return;
      }

      // The SAME key path a navigation takes, including the search — the old
      // router preloaded with an EMPTY search while its cache key included one,
      // so every slot it filled was one no navigation could read, and the
      // loader was handed the wrong query as well.
      const forSearch = new URLSearchParams(target.search);
      const forParams = candidate.params;
      for (const [depth, route] of candidate.route.chain.entries()) {
        if (route.definition.loader === undefined) continue;
        const { seedKey, deps } = keyOf(route, forParams, forSearch);
        const existing = entries.get(seedKey);
        const entry =
          existing ??
          mint(route, forParams, forSearch, seedKey, deps, "preload", produced[depth] ?? {});
        try {
          entry.cell();
        } catch {
          /* pending or failed; both are states the cache now holds */
        }
      }
    },
    /**
     * Ask every cached loader again.
     *
     * `refresh` rather than dropping the map, which is the change R2 forced and
     * is better anyway: the cell keeps its identity, so a route already on
     * screen revalidates in place instead of remounting, and its seed key
     * survives. Dropping the map used to mean a new cell under the same seed
     * key, which on the client would have re-consumed a seed that is gone and on
     * the server would have re-read the session bucket.
     */
    invalidate() {
      for (const entry of entries.values()) refresh(entry.cell);
      generation.set(untrack(generation) + 1);
    },
    dispose() {
      unsubscribe();
      scroll.dispose();
      for (const entry of entries.values()) entry.dispose();
      entries.clear();
      memo.clear();
    },
  };
}
