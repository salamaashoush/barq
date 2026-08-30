/**
 * What the build-time manifest buys, as gates rather than as a measurement.
 *
 * Two properties matter and neither is visible from a passing page render: a
 * MISS must not touch the filesystem, which is the whole reason the manifest
 * exists; and a prerendered page must be served with the STATUS it was rendered
 * as, which is the bug that shipped for as long as anything read the output
 * directory alone.
 */

import { afterAll, describe, expect, test } from "bun:test";

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type AssetManifest, assetMiddleware } from "./static.ts";

const dir = mkdtempSync(join(tmpdir(), "barq-static-"));
mkdirSync(join(dir, "assets"), { recursive: true });
mkdirSync(join(dir, "gone"), { recursive: true });
writeFileSync(join(dir, "assets", "app-abc123.js"), "export const x = 1;\n");
writeFileSync(join(dir, "index.html"), "<!doctype html><title>home</title>\n");
writeFileSync(join(dir, "gone", "index.html"), "<!doctype html><title>not here</title>\n");

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const manifest: AssetManifest = {
  pages: {
    "/": { file: "index.html", status: 200 },
    // A prerendered 404 page. `notFound()` in a loader renders one, the
    // prerenderer writes it, and the STATUS is the only thing that makes it a
    // 404 rather than a page that happens to say so.
    "/gone": {
      file: "gone/index.html",
      status: 404,
      headers: { "x-from": "manifest" },
    },
  },
  files: ["/assets/app-abc123.js"],
};

const ask = async (path: string): Promise<{ response: Response; fellThrough: boolean }> => {
  const middleware = assetMiddleware({ dir, manifest });
  let fellThrough = false;
  const response = await middleware(new Request(`http://localhost${path}`), () => {
    fellThrough = true;
    return new Response("page handler", { status: 200 });
  });
  return { response, fellThrough };
};

describe("the manifest decides, and the filesystem is not asked first", () => {
  test("a path the build never wrote falls through, and reads nothing", async () => {
    const { response, fellThrough } = await ask("/store");
    expect(fellThrough).toBe(true);
    expect(await response.text()).toBe("page handler");
  });

  /**
   * The failure the manifest exists to make impossible.
   *
   * `existsSync` + `statSync` per request answers this correctly too — it just
   * pays two syscalls to do it, on every SSR request, which is the common case.
   * What a `Set.has` cannot do is be WRONG about it, so this pins the answer
   * rather than the cost.
   */
  test("a file that exists on disk but not in the manifest still falls through", async () => {
    writeFileSync(join(dir, "sneaked.txt"), "not indexed\n");
    const { fellThrough } = await ask("/sneaked.txt");
    expect(fellThrough).toBe(true);
  });

  test("a listed file is served, with its bytes", async () => {
    const { response, fellThrough } = await ask("/assets/app-abc123.js");
    expect(fellThrough).toBe(false);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("export const x = 1");
  });
});

describe("a prerendered page keeps the response it was rendered as", () => {
  test("a 200 page is a 200", async () => {
    const { response, fellThrough } = await ask("/");
    expect(fellThrough).toBe(false);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<title>home</title>");
  });

  /**
   * THE BUG. `PrerenderedPage.status` has been recorded since the prerenderer
   * was written and nothing persisted it, so every reader of the output
   * directory — `preview.mjs` included — answered 200 for a page that had been
   * rendered as a 404. A crawler indexes that page.
   */
  test("a 404 page is a 404, not a 200 that says so", async () => {
    const { response, fellThrough } = await ask("/gone");
    expect(fellThrough).toBe(false);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("not here");
  });

  test("and the headers it was rendered with travel too", async () => {
    const { response } = await ask("/gone");
    expect(response.headers.get("x-from")).toBe("manifest");
    // Defaulted rather than recorded, because a page is HTML and a manifest that
    // repeats that for every entry is a longer file saying the same thing.
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
  });
});

describe("no manifest is a legitimate deployment", () => {
  test("a server with no client output serves nothing and refuses nothing", async () => {
    const middleware = assetMiddleware({ dir: join(dir, "does-not-exist") });
    let fellThrough = false;
    const response = await middleware(new Request("http://localhost/"), () => {
      fellThrough = true;
      return new Response("page handler");
    });
    expect(fellThrough).toBe(true);
    expect(await response.text()).toBe("page handler");
  });
});
