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
    base: "/app/",
    // Vite's OWN listener, not middleware mode: its base middleware only
    // refuses a path outside the base when Vite owns the server, which is what
    // `vite dev` is.
    server: { port: 0, host: "127.0.0.1" },
    resolve: {
      alias: {
        "@barqjs/start/server": fileURLToPath(new URL("../src/server.ts", import.meta.url)),
        "@barqjs/start/client": fileURLToPath(new URL("../src/client.ts", import.meta.url)),
        "@barqjs/start": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
      },
    },
    plugins: barqStart(),
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

describe("`vite dev` under a base other than /", () => {
  test("a page inside the base reaches the server entry", async () => {
    const response = await fetch(`${origin}/app/anything`, { redirect: "manual" });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("path:");
  });

  test("the base itself answers rather than redirecting to itself", async () => {
    const response = await fetch(`${origin}/app/`, { redirect: "manual" });
    expect(response.headers.get("location")).not.toBe("/app/");
    expect(response.status).toBe(200);
  });

  test("a server function inside the base reaches its handler", async () => {
    const id = encodeURIComponent("todos.ts#listTodos");
    const response = await fetch(`${origin}/app${RPC_PREFIX}${id}${DATA_SUFFIX}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ input: encodeWire(undefined) }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("json");
  });

  test("Vite still serves its own client inside the base", async () => {
    const response = await fetch(`${origin}/app/@vite/client`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("javascript");
  });
});
