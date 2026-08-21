/**
 * The route table: code-based, and what a generator emits into.
 *
 * A hand-written table works with no build step at all. The file-based
 * generator produces exactly this shape rather than a second one, which is the
 * arrangement `@barqjs/start` already uses — its runtime contract shipped
 * before the compiler emitted into it, so there was never a moment when the
 * emitted calls had nothing to land in.
 */

import type { Child, Component, Scope } from "@barqjs/core";

import type { FlatRoute } from "./matcher.ts";
import { type Segment, joinPattern, normalize, parsePattern } from "./path.ts";

/** What a route component is handed. */
export interface RouteProps<Data = unknown, Params = Record<string, string>> {
  readonly params: () => Params;
  readonly data: () => Data;
  /**
   * The next route down, as a BLOCK — so a layout constructs it inside its own
   * scope, and a provider or boundary the layout installs is visible to the
   * route it wraps. That is the thing an outlet cannot do.
   *
   * Typed as `Child` rather than `Block<unknown>` because `{props.children}` is
   * the entire layout pattern and has to typecheck. The runtime value IS a
   * Block; the compiler lowers that hole to `insert($s, el, props.children)`,
   * and `insert` calls a Block with the scope it is holding. `Child` does not
   * admit a Block — a Block declares a parameter and a `Cell` is
   * arity-TOLERANT, which is the whole asymmetry of §3.0's rules 1 and 2 — so
   * the two cannot be reconciled in the type. `packages/extra/src/router.ts`
   * declared it the same way.
   */
  readonly children: Child;
}

/**
 * Declared PROPS-FIRST, which is not the ABI.
 *
 * The real calling convention is `(scope, props)` and the router invokes it that
 * way. But C1 rewrites the DECLARATION of every function containing JSX to that
 * signature, so an authored route component is written props-first and has to
 * typecheck props-first — `packages/extra/src/router.ts` declared it the same
 * way for the same reason. The router casts at the call site, where the cast is
 * one line and is commented, rather than making every application write a scope
 * parameter it never uses.
 */
export type RouteComponent<Data = unknown, Params = Record<string, string>> = (
  props: RouteProps<Data, Params>,
) => unknown;

/**
 * What an `errorComponent` is handed.
 *
 * `reset` re-enters the content arm with a fresh scope — core's error boundary
 * models recovery as a branch key flip, so a reset is a rebuild rather than an
 * in-place retry, and a loader that failed is asked again.
 */
export interface ErrorProps<Params = Record<string, string>> {
  readonly error: () => Error;
  readonly reset: () => void;
  readonly params: () => Params;
}

export type ErrorComponent<Params = Record<string, string>> = (
  props: ErrorProps<Params>,
) => unknown;

/** The invoked form: what the router actually calls. */
export type InvokedRouteComponent<Data = unknown, Params = Record<string, string>> = Component<
  RouteProps<Data, Params>
>;

/**
 * A loader is an ORDINARY isomorphic function that may CALL a server function.
 * It is not itself one.
 *
 * TanStack's shape, and their docs are explicit about it: "Route `loader`s are
 * isomorphic - they run on both server and client, not just the server." The
 * consequence is the one that matters here — the loader body ships to the
 * client by design, so anything that must not must live behind a
 * `createServerFn()` the loader calls, in a module of its own. `BARQ012`
 * enforces the module split; nothing enforces what goes inside the loader.
 *
 * AUTHORIZATION DOES NOT BELONG HERE. A loader runs on the client on every
 * navigation after the first, and the server function it calls is a separately
 * reachable endpoint. The check belongs on that function's middleware. This is
 * the hole every surveyed framework documents instead of closing, TanStack
 * included: "A route guard is not a data authorization boundary."
 */
export type Loader<Data = unknown, Params = Record<string, string>> = (context: {
  readonly params: Params;
  readonly search: URLSearchParams;
  readonly signal: AbortSignal;
}) => Data | Promise<Data>;

export interface RouteDefinition<Data = unknown, Params = Record<string, string>> {
  /**
   * This route's pattern, relative to its parent. Omitted makes the route
   * PATHLESS: it renders and provides context but contributes no segment, which
   * is how a layout wraps siblings without appearing in the URL.
   */
  readonly path?: string;
  /** Overrides the derived id. Name-derived and stable; never positional. */
  readonly id?: string;
  readonly component?: RouteComponent<Data, Params>;
  /**
   * What every server function reachable from this route must carry.
   *
   * NOT a guard, and not run by the router. A route cannot enforce anything on
   * a server function at request time — the function is its own endpoint and a
   * client-supplied route deciding its policy would let a caller pick the
   * weakest one. This is a BUILD-time claim, verified by `verifyRouteChains`
   * against the chain each function actually carries, and inherited by children
   * so declaring it on a layout covers everything under it.
   */
  readonly middleware?: readonly import("@barqjs/start").Middleware[];
  /**
   * Runs before this route commits, outermost first, after the global chain.
   *
   * UX, not authorization — it runs on the client on every navigation after the
   * first, and the server function a loader calls is reachable without it. The
   * check that IS a boundary is `middleware`, above, verified at build time.
   */
  readonly beforeEnter?: import("./router.ts").Guard;
  /** Shown while this route's loader is unsettled. Without one the boundary shows nothing. */
  readonly pending?: RouteComponent<never, never>;
  /**
   * Shown when this route's loader — or anything it renders — throws.
   *
   * One error boundary per route depth, and it is not decoration: a loader that
   * rejects after the shell has flushed used to reach `controller.error` and
   * tear the response mid-document. Without an `errorComponent` the boundary
   * still catches, and renders nothing, which is a silently truncated page —
   * so declaring one is how a failure becomes visible rather than invisible.
   *
   * The nearest ANCESTOR's is used when a route declares none, which is what
   * makes one at the layout cover everything under it.
   */
  readonly errorComponent?: ErrorComponent<Params>;
  /**
   * Shown when a loader throws `notFound()`.
   *
   * Separate from `errorComponent` because "this row does not exist" is an
   * answer and not a failure: it wants different markup, and on the server it
   * wants a different status. Falls back to `errorComponent`, then to the
   * nearest ancestor's, so a single one at the root is enough.
   */
  readonly notFoundComponent?: ErrorComponent<Params>;
  readonly loader?: Loader<Data, Params>;
  readonly children?: readonly AnyRouteDefinition[];
}

/**
 * A route definition in a COLLECTION, with its data and params erased.
 *
 * `any` and not `never` or `unknown`, and the reason is variance rather than
 * laziness. `RouteProps<Data>` carries `data: () => Data`, and a component
 * takes those props as a PARAMETER — contravariant under
 * `strictFunctionTypes` — so `RouteDefinition<UsersData>` is assignable to
 * neither `RouteDefinition<unknown>` nor `RouteDefinition<never>`, in either
 * direction. A table of differently-typed routes is exactly what a route table
 * is, so the element type has to be the one that admits them. TanStack reaches
 * the same conclusion with its own `AnyRoute`.
 *
 * The precision this gives up is recovered where it is wanted: the generated
 * `.d.ts` types each route id individually, which is what `<Link to>` and
 * `loaderData` read.
 */
// oxlint-disable-next-line typescript/no-explicit-any
export type AnyRouteDefinition = RouteDefinition<any, any>;

/** A route after flattening: its own definition plus everything the matcher needs. */
export interface Route {
  readonly id: string;
  readonly fullPath: string;
  readonly definition: AnyRouteDefinition;
}

/** Identity, plus a place to hang inference later. */
export function route<Data, Params>(
  definition: RouteDefinition<Data, Params>,
): RouteDefinition<Data, Params> {
  return definition;
}

/**
 * Flatten a table into the list the matcher indexes.
 *
 * Only a route that can be the LEAF of a match is emitted — a layout with
 * children is reachable through them and never on its own. A layout that should
 * also be addressable declares an index child, which is `path: ""`.
 */
export function flattenRoutes(table: readonly AnyRouteDefinition[]): FlatRoute<Route>[] {
  const out: FlatRoute<Route>[] = [];
  const seen = new Set<string>();

  const visit = (
    definitions: readonly AnyRouteDefinition[],
    parentPath: string,
    parentChain: readonly Route[],
  ): void => {
    for (const definition of definitions) {
      const fullPath = joinPattern(parentPath, definition.path);
      const id = definition.id ?? fullPath;
      const self: Route = { id, fullPath, definition };
      const chain = [...parentChain, self];

      const children = definition.children;
      if (children !== undefined && children.length > 0) {
        visit(children, fullPath, chain);
        continue;
      }

      // Uniqueness is enforced over EMITTED routes only. A layout and its index
      // child legitimately share a full path — `/users` with a `path: ""` child
      // is how a layout becomes addressable — and only the child is emitted, so
      // only the child's id has to be unique. A layout is reached through its
      // chain and is never looked up by id.
      if (seen.has(id)) {
        throw new Error(`two routes claim the id ${JSON.stringify(id)}`);
      }
      seen.add(id);

      out.push({
        id,
        fullPath,
        segments: parsePattern(fullPath) as Segment[],
        chain,
      });
    }
  };

  visit(table, "", []);
  return out;
}

/** The pattern a route id addresses, for `<Link to>` and for interpolation. */
export function pathOf(routes: readonly FlatRoute<Route>[], id: string): string | null {
  for (const route of routes) {
    if (route.id === id) return normalize(route.fullPath);
  }
  return null;
}

export type { Scope };
