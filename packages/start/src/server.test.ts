import { afterEach, describe, expect, test } from "bun:test";

import {
  type Middleware,
  DATA_SUFFIX,
  RPC_CONTROL,
  RPC_PREFIX,
  type StandardSchema,
  UncheckedInputError,
  createServerFn,
  getCookie,
  getRequest,
  peekRequest,
  setCookie,
  setResponseHeader,
  setResponseStatus,
  isServerFn,
  serverRpc,
} from "./index.ts";
import { decodeWire, encodeWire } from "@barqjs/server/codec";

import { createFetchHandler } from "./serve.ts";
import {
  crossOriginRefused,
  handleServerFn,
  mount,
  mounted,
  originAllowed,
  unmountAll,
} from "./server.ts";

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

  /** A sandboxed iframe sends the literal string, so absent and `null` differ. */
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
   * under concurrency. SvelteKit shipped that as batched queries resolving
   * under one context and disclosing data across users, so the storage is
   * per-async-context and this test interleaves two requests to say so.
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

  test("the request helpers outside a request throw rather than returning undefined", () => {
    // A handler reading cookies off `undefined` is a bug that should surface
    // where it happens, not resolve to "no session" and let the request through.
    // The message names every place there IS one, because "server function" was
    // only half the answer once route handlers and loaders could ask too.
    expect(() => getRequest()).toThrow(/only available inside a request/);
    expect(() => getCookie("sid")).toThrow(/only available inside a request/);
    expect(() => setCookie("sid", "x")).toThrow(/only available inside a request/);
    expect(() => setResponseHeader("x-a", "b")).toThrow(/only available inside a request/);
    // …and `peekRequest` is the spelling for code that legitimately runs both
    // ways, which still answers rather than throwing.
    expect(peekRequest()).toBeUndefined();
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
   * A client-supplied name used as a raw property access has shipped as a
   * critical RCE: `constructor` yields `Function`. A Map has no prototype chain
   * to reach into.
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

  /**
   * RE-MOUNTING REPLACES, and refusing it was a dev-server bug.
   *
   * The generated manifest is invalidated whenever a server-function module is
   * transformed and re-imported on the next request, while this registry lives
   * in a module nothing invalidates. The old rule therefore refused ids the
   * first evaluation had legitimately claimed, and every page in the
   * application answered 500 after the first edit — `two server functions claim
   * the id src/data/admin.ts#adminStats`, from an app containing exactly one.
   *
   * The check that MATTERS did not go away; it moved to where it can tell a
   * collision from a re-evaluation, which is manifest generation. `vite.test.ts`
   * covers it.
   */
  test("re-mounting an id replaces it, because that is what an edit looks like", async () => {
    mountOf(define("dup", () => 1));
    mountOf(define("dup", () => 2) as never);
    expect(mounted()).toEqual(["dup"]);
    // The newest definition is the one that answers.
    const response = await handleServerFn(post("dup", undefined));
    expect(decodeWire(await response!.json())).toBe(2);
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
 * `fn({ data })` and `.handler(({ data, context }) => …)` are theirs, and
 * `method: "GET"` is theirs too, and it is refused here rather than accepted-and-ignored.
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
   * RedwoodSDK shipped exactly that, where an `<a href>` became a one-click
   * mutation carrying `SameSite=Lax` cookies. So
   * the option a TanStack application would copy is REFUSED with the reason
   * rather than accepted and quietly ignored.
   */
  test("`method: 'GET'` is refused, and says why", () => {
    expect(() => createServerFn({ method: "GET" as never })).toThrow(/POST only/);
    // The one value barq does implement is accepted, so stating the intent is
    // not itself an error.
    expect(() => createServerFn({ method: "POST" })).not.toThrow();
  });
});

/**
 * The response a handler builds without returning one.
 *
 * MEASURED BEFORE THIS EXISTED: a server function could not set a cookie at all
 * on the JS path. `handleServerFn` answered the `.data` channel with
 * `Response.json(encodeWire(result))`, so a returned `Response` went into the
 * value codec and came back `Seroval Error (step: 1)` — a 500 with nothing in
 * it. The no-JS form path returned it correctly, so the same function behaved
 * differently depending on whether JS had run.
 */
describe("the ambient response", () => {
  const call = (id: string, data = true) =>
    handleServerFn(
      new Request(`http://x/_barq/fn/${id}${data ? ".data" : ""}`, {
        method: "POST",
        headers: { origin: "http://x", "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

  test("`setCookie` reaches the response on the DATA channel", async () => {
    mountOf(
      serverRpc<undefined, unknown>(
        { id: "login" },
        {
          validator: null,
          middleware: [],
          handler: () => {
            setCookie("sid", "abc", { httpOnly: true, path: "/", sameSite: "lax" });
            setResponseHeader("x-ran", "yes");
            return { ok: true };
          },
        },
      ),
    );
    const response = await call("login");
    expect(response?.headers.get("set-cookie")).toBe("sid=abc; Path=/; HttpOnly; SameSite=Lax");
    expect(response?.headers.get("x-ran")).toBe("yes");
    // …and the VALUE still comes back, which is the whole point of not having
    // to return a `Response` to set a header.
    expect(decodeWire<unknown>(await response?.json())).toEqual({ ok: true });
  });

  test("TWO cookies are two lines, not one overwriting the other", async () => {
    mountOf(
      serverRpc<undefined, unknown>(
        { id: "two" },
        {
          validator: null,
          middleware: [],
          handler: () => {
            setCookie("a", "1");
            setCookie("b", "2");
            return null;
          },
        },
      ),
    );
    const response = await call("two");
    expect(response?.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
  });

  test("a RETURNED Response works on the data channel, and used to crash", async () => {
    mountOf(
      serverRpc<undefined, unknown>(
        { id: "raw" },
        {
          validator: null,
          middleware: [],
          handler: () => new Response("hi", { status: 201, headers: { "x-raw": "1" } }),
        },
      ),
    );
    const response = await call("raw");
    expect(response?.status).toBe(201);
    expect(response?.headers.get("x-raw")).toBe("1");
    expect(await response?.text()).toBe("hi");
  });

  test("a returned Response WINS on a header it sets, and cookies are additive", async () => {
    mountOf(
      serverRpc<undefined, unknown>(
        { id: "both" },
        {
          validator: null,
          middleware: [],
          handler: () => {
            setCookie("from-helper", "1");
            setResponseHeader("x-who", "helper");
            return new Response(null, {
              headers: { "x-who": "returned", "set-cookie": "from-response=1" },
            });
          },
        },
      ),
    );
    const response = await call("both");
    // The handler that built a whole response has said what it wants.
    expect(response?.headers.get("x-who")).toBe("returned");
    // …except for cookies, where dropping either is a bug neither can see.
    expect(response?.headers.getSetCookie().toSorted()).toEqual([
      "from-helper=1",
      "from-response=1",
    ]);
  });

  test("a middleware that rotates a cookie and THEN refuses keeps the rotation", async () => {
    // Otherwise the browser keeps replaying a token the server has retired.
    const rotate: Middleware = async (next) => {
      setCookie("sid", "rotated");
      throw new Response("nope", { status: 401 });
      // oxlint-disable-next-line no-unreachable -- the shape is the point
      return next();
    };
    mountOf(
      serverRpc<undefined, unknown>(
        { id: "rotates" },
        { validator: null, middleware: [rotate], handler: () => "unreachable" },
      ),
    );
    const response = await call("rotates");
    expect(response?.status).toBe(401);
    expect(response?.headers.get("set-cookie")).toBe("sid=rotated");
  });

  /**
   * Here and NOT in the router's suite, and the reason is worth recording:
   * `Cookie` is a FORBIDDEN request header name, so `new Request(url, { headers:
   * { cookie } })` drops it — under happy-dom, which the router registers, and
   * per the fetch spec. A server never constructs a request; it receives one off
   * the wire, where the header arrives intact. This package registers no DOM, so
   * it is the only place the real shape can be tested.
   */
  test("`getCookie` reads what the REQUEST carried", async () => {
    let saw: string | undefined;
    mountOf(
      serverRpc<undefined, unknown>(
        { id: "reads" },
        {
          validator: null,
          middleware: [],
          handler: () => {
            saw = getCookie("sid");
            return null;
          },
        },
      ),
    );
    await handleServerFn(
      new Request("http://x/_barq/fn/reads.data", {
        method: "POST",
        headers: {
          origin: "http://x",
          "content-type": "application/json",
          cookie: "sid=from-the-browser",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(saw).toBe("from-the-browser");
  });

  test("`setResponseStatus` decides a framework-built response", async () => {
    mountOf(
      serverRpc<undefined, unknown>(
        { id: "created" },
        {
          validator: null,
          middleware: [],
          handler: () => {
            setResponseStatus(201);
            return { id: 7 };
          },
        },
      ),
    );
    const response = await call("created");
    expect(response?.status).toBe(201);
    expect(decodeWire<unknown>(await response?.json())).toEqual({ id: 7 });
  });
});

/**
 * `crossOriginRefused` — the CSRF rule for ROUTE HANDLERS, against real headers.
 *
 * Here rather than in the router's suite because `Origin` and every `Sec-` name
 * are FORBIDDEN request headers: the constructor drops them under happy-dom and
 * per the fetch spec. This package registers no DOM, so it is the only place the
 * real shape can be tested.
 *
 * IT IS A DIFFERENT QUESTION FROM `originAllowed`, and the difference is the
 * design. `/_barq/fn/*` only ever exists to be called by this application's own
 * pages, so a request with no origin signal is refused there. An API route
 * exists so something OTHER than a browser can call it, so the absence of a
 * signal is allowed here — a forgery is by definition made by a browser, and a
 * browser always says.
 */
describe("the CSRF rule for route handlers", () => {
  const request = (method: string, headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/x", { method, headers });

  test("a safe method is never refused, because it changes nothing", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(crossOriginRefused(request(method, { origin: "https://evil.example" }))).toBe(false);
    }
  });

  test("a browser saying cross-origin is refused, by either signal", () => {
    expect(crossOriginRefused(request("POST", { origin: "https://evil.example" }))).toBe(true);
    expect(crossOriginRefused(request("POST", { "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(crossOriginRefused(request("POST", { "sec-fetch-site": "same-site" }))).toBe(true);
    expect(crossOriginRefused(request("DELETE", { origin: "https://evil.example" }))).toBe(true);
  });

  test("a `null` origin is refused rather than read as absent — CVE-2026-27978", () => {
    // A sandboxed iframe sends the literal string.
    expect(crossOriginRefused(request("POST", { origin: "null" }))).toBe(true);
  });

  test("the application's own origin passes, however it says so", () => {
    expect(crossOriginRefused(request("POST", { origin: "http://localhost" }))).toBe(false);
    expect(crossOriginRefused(request("POST", { "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(crossOriginRefused(request("POST", { "sec-fetch-site": "none" }))).toBe(false);
  });

  /**
   * THE CASE THAT MAKES THE RULE NARROW, and the reason it is not
   * `originAllowed`. A Stripe webhook, a GitHub delivery and a cron send neither
   * header; refusing on the absence of one would refuse the main reason API
   * routes exist. A request with no signal is not a browser, so it cannot be a
   * forgery.
   */
  test("no origin signal at all is allowed — that is a webhook, not a browser", () => {
    expect(crossOriginRefused(request("POST"))).toBe(false);
  });

  test("`allowedOrigins` widens it and nothing else does", () => {
    const forged = request("POST", { origin: "https://partner.example" });
    expect(crossOriginRefused(forged, ["https://partner.example"])).toBe(false);
    expect(crossOriginRefused(forged, ["https://other.example"])).toBe(true);
  });

  test("`Origin` WINS over `Sec-Fetch-Site`, so a lie in one cannot excuse the other", () => {
    // A browser sends both. If they disagree the stricter reading is the honest
    // one, and `Origin` is the one that names who is asking.
    expect(
      crossOriginRefused(
        request("POST", { origin: "https://evil.example", "sec-fetch-site": "same-origin" }),
      ),
    ).toBe(true);
  });
});

/**
 * `throw redirect(...)` and `throw notFound()` from a server FUNCTION.
 *
 * Both used to fall through the handler's rethrow and become a 500 with an
 * opaque message, so the two ordinary control-flow throws in the framework were
 * the two a server function could not carry. The classes are
 * `@barqjs/router`'s and this package cannot import them, so what is checked
 * here is the BRAND contract between the two: a value carrying
 * `Symbol.for("barq.redirect")` is a redirect whoever constructed it.
 */
describe("a server function's control-flow throws", () => {
  /**
   * Built here rather than imported, which is the POINT of the test: if
   * `@barqjs/router` changed its brand, this would keep passing while the real
   * pair broke — so `errors.test.ts` in the router pins the other direction, and
   * these two literals are the contract.
   */
  class Redirected extends Error {
    readonly [Symbol.for("barq.redirect")] = true;
    constructor(
      readonly to: string,
      readonly status = 302,
    ) {
      super(`redirect to ${to}`);
    }
  }
  class Missing extends Error {
    readonly [Symbol.for("barq.not-found")] = true;
  }

  // `"unchecked"` rather than `null`: the form channel posts a `FormData` body,
  // and a function that declared no validator refuses ANY argument with a 400
  // before the handler runs — which is the fail-closed default working, not a
  // thing to work around.
  const throwing = (id: string, error: unknown) =>
    mountOf(
      serverRpc<undefined, never>(
        { id },
        {
          validator: "unchecked",
          middleware: [],
          handler: () => {
            throw error;
          },
        },
      ),
    );

  test("the data channel describes a redirect rather than answering 3xx", async () => {
    throwing("gated", new Redirected("/login"));
    const response = await handleServerFn(post("gated", undefined));

    // 200, NOT 302. `fetch` follows a 3xx, so a redirecting server function
    // would hand the caller the login page's HTML instead of a navigation.
    expect(response?.status).toBe(200);
    expect(response?.headers.get(RPC_CONTROL)).toBe("redirect");
    expect(await response?.json()).toEqual({ kind: "redirect", to: "/login", status: 302 });
  });

  test("the form channel answers a real 3xx the browser can follow", async () => {
    throwing("gated-form", new Redirected("/login"));
    const body = new FormData();
    const response = await handleServerFn(
      new Request(`${ORIGIN}${RPC_PREFIX}gated-form`, {
        method: "POST",
        headers: { origin: ORIGIN, referer: `${ORIGIN}/x` },
        body,
      }),
    );

    // 303 rather than the 302 asked for, so a reload does not repost.
    expect(response?.status).toBe(303);
    expect(response?.headers.get("location")).toBe("/login");
  });

  test("an explicit status survives to the browser", async () => {
    throwing("moved", new Redirected("/elsewhere", 301));
    const body = new FormData();
    const response = await handleServerFn(
      new Request(`${ORIGIN}${RPC_PREFIX}moved`, {
        method: "POST",
        headers: { origin: ORIGIN, referer: `${ORIGIN}/x` },
        body,
      }),
    );
    expect(response?.status).toBe(301);
  });

  test("notFound is a 404 on both channels", async () => {
    throwing("gone", new Missing("no such row"));

    const data = await handleServerFn(post("gone", undefined));
    expect(data?.status).toBe(404);
    expect(data?.headers.get(RPC_CONTROL)).toBe("not-found");
    expect(await data?.json()).toEqual({ kind: "not-found", message: "no such row" });

    throwing("gone-form", new Missing("no such row"));
    const form = await handleServerFn(
      new Request(`${ORIGIN}${RPC_PREFIX}gone-form`, {
        method: "POST",
        headers: { origin: ORIGIN, referer: `${ORIGIN}/x` },
        body: new FormData(),
      }),
    );
    expect(form?.status).toBe(404);
  });

  test("a cookie a middleware set rides the redirect out", async () => {
    mountOf(
      serverRpc<undefined, never>(
        { id: "rotating" },
        {
          validator: null,
          middleware: [
            async (next) => {
              setCookie("session", "rotated");
              return next();
            },
          ],
          handler: () => {
            throw new Redirected("/login");
          },
        },
      ),
    );
    const response = await handleServerFn(post("rotating", undefined));
    expect(response?.headers.get("set-cookie")).toContain("session=rotated");
  });

  /**
   * The escalation `isNavigable` exists for. A 302 to `javascript:` is inert,
   * but the client rebuilds this redirect and hands it to the router, which
   * navigates — so the refusal has to happen where both channels share it.
   */
  test("a non-navigable target is refused on both channels", async () => {
    const refused = ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x"];
    for (const [at, to] of refused.entries()) {
      throwing(`evil-${at}`, new Redirected(to));
      const response = await handleServerFn(post(`evil-${at}`, undefined));
      expect(response?.status).toBe(500);
      expect(response?.headers.get("location")).toBeNull();
      expect(response?.headers.get(RPC_CONTROL)).toBeNull();
    }
  });

  test("the targets a redirect may name are the router's list, exactly", async () => {
    // The pin between the two copies of `isNavigable`. `packages/router`'s own
    // `path.test.ts` runs the same table against its copy, so a change to
    // either that the other does not follow fails on one side or the other.
    const allowed = ["/login", "login", "./x", "../x", "//host/path", "https://x.test/y", "http://x.test"];
    for (const [at, to] of allowed.entries()) {
      throwing(`ok-${at}`, new Redirected(to));
      const response = await handleServerFn(post(`ok-${at}`, undefined));
      expect(response?.status).toBe(200);
      expect(await response?.json()).toMatchObject({ to });
    }
  });
});
