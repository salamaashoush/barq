/**
 * `Register` — how a generated route tree reaches the types.
 *
 * An application's `routeTree.gen.ts` augments this interface, and everything
 * below reads it. That is TanStack's mechanism and it is the whole reason their
 * generated file is worth generating: theirs augments `FileRoutesByPath` and
 * declares `interface Register { router: … }`.
 *
 * THIS IS WHAT THE PREVIOUS ARRANGEMENT WAS MISSING. The old generator emitted
 * `RouteMap`, `RoutePath`, `SearchFor` and `DataFor` into a `.d.ts` for every
 * route in the project, and a `grep` across every package found no file that
 * referenced any of them — `LinkProps.to` was `string`. A generated type that
 * nothing reads is a file the build writes and a person maintains for nothing.
 *
 * Every alias below DEGRADES to the unregistered answer rather than to `never`.
 * A project with a hand-written table, a library compiled against no
 * application, and `@barqjs/router`'s own test suite all have an empty
 * `Register`, and they must keep typechecking — so an absent registration means
 * "anything", not "nothing".
 */

import type { NavigateOptions, ToOptions, Updater } from "./router.ts";

// oxlint-disable-next-line typescript/no-empty-object-type -- the augmentation target
export interface Register {}

/**
 * What a `routeTree.gen.ts` puts in `Register`.
 *
 * Named so the generator and the reader agree on one shape rather than on three
 * separate `infer`s that could drift apart.
 */
export interface RouteTreeTypes {
  /** Every route id, layouts included. */
  readonly id: string;
  /** Every addressable pattern. */
  readonly fullPaths: string;
  /** Route id -> the `FileRoute` its module exports. */
  readonly fileRoutesById: unknown;
}

/**
 * The readers, as GENERICS first.
 *
 * The `Register`-reading aliases below are one line each on top of these, and
 * the split is what makes them testable: a test cannot augment `Register`
 * without registering a route tree for every other file in the package's own
 * compilation, so the machinery is exercised through the generic form and the
 * aliases are the trivial application of it.
 */
/**
 * `never` IS CHECKED FIRST, and both halves of that are load-bearing.
 *
 * A naked type parameter in a conditional DISTRIBUTES over a union, and `never`
 * is the empty union — so `Tree extends {…} ? … : string` answered `never`
 * rather than `string`. Wrapping the check in a tuple stops the distribution and
 * is not enough on its own, because `never` is assignable to everything: the
 * true branch is then taken and `infer` produces `never` from it anyway.
 *
 * The consequence was that `RoutePath` and `RouteId` were `never` in every
 * project that has not generated a tree — a library, a hand-written table, and
 * this package's own suite. `ToPath` hid it, since `never | never | (string &
 * {})` is still a string. Caught by `tsc` on this package, which is the only
 * compilation with an empty `Register`; `bun test` does not typecheck and could
 * never have seen it.
 */
type Unregistered<Tree> = [Tree] extends [never] ? true : false;

export type IdsOf<Tree> =
  Unregistered<Tree> extends true
    ? string
    : [Tree] extends [{ id: infer Id extends string }]
      ? Id
      : string;
export type PathsOf<Tree> =
  Unregistered<Tree> extends true
    ? string
    : [Tree] extends [{ fullPaths: infer Path extends string }]
      ? Path
      : string;
export type RoutesOf<Tree> =
  Unregistered<Tree> extends true
    ? Record<string, never>
    : [Tree] extends [{ fileRoutesById: infer Routes }]
      ? Routes
      : Record<string, never>;
/** See `ToPath` for why this admits any string. */
export type ToPathOf<Tree> = PathsOf<Tree> | IdsOf<Tree> | (string & Record<never, never>);

/** What the application registered, or `never` when nothing did. */
export type RegisteredRouteTree = Register extends { routeTree: infer Tree } ? Tree : never;

/**
 * Every route id in the application, layouts included.
 *
 * `string` when nothing is registered.
 */
export type RouteId = IdsOf<RegisteredRouteTree>;

/**
 * Every ADDRESSABLE pattern — the leaves, since a layout is reached through one.
 *
 * `string` when nothing is registered.
 */
export type RoutePath = PathsOf<RegisteredRouteTree>;

/** Route id -> the `FileRoute` its module exports. */
export type FileRoutesById = RoutesOf<RegisteredRouteTree>;

/**
 * A `to` that AUTOCOMPLETES without refusing anything.
 *
 * `RoutePath | RouteId` alone would be strict, which is theirs — their own
 * example needs a `@ts-expect-error` to write a link to a route that does not
 * exist. barq stops one step short of
 * that ON PURPOSE, and the reason is that barq has a second checker theirs does
 * not: `BARQ013` compares every `<Link to>` against the route set the SAME scan
 * produced, and it can be told about tables the types cannot see — a second
 * router on a `memoryHistory` with its own table is a real thing an application
 * does, and `packages/kitchen-sink/vite.config.ts` unions exactly that in.
 *
 * So the split is: the types offer the answers, the compiler refuses the wrong
 * ones. Strict types here would reject code the compiler knows is correct,
 * which is the worse of the two failures.
 *
 * `string & Record<never, never>` is the widening that keeps literal completions
 * alive — a bare `| string` collapses the union and the editor offers nothing.
 */
export type ToPath = ToPathOf<RegisteredRouteTree>;

// ------------------------------------------------------------ typed navigation

type Simplify<T> = { [K in keyof T]: T[K] } & Record<never, never>;

type SegmentParams<Segment extends string> = Segment extends "$"
  ? { _splat?: string }
  : Segment extends `${string}{-$${infer Name}}${string}`
    ? { [K in Name]?: string | number }
    : Segment extends `${string}{$}${string}`
      ? { _splat?: string }
      : Segment extends `${string}{$${infer Name}}${string}`
        ? { [K in Name]: string | number }
        : Segment extends `$${infer Name}`
          ? { [K in Name]: string | number }
          : Record<never, never>;

type PathParams<Path extends string> = Path extends `${infer Head}/${infer Tail}`
  ? SegmentParams<Head> & PathParams<Tail>
  : SegmentParams<Path>;

/**
 * The params a path pattern takes, read off the pattern itself:
 * `/posts/$postId` is `{ postId }`, `{-$locale}` is optional and a splat is
 * `_splat`. A `string` that is not a literal says nothing, and takes anything.
 */
export type ParamsOfPath<Path extends string> = string extends Path
  ? Record<string, unknown>
  : Simplify<PathParams<Path>>;

type ParentPath<Path extends string> = Path extends `${infer Head}/${infer Tail}`
  ? Tail extends `${string}/${string}`
    ? `${Head}/${ParentPath<Tail>}`
    : Head
  : "";

type JoinPath<From extends string, To extends string> = From extends `${infer Head}/`
  ? `${Head}/${To}`
  : `${From}/${To}`;

/**
 * A `to` resolved against a `from`, as `resolvePath` does it at runtime: `.`,
 * `..`, `./x` and `../x`. Anything else relative is appended.
 */
export type ResolveRelativePath<From extends string, To extends string> = string extends To
  ? string
  : To extends `/${string}`
    ? To
    : string extends From
      ? string
      : To extends "." | ""
        ? From
        : To extends `./${infer Rest}`
          ? ResolveRelativePath<From, Rest>
          : To extends ".."
            ? ParentPath<From> extends ""
              ? "/"
              : ParentPath<From>
            : To extends `../${infer Rest}`
              ? ResolveRelativePath<ParentPath<From>, Rest>
              : JoinPath<From, To>;

/**
 * What a route's `validateSearch` produces, by route id. A route that
 * validates nothing, or a path no route registered, takes any record.
 */
export type SearchOfRoute<Tree, Id> = Id extends keyof RoutesOf<Tree>
  ? [RoutesOf<Tree>[Id]] extends [never]
    ? Record<string, unknown>
    : RoutesOf<Tree>[Id] extends { readonly types?: { readonly search: infer Search } }
      ? Search
      : Record<string, unknown>
  : Record<string, unknown>;

type ParamsOption<Path extends string> = string extends Path
  ? { readonly params?: ToOptions["params"] }
  : Record<never, never> extends PathParams<Path>
    ? {
        readonly params?:
          | true
          | ParamsOfPath<Path>
          | Updater<Record<string, unknown>, ParamsOfPath<Path>>;
      }
    : {
        readonly params:
          | true
          | ParamsOfPath<Path>
          | Updater<Record<string, unknown>, ParamsOfPath<Path>>;
      };

/**
 * `ToOptions`, with `params` and `search` narrowed by where it goes.
 *
 * A `to` whose pattern has a required parameter makes `params` required. A `to`
 * that is a registered route gives `search` that route's validated shape, every
 * key optional because a validator's defaults fill what is left out.
 */
export type ToOptionsFor<
  To extends string,
  From extends string = string,
  Tree = RegisteredRouteTree,
> = Omit<ToOptions, "to" | "from" | "params" | "search"> & {
  readonly to?: To | ToPathOf<Tree>;
  readonly from?: From | IdsOf<Tree>;
  readonly search?:
    | true
    | string
    | Partial<SearchOfRoute<Tree, ResolveRelativePath<From, To>>>
    | Updater<
        SearchOfRoute<Tree, From>,
        Partial<SearchOfRoute<Tree, ResolveRelativePath<From, To>>>
      >;
} & ParamsOption<ResolveRelativePath<From, To>>;

export type NavigateOptionsFor<
  To extends string,
  From extends string = string,
  Tree = RegisteredRouteTree,
> = Omit<NavigateOptions, keyof ToOptions> &
  Pick<NavigateOptions, "hash" | "state" | "mask" | "href"> &
  ToOptionsFor<To, From, Tree>;

/**
 * `navigate`, in both of its forms.
 *
 * The string form is barq's own. The object form is TanStack's, and its `to` is
 * what types the rest of it.
 */
export interface NavigateFn {
  (to: ToPath, options?: NavigateOptions): Promise<void>;
  <const To extends string = ".", const From extends string = string>(
    options: NavigateOptionsFor<To, From>,
  ): Promise<void>;
}
