/**
 * Hooks, which are the only way to reach a router.
 *
 * There is no module-global `navigate()` and no registry. A router is reached
 * through the scope chain that provided it, which is what makes two routers on
 * one page work and what makes a router die with the scope that made it.
 */

import { type Cell, createMemo, onCleanup } from "@barqjs/core";

import { type BlockerResolver, type UseBlockerOptions, blockWith } from "./blocker.ts";
import { useRouter } from "./components.ts";
import { isRedirect } from "./errors.ts";
import type { Location } from "./history.ts";
import { type MatchHookOptions, type Thrown, loaderCell, matchCell, matchesCell } from "./match.ts";
import type { NavigateFn } from "./register.ts";
import { type ScrollPosition, savedScrollPosition, scrollKey } from "./scroll.ts";
import {
  type Blocker,
  type MatchRouteOptions,
  type RouteMatch,
  type RouterSnapshot,
  sameShape,
} from "./router.ts";

/** The current location, or a memoized part of it. */
export function useLocation(): Cell<Location>;
export function useLocation<Selected>(options: {
  readonly select: (location: Location) => Selected;
}): Cell<Selected>;
export function useLocation(options?: {
  readonly select: (location: Location) => unknown;
}): Cell<unknown> {
  const state = useRouter();
  if (options === undefined) return state.location;
  return createMemo(() => options.select(state.location()), { equals: sameShape });
}

/**
 * The path parameters. With no options, the whole chain's, as they stand.
 *
 * `from` reads them off one route's match and throws if that route is not
 * matched; `select` narrows the value and memoizes what it returns.
 */
export function useParams<
  P extends Record<string, unknown> = Record<string, string>,
  Selected = P,
  Throw extends boolean = true,
>(options?: MatchHookOptions<P, Selected, Throw>): Cell<Thrown<Selected, Throw>> {
  if (options === undefined) return useRouter().params as unknown as Cell<Selected>;
  return matchCell("useParams", options, "leaf", (match) => match.params as P);
}

/**
 * The VALIDATED search for the deepest matched route.
 *
 * A breaking change from the `URLSearchParams` this used to answer with, and the
 * point of `validateSearch`: a route that declares one gets its own types, and a
 * route that declares none gets the raw record. The `URLSearchParams` is still
 * one `location().search` away, and `useSearchParams` is unchanged.
 */
export function useSearch<
  S extends Record<string, unknown> = Record<string, unknown>,
  Selected = S,
  Throw extends boolean = true,
>(options?: MatchHookOptions<S, Selected, Throw>): Cell<Thrown<Selected, Throw>> {
  if (options === undefined) return useRouter().validSearch as unknown as Cell<Selected>;
  return matchCell("useSearch", options, "leaf", (match) => match.search as S);
}

/**
 * `navigate`, in both forms: `navigate("/posts/7")` and TanStack's
 * `navigate({ to: "/posts/$id", params: { id: "7" } })`.
 *
 * `from` here is the default for every call, so a component can navigate
 * relatively without repeating where it is.
 */
export function useNavigate(defaults?: { readonly from?: string }): NavigateFn {
  const state = useRouter();
  const from = defaults?.from;
  if (from === undefined) return state.navigate;
  const navigate = (to: unknown, options?: object): Promise<void> =>
    typeof to === "string"
      ? state.navigate(to, { from, ...options })
      : state.navigate({ from, ...(to as object) });
  return navigate;
}

/**
 * Ask whether the current location matches a route, and what it captured.
 *
 * Returns a FUNCTION rather than an answer, because the question is usually
 * asked more than once per component and with different arguments — a nav bar
 * asks it per item. The function reads `location()` when called, so calling it
 * from a hole makes that hole re-run on every navigation; calling it in a body
 * reads it once, which is the ordinary barq distinction and needs no dependency
 * array to express.
 */
export function useMatchRoute(): (
  options: MatchRouteOptions,
  matchOptions?: Pick<MatchRouteOptions, "fuzzy" | "includeSearch">,
) => Record<string, string> | false {
  const state = useRouter();
  return (options, matchOptions) => state.matchRoute(options, matchOptions);
}

/**
 * A server function whose `throw redirect(...)` reaches the ROUTER.
 *
 * Calling one directly gives back a rejected promise carrying the redirect, and
 * every caller then writes the same four lines: catch it, test it, hand `.to` to
 * `navigate`, re-throw whatever else it was. `/control` in the reference
 * application is exactly those four lines. This is them, once.
 *
 * A RETURNED redirect is thrown too, not just a thrown one. A handler that
 * writes `return redirect(...)` instead of `throw` has made the same decision,
 * and answering with it as a VALUE would render a navigation instruction as
 * data. TanStack tests the result for the same reason.
 *
 * `notFound()` is deliberately NOT caught. A redirect names somewhere to go and
 * the router is the only thing that can go there; a not-found is an answer about
 * what the caller asked for, and swallowing it here would take it away from the
 * component that knows what to render instead. Theirs draws the same line.
 */
export function useServerFn<Args extends readonly unknown[], Out>(
  fn: (...args: Args) => Promise<Out>,
): (...args: Args) => Promise<Out> {
  const state = useRouter();
  return async (...args: Args): Promise<Out> => {
    let result: Out;
    try {
      result = await fn(...args);
    } catch (error) {
      if (!isRedirect(error)) throw error;
      await state.navigate(error.options ?? { to: error.to });
      return undefined as Out;
    }
    if (isRedirect(result)) {
      await state.navigate(result.options ?? { to: result.to });
      return undefined as Out;
    }
    return result;
  };
}

/**
 * The merged route context for the DEEPEST matched route.
 *
 * A component that wants its own depth's slice reads `props.context()`, which is
 * what a route is handed; this is the whole-chain answer, which is what a
 * component further down the tree — a button, a widget — actually wants. `from`
 * reads it as of one route instead.
 */
export function useRouteContext<
  C extends Record<string, unknown> = Record<string, unknown>,
  Selected = C,
  Throw extends boolean = true,
>(options?: MatchHookOptions<C, Selected, Throw>): Cell<Thrown<Selected, Throw>> {
  if (options === undefined) {
    const state = useRouter();
    return () => {
      const all = state.contexts();
      return (all[all.length - 1] ?? state.config.context ?? {}) as Selected;
    };
  }
  return matchCell("useRouteContext", options, "leaf", (match) => match.context as C);
}

/**
 * One matched route, as TanStack's `RouteMatch`.
 *
 * `useMatch("/admin")` is barq's own spelling: that route's match, or `null`
 * when it is not in the current chain, so a component can ask "am I under
 * /admin" without knowing where it sits. With no argument it is the LEAF.
 *
 * `useMatch({ from, select, shouldThrow })` is theirs: the nearest match when
 * `from` is absent, and a throw when `from` is not matched unless `shouldThrow`
 * is `false`.
 */
export function useMatch(routeId?: string): Cell<RouteMatch | null>;
export function useMatch<Selected = RouteMatch, Throw extends boolean = true>(
  options: MatchHookOptions<RouteMatch, Selected, Throw>,
): Cell<Thrown<Selected, Throw>>;
export function useMatch(given?: string | MatchHookOptions<RouteMatch, unknown>): Cell<unknown> {
  if (typeof given === "object") {
    return matchCell("useMatch", given, "nearest", (match) => match);
  }
  const state = useRouter();
  return () => {
    const all = state.matches();
    const match =
      given === undefined ? all.at(-1) : all.find((candidate) => candidate.routeId === given);
    return match ?? null;
  };
}

/**
 * A route's loader value. Reading it starts the loader, and a read before it
 * settles parks the nearest loading boundary.
 *
 * The route rendering the caller when `from` is absent.
 */
export function useLoaderData<Data = unknown, Selected = Data, Throw extends boolean = true>(
  options?: MatchHookOptions<Data, Selected, Throw>,
): Cell<Thrown<Selected, Throw>> {
  return loaderCell(options);
}

/** What a route's `loaderDeps` selected, which is what its loader is keyed by. */
export function useLoaderDeps<Deps = unknown, Selected = Deps, Throw extends boolean = true>(
  options?: MatchHookOptions<Deps, Selected, Throw>,
): Cell<Thrown<Selected, Throw>> {
  return matchCell("useLoaderDeps", options, "nearest", (match) => match.loaderDeps as Deps);
}

/** What `useRouterState` answers with: TanStack's router state, and barq's two extras. */
export interface RouterStateValue extends RouterSnapshot {
  readonly params: Record<string, string>;
  /** A navigation has been asked for and has not committed. */
  readonly isNavigating: boolean;
}

/**
 * The router's state as ONE reactive value, for a component that wants several
 * pieces of it without subscribing to each separately.
 *
 * `select` is how to take ONE piece and be told only when it changed:
 * `useRouterState({ select: (s) => s.location.pathname })`.
 *
 * `isLoading` follows the navigation and the chain's cold loaders, as theirs
 * does. A background reload does not move it: that is a `Loading` boundary per
 * route depth, and each match's `isFetching` says which.
 */
export function useRouterState(): Cell<RouterStateValue>;
export function useRouterState<Selected>(options: {
  readonly select: (state: RouterStateValue) => Selected;
}): Cell<Selected>;
export function useRouterState(options?: {
  readonly select: (state: RouterStateValue) => unknown;
}): Cell<unknown> {
  const state = useRouter();
  const value = (): RouterStateValue => ({
    status: state.status(),
    isLoading: state.isLoading(),
    isTransitioning: state.isTransitioning(),
    matches: state.matches(),
    location: state.location(),
    resolvedLocation: state.resolvedLocation(),
    params: state.params(),
    isNavigating: state.isNavigating(),
  });
  if (options === undefined) return value;
  return createMemo(() => options.select(value()), { equals: sameShape });
}

/**
 * Refuse or confirm navigations while this scope is alive.
 *
 * Unregisters on cleanup, so a form that unmounts stops blocking — the failure
 * mode of a blocker that outlives its form being an app nobody can navigate.
 *
 * A function is barq's own form and returns the unregister. TanStack's options
 * form also covers the back button and, unless `enableBeforeUnload` is `false`,
 * closing the tab; with `withResolver` it returns a cell holding `proceed` and
 * `reset` while a navigation is waiting on an answer.
 */
export function useBlocker(blocker: Blocker): () => void;
export function useBlocker(
  options: UseBlockerOptions & { readonly withResolver: true },
): Cell<BlockerResolver>;
export function useBlocker(options: UseBlockerOptions): void;
export function useBlocker(given: Blocker | UseBlockerOptions): unknown {
  const state = useRouter();
  if (typeof given !== "function") return blockWith(state, given);
  const off = state.block(given);
  onCleanup(off);
  return off;
}

/** Whether there is an in-app entry to go back to. See `History.depth`. */
export function useCanGoBack(): Cell<boolean> {
  const state = useRouter();
  return () => {
    // Read the location so this re-evaluates when one commits.
    state.location();
    return state.canGoBack();
  };
}

/** The matched chain as TanStack's `RouteMatch`es, outermost first. */
export function useMatches<Selected = readonly RouteMatch[]>(options?: {
  readonly select?: (matches: readonly RouteMatch[]) => Selected;
}): Cell<Selected> {
  return matchesCell("all", options);
}

/** The matches BELOW the route rendering the caller. */
export function useChildMatches<Selected = readonly RouteMatch[]>(options?: {
  readonly select?: (matches: readonly RouteMatch[]) => Selected;
}): Cell<Selected> {
  return matchesCell("children", options);
}

/** The matches ABOVE the route rendering the caller. */
export function useParentMatches<Selected = readonly RouteMatch[]>(options?: {
  readonly select?: (matches: readonly RouteMatch[]) => Selected;
}): Cell<Selected> {
  return matchesCell("parents", options);
}

/**
 * Where a scroll container was left for the current location, so a virtualised
 * list can start there instead of at the top.
 *
 * `id` is the container's `data-scroll-id`; `getElement` reads the id off an
 * element that carries one.
 */
export function useElementScrollRestoration(options: {
  readonly id?: string;
  readonly getElement?: () => Element | null | undefined;
  readonly getKey?: (location: Location) => string;
}): ScrollPosition | undefined {
  const state = useRouter();
  const config = state.config;
  const keyOf =
    options.getKey ?? config.getScrollRestorationKey ?? config.scroll?.getKey ?? scrollKey;
  const id = options.id ?? options.getElement?.()?.getAttribute("data-scroll-id") ?? undefined;
  return id === undefined ? undefined : savedScrollPosition(keyOf(state.location()), id);
}

/**
 * Re-run every loader for the current location.
 *
 * The cells are keyed, so this drops them and mints new ones rather than
 * mutating anything — a read after it fetches for real.
 */
export function useInvalidate(): () => void {
  const state = useRouter();
  return () => {
    void state.invalidate();
  };
}

/**
 * The query string, and a setter that navigates.
 *
 * The setter REPLACES the whole query rather than merging, which is what makes
 * "clear the filters" one call; pass a function to merge from the current one.
 * A value of `""` or `undefined` drops its key instead of writing `?q=`.
 */
export function useSearchParams(): [
  Cell<URLSearchParams>,
  (next: Record<string, string> | ((current: URLSearchParams) => Record<string, string>)) => void,
] {
  const state = useRouter();
  const set = (
    next: Record<string, string> | ((current: URLSearchParams) => Record<string, string>),
  ): void => {
    const current = state.search();
    const record = typeof next === "function" ? next(current) : next;
    const kept = new URLSearchParams();
    for (const [key, value] of Object.entries(record)) {
      if (value !== "" && value !== undefined) kept.set(key, value);
    }
    const query = kept.toString();
    const { pathname, hash } = state.location();
    // `replace`, because a filter is not a place you navigate BACK through —
    // and `resetScroll`, for the same reason. The old router's setter replaced
    // without resetting, so every keystroke in a filter box saved a scroll
    // position under the OLD query and restored `(0,0)` for the new one: the
    // list jumped to the top as you typed.
    void state.navigate(`${pathname}${query === "" ? "" : `?${query}`}${hash}`, {
      replace: true,
      resetScroll: true,
    });
  };
  return [state.search, set];
}
