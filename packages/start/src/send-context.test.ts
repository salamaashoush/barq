import { afterEach, expect, test } from "bun:test";

import { decodeWire, encodeWire } from "@barqjs/server/codec";

import {
  DATA_SUFFIX,
  RPC_CONTEXT,
  RPC_PREFIX,
  createMiddleware,
  getRequest,
  serverRpc,
} from "./index.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";

afterEach(unmountAll);

const ORIGIN = "https://app.test";

const post = (id: string, user: string): Request =>
  new Request(`${ORIGIN}${RPC_PREFIX}${encodeURIComponent(id)}${DATA_SUFFIX}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, "x-user": user },
    body: JSON.stringify({ input: encodeWire(undefined) }),
  });

const contextOf = async (response: Response | null): Promise<unknown> => {
  if (response === null || response.headers.get(RPC_CONTEXT) === null) return undefined;
  return decodeWire<{ context: unknown }>(await response.json()).context;
};

test("two requests settling in the same tick each get their own sendContext", async () => {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });

  const whoami = createMiddleware().server(async ({ next }) =>
    next({ sendContext: { user: getRequest().headers.get("x-user") } }),
  );
  mount(
    "me",
    serverRpc<undefined, string>(
      { id: "me" },
      {
        validator: null,
        middleware: [whoami],
        // One shared promise both handlers wait on: a connection pool, a cache
        // fill, a batched loader.
        handler: async () => {
          await gate;
          return "ok";
        },
      },
    ),
  );

  const first = handleServerFn(post("me", "salama"));
  const second = handleServerFn(post("me", "guest"));
  await new Promise((resolve) => setTimeout(resolve, 5));
  open();
  const [a, b] = await Promise.all([first, second]);

  expect(await contextOf(a)).toEqual({ user: "salama" });
  expect(await contextOf(b)).toEqual({ user: "guest" });
});
