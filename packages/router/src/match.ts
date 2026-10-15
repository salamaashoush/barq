/**
 * Reading ONE match out of the chain: TanStack's `from`, `strict`,
 * `shouldThrow` and `select`, for every hook that takes them.
 *
 * `select` is where barq differs in kind rather than in name. Theirs narrows
 * what re-renders a component; here the selected value is a memo, so a hole
 * that reads it re-runs when THAT value changed and at no other time, whatever
 * else in the match moved.
 */

import { type Cell, createMemo, untrack } from "@barqjs/core";

import { type RouteMatchInfo, useRouteMatch, useRouter } from "./components.ts";
import type { NavigateFn, RegisteredRouteTree, RouteId, RoutesOf } from "./register.ts";
import type { Route } from "./route.ts";
import { type RouteMatch, type RouterState, sameShape } from "./router.ts";

/** What every match-reading hook takes. */
export interface MatchHookOptions<Value, Selected = Value, Throw extends boolean = boolean> {
  /** The route whose match is read. The nearest one when absent. */
  readonly from?: RouteId;
  /**
   * `false` reads loosely: the nearest match's value, whichever route that is.
   * It only loosens the TYPE; without a `from` the read is the nearest match
   * either way.
   */
  readonly strict?: boolean;
  /**
   * What happens when `from` is not in the matched chain: throw (the default),
   * or answer `undefined` when `false`.
   */
  readonly shouldThrow?: Throw;
  /** Narrow the value. The result is memoized, and compared by content. */
  readonly select?: (value: Value) => Selected;
}

/** `undefined` joins the result only when the caller turned the throw off. */
export type Thrown<Value, Throw extends boolean> = Throw extends false ? Value | undefined : Value;

/** Where a hook with no `from` reads: the match rendering it, or the deepest. */
export type Anchor = "nearest" | "leaf";

function locate(
  state: RouterState,
  near: RouteMatchInfo | null,
  from: string | undefined,
  anchor: Anchor,
): { readonly match: RouteMatch; readonly index: number } | undefined {
  const all = state.matches();
  let index = all.length - 1;
  if (from !== undefined) index = all.findIndex((match) => match.routeId === from);
  else if (anchor === "nearest" && near !== null && near.route !== null) {
    const id = near.route.id;
    index = all.findIndex((match) => match.routeId === id);
  }
  const match = all[index];
  return match === undefined ? undefined : { match, index };
}

/**
 * A memo over `read`, compared by content so a selector returning a fresh
 * object every time does not notify every time.
 *
 * A match that has LEFT the chain keeps answering with its last value rather
 * than throwing: the component reading it is about to be disposed by the same
 * navigation, and a throw from inside the graph there would take the page.
 */
function remembered<Selected>(
  state: RouterState,
  read: () => Selected | undefined,
): Cell<Selected> {
  let last: Selected | undefined;
  return createMemo(
    () => {
      const next = read();
      if (next !== undefined) last = next;
      return last as Selected;
    },
    state.config.structuralSharing === false ? undefined : { equals: sameShape },
  );
}

/**
 * One value off one match, as a cell.
 *
 * Throws AT THE CALL when `from` names a route that is not matched, which is
 * where the mistake is; a cell that threw later would throw from inside
 * somebody's JSX.
 */
export function matchCell<Value, Selected = Value>(
  hook: string,
  options: MatchHookOptions<Value, Selected> | undefined,
  anchor: Anchor,
  pick: (match: RouteMatch, state: RouterState) => Value,
): Cell<Selected> {
  const state = useRouter();
  const near = useRouteMatch();
  const from = options?.from;
  const select = options?.select;
  if (from !== undefined && options?.shouldThrow !== false) {
    if (untrack(() => locate(state, near, from, anchor)) === undefined) {
      throw new Error(
        `[barq-router] \`${hook}({ from: ${JSON.stringify(from)} })\` was called while the route ${JSON.stringify(from)} is not matched by the current URL, so it has nothing to read. ` +
          "Call it from a component rendered under that route, or pass `shouldThrow: false` to read `undefined` instead.",
      );
    }
  }
  return remembered(state, () => {
    const found = locate(state, near, from, anchor);
    if (found === undefined) return undefined;
    const value = pick(found.match, state);
    return (select === undefined ? value : select(value)) as Selected;
  });
}

/** The matches on one side of the nearest one, for `useChildMatches` and `useParentMatches`. */
export function matchesCell<Selected = readonly RouteMatch[]>(
  side: "all" | "children" | "parents",
  options: { readonly select?: (matches: readonly RouteMatch[]) => Selected } | undefined,
): Cell<Selected> {
  const state = useRouter();
  const near = useRouteMatch();
  const select = options?.select;
  return remembered(state, () => {
    const all = state.matches();
    let list = all;
    if (side !== "all") {
      // Outside a route component nothing is above and everything is below.
      const at = near === null ? -1 : (locate(state, near, undefined, "nearest")?.index ?? -1);
      list = side === "children" ? all.slice(at + 1) : all.slice(0, Math.max(at, 0));
    }
    return (select === undefined ? list : select(list)) as Selected;
  });
}

/**
 * A route's loader value. Reading it is what STARTS the loader, and a read
 * before it settles parks the nearest loading boundary, so this goes through
 * the loader's own cell rather than through the match's snapshot of it.
 */
export function loaderCell<Data, Selected = Data>(
  options: MatchHookOptions<Data, Selected> | undefined,
): Cell<Selected> {
  const state = useRouter();
  const near = useRouteMatch();
  const from = options?.from;
  const select = options?.select;
  const route = (): Route | undefined =>
    from === undefined
      ? (near?.route ?? state.chain().at(-1))
      : state.chain().find((candidate) => candidate.id === from);
  if (from !== undefined && options?.shouldThrow !== false && untrack(route) === undefined) {
    throw new Error(
      `[barq-router] \`useLoaderData({ from: ${JSON.stringify(from)} })\` was called while the route ${JSON.stringify(from)} is not matched by the current URL, so it has no loader data to read. ` +
        "Call it from a component rendered under that route, or pass `shouldThrow: false` to read `undefined` instead.",
    );
  }
  const data = (): Data => {
    const found = route();
    if (found === undefined) return undefined as Data;
    return state.dataFor(found, state.params(), near?.blocking ?? false)() as Data;
  };
  if (select === undefined) return data as unknown as Cell<Selected>;
  return createMemo(
    () => select(data()),
    state.config.structuralSharing === false ? undefined : { equals: sameShape },
  );
}

/** The hooks of one route, with `from` already said. TanStack's `RouteApi`. */
export interface RouteApi<
  Id extends string = string,
  Data = unknown,
  Params = Record<string, string>,
  Search = Record<string, unknown>,
  Deps = unknown,
> {
  readonly id: Id;
  useMatch<Selected = RouteMatch<Data>>(
    options?: Pick<MatchHookOptions<RouteMatch<Data>, Selected>, "select">,
  ): Cell<Selected>;
  useParams<Selected = Params>(
    options?: Pick<MatchHookOptions<Params, Selected>, "select">,
  ): Cell<Selected>;
  useSearch<Selected = Search>(
    options?: Pick<MatchHookOptions<Search, Selected>, "select">,
  ): Cell<Selected>;
  useLoaderData<Selected = Data>(
    options?: Pick<MatchHookOptions<Data, Selected>, "select">,
  ): Cell<Selected>;
  useLoaderDeps<Selected = Deps>(
    options?: Pick<MatchHookOptions<Deps, Selected>, "select">,
  ): Cell<Selected>;
  useRouteContext<Selected = Record<string, unknown>>(
    options?: Pick<MatchHookOptions<Record<string, unknown>, Selected>, "select">,
  ): Cell<Selected>;
  /** `navigate`, with relative targets resolved from this route. */
  useNavigate(): NavigateFn;
}

/**
 * A route's `RouteApi`, typed from what its module declared. A route nothing
 * registered gets the untyped one.
 */
export type RouteApiOf<Tree, Id extends string> = Id extends keyof RoutesOf<Tree>
  ? [RoutesOf<Tree>[Id]] extends [never]
    ? RouteApi<Id>
    : RoutesOf<Tree>[Id] extends {
          readonly types?: {
            readonly loaderData: infer Data;
            readonly params: infer Params;
            readonly search: infer Search;
            readonly loaderDeps: infer Deps;
          };
        }
      ? RouteApi<Id, Data, Params, Search, Deps>
      : RouteApi<Id>
  : RouteApi<Id>;

/**
 * TanStack's `getRouteApi`: a route's typed hooks without importing the route
 * module, which is what keeps a component file out of an import cycle with it.
 */
export function getRouteApi<const Id extends string>(id: Id): RouteApiOf<RegisteredRouteTree, Id> {
  const from = id as RouteId;
  const api: RouteApi<Id> = {
    id,
    useMatch: (options) => matchCell("useMatch", { ...options, from }, "nearest", (match) => match),
    useParams: (options) =>
      matchCell("useParams", { ...options, from }, "nearest", (match) => match.params),
    useSearch: (options) =>
      matchCell("useSearch", { ...options, from }, "nearest", (match) => match.search),
    useLoaderData: (options) => loaderCell({ ...options, from }),
    useLoaderDeps: (options) =>
      matchCell("useLoaderDeps", { ...options, from }, "nearest", (match) => match.loaderDeps),
    useRouteContext: (options) =>
      matchCell("useRouteContext", { ...options, from }, "nearest", (match) => match.context),
    useNavigate: () => {
      const state = useRouter();
      const origin: string = id;
      const navigate = (to: unknown, options?: object): Promise<void> =>
        typeof to === "string"
          ? state.navigate(to, { from: origin, ...options })
          : state.navigate({ from: origin, ...(to as object) });
      return navigate;
    },
  };
  return api as never;
}

/**
 * A promise a loader returned without awaiting it, as a cell.
 *
 * Reading the cell before the promise settles parks the nearest loading
 * boundary, and a rejection reaches the nearest error boundary: the hook form
 * of `<Await>`. The promise comes back beside it, as TanStack's does.
 */
export function useAwaited<T>(options: { readonly promise: Promise<T> }): [Cell<T>, Promise<T>] {
  const promise = options.promise;
  return [createMemo(async () => await promise), promise];
}
