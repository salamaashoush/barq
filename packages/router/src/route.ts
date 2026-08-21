/**
 * The route table: code-based, and what a generator emits into.
 *
 * A hand-written table works with no build step at all. The file-based
 * generator produces exactly this shape rather than a second one, which is the
 * arrangement `@barqjs/start` already uses — its runtime contract shipped
 * before the compiler emitted into it, so there was never a moment when the
 * emitted calls had nothing to land in.
 */

import type { Block, Component, Scope } from "@barqjs/core";

import type { FlatRoute } from "./matcher.ts";
import { type Segment, joinPattern, normalize, parsePattern } from "./path.ts";

/** What a route component is handed. `children` is a Block, so a layout builds the next route in its own scope. */
export interface RouteProps<Data = unknown, Params = Record<string, string>> {
  readonly params: () => Params;
  readonly data: () => Data;
  readonly children: Block<unknown>;
}

export type RouteComponent<Data = unknown, Params = Record<string, string>> = Component<
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
  /** Shown while this route's loader is unsettled. Without one the boundary shows nothing. */
  readonly pending?: RouteComponent<never, never>;
  readonly loader?: Loader<Data, Params>;
  readonly children?: readonly RouteDefinition<never, never>[];
}

/** A route after flattening: its own definition plus everything the matcher needs. */
export interface Route {
  readonly id: string;
  readonly fullPath: string;
  readonly definition: RouteDefinition<never, never>;
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
export function flattenRoutes(table: readonly RouteDefinition<never, never>[]): FlatRoute<Route>[] {
  const out: FlatRoute<Route>[] = [];
  const seen = new Set<string>();

  const visit = (
    definitions: readonly RouteDefinition<never, never>[],
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
