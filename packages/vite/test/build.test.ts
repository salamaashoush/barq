/**
 * The three `create-barq` templates, each built by its own `vite.config.ts`
 * and served by `vite preview`.
 *
 * Every template's config is now one `barq()` call, and these are the three
 * shapes it takes: server-rendered with `ssr` and `start`, client-rendered with
 * `start` alone, and the compiler with neither. Preview is what runs the built
 * server, so a page answered here is a page the build can serve.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { type PreviewServer, createBuilder, preview } from "vite";

import { encodeWire } from "@barqjs/server/codec";
import { DATA_SUFFIX, PAYLOAD_PARAM, RPC_CALLER, RPC_PREFIX } from "@barqjs/start";

import { PORTS, cleanUp, project } from "./project.ts";

afterAll(cleanUp);

async function buildAndPreview(
  template: "full-stack" | "spa" | "minimal",
  port: number,
): Promise<{ root: string; server: PreviewServer; origin: string }> {
  const root = project(template);
  const builder = await createBuilder({ root, configLoader: "runner", logLevel: "silent" });
  await builder.buildApp();
  const server = await preview({
    root,
    configLoader: "runner",
    logLevel: "silent",
    preview: { port, strictPort: true, host: "127.0.0.1" },
  });
  return { root, server, origin: `http://127.0.0.1:${port}` };
}

const page = (origin: string, path: string): Promise<Response> =>
  fetch(`${origin}${path}`, { headers: { accept: "text/html" } });

describe("the full-stack template: `barq({ ssr: true, start })`", () => {
  let built: Awaited<ReturnType<typeof buildAndPreview>>;
  beforeAll(async () => {
    built = await buildAndPreview("full-stack", PORTS.fullStack);
  }, 120_000);
  afterAll(() => built?.server.close());

  test("builds the client, the server, and a prerendered page", () => {
    const { root } = built;
    expect(readdirSync(join(root, "dist", "client", "assets")).length).toBeGreaterThan(0);
    for (const file of ["server.js", "serve.js", "index.js"]) {
      expect(existsSync(join(root, "dist", "server", file)), file).toBe(true);
    }
    expect(readFileSync(join(root, "dist", "client", "index.html"), "utf8")).toContain(
      "<h1>barq</h1>",
    );
    // The table was generated, from the one place that declares it.
    expect(existsSync(join(root, "src", "routeTree.gen.ts"))).toBe(true);
  });

  test("compiles both halves hydratable, because `ssr` says the client hydrates", async () => {
    const html = await (await page(built.origin, "/about")).text();
    expect(html).toContain("<!--[-->");
  });

  test("serves a server-rendered page whose loader called a server function", async () => {
    const response = await page(built.origin, "/about");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("Hello from the server.");
  });

  test("serves an API route and answers a miss with the app's own 404", async () => {
    const health = await fetch(`${built.origin}/api/health`);
    expect(await health.json()).toEqual({ ok: true });
    expect((await page(built.origin, "/nothing-here")).status).toBe(404);
  });
});

describe("the spa template: `barq({ start: true })`", () => {
  let built: Awaited<ReturnType<typeof buildAndPreview>>;
  beforeAll(async () => {
    built = await buildAndPreview("spa", PORTS.spa);
  }, 120_000);
  afterAll(() => built?.server.close());

  test("builds `index.html` as the document, and a server for its functions", () => {
    const { root } = built;
    const document = readFileSync(join(root, "dist", "client", "index.html"), "utf8");
    expect(document).not.toContain("/src/main.tsx");
    expect(existsSync(join(root, "dist", "server", "index.js"))).toBe(true);
  });

  test("answers every navigation with that document", async () => {
    for (const path of ["/", "/about", "/nothing-here"]) {
      const response = await page(built.origin, path);
      expect(response.status, path).toBe(200);
      expect(await response.text()).toContain('<div id="app">');
    }
  });

  test("calls its server function by id, and ships none of its body", () => {
    const assets = join(built.root, "dist", "client", "assets");
    const client = readdirSync(assets)
      .filter((name) => name.endsWith(".js"))
      .map((name) => readFileSync(join(assets, name), "utf8"))
      .join("\n");
    expect(client).toContain("src/data/greeting.ts#greeting");
    expect(client).not.toContain("Hello from the server.");
  });

  test("answers that server function through the built server", async () => {
    // A GET function, called the way its stub calls it.
    const id = encodeURIComponent("src/data/greeting.ts#greeting");
    const payload = encodeURIComponent(JSON.stringify({ input: encodeWire(undefined) }));
    const response = await fetch(
      `${built.origin}${RPC_PREFIX}${id}${DATA_SUFFIX}?${PAYLOAD_PARAM}=${payload}`,
      { headers: { origin: built.origin, [RPC_CALLER]: "1" } },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Hello from the server.");
  });
});

describe("the minimal template: `barq()`", () => {
  let built: Awaited<ReturnType<typeof buildAndPreview>>;
  beforeAll(async () => {
    built = await buildAndPreview("minimal", PORTS.minimal);
  }, 120_000);
  afterAll(() => built?.server.close());

  test("is a plain Vite build: no server, no route table", () => {
    const { root } = built;
    expect(existsSync(join(root, "dist", "index.html"))).toBe(true);
    expect(existsSync(join(root, "dist", "server"))).toBe(false);
    expect(existsSync(join(root, "src", "routeTree.gen.ts"))).toBe(false);
  });

  test("serves its document", async () => {
    const response = await page(built.origin, "/");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<div id="app">');
  });
});
