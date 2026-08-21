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

import { type Cell, computed, runWithOwner, signal, untrack } from "@barqjs/core";

import { type History, type Location, href, memoryHistory, parseLocation } from "./history.ts";
import { type Match, type Matcher, createMatcher } from "./matcher.ts";
import { type AnyRouteDefinition, type Route, flattenRoutes } from "./route.ts";
import { leavesTheApp, resolvePath } from "./path.ts";

/** How many resolved loader cells to keep. Beyond this the oldest go. */
const DEFAULT_CACHE_SIZE = 100;

export interface NavigateOptions {
  readonly replace?: boolean;
  readonly state?: unknown;
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

export interface RouterConfig {
  readonly routes: readonly AnyRouteDefinition[];
  readonly history?: History;
  /** Rendered at depth 0 when nothing matched. */
  readonly notFound?: AnyRouteDefinition["component"];
  readonly beforeEach?: readonly Guard[];
  readonly afterEach?: readonly ((location: Location) => void)[];
  readonly cacheSize?: number;
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
  readonly matcher: Matcher<Route>;
  readonly config: RouterConfig;
  readonly history: History;
  /** The loader cell for one route at one set of params, created once per key. */
  dataFor(route: Route, params: Readonly<Record<string, string>>): Cell<unknown>;
  /**
   * Start every loader in the matched chain, without rendering anything.
   *
   * Loaders are PULL-based here: a read starts the fetch. A child's boundary is
   * built inside its parent's content, so a parent that parks means the child's
   * loader has not started — a waterfall on the client, and on the string
   * backend a page that is simply WRONG: `renderPage` renders twice, pass 1
   * parks at depth 0 so depth 1 is never constructed, pass 2 is depth 1's first
   * read and there is no pass 3. Measured on a three-deep chain: one depth of
   * three in the markup and one seed of three.
   *
   * Priming is one pass over the chain and it fixes both. Measured, same chain
   * at 40 ms a loader: 121 ms to 41 ms, and the three loaders start in the same
   * millisecond instead of 40 ms apart.
   *
   * MUST be called from INSIDE the render, not before it. A value whose first
   * read happens outside a render session is attributed to the `null` bucket
   * and is seeded into nobody (`signals.ts` `getHydrationData`, and the reason
   * is `38eee03`).
   */
  prime(): void;
  navigate(to: string, options?: NavigateOptions): Promise<void>;
  /** Drop every cached loader result and re-read the current location. */
  invalidate(): void;
  dispose(): void;
}

export function createRouter(config: RouterConfig): RouterState {
  const history = config.history ?? memoryHistory();
  const matcher = createMatcher(flattenRoutes(config.routes));

  const location = signal<Location>(history.current());
  // Bumped by `invalidate`, and read by every loader cell, so invalidating is a
  // reactive fact rather than a cache the router has to reach into.
  const generation = signal(0);

  const match = computed<Match<Route> | null>(() => matcher.match(location().pathname));
  const params = computed<Record<string, string>>(() => match()?.params ?? {});
  const search = computed(() => new URLSearchParams(location().search));
  const chain = computed<readonly Route[]>(() => match()?.route.chain ?? []);

  const cells = new Map<string, Cell<unknown>>();
  const limit = config.cacheSize ?? DEFAULT_CACHE_SIZE;

  // A `computed` captures `currentOwner` at CREATION, and a loader's first read
  // happens wherever the route is being built — inside the loading boundary's
  // content. On a string render that content is DISCARDED when the boundary
  // parks (`ssr.ts`: `if (SINK === null) return html(shown)`), taking the scope
  // the cell was created under with it. `renderPage`'s second pass then read a
  // dead node and got `undefined`: every SSR'd route rendered its data as
  // `undefined` and seeded nothing, silently.
  //
  // The cells are a per-ROUTER cache, not a per-position value, so they are
  // created with NO owner and this map is their lifetime. `dispose()` clears
  // it; nothing else may.

  const dataFor = (route: Route, forParams: Readonly<Record<string, string>>): Cell<unknown> => {
    const loader = route.definition.loader;
    // The search the cell is built for, captured HERE. Reading it inside the
    // loader body instead is what made the cache answer with a stale query: the
    // body runs once, so `untrack(search)` froze the search of whichever
    // navigation happened to create the cell.
    const forSearch = untrack(search);
    const seedKey = loaderKey(route.id, forParams, searchKey(forSearch));
    const key = `${seedKey}#${untrack(generation)}`;
    const existing = cells.get(key);
    if (existing !== undefined) return existing;

    const build = (): Cell<unknown> =>
      loader === undefined
        ? () => undefined
        : computed(
            async () => {
              const controller = new AbortController();
              try {
                return await loader({
                  params: forParams as never,
                  search: forSearch,
                  signal: controller.signal,
                });
              } catch (error) {
                config.onLoaderError?.(error);
                throw error;
              }
            },
            // The generation is NOT in the seed key: the server always renders
            // at generation 0 and a client that has invalidated since would
            // otherwise look for a key the server never wrote.
            { key: seedKey },
          );

    const cell = runWithOwner(null, build);
    cells.set(key, cell);
    if (cells.size > limit) {
      const oldest = cells.keys().next();
      if (!oldest.done) cells.delete(oldest.value);
    }
    return cell;
  };

  const unsubscribe = history.subscribe((next) => {
    location.set(next);
    for (const hook of config.afterEach ?? []) hook(next);
  });

  const runGuards = async (to: Location): Promise<boolean | string> => {
    const from = untrack(location);
    const candidate = matcher.match(to.pathname);
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

  let hops = 0;
  const MAX_REDIRECTS = 10;

  const navigate = async (to: string, options?: NavigateOptions): Promise<void> => {
    if (leavesTheApp(to)) {
      if (typeof window !== "undefined") window.location.assign(to);
      return;
    }
    // Split the query and hash off BEFORE resolving. `resolvePath` works on
    // segments and treats `?role=user` as one, so resolving the whole string
    // and then re-appending the query wrote it twice — `/?role=user?role=user`.
    const cut = to.search(/[?#]/);
    const pathPart = cut === -1 ? to : to.slice(0, cut);
    const rest = cut === -1 ? "" : to.slice(cut);
    const resolved = resolvePath(
      pathPart === "" ? untrack(location).pathname : pathPart,
      untrack(location).pathname,
    );
    const target = parseLocation(resolved + rest, options?.state ?? null);

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
    history.push(href(target), { replace: options?.replace, state: options?.state });
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
    prime() {
      const forParams = untrack(params);
      for (const route of untrack(chain)) {
        if (route.definition.loader === undefined) continue;
        try {
          dataFor(route, forParams)();
        } catch {
          // `NotReadyError` is the point — the fetch is now in flight. A cell
          // that has already FAILED throws its error here too, and swallowing
          // it is correct: the read inside the boundary throws it again with a
          // boundary to catch it, and `onLoaderError` has already fired.
        }
      }
    },
    invalidate() {
      cells.clear();
      generation.set(untrack(generation) + 1);
    },
    dispose() {
      unsubscribe();
      cells.clear();
    },
  };
}
