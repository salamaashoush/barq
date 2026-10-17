import { shellReady } from "@barqjs/web";
import { expect, test } from "bun:test";
import { runInThisContext } from "node:vm";

import { renderToStream } from "./server.ts";
import { html } from "./ssr.ts";

test("a client that runs mid-parse waits for the marker the stream writes after its shell", async () => {
  const body = await new Response(
    renderToStream(() => html("<html><head></head><body><main>salama</main></body></html>"))
      .readable,
  ).text();
  const marker = /<script>([^<]*window\.__BARQ_SHELL__=1[^<]*)<\/script>/.exec(body)?.[1];
  expect(marker).toBeDefined();

  const global = globalThis as { __BARQ_SHELL__?: number };
  delete global.__BARQ_SHELL__;
  Object.defineProperty(document, "readyState", { value: "loading", configurable: true });
  let ready = false;
  try {
    const waiting = shellReady().then(() => {
      ready = true;
    });
    await Promise.resolve();
    expect(ready).toBe(false);
    runInThisContext(marker ?? "");
    await waiting;
    expect(ready).toBe(true);
  } finally {
    delete (document as { readyState?: unknown }).readyState;
    delete global.__BARQ_SHELL__;
  }
});
