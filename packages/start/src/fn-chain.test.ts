/**
 * A server function in `.middleware([...])` stands for the middleware it
 * declared, as in TanStack: its guards run and type the context, its handler
 * never runs.
 */

import { afterEach, expect, test } from "bun:test";

import { encodeWire } from "@barqjs/server/codec";

import { clientRpc, createMiddleware, createServerFn, middlewareOf } from "./index.ts";
import { unmountAll } from "./server.ts";

afterEach(unmountAll);

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const holds = <Check extends true>(proof?: Check): Check | undefined => proof;

test("listing a server function runs its middleware, typed, and not its handler", async () => {
  const ran: string[] = [];
  const auth = createMiddleware().server(({ next }) => {
    ran.push("auth");
    return next({ context: { user: "salama" } });
  });
  const whoami = createServerFn()
    .middleware([auth])
    .handler(({ context }) => {
      ran.push("whoami");
      return context.user;
    });
  const greet = createServerFn()
    .middleware([whoami])
    .handler(({ context }) => {
      holds<Equal<typeof context.user, string>>();
      return `hello ${context.user}`;
    });

  expect(await greet()).toBe("hello salama");
  expect(ran).toEqual(["auth"]);
  expect(middlewareOf(greet)).toEqual([auth]);
});

test("a second `.middleware` call adds to the chain, as TanStack's does", async () => {
  const order: string[] = [];
  const step = (name: string) =>
    createMiddleware().server(({ next }) => {
      order.push(name);
      return next();
    });
  const first = step("first");
  const second = step("second");
  const fn = createServerFn()
    .middleware([first])
    .middleware([second])
    .handler(() => null);
  await fn();
  expect(order).toEqual(["first", "second"]);
  expect(middlewareOf(fn)).toEqual([first, second]);
});

test("in the browser, the listed function's client halves run around the call", async () => {
  const sent: string[] = [];
  const traced = createMiddleware().client(({ next }) => {
    sent.push("traced");
    return next({ headers: { "x-trace": "salama" } });
  });
  const base = clientRpc<undefined, null, "GET">("calls.ts#base", [traced], { method: "GET" });
  const seen: { header: string | null } = { header: null };
  const send = (async (_url: string, init?: RequestInit) => {
    seen.header = new Headers(init?.headers).get("x-trace");
    return Response.json(encodeWire("ok"));
  }) as unknown as typeof fetch;
  const call = clientRpc<undefined, string, "GET">("calls.ts#call", [base], { method: "GET" });

  expect(await call({ fetch: send })).toBe("ok");
  expect(sent).toEqual(["traced"]);
  expect(seen.header).toBe("salama");
});
