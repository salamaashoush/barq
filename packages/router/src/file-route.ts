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

import { type Cell, type Child, createMemo } from "@barqjs/core";
import type { Middleware } from "@barqjs/start";

import { useRouteMatch } from "./components.ts";
import type { NavigateFn } from "./register.ts";
import { type AnyRouteDefinition, type RouteDefinition, ROOT_ROUTE_ID } from "./route.ts";
import { type RouteMatch, sameShape } from "./router.ts";

export { ROOT_ROUTE_ID };

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
  Search = Record<string, unknown>,
> extends RouteDefinition<Data, Params, Deps, Search> {
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
  Search = Record<string, unknown>,
> {
  readonly id: string;
  readonly options: Options;
  /**
   * Never set. It is how this route's types reach whatever reads `Register`:
   * a `<Link to>` typing its `search`, `getRouteApi` typing its hooks.
   */
  readonly types?: {
    readonly loaderData: Data;
    readonly params: Params;
    readonly search: Search;
    readonly loaderDeps: Deps;
  };
  /** This route's loader value. Reading it is what STARTS the loader. */
  useLoaderData<Selected = Data>(options?: Selecting<Data, Selected>): Cell<Selected>;
  useParams<Selected = Params>(options?: Selecting<Params, Selected>): Cell<Selected>;
  /** The validated search as of this route's depth. */
  useSearch<Selected = Search>(options?: Selecting<Search, Selected>): Cell<Selected>;
  /** What this route's `loaderDeps` selected. */
  useLoaderDeps<Selected = Deps>(options?: Selecting<Deps, Selected>): Cell<Selected>;
  /** This route's slice of the route context — its own `beforeLoad` included. */
  useRouteContext<C extends Record<string, unknown> = Record<string, unknown>, Selected = C>(
    options?: Selecting<C, Selected>,
  ): Cell<Selected>;
  /** This route's match, or `null` if it somehow is not the one rendering. */
  useMatch<Selected = RouteMatch<Data> | null>(
    options?: Selecting<RouteMatch<Data> | null, Selected>,
  ): Cell<Selected>;
  /** `navigate`, with a relative `to` resolved from this route. */
  useNavigate(): NavigateFn;
}

/** TanStack's `select`: narrow a hook's value, and be told only when the result changed. */
export interface Selecting<Value, Selected> {
  readonly select?: (value: Value) => Selected;
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
  readonly route: import("./route.ts").Route | null;
  readonly blocking: boolean;
} {
  const match = useRouteMatch();
  if (match === null) {
    throw new Error(
      `[barq-router] A \`Route.use...()\` hook of the route "${id}" was called outside a route component, so there is no rendering route for it to read. ` +
        "Call it inside the component that route renders. Anywhere else, use the plain `useParams()`, `useRouteContext()` or `useMatch()` hooks.",
    );
  }
  if (match.route !== null && match.route.id !== id) {
    throw new Error(
      `[barq-router] A \`Route.use...()\` hook of the route "${id}" was called while the route "${match.route.id}" is rendering, where it would return that route's data under the wrong types. ` +
        `Call it only in the component "${id}" renders. To read another route from here, use \`useMatch(${JSON.stringify(id)})\`.`,
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
  /** `read`, through `select` when one was given, and then memoized by content. */
  const selected = <Value, Selected>(
    state: import("./router.ts").RouterState,
    read: () => Value,
    options: Selecting<Value, Selected> | undefined,
  ): Cell<Selected> => {
    const select = options?.select;
    if (select === undefined) return read as unknown as Cell<Selected>;
    return createMemo(
      () => select(read()),
      state.config.structuralSharing === false ? undefined : { equals: sameShape },
    );
  };
  const hooks = {
    useLoaderData: (options?: Selecting<unknown, unknown>) => {
      const match = matchFor(id);
      return selected(
        match.state,
        () => {
          if (match.route === null) return undefined;
          return match.state.dataFor(match.route, match.state.params(), match.blocking)();
        },
        options,
      );
    },
    useParams: (options?: Selecting<unknown, unknown>) => {
      const match = matchFor(id);
      return selected(match.state, () => match.state.params(), options);
    },
    useSearch: (options?: Selecting<unknown, unknown>) => {
      const match = matchFor(id);
      return selected(
        match.state,
        () => match.state.matches()[match.depth]?.search ?? match.state.validSearch(),
        options,
      );
    },
    useLoaderDeps: (options?: Selecting<unknown, unknown>) => {
      const match = matchFor(id);
      return selected(match.state, () => match.state.matches()[match.depth]?.loaderDeps, options);
    },
    useRouteContext: (options?: Selecting<unknown, unknown>) => {
      const match = matchFor(id);
      return selected(
        match.state,
        () => match.state.contexts()[match.depth] ?? match.state.config.context ?? {},
        options,
      );
    },
    useMatch: (options?: Selecting<unknown, unknown>) => {
      const match = matchFor(id);
      return selected(
        match.state,
        () => (match.route === null ? null : (match.state.matches()[match.depth] ?? null)),
        options,
      );
    },
    useNavigate: () => {
      const match = matchFor(id);
      const navigate = (to: unknown, options?: object): Promise<void> =>
        typeof to === "string"
          ? match.state.navigate(to, { from: id, ...options })
          : match.state.navigate({ from: id, ...(to as object) });
      return navigate as NavigateFn;
    },
  };
  return hooks as unknown as Omit<FileRoute<Data, Params>, "id" | "options">;
}

/**
 * A file route. Curried, because the id is known at the call site and the
 * options carry the generics that depend on nothing but themselves.
 *
 * The loader's value is inferred from `loader` in the second call. A type
 * argument on the first is the type that value must satisfy, and is the
 * value's type for a route with no loader.
 */
export function createFileRoute<
  Declared = unknown,
  Params = Record<string, string>,
  Deps = undefined,
>(
  id: string,
): <
  Data extends Declared = Declared,
  Search = Record<string, unknown>,
  const ServerChain extends readonly Middleware[] = readonly Middleware[],
>(
  options: RouteDefinition<Data, Params, Deps, Search, ServerChain>,
) => FileRoute<
  Data,
  Params,
  Deps,
  RouteDefinition<Data, Params, Deps, Search, ServerChain>,
  Search
> {
  return (options) => ({ id, options, ...hooksFor<Declared, Params>(id) }) as never;
}

/** The root route: the document, and everything every page inherits. */
export function createRootRoute<
  Data = unknown,
  Params = Record<string, string>,
  Deps = undefined,
  Search = Record<string, unknown>,
>(
  options: RootRouteOptions<Data, Params, Deps, Search> = {},
): FileRoute<Data, Params, Deps, RootRouteOptions<Data, Params, Deps, Search>, Search> {
  return {
    id: ROOT_ROUTE_ID,
    options,
    ...hooksFor<Data, Params>(ROOT_ROUTE_ID),
  } as never;
}

/**
 * The root route, with the type of the context the ROUTER supplies.
 *
 * `createRouter({ context })` is where the value comes from, and every
 * `context`, `beforeLoad` and loader in the tree is handed it with whatever the
 * routes above added.
 *
 * Curried for the reason theirs is: TypeScript has
 * no partial type-argument inference, so the context has to be named in a call
 * that infers nothing else.
 */
export function createRootRouteWithContext<Context extends Record<string, unknown>>(): <
  Data = unknown,
  Params = Record<string, string>,
  Deps = undefined,
  Search = Record<string, unknown>,
>(
  options?: Omit<RootRouteOptions<Data, Params, Deps, Search>, "context" | "beforeLoad"> & {
    readonly context?: (
      options: Omit<import("./route.ts").BeforeLoadContext<Params>, "context"> & {
        readonly context: Context;
      },
    ) => Record<string, unknown>;
    /** Handed the router's context with what `context()` added to it. */
    readonly beforeLoad?: (
      options: Omit<import("./route.ts").BeforeLoadContext<Params>, "context"> & {
        readonly context: Context;
      },
    ) => Record<string, unknown> | void | Promise<Record<string, unknown> | void>;
  },
) => FileRoute<Data, Params, Deps, RootRouteOptions<Data, Params, Deps, Search>, Search> {
  return (options) => createRootRoute(options as RootRouteOptions<never, never, never>) as never;
}
