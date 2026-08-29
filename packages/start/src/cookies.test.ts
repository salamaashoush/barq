/**
 * Cookies, and the rules a browser enforces in silence.
 *
 * Every refusal below is a combination some browser drops WITHOUT SAYING SO, so
 * the test that matters is not that the string comes out right — it is that the
 * impossible ones throw instead of producing a cookie that never arrives.
 */

import { describe, expect, test } from "bun:test";

import { deleteCookieLine, parseCookies, serializeCookie } from "./cookies.ts";

describe("parsing", () => {
  test("a plain header becomes a record", () => {
    expect(parseCookies("a=1; b=2")).toEqual({ a: "1", b: "2" });
  });

  test("nothing at all is an empty record, not a throw", () => {
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies("")).toEqual({});
  });

  test("the value keeps its `=`, because only the FIRST one separates", () => {
    // A base64 token ends in padding, and splitting on every `=` truncates it.
    expect(parseCookies("t=YWJjZA==")).toEqual({ t: "YWJjZA==" });
  });

  test("FIRST wins on a duplicate, which is what a browser sends", () => {
    // One cookie set at two paths arrives twice; the more specific path is sent
    // first, and that is the one that was meant.
    expect(parseCookies("sid=specific; sid=root")).toEqual({ sid: "specific" });
  });

  test("percent-encoding is decoded, and a malformed one comes back RAW", () => {
    expect(parseCookies("n=a%20b")).toEqual({ n: "a b" });
    // It came off the wire. A client may put anything there, and one bad cookie
    // must not take the request down.
    expect(parseCookies("n=%E0%A4%A")).toEqual({ n: "%E0%A4%A" });
  });

  test("a quoted value loses its quotes", () => {
    expect(parseCookies('n="v"')).toEqual({ n: "v" });
  });

  test("a pair with no `=` is skipped rather than becoming an empty name", () => {
    expect(parseCookies("broken; a=1")).toEqual({ a: "1" });
  });

  test("the record has NO prototype, so a cookie named `constructor` is inert", () => {
    // A client-supplied name used as a property access is CVE-2025-55182's
    // shape. `Object.create(null)` has no chain to walk into.
    const cookies = parseCookies("constructor=x");
    expect(cookies.constructor).toBe("x" as never);
    expect(Object.getPrototypeOf(cookies)).toBeNull();
  });
});

describe("serializing", () => {
  test("a bare cookie is name, value and nothing else", () => {
    expect(serializeCookie("sid", "abc")).toBe("sid=abc");
  });

  test("the value is percent-encoded, because `;` would truncate the cookie", () => {
    expect(serializeCookie("n", "a;b")).toBe("n=a%3Bb");
  });

  test("`encode` opts out, for a value already in a cookie-safe alphabet", () => {
    expect(serializeCookie("n", "a.b-c_d", { encode: (v) => v })).toBe("n=a.b-c_d");
  });

  test("the attributes come out in a shape a browser reads", () => {
    const line = serializeCookie("sid", "abc", {
      httpOnly: true,
      secure: true,
      path: "/",
      sameSite: "lax",
      maxAge: 3600,
      domain: "example.com",
      priority: "high",
      partitioned: true,
    });
    expect(line).toContain("Max-Age=3600");
    expect(line).toContain("Domain=example.com");
    expect(line).toContain("Path=/");
    expect(line).toContain("HttpOnly");
    expect(line).toContain("Secure");
    expect(line).toContain("Partitioned");
    expect(line).toContain("Priority=High");
    expect(line).toContain("SameSite=Lax");
  });

  test("`expires` is an IMF-fixdate, which is the only format RFC 6265 requires", () => {
    const line = serializeCookie("n", "v", { expires: new Date(Date.UTC(2030, 0, 2, 3, 4, 5)) });
    expect(line).toContain("Expires=Wed, 02 Jan 2030 03:04:05 GMT");
  });
});

/**
 * The refusals. Each of these is a cookie a browser would DROP, and a dropped
 * cookie is indistinguishable from one the server never set.
 */
describe("the combinations a browser drops are refused here instead", () => {
  test("SameSite=None without Secure — Chrome 80 made this a hard drop", () => {
    expect(() => serializeCookie("n", "v", { sameSite: "none" })).toThrow(/SameSite=None/);
    expect(() => serializeCookie("n", "v", { sameSite: "none", secure: true })).not.toThrow();
  });

  test("__Host- needs Secure, Path=/ and NO Domain", () => {
    const ok = { secure: true, path: "/" } as const;
    expect(() => serializeCookie("__Host-sid", "v", ok)).not.toThrow();
    expect(() => serializeCookie("__Host-sid", "v", { ...ok, secure: false })).toThrow(/__Host-/);
    expect(() => serializeCookie("__Host-sid", "v", { ...ok, path: "/app" })).toThrow(/__Host-/);
    expect(() => serializeCookie("__Host-sid", "v", { ...ok, domain: "x.com" })).toThrow(/__Host-/);
    // …and with no path at all, which is the easiest one to write by accident.
    expect(() => serializeCookie("__Host-sid", "v", { secure: true })).toThrow(/__Host-/);
  });

  test("__Secure- needs Secure", () => {
    expect(() => serializeCookie("__Secure-sid", "v")).toThrow(/__Secure-/);
    expect(() => serializeCookie("__Secure-sid", "v", { secure: true })).not.toThrow();
  });

  test("a non-integer maxAge is ignored by a browser, so it is refused here", () => {
    // Ignoring the attribute turns a dated cookie into a session one, silently.
    expect(() => serializeCookie("n", "v", { maxAge: 1.5 })).toThrow(/non-integer maxAge/);
    expect(() => serializeCookie("n", "v", { maxAge: 0 })).not.toThrow();
  });

  test("an invalid name or a poisoned attribute cannot forge a second cookie", () => {
    expect(() => serializeCookie("a b", "v")).toThrow(/valid cookie name/);
    expect(() => serializeCookie("a;b", "v")).toThrow(/valid cookie name/);
    expect(() => serializeCookie("", "v")).toThrow(/valid cookie name/);
    // The attribute check is what stops `path` smuggling `; HttpOnly` off.
    expect(() => serializeCookie("n", "v", { path: "/; Domain=evil.com" })).toThrow(/terminate/);
    expect(() => serializeCookie("n", "v", { domain: "a;b" })).toThrow(/terminate/);
  });

  test("an invalid expires is refused rather than serialized as `Invalid Date`", () => {
    expect(() => serializeCookie("n", "v", { expires: new Date("nonsense") })).toThrow(/expires/);
  });

  test("`encode` opting out cannot smuggle a separator either", () => {
    expect(() => serializeCookie("n", "a;b", { encode: (v) => v })).toThrow(/cannot carry/);
  });
});

describe("deleting", () => {
  test("a delete is an expired set, both ways, because browsers differ", () => {
    const line = deleteCookieLine("sid");
    expect(line).toContain("Max-Age=0");
    expect(line).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(line.startsWith("sid=;")).toBe(true);
  });

  test("path and domain ride through, because a mismatch deletes NOTHING", () => {
    // The browser matches on them; a `deleteCookie("sid")` against a cookie set
    // at `/app` is a silent no-op that leaves the session live.
    const line = deleteCookieLine("sid", { path: "/app", domain: "example.com" });
    expect(line).toContain("Path=/app");
    expect(line).toContain("Domain=example.com");
  });
});
