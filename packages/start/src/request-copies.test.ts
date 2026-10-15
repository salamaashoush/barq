/**
 * Two copies of the request context, as a host and the bundle it serves have.
 *
 * A build compiles `@barqjs/start` INTO its server bundle, and a host that
 * serves that bundle through its own `serveBarq` imported a second copy. The
 * registry and the start instance were already one per process; the request
 * was not, so a server function the host's handler ran asked the bundle's copy
 * for a request it had never been given, and every one that read a cookie or a
 * session answered 500.
 */

import { expect, test } from "bun:test";

import * as host from "./context.ts";

test("a request entered through one copy is the request every copy reads", async () => {
  const bundled = (await import(`./context.ts?bundled=${Date.now()}`)) as typeof host;
  expect(bundled.withRequest).not.toBe(host.withRequest);

  const request = new Request("https://example.com/", { headers: { cookie: "sid=salama" } });
  const seen = await host.withRequest(request, async () => bundled.getRequestHeader("cookie"));

  expect(seen).toBe("sid=salama");
});

test("an input refusal thrown by one copy is a 400 from another copy's handler", async () => {
  const { handleServerFn, mount, unmountAll } = await import("./server.ts");
  const { serverRpc } = await import("./index.ts");
  const bundled = (await import(
    `./middleware.ts?bundled=${Date.now()}`
  )) as typeof import("./middleware.ts");
  try {
    mount(
      "refused",
      serverRpc<undefined, null>(
        { id: "refused" },
        {
          validator: null,
          middleware: [],
          handler: () => {
            throw new bundled.ValidationError([{ message: "a bundled refusal" }]);
          },
        },
      ),
    );
    const response = await handleServerFn(
      new Request("https://example.com/_barq/fn/refused.data", {
        method: "POST",
        headers: { origin: "https://example.com", "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(response?.status).toBe(400);
  } finally {
    unmountAll();
  }
});
