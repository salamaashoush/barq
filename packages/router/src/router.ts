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

import type { SerializationAdapter } from "@barqjs/server/codec";
import { PathParamError, isNotFound, isRedirect } from "./errors.ts";
import {
  type History,
  type Location,
  href,
  memoryHistory,
  normalizeBase,
  parseLocation,
} from "./history.ts";
import { ROOT_ROUTE_ID } from "./file-route.ts";
import { type Match, type Matcher, createMatcher } from "./matcher.ts";
import {
  type AnyRouteDefinition,
  type Route,
  type RouteLifecycle,
  flattenRoutes,
} from "./route.ts";
import {
  applyTrailingSlash,
  interpolate,
  leavesTheApp,
  normalize,
  parsePattern,
  resolvePath,
} from "./path.ts";
import type { TrailingSlash } from "./path.ts";
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

/**
 * The router-wide answer for a per-route option.
 *
 * Named for the ROUTE option each one stands in for, so `defaults.staleTime` is
 * plainly the default for `staleTime`. TanStack spells the same set
 * `defaultStaleTime`, `defaultPendingMs` and so on at the top level; one nested
 * object is the same information without a second vocabulary.
 */
export interface RouteDefaults {
  readonly pendingMs?: number;
  readonly pendingMinMs?: number;
  readonly staleTime?: number;
  readonly preloadStaleTime?: number;
  readonly gcTime?: number;
  readonly preloadGcTime?: number;
  readonly staleReloadMode?: "background" | "blocking";
  /** What a `<Link>` does when it does not say. `false` is still the default. */
  readonly preload?: import("./components.ts").PreloadStrategy;
  /** Hover before `preload: "intent"` counts as intent. Default 50 ms. */
  readonly preloadDelay?: number;
  /** What every route runs on the server when it does not say. Default `true`. */
  readonly ssr?: boolean | "data-only";
}

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
export function resolveSsr(chain: readonly Route[], fallback: SsrMode = true): readonly SsrMode[] {
  const out: SsrMode[] = [];
  let parent: SsrMode = true;
  for (const route of chain) {
    // `fallback` is the router's `defaults.ssr`, which is how a project makes
    // every route client-only without writing `ssr: false` on each. A route
    // that says something itself always wins.
    const own = route.definition.ssr ?? fallback;
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
  /** Whether THIS mask survives a page load. Overrides the router-wide answer. */
  readonly unmaskOnReload?: boolean;
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

/**
 * The page load that wrote the mask, when the mask is meant to survive only
 * that one.
 *
 * `unmaskOnReload` is what puts it there. A history entry outlives the page
 * that pushed it — the back button, a reload, a restored tab — and the key is
 * how the router tells "I put this here a moment ago" from "this came back from
 * somewhere else". TanStack's `__tempKey` against its `tempLocationKey`, and
 * the same trick.
 */
const MASK_SESSION = "__barqMaskSession";

/** This page load's identity, for {@link MASK_SESSION}. Never persisted. */
const MASK_KEY = `m${Math.round(Math.random() * 1e9)}`;

/**
 * The path a location actually matches, which is not always the one it shows.
 *
 * `session` is this page load's key. A mask written with `unmaskOnReload` is
 * ignored once the key stops matching, which is what "removed when the page is
 * reloaded" means: the URL is then simply the location, and the modal that was
 * open renders as the page it addresses.
 */
export function unmask(location: Location, session: string = MASK_KEY): string {
  const state = location.state;
  if (state === null || typeof state !== "object") return location.pathname;
  const record = state as Record<string, unknown>;
  const masked = record[MASK];
  if (typeof masked !== "string") return location.pathname;
  const wrote = record[MASK_SESSION];
  if (typeof wrote === "string" && wrote !== session) return location.pathname;
  return masked;
}

/**
 * One entry in `routeMasks`: what to hide, and what to show instead.
 *
 * The alternative is passing `mask` at every call site, which means a photo
 * opened from three places has the rule written three times and drifts. This is
 * the rule once, beside the routes.
 */
export interface RouteMask {
  /** The route pattern whose matches are masked — `/photos/$id`. */
  readonly from: string;
  /** The pattern the URL shows instead — `/feed`. */
  readonly to: string;
  /**
   * What fills `to`'s parameters. A function is handed the params `from`
   * captured, which is how a mask keeps one of them and drops the rest.
   * Absent means `from`'s params are reused as they stand.
   */
  readonly params?:
    | Record<string, string>
    | ((captured: Record<string, string>) => Record<string, string>);
  /** Overrides the router-wide `unmaskOnReload` for this mask alone. */
  readonly unmaskOnReload?: boolean;
}

/**
 * The six moments a navigation passes through, in order.
 *
 * `beforeEach` and `afterEach` are the two an application configures at
 * construction and cannot add to later. These are the same story told to
 * anything that asks — a devtool, an analytics call, a progress bar — and they
 * unsubscribe, which a config array cannot.
 *
 * TanStack's six names, at barq's moments:
 *
 *  - `onBeforeNavigate` — a target has been resolved; blockers and guards have
 *    not run, so this fires for navigations that never happen.
 *  - `onBeforeLoad` — the guards said yes and the contexts are about to run.
 *  - `onBeforeRouteMount` — inside the commit, before the location changes.
 *  - `onLoad` — the location has changed and every loader in the new chain has
 *    been started.
 *  - `onResolved` — the DOM is written. A view transition has run its update
 *    callback; it may still be animating.
 *  - `onRendered` — after `onResolved`, with the scroll position restored.
 *    Theirs emits these two together as well.
 */
export type RouterEventType =
  | "onBeforeNavigate"
  | "onBeforeLoad"
  | "onBeforeRouteMount"
  | "onLoad"
  | "onResolved"
  | "onRendered";

/**
 * What a listener is told.
 *
 * The three `*Changed` flags are TanStack's, and they are what make a listener
 * cheap to write: a scroll-to-top only wants `pathChanged`, an analytics call
 * only wants `hrefChanged`, and neither has to compare two locations itself.
 */
export interface RouterEvent {
  readonly type: RouterEventType;
  /** Where the navigation came from. `null` for the first one. */
  readonly from: Location | null;
  readonly to: Location;
  readonly pathChanged: boolean;
  readonly hrefChanged: boolean;
  readonly hashChanged: boolean;
}

export type RouterListener = (event: RouterEvent) => void;

/** How the three flags are computed, in one place so every emit agrees. */
function changeInfo(from: Location | null, to: Location): Omit<RouterEvent, "type"> {
  return {
    from,
    to,
    pathChanged: from?.pathname !== to.pathname,
    hrefChanged: from === null || href(from) !== href(to),
    hashChanged: from?.hash !== to.hash,
  };
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
   * name and worth matching: an application arriving from theirs writes one
   * word differently in one place, or none at all.
   */
  readonly routeTree: readonly AnyRouteDefinition[];
  readonly history?: History;
  /**
   * The path the application is mounted under, when it is not the origin root.
   *
   * `/app` makes `<Link to="/about">` write `href="/app/about"` and makes the
   * server match `/app/about` as `/about`, so every route pattern in the
   * project stays written as if the application owned the origin — which is
   * what makes a base a DEPLOYMENT decision rather than something route files
   * have to know about.
   *
   * `history.ts` has had `stripBase`/`addBase` since it was written and nothing
   * reached them: `createRouter` took no base, so an application under one had
   * to build its own `browserHistory({ base })`, and even then `<Link>` still
   * wrote an href without it — correct on click, wrong on "open in new tab",
   * which is the shape of bug that survives every click-through test.
   */
  readonly basepath?: string;
  /**
   * Where an unmatched path renders its not-found. Default `"fuzzy"`.
   *
   *  - `"fuzzy"` — inside the deepest LAYOUT whose pattern is a prefix of the
   *    path, using that layout's `notFoundComponent` or the nearest one above
   *    it. `/posts/nope` keeps `/posts`'s layout.
   *  - `"root"` — the root route only.
   *
   * Fuzzy is TanStack's default and the better one: a 404 inside the
   * application keeps its own navigation, where the alternative discards
   * everything below the shell over one mistyped segment.
   */
  readonly notFoundMode?: "root" | "fuzzy";
  /**
   * Whether a literal path segment must match the URL's case. Default `true`.
   *
   * TanStack defaults to the opposite; `MatcherOptions` says why barq keeps
   * its own default and when to turn this off.
   */
  readonly caseSensitive?: boolean;
  /**
   * Whether a path the router BUILDS ends in a slash. Default `"never"`.
   *
   * Matching has never cared — `splitPath` drops the empty segment — so this
   * settles the one spelling `<Link>` writes and `navigate` pushes, and nothing
   * about which URLs are served. `"preserve"` keeps whatever the `to` said.
   */
  readonly trailingSlash?: TrailingSlash;
  /**
   * Rules for showing one URL while rendering another, declared once.
   *
   * `navigate(to, { mask })` is the per-call form and still wins where both
   * apply. This is the rule beside the routes, so a photo opened from a feed,
   * a search result and a profile masks the same way in all three without the
   * three of them agreeing to.
   */
  readonly routeMasks?: readonly RouteMask[];
  /**
   * Types the codec does not know about, taught to cross the SSR boundary.
   *
   * seroval already carries `Date`, `Map`, `Set`, `BigInt` and cycles. This is
   * for a type only the application knows — a `Decimal`, a `Temporal.Instant`,
   * a domain object with methods — which otherwise arrives as a plain object
   * with the methods gone, one call away from where that matters.
   *
   * The SAME LIST has to reach the server, where `createPageHandler` registers
   * it: a payload names an adapter by key and both ends look it up.
   */
  readonly serializationAdapters?: readonly SerializationAdapter<never, unknown>[];
  /**
   * Whether a mask survives a page load. Default `false`.
   *
   * `false` is the interesting one and is TanStack's default too: the real
   * location rides in `history.state`, so reloading a masked URL in the same
   * tab reopens what was actually open. `true` drops it, and the URL is then
   * simply the location — which is what an application wants when the mask is
   * the shareable thing and the modal is not.
   */
  readonly unmaskOnReload?: boolean;
  /**
   * What a route gets when it declares none of these itself.
   *
   * Every one is TanStack's `default*` option under the name the ROUTE uses, so
   * there is one word to learn rather than two. Before this a project that
   * wanted, say, a 200 ms pending delay everywhere had to write `pendingMs` on
   * every route and keep writing it on every new one.
   *
   * The built-in fallbacks are unchanged and still apply when an entry here is
   * absent, so adding this option changes no existing application's behaviour.
   */
  readonly defaults?: RouteDefaults;
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
   * and a module-level "current answer" hands one request's answer to another
   * under load. The router state is already request-scoped on the server, so
   * the callback rides it.
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
  /**
   * The `params.parse` failure at one depth, if that route's parse refused.
   *
   * Read and re-thrown from inside the route's own boundary, exactly as
   * `searchErrorAt` is, so `/users/abc` where `abc` had to be a number renders
   * that route's `errorComponent` rather than taking the page down.
   */
  paramsErrorAt(depth: number): Error | null;
  readonly matcher: Matcher<Route>;
  readonly config: RouterConfig;
  readonly history: History;
  /**
   * The normalised `basepath`, or `""`. Read by `<Link>` to write an href a
   * browser can follow without JavaScript, and by the page handler to strip
   * what it matched.
   */
  readonly base: string;
  /**
   * The resolved `trailingSlash` policy. Read by `<Link>`, which builds the one
   * string that leaves for the browser.
   */
  readonly trailingSlash: TrailingSlash;
  /**
   * Nothing matched this location, and the chain is the root standing in.
   *
   * Read by both render paths to put the not-found at the depth the matched
   * route would have occupied.
   */
  readonly missed: Cell<boolean>;
  /**
   * Tell the router this depth's `pending` fallback is on screen.
   *
   * `pendingMinMs` needs a start time, and only the thing that RENDERS the
   * fallback knows when that was.
   */
  markPending(route: Route): void;
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
  /**
   * Be told when a navigation reaches one of its six moments.
   *
   * Returns an unsubscribe, which is the whole reason this exists beside
   * `beforeEach` and `afterEach`: those are configured once at construction and
   * outlive everything, where a devtool, a progress bar or an analytics call
   * comes and goes with the thing that installed it.
   *
   * A listener OBSERVES. It cannot refuse a navigation — `beforeEach` and
   * `block` are for that — and a throw from one is logged rather than allowed
   * to take down the navigation it was watching.
   */
  subscribe(type: RouterEventType, listener: RouterListener): () => void;
  /** Whether there is anything to go back TO. See `History.depth`. */
  canGoBack(): boolean;
  /**
   * A navigation has been asked for and has not committed.
   *
   * Not a loading counter, because loading is a boundary per route depth. This
   * is the gap between `navigate` being called and the location changing, which
   * is where blockers, guards and `beforeLoad` run.
   */
  readonly isNavigating: Cell<boolean>;
  /** Drop every cached loader result and re-read the current location. */
  invalidate(): void;
  dispose(): void;
}

export function createRouter(config: RouterConfig): RouterState {
  const base = config.basepath === undefined ? "" : normalizeBase(config.basepath);
  const trailingSlash: TrailingSlash = config.trailingSlash ?? "never";
  /**
   * The mask table as something that can be MATCHED, built once.
   *
   * The same `createMatcher` the routes use, over the masks' `from` patterns —
   * so `/photos/$id` masks `/photos/7` by the same specificity rules a route
   * would, rather than by a second, subtly different comparison.
   */
  const maskTable =
    config.routeMasks === undefined || config.routeMasks.length === 0
      ? null
      : createMatcher(
          config.routeMasks.map((mask, index) => ({
            id: `mask:${index}`,
            fullPath: normalize(mask.from),
            segments: parsePattern(mask.from),
            chain: [mask],
          })),
          { caseSensitive: config.caseSensitive },
        );

  /** The URL a target should SHOW, when a mask claims it. */
  const maskFor = (pathname: string): { to: string; unmaskOnReload: boolean } | null => {
    if (maskTable === null) return null;
    const hit = maskTable.match(pathname);
    const mask = hit?.route.chain[0];
    if (mask === undefined) return null;
    const captured = hit?.params ?? {};
    const filled =
      typeof mask.params === "function" ? mask.params(captured) : (mask.params ?? captured);
    return {
      to: interpolate(mask.to, filled),
      unmaskOnReload: mask.unmaskOnReload ?? config.unmaskOnReload ?? false,
    };
  };
  const defaults: RouteDefaults = config.defaults ?? {};
  // A history the CALLER built already knows its own base; one built here is
  // told. Both spellings therefore work, and neither has to repeat the other.
  const history = config.history ?? memoryHistory();
  const matcher = createMatcher(flattenRoutes(config.routeTree), {
    caseSensitive: config.caseSensitive,
  });

  const location = signal<Location>(history.current());
  // Bumped by `invalidate`, and read by every loader cell, so invalidating is a
  // reactive fact rather than a cache the router has to reach into.
  const generation = signal(0);

  // MATCHED against the unmasked path, and displayed as `location()`. A mask is
  // the one place those differ, and keeping the split here means nothing else in
  // the router has to know about it: links stay active against what the user
  // sees, and the chain is built from what is actually being rendered.
  const match = computed<Match<Route> | null>(() => matcher.match(unmask(location())));
  /**
   * The segments the URL gave, as strings, before any route has looked at them.
   *
   * SEPARATE from `params` because these are what a loader cache key is built
   * from. The key is the handshake between the server's seed and the client's
   * first read, and a raw segment is the one thing both sides are guaranteed to
   * agree on; `params.parse` output is a user function's return value and would
   * put it between them. TanStack splits them the same way and for the same
   * reason (`match.pathname` against `match._strictParams`).
   */
  const rawParams = computed<Record<string, string>>(() => match()?.params ?? {});
  const search = computed(() => new URLSearchParams(location().search));

  /**
   * `params.parse` down a chain, one slice per depth.
   *
   * Slice `i` is the raw params with the parse output of depths `0..i` layered
   * over it, so a child sees what its ancestors made of a shared name — the
   * same accumulation `validated` does for the search, and TanStack's
   * `strictParams` (`router.ts:1642`).
   *
   * A failure is STORED rather than thrown. This runs inside a `computed` read
   * during a render, and throwing would take the page rather than the route.
   */
  const parseChain = (
    forChain: readonly Route[],
    raw: Readonly<Record<string, string>>,
  ): {
    readonly slices: readonly Record<string, unknown>[];
    readonly failures: readonly (PathParamError | null)[];
  } => {
    const slices: Record<string, unknown>[] = [];
    const failures: (PathParamError | null)[] = [];
    let merged: Record<string, unknown> = raw;
    for (const route of forChain) {
      const parse = route.definition.params?.parse;
      if (parse === undefined) {
        slices.push(merged);
        failures.push(null);
        continue;
      }
      try {
        merged = { ...merged, ...parse(raw) };
        slices.push(merged);
        failures.push(null);
      } catch (error) {
        // A `redirect` or a `notFound` from a parse is an ANSWER and travels as
        // itself; `errorFallbackFor` already routes both. Anything else is a
        // refused parameter and gets the name that says so.
        failures.push(
          isRedirect(error) || isNotFound(error)
            ? (error as unknown as PathParamError)
            : new PathParamError(
                error instanceof Error ? error.message : "a path parameter did not parse",
                { cause: error },
              ),
        );
        slices.push(merged);
      }
    }
    return { slices, failures };
  };

  const parsedParams = computed(() => parseChain(chain(), rawParams()));

  /**
   * What every reader gets: the raw params with the whole chain's `parse`
   * applied, which is `useParams()`, `props.params()` and a loader's `params`.
   *
   * The raw record is returned UNCHANGED when no route in the chain parses,
   * which is nearly every application — `dataFor` memoises on the identity of
   * this value, so allocating a copy per read would rebuild every reader on
   * every location change.
   */
  const params = computed<Record<string, string>>(() => {
    const { slices } = parsedParams();
    return (slices[slices.length - 1] ?? rawParams()) as Record<string, string>;
  });

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
  /**
   * The chain an UNMATCHED location renders.
   *
   * The root route, when the table has one, so a 404 is a page IN the
   * application rather than instead of it. Everything the root renders — the
   * shell, the navigation, the layout — is there, and the not-found goes where
   * the matched route would have.
   *
   * IT IS ALSO WHAT STOPPED A BROWSER CRASH. An empty chain rendered no root,
   * so the server's document and the client's disagreed about the whole page
   * rather than about one node; `hydrate` recovered by throwing the document
   * away and rendering cold over it, and a real Chrome tab died with `SIGTRAP`
   * on every unmatched URL. Rendering the root on both sides makes a miss
   * structurally the same shape as a hit.
   */
  const rootChain: readonly Route[] = ((): readonly Route[] => {
    const root = config.routeTree.find(
      (definition) => definition.id === ROOT_ROUTE_ID || definition.children !== undefined,
    );
    if (root === undefined || root.id !== ROOT_ROUTE_ID) return [];
    return [{ id: root.id, fullPath: normalize(root.path ?? "/"), definition: root }];
  })();

  /**
   * Where an unmatched location renders its not-found.
   *
   * `"fuzzy"` (the default, and TanStack's) puts it inside the deepest LAYOUT
   * whose pattern is a prefix of the path, so `/posts/nope` keeps `/posts`'s
   * layout and uses its `notFoundComponent`. `"root"` renders only the root
   * route, which is the whole application chrome and nothing more.
   *
   * Either way the ROOT renders — that part is not a mode, it is what stops a
   * 404 being a blank document that disagrees with what the client builds.
   */
  const fuzzyChain = computed<readonly Route[]>(() => {
    if ((config.notFoundMode ?? "fuzzy") === "root") return rootChain;
    const prefix = matcher.matchPrefix(unmask(location()));
    return prefix === null ? rootChain : prefix.route.chain;
  });

  const chain = computed<readonly Route[]>(() => match()?.route.chain ?? fuzzyChain());

  /** Nothing matched, so the chain above is the root standing in. */
  const missed = computed<boolean>(() => match() === null);

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
    forRaw: Readonly<Record<string, string>>,
    forSearch: URLSearchParams,
  ): { seedKey: string; deps: unknown } => {
    const project = route.definition.loaderDeps;
    if (project === undefined) {
      return { seedKey: loaderKey(route.id, forRaw, searchKey(forSearch)), deps: undefined };
    }
    const deps = project({ search: forSearch });
    return { seedKey: loaderKey(route.id, forRaw, depsKey(deps)), deps };
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
    const forRaw = untrack(rawParams);
    const forSearch = untrack(search);
    for (const route of untrack(chain)) keys.add(keyOf(route, forRaw, forSearch).seedKey);
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
        ? (definition.preloadGcTime ?? defaults.preloadGcTime ?? DEFAULT_PRELOAD_GC_TIME)
        : (definition.gcTime ?? defaults.gcTime ?? DEFAULT_GC_TIME);
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
      ? (definition.preloadStaleTime ?? defaults.preloadStaleTime ?? DEFAULT_PRELOAD_STALE_TIME)
      : (definition.staleTime ?? defaults.staleTime ?? DEFAULT_STALE_TIME);
    return now() - entry.updatedAt >= budget;
  };

  const acquire = (
    route: Route,
    forRaw: Readonly<Record<string, string>>,
    forParams: Readonly<Record<string, string>>,
    cause: LoadCause,
  ): Entry => {
    const forSearch = untrack(search);
    const { seedKey, deps } = keyOf(route, forRaw, forSearch);
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
    const mode = entry.route.definition.staleReloadMode ?? defaults.staleReloadMode ?? "background";
    const held = (): boolean => {
      const minimum = entry.route.definition.pendingMinMs ?? defaults.pendingMinMs ?? 0;
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
    // The KEY comes from the raw segments and the loader's `params` from the
    // argument, which is what lets `params.parse` change what a loader is handed
    // without changing what its cached value is filed under. Every caller reads
    // the current location, so the router's own raw record is the right one.
    const entry = acquire(route, untrack(rawParams), forParams, causeFor(route));
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
  /** Whether `start()` has already run. See the guard inside it. */
  let started = false;
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
    const modes = resolveSsr(candidate?.route.chain ?? [], defaults.ssr ?? true);
    const out: Record<string, unknown>[] = [];
    const produced: (Record<string, unknown> | undefined)[] = [];
    // Parent-to-child by SPREAD, child wins on a collision — TanStack's rule
    // (`load-client.ts:391-395`, `:455-458`) and its type-level `Assign` agrees.
    let merged: Record<string, unknown> = {};
    // Parsed down the chain, so a `beforeLoad` reads the parameter its own
    // route asked for rather than the segment the URL happened to carry.
    const { slices } = parseChain(candidate?.route.chain ?? [], candidate?.params ?? {});
    const forSearch = new URLSearchParams(to.search);

    for (const [depth, route] of (candidate?.route.chain ?? []).entries()) {
      // `ssr: false` means nothing of this route runs here — the client does it.
      if (options?.server === true && modes[depth] === false) {
        out.push(merged);
        produced.push(undefined);
        continue;
      }
      const forParams = slices[depth] ?? candidate?.params ?? {};
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
    const { slices } = parseChain(candidate?.route.chain ?? [], candidate?.params ?? {});
    const forSearch = new URLSearchParams(to.search);

    for (const [depth, route] of (candidate?.route.chain ?? []).entries()) {
      const forParams = slices[depth] ?? candidate?.params ?? {};
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
    const modes = resolveSsr(untrack(chain), defaults.ssr ?? true);
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
   * `onLeave`, then `onStay` or `onEnter` — TanStack's order and their rule
   * (`runRouteLifecycle`, `router.ts:930`): every route in the old chain that
   * is not in the new one leaves first, and only then does each route in the
   * new chain get told whether it arrived or remained.
   *
   * Compared BY ID rather than by object identity. A route object is stable
   * across a navigation today, and a chain rebuilt from a fresh match would not
   * be — an id is what the author named and what a hook is written against.
   */
  const runLifecycle = (before: readonly Route[], after: readonly Route[]): void => {
    const stayed = new Set(after.map((route) => route.id));
    const had = new Set(before.map((route) => route.id));
    const forParams = untrack(params);
    const told = (route: Route): RouteLifecycle => ({
      routeId: route.id,
      fullPath: route.fullPath,
      params: forParams,
      staticData: route.definition.staticData ?? {},
    });
    for (const route of before) {
      if (!stayed.has(route.id)) route.definition.onLeave?.(told(route));
    }
    for (const route of after) {
      const hook = had.has(route.id) ? route.definition.onStay : route.definition.onEnter;
      hook?.(told(route));
    }
  };

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
    const forRaw = untrack(rawParams);
    const forParams = untrack(params);
    const forSearch = untrack(search);
    for (const route of untrack(chain)) {
      const { seedKey } = keyOf(route, forRaw, forSearch);
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
    // A SEPARATE FLAG, not `asked !== undefined`. `navigate("/a")` passes no
    // options, so `pendingNavigate` stays undefined for it and a popstate could
    // not be told apart — which double-emitted the two events below for every
    // optionless navigation. The test for the event order is what said so.
    const wasNavigate = pendingIsNavigate;
    pendingNavigate = undefined;
    pendingIsNavigate = false;
    const before = untrack(chain);
    // Captured before the commit moves it: every event after this point is
    // about a navigation FROM here, and `location()` stops saying so as soon as
    // `commit` runs.
    const leaving = untrack(location);
    // A POPSTATE never went through `navigate`, so the two events that fire
    // there have not fired. They belong to any navigation, not to the ones the
    // application asked for — a progress bar that starts on
    // `onBeforeNavigate` would otherwise never start on the back button, which
    // is exactly when a slow loader is most visible. `asked` is set by
    // `navigate` and is the only thing that tells the two apart.
    if (!wasNavigate) {
      emit("onBeforeNavigate", leaving, next);
      emit("onBeforeLoad", leaving, next);
    }

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
      // BEFORE the location moves, which is the whole difference between this
      // and `onLoad`: a listener here still sees the page being left.
      emit("onBeforeRouteMount", untrack(location), next);
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
      // AFTER `revalidate`, which is what sets `previous` to the committed
      // chain, and before the loaders start: a hook that reads the match should
      // see the page it is being told about.
      runLifecycle(before, untrack(chain));
      // Start every loader in the new chain at once, so the client does not
      // wait for each depth's parent to resolve before beginning the next.
      primeChain();
      sweep();
      // AFTER the loaders have started, not after they settle. A loader is a
      // cell a boundary pulls, so "loaded" is not a moment the router has — and
      // naming one that does not exist would be worse than not having it.
      emit("onLoad", leaving, next);

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
      // The DOM is written — `withViewTransition` awaits the update callback
      // rather than the animation — so this is the first moment a listener can
      // measure the new page.
      emit("onResolved", leaving, next);
      scroll.restore(next, { reset: asked?.resetScroll });
      emit("onRendered", leaving, next);
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
  const listeners = new Map<RouterEventType, Set<RouterListener>>();

  /**
   * Tell everyone listening for one moment.
   *
   * A THROW IS SWALLOWED and logged, which is TanStack's choice and the right
   * one: a listener is an observer, and one that fails must not take down the
   * navigation it was only watching. A snapshot of the set, so a listener that
   * unsubscribes another while being called does not break the iteration.
   */
  const emit = (type: RouterEventType, from: Location | null, to: Location): void => {
    const set = listeners.get(type);
    if (set === undefined || set.size === 0) return;
    const event: RouterEvent = { type, ...changeInfo(from, to) };
    // A snapshot, not the live Set — the same reason `block` takes one: a
    // listener that unsubscribes another while being called must not break the
    // iteration.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const listener of [...set]) {
      try {
        listener(event);
      } catch (error) {
        console.error(`[barq/router] a ${type} listener threw`, error);
      }
    }
  };

  const navigating = signal(0);
  const scroll: ScrollRestoration =
    config.scrollRestoration === false
      ? { save: () => {}, restore: () => {}, dispose: () => {} }
      : scrollRestoration();
  // Set by `navigate` and read by the subscription, because the COMMIT is where
  // both of these apply and only the caller knows what it asked for.
  let pendingNavigate: NavigateOptions | undefined;
  /** Whether the entry about to commit came from `navigate` rather than a popstate. */
  let pendingIsNavigate = false;

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
    const here = untrack(location).pathname;
    const asked = pathPart === "" ? here : pathPart;
    const resolved = applyTrailingSlash(
      resolvePath(asked, here),
      trailingSlash,
      asked.endsWith("/"),
    );
    const target = parseLocation(resolved + rest, options?.state ?? null);
    // BEFORE the blockers, so a listener hears about navigations that are then
    // refused — which is what a progress bar and a devtool both want, and what
    // `beforeEach` cannot say because it IS one of the refusals.
    emit("onBeforeNavigate", untrack(location), target);

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
    emit("onBeforeLoad", untrack(location), target);

    // `beforeLoad` runs BEFORE the commit, so a `throw redirect(...)` from one
    // never leaves a refused location in the URL bar. Its result is the context
    // the new location renders under, set in the same breath as the location so
    // no frame sees one without the other.
    const candidate = matcher.match(target.pathname);
    let produced: readonly Record<string, unknown>[];
    try {
      produced = (await runBeforeLoad(target, candidate)).contexts;
    } catch (error) {
      if (isRedirect(error)) {
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
    pendingIsNavigate = true;
    // The per-call `mask` wins: a call site that names one has said something
    // about THIS navigation that a table cannot know.
    const declared = maskFor(target.pathname);
    const mask = options?.mask ?? declared?.to;
    // Where the page being LEFT is, recorded before it stops being current.
    scroll.save(untrack(location));
    if (mask === undefined) {
      history.push(href(target), { replace: options?.replace, state: options?.state });
      return;
    }
    // The mask goes in the URL; the real target goes in the state the URL
    // carries, so a reload in this tab still renders what was open — unless
    // `unmaskOnReload` says otherwise, and then the page load that wrote it is
    // recorded beside it and a later one stops honouring it.
    const survives =
      options?.mask !== undefined
        ? (options.unmaskOnReload ?? config.unmaskOnReload ?? false)
        : (declared?.unmaskOnReload ?? false);
    history.push(mask, {
      replace: options?.replace,
      state: {
        ...(options?.state as object | null),
        [MASK]: href(target),
        ...(survives ? { [MASK_SESSION]: MASK_KEY } : {}),
      },
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
    base,
    trailingSlash,
    missed,
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
    paramsErrorAt(depth) {
      return untrack(parsedParams).failures[depth] ?? null;
    },
    contexts,
    setContexts(next) {
      settleContexts(next);
    },
    async start() {
      // A FLAG, not a look at `contexts`.
      //
      // The guard used to be `contexts.length > 0`, which asks "did the chain
      // produce any context?" rather than "have I started?". Those agree for a
      // matched location, because `runBeforeLoad` pushes one entry per depth —
      // and disagree completely for one that matched NOTHING, where the chain
      // is empty and the answer is permanently zero.
      //
      // `RouterProvider` calls `start()` from its body, so the guard never
      // latching meant: start -> `settleContexts([])` -> the signal notifies ->
      // the provider re-runs -> start again, forever. Every unmatched URL span
      // the event loop writing `<head>` until the renderer ran out of memory;
      // in Chrome the tab died with `SIGTRAP`, after appearing to load.
      if (started) return;
      started = true;
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
        runLifecycle([], untrack(chain));
        return;
      }
      // The FIRST chain enters too. Nothing has left, so this is `onEnter` for
      // every depth — TanStack runs the same pass as matches load, and without
      // it a hook only ever fired from the second navigation onwards.
      const enter = (): void => runLifecycle([], untrack(chain));
      try {
        settleContexts((await runBeforeLoad(here, candidate)).contexts);
        enter();
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
    markPending(route) {
      const { seedKey } = keyOf(route, untrack(rawParams), untrack(search));
      const entry = entries.get(seedKey);
      if (entry !== undefined && entry.shownAt === 0) entry.shownAt = now();
    },
    prime: primeChain,
    block(blocker) {
      blockers.add(blocker);
      return () => blockers.delete(blocker);
    },
    subscribe(type, listener) {
      let set = listeners.get(type);
      if (set === undefined) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
    canGoBack: () => (history.depth?.() ?? 0) > 0,
    isNavigating: () => navigating() > 0,
    ssrModes: () => resolveSsr(chain(), defaults.ssr ?? true),
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
      const forRaw = candidate.params;
      // The TARGET's chain, not the committed one: a preload warms a page the
      // user is not on yet, so `parsedParams` is answering about the wrong URL.
      const { slices } = parseChain(candidate.route.chain, forRaw);
      for (const [depth, route] of candidate.route.chain.entries()) {
        if (route.definition.loader === undefined) continue;
        const forParams = (slices[depth] ?? forRaw) as Record<string, string>;
        const { seedKey, deps } = keyOf(route, forRaw, forSearch);
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
