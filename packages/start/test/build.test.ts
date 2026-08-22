/**
 * A real two-environment `vite build`, and the three facts only one can show.
 *
 * The manifest is a RACE against the graph walk. `found` is filled by the
 * compiler's `onServerFns`, which fires on transform; the manifest is a static
 * import of the server entry, so rolldown loads it before it has walked to any
 * server-function module. Measured before this test existed: the built server
 * mounted NOTHING and every RPC 404'd, on an app that works perfectly in dev —
 * dev survives it on the module-graph invalidation `record` does, and a build
 * has no invalidation.
 *
 * It is green because every plugin `barqStart()` returns carries
 * `sharedDuringBuild`. Sharing SOME is worse than sharing none: `found` lives in
 * one closure, only the compiler plugin fills it, and with `sharedConfigBuild`
 * false Vite re-resolves the whole config per environment — so an unshared
 * compiler plugin belongs to a different `barqStart()` call than the shared
 * manifest reads from.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBuilder } from "vite";

import { barqStart } from "../src/vite.ts";

const ROOT = fileURLToPath(new URL("./build-fixture", import.meta.url));
const OUT = join(ROOT, "dist");

let client = "";
let server = "";
let pages: readonly { path: string; file: string; headers: Record<string, string> }[] = [];

beforeAll(async () => {
  rmSync(OUT, { recursive: true, force: true });
  const builder = await createBuilder({
    root: ROOT,
    configFile: false,
    logLevel: "error",
    resolve: {
      alias: {
        "@barqjs/start/server": fileURLToPath(new URL("../src/server.ts", import.meta.url)),
        "@barqjs/start": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
      },
    },
    plugins: barqStart({
      pages: false,
      // `/` only: everything else has to be found by CRAWLING it.
      prerender: { routes: ["/"], onPages: (written) => (pages = written) },
    }),
  });
  await builder.buildApp();

  const assets = join(OUT, "client", "assets");
  client = readdirSync(assets)
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(join(assets, name), "utf8"))
    .join("\n");
  server = readFileSync(join(OUT, "server", "server.js"), "utf8");
}, 60_000);

afterAll(() => rmSync(OUT, { recursive: true, force: true }));

describe("a production build", () => {
  test("mounts every server function the client can call", () => {
    // The id, byte for byte, is the one the client stub asks for.
    expect(server).toContain('"src/data.ts#loadUser"');
    expect(server).toMatch(/mount\w*\("src\/data\.ts#loadUser"/);
  });

  test("keeps the handler's body out of the browser", () => {
    expect(client).not.toContain("server-only-secret-must-not-ship");
    expect(server).toContain("server-only-secret-must-not-ship");
    // What the client got instead: the synthesized stub, under the same id.
    expect(client).toContain("src/data.ts#loadUser");
  });

  test("carries the client's own emitted chunk name into the server half", () => {
    const assets = readdirSync(join(OUT, "client", "assets")).filter((n) => n.endsWith(".js"));
    expect(assets).toHaveLength(1);
    // Not a reconstruction of the input name — TanStack's #8118 is exactly that
    // — but the name the client build actually emitted.
    expect(server).toContain(assets[0]);
  });
});

/**
 * SSG, and the decision it rests on.
 *
 * A prerendered page is the same handler with `stream: false`, which is a
 * different RENDERER rather than a buffered stream. SvelteKit and Nitro buffer,
 * and their static files carry the streaming protocol — placeholders and swap
 * scripts for data that was fully known at build time — because the protocol is
 * emitted at flush time and buffering happens after.
 */
describe("prerendering", () => {
  test("writes the seed path and everything the crawl reaches from it", () => {
    expect(pages.map((page) => page.path).toSorted()).toEqual(["/", "/about", "/deep/page"]);
    expect(readFileSync(join(OUT, "client", "index.html"), "utf8")).toContain("<h1>home</h1>");
    // A clean URL becomes a directory index, which every static host serves
    // without configuration.
    expect(readFileSync(join(OUT, "client", "about", "index.html"), "utf8")).toContain("about");
    expect(readFileSync(join(OUT, "client", "deep", "page", "index.html"), "utf8")).toContain(
      "deep",
    );
  });

  test("takes the NON-streaming arm of the same handler", () => {
    const home = readFileSync(join(OUT, "client", "index.html"), "utf8");
    expect(home).not.toContain("<!--streamed-->");
  });

  test("crawls without looping and without duplicating a path", () => {
    // `/about` links back to `/`, and `/` is already seen. A crawler that keys
    // on the un-normalised path — or that appends a trailing slash inside a
    // query — never terminates; both are open bugs in the nearest prior art.
    expect(pages).toHaveLength(3);
  });

  test("records each page's response headers, which a file cannot carry", () => {
    const about = pages.find((page) => page.path === "/about");
    expect(about?.headers["x-page"]).toBe("/about");
    expect(about?.headers["content-type"]).toContain("text/html");
  });

  test("the static files carry the client's real chunk", () => {
    const home = readFileSync(join(OUT, "client", "index.html"), "utf8");
    const asset = readdirSync(join(OUT, "client", "assets")).find((n) => n.endsWith(".js"));
    expect(home).toContain(asset as string);
  });
});
