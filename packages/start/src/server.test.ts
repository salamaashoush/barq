import { afterEach, describe, expect, test } from "bun:test";

import {
  RPC_PREFIX,
  type StandardSchema,
  UncheckedInputError,
  createServerFn,
  isServerFn,
  serverRpc,
} from "./index.ts";
import { handleServerFn, mount, mounted, originAllowed, unmountAll } from "./server.ts";

afterEach(unmountAll);

const ORIGIN = "https://app.test";

const post = (id: string, input: unknown, headers: Record<string, string> = {}): Request =>
  new Request(`${ORIGIN}${RPC_PREFIX}${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: JSON.stringify({ input }),
  });

/** A Standard Schema without pulling a validation library in to test one. */
const positiveInt: StandardSchema<unknown, number> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value) =>
      typeof value === "number" && Number.isInteger(value) && value > 0
        ? { value }
        : { issues: [{ message: "expected a positive integer" }] },
  },
};

const define = <In, Out>(
  id: string,
  fn: (input: In) => Out,
  schema?: StandardSchema<unknown, In>,
) =>
  serverRpc<In, Out>(
    { id },
    {
      validator: (schema ?? null) as never,
      handler: fn as never,
    },
  );

describe("input is fail-closed", () => {
  /**
   * The default every other surveyed framework gets wrong: with no validator,
   * raw deserialized input reaches the handler. Here it is a 400, and opening
   * the channel costs a schema or the literal 'unchecked'.
   */
  test("a function with no validator refuses any argument", async () => {
    mount(define("no-validator", (input: unknown) => ({ saw: input })) as never);

    const response = await handleServerFn(post("no-validator", { evil: true }));
    expect(response?.status).toBe(400);
  });

  test("…and still accepts a call with no argument", async () => {
    mount(define("nullary", () => "ok") as never);

    const response = await handleServerFn(post("nullary", undefined));
    expect(response?.status).toBe(200);
    expect(await response?.json()).toBe("ok");
  });

  test("a schema rejects bad input with 400 and no detail", async () => {
    mount(define("checked", (n: number) => n * 2, positiveInt) as never);

    const bad = await handleServerFn(post("checked", -1));
    expect(bad?.status).toBe(400);
    expect(await bad?.json()).toEqual({ error: "invalid input" });

    const good = await handleServerFn(post("checked", 21));
    expect(await good?.json()).toBe(42);
  });

  test("'unchecked' is the opt-out, and has to be typed out", async () => {
    const fn = serverRpc<unknown, unknown>(
      { id: "raw" },
      {
        validator: "unchecked",
        handler: (input) => ({ saw: input }),
      },
    );
    mount(fn as never);

    const response = await handleServerFn(post("raw", { anything: 1 }));
    expect(await response?.json()).toEqual({ saw: { anything: 1 } });
  });

  test("the uncompiled builder enforces the same rule in-process", async () => {
    const fn = createServerFn().handler(() => "ran");
    expect(isServerFn(fn)).toBe(true);
    await expect(fn("an argument" as never)).rejects.toBeInstanceOf(UncheckedInputError);
  });
});

describe("the request is checked before the handler runs", () => {
  test("GET is refused: a mutation must not be reachable by navigation", async () => {
    mount(define("m", () => "ran") as never);
    const response = await handleServerFn(
      new Request(`${ORIGIN}${RPC_PREFIX}m`, { method: "GET", headers: { origin: ORIGIN } }),
    );
    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("POST");
  });

  test("a cross-origin call is refused", async () => {
    mount(define("m", () => "ran") as never);
    const response = await handleServerFn(post("m", undefined, { origin: "https://evil.test" }));
    expect(response?.status).toBe(403);
  });

  /** A sandboxed iframe sends the literal string; treating it as absent is CVE-2026-27978. */
  test("Origin: null is refused rather than treated as absent", () => {
    const request = new Request(`${ORIGIN}${RPC_PREFIX}m`, {
      method: "POST",
      headers: { origin: "null" },
    });
    expect(originAllowed(request)).toBe(false);
  });

  /**
   * `Origin` is legitimately absent on some same-origin requests, so the
   * fallback decides. Waku's post-CVE shape, and stricter than Next.js, which
   * warns and proceeds.
   */
  test("with no Origin, Sec-Fetch-Site decides, and its absence is a refusal", () => {
    const withSite = (site?: string) =>
      new Request(`${ORIGIN}${RPC_PREFIX}m`, {
        method: "POST",
        headers: site === undefined ? {} : { "sec-fetch-site": site },
      });
    expect(originAllowed(withSite("same-origin"))).toBe(true);
    expect(originAllowed(withSite("none"))).toBe(true);
    expect(originAllowed(withSite("cross-site"))).toBe(false);
    expect(originAllowed(withSite())).toBe(false);
  });

  test("allowedOrigins widens same-origin without replacing it", () => {
    const request = post("m", undefined, { origin: "https://admin.test" });
    expect(originAllowed(request)).toBe(false);
    expect(originAllowed(request, { allowedOrigins: ["https://admin.test"] })).toBe(true);
  });
});

describe("the registry", () => {
  /**
   * CVE-2025-55182 was CVSS 10.0 and was a client-supplied name used as a raw
   * property access: `constructor` yielded `Function`. A Map has no prototype
   * chain to reach into.
   */
  test("a prototype name is not callable", async () => {
    mount(define("real", () => "ran") as never);
    for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const response = await handleServerFn(post(name, undefined));
      expect(response?.status, name).toBe(404);
    }
  });

  test("export-ness decides the surface, and it is reviewable", () => {
    mount(define("a", () => 1) as never);
    mount(define("b", () => 2) as never);
    // A server function that is never mounted has no id on the wire, and is
    // still callable in-process by its siblings.
    const internal = define("c", () => 3);
    expect(mounted()).toEqual(["a", "b"]);
    expect(isServerFn(internal)).toBe(true);
  });

  test("two functions cannot claim one id", () => {
    mount(define("dup", () => 1) as never);
    expect(() => mount(define("dup", () => 2) as never)).toThrow(/claim the id/);
  });

  test("a URL that is not a server function is not this handler's", async () => {
    expect(await handleServerFn(new Request(`${ORIGIN}/about`, { method: "POST" }))).toBeNull();
  });
});
