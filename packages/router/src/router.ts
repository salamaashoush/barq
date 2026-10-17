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
  createMemo,
  flush,
  latest,
  refresh,
  createRoot,
  runWithOwner,
  createSignal,
  type Signal,
  untrack,
  isSafeError,
  markSafeError,
} from "@barqjs/core";

import type { AnySerializationAdapter } from "@barqjs/server/codec";
import { PathParamError, abortedByUnload, isNotFound, isRedirect } from "./errors.ts";
import {
  type History,
  type Location,
  browserHistory,
  href,
  memoryHistory,
  normalizeBase,
  parseLocation,
} from "./history.ts";
import { type LocationRewrite, defaultOrigin, publicHref, rewriteHistory } from "./rewrite.ts";
import { type Match, type Matcher, createMatcher } from "./matcher.ts";
import {
  type AnyRouteDefinition,
  type Route,
  type RouteLifecycle,
  ROOT_ROUTE_ID,
  flattenRoutes,
  pendingChunks,
  preloadMatched,
} from "./route.ts";
import {
  applyTrailingSlash,
  interpolate,
  isUnder,
  leavesTheApp,
  normalize,
  parsePattern,
  resolvePath,
  withoutTrailingSlash,
} from "./path.ts";
import type { TrailingSlash } from "./path.ts";
import type { NavigateFn } from "./register.ts";
import { type RouterOptions, type ServerSsr, applyRouterOverrides } from "./ssr.ts";
import {
  type ScrollOptions,
  type ScrollRestoration,
  type ViewTransitionOptions,
  scrollRestoration,
  withViewTransition,
} from "./scroll.ts";
import {
  type SearchMiddleware,
  SearchParamError,
  applySearchMiddleware,
  searchRecord,
  toSearchString,
  validateSearch,
} from "./search.ts";

const NOOP = (): void => {};
const NO_SEARCH = new URLSearchParams();
const NO_LOADER = async (): Promise<unknown> => undefined;

/** How a cell is read: called, or through `untrack`. */
type Reader = <T>(cell: () => T) => T;
const track: Reader = (cell) => cell();

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
  /** Shown while a route that declares no `pendingComponent` is loading. */
  readonly pendingComponent?: AnyRouteDefinition["pendingComponent"];
  /** Rendered when no route up the chain declares an `errorComponent`. */
  readonly errorComponent?: AnyRouteDefinition["errorComponent"];
  /** Rendered when no route up the chain declares a `notFoundComponent`. */
  readonly notFoundComponent?: AnyRouteDefinition["notFoundComponent"];
  /** Told about a caught error when no route up the chain declares an `onCatch`. */
  readonly onCatch?: (error: Error) => void;
}

/**
 * TanStack's `default*` router options, resolved onto {@link RouteDefaults}.
 *
 * Both spellings configure the same thing, and the top-level one wins where a
 * config gives both.
 */
function resolveDefaults(config: RouterConfig): RouterConfig {
  const named: RouteDefaults = {
    pendingMs: config.defaultPendingMs,
    pendingMinMs: config.defaultPendingMinMs,
    staleTime: config.defaultStaleTime,
    preloadStaleTime: config.defaultPreloadStaleTime,
    gcTime: config.defaultGcTime,
    preloadGcTime: config.defaultPreloadGcTime,
    staleReloadMode: config.defaultStaleReloadMode,
    preload: config.defaultPreload,
    preloadDelay: config.defaultPreloadDelay,
    ssr: config.defaultSsr,
    pendingComponent: config.defaultPendingComponent,
    errorComponent: config.defaultErrorComponent,
    notFoundComponent: config.defaultNotFoundComponent,
    onCatch: config.defaultOnCatch,
  };
  const given = Object.entries(named).filter(([, value]) => value !== undefined);
  if (given.length === 0) return config;
  return { ...config, defaults: { ...config.defaults, ...Object.fromEntries(given) } };
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
export function resolveSsr(
  chain: readonly Route[],
  fallback: SsrMode = true,
  /** What each route's functional `ssr` answered for this request, by route id. */
  decided?: ReadonlyMap<string, SsrMode>,
): readonly SsrMode[] {
  const out: SsrMode[] = [];
  let parent: SsrMode = true;
  for (const route of chain) {
    // `fallback` is the router's `defaults.ssr`, which is how a project makes
    // every route client-only without writing `ssr: false` on each. A route
    // that says something itself always wins.
    const declared = route.definition.ssr;
    const own =
      decided?.get(route.id) ?? (typeof declared === "function" ? undefined : declared) ?? fallback;
    let mode: SsrMode;
    if (parent === false) mode = false;
    else if (own === true && parent === "data-only") mode = "data-only";
    else mode = own;
    out.push(mode);
    parent = mode;
  }
  return out;
}

const bump = (n: number): number => n + 1;

/** One cached loader result, and everything the reload policy reads. */
interface Entry {
  readonly key: string;
  readonly route: Route;
  /** The keyed async memo. Reloaded with `reload`, never replaced. */
  cell: Cell<unknown>;
  /** Asks the loader again. Nothing to ask when the route has no loader. */
  reload: () => void;
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
   * Bumped to make a held read re-evaluate — see `pendingMinMs` — and when a
   * reload starts and settles, which is what a `blocking` read waits on.
   *
   * A signal rather than a timer the reader owns, because the READ is what has
   * to notice: the value may have settled while the fallback was still being
   * held, and nothing else would wake the boundary.
   */
  readonly hold: Signal<number>;
  /** When this entry's `pending` fallback was first shown. `0` if it never was. */
  shownAt: number;
  /** Whether this entry was born of a preload, which picks the stale budget. */
  preload: boolean;
  /** Aborts the run in flight, if any. */
  abort: (reason: string) => void;
  inFlight: boolean;
  /** Settles when the run in flight does, whichever way it goes. */
  running: Promise<void> | null;
  /** Settles `running`. A no-op while nothing is in flight. */
  done: () => void;
  /** The raw segments and the parsed params this entry was minted for. */
  readonly raw: Readonly<Record<string, string>>;
  readonly params: Readonly<Record<string, string>>;
}

/** Where a loader runs when that is not the committed location: a preload's target. */
interface Lane {
  readonly chain: readonly Route[];
  readonly raw: Readonly<Record<string, string>>;
  readonly location: Location;
  readonly contexts: readonly Record<string, unknown>[];
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

/**
 * A function of the current value.
 *
 * Declared as a METHOD, which TypeScript checks both ways in its parameter: an
 * updater written against `Record<string, string>` still fits where the
 * current value is typed wider, and one written against a route's own search
 * fits where it is typed narrower.
 */
export type Updater<Current, Next> = { update(current: Current): Next }["update"];

type RecordUpdater = Updater<Record<string, unknown>, Record<string, unknown>>;

/**
 * Where a navigation goes: TanStack's `ToOptions`.
 *
 * `true` for `params`, `search`, `hash` or `state` keeps the current one, and a
 * function is handed the current one and answers with the next.
 */
export interface ToOptions {
  /** A path, a route id, or a path relative to `from`. The current path when absent. */
  readonly to?: string;
  /** What a relative `to` is relative to: a path or a route id. The current location otherwise. */
  readonly from?: string;
  /** Laid over the current params, so a route keeps the ones it is not told to change. */
  readonly params?: true | Record<string, unknown> | RecordUpdater;
  /** A string is taken as written; a record replaces the query; `true` keeps it. */
  readonly search?: true | string | Record<string, unknown> | RecordUpdater;
  /** The fragment, without its `#`. */
  readonly hash?: true | string | ((current: string) => string);
  /** `history.state` for the new entry. A function is handed the current one. */
  readonly state?: unknown;
  /**
   * Show a DIFFERENT url than the one being rendered.
   *
   * A photo opened over a feed renders `/photos/5` while the address bar reads
   * `/feed` — so closing it is a back button and copying the link shares the
   * feed. The real target rides in `history.state`, which survives a reload in
   * the same tab and does NOT survive being pasted somewhere else: a shared
   * masked URL renders the MASK, which is the whole point of choosing it.
   *
   * A string is the url to show; an object is built the way a `to` is.
   */
  readonly mask?: string | ToMaskOptions;
  /** A fully built url, instead of `to`. For somewhere outside the application. */
  readonly href?: string;
}

/** A mask described the way a destination is. */
export interface ToMaskOptions extends Omit<ToOptions, "mask" | "href"> {
  readonly unmaskOnReload?: boolean;
}

/** TanStack's `NavigateOptions`. */
export interface NavigateOptions extends ToOptions {
  readonly replace?: boolean;
  /**
   * Go to the top instead of wherever this location was left.
   *
   * A filter change is not a place you return to, so `useSearchParams` sets it.
   */
  readonly resetScroll?: boolean;
  /** Whether this navigation scrolls its `#hash` into view, and how. */
  readonly hashScrollIntoView?: boolean | ScrollIntoViewOptions;
  /** Wrap this navigation's commit in a view transition, optionally a typed one. */
  readonly viewTransition?: boolean | ViewTransitionOptions;
  /** Go even if a blocker would refuse. */
  readonly ignoreBlocker?: boolean;
  /** Load the target as a document instead of navigating to it. */
  readonly reloadDocument?: boolean;
  /** Whether THIS mask survives a page load. Overrides the router-wide answer. */
  readonly unmaskOnReload?: boolean;
}

/** What `buildLocation` answers with. */
export interface BuiltLocation extends Location {
  /** `pathname + search + hash`, or the whole url when it leaves the application. */
  readonly href: string;
  /** The target is outside the application, so only a document load reaches it. */
  readonly external: boolean;
  /** What the address bar shows instead, when a `mask` was given. */
  readonly maskedLocation?: { readonly href: string; readonly unmaskOnReload?: boolean };
}

/**
 * One route in the matched chain, as TanStack's `RouteMatch`.
 *
 * `id` is unique per match (route, params and loader deps) and `routeId` is the
 * route's own. `fullPath` and `definition` are the route itself, so a match can
 * be read wherever a `Route` was.
 */
export interface RouteMatch<Data = unknown> {
  readonly id: string;
  readonly routeId: string;
  readonly fullPath: string;
  /** This route's part of the location, with its parameters filled in. */
  readonly pathname: string;
  readonly params: Record<string, string>;
  readonly search: Record<string, unknown>;
  readonly loaderData: Data | undefined;
  readonly loaderDeps: unknown;
  readonly context: Record<string, unknown>;
  readonly status: "pending" | "success" | "error" | "notFound";
  /** Loader work in flight, including a background reload under a `success`. */
  readonly isFetching: false | "loader";
  readonly error: unknown;
  readonly paramsError: unknown;
  readonly searchError: unknown;
  readonly updatedAt: number;
  readonly cause: LoadCause;
  readonly staticData: Record<string, unknown>;
  readonly definition: AnyRouteDefinition;
}

/** The router's state at one instant: TanStack's `router.state`. */
export interface RouterSnapshot {
  readonly status: "pending" | "idle";
  readonly isLoading: boolean;
  readonly isTransitioning: boolean;
  readonly matches: readonly RouteMatch[];
  readonly location: Location;
  readonly resolvedLocation: Location | undefined;
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
  /** The query the mask shows. A function is handed the query being navigated to. */
  readonly search?: Record<string, unknown> | RecordUpdater;
  /** Overrides the router-wide `unmaskOnReload` for this mask alone. */
  readonly unmaskOnReload?: boolean;
}

/**
 * TanStack's `createRouteMask`: a typed way to write one {@link RouteMask}.
 *
 * `routeTree` is accepted because theirs takes it for inference, and dropped.
 */
export function createRouteMask(mask: RouteMask & { readonly routeTree?: unknown }): RouteMask {
  const { routeTree: _routeTree, ...rest } = mask;
  return rest;
}

/**
 * What `matchRoute` is asked.
 *
 * `to` is a route ID — a PATTERN, `/posts/$id` — or a concrete path. The
 * pattern form is the interesting one and the reason this exists beside
 * `useMatch`: it answers "am I on the post page, and which post" in one call,
 * where `useMatch(id)` answers only the first half.
 */
export interface MatchRouteOptions {
  readonly to: string;
  /** Resolves a relative `to`, as it does for a navigation. */
  readonly from?: string;
  /** Every key given must equal what the location captured. */
  readonly params?: Record<string, string>;
  /** Every key given must equal what the current query holds. */
  readonly search?: Record<string, string>;
  /**
   * Match an ANCESTOR too. Default `false`.
   *
   * `/posts` fuzzily matches while on `/posts/7`, which is what a breadcrumb
   * and a nav highlight want and what an exact match cannot give them.
   */
  readonly fuzzy?: boolean;
  /** Whether `search` is compared at all. Default `true`, which is theirs. */
  readonly includeSearch?: boolean;
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

/**
 * Whether two derived records hold the same thing.
 *
 * WHAT `structuralSharing` MEANS HERE. Theirs is a per-hook opt-in because
 * React pays per component: a `useSearch` whose object identity changed
 * re-renders whatever read it, so the fix has to be applied where the reading
 * happens. barq has no component re-render — a hole re-runs when a cell it read
 * CHANGED — so the same fix belongs one level up, on the cell, and is paid once
 * per navigation instead of once per reader.
 *
 * It is not cosmetic. `match()` is a fresh object per location, so `params` and
 * the validated search changed identity on every navigation including a hash
 * move — which is the refetch `dataFor`'s memo comment already records working
 * around from the other end.
 *
 * BOUNDED, and plain values only. A `Date` compares by time, an array and a
 * plain object compare by contents, and anything else compares by identity —
 * which is the safe direction: an unrecognised value reports "changed" and the
 * reader re-runs, exactly as it did before.
 */
export function sameShape(a: unknown, b: unknown, depth = 0): boolean {
  if (Object.is(a, b)) return true;
  if (depth > 8 || a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => sameShape(item, b[index], depth + 1));
  }
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every(
    (key) => Object.hasOwn(right, key) && sameShape(left[key], right[key], depth + 1),
  );
}

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
  /** The same two places as TanStack's `shouldBlockFn` describes them. */
  readonly current: BlockerLocation;
  readonly next: BlockerLocation;
  readonly action: HistoryAction;
}) => boolean | void | Promise<boolean | void>;

/** How a navigation was asked for. `BACK` and `FORWARD` are the browser's own buttons. */
export type HistoryAction = "PUSH" | "REPLACE" | "BACK" | "FORWARD" | "GO";

/** One end of a navigation, as a blocker sees it. */
export interface BlockerLocation {
  /** `"__notFound__"` when nothing matched. */
  readonly routeId: string;
  readonly fullPath: string;
  readonly pathname: string;
  readonly params: Record<string, string>;
  readonly search: Record<string, unknown>;
}

export interface BlockOptions {
  /**
   * Also ask the browser to confirm closing or reloading the tab. A function is
   * asked each time. Default `false` for `router.block`, `true` for `useBlocker`
   * given options, as TanStack's is.
   */
  readonly enableBeforeUnload?: boolean | (() => boolean);
}

export interface RouterConfig<Dehydrated = unknown> {
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
   * What every route's `context`, `beforeLoad` and loader start from: TanStack's
   * router context, for handing a query client or an auth object to the tree.
   *
   * `createRootRouteWithContext<T>()` is what types it.
   */
  readonly context?: Record<string, unknown>;
  /**
   * Runs on the server once the matched loaders have settled, and its result
   * travels in the document to `hydrate`. A promise or an async iterable inside
   * it is streamed: what it settles on follows the shell.
   */
  readonly dehydrate?: RouterOptions<Dehydrated>["dehydrate"];
  /** Runs in the browser with what `dehydrate` returned, before the first render. */
  readonly hydrate?: RouterOptions<Dehydrated>["hydrate"];
  /** A component around the whole router output, outside the router's context. */
  readonly Wrap?: RouterOptions["Wrap"];
  /** A component around the matched routes, inside the router's context. */
  readonly InnerWrap?: RouterOptions["InnerWrap"];
  /**
   * What the server decided each route runs for the request this router serves,
   * by route id, over whatever the route declares: a functional `ssr`'s answer,
   * or `false` below the root of a shell. The page handler fills it; a browser
   * has none.
   */
  readonly ssrDecisions?: ReadonlyMap<string, SsrMode>;
  /**
   * A two-way mapping between the URL shown and the URL matched, applied where
   * the history is read and written and where a `<Link>` writes its `href`.
   * `basepath` composes with it: stripped before `input`, added after `output`.
   */
  readonly rewrite?: LocationRewrite;
  /** The origin a rewrite's `URL` is built on. The browser's, or `http://localhost`. */
  readonly origin?: string;
  /**
   * Replace how the query is read into a record and written back.
   *
   * The default pair is a plain query string and a fixpoint. A custom pair is
   * the application's own format and its own responsibility to keep one.
   */
  readonly parseSearch?: (search: string) => Record<string, unknown>;
  readonly stringifySearch?: (search: Record<string, unknown>) => string;
  /** TanStack's names for the entries of `defaults`. */
  readonly defaultPreload?: RouteDefaults["preload"];
  readonly defaultPreloadDelay?: number;
  readonly defaultPendingMs?: number;
  readonly defaultPendingMinMs?: number;
  readonly defaultStaleTime?: number;
  readonly defaultPreloadStaleTime?: number;
  readonly defaultGcTime?: number;
  readonly defaultPreloadGcTime?: number;
  readonly defaultStaleReloadMode?: "background" | "blocking";
  readonly defaultSsr?: boolean | "data-only";
  readonly defaultPendingComponent?: RouteDefaults["pendingComponent"];
  readonly defaultErrorComponent?: RouteDefaults["errorComponent"];
  readonly defaultNotFoundComponent?: RouteDefaults["notFoundComponent"];
  readonly defaultOnCatch?: (error: Error) => void;
  /** TanStack's name for `viewTransition`, and it may carry transition types. */
  readonly defaultViewTransition?: boolean | ViewTransitionOptions;
  /** Whether a navigation scrolls its `#hash` into view, and how. Default `true`. */
  readonly defaultHashScrollIntoView?: boolean | ScrollIntoViewOptions;
  /** How a scroll restore or reset moves. TanStack's name for `scroll.behavior`. */
  readonly scrollRestorationBehavior?: ScrollBehavior;
  /** TanStack's name for `scroll.toTop`. */
  readonly scrollToTopSelectors?: ScrollOptions["toTop"];
  /** TanStack's name for `scroll.getKey`. */
  readonly getScrollRestorationKey?: (location: Location) => string;
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
  readonly serializationAdapters?: readonly AnySerializationAdapter[];
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
  /**
   * What scroll restoration keys on, and what a reset scrolls besides the
   * window. `scroll.ts`'s `ScrollOptions` says what each is for.
   */
  readonly scroll?: ScrollOptions;
  /**
   * Whether a derived record keeps its identity when its contents did not
   * change. Default `true`. See {@link sameShape} for what it costs and why the
   * default is the opposite of theirs.
   */
  readonly structuralSharing?: boolean;
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
  /**
   * Whether a thrown answer has superseded this render. A buffered page whose
   * loader threw a `Response` or a redirect answers with that instead of the
   * markup, so a boundary the throw reached stands in a region nobody is sent
   * and has no failure to report. The page handler fills it; a browser has none.
   */
  readonly superseded?: () => boolean;
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
  /**
   * `dehydrate`, `hydrate`, `Wrap` and `InnerWrap`, read when they are used
   * rather than when the router was built, so an integration installs its own
   * around the application's after `createRouter` has returned.
   */
  readonly options: RouterOptions;
  /** The render this router is being served by. Absent in a browser. */
  serverSsr?: ServerSsr;
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
  /**
   * Counts the reloads a `blocking` route has started.
   *
   * A boundary that has shown its content keeps it through a later wait, which
   * is what a `background` reload wants. A `blocking` one wants the fallback
   * back, and a boundary only brings it back when what it is keyed on moves.
   */
  readonly blockingReloads: Cell<number>;
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
  /**
   * Go somewhere: `navigate("/posts/7")`, or TanStack's
   * `navigate({ to: "/posts/$id", params: { id: "7" }, search: (prev) => ... })`.
   */
  readonly navigate: NavigateFn;
  /**
   * Resolve a destination to the location it addresses, without going there.
   *
   * What `navigate` and `<Link>` both build from, so the href a link shows is
   * the location a click commits. Reads the current location, so a caller in a
   * tracking scope re-runs when it moves.
   */
  buildLocation(options?: ToOptions): BuiltLocation;
  /** The matched chain as TanStack's `RouteMatch`es, outermost first. */
  readonly matches: Cell<readonly RouteMatch[]>;
  /** `"pending"` while a navigation or a cold loader in the chain is unsettled. */
  readonly status: Cell<"pending" | "idle">;
  /** `status() === "pending"`. A background reload does not count. */
  readonly isLoading: Cell<boolean>;
  /** A commit is being written: after the location was accepted, before the DOM settled. */
  readonly isTransitioning: Cell<boolean>;
  /** The last location that finished loading. `undefined` until the first one has. */
  readonly resolvedLocation: Cell<Location | undefined>;
  /** All of the above read once, untracked. */
  readonly state: RouterSnapshot;
  /**
   * Start the current chain's loaders and resolve when they have settled.
   *
   * Fresh entries stay fresh and stale ones revalidate. `sync` also waits for a
   * background reload, which otherwise carries on behind the promise.
   */
  load(options?: { readonly sync?: boolean }): Promise<void>;
  /** Resolves once the loaders the current chain has started have settled. */
  settled(): Promise<void>;
  /** Drop cached loader results that are not on screen, optionally only some. */
  clearCache(options?: { readonly filter?: (match: RouteMatch) => boolean }): void;
  /** Warm the cache for a destination, described the way `navigate` takes it. */
  preloadRoute(options: NavigateOptions): Promise<readonly RouteMatch[] | undefined>;
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
  block(blocker: Blocker, options?: BlockOptions): () => void;
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
  /**
   * Whether the current location matches `to`, and what it captured.
   *
   * `false` or the params, which is TanStack's return and a better one than a
   * boolean: the question "am I on the post page" is almost never asked without
   * "which post", and answering both at once removes the second lookup.
   *
   * Built on the SAME matcher a navigation uses. A second comparison written
   * beside it would drift — which is the whole reason `linkIsActive` and this
   * share their trailing-slash handling.
   */
  matchRoute(
    options: MatchRouteOptions,
    /** TanStack's second argument; the same flags may ride in the first. */
    matchOptions?: Pick<MatchRouteOptions, "fuzzy" | "includeSearch">,
  ): Record<string, string> | false;
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
  /**
   * Ask cached loaders again, all of them or the ones `filter` picks. `sync`
   * resolves once the reloads have settled.
   */
  invalidate(options?: {
    readonly filter?: (match: RouteMatch) => boolean;
    readonly sync?: boolean;
  }): Promise<void>;
  dispose(): void;
}

export function createRouter<Dehydrated = unknown>(
  provided: RouterConfig<Dehydrated>,
): RouterState {
  // `Dehydrated` types the pair against each other where they are written. The
  // payload crosses a document between them, and the router and its
  // integrations hand it on as `unknown`.
  const config = resolveDefaults(applyRouterOverrides(provided as RouterConfig));
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
  const maskFor = (target: Location): { to: string; unmaskOnReload: boolean } | null => {
    if (maskTable === null) return null;
    const hit = maskTable.match(target.pathname);
    const mask = hit?.route.chain[0];
    if (mask === undefined) return null;
    const captured = hit?.params ?? {};
    const filled =
      typeof mask.params === "function" ? mask.params(captured) : (mask.params ?? captured);
    const shown =
      typeof mask.search === "function" ? mask.search(readSearch(target.search)) : mask.search;
    return {
      to: interpolate(mask.to, filled) + (shown === undefined ? "" : writeSearch(shown)),
      unmaskOnReload: mask.unmaskOnReload ?? config.unmaskOnReload ?? false,
    };
  };
  const defaults: RouteDefaults = config.defaults ?? {};
  // A history the CALLER built already knows its own base; one built here is
  // told. Both spellings therefore work, and neither has to repeat the other.
  //
  // The default follows the ENVIRONMENT rather than being memory everywhere.
  // Memory was the default, and an application that did not pass a history got
  // a router whose address bar never moved: links navigated, the outlet
  // swapped, and Back left the app entirely — with no error, because a memory
  // history is doing exactly what it says. That is the wrong default in the one
  // place a router is normally used. On a server, or under a test with no
  // `window`, memory is still the only thing that can work.
  const origin = config.origin ?? defaultOrigin();
  const givenHistory =
    config.history ?? (typeof window === "undefined" ? memoryHistory() : browserHistory());
  const history =
    config.rewrite === undefined
      ? givenHistory
      : rewriteHistory(givenHistory, config.rewrite, origin);

  /** The query as a record and back, through the application's pair when it gave one. */
  const readSearch = (forSearch: URLSearchParams | string): Record<string, unknown> => {
    if (config.parseSearch === undefined) {
      return searchRecord(
        typeof forSearch === "string" ? new URLSearchParams(forSearch) : forSearch,
      );
    }
    const text = typeof forSearch === "string" ? forSearch : forSearch.toString();
    return config.parseSearch(text === "" || text.startsWith("?") ? text : `?${text}`);
  };
  const writeSearch = (record: Record<string, unknown>): string => {
    if (config.stringifySearch === undefined) return toSearchString(record);
    const text = config.stringifySearch(record);
    return text === "" || text.startsWith("?") ? text : `?${text}`;
  };
  const matcher = createMatcher(flattenRoutes(config.routeTree), {
    caseSensitive: config.caseSensitive,
  });

  const [location, setLocation] = createSignal<Location>(history.current());
  // Bumped by `invalidate`, and read by every loader cell, so invalidating is a
  // reactive fact rather than a cache the router has to reach into.
  const [generation, setGeneration] = createSignal(0);
  const [blockingReloads, setBlockingReloads] = createSignal(0);
  // Bumped when a loader starts over or settles, which is the only thing that
  // moves a match's `status` without moving the location.
  const [loads, setLoads] = createSignal(0, { ownedWrite: true });
  const rootContext: Record<string, unknown> = config.context ?? {};

  // MATCHED against the unmasked path, and displayed as `location()`. A mask is
  // the one place those differ, and keeping the split here means nothing else in
  // the router has to know about it: links stay active against what the user
  // sees, and the chain is built from what is actually being rendered.
  const match = createMemo<Match<Route> | null>(() => matcher.match(unmask(location())));
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
  // `undefined` rather than a comparator when it is off, so the ordinary
  // strict-equality path stays exactly what `computed` does by default.
  const shared = config.structuralSharing === false ? undefined : { equals: sameShape };

  const rawParams = createMemo<Record<string, string>>(() => match()?.params ?? {}, shared);
  /**
   * Shared too, by the query STRING: a hash-only move leaves the search alone,
   * and a fresh `URLSearchParams` per location made `dataFor`'s memo rebuild
   * for it — which is the refetch that comment records.
   */
  const search = createMemo(
    () => new URLSearchParams(location().search),
    config.structuralSharing === false
      ? undefined
      : { equals: (a: URLSearchParams, b: URLSearchParams) => a.toString() === b.toString() },
  );

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
        // The refusal says what its cause says, so a cause the application
        // marked safe to show keeps that mark.
        const refused =
          isRedirect(error) || isNotFound(error)
            ? error
            : new PathParamError(
                error instanceof Error
                  ? error.message
                  : "A path parameter in the URL did not pass this route's `params.parse`.",
                { cause: error },
              );
        failures.push(isSafeError(error) ? markSafeError(refused) : refused);
        slices.push(merged);
      }
    }
    return { slices, failures };
  };

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
  const fuzzyChain = createMemo<readonly Route[]>(() => {
    if ((config.notFoundMode ?? "fuzzy") === "root") return rootChain;
    const prefix = matcher.matchPrefix(unmask(location()));
    return prefix === null ? rootChain : prefix.route.chain;
  });

  const chain = createMemo<readonly Route[]>(() => match()?.route.chain ?? fuzzyChain());

  /** Nothing matched, so the chain above is the root standing in. */
  const missed = createMemo<boolean>(() => match() === null);

  const validated = createMemo<{
    readonly slices: readonly Record<string, unknown>[];
    readonly defaults: ReadonlyMap<string, unknown>;
    readonly failures: readonly (SearchParamError | null)[];
  }>(() => {
    const raw = readSearch(search());
    const slices: Record<string, unknown>[] = [];
    const failures: (SearchParamError | null)[] = [];
    const searchDefaults = new Map<string, unknown>();
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
          if (!(key in raw)) searchDefaults.set(key, value);
        }
        merged = { ...merged, ...slice };
        slices.push(merged);
        failures.push(null);
      } catch (error) {
        failures.push(
          error instanceof SearchParamError
            ? error
            : new SearchParamError(
                (error as Error).message ??
                  "The URL's search parameters did not pass this route's `validateSearch`.",
              ),
        );
        slices.push(merged);
      }
    }
    return { slices, defaults: searchDefaults, failures };
  });

  const parsedParams = createMemo(() => parseChain(chain(), rawParams()));

  /**
   * What every reader gets: the raw params with the whole chain's `parse`
   * applied, which is `useParams()`, `props.params()` and a loader's `params`.
   *
   * The raw record is returned UNCHANGED when no route in the chain parses,
   * which is nearly every application — `dataFor` memoises on the identity of
   * this value, so allocating a copy per read would rebuild every reader on
   * every location change.
   */
  /**
   * The deepest route's validated search, shared like `params` and for the same
   * reason: `useSearch()` reads it from a hole, and a fresh record per
   * navigation re-runs that hole when nothing in the query moved.
   */
  const validSearch = createMemo<Record<string, unknown>>(() => {
    const { slices } = validated();
    return slices[slices.length - 1] ?? readSearch(search());
  }, shared);

  const params = createMemo<Record<string, string>>(() => {
    const { slices } = parsedParams();
    return (slices[slices.length - 1] ?? rawParams()) as Record<string, string>;
  }, shared);

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
    /**
     * Where this entry is being loaded FOR, when that is not the committed
     * location: a preload's own chain, segments and target.
     */
    lane?: Lane,
  ): Entry => {
    const loader = route.definition.loader;
    let entry!: Entry;

    const cell = runWithOwner(null, () =>
      createRoot<Cell<unknown>>((disposeScope) => {
        let controller: AbortController | null = null;
        const abort = (reason: string): void => {
          const live = controller;
          controller = null;
          if (live !== null) live.abort(reason);
        };

        entry = {
          key: seedKey,
          route,
          cell: () => undefined,
          reload: () => {},
          dispose: () => {
            abort("the router collected this cache entry");
            finish();
            disposeScope();
          },
          updatedAt: 0,
          settled: null,
          error: undefined,
          cause,
          deps,
          hold: createSignal(0),
          shownAt: 0,
          preload: cause === "preload",
          abort,
          inFlight: false,
          running: null,
          done: NOOP,
          raw: lane?.raw ?? untrack(rawParams),
          params: forParams,
        };
        // One promise per stretch of work, begun by whichever comes first of a
        // reload being asked for and the run it leads to, so a waiter that
        // arrives between the two is waiting on the right one.
        const begin = (): void => {
          if (entry.done !== NOOP) return;
          entry.running = new Promise<void>((resolve) => {
            entry.done = resolve;
          });
        };
        const finish = (): void => {
          const done = entry.done;
          entry.done = NOOP;
          done();
        };
        // A memo is computed where it is declared, and its body reads
        // `entry`, so the entry exists first. An entry is minted when its
        // data is asked for — a read, or an explicit preload — which is when
        // the loader should run.
        const load =
          loader === undefined
            ? NO_LOADER
            : async (): Promise<unknown> => {
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
                begin();
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
                    abortController: own,
                    preload: entry.preload,
                    location: lane?.location ?? untrack(location),
                    navigate,
                    get parentMatchPromise() {
                      return parentMatch(route, forSearch, entry.cause, lane);
                    },
                    route,
                  });
                  // A `redirect({...})` or a `notFound({...})` that was RETURNED
                  // is the same answer as one that was thrown, and rendering
                  // it as data would show an instruction where a page belongs.
                  if (isRedirect(value) || isNotFound(value)) throw value;
                  if (controller === own) {
                    controller = null;
                    finish();
                  }
                  entry.inFlight = false;
                  entry.updatedAt = now();
                  if (entry.settled !== null) entry.hold[1](bump);
                  entry.settled = { value };
                  entry.error = undefined;
                  setLoads(bump);
                  return value;
                } catch (error) {
                  // Aborted by the router, this run was superseded by a newer
                  // one or its entry was disposed. What it threw is the abort,
                  // and the entry's state belongs to the run that replaced it.
                  if (own.signal.aborted) throw error;
                  if (controller === own) {
                    controller = null;
                    finish();
                  }
                  entry.inFlight = false;
                  if (entry.settled !== null) entry.hold[1](bump);
                  entry.error = error;
                  setLoads(bump);
                  if (abortedByUnload(error)) throw error;
                  if (!isRedirect(error) && !isNotFound(error)) {
                    route.definition.onError?.(error);
                  }
                  config.onLoaderError?.(error);
                  throw error;
                }
              };
        const source = loader === undefined ? null : createMemo(load, { key: seedKey });
        if (source !== null) {
          entry.cell = source;
          entry.reload = () => {
            // In flight from here, not from the microtask the re-ask runs on:
            // the commit that asked renders before that.
            entry.inFlight = true;
            begin();
            entry.hold[1](bump);
            const mode = route.definition.staleReloadMode ?? defaults.staleReloadMode;
            if (mode === "blocking") setBlockingReloads(bump);
            setLoads(bump);
            void refresh(source);
          };
        }
        return entry.cell;
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
      collect(key, entry);
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
      collect(key, entry);
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
      const [hold, setHold] = entry.hold;
      hold();
      const remaining = entry.shownAt + minimum - now();
      if (remaining <= 0) return false;
      setTimeout(() => setHold(bump), remaining);
      return true;
    };
    const plain: Cell<unknown> = () => {
      // A settled value that arrived while the fallback was still being held
      // keeps throwing until the hold expires, so a skeleton that appeared does
      // not vanish two frames later.
      if (held()) throw new NotReadyError(undefined);
      // A reload keeps answering with the value it is replacing, which is what
      // `background` wants and the opposite of what this mode is. The signal is
      // read so the settle, which bumps it, is what brings the value back.
      entry.hold[0]();
      if (entry.inFlight && entry.settled !== null) throw new NotReadyError(undefined);
      return entry.cell();
    };
    if (blocking || mode === "blocking") return plain;
    return () => {
      if (held()) throw new NotReadyError(undefined);
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
  const memo = new Map<
    Route,
    { params: unknown; search: unknown; blocking: boolean; reader: Cell<unknown>; entry: Entry }
  >();

  /**
   * Take one entry out of the cache, and out of the per-route memo with it.
   *
   * The memo hands back a reader bound to an entry, and it is keyed on the
   * identity of the params and the search, which structural sharing keeps the
   * same across a navigation away and back. Leaving it behind made a collected
   * entry the one a returning route read: its loader was never asked again.
   */
  const collect = (key: string, entry: Entry): void => {
    entry.dispose();
    entries.delete(key);
    if (memo.get(entry.route)?.entry === entry) memo.delete(entry.route);
  };

  const dataFor = (
    route: Route,
    forParams: Readonly<Record<string, string>>,
    blocking = false,
  ): Cell<unknown> => {
    // THE SEARCH IS IN THE MEMO KEY, and leaving it out was a live bug that
    // only `structuralSharing` exposed: a loader is keyed on the search as well
    // as the params, and the memo compared params alone. It happened to
    // invalidate anyway because `params` was a fresh object per location — so
    // the rule was right by accident, and making the identity honest broke it.
    // Two identity compares, which is what this memo exists to keep cheap.
    //
    // TRACKED, not untracked, and that is the other half. `renderDepth` reads
    // this from a hole and the hole's dependencies are what re-run it: it reads
    // `params()`, and while that was a fresh object per location a search
    // change re-ran it by accident. With the identity honest it does not, so
    // the dependency has to be real — and being real is what stops a HASH move
    // re-running it, because the shared `search` keeps its identity there.
    const forSearch = search();
    const hit = memo.get(route);
    if (
      hit !== undefined &&
      hit.params === forParams &&
      hit.search === forSearch &&
      hit.blocking === blocking
    ) {
      return hit.reader;
    }
    // The KEY comes from the raw segments and the loader's `params` from the
    // argument, which is what lets `params.parse` change what a loader is handed
    // without changing what its cached value is filed under. Every caller reads
    // the current location, so the router's own raw record is the right one.
    const entry = acquire(route, untrack(rawParams), forParams, causeFor(route));
    const reader = readerFor(entry, blocking);
    memo.set(route, { params: forParams, search: forSearch, blocking, reader, entry });
    return reader;
  };

  // `ownedWrite`: `start()` is called from the provider's body, and it writes
  // the context the first render's loaders are handed.
  const [contexts, writeContexts] = createSignal<readonly Record<string, unknown>[]>([], {
    ownedWrite: true,
  });

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
    writeContexts(next);
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
    options?: { readonly server?: boolean; readonly preload?: boolean },
  ): Promise<BeforeLoadResult> => {
    const modes = resolveSsr(
      candidate?.route.chain ?? [],
      defaults.ssr ?? true,
      config.ssrDecisions,
    );
    const out: Record<string, unknown>[] = [];
    const produced: (Record<string, unknown> | undefined)[] = [];
    // Parent-to-child by SPREAD, child wins on a collision — TanStack's rule
    // (`load-client.ts:391-395`, `:455-458`) and its type-level `Assign` agrees.
    let merged: Record<string, unknown> = rootContext;
    const entering = candidate?.route.chain ?? [];
    const abortController = new AbortController();
    const preload = options?.preload === true;
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
      const given = {
        params: forParams,
        search: forSearch,
        location: to,
        context: merged,
        abortController,
        preload,
        cause: preload ? ("preload" as const) : causeFor(route),
        navigate,
        buildLocation,
        matches: entering,
        routeId: route.id,
      };
      const sync = route.definition.context?.(given as never);
      if (sync !== undefined) merged = { ...merged, ...sync };
      let own: Record<string, unknown> | undefined | null;
      try {
        own = (await route.definition.beforeLoad?.({
          ...given,
          context: merged,
        } as never)) as Record<string, unknown> | undefined | null;
        if (isRedirect(own) || isNotFound(own)) throw own;
      } catch (error) {
        if (!isRedirect(error) && !isNotFound(error) && !(error instanceof Response)) {
          route.definition.onError?.(error);
        }
        throw error;
      }
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
    let merged: Record<string, unknown> = rootContext;
    const { slices } = parseChain(candidate?.route.chain ?? [], candidate?.params ?? {});
    const forSearch = new URLSearchParams(to.search);
    const abortController = new AbortController();

    for (const [depth, route] of (candidate?.route.chain ?? []).entries()) {
      const forParams = slices[depth] ?? candidate?.params ?? {};
      const given = {
        params: forParams,
        search: forSearch,
        location: to,
        context: merged,
        abortController,
        preload: false,
        cause: "enter" as const,
        navigate,
        buildLocation,
        matches: candidate?.route.chain ?? [],
        routeId: route.id,
      };
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

    const built = searchFor(
      pathPart === "" ? untrack(location).pathname : pathPart,
      null,
      query,
      untrack,
    );
    return built === query ? to : `${pathPart}${built}${hash}`;
  };

  /**
   * The query a location being built ends up with: the caller's intent, run
   * through the destination chain's search middlewares.
   *
   * `intent` is a record to write, or `null` when the caller wrote the query as
   * text, which is then left exactly as written unless a middleware has a say.
   */
  const searchFor = (
    pathname: string,
    intent: Record<string, unknown> | null,
    query: string,
    read: Reader,
  ): string => {
    const candidate = matcher.match(pathname);
    const middlewares: SearchMiddleware[] = [];
    for (const route of candidate?.route.chain ?? []) {
      for (const step of route.definition.search?.middlewares ?? []) middlewares.push(step);
    }
    if (middlewares.length === 0) return intent === null ? query : writeSearch(intent);
    return writeSearch(
      applySearchMiddleware(
        middlewares,
        readSearch(read(search)),
        intent ?? readSearch(query),
        read(validated).defaults,
      ),
    );
  };

  /** A route id or pattern as a concrete path, filled from the current params. */
  const concrete = (path: string, read: Reader): string => {
    if (!/(^|\/)\$|\{-?\$/.test(path)) return path;
    try {
      return interpolate(path, read(rawParams));
    } catch {
      return path;
    }
  };

  /**
   * `params.stringify`, for every route on the way to the destination.
   *
   * The inverse of the `parse` that produced the value: a route working in
   * `Date` has to write a URL, and `interpolate` only knows how to encode a
   * string. Runs outermost first so a leaf can override what a layout wrote for
   * a shared name, which is the direction every other chain merge in the router
   * goes.
   *
   * A THROW IS SWALLOWED, which is TanStack's choice (`router.ts:1943-1952`) and
   * the right one here: this runs while a link is being rendered, where there
   * is no boundary to catch it and nobody waiting on an answer. The paired
   * `parse` refuses the same value on the way back in, with a boundary, if the
   * link is ever followed.
   */
  const stringifyParams = (
    forChain: readonly Route[] | undefined,
    values: Record<string, unknown>,
  ): Record<string, string> => {
    let out: Record<string, unknown> = values;
    for (const route of forChain ?? []) {
      const stringify = route.definition.params?.stringify;
      if (stringify === undefined) continue;
      try {
        out = { ...out, ...stringify(out) };
      } catch {
        /* see above: a link cannot report this and must still render */
      }
    }
    return out as Record<string, string>;
  };

  /**
   * `read` is how the current location is read: tracked for a `<Link>`, whose
   * href follows it, and `untrack` for a navigation, which asks once.
   */
  const locate = (options: ToOptions, read: Reader): BuiltLocation => {
    const outside = options.href ?? (leavesTheApp(options.to ?? ".") ? options.to : undefined);
    if (outside !== undefined) {
      return {
        pathname: outside,
        search: "",
        hash: "",
        state: null,
        key: "",
        href: outside,
        external: true,
      };
    }
    const to = options.to ?? ".";
    const cut = to.search(/[?#]/);
    const pathPart = cut === -1 ? to : to.slice(0, cut);
    const rest = cut === -1 ? "" : to.slice(cut);
    const hashAt = rest.indexOf("#");
    const written = hashAt === -1 ? rest : rest.slice(0, hashAt);
    const here = read(location);
    // `from` pins what a relative `to` is relative TO. Without it a
    // `<Link to="../edit">` in a shared component means something different
    // depending on which route rendered it.
    const anchor = options.from === undefined ? here.pathname : concrete(options.from, read);

    const destination = matcher.routes.find((route) => route.id === pathPart);
    const given = options.params;
    const next = (): Record<string, unknown> =>
      given === undefined || given === true
        ? read(rawParams)
        : { ...read(rawParams), ...(typeof given === "function" ? given(read(params)) : given) };
    // A route id is tried first and falls through to path resolution, so
    // `to: "/users/$id"` with `params` builds `/users/7` while `to: "/users/7"`
    // is taken as it stands.
    const resolved = resolvePath(pathPart, anchor);
    const built =
      destination !== undefined
        ? interpolate(destination.fullPath, stringifyParams(destination.chain, next()))
        : given !== undefined && given !== true
          ? interpolate(resolved, stringifyParams(undefined, next()))
          : concrete(resolved, read);
    // A `to` that is a route ID carries the pattern's spelling, not the
    // caller's, so `"preserve"` reads the ORIGIN when `to` addressed nowhere
    // new, which is the `to: "."` that re-renders where you already are.
    const pathname = applyTrailingSlash(
      built,
      trailingSlash,
      (pathPart === "" || pathPart === "." ? anchor : pathPart).endsWith("/"),
    );

    const asked = options.search;
    const intent =
      asked === undefined || typeof asked === "string"
        ? null
        : asked === true
          ? read(validSearch)
          : typeof asked === "function"
            ? asked(read(validSearch))
            : asked;
    const text = typeof asked === "string" ? asked : written;
    const query = searchFor(
      pathname,
      intent,
      text === "" || text.startsWith("?") ? text : `?${text}`,
      read,
    );

    const fragment =
      options.hash === undefined
        ? hashAt === -1
          ? ""
          : rest.slice(hashAt + 1)
        : options.hash === true
          ? here.hash.slice(1)
          : typeof options.hash === "function"
            ? options.hash(here.hash.slice(1))
            : options.hash.replace(/^#/, "");
    const state =
      options.state === true
        ? here.state
        : typeof options.state === "function"
          ? (options.state as (current: unknown) => unknown)(here.state)
          : (options.state ?? null);

    const target = parseLocation(
      `${pathname}${query}${fragment === "" ? "" : `#${fragment}`}`,
      state,
    );
    const mask = options.mask;
    return {
      ...target,
      href: href(target),
      external: false,
      ...(mask === undefined
        ? {}
        : {
            maskedLocation:
              typeof mask === "string"
                ? { href: mask }
                : { href: locate(mask, read).href, unmaskOnReload: mask.unmaskOnReload },
          }),
    };
  };

  const buildLocation = (options: ToOptions = {}): BuiltLocation => locate(options, track);

  const matchOf = (
    route: Route,
    at: {
      readonly raw: Readonly<Record<string, string>>;
      readonly params: Readonly<Record<string, unknown>>;
      readonly search: URLSearchParams;
      readonly valid: Record<string, unknown>;
      readonly context: Record<string, unknown>;
      readonly paramsError?: unknown;
      readonly searchError?: unknown;
      /** A cached entry to describe as it stands, whatever the location says. */
      readonly entry?: Entry;
    },
  ): RouteMatch => {
    const { seedKey, deps } =
      at.entry === undefined
        ? keyOf(route, at.raw, at.search)
        : { seedKey: at.entry.key, deps: at.entry.deps };
    const entry =
      at.entry ?? (route.definition.loader === undefined ? undefined : entries.get(seedKey));
    let failure: unknown = at.paramsError ?? at.searchError ?? undefined;
    let status: RouteMatch["status"] = failure === undefined ? "success" : "error";
    let loaderData: unknown;
    const failed = (error: unknown): void => {
      failure = error;
      status = isNotFound(error) ? "notFound" : "error";
    };
    if (failure === undefined && route.definition.loader !== undefined) {
      if (entry === undefined) status = "pending";
      else if (entry.settled !== null) loaderData = entry.settled.value;
      else if (entry.error !== undefined) failed(entry.error);
      else if (entry.inFlight) status = "pending";
      else {
        // Neither run nor failed: the value came from the server's seed, which
        // answers the read without the loader ever being entered.
        try {
          loaderData = untrack(entry.cell);
        } catch (error) {
          if (error instanceof NotReadyError) status = "pending";
          else failed(error);
        }
      }
    }
    let pathname = route.fullPath;
    try {
      pathname = interpolate(route.fullPath, at.raw);
    } catch {
      /* a pattern the captured params cannot fill is shown as the pattern */
    }
    return {
      id: seedKey,
      routeId: route.id,
      fullPath: route.fullPath,
      pathname,
      params: at.params as Record<string, string>,
      search: at.valid,
      loaderData,
      loaderDeps: deps,
      context: at.context,
      status,
      isFetching: entry?.inFlight === true ? "loader" : false,
      error: failure,
      paramsError: at.paramsError ?? undefined,
      searchError: at.searchError ?? undefined,
      updatedAt: entry?.updatedAt ?? 0,
      cause: entry?.cause ?? causeFor(route),
      staticData: route.definition.staticData ?? {},
      definition: route.definition,
    };
  };

  const matches = (): readonly RouteMatch[] => {
    loads();
    const raw = rawParams();
    const forSearch = search();
    const searched = validated();
    const parsed = parsedParams();
    const all = contexts();
    return chain().map((route, depth) =>
      matchOf(route, {
        raw,
        params: parsed.slices[depth] ?? raw,
        search: forSearch,
        valid: searched.slices[depth] ?? readSearch(forSearch),
        context: all[depth] ?? rootContext,
        paramsError: parsed.failures[depth] ?? undefined,
        searchError: searched.failures[depth] ?? undefined,
      }),
    );
  };

  const parentMatch = async (
    route: Route,
    forSearch: URLSearchParams,
    cause: LoadCause,
    lane?: Lane,
  ): Promise<RouteMatch | undefined> => {
    const laneChain = lane?.chain ?? untrack(chain);
    const at = laneChain.indexOf(route);
    const parent = at > 0 ? laneChain[at - 1] : undefined;
    if (parent === undefined) return undefined;
    const raw = lane?.raw ?? untrack(rawParams);
    const forParams = (parseChain(laneChain, raw).slices[at - 1] ?? raw) as Record<string, string>;
    const context = lane?.contexts[at - 1] ?? untrack(contexts)[at - 1] ?? rootContext;
    if (parent.definition.loader !== undefined) {
      const { seedKey, deps } = keyOf(parent, raw, forSearch);
      const entry =
        entries.get(seedKey) ??
        mint(
          parent,
          forParams,
          forSearch,
          seedKey,
          deps,
          cause,
          lane === undefined ? undefined : context,
          lane,
        );
      if (entry.running !== null) await entry.running;
    }
    return matchOf(parent, {
      raw,
      params: forParams,
      search: forSearch,
      valid: readSearch(forSearch),
      context,
    });
  };

  const primeChain = (server = false): void => {
    // A loader started while a write is still staged reads it, and is asked
    // again when the write is published: two fetches for one navigation.
    flush();
    const forParams = untrack(params);
    const modes = resolveSsr(untrack(chain), defaults.ssr ?? true, config.ssrDecisions);
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
    return untrack(contexts)[at] ?? rootContext;
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
      if (shouldReload(entry, forParams)) entry.reload();
    }
    previous = untrack(chain);
  };

  // Handed from `navigate` to the subscription, because the location is what
  // commits and the context has to land with it rather than after it.
  let pendingContexts: readonly Record<string, unknown>[] | null = null;

  /**
   * Which history entry the page is being taken to, so a slow chunk cannot
   * commit over a faster navigation that started after it.
   *
   * Every entry waits for its own modules and they do not arrive in the order
   * they were asked for: a click on a 300 KB route followed by a click back
   * resolves the second first, and without this the first would land on top of
   * it and leave the page on a route nobody asked to be on.
   */
  let newestEntry = 0;

  const accept = (next: Location): void => {
    noteIdle();
    committedIndex = history.depth?.() ?? 0;
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
      setLocation(next);

      // A popstate has no `navigate` to have run `beforeLoad`, so the context
      // for the entry it lands on is rebuilt asynchronously and the render sees
      // the ancestors' contribution as soon as it settles.
      if (pendingContexts !== null) {
        settleContexts(pendingContexts);
        pendingContexts = null;
      } else {
        const candidate = matcher.match(unmask(next));
        writeContexts([]);
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
      // A write is staged until the flush, and everything below reads what the
      // new location derives: the chain, its params, the search.
      flush();
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
      /**
       * The chunk FIRST, and the commit only once it is here.
       *
       * A route is renderable when both its data and its own module are ready,
       * and only the data half has a boundary to park in. `lazy()` makes a
       * route its own chunk, so committing before it arrives tears the previous
       * page down and puts nothing in its place: the depth's `Loading` boundary
       * re-arms on the pathname, its fallback is `null` for a route that
       * declares no `pendingComponent`, and the page is empty until the module
       * lands. Measured on `@barqjs/site` as 705 elements dropping to 84 for
       * 166 ms on a single link click.
       *
       * This is TanStack's rule and their wording — "a route is renderable only
       * after both its data and normal component chunk are ready"
       * (`router-core/src/load-client.ts`). Their matches stay `pending` and the
       * PRESENTED ones keep rendering until the chunk resolves; with no
       * `pendingComponent` to reveal, `offerPending` never cuts the wait short.
       *
       * HERE and not in `navigate`, because the back button never goes through
       * `navigate` and flashed exactly the same way.
       */
      const mine = ++newestEntry;
      const chunks = pendingChunks(matcher.match(unmask(next))?.route.chain ?? []);
      setCommitting(untrack(committing) + 1);
      try {
        // SYNCHRONOUS when there is nothing to fetch. A navigation to a route
        // whose module is already in memory commits in the same task it always
        // did; only a cold chunk defers, which is the case that was broken.
        if (chunks.length > 0) {
          await Promise.allSettled(chunks);
          if (mine !== newestEntry) return;
        }
        const wanted =
          asked?.viewTransition ?? config.defaultViewTransition ?? config.viewTransition ?? false;
        const info = changeInfo(leaving, next);
        const types =
          typeof wanted !== "object"
            ? undefined
            : typeof wanted.types === "function"
              ? wanted.types({
                  fromLocation: info.from,
                  toLocation: info.to,
                  pathChanged: info.pathChanged,
                  hrefChanged: info.hrefChanged,
                  hashChanged: info.hashChanged,
                })
              : wanted.types;
        await withViewTransition(commit, {
          enabled:
            wanted !== false &&
            types !== false &&
            (typeof wanted !== "object" || wanted.enabled !== false),
          types: types === false ? undefined : types,
        });
      } finally {
        setCommitting(untrack(committing) - 1);
      }
      // The DOM is written — `withViewTransition` awaits the update callback
      // rather than the animation — so this is the first moment a listener can
      // measure the new page.
      emit("onResolved", leaving, next);
      scroll.restore(next, {
        reset: asked?.resetScroll,
        hashScrollIntoView: asked?.hashScrollIntoView,
      });
      emit("onRendered", leaving, next);
    };
    void restoreScroll();

    for (const hook of config.afterEach ?? []) hook(next);
  };

  /** Where the history was when the location on screen was accepted. */
  let committedIndex = history.depth?.() ?? 0;
  /** The index a `go` this router issued to undo a refused pop will land on. */
  let undoing: number | null = null;
  let popAsks = 0;

  /**
   * A back or forward button has ALREADY moved the browser by the time anything
   * hears of it, so refusing one means going back by the same distance. The
   * page is not touched until the blockers have answered.
   */
  const unsubscribe = history.subscribe((next, action) => {
    const index = history.depth?.() ?? 0;
    if (action !== "pop" || pendingIsNavigate) {
      accept(next);
      return;
    }
    if (undoing === index) {
      undoing = null;
      return;
    }
    undoing = null;
    const delta = index - committedIndex;
    if (blockers.size === 0 || history.depth === undefined || delta === 0) {
      accept(next);
      return;
    }
    void answerPop(next, delta);
  });

  const answerPop = async (landed: Location, delta: number): Promise<void> => {
    const mine = ++popAsks;
    const refused = await isBlocked(untrack(location), landed, delta < 0 ? "BACK" : "FORWARD");
    if (mine !== popAsks) return;
    if (!refused) {
      accept(landed);
      return;
    }
    undoing = committedIndex;
    history.go(-delta);
  };

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

  const blockers = new Map<Blocker, BlockOptions | undefined>();

  const blockerLocation = (at: Location): BlockerLocation => {
    const hit = matcher.match(unmask(at));
    return {
      routeId: hit?.route.id ?? "__notFound__",
      fullPath: hit?.route.fullPath ?? at.pathname,
      pathname: at.pathname,
      params: hit?.params ?? {},
      search: readSearch(at.search),
    };
  };

  /**
   * Every registered blocker is asked, in registration order, and the FIRST
   * refusal ends it. A snapshot, so a blocker that unregisters another while it
   * is being asked does not break the iteration.
   */
  const isBlocked = async (
    from: Location,
    to: Location,
    action: HistoryAction,
  ): Promise<boolean> => {
    if (blockers.size === 0) return false;
    const context = {
      from,
      to,
      current: blockerLocation(from),
      next: blockerLocation(to),
      action,
    };
    for (const blocker of Array.from(blockers.keys())) {
      if (await blocker(context)) return true;
    }
    return false;
  };

  const onBeforeUnload = (event: BeforeUnloadEvent): void => {
    for (const options of blockers.values()) {
      const enabled = options?.enableBeforeUnload;
      if (typeof enabled === "function" ? enabled() : enabled === true) {
        // Both, because browsers disagree about which one asks.
        event.preventDefault();
        event.returnValue = "";
        return;
      }
    }
  };
  let unloadGuarded = false;
  const guardUnload = (): void => {
    if (typeof window === "undefined") return;
    const wanted = Array.from(blockers.values()).some(
      (options) =>
        options?.enableBeforeUnload !== undefined && options.enableBeforeUnload !== false,
    );
    if (wanted === unloadGuarded) return;
    unloadGuarded = wanted;
    if (wanted) window.addEventListener("beforeunload", onBeforeUnload, { capture: true });
    else window.removeEventListener("beforeunload", onBeforeUnload, { capture: true });
  };

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
    for (const listener of Array.from(set)) {
      try {
        listener(event);
      } catch (error) {
        console.error(
          `[barq-router] A listener passed to \`router.subscribe(${JSON.stringify(type)}, ...)\` threw. The navigation continued and the other listeners still ran. The error:`,
          error,
        );
      }
    }
  };

  const [navigating, setNavigating] = createSignal(0);
  const [committing, setCommitting] = createSignal(0, { ownedWrite: true });
  const status = (): "pending" | "idle" =>
    navigating() > 0 || committing() > 0 || matches().some((found) => found.status === "pending")
      ? "pending"
      : "idle";
  /** The last location seen idle, kept for as long as the router is not. */
  let resolved: Location | undefined;
  const noteIdle = (): void => {
    if (untrack(status) === "idle") resolved = untrack(location);
  };
  const resolvedLocation = (): Location | undefined => {
    const at = location();
    if (status() === "idle") resolved = at;
    return resolved;
  };
  const isLoading = (): boolean => status() === "pending";
  const isTransitioning = (): boolean => committing() > 0;
  const scroll: ScrollRestoration =
    config.scrollRestoration === false
      ? { save: () => {}, restore: () => {}, dispose: () => {} }
      : scrollRestoration({
          ...config.scroll,
          getKey: config.getScrollRestorationKey ?? config.scroll?.getKey,
          toTop: config.scrollToTopSelectors ?? config.scroll?.toTop,
          behavior: config.scrollRestorationBehavior ?? config.scroll?.behavior,
          hashScrollIntoView: config.defaultHashScrollIntoView ?? config.scroll?.hashScrollIntoView,
        });
  // Set by `navigate` and read by the subscription, because the COMMIT is where
  // both of these apply and only the caller knows what it asked for.
  let pendingNavigate: NavigateOptions | undefined;
  /** Whether the entry about to commit came from `navigate` rather than a popstate. */
  let pendingIsNavigate = false;

  let hops = 0;
  const MAX_REDIRECTS = 10;

  const navigate = (async (to: string | NavigateOptions, options?: NavigateOptions) => {
    noteIdle();
    setNavigating(untrack(navigating) + 1);
    try {
      return await attemptNavigate(typeof to === "string" ? { ...options, to } : to);
    } finally {
      setNavigating(untrack(navigating) - 1);
    }
  }) as NavigateFn;

  /** A redirect thrown in process still has the navigation it described; one off the wire has `to`. */
  const follow = (answer: {
    readonly to: string;
    readonly options?: NavigateOptions;
  }): Promise<void> =>
    answer.options === undefined
      ? navigate(answer.to, { replace: true })
      : navigate({ ...answer.options, replace: true, ignoreBlocker: true });

  const attemptNavigate = async (asked: NavigateOptions): Promise<void> => {
    // Middlewares run on the way OUT, while the location is being built, so a
    // retained key is present in it rather than patched on afterwards.
    const target = locate(asked, untrack);
    if (target.external || asked.reloadDocument === true) {
      if (typeof window !== "undefined") {
        const url = target.external
          ? target.href
          : publicHref(target.href, { rewrite: config.rewrite, origin, base });
        if (asked.replace === true) window.location.replace(url);
        else window.location.assign(url);
      }
      return;
    }
    // BEFORE the blockers, so a listener hears about navigations that are then
    // refused — which is what a progress bar and a devtool both want, and what
    // `beforeEach` cannot say because it IS one of the refusals.
    emit("onBeforeNavigate", untrack(location), target);

    // Blockers first: a navigation nobody is going to make should not be
    // running guards, building context or warming a cache for itself.
    if (
      asked.ignoreBlocker !== true &&
      (await isBlocked(untrack(location), target, asked.replace === true ? "REPLACE" : "PUSH"))
    ) {
      return;
    }

    const verdict = await runGuards(target);
    if (verdict === false) return;
    if (typeof verdict === "string") {
      if (hops++ >= MAX_REDIRECTS) {
        hops = 0;
        console.error(
          `[barq-router] This navigation was redirected more than ${MAX_REDIRECTS} times and was abandoned at ${JSON.stringify(verdict)}. ` +
            "Two `beforeEach` or `beforeEnter` guards are probably redirecting to each other: make one of them let the navigation through.",
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
          console.error(
            `[barq-router] This navigation was redirected more than ${MAX_REDIRECTS} times and was abandoned. ` +
              "Two routes are probably redirecting to each other from `beforeLoad`: make one of them let the navigation through.",
          );
          return;
        }
        await follow(error);
        hops = 0;
        return;
      }
      throw error;
    }
    pendingContexts = produced;
    pendingNavigate = asked;
    pendingIsNavigate = true;
    // The per-call `mask` wins: a call site that names one has said something
    // about THIS navigation that a table cannot know.
    const declared = maskFor(target);
    const mask = target.maskedLocation?.href ?? declared?.to;
    // Where the page being LEFT is, recorded before it stops being current.
    scroll.save(untrack(location));
    if (mask === undefined) {
      history.push(target.href, { replace: asked.replace, state: target.state });
      return;
    }
    // The mask goes in the URL; the real target goes in the state the URL
    // carries, so a reload in this tab still renders what was open — unless
    // `unmaskOnReload` says otherwise, and then the page load that wrote it is
    // recorded beside it and a later one stops honouring it.
    const survives =
      target.maskedLocation !== undefined
        ? (target.maskedLocation.unmaskOnReload ??
          asked.unmaskOnReload ??
          config.unmaskOnReload ??
          false)
        : (declared?.unmaskOnReload ?? false);
    history.push(mask, {
      replace: asked.replace,
      state: {
        ...(target.state as object | null),
        [MASK]: target.href,
        ...(survives ? { [MASK_SESSION]: MASK_KEY } : {}),
      },
    });
  };

  /** The loaders of the chain on screen that are still running. */
  const settleChain = async (reloads: boolean): Promise<void> => {
    const forRaw = untrack(rawParams);
    const forSearch = untrack(search);
    const waits: Promise<void>[] = [];
    for (const route of untrack(chain)) {
      const entry = entries.get(keyOf(route, forRaw, forSearch).seedKey);
      if (entry === undefined || entry.running === null || !entry.inFlight) continue;
      if (reloads || entry.settled === null) waits.push(entry.running);
    }
    await Promise.all(waits);
  };

  const entryMatch = (entry: Entry): RouteMatch =>
    matchOf(entry.route, {
      raw: entry.raw,
      params: entry.params,
      search: NO_SEARCH,
      valid: {},
      context: rootContext,
      entry,
    });

  const preloadLocation = async (
    target: BuiltLocation,
  ): Promise<readonly RouteMatch[] | undefined> => {
    if (target.external) return undefined;
    const candidate = matcher.match(target.pathname);
    if (candidate === null) return undefined;

    /**
     * The MODULES, started before the guards rather than after the loaders.
     *
     * A preload that warmed only the loaders warmed the half that was never
     * the wait. The commit holds for the chunk, so an intent preload that
     * leaves it cold has bought nothing for the one thing it was asked to
     * shorten. TanStack's `preloadClientRoute` runs `executeClientLane`, the
     * same lane a real load takes, and `loadRouteChunk` is in it.
     *
     * NOT AWAITED: a preload is speculative and its caller does not wait, so
     * the fetch starting is the whole of what this line is for.
     */
    void preloadMatched(candidate.route.chain);

    let produced: readonly Record<string, unknown>[];
    try {
      produced = (await runBeforeLoad(target, candidate, { preload: true })).contexts;
    } catch {
      // A preload that would have been refused simply does not warm anything.
      return undefined;
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
    const lane: Lane = {
      chain: candidate.route.chain,
      raw: forRaw,
      location: target,
      contexts: produced,
    };
    const valid = readSearch(forSearch);
    return candidate.route.chain.map((route, depth) => {
      const forParams = (slices[depth] ?? forRaw) as Record<string, string>;
      if (route.definition.loader !== undefined && route.definition.preload !== false) {
        const { seedKey, deps } = keyOf(route, forRaw, forSearch);
        const entry =
          entries.get(seedKey) ??
          mint(
            route,
            forParams,
            forSearch,
            seedKey,
            deps,
            "preload",
            produced[depth] ?? rootContext,
            lane,
          );
        try {
          entry.cell();
        } catch {
          /* pending or failed; both are states the cache now holds */
        }
      }
      return matchOf(route, {
        raw: forRaw,
        params: forParams,
        search: forSearch,
        valid,
        context: produced[depth] ?? rootContext,
      });
    });
  };

  const api: RouterState = {
    location,
    match,
    params,
    search,
    chain,
    matcher,
    config,
    options: {
      dehydrate: config.dehydrate,
      hydrate: config.hydrate,
      Wrap: config.Wrap,
      InnerWrap: config.InnerWrap,
    },
    history,
    base,
    trailingSlash,
    missed,
    dataFor,
    navigate,
    buildLocation,
    matches,
    status,
    isLoading,
    isTransitioning,
    resolvedLocation,
    get state() {
      return untrack(() => ({
        status: status(),
        isLoading: status() === "pending",
        isTransitioning: committing() > 0,
        matches: matches(),
        location: location(),
        resolvedLocation: resolvedLocation(),
      }));
    },
    async load(options) {
      if (started) {
        flush();
        revalidate();
        primeChain();
      } else {
        await api.start();
      }
      await settleChain(options?.sync === true);
    },
    settled: () => settleChain(false),
    clearCache(options) {
      const live = liveKeys();
      for (const [key, entry] of entries) {
        if (live.has(key)) continue;
        if (options?.filter !== undefined && !options.filter(entryMatch(entry))) continue;
        collect(key, entry);
      }
      setLoads(bump);
    },
    preloadRoute: (options) => preloadLocation(locate(options, untrack)),
    buildSearch,
    validSearch: validSearch,
    searchErrorAt(depth) {
      return untrack(validated).failures[depth] ?? null;
    },
    paramsErrorAt(depth) {
      return untrack(parsedParams).failures[depth] ?? null;
    },
    blockingReloads,
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
    block(blocker, options) {
      blockers.set(blocker, options);
      guardUnload();
      return () => {
        blockers.delete(blocker);
        guardUnload();
      };
    },
    matchRoute(asked, matchOptions) {
      const options = {
        ...asked,
        ...matchOptions,
        to:
          asked.from === undefined || asked.to.startsWith("/")
            ? asked.to
            : resolvePath(asked.to, asked.from),
      };
      const here = location();
      const hit = matcher.match(unmask(here));
      if (hit === null) return false;

      // A ROUTE ID first, exactly as `<Link to>` resolves one: `/posts/$id`
      // names a route, and matching it against the pathname as a literal would
      // compare `$id` to `7`.
      const named = matcher.routes.find((route) => route.id === options.to);
      const pattern = named?.fullPath;
      const reached =
        pattern === undefined
          ? // A concrete path. `isUnder` is the fuzzy test `<NavLink>` uses and
            // it compares on a SEGMENT boundary, so `/postscript` is not under
            // `/posts`.
            options.fuzzy === true
            ? isUnder(withoutTrailingSlash(here.pathname), withoutTrailingSlash(options.to))
            : withoutTrailingSlash(here.pathname) === withoutTrailingSlash(options.to)
          : options.fuzzy === true
            ? hit.route.chain.some((route) => route.fullPath === normalize(pattern))
            : hit.route.fullPath === normalize(pattern);
      if (!reached) return false;

      // A PARTIAL comparison, which is theirs: `{ id: "7" }` asks about `id`
      // and says nothing about the rest, so a route with three parameters can
      // be asked about one.
      for (const [key, value] of Object.entries(options.params ?? {})) {
        if (hit.params[key] !== value) return false;
      }
      if (options.includeSearch !== false) {
        const current = new URLSearchParams(here.search);
        for (const [key, value] of Object.entries(options.search ?? {})) {
          if (current.get(key) !== value) return false;
        }
      }
      return hit.params;
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
    ssrModes: () => resolveSsr(chain(), defaults.ssr ?? true, config.ssrDecisions),
    async preload(to) {
      await preloadLocation(locate({ to }, untrack));
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
    async invalidate(options) {
      for (const entry of entries.values()) {
        if (options?.filter === undefined || options.filter(entryMatch(entry))) entry.reload();
      }
      setGeneration(untrack(generation) + 1);
      if (options?.sync === true) await settleChain(true);
    },
    dispose() {
      unsubscribe();
      scroll.dispose();
      blockers.clear();
      guardUnload();
      for (const entry of entries.values()) entry.dispose();
      entries.clear();
      memo.clear();
    },
  };
  return api;
}
