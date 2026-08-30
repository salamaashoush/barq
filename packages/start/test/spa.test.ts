/**
 * `pages: false` with the project's own `index.html` — the SPA deployment.
 *
 * `BarqStartOptions.pages` documents itself as "the server-function half alone,
 * which is a legitimate deployment — an SPA that calls RPC — and is what a
 * project with its own `index.html` wants". Two things made that false in a
 * build and both are asserted here.
 *
 * The client input was FORCED to `virtual:barq-entry-client` in every mode, so
 * `index.html` was not an input: the build emitted hashed chunks and no
 * document, and the deployment had nothing to serve. And the generated
 * `serve.js` had no fallback, so a path the build did not write — which is
 * every route of an SPA but `/` — reached the page handler and 404'd.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBuilder } from "vite";

import { barqStart } from "../src/vite.ts";

const ROOT = fileURLToPath(new URL("./spa-fixture", import.meta.url));
const OUT = join(ROOT, "dist");

let serve = "";

beforeAll(async () => {
  rmSync(OUT, { recursive: true, force: true });
  const builder = await createBuilder({
    root: ROOT,
    configFile: false,
    logLevel: "error",
    resolve: {
      alias: {
        // BEFORE the bare specifier: a string alias is a prefix replacement.
        "@barqjs/start/server": fileURLToPath(new URL("../src/server.ts", import.meta.url)),
        "@barqjs/start/client": fileURLToPath(new URL("../src/client.ts", import.meta.url)),
        "@barqjs/start/serve": fileURLToPath(new URL("../src/serve.ts", import.meta.url)),
        "@barqjs/start": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
      },
    },
    plugins: barqStart({ pages: false }),
  });
  await builder.buildApp();
  serve = readFileSync(join(OUT, "server", "serve.js"), "utf8");
}, 60_000);

afterAll(() => rmSync(OUT, { recursive: true, force: true }));

describe("a build that renders no pages", () => {
  test("builds the project's own index.html", () => {
    const document = join(OUT, "client", "index.html");
    expect(existsSync(document)).toBe(true);
    // Not the source file copied across: the entry it names is the hashed chunk
    // this build emitted, which is what proves `index.html` was the input.
    const asset = readdirSync(join(OUT, "client", "assets")).find((name) => name.endsWith(".js"));
    expect(readFileSync(document, "utf8")).toContain(asset as string);
  });

  test("the generated server falls back to that document", () => {
    expect(serve).toContain("spa:");
    expect(serve).toContain("../client/index.html");
  });

  test("still mounts the server functions", () => {
    const server = readFileSync(join(OUT, "server", "server.js"), "utf8");
    expect(server).toContain("src/data.ts#loadUser");
  });
});
