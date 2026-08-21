/**
 * The matcher, and the behaviours the old router got wrong.
 *
 * Several cases here exist because `packages/extra`'s matcher answered them
 * differently, and each one says so — a divergence a reader should be able to
 * find deliberately rather than discover.
 */

import { describe, expect, test } from "bun:test";

import { createMatcher } from "./matcher.ts";
import { type RouteDefinition, flattenRoutes } from "./route.ts";

const noop = (): null => null;

function matcherFor(table: readonly RouteDefinition<never, never>[]) {
  return createMatcher(flattenRoutes(table));
}

const leaf = (path: string): RouteDefinition<never, never> =>
  ({ path, component: noop as never }) as RouteDefinition<never, never>;

describe("matching", () => {
  test("static, parameter and splat", () => {
    const m = matcherFor([leaf("/"), leaf("/about"), leaf("/users/$id"), leaf("/files/$")]);

    expect(m.match("/")?.route.fullPath).toBe("/");
    expect(m.match("/about")?.route.fullPath).toBe("/about");
    expect(m.match("/users/7")).toMatchObject({ params: { id: "7" } });
    expect(m.match("/files/a/b/c")).toMatchObject({ params: { _splat: "a/b/c" } });
    expect(m.match("/nothing")).toBeNull();
  });

  test("a splat matches zero segments", () => {
    const m = matcherFor([leaf("/files/$")]);
    expect(m.match("/files")).toMatchObject({ params: { _splat: "" } });
  });

  test("a trailing slash is the same route", () => {
    // `packages/extra` anchored `^…$` per route, so `/users` and `/users/` were
    // different strings and serving both meant declaring both.
    const m = matcherFor([leaf("/users")]);
    expect(m.match("/users")?.route.fullPath).toBe("/users");
    expect(m.match("/users/")?.route.fullPath).toBe("/users");
  });

  test("a percent-encoded parameter is decoded", () => {
    // `packages/extra` handed `hello%20world` through verbatim.
    const m = matcherFor([leaf("/q/$term")]);
    expect(m.match("/q/hello%20world")?.params.term).toBe("hello world");
  });

  test("a malformed escape is a 404's problem, not a 500's", () => {
    const m = matcherFor([leaf("/q/$term")]);
    expect(m.match("/q/%E0%A4%A")?.params.term).toBe("%E0%A4%A");
  });
});

describe("ranking", () => {
  test("static beats a parameter regardless of declaration order", () => {
    // THE divergence. `packages/extra` returned the first route in declaration
    // order, so `/users/new` declared second was unreachable and matched
    // `/users/$id` with `{ id: "new" }`.
    const m = matcherFor([leaf("/users/$id"), leaf("/users/new")]);
    expect(m.match("/users/new")?.route.fullPath).toBe("/users/new");
    expect(m.match("/users/7")).toMatchObject({ params: { id: "7" } });
  });

  test("a parameter beats a splat", () => {
    const m = matcherFor([leaf("/files/$"), leaf("/files/$name")]);
    expect(m.match("/files/readme")?.route.fullPath).toBe("/files/$name");
    expect(m.match("/files/a/b")?.route.fullPath).toBe("/files/$");
  });

  test("a failed static branch backtracks to the parameter branch", () => {
    // The case a bucket-by-first-segment cannot answer and a scored ranking
    // gets wrong: `x` matches the static edge, then `c` fails against `d`, and
    // `/a/$b/c` is still the right answer.
    const m = matcherFor([leaf("/a/x/d"), leaf("/a/$b/c")]);
    expect(m.match("/a/x/c")).toMatchObject({
      route: { fullPath: "/a/$b/c" },
      params: { b: "x" },
    });
    expect(m.match("/a/x/d")?.route.fullPath).toBe("/a/x/d");
  });
});

describe("nesting", () => {
  const table: RouteDefinition<never, never>[] = [
    {
      path: "/",
      component: noop as never,
      children: [
        { path: "", component: noop as never },
        {
          path: "users",
          component: noop as never,
          children: [
            { path: "", component: noop as never },
            { path: "$id", component: noop as never },
          ],
        },
      ],
    } as RouteDefinition<never, never>,
  ];

  test("an index child is the layout's own path", () => {
    const m = matcherFor(table);
    expect(m.match("/")?.route.chain.map((r) => r.fullPath)).toEqual(["/", "/"]);
    expect(m.match("/users")?.route.chain.map((r) => r.fullPath)).toEqual([
      "/",
      "/users",
      "/users",
    ]);
  });

  test("the chain is outermost first and every entry renders", () => {
    const m = matcherFor(table);
    const match = m.match("/users/7");
    expect(match?.route.chain.map((r) => r.fullPath)).toEqual(["/", "/users", "/users/$id"]);
    expect(match?.params).toEqual({ id: "7" });
  });

  test("a parent parameter of any length reaches its children", () => {
    // `packages/extra` sliced the child pathname by `route.path.length`, so a
    // nested route under a parameterised parent matched only when the value
    // happened to be as long as the pattern — every UUID missed.
    const m = matcherFor([
      {
        path: "/u/$id",
        component: noop as never,
        children: [{ path: "edit", component: noop as never }],
      } as RouteDefinition<never, never>,
    ]);
    for (const id of ["7", "42", "abcdef", "550e8400-e29b-41d4-a716-446655440000"]) {
      expect(m.match(`/u/${id}/edit`)).toMatchObject({ params: { id } });
    }
  });

  test("a layout leaks no splat into params", () => {
    const m = matcherFor([
      {
        path: "/u/$id",
        component: noop as never,
        children: [{ path: "edit", component: noop as never }],
      } as RouteDefinition<never, never>,
    ]);
    expect(m.match("/u/42/edit")?.params).toEqual({ id: "42" });
  });

  test("a pathless layout contributes no segment", () => {
    const m = matcherFor([
      {
        id: "shell",
        component: noop as never,
        children: [{ path: "/dashboard", component: noop as never }],
      } as RouteDefinition<never, never>,
    ]);
    const match = m.match("/dashboard");
    expect(match?.route.fullPath).toBe("/dashboard");
    expect(match?.route.chain.map((r) => r.id)).toEqual(["shell", "/dashboard"]);
  });

  test("an absolute child escapes its parent's path but not its chain", () => {
    const m = matcherFor([
      {
        path: "/settings",
        component: noop as never,
        children: [{ path: "/logout", component: noop as never }],
      } as RouteDefinition<never, never>,
    ]);
    expect(m.match("/logout")?.route.chain.map((r) => r.fullPath)).toEqual([
      "/settings",
      "/logout",
    ]);
  });
});

describe("conflicts are refused, not resolved by declaration order", () => {
  test("two routes at the same path collide on their derived id", () => {
    expect(() => matcherFor([leaf("/a"), leaf("/a")])).toThrow(/claim the id/);
  });

  test("…and on the path itself when their ids were given by hand", () => {
    expect(() =>
      matcherFor([
        { id: "one", path: "/a", component: noop as never } as RouteDefinition<never, never>,
        { id: "two", path: "/a", component: noop as never } as RouteDefinition<never, never>,
      ]),
    ).toThrow(/two routes match the same path/);
  });

  test("one position, two parameter names", () => {
    // The old matcher pushed `paramNames` in PASS order rather than positional
    // order, so `/a/$id/b/$rest` could report the two names swapped. Naming a
    // position twice is refused instead.
    expect(() => matcherFor([leaf("/x/$id"), leaf("/x/$slug/y")])).toThrow(
      /one position, one name/,
    );
  });

  test("two routes claiming the same id", () => {
    expect(() =>
      matcherFor([
        { id: "same", path: "/a", component: noop as never } as RouteDefinition<never, never>,
        { id: "same", path: "/b", component: noop as never } as RouteDefinition<never, never>,
      ]),
    ).toThrow(/claim the id/);
  });
});

describe("cost", () => {
  test("a miss returns null and position does not decide cost", () => {
    const many: RouteDefinition<never, never>[] = [];
    const pathOfIndex = (i: number) => `/s${i % 37}/u${i}`;
    for (let i = 0; i < 500; i++) many.push(leaf(`${pathOfIndex(i)}/$a/$b`));
    const m = matcherFor(many);

    expect(m.match("/nothing/here/at/all")).toBeNull();
    // The first and last routes are one walk each. `packages/extra` scanned
    // linearly, so the last of 200 cost 3.3 µs against the first's 42 ns.
    for (const i of [0, 249, 499]) {
      expect(m.match(`${pathOfIndex(i)}/x/y`), `route ${i}`).toMatchObject({
        route: { fullPath: `${pathOfIndex(i)}/$a/$b` },
        params: { a: "x", b: "y" },
      });
    }
  });
});
