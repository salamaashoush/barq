import { afterEach, expect, test } from "bun:test";

import { encodeWire } from "@barqjs/server/codec";

import { type Middleware, DATA_SUFFIX, RPC_PREFIX, serverRpc } from "./index.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";

afterEach(unmountAll);

const ORIGIN = "https://app.test";

const post = (id: string): Request =>
  new Request(`${ORIGIN}${RPC_PREFIX}${encodeURIComponent(id)}${DATA_SUFFIX}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ input: encodeWire(undefined) }),
  });

/** Calls the rest of the chain again when the first attempt fails. */
const retryOnce: Middleware = async (next) => {
  try {
    return await next();
  } catch {
    return await next();
  }
};

test("a second next() never reaches the handler past a guard that refused", async () => {
  let ran = 0;
  const deny: Middleware = async () => {
    throw new Response("unauthorized", { status: 401 });
  };
  mount(
    "guarded",
    serverRpc<undefined, string>(
      { id: "guarded" },
      {
        validator: null,
        middleware: [retryOnce, deny],
        handler: () => {
          ran += 1;
          return "secret";
        },
      },
    ),
  );

  // Whether a repeated next() re-enters the chain or is refused outright is the
  // runner's choice; answering 200 with the guarded value is neither.
  const response = await handleServerFn(post("guarded")).catch(() => null);

  expect(ran, "the handler ran although the guard refused every attempt").toBe(0);
  expect(response?.status).not.toBe(200);
});
