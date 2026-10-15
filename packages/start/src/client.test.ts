import { afterEach, expect, test } from "bun:test";

import { decodeWire, encodeWire } from "@barqjs/server/codec";

import { RPC_CONTEXT, clientRpc, createMiddleware, serverRpc } from "./index.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";

const ORIGIN = "https://app.test";
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  unmountAll();
});

/** The browser's fetch, answered by the real request handler in-process. */
const throughHandler = (): void => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("origin", ORIGIN);
    const response = await handleServerFn(
      new Request(new URL(String(input), ORIGIN), { ...init, headers }),
    );
    return response ?? new Response("not found", { status: 404 });
  }) as typeof fetch;
};

test("a Response the handler returned reaches the caller as that Response", async () => {
  mount(
    "raw",
    serverRpc<undefined, Response>(
      { id: "raw" },
      {
        validator: null,
        middleware: [],
        handler: () => new Response("hi", { status: 201, headers: { "x-raw": "1" } }),
      },
    ),
  );
  throughHandler();

  const outcome = await clientRpc<undefined, Response>("raw")().then(
    (value) => value,
    (error: unknown) => error,
  );

  expect(outcome).toBeInstanceOf(Response);
  expect(await (outcome as Response).text()).toBe("hi");
});

test("overlapping calls each read the context their own response sent back", async () => {
  // Answers in REVERSE order of arrival, so the first call's response lands
  // while the second call is the most recent one.
  const pending: Array<() => void> = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const { input } = JSON.parse(String(init?.body)) as { input: unknown };
    const echo = decodeWire<string>(input);
    await new Promise<void>((resolve) => {
      pending.push(resolve);
    });
    return Response.json(encodeWire({ result: echo, context: { user: echo } }), {
      headers: { [RPC_CONTEXT]: "1" },
    });
  }) as typeof fetch;

  const reads = createMiddleware().client(async ({ next, context }) => {
    const result = await next();
    return { result, user: context.user };
  });
  const whoami = clientRpc<string, { result: string; user: unknown }>("whoami", [reads]);

  const first = whoami({ data: "salama" });
  const second = whoami({ data: "guest" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  for (const release of pending) release();

  expect(await first).toEqual({ result: "salama", user: "salama" });
  expect(await second).toEqual({ result: "guest", user: "guest" });
});

/**
 * A browser hides a redirect it was told not to follow: the response is
 * `opaqueredirect`, with status 0 and no headers (Fetch §4.4, "opaque-redirect
 * filtered response"). Bun and Node hand back the real 3xx, so only the shape
 * can be tested here.
 */
test("a handler's own 3xx is handed back in a browser, where it arrives opaque", async () => {
  const opaque = {
    type: "opaqueredirect",
    status: 0,
    ok: false,
    headers: new Headers(),
  } as unknown as Response;
  globalThis.fetch = (async () => opaque) as unknown as typeof fetch;

  const outcome = await clientRpc<undefined, Response>("moved")().then(
    (value) => value,
    (error: unknown) => error,
  );

  expect(outcome).toBe(opaque);
});
