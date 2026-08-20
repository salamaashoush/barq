/**
 * The whole pipeline, through a real Vite dev server.
 *
 * Every other test in this package drives one piece with the others stubbed.
 * This one boots Vite, lets the compiler plugin transform a module for both
 * environments, lets the manifest mount what it found, and calls a server
 * function over HTTP — so a break anywhere between the compiler's id and the
 * registry's key surfaces here as a 404 rather than as a green unit test.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Server, createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { type ViteDevServer, createServer } from "vite";

import { barqStart } from "../src/vite.ts";
import { encodeWire } from "@barqjs/server/codec";

import { DATA_SUFFIX, RPC_PREFIX } from "../src/index.ts";

const ROOT = fileURLToPath(new URL("./fixture", import.meta.url));

let server: ViteDevServer;
let http: Server;
let origin: string;

beforeAll(async () => {
  server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: "error",
    server: { middlewareMode: true },
    // The fixture lives inside this package, so the workspace links that make
    // `@barqjs/start` resolvable from an app are not on its resolution path.
    resolve: {
      alias: {
        "@barqjs/start/server": fileURLToPath(new URL("../src/server.ts", import.meta.url)),
        "@barqjs/start": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
      },
    },
    plugins: barqStart(),
  });
  // Discovery rides the client transform, so the module has to have been asked
  // for at least once — which in a real app is what importing it does.
  await server.environments.client.transformRequest("/todos.ts");

  // A REAL socket, because that is what the handler is written against: srvx
  // builds its `Request` from a Node req/res pair, and a hand-rolled stand-in
  // proves the test's fake works rather than that the server does.
  http = createHttpServer(server.middlewares);
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address() as { port: number };
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  // Keep-alive sockets outlive `close()` and hold the suite open.
  http?.closeAllConnections();
  await new Promise<void>((resolve) => http?.close(() => resolve()));
  // Bounded: a dev server with a module runner still resolving does not always
  // settle, and a teardown that can hang turns a green suite into a timeout
  // with no failing assertion to read.
  await Promise.race([server?.close(), new Promise<void>((resolve) => setTimeout(resolve, 2_000))]);
});

const call = (id: string, input: unknown, headers: Record<string, string> = {}) =>
  fetch(`${origin}${RPC_PREFIX}${encodeURIComponent(id)}${DATA_SUFFIX}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...headers },
    // The real encoder, not a hand-written approximation of its output: this
    // test exists to catch a mismatch between the two halves, and inventing the
    // shape here would be a third half to get wrong.
    body: JSON.stringify({ input: encodeWire(input) }),
  });

describe("a server function, end to end through Vite", () => {
  test("the client transform synthesizes stubs and drops the server module", async () => {
    const result = await server.environments.client.transformRequest("/todos.ts");
    const code = result?.code ?? "";

    expect(code).toContain("clientRpc");
    expect(code).toContain("todos.ts#addTodo");
    // The bare-import-and-secret pair that defeats dead-code elimination.
    expect(code).not.toContain("server-only-token");
    expect(code).not.toContain("./db");
    expect(code).not.toContain("store.push");
    // Export-ness: `internal` is never exported, so it gets no stub and no id.
    // `usesInternal` is exported and calls it in-process, which is the point.
    expect(code).toContain("usesInternal");
    expect(code).not.toContain('"todos.ts#internal"');
  });

  test("the ssr transform keeps the module intact", async () => {
    const result = await server.environments.ssr.transformRequest("/todos.ts");
    const code = result?.code ?? "";
    expect(code).toContain("store.push");
    expect(code).toContain("createServerFn");
  });

  test("the manifest mounts exactly what the stubs call", async () => {
    const manifest = await server.environments.ssr.transformRequest("virtual:barq-server-fns");
    const code = manifest?.code ?? "";
    expect(code).toContain("todos.ts#addTodo");
    expect(code).toContain("todos.ts#listTodos");
    // Never exported, so never mounted — no id, no endpoint.
    expect(code).not.toContain("#internal");
  });

  test("calling one over HTTP reaches the handler and comes back", async () => {
    const added = await call("todos.ts#addTodo", "milk");
    expect(added.status).toBe(200);

    const listed = await call("todos.ts#listTodos", undefined);
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as unknown;
    expect(JSON.stringify(body)).toContain("milk");
  });

  test("an unmounted id is a 404 rather than an HTML page", async () => {
    const response = await call("todos.ts#nope", undefined);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type") ?? "").not.toContain("text/html");
  });

  test("the dev middleware enforces the same origin rule as production", async () => {
    const response = await call("todos.ts#listTodos", undefined, {
      origin: "https://evil.test",
    });
    expect(response.status).toBe(403);
  });
});
