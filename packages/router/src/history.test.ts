import { describe, expect, test } from "bun:test";

import {
  addBase,
  browserHistory,
  href,
  memoryHistory,
  normalizeBase,
  parseLocation,
  stripBase,
} from "./history.ts";

describe("parseLocation", () => {
  test("splits path, query and hash", () => {
    const l = parseLocation("/users/7?tab=posts#comments");
    expect(l.pathname).toBe("/users/7");
    expect(l.search).toBe("?tab=posts");
    expect(l.hash).toBe("#comments");
    expect(href(l)).toBe("/users/7?tab=posts#comments");
  });

  test("a `?` inside the fragment stays in the fragment", () => {
    const l = parseLocation("/a#b?c");
    expect(l.pathname).toBe("/a");
    expect(l.search).toBe("");
    expect(l.hash).toBe("#b?c");
  });

  test("every entry gets a distinct key, so a repeat navigation is still one", () => {
    expect(parseLocation("/a").key).not.toBe(parseLocation("/a").key);
  });
});

describe("base", () => {
  test("stripped on a segment boundary only", () => {
    expect(stripBase("/app/users", "/app")).toBe("/users");
    expect(stripBase("/app", "/app")).toBe("/");
    // NOT under the base: `/application` merely starts with the same letters.
    expect(stripBase("/application", "/app")).toBe("/application");
  });

  test("added back, and the two are inverses", () => {
    for (const [path, base] of [
      ["/users", "/app"],
      ["/", "/app"],
      ["/users", ""],
    ] as const) {
      expect(stripBase(addBase(path, base), base)).toBe(path);
    }
  });

  test("normalized", () => {
    expect(normalizeBase("app")).toBe("/app");
    expect(normalizeBase("/app/")).toBe("/app");
    expect(normalizeBase("/")).toBe("");
  });
});

describe("memoryHistory", () => {
  test("push records, and back and forward work", () => {
    // The old `memoryHistory.push` and `watch` were both no-ops, so a
    // `MemoryRouter` had no history at all — and every test in that package
    // drove one, so the suite validated navigation against a history that could
    // not remember it.
    const h = memoryHistory();
    const seen: string[] = [];
    h.subscribe((location, action) => seen.push(`${action}:${location.pathname}`));

    h.push("/a");
    h.push("/b");
    expect(h.current().pathname).toBe("/b");

    h.go(-1);
    expect(h.current().pathname).toBe("/a");
    h.go(1);
    expect(h.current().pathname).toBe("/b");

    expect(seen).toEqual(["push:/a", "push:/b", "pop:/a", "pop:/b"]);
  });

  test("replace does not grow the stack", () => {
    const h = memoryHistory();
    h.push("/a");
    h.push("/b", { replace: true });
    expect(h.current().pathname).toBe("/b");
    h.go(-1);
    expect(h.current().pathname).toBe("/");
  });

  test("a push truncates the forward stack", () => {
    const h = memoryHistory({ initial: ["/a", "/b", "/c"], index: 2 });
    h.go(-2);
    expect(h.current().pathname).toBe("/a");
    h.push("/d");
    h.go(1);
    // Nothing forward of `/d`: `/b` and `/c` are gone, not resurrected.
    expect(h.current().pathname).toBe("/d");
  });

  test("go past either end does nothing", () => {
    const h = memoryHistory();
    h.go(-5);
    expect(h.current().pathname).toBe("/");
    h.go(5);
    expect(h.current().pathname).toBe("/");
  });

  test("state rides along", () => {
    const h = memoryHistory();
    h.push("/a", { state: { from: "test" } });
    expect(h.current().state).toEqual({ from: "test" });
  });

  test("unsubscribe stops delivery", () => {
    const h = memoryHistory();
    let count = 0;
    const off = h.subscribe(() => count++);
    h.push("/a");
    off();
    h.push("/b");
    expect(count).toBe(1);
  });
});

describe("browserHistory", () => {
  test("a base is stripped on read and added on write, exactly once", () => {
    // The bug this pins: the old router's document-click interceptor handed the
    // raw `href` attribute to a `push` that prepends the base, so an authored
    // `<a href="/app/users">` under `base: "/app"` navigated to
    // `/app/app/users`. Everything inside the router is base-relative, so a
    // base-relative push is the only shape there is.
    window.history.replaceState(null, "", "/app/users");
    const controller = new AbortController();
    const h = browserHistory({ base: "/app", signal: controller.signal });

    expect(h.current().pathname).toBe("/users");

    h.push("/users/7");
    expect(window.location.pathname).toBe("/app/users/7");
    expect(h.current().pathname).toBe("/users/7");

    controller.abort();
  });

  test("the listener dies with the signal", () => {
    window.history.replaceState(null, "", "/");
    const controller = new AbortController();
    const h = browserHistory({ signal: controller.signal });
    let count = 0;
    h.subscribe(() => count++);

    controller.abort();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(count).toBe(0);
  });
});
