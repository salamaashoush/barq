import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { type ViteDevServer, createServer } from "vite";

import { encodeWire } from "@barqjs/server/codec";

import { DATA_SUFFIX, RPC_PREFIX } from "../src/index.ts";
import { barqStart } from "../src/vite.ts";

const ROOT = fileURLToPath(new URL("./fixture", import.meta.url));

let server: ViteDevServer;
let origin = "";

beforeAll(async () => {
  server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: "error",
    server: { port: 0, host: "127.0.0.1" },
    resolve: {
      alias: {
        "@barqjs/start/server": fileURLToPath(new URL("../src/server.ts", import.meta.url)),
        "@barqjs/start/client": fileURLToPath(new URL("../src/client.ts", import.meta.url)),
        "@barqjs/start": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
      },
    },
    plugins: barqStart({ server: { maxBodySize: 256 } }),
  });
  // Discovery rides the client transform, as it does in `dev-server.test.ts`.
  await server.environments.client.transformRequest("/todos.ts");
  await server.listen();
  const address = server.httpServer?.address() as { port: number };
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await Promise.race([server?.close(), new Promise<void>((resolve) => setTimeout(resolve, 2_000))]);
});

const add = (title: string): Promise<Response> =>
  fetch(`${origin}${RPC_PREFIX}${encodeURIComponent("todos.ts#addTodo")}${DATA_SUFFIX}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ input: encodeWire(title) }),
  });

describe("the dev server reads a body under the cap the project configured", () => {
  test("a call over it is a 413, through a real socket", async () => {
    expect((await add("x".repeat(4096))).status).toBe(413);
  });

  test("a call under it reaches the handler", async () => {
    expect((await add("milk")).status).toBe(200);
  });
});
