import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBuilder } from "vite";

import { barqStart } from "../src/start.ts";
import { ASSET_MANIFEST_FILE } from "@barqjs/start/serve";

const ROOT = fileURLToPath(new URL("./fixtures/build", import.meta.url));
// Its own output directory, so this build and `build.test.ts`'s never share one.
const OUT_NAME = "dist-encoded";
const OUT = join(ROOT, OUT_NAME);

// A `public/` made here rather than committed: two names a URL has to
// percent-encode, which is what an upload or a CMS export produces.
const publicDir = mkdtempSync(join(tmpdir(), "barq-public-"));
writeFileSync(join(publicDir, "release notes.txt"), "notes\n");
writeFileSync(join(publicDir, "café.txt"), "menu\n");
writeFileSync(join(publicDir, "plain.txt"), "plain\n");

beforeAll(async () => {
  rmSync(OUT, { recursive: true, force: true });
  const builder = await createBuilder({
    root: ROOT,
    configFile: false,
    logLevel: "error",
    publicDir,
    resolve: {
      alias: {
        "@barqjs/start/server": fileURLToPath(
          new URL("../../start/src/server.ts", import.meta.url),
        ),
        "@barqjs/start/client": fileURLToPath(
          new URL("../../start/src/client.ts", import.meta.url),
        ),
        "@barqjs/start/serve": fileURLToPath(new URL("../../start/src/serve.ts", import.meta.url)),
        "@barqjs/start": fileURLToPath(new URL("../../start/src/index.ts", import.meta.url)),
      },
    },
    plugins: barqStart({
      pages: false,
      outputDirectory: OUT_NAME,
      prerender: { routes: ["/"] },
    }),
  });
  await builder.buildApp();
}, 60_000);

afterAll(() => {
  rmSync(OUT, { recursive: true, force: true });
  rmSync(publicDir, { recursive: true, force: true });
});

describe("a public file whose name a URL percent-encodes", () => {
  test("is in the build's own manifest", () => {
    const manifest = readFileSync(join(OUT, "client", ASSET_MANIFEST_FILE), "utf8");
    expect(manifest).toContain("release notes.txt");
  });

  test("is served by `serve.js` at the URL a browser asks for", async () => {
    const port = 3700 + Math.floor(Math.random() * 100);
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

      const [plain, spaced, accented] = await Promise.all([
        fetch(`${base}/plain.txt`),
        fetch(`${base}/release%20notes.txt`),
        fetch(`${base}/caf%C3%A9.txt`),
      ]);

      expect(plain.status).toBe(200);
      expect(spaced.status).toBe(200);
      expect(await spaced.text()).toBe("notes\n");
      expect(accented.status).toBe(200);
    } finally {
      child.kill();
      await child.exited;
    }
  }, 30_000);
});
