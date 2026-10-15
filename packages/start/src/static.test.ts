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
import { pathToFileURL } from "node:url";

import { ASSET_MANIFEST_FILE, type AssetManifest, assetMiddleware } from "./static.ts";

const dir = mkdtempSync(join(tmpdir(), "barq-static-"));
mkdirSync(join(dir, "assets"), { recursive: true });
mkdirSync(join(dir, "gone"), { recursive: true });
mkdirSync(join(dir, "café"), { recursive: true });
writeFileSync(join(dir, "assets", "app-abc123.js"), "export const x = 1;\n");
writeFileSync(join(dir, "release notes.txt"), "notes\n");
writeFileSync(join(dir, "café", "index.html"), "<!doctype html><title>menu</title>\n");
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
    "/café": { file: "café/index.html", status: 200 },
  },
  files: ["/assets/app-abc123.js", "/release notes.txt"],
};

const ask = async (
  path: string,
  method = "GET",
): Promise<{ response: Response; fellThrough: boolean }> => {
  const middleware = assetMiddleware({ dir, manifest });
  let fellThrough = false;
  const response = await middleware(new Request(`http://localhost${path}`, { method }), () => {
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

/**
 * The manifest lists NAMES, as the build read them off the disk; a request
 * carries a URL. The two differ for every name a URL has to percent-encode,
 * which is what an upload or a CMS export produces.
 */
describe("a name a URL percent-encodes", () => {
  test("a listed file is served at the URL a browser asks for", async () => {
    const { response, fellThrough } = await ask("/release%20notes.txt");
    expect(fellThrough).toBe(false);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("notes\n");
  });

  test("a prerendered page is too", async () => {
    const { response, fellThrough } = await ask("/caf%C3%A9");
    expect(fellThrough).toBe(false);
    expect(await response.text()).toContain("<title>menu</title>");
  });

  test("a path that is not percent-encoding at all falls through", async () => {
    const { fellThrough } = await ask("/%E0%A4%A");
    expect(fellThrough).toBe(true);
  });
});

/**
 * A prerendered route may also declare `server.handlers.POST`: the page is the
 * GET, and the handler is everything else.
 */
describe("only GET and HEAD are answered from the build", () => {
  test("a listed file is only a file to GET and HEAD", async () => {
    const { fellThrough } = await ask("/assets/app-abc123.js", "POST");
    expect(fellThrough).toBe(true);
  });

  for (const method of ["POST", "PUT", "DELETE"]) {
    test(`a ${method} to a prerendered path reaches the application`, async () => {
      const { response, fellThrough } = await ask("/gone", method);
      expect(fellThrough).toBe(true);
      expect(await response.text()).toBe("page handler");
    });
  }

  test("a HEAD to a prerendered path is still the page", async () => {
    const { response, fellThrough } = await ask("/gone", "HEAD");
    expect(fellThrough).toBe(false);
    expect(response.status).toBe(404);
  });
});

/**
 * How the generated `serve.js` names the directory: against itself, as a URL.
 * A URL's `.pathname` is not a path, since a space in it is still `%20`.
 */
describe("a directory named by a `file:` URL", () => {
  test("is opened as the path it means, a space included", async () => {
    const spaced = join(dir, "acme site", "client");
    mkdirSync(spaced, { recursive: true });
    writeFileSync(join(spaced, "robots.txt"), "allow\n");
    writeFileSync(
      join(spaced, ASSET_MANIFEST_FILE),
      JSON.stringify({ pages: {}, files: ["/robots.txt"] } satisfies AssetManifest),
    );

    const middleware = assetMiddleware({ dir: pathToFileURL(spaced) });
    const response = await middleware(
      new Request("http://localhost/robots.txt"),
      () => new Response("page handler", { status: 404 }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("allow\n");
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

/**
 * A prerendered page is the most-requested thing a build writes, so it is owed
 * what a hashed chunk already gets: a validator, a 304 for a browser that has
 * it, and an encoding the client asked for.
 */
describe("a prerendered page is served as a file is", () => {
  const big = `<!doctype html><title>big</title>${"<p>salama</p>".repeat(400)}\n`;
  mkdirSync(join(dir, "big"), { recursive: true });
  writeFileSync(join(dir, "big", "index.html"), big);
  const withBig: AssetManifest = {
    pages: {
      ...manifest.pages,
      "/big": {
        file: "big/index.html",
        status: 200,
        headers: { "cache-control": "public, max-age=60", "content-length": "1" },
      },
    },
    files: manifest.files,
  };
  const middleware = assetMiddleware({ dir, manifest: withBig, maxAge: 31_536_000 });
  const get = (path: string, headers: Record<string, string> = {}, method = "GET") =>
    middleware(
      new Request(`http://localhost${path}`, { method, headers }),
      () => new Response("page handler"),
    );
  /** The headers alone, with the body read so the file behind it is closed. */
  const headersOf = async (path: string): Promise<Headers> => {
    const response = await get(path);
    await response.arrayBuffer();
    return response.headers;
  };

  test("it carries a validator", async () => {
    const response = await get("/big");
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toMatch(/^W\/"/);
    expect(response.headers.get("last-modified")).not.toBeNull();
    expect(await response.text()).toBe(big);
  });

  test("a browser that already has it is told so, without the bytes", async () => {
    const etag = (await headersOf("/big")).get("etag") ?? "";
    const again = await get("/big", { "if-none-match": etag });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
  });

  test("it is compressed for a client that accepts it", async () => {
    const response = await get("/big", { "accept-encoding": "gzip" });
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.get("vary")).toBe("Accept-Encoding");
    // The length the page was RENDERED with describes other bytes.
    expect(response.headers.get("content-length")).toBeNull();
    const plain = new Response(response.body?.pipeThrough(new DecompressionStream("gzip")));
    expect(await plain.text()).toBe(big);
  });

  test("the headers it was rendered with still win where they are its own", async () => {
    const headers = await headersOf("/big");
    expect(headers.get("cache-control")).toBe("public, max-age=60");
    expect(headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(headers.get("content-length")).toBe(String(big.length));
  });

  test("a page with no cache header of its own is never given the assets'", async () => {
    expect((await headersOf("/")).get("cache-control")).toBeNull();
  });

  test("a HEAD answers the headers and no body", async () => {
    const response = await get("/big", {}, "HEAD");
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).not.toBeNull();
    expect(await response.text()).toBe("");
  });

  test("a page that is not a 200 is not revalidated into a 304", async () => {
    const response = await get("/gone", { "if-none-match": "*" });
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("not here");
  });
});

/**
 * `immutable` on a name that carries no hash is a file a browser never asks
 * for again, whatever the next deploy puts there.
 */
describe("a long cache lifetime is for names that change with their bytes", () => {
  const hashed: AssetManifest = {
    pages: {},
    files: ["/assets/app-abc123.js", "/release notes.txt"],
    hashed: ["/assets/app-abc123.js"],
  };
  const cacheOf = async (options: Parameters<typeof assetMiddleware>[0], path: string) => {
    const response = await assetMiddleware({ dir, ...options })(
      new Request(`http://localhost${path}`),
      () => new Response("page handler"),
    );
    // Read to the end: the body holds the file open until it is.
    await response.arrayBuffer();
    return response.headers.get("cache-control");
  };

  test("a hashed asset is immutable for a year with nothing configured", async () => {
    expect(await cacheOf({ manifest: hashed }, "/assets/app-abc123.js")).toBe(
      "max-age=31536000, immutable",
    );
  });

  test("a file with a stable name is revalidated, even when a lifetime is configured", async () => {
    const options = { manifest: hashed, maxAge: 600, immutable: true };
    expect(await cacheOf(options, "/assets/app-abc123.js")).toBe("max-age=600, immutable");
    expect(await cacheOf(options, "/release%20notes.txt")).toBeNull();
  });

  test("a manifest that does not say which names are hashed applies the lifetime as configured", async () => {
    expect(await cacheOf({ manifest }, "/assets/app-abc123.js")).toBeNull();
    expect(await cacheOf({ manifest, maxAge: 600 }, "/release%20notes.txt")).toBe("max-age=600");
  });
});

/**
 * Vite's `base` is in every URL the build wrote and in no file name: `/shop/`
 * puts the chunk at `/shop/assets/app.js` and leaves it in `assets/` on disk.
 */
describe("a site built under a base", () => {
  const based: AssetManifest = {
    pages: { "/shop": { file: "index.html", status: 200 } },
    files: ["/shop/assets/app-abc123.js", "/shop/release notes.txt"],
    hashed: ["/shop/assets/app-abc123.js"],
    base: "/shop",
  };
  const get = (path: string) =>
    assetMiddleware({ dir, manifest: based })(
      new Request(`http://localhost${path}`),
      () => new Response("page handler", { status: 404 }),
    );

  test("a file is found where the build put it, not under the base", async () => {
    const response = await get("/shop/assets/app-abc123.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("max-age=31536000, immutable");
    expect(await response.text()).toContain("export const x = 1");
  });

  test("a name a URL percent-encodes is too", async () => {
    const response = await get("/shop/release%20notes.txt");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("notes\n");
  });

  test("the same file outside the base is not served", async () => {
    expect(await (await get("/assets/app-abc123.js")).text()).toBe("page handler");
  });

  test("a page under it is served", async () => {
    expect(await (await get("/shop")).text()).toContain("<title>home</title>");
  });
});
