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

import { createFetchHandler } from "./serve.ts";
import { handleServerFn, mount, mounted, originAllowed, unmountAll } from "./server.ts";

/** Mounts under the id the function already carries, which is what the tests mean. */
const mountOf = (fn: { meta: { id: string } }): void => mount(fn.meta.id, fn as never);

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
  fn: (context: { data: In }) => Out,
  schema?: StandardSchema<unknown, In>,
) =>
  serverRpc<In, Out>(
    { id },
    {
      validator: schema ?? null,
      middleware: [],
      handler: fn,
    },
  );

describe("input is fail-closed", () => {
  /**
   * The default every other surveyed framework gets wrong: with no validator,
   * raw deserialized input reaches the handler. Here it is a 400, and opening
   * the channel costs a schema or the literal 'unchecked'.
   */
  test("a function with no validator refuses any argument", async () => {
    mountOf(define("no-validator", (input: unknown) => ({ saw: input })));

    const response = await handleServerFn(post("no-validator", { evil: true }));
    expect(response?.status).toBe(400);
  });

  test("…and still accepts a call with no argument", async () => {
    mountOf(define("nullary", () => "ok"));

    const response = await handleServerFn(post("nullary", undefined));
    expect(response?.status).toBe(200);
    expect(decodeWire<string>(await response?.json())).toBe("ok");
  });

  test("a schema rejects bad input with 400 and no detail", async () => {
    mountOf(define("checked", ({ data }: { data: number }) => data * 2, positiveInt));

    const bad = await handleServerFn(post("checked", -1));
    expect(bad?.status).toBe(400);
    expect(await bad?.json()).toEqual({ error: "invalid input" });

    const good = await handleServerFn(post("checked", 21));
    expect(decodeWire<number>(await good?.json())).toBe(42);
  });

  test("'unchecked' is the opt-out, and has to be typed out", async () => {
    const fn = serverRpc<unknown, unknown>(
      { id: "raw" },
      {
        validator: "unchecked",
        middleware: [],
        handler: ({ data }) => ({ saw: data }),
      },
    );
    mountOf(fn);

    const response = await handleServerFn(post("raw", { anything: 1 }));
    expect(decodeWire<unknown>(await response?.json())).toEqual({ saw: { anything: 1 } });
  });

  test("the uncompiled builder enforces the same rule in-process", async () => {
    const fn = createServerFn().handler(() => "ran");
    expect(isServerFn(fn)).toBe(true);
    await expect(fn({ data: "an argument" } as never)).rejects.toBeInstanceOf(UncheckedInputError);
  });
});

describe("the wire", () => {
  /**
   * The same seroval hardening as the hydration seed, through the JSON channel
   * rather than the JS one: an RPC response is bytes off the network, and
   * evaluating those would be remote code execution however well escaped.
   */
  test("carries Date, Map, Set, BigInt and cycles in both directions", async () => {
    mountOf(
      serverRpc<{ at: Date; tags: Set<string> }, unknown>(
        { id: "rich" },
        {
          validator: "unchecked",
          middleware: [],
          handler: ({ data }) => {
            const out: Record<string, unknown> = {
              echoed: data.at,
              seen: data.tags,
              counts: new Map([["n", 1n]]),
            };
            out.self = out;
            return out;
          },
        },
      ),
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
    mountOf(define("m", () => "ran"));
    const response = await handleServerFn(
      new Request(`${ORIGIN}${RPC_PREFIX}m`, { method: "GET", headers: { origin: ORIGIN } }),
    );
    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("POST");
  });

  test("a cross-origin call is refused", async () => {
    mountOf(define("m", () => "ran"));
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
  const withChain = <In, Out>(
    id: string,
    chain: Middleware[],
    fn: (context: { data: In }) => Out,
  ) => serverRpc<In, Out>({ id }, { validator: "unchecked", middleware: chain, handler: fn });

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
    mountOf(
      withChain("guarded", [deny], () => {
        ran = true;
        return "secret";
      }),
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
    mountOf(
      withChain("ordered", [tag("a"), tag("b")], () => {
        order.push("handler");
        return null;
      }),
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
    mountOf(
      serverRpc<number, string>(
        { id: "guarded-checked" },
        { validator: positiveInt, middleware: [deny], handler: () => "secret" },
      ),
    );

    const response = await handleServerFn(post("guarded-checked", -999));
    expect(response?.status).toBe(401);
  });

  test("getRequest() reaches the handler", async () => {
    mountOf(withChain("who", [], () => getRequest().headers.get("x-probe")));
    const response = await handleServerFn(post("who", undefined, { "x-probe": "here" }));
    expect(decodeWire<string>(await response?.json())).toBe("here");
  });

  /**
   * A module-level "current request" hands one caller's session to another
   * under concurrency. That is GHSA-hgv7-v322-mmgr in SvelteKit — batched
   * queries resolving under one context and disclosing data across users — so
   * the storage is per-async-context and this test interleaves two requests to
   * say so.
   */
  test("two concurrent requests never see each other's request", async () => {
    mountOf(
      withChain("slow", [], async () => {
        const first = getRequest().headers.get("x-probe");
        await new Promise((r) => setTimeout(r, 10));
        // Read again after the await: if the context were module-level, the
        // other request would have overwritten it by now.
        return [first, getRequest().headers.get("x-probe")];
      }),
    );

    const [a, b] = await Promise.all([
      handleServerFn(post("slow", undefined, { "x-probe": "A" })),
      handleServerFn(post("slow", undefined, { "x-probe": "B" })),
    ]);
    expect(decodeWire<string[]>(await a?.json())).toEqual(["A", "A"]);
    expect(decodeWire<string[]>(await b?.json())).toEqual(["B", "B"]);
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
    let saw: unknown = null;
    mountOf(
      serverRpc<FormData, void>(
        { id: "add-todo" },
        {
          validator: "unchecked",
          middleware: [],
          handler: ({ data: form }) => {
            saw = form.get("title");
          },
        },
      ),
    );

    const response = await handleServerFn(submit("add-todo", { title: "buy milk" }));
    expect(saw).toBe("buy milk");
    // 303, so the browser re-issues as GET and a reload does not repost.
    expect(response?.status).toBe(303);
    expect(response?.headers.get("location")).toBe("/todos?page=2");
  });

  test("a handler may answer the submission itself", async () => {
    mountOf(
      serverRpc<FormData, Response>(
        { id: "custom" },
        {
          validator: "unchecked",
          middleware: [],
          handler: () => new Response(null, { status: 303, headers: { location: "/done" } }),
        },
      ),
    );

    const response = await handleServerFn(submit("custom", {}));
    expect(response?.headers.get("location")).toBe("/done");
  });

  /** Redirecting to a Referer from another origin would be an open redirect. */
  test("an off-site Referer is not a destination", async () => {
    mountOf(
      serverRpc<FormData, void>(
        { id: "offsite" },
        { validator: "unchecked", middleware: [], handler: () => undefined },
      ),
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
    mountOf(
      serverRpc<FormData, void>(
        { id: "same-shape" },
        {
          validator: "unchecked",
          middleware: [],
          handler: ({ data: form }) => {
            seen.push({
              isFormData: form instanceof FormData,
              title: form.get("title"),
              tags: form.getAll("tag"),
            });
          },
        },
      ),
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
    mountOf(define("strict-form", () => "ran"));
    const response = await handleServerFn(submit("strict-form", { anything: "1" }));
    expect(response?.status).toBe(400);
  });

  /** The same origin rules apply: a form is not a way around them. */
  test("a cross-origin form POST is refused", async () => {
    mountOf(
      serverRpc<FormData, void>(
        { id: "guarded-form" },
        { validator: "unchecked", middleware: [], handler: () => undefined },
      ),
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
    mountOf(define("real", () => "ran"));
    for (const name of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const response = await handleServerFn(post(name, undefined));
      expect(response?.status, name).toBe(404);
    }
  });

  test("export-ness decides the surface, and it is reviewable", () => {
    mountOf(define("a", () => 1));
    mountOf(define("b", () => 2));
    // A server function that is never mounted has no id on the wire, and is
    // still callable in-process by its siblings.
    const internal = define("c", () => 3);
    expect(mounted()).toEqual(["a", "b"]);
    expect(isServerFn(internal)).toBe(true);
  });

  test("two functions cannot claim one id", () => {
    mountOf(define("dup", () => 1));
    expect(() => mountOf(define("dup", () => 2) as never)).toThrow(/claim the id/);
  });

  test("a URL that is not a server function is not this handler's", async () => {
    expect(await handleServerFn(new Request(`${ORIGIN}/about`, { method: "POST" }))).toBeNull();
  });
});

/**
 * The production entry is runtime-agnostic by construction: `srvx`'s root
 * export resolves by runtime condition, so the handler below is the same one on
 * Node, Deno, Bun and Cloudflare. Only the request/response pair is asserted
 * here — starting a listener would test srvx rather than this.
 */
describe("the fetch handler", () => {
  test("answers a server function and delegates everything else", async () => {
    mount(
      "greet",
      define("greet", () => "hi"),
    );
    const page = createFetchHandler({
      fetch: () => new Response("a page", { status: 200 }),
    });

    const rpc = await page(post("greet", undefined));
    expect(decodeWire<string>(await rpc.json())).toBe("hi");

    const other = await page(new Request(`${ORIGIN}/about`));
    expect(await other.text()).toBe("a page");
  });

  /**
   * Server functions match FIRST. A page handler that also matched the RPC URL
   * would shadow an endpoint, and the failure that produces is a mutation
   * quietly answered with HTML.
   */
  test("a page handler cannot shadow a server function", async () => {
    mount(
      "shadowed",
      define("shadowed", () => "real"),
    );
    const page = createFetchHandler({ fetch: () => new Response("<html>", { status: 200 }) });

    const response = await page(post("shadowed", undefined));
    expect(decodeWire<string>(await response.json())).toBe("real");
  });

  test("with no page handler, a non-RPC URL is a 404 rather than an error", async () => {
    const page = createFetchHandler();
    expect((await page(new Request(`${ORIGIN}/about`))).status).toBe(404);
  });
});

/**
 * The call convention, and the one thing barq refuses to match.
 *
 * `fn({ data })` and `.handler(({ data, context }) => …)` are theirs
 * (`examples/react/start-basic/src/utils/posts.tsx:10-12`). `method: "GET"` is
 * theirs too, and it is refused here rather than accepted-and-ignored.
 */
describe("the call convention", () => {
  test("a function with no validator is called with NO argument", async () => {
    // The uncompiled builder has no id of its own — the compiler assigns one —
    // so mounting is where the two meet, exactly as `mount` documents.
    const fn = createServerFn().handler(() => "ran");
    mount("nullary", fn as never);
    const response = await handleServerFn(post("nullary", undefined));
    expect(decodeWire<string>(await response?.json())).toBe("ran");
    // …and in-process, which is the spelling an application writes. The bare
    // convention forced `fn(undefined)` on every one of these.
    expect(await fn()).toBe("ran");
  });

  test("`data` is what the handler is handed, and `context` is what the chain built", async () => {
    const seen: Record<string, unknown>[] = [];
    const stamp: Middleware = async (next) => next({ context: { who: "ada" } });
    const also: Middleware = async (next) => next({ context: { role: "admin" } });
    const fn = serverRpc<string, string>(
      { id: "ctx" },
      {
        validator: "unchecked",
        middleware: [stamp, also],
        handler: ({ data, context, signal }) => {
          seen.push({ ...context, aborted: signal.aborted });
          return `hello ${data}`;
        },
      },
    );
    mountOf(fn);

    const response = await handleServerFn(post("ctx", "world"));
    expect(decodeWire<string>(await response?.json())).toBe("hello world");
    // Merged outermost-first, so every step above the handler is visible to it.
    expect(seen).toEqual([{ who: "ada", role: "admin", aborted: false }]);
  });

  test("`next()` with no argument is unchanged, so existing middleware still runs", async () => {
    const order: string[] = [];
    const plain: Middleware = async (next) => {
      order.push("before");
      const out = await next();
      order.push("after");
      return out;
    };
    const fn = serverRpc<undefined, string>(
      { id: "plain" },
      { validator: null, middleware: [plain], handler: () => "ok" },
    );
    mountOf(fn);
    expect(await fn()).toBe("ok");
    expect(order).toEqual(["before", "after"]);
  });

  /**
   * A server function reachable by navigation is a link that mutates.
   * RedwoodSDK shipped exactly that — CVE-2026-39371, CVSS 8.1 — where an
   * `<a href>` became a one-click mutation carrying `SameSite=Lax` cookies. So
   * the option a TanStack application would copy is REFUSED with the reason
   * rather than accepted and quietly ignored.
   */
  test("`method: 'GET'` is refused, and says why", () => {
    expect(() => createServerFn({ method: "GET" as never })).toThrow(/POST only|CVE-2026-39371/);
    // The one value barq does implement is accepted, so stating the intent is
    // not itself an error.
    expect(() => createServerFn({ method: "POST" })).not.toThrow();
  });
});
