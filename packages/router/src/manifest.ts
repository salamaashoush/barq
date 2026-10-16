/**
 * The route-action manifest: which routes reach which server functions, and
 * whether each one carries the chain its route declared.
 *
 * THE HOLE THIS CLOSES. Every framework surveyed documents it instead of
 * closing it. Next.js: "A page-level authentication check does not extend to
 * the Server Actions defined within it… the Server Action is a separate entry
 * point." TanStack says it three times in its own docs — "A route guard is not
 * a data authorization boundary. Server functions and server routes are API
 * endpoints; they are reachable independently of the route that calls them" —
 * and mechanically a server-fn request there takes an early exit BEFORE route
 * matching, so route middleware never runs for it and a client-side navigation
 * never touches it either.
 *
 * WHY NOT REDISPATCH. `@vitejs/plugin-rsc` answers this by re-running a
 * mis-routed action through the owning route's middleware; Next.js is REMOVING
 * action forwarding because the action executes under a different
 * route and request context". The deeper reason it is wrong here is this repo's
 * own rule, written at `packages/start/src/server.ts`: values derived from the
 * request are fine to navigate to and never fine to authorize with. A
 * client-supplied route selecting which middleware chain runs lets the caller
 * pick the WEAKEST chain that reaches the action. Redispatch is not merely
 * fragile; as an authorization mechanism it is unsound.
 *
 * SO THE CHECK IS STATIC AND THE ANSWER IS ALREADY ON THE FUNCTION. A server
 * function carries its own chain — `createServerFn().middleware([...])` — and
 * that chain cannot be escaped by reaching the function from elsewhere, because
 * there is nowhere else. What a route declares is what it EXPECTS every action
 * it can reach to carry, and this verifies the two agree before the build ships.
 *
 * BY REFERENCE, NOT BY READING SOURCE. The first design had the build read
 * `.middleware([...])` out of the AST. That is impossible: `grep -rn middleware
 * packages/compiler/src` finds nothing, and the argument is a runtime
 * expression — `[m]`, `[...chain]`, `chain.filter(Boolean)` — over `Middleware`
 * values that are anonymous closures with no build-visible identity. The check
 * compares the same closure the route declared with `===`, which resolves all
 * of those shapes and needs no compiler work at all.
 */

import {
  type AnyServerFn,
  type Middleware,
  flattenMiddleware,
  isBuiltMiddleware,
  middlewareOf,
} from "@barqjs/start";

import type { AnyRouteDefinition, Route } from "./route.ts";
import { flattenRoutes } from "./route.ts";

/** Which server-function ids each route can reach, from the client module graph. */
export type Reachability = ReadonlyMap<string, ReadonlySet<string>>;

export interface Violation {
  readonly routeId: string;
  readonly serverFnId: string;
  /** How many of the route's chain the function is missing. */
  readonly missing: number;
}

export interface VerifyOptions {
  readonly routeTree: readonly AnyRouteDefinition[];
  /** route id -> server-fn ids reachable from that route's module graph. */
  readonly reachability: Reachability;
  /** id -> the mounted function, normally `REGISTRY.get`. */
  readonly lookup: (id: string) => AnyServerFn | undefined;
}

/**
 * Every action a route can reach that does not carry the route's chain.
 *
 * A route's chain is INHERITED: a leaf under `/admin` must satisfy `/admin`'s
 * middleware as well as its own, which is what makes declaring it on a layout
 * mean anything.
 *
 * Where one function is reachable from two routes, it must carry BOTH chains —
 * the union. That over-restricts by design and the build says which chain is
 * missing; the fix is to split the function, not to relax the rule, because the
 * alternative is picking one route's policy for a call that could have come
 * through either.
 */
export async function verifyRouteChains(options: VerifyOptions): Promise<Violation[]> {
  const flat = flattenRoutes(options.routeTree);
  const violations: Violation[] = [];

  for (const route of flat) {
    const expected = await chainOf(route.chain);
    if (expected.length === 0) continue;

    const ids = options.reachability.get(route.id);
    if (ids === undefined) continue;

    for (const id of ids) {
      const fn = options.lookup(id);
      if (fn === undefined) continue;
      const carried = middlewareOf(fn);
      const missing = expected.filter((step) => !carried.includes(step)).length;
      if (missing > 0) violations.push({ routeId: route.id, serverFnId: id, missing });
    }
  }

  return violations;
}

/** A server function whose chain the client cannot be given. */
export interface UnbuiltChain {
  readonly serverFnId: string;
  /** The bare closures, by whatever name they were declared under. */
  readonly names: readonly string[];
}

/**
 * Every mounted function whose `.middleware([…])` names a BARE CLOSURE.
 *
 * The compiler carries a server function's chain into its client stub so that a
 * middleware's `.client()` half can run in the browser, and it does that by
 * importing the module the chain was declared in. That is safe for a
 * `createMiddleware` middleware — `middleware_split` deletes its `.server(…)`
 * and `.validator(…)` bodies, and whatever only they reached — and it is not
 * safe for a bare closure: nothing marks the body as server-only, so the module
 * arrives whole. The reference application's `requireSession` opens a sealed
 * cookie and reaches `node:async_hooks` through it, which is a browser error on
 * a page that then does nothing.
 *
 * TanStack has no such case: every middleware there is `createMiddleware`-built,
 * which is the invariant that makes their strip total. This is barq adopting
 * it, at the only place that can see the real closures.
 *
 * A bare closure remains perfectly good on a ROUTE and on a function nothing
 * carries to the client. What is refused is exactly the combination that leaks.
 */
export function verifyClientChains(
  ids: readonly string[],
  lookup: VerifyOptions["lookup"],
): UnbuiltChain[] {
  const out: UnbuiltChain[] = [];
  for (const id of ids) {
    const fn = lookup(id);
    if (fn === undefined) continue;
    const names = flattenMiddleware(middlewareOf(fn))
      .filter((step) => !isBuiltMiddleware(step))
      // A `const` arrow takes the binding's name, which is what the author
      // wrote and what they have to find. An anonymous one says so.
      .map((step) => (step.name === "" ? "an anonymous middleware" : `\`${step.name}\``));
    if (names.length > 0) out.push({ serverFnId: id, names });
  }
  return out;
}

/** A build-stopping message for {@link verifyClientChains}. */
export function describeUnbuilt(unbuilt: readonly UnbuiltChain[]): string {
  const lines = unbuilt.map(({ serverFnId, names }) => `  ${serverFnId} uses ${names.join(", ")}`);
  return [
    `${unbuilt.length} server function(s) use a plain function as middleware, which would put that function's code in the browser bundle.`,
    "",
    ...lines,
    "",
    "A server function's middleware is imported into the browser build so that a",
    "middleware's `.client()` step can run there. The build removes `.server(...)` and",
    "`.validator(...)` from a `createMiddleware` middleware, but it cannot remove the",
    "body of a plain function, so whatever that function imports to read a session or",
    "reach a database would ship to the browser.",
    "",
    "Write it as `createMiddleware().server(async ({ next }) => next())`. A plain",
    "function is still fine as a route's `middleware`.",
  ].join("\n");
}

/**
 * A route's own middleware plus every ancestor's, outermost first, deduplicated.
 *
 * ASYNC because a file-based table declares `middleware` as a thunk over the
 * route module's own dynamic import: a middleware is an anonymous closure
 * compared by `===`, so unlike `ssr` and `prerender` it cannot be lifted out of
 * the file as a literal. A code-based table hands over the array directly and
 * the `await` is free.
 */
export async function chainOf(chain: readonly Route[]): Promise<readonly Middleware[]> {
  const out: Middleware[] = [];
  for (const route of chain) {
    const declared = route.definition.middleware;
    const steps = typeof declared === "function" ? await declared() : declared;
    for (const step of steps ?? []) {
      if (!out.includes(step)) out.push(step);
    }
  }
  return out;
}

/** A build-stopping message, naming the route, the action and the fix. */
export function describe(violations: readonly Violation[]): string {
  const lines = violations.map(
    ({ routeId, serverFnId, missing }) =>
      `  ${serverFnId} is reachable from ${routeId} but is missing ${missing} of that route's middleware`,
  );
  return [
    `${violations.length} server function(s) are missing the middleware of a route that can call them.`,
    "",
    ...lines,
    "",
    "A server function is a separate HTTP endpoint: a check on the route that renders it",
    "does not run when the function is called directly, so the check can be skipped. Add",
    "the route's middleware to the function with `.middleware([...])`, or stop importing",
    "the function from that route's modules.",
  ].join("\n");
}
