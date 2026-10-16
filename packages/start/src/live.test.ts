/**
 * `live` over a function that answers with values rather than a frame: each
 * value is one event, read in the browser with its type intact, and an answer
 * that ends says so, which ends the loop rather than reconnecting it.
 */

import { afterEach, expect, test } from "bun:test";

import { type ServerFn, clientRpc, createServerFn, live } from "./index.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";

const ORIGIN = "https://example.com";
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  unmountAll();
});

const throughHandler = (seen: Response[]): void => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("origin", ORIGIN);
    const response =
      (await handleServerFn(new Request(new URL(String(input), ORIGIN), { ...init, headers }))) ??
      new Response("not found", { status: 404 });
    seen.push(response);
    return response;
  }) as typeof fetch;
};

test("each value an iterable yields is one event, typed, and the end closes the loop", async () => {
  const readings = createServerFn({ method: "GET" }).handler(async function* () {
    for (let n = 1; n <= 3; n++) yield { n, at: new Date(n * 1000) };
  });
  mount("live-readings", readings as ServerFn<never, unknown>);
  const seen: Response[] = [];
  throughHandler(seen);

  const stream = live(
    clientRpc<undefined, unknown, "GET">("live-readings", [], { method: "GET" }),
  )();
  const statuses: string[] = [];
  stream.onstatus = (status) => statuses.push(status);
  const received: { n: number; at: Date }[] = [];
  for await (const each of stream) received.push(each as { n: number; at: Date });

  expect(received.map((each) => each.n)).toEqual([1, 2, 3]);
  expect(received[2]!.at).toEqual(new Date(3000));
  expect(statuses).toEqual(["connected", "closed"]);
  expect(seen).toHaveLength(1);
  expect(seen[0]!.headers.get("x-barq-rpc")).toBe("live");
  expect(seen[0]!.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
});

test("a single value is one event", async () => {
  const once = createServerFn({ method: "GET" }).handler(() => "salama");
  mount("live-once", once as ServerFn<never, unknown>);
  const seen: Response[] = [];
  throughHandler(seen);

  const received: unknown[] = [];
  for await (const each of live(
    clientRpc<undefined, unknown, "GET">("live-once", [], { method: "GET" }),
  )()) {
    received.push(each);
  }

  expect(received).toEqual(["salama"]);
  expect(seen).toHaveLength(1);
});
