/**
 * Search validation, and the middlewares that build a location.
 *
 * The router-level behaviour (inheritance across the chain, a failure landing on
 * the route's own boundary) is in `router.test.ts`; this file is the unit half.
 */

import { describe, expect, test } from "bun:test";

import {
  SearchParamError,
  applySearchMiddleware,
  retainSearchParams,
  searchRecord,
  stripSearchParams,
  toSearchString,
  validateSearch,
} from "./search.ts";

describe("searchRecord", () => {
  test("a repeated key becomes an array, a single one stays a string", () => {
    expect(searchRecord(new URLSearchParams("a=1&b=2&b=3"))).toEqual({ a: "1", b: ["2", "3"] });
  });

  test("an empty query is an empty record, not undefined", () => {
    expect(searchRecord(new URLSearchParams(""))).toEqual({});
  });
});

describe("validateSearch", () => {
  test("a plain function is called with the search", () => {
    const out = validateSearch((input) => ({ page: Number(input.page ?? 1) }), { page: "3" });
    expect(out).toEqual({ page: 3 });
  });

  test("a .parse object is used", () => {
    const out = validateSearch({ parse: (input) => ({ seen: input }) }, { q: "x" });
    expect(out).toEqual({ seen: { q: "x" } });
  });

  test("a Standard Schema is probed FIRST, ahead of .parse", () => {
    // A zod v4 schema has both. The Standard Schema path is the one that reports
    // issues rather than throwing a vendor error, so it has to win.
    const both = {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: () => ({ value: { via: "standard" } }),
      },
      parse: () => ({ via: "parse" }),
    };
    expect(validateSearch(both as never, {})).toEqual({ via: "standard" });
  });

  test("issues become a SearchParamError carrying them", () => {
    const schema = {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: () => ({ issues: [{ message: "page must be a number" }] }),
      },
    };
    expect(() => validateSearch(schema as never, {})).toThrow(SearchParamError);
    try {
      validateSearch(schema, {});
    } catch (error) {
      expect((error as SearchParamError).issues).toEqual([{ message: "page must be a number" }]);
    }
  });

  test("an async validator is REFUSED, not awaited", () => {
    // A location that commits before its own search is validated has already
    // rendered the wrong page.
    const schema = {
      "~standard": {
        version: 1 as const,
        vendor: "test",
        validate: () => Promise.resolve({ value: {} }),
      },
    };
    expect(() => validateSearch(schema as never, {})).toThrow(/promise/);
  });

  test("no validator means no slice, not an empty search", () => {
    expect(validateSearch(undefined, { a: "1" })).toEqual({});
  });
});

describe("search middlewares", () => {
  const run = (
    middlewares: Parameters<typeof applySearchMiddleware>[0],
    current: Record<string, unknown>,
    intent: Record<string, unknown>,
    defaults = new Map<string, unknown>(),
  ): Record<string, unknown> => applySearchMiddleware(middlewares, current, intent, defaults);

  test("with no middleware the caller's intent is the whole answer", () => {
    expect(run([], { keep: "1" }, { fresh: "2" })).toEqual({ fresh: "2" });
  });

  test("retainSearchParams carries a key the navigation did not mention", () => {
    expect(run([retainSearchParams(["theme"])], { theme: "dark" }, { page: "2" })).toEqual({
      page: "2",
      theme: "dark",
    });
  });

  test("an EXPLICIT value beats a retained one, so a key can still be cleared", () => {
    expect(run([retainSearchParams(["theme"])], { theme: "dark" }, { theme: undefined })).toEqual({
      theme: undefined,
    });
  });

  test("retainSearchParams(true) carries everything not mentioned", () => {
    expect(run([retainSearchParams(true)], { a: "1", b: "2" }, { b: "9" })).toEqual({
      a: "1",
      b: "9",
    });
  });

  test("stripSearchParams(true) empties the query", () => {
    expect(run([stripSearchParams(true)], { a: "1" }, { a: "1", b: "2" })).toEqual({});
  });

  test("stripSearchParams([...]) drops the named keys", () => {
    expect(run([stripSearchParams(["b"])], {}, { a: "1", b: "2" })).toEqual({ a: "1" });
  });

  test("stripSearchParams({...}) drops a key that equals its default", () => {
    expect(run([stripSearchParams({ page: 1 })], {}, { page: 1, q: "x" })).toEqual({ q: "x" });
    expect(run([stripSearchParams({ page: 1 })], {}, { page: 2 })).toEqual({ page: 2 });
  });

  test("middlewares compose outermost-first", () => {
    const out = run(
      [retainSearchParams(["theme"]), stripSearchParams(["drop"])],
      { theme: "dark" },
      { drop: "x", keep: "y" },
    );
    expect(out).toEqual({ keep: "y", theme: "dark" });
  });
});

describe("toSearchString", () => {
  test("undefined, null and empty drop their key", () => {
    expect(toSearchString({ a: "1", b: undefined, c: null, d: "" })).toBe("?a=1");
  });

  test("an array becomes repeated keys, which searchRecord reads back", () => {
    const query = toSearchString({ tag: ["a", "b"] });
    expect(query).toBe("?tag=a&tag=b");
    expect(searchRecord(new URLSearchParams(query))).toEqual({ tag: ["a", "b"] });
  });

  test("encode and decode are a FIXPOINT, which TanStack's are not", () => {
    // Theirs decodes `?k=a&k=b` to an array and re-encodes it as one JSON
    // string, so decode-then-encode is not identity.
    for (const query of ["?a=1", "?a=1&b=2", "?tag=a&tag=b", ""]) {
      const once = toSearchString(searchRecord(new URLSearchParams(query)));
      const twice = toSearchString(searchRecord(new URLSearchParams(once)));
      expect(twice).toBe(once);
    }
  });

  test("nothing at all is an empty string, not a bare question mark", () => {
    expect(toSearchString({})).toBe("");
  });
});
