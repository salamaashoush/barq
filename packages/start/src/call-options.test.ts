/**
 * What a call carries beside its `data`: a signal, headers, a fetch of its own.
 */

import { afterEach, describe, expect, test } from "bun:test";

import {
  ServerFnError,
  appendResponseHeader,
  clientRpc,
  createMiddleware,
  getRequestHeader,
  serverRpc,
} from "./index.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";

const ORIGIN = "https://example.com";
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  unmountAll();
});

/** A fetch answered by the real request handler, recording what it was sent. */
const throughHandler = (): { sent: RequestInit[]; fetch: typeof fetch } => {
  const sent: RequestInit[] = [];
  const answer = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(init ?? {});
    const headers = new Headers(init?.headers);
    headers.set("origin", ORIGIN);
    const response = await handleServerFn(
      new Request(new URL(String(input), ORIGIN), { ...init, headers }),
    );
    return response ?? new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { sent, fetch: answer };
};

const mountEcho = (id: string, header: string): void =>
  mount(
    id,
    serverRpc<unknown, string | null>(
      { id },
      {
        validator: "unchecked",
        middleware: [],
        handler: () => getRequestHeader(header) ?? null,
      },
    ),
  );

describe("headers", () => {
  test("a call's headers reach the server", async () => {
    mountEcho("who", "authorization");
    globalThis.fetch = throughHandler().fetch;

    const who = clientRpc<undefined, string | null>("who");
    expect(await who({ headers: { authorization: "Bearer salama" } })).toBe("Bearer salama");
  });

  test("a call that names none sends what it always sent", async () => {
    mountEcho("plain", "authorization");
    const wire = throughHandler();
    globalThis.fetch = wire.fetch;

    expect(await clientRpc<undefined, string | null>("plain")()).toBeNull();
    expect(wire.sent[0]?.headers).toEqual({ "content-type": "application/json" });
  });

  test("a client middleware adds one with `next({ headers })`, and the call's own wins", async () => {
    mountEcho("traced", "x-trace");
    globalThis.fetch = throughHandler().fetch;
    const trace = createMiddleware().client(({ next }) =>
      next({ headers: { "x-trace": "chain" } }),
    );

    const traced = clientRpc<undefined, string | null>("traced", [trace]);
    expect(await traced()).toBe("chain");
    expect(await traced({ headers: { "x-trace": "call" } })).toBe("call");
  });

  test("the content type stays the one the body was encoded as", async () => {
    mount(
      "typed",
      serverRpc<string, string>(
        { id: "typed" },
        { validator: "unchecked", middleware: [], handler: ({ data }) => data },
      ),
    );
    globalThis.fetch = throughHandler().fetch;

    const typed = clientRpc<string, string>("typed");
    expect(await typed({ data: "kept", headers: { "content-type": "text/plain" } })).toBe("kept");
  });

  test("a form keeps the boundary the runtime writes, whatever the call says", async () => {
    mount(
      "upload",
      serverRpc<FormData, string>(
        { id: "upload" },
        {
          validator: "unchecked",
          middleware: [],
          handler: ({ data }) => String(data.get("owner")),
        },
      ),
    );
    globalThis.fetch = throughHandler().fetch;
    const form = new FormData();
    form.set("owner", "salama");

    const send = clientRpc<FormData, string>("upload");
    const options = { data: form, headers: { "content-type": "multipart/form-data", "x-a": "1" } };
    expect(await send(options)).toBe("salama");
  });
});

describe("signal", () => {
  test("a call's signal is the fetch's", async () => {
    mountEcho("slow", "x-none");
    const wire = throughHandler();
    globalThis.fetch = wire.fetch;
    const controller = new AbortController();

    await clientRpc<undefined, string | null>("slow")({ signal: controller.signal });
    expect(wire.sent[0]?.signal).toBe(controller.signal);
  });

  test("a call already aborted never reaches the server", async () => {
    let ran = false;
    mount(
      "never",
      serverRpc<undefined, null>(
        { id: "never" },
        {
          validator: null,
          middleware: [],
          handler: () => {
            ran = true;
            return null;
          },
        },
      ),
    );
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return throughHandler().fetch(input, init);
    }) as typeof fetch;

    const outcome = await clientRpc<undefined, null>("never")({ signal: AbortSignal.abort() }).then(
      () => "answered",
      (error: unknown) => (error as Error).name,
    );
    expect(outcome).toBe("AbortError");
    expect(ran).toBe(false);
  });

  test("a client middleware is handed the call's signal", async () => {
    mountEcho("watched", "x-none");
    globalThis.fetch = throughHandler().fetch;
    const seen: AbortSignal[] = [];
    const watch = createMiddleware().client(({ next, signal }) => {
      seen.push(signal);
      return next();
    });
    const controller = new AbortController();

    await clientRpc<undefined, string | null>("watched", [watch])({ signal: controller.signal });
    expect(seen).toEqual([controller.signal]);
  });

  test("in-process, the handler is handed the signal the call named", async () => {
    const fn = serverRpc<undefined, boolean>(
      { id: "local" },
      { validator: null, middleware: [], handler: ({ signal }) => signal.aborted },
    );
    expect(await fn({ signal: AbortSignal.abort() })).toBe(true);
    expect(await fn()).toBe(false);
  });
});

describe("fetch", () => {
  test("a call's own fetch is used, and the global one is not", async () => {
    mountEcho("mine", "x-none");
    const wire = throughHandler();
    globalThis.fetch = (async () => {
      throw new Error("the global fetch was used");
    }) as unknown as typeof fetch;

    expect(await clientRpc<undefined, string | null>("mine")({ fetch: wire.fetch })).toBeNull();
    expect(wire.sent).toHaveLength(1);
  });

  test("a client middleware's `next({ fetch })` is used, and the global one is not", async () => {
    mountEcho("traced", "x-none");
    const wire = throughHandler();
    globalThis.fetch = (async () => {
      throw new Error("the global fetch was used");
    }) as unknown as typeof fetch;
    const tracing = createMiddleware().client(({ next }) => next({ fetch: wire.fetch }));

    expect(await clientRpc<undefined, string | null>("traced", [tracing])()).toBeNull();
    expect(wire.sent).toHaveLength(1);
  });

  test("the call's own fetch wins over a middleware's, and a later middleware's over an earlier", async () => {
    mountEcho("ranked", "x-none");
    const used: string[] = [];
    const named = (name: string): typeof fetch => {
      const wire = throughHandler();
      return (async (input: RequestInfo | URL, init?: RequestInit) => {
        used.push(name);
        return wire.fetch(input, init);
      }) as typeof fetch;
    };
    const outer = createMiddleware().client(({ next }) => next({ fetch: named("outer") }));
    const inner = createMiddleware().client(({ next }) => next({ fetch: named("inner") }));
    const ranked = clientRpc<undefined, string | null>("ranked", [outer, inner]);

    await ranked();
    await ranked({ fetch: named("call") });

    expect(used).toEqual(["inner", "call"]);
  });
});

describe("a refusal the server wrote", () => {
  test("is on the error, body and all", async () => {
    const refuse = createMiddleware().server(() => {
      throw new Response("sign in first", { status: 401, headers: { "www-authenticate": "x" } });
    });
    mount(
      "guarded",
      serverRpc<undefined, null>(
        { id: "guarded" },
        { validator: null, middleware: [refuse], handler: () => null },
      ),
    );
    globalThis.fetch = throughHandler().fetch;

    const error = await clientRpc<undefined, null>("guarded")().then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(ServerFnError);
    const refused = error as ServerFnError;
    expect(refused.status).toBe(401);
    expect(refused.response?.headers.get("www-authenticate")).toBe("x");
    expect(await refused.response?.text()).toBe("sign in first");
  });

  test("a handler's own failure still says nothing but its status", async () => {
    mount(
      "broken",
      serverRpc<undefined, null>(
        { id: "broken" },
        {
          validator: null,
          middleware: [],
          handler: () => {
            throw new Error('relation "users_private" does not exist');
          },
        },
      ),
    );
    globalThis.fetch = throughHandler().fetch;
    const logged = console.error;
    console.error = () => {};
    try {
      const error = (await clientRpc<undefined, null>("broken")().catch(
        (thrown: unknown) => thrown,
      )) as ServerFnError;
      expect(error.status).toBe(500);
      expect(await error.response?.text()).toBe("internal server error");
    } finally {
      console.error = logged;
    }
  });
});

describe("appendResponseHeader", () => {
  test("adds to a header that is a list, where `setResponseHeader` would replace", async () => {
    mount(
      "varied",
      serverRpc<undefined, null>(
        { id: "varied" },
        {
          validator: null,
          middleware: [],
          handler: () => {
            appendResponseHeader("vary", "Cookie");
            appendResponseHeader("vary", "Accept-Language");
            return null;
          },
        },
      ),
    );
    const response = await throughHandler().fetch(`${ORIGIN}/_barq/fn/varied.data`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.headers.get("vary")).toBe("Cookie, Accept-Language");
  });
});
