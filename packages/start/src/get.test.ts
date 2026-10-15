/**
 * `createServerFn({ method: "GET" })`: a read the browser or a CDN may cache,
 * and still out of reach of a link.
 */

import { afterEach, describe, expect, test } from "bun:test";

import { decodeWire, encodeWire } from "@barqjs/server/codec";

import {
  DATA_SUFFIX,
  PAYLOAD_PARAM,
  RPC_CALLER,
  RPC_PREFIX,
  clientRpc,
  createMiddleware,
  createServerFn,
  setResponseHeader,
} from "./index.ts";
import { withRequest } from "./context.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";

const ORIGIN = "https://example.com";
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  unmountAll();
});

const greet = createServerFn({ method: "GET" })
  .validator((input: { readonly name: string }) => input)
  .handler(({ data }) => {
    setResponseHeader("cache-control", "private, max-age=60");
    return { greeting: `hello ${data.name}`, at: new Date(0) };
  });

const save = createServerFn().handler(() => "saved");

/** A GET the way the stub sends it, with whatever headers the test adds. */
const get = (id: string, input: unknown, headers: Record<string, string> = {}): Request =>
  new Request(
    `${ORIGIN}${RPC_PREFIX}${id}${DATA_SUFFIX}?${PAYLOAD_PARAM}=${encodeURIComponent(
      JSON.stringify({ input: encodeWire(input) }),
    )}`,
    { headers: { "sec-fetch-site": "same-origin", [RPC_CALLER]: "1", ...headers } },
  );

/** A fetch answered by the real request handler, recording what it was sent. */
const throughHandler = (): { sent: Request[]; fetch: typeof fetch } => {
  const sent: Request[] = [];
  const answer = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("sec-fetch-site", "same-origin");
    const request = new Request(new URL(String(input), ORIGIN), { ...init, headers });
    sent.push(request.clone());
    return (await handleServerFn(request)) ?? new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { sent, fetch: answer };
};

describe("a GET server function", () => {
  test("is called from the browser with a GET, its payload in the query", async () => {
    mount("greet", greet);
    const wire = throughHandler();
    globalThis.fetch = wire.fetch;

    const call = clientRpc<{ readonly name: string }, { greeting: string; at: Date }, "GET">(
      "greet",
      [],
      { method: "GET" },
    );
    const answer = await call({ data: { name: "salama" } });

    expect(answer.greeting).toBe("hello salama");
    // The value codec on the way back, as on a POST.
    expect(answer.at).toBeInstanceOf(Date);
    const [request] = wire.sent;
    expect(request?.method).toBe("GET");
    expect(request?.body).toBeNull();
    expect(request?.headers.get(RPC_CALLER)).toBe("1");
    expect(new URL(request?.url ?? "").searchParams.get(PAYLOAD_PARAM)).toContain("salama");
  });

  test("answers with what the handler drafted, so a response can be cached", async () => {
    mount("greet", greet);
    const response = await handleServerFn(get("greet", { name: "salama" }));
    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe("private, max-age=60");
    expect(decodeWire<{ greeting: string }>(await response?.json()).greeting).toBe("hello salama");
  });

  test("is cached only when the handler says so, as TanStack's are", async () => {
    mount(
      "plain",
      createServerFn({ method: "GET" }).handler(() => "salama"),
    );
    const response = await handleServerFn(get("plain", undefined));
    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBeNull();
    expect(response?.headers.get("vary")).toBeNull();
  });

  test("sends one URL for one input, so a cache has a stable key", async () => {
    mount("greet", greet);
    const wire = throughHandler();
    globalThis.fetch = wire.fetch;
    const call = clientRpc<{ readonly name: string }, unknown, "GET">("greet", [], {
      method: "GET",
    });
    await call({ data: { name: "salama" } });
    await call({ data: { name: "salama" } });
    const [first, second] = wire.sent;
    expect(first?.url).toBe(second?.url ?? "");
    expect(first?.cache).toBe("default");
  });

  test("validates what the query carried, as a body would be", async () => {
    const strict = createServerFn({ method: "GET" })
      .validator((input: unknown) => {
        if (typeof input !== "number") throw new TypeError("a number");
        return input;
      })
      .handler(({ data }) => data * 2);
    mount("strict", strict);
    expect((await handleServerFn(get("strict", "two")))?.status).toBe(400);
    expect(decodeWire<number>(await (await handleServerFn(get("strict", 2)))?.json())).toBe(4);
  });

  test("carries what a client half sent, as `clientContext`", async () => {
    let seen: unknown;
    const locale = createMiddleware()
      .client(({ next }) => next({ sendContext: { locale: "ar" } }))
      .server(({ next, clientContext }) => {
        seen = clientContext.locale;
        return next();
      });
    mount(
      "localised",
      createServerFn({ method: "GET" })
        .middleware([locale])
        .handler(() => null),
    );
    globalThis.fetch = throughHandler().fetch;

    await clientRpc<undefined, null, "GET">("localised", [locale], { method: "GET" })();
    expect(seen).toBe("ar");
  });

  test("is in process what it is over the wire", async () => {
    const answer = await withRequest(new Request(ORIGIN), () =>
      greet({ data: { name: "salama" } }),
    );
    expect(answer.greeting).toBe("hello salama");
  });
});

/**
 * GET was once refused outright, because a server function reachable by
 * navigation is a link that mutates: RedwoodSDK shipped `<a href>` as a
 * one-click mutation carrying `SameSite=Lax` cookies. These hold the line that
 * refusal drew, with GET implemented.
 */
describe("what a link cannot reach", () => {
  test("a GET without the header only script can set is refused", async () => {
    let ran = false;
    mount(
      "probe",
      createServerFn({ method: "GET" }).handler(() => {
        ran = true;
        return null;
      }),
    );
    const linked = get("probe", undefined);
    linked.headers.delete(RPC_CALLER);
    const bare = new Request(`${ORIGIN}${RPC_PREFIX}probe${DATA_SUFFIX}`, {
      headers: { "sec-fetch-site": "same-origin" },
    });
    const statuses = [(await handleServerFn(linked))?.status, (await handleServerFn(bare))?.status];
    expect(statuses).toEqual([403, 403]);
    expect(ran).toBe(false);
  });

  test("a GET from another site is refused, header or not", async () => {
    mount("greet", greet);
    const response = await handleServerFn(
      get("greet", { name: "salama" }, { "sec-fetch-site": "cross-site" }),
    );
    expect(response?.status).toBe(403);
  });

  test("a POST function is not reachable by GET, nor a GET function by POST", async () => {
    mount("save", save);
    mount("greet", greet);
    const byGet = await handleServerFn(get("save", undefined));
    const byPost = await handleServerFn(
      new Request(`${ORIGIN}${RPC_PREFIX}greet${DATA_SUFFIX}`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({ input: encodeWire({ name: "salama" }) }),
      }),
    );
    expect([byGet?.status, byGet?.headers.get("allow")]).toEqual([405, "POST"]);
    expect([byPost?.status, byPost?.headers.get("allow")]).toEqual([405, "GET"]);
  });

  test("a GET function has no form channel", async () => {
    mount("greet", greet);
    const response = await handleServerFn(
      new Request(`${ORIGIN}${RPC_PREFIX}greet`, {
        headers: { "sec-fetch-site": "same-origin", [RPC_CALLER]: "1" },
      }),
    );
    expect(response?.status).toBe(404);
  });

  test("a payload larger than the body limit is a 413", async () => {
    mount("greet", greet);
    const response = await handleServerFn(get("greet", { name: "x".repeat(2048) }), {
      maxBodySize: 1024,
    });
    expect(response?.status).toBe(413);
  });

  test("a form handed to a GET stub is refused before anything is sent", async () => {
    let fetched = false;
    globalThis.fetch = (async () => {
      fetched = true;
      return new Response(null);
    }) as unknown as typeof fetch;
    const call = clientRpc<undefined, null, "GET">("greet", [], { method: "GET" });
    const refused: [FormData] extends Parameters<typeof call> ? false : true = true;
    expect(refused).toBe(true);
    await expect(Reflect.apply(call, undefined, [new FormData()])).rejects.toThrow(/answers GET/);
    expect(fetched).toBe(false);
  });
});
