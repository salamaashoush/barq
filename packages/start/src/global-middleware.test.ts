/**
 * `createStart`: the middleware an application declares once, and the order it
 * runs in around a server function. Global request middleware first, then
 * global function middleware, then the function's own chain.
 */

import { afterEach, expect, test } from "bun:test";

import { decodeWire } from "@barqjs/server/codec";

import {
  RPC_PREFIX,
  type ServerFn,
  clearStart,
  clientRpc,
  createMiddleware,
  createServerFn,
  createStart,
  getGlobalStartContext,
  setCookie,
  setResponseHeader,
} from "./index.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";

const ORIGIN = "https://example.com";
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  unmountAll();
  clearStart();
});

const call = (id: string, init?: RequestInit): Promise<Response | null> =>
  handleServerFn(
    new Request(`${ORIGIN}${RPC_PREFIX}${id}.data`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: "{}",
      ...init,
    }),
  );

const mounted = (id: string, fn: ServerFn<never, unknown>): void => mount(id, fn);

/** What a call answered with, off the wire. */
const answerOf = async (response: Response | null): Promise<unknown> =>
  decodeWire(await response?.json());

test("global request, then global function, then the function's own", async () => {
  const order: string[] = [];
  const step = (name: string) =>
    createMiddleware({ type: "function" }).server(({ next }) => {
      order.push(name);
      return next();
    });
  const own = step("own");
  createStart(() => ({
    requestMiddleware: [
      createMiddleware({ type: "request" }).server(({ next }) => {
        order.push("request");
        return next();
      }),
    ],
    functionMiddleware: [step("global-1"), step("global-2")],
  }));
  mounted(
    "ordered",
    createServerFn()
      .middleware([own])
      .handler(() => {
        order.push("handler");
        return "done";
      }),
  );

  const response = await call("ordered");
  expect(response?.status).toBe(200);
  expect(order).toEqual(["request", "global-1", "global-2", "own", "handler"]);
});

test("a request middleware is handed the request, and what it contributes reaches the handler", async () => {
  let seen: { path?: string; kind?: string; agent?: string | null } = {};
  let handled: Record<string, unknown> = {};
  let ambient: Record<string, unknown> = {};
  createStart(() => ({
    requestMiddleware: [
      createMiddleware({ type: "request" }).server(({ next, request, pathname, handlerType }) => {
        seen = { path: pathname, kind: handlerType, agent: request.headers.get("user-agent") };
        return next({ context: { visitor: "salama" } });
      }),
    ],
  }));
  mounted(
    "who",
    createServerFn().handler(({ context }) => {
      handled = context;
      ambient = getGlobalStartContext();
      return null;
    }),
  );

  await call("who", {
    headers: { "content-type": "application/json", origin: ORIGIN, "user-agent": "probe" },
  });
  expect(seen).toEqual({ path: `${RPC_PREFIX}who.data`, kind: "serverFn", agent: "probe" });
  expect(handled).toEqual({ visitor: "salama" });
  expect(ambient).toEqual({ visitor: "salama" });
});

test("a request middleware does not run for a call that is refused before it", async () => {
  let ran = 0;
  createStart(() => ({
    requestMiddleware: [
      createMiddleware({ type: "request" }).server(({ next }) => {
        ran++;
        return next();
      }),
    ],
  }));
  mounted(
    "guarded",
    createServerFn().handler(() => null),
  );

  const forged = await call("guarded", {
    headers: { "content-type": "application/json", origin: "https://evil.example.com" },
  });
  const unknown = await call("nothing-here");
  const byGet = await handleServerFn(
    new Request(`${ORIGIN}${RPC_PREFIX}guarded.data`, { headers: { origin: ORIGIN } }),
  );
  expect([forged?.status, unknown?.status, byGet?.status]).toEqual([403, 404, 405]);
  expect(ran).toBe(0);
});

test("a request middleware can refuse, replace the answer, and write to it afterwards", async () => {
  let handlerRan = false;
  createStart(() => ({
    requestMiddleware: [
      createMiddleware({ type: "request" }).server(async ({ next, request }) => {
        if (request.headers.get("x-refuse") === "1") {
          setCookie("seen", "1");
          throw new Response("sign in first", { status: 401 });
        }
        if (request.headers.get("x-replace") === "1") return new Response("replaced");
        const response = await next();
        setResponseHeader("x-after", "yes");
        return response;
      }),
    ],
  }));
  mounted(
    "answer",
    createServerFn().handler(() => {
      handlerRan = true;
      setCookie("from-handler", "1");
      return "value";
    }),
  );
  const headers = { "content-type": "application/json", origin: ORIGIN };

  const refused = await call("answer", { headers: { ...headers, "x-refuse": "1" } });
  expect(refused?.status).toBe(401);
  expect(refused?.headers.getSetCookie()).toEqual(["seen=1; Path=/"]);
  expect(handlerRan).toBe(false);

  const replaced = await call("answer", { headers: { ...headers, "x-replace": "1" } });
  expect(await replaced?.text()).toBe("replaced");
  expect(handlerRan).toBe(false);

  const through = await call("answer", { headers });
  expect(through?.status).toBe(200);
  expect(through?.headers.get("x-after")).toBe("yes");
  // Folded in by the handler and again around the middleware: sent once.
  expect(through?.headers.getSetCookie()).toEqual(["from-handler=1; Path=/"]);
});

test("a middleware the function lists as well as the application runs once", async () => {
  let ran = 0;
  const shared = createMiddleware({ type: "function" }).server(({ next }) => {
    ran++;
    return next();
  });
  createStart(() => ({ functionMiddleware: [shared] }));
  mounted(
    "once",
    createServerFn()
      .middleware([shared])
      .handler(() => null),
  );
  await call("once");
  expect(ran).toBe(1);
});

test("a global function middleware's client half runs around every call", async () => {
  const sent: string[] = [];
  createStart(() => ({
    functionMiddleware: [
      createMiddleware({ type: "function" }).client(({ next }) => {
        sent.push("client-half");
        return next({ headers: { "x-trace": "t1" } });
      }),
    ],
  }));
  mounted(
    "traced",
    createServerFn().handler(() => "ok"),
  );
  let trace: string | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    trace = headers.get("x-trace");
    headers.set("origin", ORIGIN);
    return (
      (await handleServerFn(new Request(new URL(String(input), ORIGIN), { ...init, headers }))) ??
      new Response("not found", { status: 404 })
    );
  }) as typeof fetch;

  expect(await clientRpc<undefined, string>("traced")()).toBe("ok");
  expect(sent).toEqual(["client-half"]);
  expect(trace as string | null).toBe("t1");
});

test("with no createStart nothing is added to a call", async () => {
  mounted(
    "plain",
    createServerFn().handler(({ context }) => Object.keys(context).length),
  );
  const response = await call("plain");
  expect(await answerOf(response)).toBe(0);
});
