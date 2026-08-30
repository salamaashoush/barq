/**
 * Hooks, which are the only way to reach a router.
 *
 * There is no module-global `navigate()` and no registry. A router is reached
 * through the scope chain that provided it, which is what makes two routers on
 * one page work and what makes a router die with the scope that made it.
 */

import { type Cell, onCleanup } from "@barqjs/core";

import { useRouter } from "./components.ts";
import { isRedirect } from "./errors.ts";
import type { Location } from "./history.ts";
import type { Route } from "./route.ts";
import type { Blocker, NavigateOptions } from "./router.ts";

export function useLocation(): Cell<Location> {
  return useRouter().location;
}

export function useParams<P extends Record<string, string> = Record<string, string>>(): Cell<P> {
  return useRouter().params as unknown as Cell<P>;
}

/**
 * The VALIDATED search for the deepest matched route.
 *
 * A breaking change from the `URLSearchParams` this used to answer with, and the
 * point of `validateSearch`: a route that declares one gets its own types, and a
 * route that declares none gets the raw record. The `URLSearchParams` is still
 * one `location().search` away, and `useSearchParams` is unchanged.
 */
export function useSearch<S extends Record<string, unknown> = Record<string, unknown>>(): Cell<S> {
  return useRouter().validSearch as unknown as Cell<S>;
}

export function useNavigate(): (to: string, options?: NavigateOptions) => Promise<void> {
  const state = useRouter();
  return (to, options) => state.navigate(to, options);
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
      await state.navigate(error.to);
      return undefined as Out;
    }
    if (isRedirect(result)) {
      await state.navigate(result.to);
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
 * component further down the tree — a button, a widget — actually wants.
 */
export function useRouteContext<
  C extends Record<string, unknown> = Record<string, unknown>,
>(): Cell<C> {
  const state = useRouter();
  return () => {
    const all = state.contexts();
    return (all[all.length - 1] ?? {}) as C;
  };
}

/**
 * One matched route by id, or the LEAF when no id is given.
 *
 * `null` when that route is not in the current chain, so a component can ask
 * "am I under /admin" without knowing where it sits.
 */
export function useMatch(routeId?: string): Cell<Route | null> {
  const state = useRouter();
  return () => {
    const chain = state.chain();
    if (routeId === undefined) return chain[chain.length - 1] ?? null;
    return chain.find((route) => route.id === routeId) ?? null;
  };
}

/**
 * The router's state as ONE reactive value, for a component that wants several
 * pieces of it without subscribing to each separately.
 *
 * `isLoading` is deliberately NOT a router-wide counter: loading is a `Loading`
 * boundary per route depth, and a global spinner is how a page ends up with two
 * of them disagreeing. What is here is `isNavigating`: a navigation has been
 * asked for and has not committed, which is a fact about the ROUTER rather than
 * about any route's data.
 */
export function useRouterState(): Cell<{
  readonly location: Location;
  readonly matches: readonly Route[];
  readonly params: Record<string, string>;
  readonly isNavigating: boolean;
}> {
  const state = useRouter();
  return () => ({
    location: state.location(),
    matches: state.chain(),
    params: state.params(),
    isNavigating: state.isNavigating(),
  });
}

/**
 * Refuse or confirm navigations while this scope is alive.
 *
 * Unregisters on cleanup, so a form that unmounts stops blocking — the failure
 * mode of a blocker that outlives its form being an app nobody can navigate.
 */
export function useBlocker(blocker: Blocker): () => void {
  const state = useRouter();
  const off = state.block(blocker);
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

/** The matched chain, outermost first. */
export function useMatches(): Cell<readonly Route[]> {
  return useRouter().chain;
}

/**
 * Re-run every loader for the current location.
 *
 * The cells are keyed, so this drops them and mints new ones rather than
 * mutating anything — a read after it fetches for real.
 */
export function useInvalidate(): () => void {
  const state = useRouter();
  return () => state.invalidate();
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
