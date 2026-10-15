/**
 * What a caller may put in a server function's `context`: nothing.
 *
 * The body's `context` is what the client halves of the chain asked to send,
 * and a caller writes that body by hand as readily as the stub does. `context`
 * is where a middleware puts what it VERIFIED, and a handler reads it as such,
 * so a key a caller can supply there is an identity a caller can claim. A
 * server step that sets the key unconditionally hides the problem; one that
 * sets it only for a signed-in caller does not.
 *
 * So the two never share an object. What the wire sent reaches a server half as
 * `clientContext`, and becomes `context` only where a server half says so.
 */

import { afterEach, describe, expect, test } from "bun:test";

import { encodeWire } from "@barqjs/server/codec";

import {
  type Middleware,
  DATA_SUFFIX,
  RPC_PREFIX,
  createMiddleware,
  getRequest,
  serverRpc,
} from "./index.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";

afterEach(unmountAll);

const ORIGIN = "https://example.com";

/** A call whose body claims `context`, as a hand-written request can. */
const claiming = (
  id: string,
  context: Record<string, unknown>,
  headers: Record<string, string> = {},
): Request =>
  new Request(`${ORIGIN}${RPC_PREFIX}${encodeURIComponent(id)}${DATA_SUFFIX}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: JSON.stringify({ input: encodeWire(undefined), context: encodeWire(context) }),
  });

/** Mounts a function under `chain` and records the `context` its handler was handed. */
const recording = (id: string, chain: readonly Middleware[]): Record<string, unknown>[] => {
  const seen: Record<string, unknown>[] = [];
  mount(
    id,
    serverRpc<undefined, null>(
      { id },
      {
        validator: null,
        middleware: chain,
        handler: ({ context }) => {
          seen.push({ ...context });
          return null;
        },
      },
    ),
  );
  return seen;
};

/** Names the user for a signed-in caller and says nothing for anyone else. */
const optionalUser: Middleware = async (next) =>
  getRequest().headers.has("cookie") ? next({ context: { user: "salama" } }) : next();

describe("a caller cannot write to `context`", () => {
  test("a key the chain sets only for a signed-in caller cannot be claimed by an anonymous one", async () => {
    const seen = recording("profile", [optionalUser]);

    await handleServerFn(claiming("profile", { user: "salama" }));
    await handleServerFn(claiming("profile", { user: "guest" }, { cookie: "sid=1" }));

    expect(seen).toEqual([{}, { user: "salama" }]);
  });

  test("a key no server step sets does not reach the handler", async () => {
    const seen = recording("admin", []);
    await handleServerFn(claiming("admin", { isAdmin: true }));
    expect(seen).toEqual([{}]);
  });

  test("a server half reads only what the steps outside it set", async () => {
    const roles: unknown[] = [];
    const audit = createMiddleware().server(async ({ next, context }) => {
      roles.push(context.role);
      return next();
    });
    recording("audited", [audit]);

    await handleServerFn(claiming("audited", { role: "admin" }));

    expect(roles).toEqual([undefined]);
  });
});

describe("what the client halves sent", () => {
  /** Sends a locale from the browser, and admits it on the server only once checked. */
  const locale = createMiddleware()
    .client(async ({ next }) => next({ sendContext: { locale: "ar" } }))
    .server(async ({ next, clientContext }) =>
      next({ context: { locale: clientContext.locale === "ar" ? "ar" : "en" } }),
    );

  test("reaches a server half as `clientContext`, and the handler only through it", async () => {
    const seen = recording("localised", [locale]);

    await handleServerFn(claiming("localised", { locale: "ar", user: "salama" }));
    await handleServerFn(claiming("localised", { locale: "../../etc" }));

    expect(seen).toEqual([{ locale: "ar" }, { locale: "en" }]);
  });

  test("is empty for a call made in-process, which has no wire", async () => {
    const sent: unknown[] = [];
    const reads = createMiddleware().server(async ({ next, clientContext }) => {
      sent.push({ ...clientContext });
      return next();
    });
    const fn = serverRpc<undefined, null>(
      { id: "local" },
      { validator: null, middleware: [reads], handler: () => null },
    );

    await fn();

    expect(sent).toEqual([{}]);
  });
});
