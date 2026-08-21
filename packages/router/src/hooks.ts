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

/** The query string, reparsed per location. Reactive, like everything else here. */
export function useSearch(): Cell<URLSearchParams> {
  return useRouter().search;
}

export function useNavigate(): (to: string, options?: NavigateOptions) => Promise<void> {
  const state = useRouter();
  return (to, options) => state.navigate(to, options);
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
