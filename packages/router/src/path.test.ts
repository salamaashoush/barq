import { describe, expect, test } from "bun:test";

import {
  applyTrailingSlash,
  interpolate,
  isUnder,
  joinPattern,
  leavesTheApp,
  normalize,
  parsePattern,
  resolvePath,
  splitPath,
  withoutTrailingSlash,
} from "./path.ts";

describe("splitPath / normalize", () => {
  test("empty segments are dropped and a trailing slash does not survive", () => {
    expect(splitPath("/a//b/")).toEqual(["a", "b"]);
    expect(normalize("//a//b//")).toBe("/a/b");
    expect(normalize("")).toBe("/");
    expect(normalize("/")).toBe("/");
  });
});

describe("parsePattern", () => {
  test("static, param and splat", () => {
    expect(parsePattern("/users/$id/files/$")).toEqual([
      { kind: "static", value: "users" },
      { kind: "param", name: "id", prefix: "", suffix: "" },
      { kind: "static", value: "files" },
      { kind: "splat", name: "_splat", prefix: "", suffix: "" },
    ]);
  });

  test("a literal regex metacharacter is just a character", () => {
    // `packages/extra` built a `RegExp` per route with `*`, `+` and `?` left
    // OUT of its escape class, so `compilePath("/c++")` threw
    // `SyntaxError: nothing to repeat`. There is no regex here to break.
    expect(parsePattern("/c++")).toEqual([{ kind: "static", value: "c++" }]);
    expect(parsePattern("/a.b")).toEqual([{ kind: "static", value: "a.b" }]);
    expect(parsePattern("/who?")).toEqual([{ kind: "static", value: "who?" }]);
  });
});

describe("joinPattern", () => {
  test("a relative child extends its parent", () => {
    expect(joinPattern("/users", "$id")).toBe("/users/$id");
    expect(joinPattern("", "/users")).toBe("/users");
  });

  test("an absolute child replaces it", () => {
    expect(joinPattern("/settings", "/logout")).toBe("/logout");
  });

  test("an omitted or empty child is the parent's own path", () => {
    expect(joinPattern("/users", undefined)).toBe("/users");
    expect(joinPattern("/users", "")).toBe("/users");
  });
});

describe("interpolate", () => {
  test("fills parameters and encodes them", () => {
    expect(interpolate("/users/$id", { id: "7" })).toBe("/users/7");
    expect(interpolate("/q/$term", { term: "hello world" })).toBe("/q/hello%20world");
  });

  test("a parameter cannot invent a segment", () => {
    // The value is one segment by construction: a `/` inside it is encoded, so
    // `id` cannot smuggle a path in and reach a different route.
    expect(interpolate("/users/$id", { id: "7/admin" })).toBe("/users/7%2Fadmin");
  });

  test("a splat is spliced in whole", () => {
    expect(interpolate("/files/$", { _splat: "a/b/c" })).toBe("/files/a/b/c");
    expect(interpolate("/files/$", { _splat: "" })).toBe("/files");
  });

  test("a missing parameter is an error naming itself", () => {
    expect(() => interpolate("/users/$id", {})).toThrow(/missing route parameter "id"/);
  });
});

describe("leavesTheApp", () => {
  test("schemes, protocol-relative hosts and bare fragments", () => {
    for (const to of ["https://x.com", "mailto:a@b.c", "tel:123", "//cdn.example", "#top"]) {
      expect(leavesTheApp(to), to).toBe(true);
    }
    for (const to of ["/users", "users", "./users", "../users"]) {
      expect(leavesTheApp(to), to).toBe(false);
    }
  });
});

describe("resolvePath", () => {
  test("absolute wins, relative extends", () => {
    expect(resolvePath("/x", "/a/b")).toBe("/x");
    expect(resolvePath("child", "/parent")).toBe("/parent/child");
    expect(resolvePath("./child", "/parent")).toBe("/parent/child");
  });

  test("`..` pops a segment and over-popping clamps", () => {
    expect(resolvePath("../sibling", "/a/b")).toBe("/a/sibling");
    expect(resolvePath("../../../x", "/a")).toBe("/x");
    expect(resolvePath("..", "/a/b")).toBe("/a");
  });

  test("something that leaves the app is returned untouched", () => {
    // Treating these as relative produced `/a/https:/example.com/x`.
    expect(resolvePath("https://example.com/x", "/a")).toBe("https://example.com/x");
    expect(resolvePath("#frag", "/a")).toBe("#frag");
  });
});

describe("isUnder", () => {
  test("matches on a segment boundary, not a prefix", () => {
    expect(isUnder("/user/7", "/user")).toBe(true);
    expect(isUnder("/user", "/user")).toBe(true);
    // The one that makes `<NavLink>` correct.
    expect(isUnder("/user-settings", "/user")).toBe(false);
    expect(isUnder("/anything", "/")).toBe(true);
  });
});

/**
 * The braced grammar, which is TanStack's and which barq did not have.
 *
 * A prefix or a suffix is what lets a route own `/files/report.csv` without
 * owning `/files/report`; an optional segment is what lets one pattern serve
 * `/posts/detail` and `/posts/tech/detail` rather than two routes sharing a
 * component.
 */
describe("braced segments", () => {
  test("a parameter may carry a prefix and a suffix", () => {
    expect(parsePattern("/files/{$name}.csv")).toEqual([
      { kind: "static", value: "files" },
      { kind: "param", name: "name", prefix: "", suffix: ".csv" },
    ]);
    expect(parsePattern("/on-{$id}")).toEqual([
      { kind: "param", name: "id", prefix: "on-", suffix: "" },
    ]);
  });

  test("`{-$name}` is optional", () => {
    expect(parsePattern("/posts/{-$category}/detail")).toEqual([
      { kind: "static", value: "posts" },
      { kind: "optional", name: "category", prefix: "", suffix: "" },
      { kind: "static", value: "detail" },
    ]);
  });

  test("`{$}` is a splat that may be decorated too", () => {
    expect(parsePattern("/files/pre{$}post")).toEqual([
      { kind: "static", value: "files" },
      { kind: "splat", name: "_splat", prefix: "pre", suffix: "post" },
    ]);
  });

  /**
   * A pattern usually comes from a FILENAME, so a brace somebody wrote by
   * accident must not fail the build. It becomes text, and the route simply
   * does not match — visible, and local to the one route.
   */
  test("a malformed brace is a literal", () => {
    for (const raw of ["{", "{}", "{-$}", "{$}extra}", "{oops}"]) {
      const [segment] = parsePattern(`/${raw}`);
      if (raw === "{$}extra}") {
        expect(segment).toEqual({ kind: "splat", name: "_splat", prefix: "", suffix: "extra}" });
        continue;
      }
      expect(segment?.kind).toBe("static");
    }
  });
});

describe("interpolate, with the braced forms", () => {
  test("a prefix and a suffix ride out with the value", () => {
    expect(interpolate("/files/{$name}.csv", { name: "report" })).toBe("/files/report.csv");
    expect(interpolate("/on-{$id}", { id: "7" })).toBe("/on-7");
  });

  test("an optional with no value contributes no segment", () => {
    expect(interpolate("/posts/{-$category}/detail", {})).toBe("/posts/detail");
    expect(interpolate("/posts/{-$category}/detail", { category: "tech" })).toBe(
      "/posts/tech/detail",
    );
  });

  /** A REQUIRED parameter with no value is still an error. */
  test("a required parameter still refuses to go missing", () => {
    expect(() => interpolate("/users/$id", {})).toThrow(/missing route parameter/);
  });

  test("a decorated splat wraps its first and last segment", () => {
    expect(interpolate("/files/pre{$}post", { _splat: "a/b" })).toBe("/files/prea/bpost");
  });
});

describe("trailing slash", () => {
  test("never strips, always adds, preserve defers to the caller", () => {
    expect(applyTrailingSlash("/about", "never", true)).toBe("/about");
    expect(applyTrailingSlash("/about/", "never", true)).toBe("/about/");
    expect(applyTrailingSlash("/about", "always", false)).toBe("/about/");
    expect(applyTrailingSlash("/about", "preserve", true)).toBe("/about/");
    expect(applyTrailingSlash("/about", "preserve", false)).toBe("/about");
  });

  test("the root never grows one", () => {
    // `//about` is a protocol-relative URL to a browser, so a slashed root is
    // not a cosmetic difference — it is a different origin.
    for (const mode of ["always", "preserve", "never"] as const) {
      expect(applyTrailingSlash("/", mode, true)).toBe("/");
    }
  });

  test("withoutTrailingSlash leaves the root alone", () => {
    expect(withoutTrailingSlash("/about/")).toBe("/about");
    expect(withoutTrailingSlash("/about")).toBe("/about");
    expect(withoutTrailingSlash("/")).toBe("/");
  });
});
