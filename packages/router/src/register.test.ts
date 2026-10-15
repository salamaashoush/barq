/**
 * The registration machinery, exercised through its GENERIC form.
 *
 * `Register` is a module augmentation, and a test file cannot augment it
 * without registering a route tree for every other file in this package's own
 * compilation — `router.test.ts` writes `<Link to="/x">` for routes that exist
 * only in its own tables, and every one of them would then be checked against
 * an application's tree. So `register.ts` exposes the readers as generics and
 * the `Register`-reading aliases are one line each on top; this file checks the
 * generics, and the two runtime rows below check the aliases DEGRADE.
 *
 * The assertions are compile-time. `assertType` returns its argument, so a row
 * that stops typechecking fails `tsc` while the suite still reports it ran —
 * which is what keeps this file from being a no-op that passes because it is
 * empty.
 */

import { describe, expect, test } from "bun:test";

import { linkOptions } from "./components.ts";
import { redirect } from "./errors.ts";
import { createFileRoute, createRootRouteWithContext } from "./file-route.ts";
import type { RouteApiOf } from "./match.ts";
import type {
  IdsOf,
  NavigateFn,
  NavigateOptionsFor,
  ParamsOfPath,
  PathsOf,
  RegisteredRouteTree,
  ResolveRelativePath,
  RoutePath,
  RoutesOf,
  SearchOfRoute,
  ToPathOf,
} from "./register.ts";

/** Compile-time only: the value is never read, the ASSIGNMENT is the assertion. */
const assertType = <T>(value: T): T => value;

interface Tree {
  id: "__root__" | "/" | "/posts" | "/posts/$postId";
  fullPaths: "/" | "/posts/$postId";
  fileRoutesById: { "/posts": { options: { loader: () => 1 } } };
}

describe("a registered route tree narrows", () => {
  test("ids and paths come back as the literal unions the generator wrote", () => {
    assertType<IdsOf<Tree>>("__root__");
    assertType<IdsOf<Tree>>("/posts/$postId");
    assertType<PathsOf<Tree>>("/");
    // `fullPaths` is the ADDRESSABLE set, so a layout is not in it.
    // @ts-expect-error -- "/posts" is a layout: reachable, not addressable
    assertType<PathsOf<Tree>>("/posts");
    // …but it IS an id, which is what `<Link to>` also accepts.
    assertType<IdsOf<Tree>>("/posts");
    expect(true).toBe(true);
  });

  test("the per-route lookup keeps the module's own inference", () => {
    const routes = assertType<RoutesOf<Tree>>({ "/posts": { options: { loader: () => 1 } } });
    // The loader's return type survives, which is the whole point of importing
    // the route module STATICALLY: a `typeof import(...)` had to fail closed on
    // everything it could not prove, and this proves it by construction.
    const data: number = routes["/posts"].options.loader();
    expect(data).toBe(1);
  });

  /**
   * `to` OFFERS the routes and REFUSES nothing — see `ToPath` for why, and
   * which checker refuses instead.
   */
  test("`to` admits a string the tree does not name", () => {
    assertType<ToPathOf<Tree>>("/posts/$postId");
    assertType<ToPathOf<Tree>>("/posts");
    assertType<ToPathOf<Tree>>("https://example.com/away");
    expect(true).toBe(true);
  });
});

describe("nothing registered degrades to `string`, not to `never`", () => {
  /**
   * A hand-written table, a library compiled against no application, and this
   * package's own suite all have an empty `Register`. `never` would make every
   * one of them a type error.
   */
  test("an unregistered project still writes any path it likes", () => {
    assertType<RoutePath>("/anything/at/all");
    assertType<PathsOf<never>>("/anything/at/all");
    expect(true).toBe(true);
  });

  test("nothing is registered here, which is what the row above depends on", () => {
    // `RegisteredRouteTree` is `never` in this compilation, and a value of type
    // `never` cannot be produced — so the assertion is that the ALIAS below
    // typechecks as `string`, which it only does when nothing registered.
    const path: RoutePath = "/x";
    const same: string = path;
    expect(same).toBe("/x");
    assertType<RegisteredRouteTree[] & unknown[]>([]);
  });
});

/**
 * Typed navigation: what `to` says decides what `params` and `search` may be.
 *
 * The same generic-first arrangement as above. `NavigateOptionsFor` takes the
 * tree as a parameter, so a tree declared HERE types a navigation without
 * registering one for the rest of the package.
 */
describe("`to` types the rest of a navigation", () => {
  const PostRoute = createFileRoute("/posts/$postId")({
    validateSearch: (input: Record<string, unknown>) => ({
      page: Number(input.page ?? 1),
      tab: String(input.tab ?? "info"),
    }),
  });
  const HomeRoute = createFileRoute("/")({});

  interface Typed {
    id: "/" | "/posts/$postId";
    fullPaths: "/" | "/posts/$postId";
    fileRoutesById: { "/": typeof HomeRoute; "/posts/$postId": typeof PostRoute };
  }
  type Options<To extends string, From extends string = string> = NavigateOptionsFor<
    To,
    From,
    Typed
  >;
  /** Compile-time only: `Actual` has to be exactly `Expected`. */
  type Same<Actual, Expected> = [Actual] extends [Expected]
    ? [Expected] extends [Actual]
      ? true
      : false
    : false;

  test("a pattern's parameters are read off the pattern", () => {
    assertType<Same<ParamsOfPath<"/posts/$postId">, { postId: string | number }>>(true);
    assertType<
      Same<ParamsOfPath<"/a/$one/b/$two">, { one: string | number; two: string | number }>
    >(true);
    // Optional and splat segments are optional keys.
    assertType<ParamsOfPath<"/docs/{-$version}/guide">>({});
    assertType<ParamsOfPath<"/docs/{-$version}/guide">>({ version: "2" });
    assertType<ParamsOfPath<"/files/$">>({ _splat: "a/b" });
    assertType<ParamsOfPath<"/files/$">>({});
    assertType<ParamsOfPath<"/report/{$name}.csv">>({ name: "q3" });
    // A path nobody spelled as a literal says nothing, and takes anything.
    assertType<ParamsOfPath<string>>({ whatever: 1 });
    expect(true).toBe(true);
  });

  test("a relative `to` is resolved against `from` the way the router resolves it", () => {
    assertType<Same<ResolveRelativePath<"/posts/$postId", ".">, "/posts/$postId">>(true);
    assertType<Same<ResolveRelativePath<"/posts/$postId", "..">, "/posts">>(true);
    assertType<Same<ResolveRelativePath<"/posts", "..">, "/">>(true);
    assertType<Same<ResolveRelativePath<"/posts", "./$postId">, "/posts/$postId">>(true);
    assertType<Same<ResolveRelativePath<"/posts/$postId", "../new">, "/posts/new">>(true);
    assertType<Same<ResolveRelativePath<"/posts", "/about">, "/about">>(true);
    assertType<Same<ResolveRelativePath<string, "..">, string>>(true);
    expect(true).toBe(true);
  });

  test("`params` is required exactly when the destination has a required parameter", () => {
    assertType<Options<"/posts/$postId">>({ to: "/posts/$postId", params: { postId: "7" } });
    assertType<Options<"/posts/$postId">>({ to: "/posts/$postId", params: { postId: 7 } });
    assertType<Options<"/posts/$postId">>({ to: "/posts/$postId", params: true });
    assertType<Options<"/posts/$postId">>({
      to: "/posts/$postId",
      params: (current) => ({ postId: String(current.postId) }),
    });
    // @ts-expect-error -- the pattern has a parameter and nothing fills it
    assertType<Options<"/posts/$postId">>({ to: "/posts/$postId" });
    assertType<Options<"/posts/$postId">>({
      to: "/posts/$postId",
      // @ts-expect-error -- `id` is not what the pattern calls it
      params: { id: "7" },
    });
    // No parameter, so nothing to give.
    assertType<Options<"/">>({ to: "/" });
    assertType<Options<"/">>({ to: "/", replace: true, hash: "top", resetScroll: false });
    expect(true).toBe(true);
  });

  test("a relative destination is typed by where it lands", () => {
    assertType<Options<"./$postId", "/posts">>({
      from: "/posts",
      to: "./$postId",
      params: { postId: "7" },
    });
    // @ts-expect-error -- `/posts` + `./$postId` needs `postId`
    assertType<Options<"./$postId", "/posts">>({ from: "/posts", to: "./$postId" });
    assertType<Options<"..", "/posts/$postId">>({ from: "/posts/$postId", to: ".." });
    expect(true).toBe(true);
  });

  test("`search` takes the shape the destination's validateSearch produces", () => {
    assertType<Same<SearchOfRoute<Typed, "/posts/$postId">, { page: number; tab: string }>>(true);
    assertType<Same<SearchOfRoute<Typed, "/">, Record<string, unknown>>>(true);
    assertType<Same<SearchOfRoute<Typed, "/elsewhere">, Record<string, unknown>>>(true);
    assertType<Same<SearchOfRoute<never, "/x">, Record<string, unknown>>>(true);

    assertType<Options<"/posts/$postId">>({
      to: "/posts/$postId",
      params: { postId: "7" },
      // Every key optional: the validator's defaults fill what is left out.
      search: { page: 2 },
    });
    assertType<Options<"/posts/$postId">>({
      to: "/posts/$postId",
      params: { postId: "7" },
      // @ts-expect-error -- `page` is a number in this route's search
      search: { page: "2" },
    });
    assertType<Options<"/posts/$postId", "/posts/$postId">>({
      from: "/posts/$postId",
      to: "/posts/$postId",
      params: true,
      // The updater is handed the search of the route it navigates FROM.
      search: (current) => ({ page: current.page + 1 }),
    });
    assertType<Options<"/posts/$postId">>({
      to: "/posts/$postId",
      params: { postId: "7" },
      search: true,
    });
    // A route that validates nothing takes any record.
    assertType<Options<"/">>({ to: "/", search: { anything: [1, 2] } });
    // An updater written against the raw query, which is how it was typed
    // before a route could say more, still fits.
    assertType<Options<"/">>({
      to: "/",
      search: (current: Record<string, string>) => ({ ...current, page: "2" }),
    });
    expect(true).toBe(true);
  });

  test("nothing registered: `to` still types `params`, and any path is still writable", () => {
    const navigate = (async () => {}) as NavigateFn;
    const typed = (): unknown[] => [
      navigate({ to: "/posts/$postId", params: { postId: "7" }, search: { tab: "a" } }),
      // @ts-expect-error -- the pattern has a parameter and nothing fills it
      navigate({ to: "/posts/$postId" }),
      navigate({ to: "/about", search: (current) => ({ ...current, page: 2 }) }),
      navigate("/posts/7", { replace: true }),
      navigate({ to: "..", from: "/posts/$postId" }),
    ];
    expect(typeof typed).toBe("function");
  });

  test("redirect and linkOptions check the same way", () => {
    const typed = (): unknown[] => [
      redirect({ to: "/posts/$postId", params: { postId: "7" }, statusCode: 301 }),
      // @ts-expect-error -- the pattern has a parameter and nothing fills it
      redirect({ to: "/posts/$postId" }),
      linkOptions({ to: "/posts/$postId", params: { postId: "7" } }),
      // @ts-expect-error -- the pattern has a parameter and nothing fills it
      linkOptions({ to: "/posts/$postId" }),
    ];
    expect(typeof typed).toBe("function");
  });

  test("a file route's hooks carry what its options said", () => {
    const typed = (): void => {
      const search = PostRoute.useSearch();
      const page: number = search().page;
      const tab = PostRoute.useSearch({ select: (value) => value.tab });
      const text: string = tab();
      const Data = createFileRoute<{ title: string }>("/x")({});
      const title: string = Data.useLoaderData({ select: (data) => data.title })();
      void [page, text, title];
    };
    expect(typeof typed).toBe("function");
  });

  test("getRouteApi's hooks are typed from the registered route", () => {
    const typed = (
      api: RouteApiOf<Typed, "/posts/$postId">,
      loose: RouteApiOf<never, "/x">,
    ): void => {
      const page: number = api.useSearch()().page;
      const tab: string = api.useSearch({ select: (search) => search.tab })();
      const id: "/posts/$postId" = api.id;
      // @ts-expect-error -- this route's search has no `missing`
      void api.useSearch()().missing;
      // A route nothing registered still has an api; it is just not a typed one.
      const data: unknown = loose.useLoaderData()();
      void [page, tab, id, data];
    };
    expect(typeof typed).toBe("function");
  });

  test("createRootRouteWithContext types the context the tree is handed", () => {
    const Root = createRootRouteWithContext<{ user: string }>()({
      beforeLoad: ({ context }) => {
        const user: string = context.user;
        // @ts-expect-error -- the router's context has no `tenant`
        void context.tenant;
        return { greeting: `hello ${user}` };
      },
    });
    expect(typeof Root.options.beforeLoad).toBe("function");
  });
});
