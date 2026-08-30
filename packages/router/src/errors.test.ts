/**
 * The brand contract, from the router's side.
 *
 * `Redirect` and `NotFound` live here and `@barqjs/start` has to recognise them
 * without importing this package — the dependency runs router -> start and
 * start is an OPTIONAL peer, so there is no edge to import across. What stands
 * in for one is the global symbol registry, and what stands in for a type check
 * on it is this file plus `a server function's control-flow throws` in
 * `packages/start/src/server.test.ts`.
 *
 * The two literals below are the whole contract. They are written out rather
 * than imported on purpose: importing the constant from the module under test
 * would make the test pass for any value it happened to hold, which is exactly
 * the failure that matters here.
 */

import { describe, expect, test } from "bun:test";

import {
  NOT_FOUND,
  NotFound,
  REDIRECT,
  Redirect,
  errorFallbackFor,
  isNotFound,
  isRedirect,
} from "./errors.ts";
import { isNavigable } from "./path.ts";

describe("the brands @barqjs/start agrees to", () => {
  test("the symbols are the ones the other package writes", () => {
    // `as symbol`: `export const X = Symbol.for(...)` infers `unique symbol`,
    // and the literal on the right is a plain `symbol`. They are the same
    // value — that is the assertion — and only the declared types differ.
    expect(REDIRECT as symbol).toBe(Symbol.for("barq.redirect"));
    expect(NOT_FOUND as symbol).toBe(Symbol.for("barq.not-found"));
  });

  test("what this package throws carries them", () => {
    expect((new Redirect("/login") as unknown as Record<symbol, unknown>)[REDIRECT]).toBe(true);
    expect((new NotFound() as unknown as Record<symbol, unknown>)[NOT_FOUND]).toBe(true);
  });

  /**
   * The direction that matters at runtime: a redirect a server function threw is
   * rebuilt by `@barqjs/start/client` as ITS class, never this one, and the
   * router still has to navigate on it.
   */
  test("a foreign object carrying the brand is a redirect here", () => {
    const fromTheWire = Object.assign(new Error("redirect to /login"), {
      [REDIRECT]: true,
      to: "/login",
      status: 302,
    });
    expect(isRedirect(fromTheWire)).toBe(true);
    expect(fromTheWire instanceof Redirect).toBe(false);
    if (isRedirect(fromTheWire)) expect(fromTheWire.to).toBe("/login");
  });

  test("and the same for notFound", () => {
    const fromTheWire = Object.assign(new Error("no such row"), { [NOT_FOUND]: true });
    expect(isNotFound(fromTheWire)).toBe(true);
    expect(fromTheWire instanceof NotFound).toBe(false);
  });

  /**
   * Why the predicates are brand checks rather than `instanceof`: two copies of
   * this package in one page give two classes, and a redirect thrown through
   * one was invisible to the other.
   */
  test("a second copy of the class is still a redirect", () => {
    // Declared as its own `const` because a computed class-property name needs
    // a `unique symbol`, which is what a `const` binding of `Symbol.for` is.
    const brand = Symbol.for("barq.redirect");
    class OtherCopy extends Error {
      readonly [brand] = true;
      readonly to = "/login";
      readonly status = 302;
    }
    expect(isRedirect(new OtherCopy())).toBe(true);
  });

  test("an ordinary error is neither", () => {
    expect(isRedirect(new Error("boom"))).toBe(false);
    expect(isNotFound(new Error("boom"))).toBe(false);
    expect(isRedirect(null)).toBe(false);
    expect(isNotFound(undefined)).toBe(false);
    expect(isRedirect("javascript:alert(1)")).toBe(false);
  });
});

/**
 * The pin between the two copies of `isNavigable`.
 *
 * `packages/start/src/server.ts` carries a second one, because a server function
 * is an independent trust boundary and cannot import this package. The same
 * table runs against that copy under `the targets a redirect may name are the
 * router's list, exactly`, so a change to either that the other does not follow
 * fails on one side or the other rather than opening a hole on one channel.
 */
describe("what a redirect may name", () => {
  const allowed = [
    "/login",
    "login",
    "./x",
    "../x",
    "//host/path",
    "https://x.test/y",
    "http://x.test",
  ];
  const refused = ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x"];

  test("a path, a relative path and an http(s) URL are navigable", () => {
    for (const to of allowed) expect(isNavigable(to)).toBe(true);
  });

  test("every other scheme is not", () => {
    for (const to of refused) expect(isNavigable(to)).toBe(false);
  });

  /** The scheme is matched case-insensitively, or the check is one `JaVaScRiPt:` from useless. */
  test("the scheme is not case-sensitive", () => {
    expect(isNavigable("JaVaScRiPt:alert(1)")).toBe(false);
    expect(isNavigable("HTTPS://x.test")).toBe(true);
  });
});

/**
 * `onCatch` — the route's own notification that its boundary caught.
 *
 * For REPORTING: the boundary still renders `errorComponent`. A route that
 * wants different markup changes that component; this is where the error
 * reaches a crash reporter.
 */
describe("onCatch", () => {
  const chainOf = (...defs: Record<string, unknown>[]) =>
    defs.map((definition, at) => ({
      id: `/r${at}`,
      fullPath: `/r${at}`,
      definition,
    })) as never as Parameters<typeof errorFallbackFor>[0];

  test("every route from the failing depth outward is told, once", () => {
    const seen: string[] = [];
    const chain = chainOf(
      { onCatch: (e: Error) => seen.push(`root:${e.message}`) },
      {
        onCatch: (e: Error) => seen.push(`leaf:${e.message}`),
        errorComponent: (() => null) as never,
      },
    );
    const fallback = errorFallbackFor(chain, 1, () => ({}));
    const boom = new Error("boom");

    fallback(
      null,
      () => boom,
      () => {},
    );
    // A re-render of the SAME error reports nothing further.
    fallback(
      null,
      () => boom,
      () => {},
    );
    expect(seen).toEqual(["leaf:boom", "root:boom"]);

    // A different error is a different report.
    fallback(
      null,
      () => new Error("again"),
      () => {},
    );
    expect(seen).toEqual(["leaf:boom", "root:boom", "leaf:again", "root:again"]);
  });

  /** A `notFound()` is an ANSWER, not a failure, and is not reported. */
  test("a notFound is not a catch", () => {
    const seen: string[] = [];
    const chain = chainOf({
      onCatch: (e: Error) => seen.push(e.message),
      notFoundComponent: (() => null) as never,
    });
    errorFallbackFor(chain, 0, () => ({}))(
      null,
      () => new NotFound("gone"),
      () => {},
    );
    expect(seen).toEqual([]);
  });
});
