/**
 * Hooks, which are the only way to reach a router.
 *
 * There is no module-global `navigate()` and no registry. A router is reached
 * through the scope chain that provided it, which is what makes two routers on
 * one page work and what makes a router die with the scope that made it.
 */

import type { Cell } from "@barqjs/core";

import { useRouter } from "./components.ts";
import type { Location } from "./history.ts";
import type { Route } from "./route.ts";
import type { NavigateOptions } from "./router.ts";

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
  return (() => {
    const all = state.contexts();
    return (all[all.length - 1] ?? {}) as C;
  }) as Cell<C>;
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
    // `replace`, because a filter is not a place you navigate BACK through.
    void state.navigate(`${pathname}${query === "" ? "" : `?${query}`}${hash}`, { replace: true });
  };
  return [state.search, set];
}
