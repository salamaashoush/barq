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

import type {
  IdsOf,
  PathsOf,
  RegisteredRouteTree,
  RoutePath,
  RoutesOf,
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
