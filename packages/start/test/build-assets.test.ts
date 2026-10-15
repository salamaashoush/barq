import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBuilder } from "vite";

import { barqStart } from "../src/vite.ts";
import { ASSET_MANIFEST_FILE, type AssetManifest } from "../src/static.ts";

const ROOT = fileURLToPath(new URL("./spa-fixture", import.meta.url));
// Its own output directory, so this build and `spa.test.ts`'s never share one.
const OUT_NAME = "dist-assets";
const OUT = join(ROOT, OUT_NAME);

beforeAll(async () => {
  rmSync(OUT, { recursive: true, force: true });
  const builder = await createBuilder({
    root: ROOT,
    configFile: false,
    logLevel: "error",
    resolve: {
      alias: {
        "@barqjs/start/server": fileURLToPath(new URL("../src/server.ts", import.meta.url)),
        "@barqjs/start/client": fileURLToPath(new URL("../src/client.ts", import.meta.url)),
        "@barqjs/start/serve": fileURLToPath(new URL("../src/serve.ts", import.meta.url)),
        "@barqjs/start": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
      },
    },
    // Neither `prerender` nor `verify`: the configuration a project starts with.
    plugins: barqStart({ pages: false, outputDirectory: OUT_NAME }),
  });
  await builder.buildApp();
}, 60_000);

afterAll(() => rmSync(OUT, { recursive: true, force: true }));

describe("a build that configures neither prerender nor verify", () => {
  test("still writes the asset manifest the generated server reads", () => {
    expect(existsSync(join(OUT, "client", ASSET_MANIFEST_FILE))).toBe(true);
  });

  test("the manifest says which names are hashed, and only those", () => {
    const manifest = JSON.parse(
      readFileSync(join(OUT, "client", ASSET_MANIFEST_FILE), "utf8"),
    ) as AssetManifest;
    const chunks = readdirSync(join(OUT, "client", "assets")).map((name) => `/assets/${name}`);
    expect(manifest.hashed?.toSorted()).toEqual(chunks.toSorted());
    expect(manifest.files).toContain("/index.html");
    expect(manifest.hashed).not.toContain("/index.html");
  });

  test("`serve.js` answers the client chunk the document names", async () => {
    const port = 3500 + Math.floor(Math.random() * 100);
    const child = Bun.spawn(["bun", join(OUT, "server", "serve.js")], {
      env: { ...process.env, PORT: String(port) },
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      const base = `http://localhost:${port}`;
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          await fetch(base);
          break;
        } catch {
          await Bun.sleep(20);
        }
      }

      const asset = readdirSync(join(OUT, "client", "assets")).find((n) => n.endsWith(".js"));
      const chunk = await fetch(`${base}/assets/${asset}`);

      expect(chunk.status).toBe(200);
      expect(chunk.headers.get("content-type")).toContain("javascript");
      // Its name carries a hash of its bytes, so a browser never asks again.
      expect(chunk.headers.get("cache-control")).toBe("max-age=31536000, immutable");
      // The document's name is the same on every deploy, so it does.
      const document = await fetch(`${base}/index.html`);
      expect(document.status).toBe(200);
      expect(document.headers.get("cache-control")).toBeNull();
      expect(document.headers.get("etag")).not.toBeNull();
    } finally {
      child.kill();
      await child.exited;
    }
  }, 30_000);
});
