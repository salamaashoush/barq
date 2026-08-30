/**
 * `<Link>`'s prop surface, at the two functions both backends share.
 *
 * `linkHref` builds the target and `linkIsActive` decides "you are here", and
 * the DOM path and the string path call exactly these — so testing them tests
 * both, without a DOM.
 */

import { describe, expect, test } from "bun:test";

import { linkHref, linkIsActive } from "./components.ts";
import { memoryHistory } from "./history.ts";
import { type AnyRouteDefinition } from "./route.ts";
import { createRouter } from "./router.ts";

const table = [
  { path: "/", component: (() => null) as never },
  { path: "/posts", component: (() => null) as never },
  { path: "/posts/$id", component: (() => null) as never },
] as never as AnyRouteDefinition[];

const at = (initial: string, trailingSlash?: "always" | "never" | "preserve") =>
  createRouter({
    routeTree: table,
    history: memoryHistory({ initial: [initial] }),
    trailingSlash,
  });

/** Props reach these functions already read, so a plain object stands in. */
const href = (state: ReturnType<typeof at>, props: Record<string, unknown>): string =>
  linkHref(state, props as never);

describe("what a link addresses", () => {
  test("a hash rides into the href", () => {
    expect(href(at("/"), { to: "/posts", hash: "install" })).toBe("/posts#install");
    // A `#` the author already wrote is not doubled.
    expect(href(at("/"), { to: "/posts", hash: "#install" })).toBe("/posts#install");
  });

  test("a hash sits after the query", () => {
    expect(href(at("/"), { to: "/posts", search: { tab: "a" }, hash: "x" })).toBe("/posts?tab=a#x");
  });

  /**
   * The functional `search`, which is the reason to have one: a link that edits
   * one key keeps the rest instead of replacing the query.
   */
  test("a functional search is handed the current query", () => {
    const state = at("/posts?tab=a&page=1");
    expect(
      href(state, { to: "/posts", search: (c: Record<string, string>) => ({ ...c, page: "2" }) }),
    ).toBe("/posts?tab=a&page=2");
  });

  test("`from` pins what a relative `to` resolves against", () => {
    const state = at("/posts/7");
    // Without `from`, against the current location.
    expect(href(state, { to: "../" })).toBe("/posts");
    // With it, against what the link says instead.
    expect(href(state, { to: "../", from: "/posts/7/edit" })).toBe("/posts/7");
  });
});

describe("what counts as active", () => {
  test("the default is a segment-prefix match on the pathname", () => {
    const state = at("/posts/7");
    expect(linkIsActive(state, "/posts", false)).toBe(true);
    expect(linkIsActive(state, "/posts", true)).toBe(false);
  });

  /**
   * The bug `activeOptions` closes: a paginating nav marked every link active
   * because only the pathname was compared.
   */
  test("`includeSearch` makes the query participate", () => {
    const state = at("/posts?tab=a&page=2");
    expect(linkIsActive(state, "/posts?page=2", true, { includeSearch: true })).toBe(true);
    expect(linkIsActive(state, "/posts?page=3", true, { includeSearch: true })).toBe(false);
    // Without it the query is ignored, which is the old behaviour.
    expect(linkIsActive(state, "/posts?page=3", true)).toBe(true);
  });

  /** A SUBSET, so a tab link is active beside a paginator. */
  test("`includeSearch` is a subset test, not an equality", () => {
    const state = at("/posts?tab=a&page=2");
    expect(linkIsActive(state, "/posts?tab=a", true, { includeSearch: true })).toBe(true);
  });

  test("`includeHash` makes the fragment participate", () => {
    const state = at("/posts#usage");
    expect(linkIsActive(state, "/posts#usage", true, { includeHash: true })).toBe(true);
    expect(linkIsActive(state, "/posts#install", true, { includeHash: true })).toBe(false);
  });

  test("`exact` is `end` under the other name", () => {
    const state = at("/posts/7");
    expect(linkIsActive(state, "/posts", false, { exact: true })).toBe(false);
    expect(linkIsActive(state, "/posts/7", false, { exact: true })).toBe(true);
  });

  /**
   * A link carrying a query is compared on its PATHNAME. Before the split it
   * compared the whole string and never matched.
   */
  test("a link with a query is still active on its path", () => {
    const state = at("/posts");
    expect(linkIsActive(state, "/posts?tab=a", true)).toBe(true);
  });
});

describe("trailingSlash", () => {
  test('"always" writes one, and the query still follows the path', () => {
    expect(href(at("/", "always"), { to: "/posts" })).toBe("/posts/");
    expect(href(at("/", "always"), { to: "/posts", search: { tab: "a" } })).toBe("/posts/?tab=a");
    expect(href(at("/", "always"), { to: "/posts/$id", params: { id: "7" } })).toBe("/posts/7/");
    expect(href(at("/", "always"), { to: "/" })).toBe("/");
  });

  test('"preserve" writes what the caller wrote', () => {
    expect(href(at("/", "preserve"), { to: "/posts/" })).toBe("/posts/");
    expect(href(at("/", "preserve"), { to: "/posts" })).toBe("/posts");
  });

  test('"never" is the default and is what barq always did', () => {
    expect(href(at("/"), { to: "/posts/" })).toBe("/posts");
    expect(href(at("/", "never"), { to: "/posts/" })).toBe("/posts");
  });

  test("active ignores the slash on either side", () => {
    // The location a browser arrived at is whatever was typed, so neither
    // spelling of "here" may decide whether a link is lit.
    expect(linkIsActive(at("/posts/"), "/posts", true)).toBe(true);
    expect(linkIsActive(at("/posts"), "/posts/", true)).toBe(true);
    expect(linkIsActive(at("/posts/"), "/posts/", false)).toBe(true);
    expect(linkIsActive(at("/posts/"), "/posts/$id", true)).toBe(false);
  });
});

describe("navigate honours the policy", () => {
  test('"always" pushes the slashed spelling', async () => {
    const router = at("/", "always");
    await router.navigate("/posts");
    expect(router.location().pathname).toBe("/posts/");
    await router.navigate("/");
    expect(router.location().pathname).toBe("/");
  });

  test("the slashed spelling still matches the route", async () => {
    const router = at("/", "always");
    await router.navigate("/posts/7");
    expect(router.location().pathname).toBe("/posts/7/");
    expect(router.params()).toEqual({ id: "7" });
  });

  test('"preserve" keeps a relative navigation as written', async () => {
    const router = at("/posts", "preserve");
    await router.navigate("7/");
    expect(router.location().pathname).toBe("/posts/7/");
    await router.navigate("/posts/8");
    expect(router.location().pathname).toBe("/posts/8");
  });
});
