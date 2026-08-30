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
