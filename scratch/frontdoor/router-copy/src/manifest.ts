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
 * action forwarding (PR #96951) because "the action executes under a different
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
 * packages/compiler-rs/src` finds nothing, and the argument is a runtime
 * expression — `[m]`, `[...chain]`, `chain.filter(Boolean)` — over `Middleware`
 * values that are anonymous closures with no build-visible identity. The check
 * compares the same closure the route declared with `===`, which resolves all
 * of those shapes and needs no compiler work at all.
 */

import { type Middleware, middlewareOf } from "@barqjs/start";

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
  readonly routes: readonly AnyRouteDefinition[];
  /** route id -> server-fn ids reachable from that route's module graph. */
  readonly reachability: Reachability;
  /** id -> the mounted function, normally `REGISTRY.get`. */
  readonly lookup: (id: string) => { readonly meta: { id: string } } | undefined;
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
export function verifyRouteChains(options: VerifyOptions): Violation[] {
  const flat = flattenRoutes(options.routes);
  const violations: Violation[] = [];

  for (const route of flat) {
    const expected = chainOf(route.chain);
    if (expected.length === 0) continue;

    const ids = options.reachability.get(route.id);
    if (ids === undefined) continue;

    for (const id of ids) {
      const fn = options.lookup(id);
      if (fn === undefined) continue;
      const carried = middlewareOf(fn as never);
      const missing = expected.filter((step) => !carried.includes(step)).length;
      if (missing > 0) violations.push({ routeId: route.id, serverFnId: id, missing });
    }
  }

  return violations;
}

/** A route's own middleware plus every ancestor's, outermost first, deduplicated. */
export function chainOf(chain: readonly Route[]): readonly Middleware[] {
  const out: Middleware[] = [];
  for (const route of chain) {
    for (const step of route.definition.middleware ?? []) {
      if (!out.includes(step)) out.push(step);
    }
  }
  return out;
}

/** A build-stopping message, naming the route, the action and the fix. */
export function describe(violations: readonly Violation[]): string {
  const lines = violations.map(
    ({ routeId, serverFnId, missing }) =>
      `  ${serverFnId} is reachable from ${routeId} but is missing ${missing} of its middleware`,
  );
  return [
    `${violations.length} server function(s) do not carry the middleware of a route that reaches them.`,
    "",
    ...lines,
    "",
    "A server function is a separate HTTP endpoint: a check on the route that renders it",
    "does not run when the function is called directly. Add the route's middleware to the",
    "function with `.middleware([...])`, or move the function out of that route's graph.",
  ].join("\n");
}

/**
 * Which server-function ids each route reaches, walked over the CLIENT module
 * graph.
 *
 * The walk works because a client-compiled route module keeps its import edge:
 * the compiler replaces the server-function module's CONTENTS with `clientRpc`
 * stubs, and the importing route still says
 * `import { getUser } from "./users.ts"`. So the edge from route to
 * server-function module survives, and the stub's ids are literal strings in
 * the module the edge points at.
 *
 * REACHABILITY IS PER-MODULE, NOT PER-FUNCTION, and that is a real limit rather
 * than an oversight. The synthesized stub declares EVERY export of its module
 * regardless of which the importer used, and a bundler's graph exposes imported
 * ids and not imported bindings. So a `.data.ts` holding several actions makes
 * every route touching it "reach" all of them, and `export *` through a barrel
 * is worse. The consequence is over-restriction, which fails safe: the build
 * asks for a chain that may not have been needed, never the other way round.
 */
export function reachabilityFrom(
  entries: ReadonlyMap<string, string>,
  importsOf: (id: string) => readonly string[],
  idsIn: (id: string) => readonly string[],
): Reachability {
  const out = new Map<string, Set<string>>();

  for (const [routeId, moduleId] of entries) {
    const found = new Set<string>();
    const seen = new Set<string>();
    const queue = [moduleId];

    while (queue.length > 0) {
      const current = queue.pop() as string;
      if (seen.has(current)) continue;
      seen.add(current);
      for (const id of idsIn(current)) found.add(id);
      for (const next of importsOf(current)) queue.push(next);
    }
    out.set(routeId, found);
  }

  return out;
}

/**
 * Every `clientRpc("…")` id a module's source mentions.
 *
 * The synthesized client half is `export const x = clientRpc("<id>")` and
 * nothing else, so the ids are literals in it. Reading them out of the emitted
 * text rather than re-deriving them is deliberate: the id has to be the same
 * string the server mounted, and deriving it a second time is how the two halves
 * drift — `@barqjs/start`'s manifest makes the same choice for the same reason.
 */
export function idsInStub(code: string): string[] {
  const out: string[] = [];
  for (const match of code.matchAll(/clientRpc\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g)) {
    const id = match[1];
    if (id !== undefined && id !== "") out.push(id.replaceAll('\\"', '"'));
  }
  return out;
}
