import { afterEach, describe, expect, test } from "bun:test";

import {
  type Middleware,
  DATA_SUFFIX,
  RPC_PREFIX,
  type StandardSchema,
  UncheckedInputError,
  createServerFn,
  getRequest,
  isServerFn,
  serverRpc,
} from "./index.ts";
import { decodeWire, encodeWire } from "@barqjs/server/codec";

import { handleServerFn, mount, mounted, originAllowed, unmountAll } from "./server.ts";

afterEach(unmountAll);

const ORIGIN = "https://app.test";

const post = (id: string, input: unknown, headers: Record<string, string> = {}): Request =>
  new Request(`${ORIGIN}${RPC_PREFIX}${encodeURIComponent(id)}${DATA_SUFFIX}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: JSON.stringify({ input: encodeWire(input) }),
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
      middleware: [],
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
    expect(decodeWire(await response?.json())).toBe("ok");
  });

  test("a schema rejects bad input with 400 and no detail", async () => {
    mount(define("checked", (n: number) => n * 2, positiveInt) as never);

    const bad = await handleServerFn(post("checked", -1));
    expect(bad?.status).toBe(400);
    expect(await bad?.json()).toEqual({ error: "invalid input" });

    const good = await handleServerFn(post("checked", 21));
    expect(decodeWire(await good?.json())).toBe(42);
  });

  test("'unchecked' is the opt-out, and has to be typed out", async () => {
    const fn = serverRpc<unknown, unknown>(
      { id: "raw" },
      {
        validator: "unchecked",
        middleware: [],
        handler: (input) => ({ saw: input }),
      },
    );
    mount(fn as never);

    const response = await handleServerFn(post("raw", { anything: 1 }));
    expect(decodeWire(await response?.json())).toEqual({ saw: { anything: 1 } });
  });

  test("the uncompiled builder enforces the same rule in-process", async () => {
    const fn = createServerFn().handler(() => "ran");
    expect(isServerFn(fn)).toBe(true);
    await expect(fn("an argument" as never)).rejects.toBeInstanceOf(UncheckedInputError);
  });
});

describe("the wire", () => {
  /**
   * The same seroval hardening as the hydration seed, through the JSON channel
   * rather than the JS one: an RPC response is bytes off the network, and
   * evaluating those would be remote code execution however well escaped.
   */
  test("carries Date, Map, Set, BigInt and cycles in both directions", async () => {
    mount(
      serverRpc<{ at: Date; tags: Set<string> }, unknown>(
        { id: "rich" },
        {
          validator: "unchecked",
          middleware: [],
          handler: (input) => {
            const out: Record<string, unknown> = {
              echoed: input.at,
              seen: input.tags,
              counts: new Map([["n", 1n]]),
            };
            out.self = out;
            return out;
          },
        },
      ) as never,
    );

    const response = await handleServerFn(
      post("rich", { at: new Date(0), tags: new Set(["a", "b"]) }),
    );
    const back = decodeWire<Record<string, unknown>>(await response?.json());

    expect(back.echoed).toBeInstanceOf(Date);
    expect((back.echoed as Date).toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(back.seen).toBeInstanceOf(Set);
    expect([...(back.seen as Set<string>)]).toEqual(["a", "b"]);
    expect((back.counts as Map<string, bigint>).get("n")).toBe(1n);
    expect(back.self).toBe(back);
  });

  test("an Error crossing the wire keeps its message and loses the server path", async () => {
    const payload = encodeWire(new Error("db connection failed"));
    const json = JSON.stringify(payload);
    expect(json).toContain("db connection failed");
    expect(json).not.toContain("sourceURL");
    expect(json).not.toContain(import.meta.dir);

    const back = decodeWire<Error>(JSON.parse(json));
    expect(back.message).toBe("db connection failed");
    expect(Object.keys(back)).toEqual(["name"]);
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

describe("middleware and request context", () => {
  const withChain = <In, Out>(id: string, chain: Middleware[], fn: (input: In) => Out) =>
    serverRpc<In, Out>({ id }, { validator: "unchecked", middleware: chain, handler: fn as never });

  /**
   * The hole every surveyed framework documents instead of closing. Next.js:
   * "A page-level authentication check does not extend to the Server Actions
   * defined within it… the Server Action is a separate entry point." Attaching
   * the check to the FUNCTION means there is no other way in.
   */
  test("a middleware can refuse before the handler runs", async () => {
    let ran = false;
    const deny: Middleware = async () => {
      throw new Response("unauthorized", { status: 401 });
    };
    mount(
      withChain("guarded", [deny], () => {
        ran = true;
        return "secret";
      }) as never,
    );

    const response = await handleServerFn(post("guarded", undefined));
    expect(response?.status).toBe(401);
    expect(ran, "the handler ran behind a refusing middleware").toBe(false);
  });

  test("the chain runs outermost first and wraps the handler", async () => {
    const order: string[] = [];
    const tag =
      (name: string): Middleware =>
      async (next) => {
        order.push(`>${name}`);
        const out = await next();
        order.push(`<${name}`);
        return out;
      };
    mount(
      withChain("ordered", [tag("a"), tag("b")], () => {
        order.push("handler");
        return null;
      }) as never,
    );

    await handleServerFn(post("ordered", undefined));
    expect(order).toEqual([">a", ">b", "handler", "<b", "<a"]);
  });

  /**
   * Middleware runs BEFORE validation on purpose: an unauthenticated caller is
   * refused without the server parsing its payload, and a rejection that
   * depended on a well-formed payload would be one an attacker could skip by
   * sending a malformed one.
   */
  test("a refusal does not depend on the payload being valid", async () => {
    const deny: Middleware = async () => {
      throw new Response("unauthorized", { status: 401 });
    };
    mount(
      serverRpc<number, string>(
        { id: "guarded-checked" },
        { validator: positiveInt as never, middleware: [deny], handler: () => "secret" },
      ) as never,
    );

    const response = await handleServerFn(post("guarded-checked", -999));
    expect(response?.status).toBe(401);
  });

  test("getRequest() reaches the handler", async () => {
    mount(withChain("who", [], () => getRequest().headers.get("x-probe")) as never);
    const response = await handleServerFn(post("who", undefined, { "x-probe": "here" }));
    expect(decodeWire(await response?.json())).toBe("here");
  });

  /**
   * A module-level "current request" hands one caller's session to another
   * under concurrency. That is GHSA-hgv7-v322-mmgr in SvelteKit — batched
   * queries resolving under one context and disclosing data across users — so
   * the storage is per-async-context and this test interleaves two requests to
   * say so.
   */
  test("two concurrent requests never see each other's request", async () => {
    mount(
      withChain("slow", [], async () => {
        const first = getRequest().headers.get("x-probe");
        await new Promise((r) => setTimeout(r, 10));
        // Read again after the await: if the context were module-level, the
        // other request would have overwritten it by now.
        return [first, getRequest().headers.get("x-probe")];
      }) as never,
    );

    const [a, b] = await Promise.all([
      handleServerFn(post("slow", undefined, { "x-probe": "A" })),
      handleServerFn(post("slow", undefined, { "x-probe": "B" })),
    ]);
    expect(decodeWire(await a?.json())).toEqual(["A", "A"]);
    expect(decodeWire(await b?.json())).toEqual(["B", "B"]);
  });

  test("getRequest() outside a server function throws rather than returning undefined", () => {
    expect(() => getRequest()).toThrow(/only available inside a server function/);
  });
});

/**
 * `ssr.ts` used to say progressive enhancement "would need a server-generated
 * endpoint per action, which is a routing feature and not this file's." That was
 * true until server functions existed; each one is now mounted at a path that
 * exists before the page renders, so no router is involved.
 */
describe("progressive enhancement", () => {
  const submit = (
    id: string,
    fields: Record<string, string>,
    headers: Record<string, string> = {},
  ) => {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.append(k, v);
    return new Request(`${ORIGIN}${RPC_PREFIX}${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { origin: ORIGIN, referer: `${ORIGIN}/todos?page=2`, ...headers },
      body,
    });
  };

  test("a form POST reaches the handler as FormData and redirects back", async () => {
    let saw: string | null = null;
    mount(
      serverRpc<FormData, void>(
        { id: "add-todo" },
        {
          validator: "unchecked",
          middleware: [],
          handler: (form) => {
            saw = form.get("title") as string;
          },
        },
      ) as never,
    );

    const response = await handleServerFn(submit("add-todo", { title: "buy milk" }));
    expect(saw).toBe("buy milk");
    // 303, so the browser re-issues as GET and a reload does not repost.
    expect(response?.status).toBe(303);
    expect(response?.headers.get("location")).toBe("/todos?page=2");
  });

  test("a handler may answer the submission itself", async () => {
    mount(
      serverRpc<FormData, Response>(
        { id: "custom" },
        {
          validator: "unchecked",
          middleware: [],
          handler: () => new Response(null, { status: 303, headers: { location: "/done" } }),
        },
      ) as never,
    );

    const response = await handleServerFn(submit("custom", {}));
    expect(response?.headers.get("location")).toBe("/done");
  });

  /** Redirecting to a Referer from another origin would be an open redirect. */
  test("an off-site Referer is not a destination", async () => {
    mount(
      serverRpc<FormData, void>(
        { id: "offsite" },
        { validator: "unchecked", middleware: [], handler: () => undefined },
      ) as never,
    );

    const response = await handleServerFn(
      submit("offsite", {}, { referer: "https://evil.test/landing" }),
    );
    expect(response?.headers.get("location")).toBe("/");
  });

  /**
   * The property that makes enhancement an enhancement: one handler, one input
   * type, whether or not JS ran. Routing FormData through the value codec would
   * have delivered a plain object here and a real FormData on the no-JS path —
   * seroval encodes FormData and decodes it to an object, so this was a live
   * divergence rather than a hypothetical one.
   */
  test("both paths hand the handler the same FormData", async () => {
    const seen: Array<{ isFormData: boolean; title: unknown; tags: unknown }> = [];
    mount(
      serverRpc<FormData, void>(
        { id: "same-shape" },
        {
          validator: "unchecked",
          middleware: [],
          handler: (form) => {
            seen.push({
              isFormData: form instanceof FormData,
              title: form.get("title"),
              tags: form.getAll("tag"),
            });
          },
        },
      ) as never,
    );

    // No JS: the browser posts to the form endpoint.
    await handleServerFn(submit("same-shape", { title: "t" }));

    // Enhanced: clientRpc posts the same FormData to the data channel.
    const body = new FormData();
    body.append("title", "t");
    body.append("tag", "a");
    body.append("tag", "b");
    await handleServerFn(
      new Request(`${ORIGIN}${RPC_PREFIX}same-shape${DATA_SUFFIX}`, {
        method: "POST",
        headers: { origin: ORIGIN },
        body,
      }),
    );

    expect(seen).toHaveLength(2);
    expect(seen[0]?.isFormData, "the no-JS path").toBe(true);
    expect(seen[1]?.isFormData, "the enhanced path").toBe(true);
    expect(seen[1]?.tags).toEqual(["a", "b"]);
  });

  test("the form path is fail-closed on input too", async () => {
    mount(define("strict-form", () => "ran") as never);
    const response = await handleServerFn(submit("strict-form", { anything: "1" }));
    expect(response?.status).toBe(400);
  });

  /** The same origin rules apply: a form is not a way around them. */
  test("a cross-origin form POST is refused", async () => {
    mount(
      serverRpc<FormData, void>(
        { id: "guarded-form" },
        { validator: "unchecked", middleware: [], handler: () => undefined },
      ) as never,
    );
    const response = await handleServerFn(
      submit("guarded-form", {}, { origin: "https://evil.test" }),
    );
    expect(response?.status).toBe(403);
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
