/**
 * `createFileRoute` and `createRootRoute` — TanStack Start's authoring surface.
 *
 * A route module has ONE export and it is called `Route`:
 *
 * ```tsx
 * export const Route = createFileRoute("/posts/$postId")({
 *   loader: ({ params }) => fetchPost(params.postId),
 *   component: Post,
 * });
 *
 * function Post() {
 *   const post = Route.useLoaderData();
 *   return <h1>{() => post()?.title}</h1>;
 * }
 * ```
 *
 * The shapes are TanStack's: `createFileRoute('/posts/$postId')({…})`,
 * `Route.useLoaderData()`, `createRootRoute({ head, shellComponent, … })` and
 * the curried `createRootRouteWithContext<T>()({…})`. The options object is
 * what `RouteDefinition` already spells out.
 *
 * THE ARGUMENT IS THE ROUTE ID, not a pattern to be parsed — `/posts/$postId`
 * for a leaf, `/posts/` for that route's index, `/posts` for the layout. barq
 * derives the same ids from filenames, and the
 * generator REWRITES this literal in place when a file is renamed, so it is
 * never hand-maintained. Nothing at runtime parses it; it is what the
 * route-scoped hooks below check themselves against.
 *
 * WHAT THIS DOES NOT DO: build a route tree. `createFileRoute` returns the
 * options and the id, and the generated table is what nests them — a route file
 * does not name its parent. That is TanStack's split too; theirs carries more
 * type machinery because their tree is assembled from the modules themselves,
 * and barq's tree is emitted whole by the compiler.
 */

import type { Cell, Child } from "@barqjs/core";

import { useRouteMatch } from "./components.ts";
import type { AnyRouteDefinition, Route, RouteDefinition } from "./route.ts";
import type { NavigateOptions } from "./router.ts";

/** The root route's id. `/` is the root INDEX, so the two cannot share one. */
export const ROOT_ROUTE_ID = "__root__";

/**
 * What a root route may declare that no other route may.
 *
 * `shellComponent` renders `<html>`, so a nested route declaring one would be a
 * second document inside the first — the generator only ever reads it from the
 * root, and the type says so here.
 */
export interface RootRouteOptions<
  Data = unknown,
  Params = Record<string, string>,
  Deps = undefined,
> extends RouteDefinition<Data, Params, Deps> {
  /**
   * `children` is a `Child` rather than a Block for the reason `RouteProps`
   * gives: `{props.children}` is the entire shell pattern and has to typecheck,
   * and a Block declares a parameter that `Child` does not admit.
   */
  readonly shellComponent?: (props: { readonly children: Child }) => unknown;
}

/**
 * The `Route` a route module exports.
 *
 * `options` is what the generated table reaches through. The hooks are the
 * reason this is an object and not a bare options literal: they close over the
 * id, which is what gives `Route.useLoaderData()` this route's `Data` instead of
 * `unknown`.
 */
export interface FileRoute<
  Data = unknown,
  Params = Record<string, string>,
  Deps = undefined,
  Options extends AnyRouteDefinition = RouteDefinition<Data, Params, Deps>,
> {
  readonly id: string;
  readonly options: Options;
  /** This route's loader value. Reading it is what STARTS the loader. */
  useLoaderData(): Cell<Data>;
  useParams(): Cell<Params>;
  /** This route's slice of the route context — its own `beforeLoad` included. */
  useRouteContext<C extends Record<string, unknown> = Record<string, unknown>>(): Cell<C>;
  /** This route's match, or `null` if it somehow is not the one rendering. */
  useMatch(): Cell<Route | null>;
  useNavigate(): (to: string, options?: NavigateOptions) => Promise<void>;
}

/**
 * A hook called from the wrong route's component.
 *
 * Worth a throw rather than a wrong answer: `Route.useLoaderData()` copied into a
 * sibling module reads as correct and would silently hand back the OTHER route's
 * data, which is the failure mode `from:` exists to prevent in TanStack.
 */
function matchFor(id: string): {
  readonly state: import("./router.ts").RouterState;
  readonly depth: number;
  readonly route: Route | null;
  readonly blocking: boolean;
} {
  const match = useRouteMatch();
  if (match === null) {
    throw new Error(
      `[barq-router] Route.use…() for "${id}" was called outside a route component. ` +
        "The route-scoped hooks read the match that is rendering; from anywhere else use " +
        "the plain `useParams`/`useRouteContext`/`useMatch` hooks.",
    );
  }
  if (match.route !== null && match.route.id !== id) {
    throw new Error(
      `[barq-router] Route.use…() for "${id}" was called while "${match.route.id}" is ` +
        "rendering. A route-scoped hook belongs to the module that declared it — reaching " +
        "another route's data is what `useMatch(id)` is for.",
    );
  }
  return match;
}

/**
 * The hooks, resolved AT CALL TIME and read reactively afterwards.
 *
 * `matchFor` runs when the hook is called rather than when the Cell it returns
 * is read, and that split is the whole point: which depth is rendering is fixed
 * for a component instance, while the params and the loader value under it are
 * not. Resolving eagerly is what makes a hook called from the wrong place throw
 * where the mistake IS, instead of handing back a Cell that throws later from
 * inside somebody's JSX — and it is where TanStack throws too, `useLoaderData`
 * being an ordinary hook reading match context.
 */
function hooksFor<Data, Params>(id: string): Omit<FileRoute<Data, Params>, "id" | "options"> {
  return {
    useLoaderData: () => {
      const match = matchFor(id);
      return () => {
        if (match.route === null) return undefined as Data;
        return match.state.dataFor(match.route, match.state.params(), match.blocking)() as Data;
      };
    },
    useParams: () => {
      const match = matchFor(id);
      return () => match.state.params() as Params;
    },
    useRouteContext: <C extends Record<string, unknown> = Record<string, unknown>>() => {
      const match = matchFor(id);
      return (() => (match.state.contexts()[match.depth] ?? {}) as C) as Cell<C>;
    },
    useMatch: () => {
      const match = matchFor(id);
      return () => match.route;
    },
    useNavigate: () => {
      const match = matchFor(id);
      return (to, options) => match.state.navigate(to, options);
    },
  };
}

/**
 * A file route. Curried, because the id is known at the call site and the
 * options carry the generics that depend on nothing but themselves.
 */
export function createFileRoute<Data = unknown, Params = Record<string, string>, Deps = undefined>(
  id: string,
): (options: RouteDefinition<Data, Params, Deps>) => FileRoute<Data, Params, Deps> {
  return (options) => ({ id, options, ...hooksFor<Data, Params>(id) });
}

/** The root route: the document, and everything every page inherits. */
export function createRootRoute<Data = unknown, Params = Record<string, string>, Deps = undefined>(
  options: RootRouteOptions<Data, Params, Deps> = {},
): FileRoute<Data, Params, Deps, RootRouteOptions<Data, Params, Deps>> {
  return {
    id: ROOT_ROUTE_ID,
    options,
    ...hooksFor<Data, Params>(ROOT_ROUTE_ID),
  };
}

/**
 * The root route, with the type of the context every route inherits.
 *
 * Curried for the reason theirs is: TypeScript has
 * no partial type-argument inference, so the context has to be named in a call
 * that infers nothing else.
 */
export function createRootRouteWithContext<Context extends Record<string, unknown>>(): <
  Data = unknown,
  Params = Record<string, string>,
  Deps = undefined,
>(
  options?: Omit<RootRouteOptions<Data, Params, Deps>, "context" | "beforeLoad"> & {
    readonly context?: (options: import("./route.ts").BeforeLoadContext<Params>) => Context;
    /** Handed the context `context()` produced, which is the point of naming it. */
    readonly beforeLoad?: (
      options: Omit<import("./route.ts").BeforeLoadContext<Params>, "context"> & {
        readonly context: Context;
      },
    ) => Record<string, unknown> | void | Promise<Record<string, unknown> | void>;
  },
) => FileRoute<Data, Params, Deps, RootRouteOptions<Data, Params, Deps>> {
  return (options) => createRootRoute(options as RootRouteOptions<never, never, never>) as never;
}
