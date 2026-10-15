/**
 * The `signal` a handler is handed is the request's.
 *
 * A handler passes it to `fetch` or a query so that a caller who navigated away
 * stops paying for the work. One that never aborts is a promise the handler
 * cannot keep.
 */

import { afterEach, expect, test } from "bun:test";

import { encodeWire } from "@barqjs/server/codec";

import { DATA_SUFFIX, RPC_PREFIX, createMiddleware, serverRpc } from "./index.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";

afterEach(unmountAll);

const ORIGIN = "https://example.com";

const call = (id: string, signal: AbortSignal): Request =>
  new Request(`${ORIGIN}${RPC_PREFIX}${encodeURIComponent(id)}${DATA_SUFFIX}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ input: encodeWire(undefined) }),
    signal,
  });

test("a request that is aborted aborts the handler's signal", async () => {
  let seen: AbortSignal | undefined;
  let started: () => void = () => {};
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  mount(
    "slow",
    serverRpc<undefined, string>(
      { id: "slow" },
      {
        validator: null,
        middleware: [],
        handler: ({ signal }) => {
          seen = signal;
          started();
          return new Promise<string>((resolve) => {
            signal.addEventListener("abort", () => resolve("stopped"), { once: true });
          });
        },
      },
    ),
  );

  const client = new AbortController();
  const answering = handleServerFn(call("slow", client.signal));
  await running;
  expect(seen?.aborted).toBe(false);
  client.abort();
  await answering;
  expect(seen?.aborted).toBe(true);
});

test("a middleware's server half is handed the same signal", async () => {
  const seen: AbortSignal[] = [];
  const watch = createMiddleware().server(({ next, signal }) => {
    seen.push(signal);
    return next();
  });
  mount(
    "watched",
    serverRpc<undefined, null>(
      { id: "watched" },
      {
        validator: null,
        middleware: [watch],
        handler: ({ signal }) => {
          seen.push(signal);
          return null;
        },
      },
    ),
  );

  const client = new AbortController();
  client.abort();
  await handleServerFn(call("watched", client.signal));
  expect(seen.map((signal) => signal.aborted)).toEqual([true, true]);
});

test("a call made in-process, with no request, has a signal that never aborts", async () => {
  const fn = serverRpc<undefined, boolean>(
    { id: "local" },
    { validator: null, middleware: [], handler: ({ signal }) => signal.aborted },
  );
  expect(await fn()).toBe(false);
});
