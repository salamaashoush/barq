/**
 * What a handler and a middleware are told about the function they run for,
 * and what the function says about itself: TanStack's `method` and
 * `serverFnMeta`, beside barq's `meta`.
 */

import { afterEach, expect, test } from "bun:test";

import { encodeWire } from "@barqjs/server/codec";

import { clientRpc, createMiddleware, createServerFn, json } from "./index.ts";
import { mount, unmountAll } from "./server.ts";

afterEach(unmountAll);

test("a handler is handed its method and the id it is mounted at", async () => {
  const seen: unknown[] = [];
  const recorded = createMiddleware().server(({ next, method, serverFnMeta }) => {
    seen.push(["middleware", method, serverFnMeta?.id]);
    return next();
  });
  const notes = createServerFn({ method: "GET" })
    .middleware([recorded])
    .handler(({ method, serverFnMeta }) => {
      seen.push(["handler", method, serverFnMeta.id]);
      return null;
    });
  mount("notes.ts#list", notes);
  await notes();
  expect(seen).toEqual([
    ["middleware", "GET", "notes.ts#list"],
    ["handler", "GET", "notes.ts#list"],
  ]);
});

test("a function says its method and its id under TanStack's names", () => {
  expect(createServerFn().handler(() => null).method).toBe("GET");
  const save = createServerFn({ method: "POST" }).handler(() => null);
  mount("notes.ts#save", save);
  expect(save.method).toBe("POST");
  expect(save.serverFnMeta.id).toBe("notes.ts#save");
  expect(save.serverFnMeta).toBe(save.meta);

  const stub = clientRpc<undefined, null, "GET">("notes.ts#list", [], { method: "GET" });
  expect(stub.method).toBe("GET");
  expect(stub.serverFnMeta).toEqual({ id: "notes.ts#list", method: "GET" });
});

test("a client half is told the method too", async () => {
  let seen: unknown;
  const recorded = createMiddleware().client(({ next, method }) => {
    seen = method;
    return next();
  });
  const send = (async () => Response.json(encodeWire(null))) as unknown as typeof fetch;
  await clientRpc<undefined, null, "GET">("notes.ts#list", [recorded], { method: "GET" })({
    fetch: send,
  });
  expect(seen).toBe("GET");
});

test("`json` is a JSON response, which a handler returns as its answer", async () => {
  const answer = json({ by: "salama" }, { status: 201, headers: { "x-by": "example.com" } });
  expect(answer.status).toBe(201);
  expect(answer.headers.get("content-type")).toContain("application/json");
  expect(answer.headers.get("x-by")).toBe("example.com");
  expect(await answer.json()).toEqual({ by: "salama" });
});
