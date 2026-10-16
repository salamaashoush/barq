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

import { decodeWire, encodeWire } from "@barqjs/server/codec";

import {
  ServerFnError,
  clientRpc,
  staticFunctionMiddleware,
  staticUrl,
} from "@barqjs/start/client";
import { type BarqStartOptions, barqStart } from "../src/start.ts";

const ROOT = fileURLToPath(new URL("./fixtures/build", import.meta.url));
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
        "@barqjs/start/server": fileURLToPath(
          new URL("../../start/src/server.ts", import.meta.url),
        ),
        // BEFORE the bare specifier: a string alias is a PREFIX replacement, so
        // `@barqjs/start` listed first turns `@barqjs/start/client` into
        // `…/src/index.ts/client` and the build cannot resolve it.
        "@barqjs/start/client": fileURLToPath(
          new URL("../../start/src/client.ts", import.meta.url),
        ),
        "@barqjs/start/serve": fileURLToPath(new URL("../../start/src/serve.ts", import.meta.url)),
        "@barqjs/start": fileURLToPath(new URL("../../start/src/index.ts", import.meta.url)),
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

  test("keeps a GET function's body, and a middleware's server half, out of the browser", () => {
    for (const secret of ["get-handler-secret-must-not-ship", "audit-server-half-must-not-ship"]) {
      expect(client).not.toContain(secret);
      expect(server).toContain(secret);
    }
    // What the client got: the stub, its method, and the chain's client half.
    expect(client).toContain("src/reads.ts#readGreeting");
    expect(client).toMatch(/method:\s*["'`]GET["'`]/);
    expect(client).toContain("audit-client-half-reached-the-client");
  });

  test("gives each side only its own half of an environment function", () => {
    for (const secret of [
      "server-only-fn-body-must-not-ship",
      "isomorphic-server-half-must-not-ship",
    ]) {
      expect(client).not.toContain(secret);
      expect(server).toContain(secret);
    }
    expect(client).toContain("isomorphic-client-half-reached-the-client");
    expect(client).toContain("client-only-fn-body-must-not-reach-the-server");
    expect(server).not.toContain("isomorphic-client-half-reached-the-client");
    expect(server).not.toContain("client-only-fn-body-must-not-reach-the-server");
  });

  /**
   * The isomorphic entry has to survive reaching a browser.
   *
   * `src/guard.ts` imports `useSession` from `@barqjs/start` and is referenced
   * — never called — from client code, which is exactly what a route declaring
   * `middleware: [requireSession]` does. `context.ts` used to build its
   * `AsyncLocalStorage` at module scope, and a bundler answers
   * `node:async_hooks` with an empty stub rather than an error, so the chunk
   * evaluated in the browser and threw `AsyncLocalStorage is not a constructor`
   * before any application code ran. Measured on `packages/kitchen-sink`: the
   * `/admin` route crashed on load.
   */
  test("the isomorphic entry reaches the browser without constructing a server primitive", () => {
    expect(client, "the guard module did not reach the client bundle").toContain(
      "guard-module-reached-the-client",
    );
    expect(client).not.toMatch(/new\s+[\w.$]*AsyncLocalStorage/);
  });

  test("carries the client's own emitted chunk name into the server half", () => {
    const assets = readdirSync(join(OUT, "client", "assets")).filter((n) => n.endsWith(".js"));
    expect(assets).toHaveLength(1);
    // The name the client build actually emitted, not a reconstruction of the
    // input name, which breaks on any `entryFileNames`.
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

/**
 * Static server functions: what the prerender wrote, and a client reading it
 * from a host that runs no server code at all.
 */
describe("static server functions", () => {
  const ID = "src/statics.ts#greetStatic";
  const fileOf = (name: string): string => join(OUT, "client", staticUrl(ID, { name }).slice(1));

  test("the prerender wrote one file per input a page called with", () => {
    for (const [name, greeting] of [
      ["salama", "static hello salama"],
      ["ada", "static hello ada"],
    ] as const) {
      const answer = decodeWire<{ result: { greeting: string; at: Date } }>(
        JSON.parse(readFileSync(fileOf(name), "utf8")),
      );
      expect(answer.result.greeting).toBe(greeting);
      expect(answer.result.at).toBeInstanceOf(Date);
    }
    expect(staticUrl(ID, { name: "salama" })).not.toBe(staticUrl(ID, { name: "ada" }));
    // The page that called it carries the answer it rendered with.
    expect(readFileSync(join(OUT, "client", "index.html"), "utf8")).toContain(
      "static hello salama",
    );
  });

  test("the stub carries the middleware, so the browser looks for the file first", () => {
    expect(client).toContain("src/statics.ts#greetStatic");
    expect(client).toContain("/_barq/static/");
  });

  test("the files are in the asset manifest, so the built server serves them", () => {
    const manifest = readFileSync(join(OUT, "client", "barq-assets.json"), "utf8");
    expect(manifest).toContain(staticUrl(ID, { name: "salama" }).slice(1));
    expect(manifest).toContain(staticUrl(ID, { name: "ada" }).slice(1));
  });

  test("a client reads them from a host that serves files and nothing else", async () => {
    const files = join(OUT, "client");
    const asked: string[] = [];
    const host = Bun.serve({
      port: 0,
      fetch: async (request) => {
        const path = decodeURIComponent(new URL(request.url).pathname);
        asked.push(path);
        const file = Bun.file(join(files, path));
        return (await file.exists())
          ? new Response(file)
          : new Response("no file", { status: 404 });
      },
    });
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      realFetch(new URL(String(input), host.url), init)) as typeof fetch;
    try {
      const greet = clientRpc<{ name: string }, { greeting: string; at: Date }, "GET">(
        ID,
        [staticFunctionMiddleware],
        { method: "GET" },
      );
      const answer = await greet({ data: { name: "salama" } });
      expect(answer.greeting).toBe("static hello salama");
      expect(answer.at).toBeInstanceOf(Date);
      expect(asked).toEqual([staticUrl(ID, { name: "salama" })]);

      // An input no page called with has no file, so the call goes on to a
      // server, and this host has none.
      await expect(greet({ data: { name: "zed" } })).rejects.toBeInstanceOf(ServerFnError);
      expect(asked.at(-1)).toStartWith("/_barq/fn/");
    } finally {
      globalThis.fetch = realFetch;
      void host.stop(true);
    }
  });
});

/**
 * The route-action chain check, as `buildApp` runs it.
 *
 * WHY IT RUNS HERE AND NOT IN `barqRouter`. The first design had the router
 * plugin do the whole thing through `environment.runner.import`, and that is
 * impossible: `runner` belongs to a `DevEnvironment`, and a `vite build` has
 * `BuildEnvironment`s. The client `buildEnd` — where the module-graph fact IS
 * available — also runs before the ssr bundle exists. So the router reports the
 * graph fact and `buildApp` runs the check against the bundle it imports for
 * prerendering anyway.
 *
 * The check itself has to live INSIDE that bundle, which is what
 * `verifyChains` on the entry is: `resolve.noExternal` compiles `@barqjs/*`
 * into the ssr build, so a plugin importing the registry would be asking a
 * second, empty one.
 */
describe("verify, the route-action chain check", () => {
  const build = async (verify: BarqStartOptions["verify"]): Promise<string> => {
    const out = join(ROOT, "dist-verify");
    rmSync(out, { recursive: true, force: true });
    const builder = await createBuilder({
      root: ROOT,
      configFile: false,
      logLevel: "silent",
      resolve: {
        alias: {
          "@barqjs/start/server": fileURLToPath(
            new URL("../../start/src/server.ts", import.meta.url),
          ),
          // BEFORE the bare specifier: a string alias is a PREFIX replacement, so
          // `@barqjs/start` listed first turns `@barqjs/start/client` into
          // `…/src/index.ts/client` and the build cannot resolve it.
          "@barqjs/start/client": fileURLToPath(
            new URL("../../start/src/client.ts", import.meta.url),
          ),
          "@barqjs/start/serve": fileURLToPath(
            new URL("../../start/src/serve.ts", import.meta.url),
          ),
          "@barqjs/start": fileURLToPath(new URL("../../start/src/index.ts", import.meta.url)),
        },
      },
      plugins: barqStart({ pages: false, outputDirectory: "dist-verify", verify }),
    });
    try {
      await builder.buildApp();
      return "";
    } catch (error) {
      return (error as Error).message;
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  };

  const reaching = new Map([["/admin", new Set(["src/data.ts#loadUser"])]]);

  test("a violation FAILS the build", async () => {
    const message = await build({ reachability: () => reaching });
    expect(message).toContain("do not carry the middleware of a route that reaches them");
  }, 60_000);

  test("`warn` reports and ships", async () => {
    expect(await build({ reachability: () => reaching, onViolation: "warn" })).toBe("");
  }, 60_000);

  test("no violation is silence", async () => {
    expect(await build({ reachability: () => new Map() })).toBe("");
  }, 60_000);

  test("a reachability that answered NOTHING is refused, not passed", async () => {
    // The dangerous failure is a check that passes by knowing nothing: an
    // application that forgot `barqRouter({ onReachability })` would get a green
    // build and no enforcement at all.
    const message = await build({ reachability: () => undefined });
    expect(message).toContain("answered nothing");
    expect(message).toContain("onReachability");
  }, 60_000);
});

/**
 * The build emits a file a person can RUN, and running it serves the build.
 *
 * This is an end-to-end test rather than a string assertion because the failure
 * it exists for was invisible to one: `static.dir` resolved to
 * `<out>/server/client` instead of `<out>/client`, so every page still rendered
 * and every asset 404'd. Only fetching an asset says so.
 */
describe("`serve.js`, the half a person runs", () => {
  test("is a SEPARATE file from the one the build imports", () => {
    // `bun <file>` auto-serves any module whose default export has a `fetch`
    // function, so a single entry that both exports the handler and starts a
    // server binds the port twice and dies with EADDRINUSE. Probed on bun 1.4
    // against a plain object, an object with extra keys, and a class instance.
    const serve = readFileSync(join(OUT, "server", "serve.js"), "utf8");
    expect(serve).toContain("serveBarq");
    expect(serve).not.toMatch(/export\s*\{[^}]*\bdefault\b/);
    // …and the importable half starts nothing.
    expect(server).not.toContain("serveBarq(");
  });

  test("serves a page, an asset and a 404, with one command and no wrapper", async () => {
    const port = 3400 + Math.floor(Math.random() * 100);
    const child = Bun.spawn(["bun", join(OUT, "server", "serve.js")], {
      env: { ...process.env, PORT: String(port) },
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      const base = `http://localhost:${port}`;
      // Poll rather than sleep: a fixed wait is either flaky or slow.
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          await fetch(base);
          break;
        } catch {
          await Bun.sleep(20);
        }
      }

      const asset = readdirSync(join(OUT, "client", "assets")).find((n) => n.endsWith(".js"));
      const [page, chunk, missing] = await Promise.all([
        fetch(base),
        fetch(`${base}/assets/${asset}`),
        fetch(`${base}/definitely-not-here`),
      ]);

      expect(page.status).toBe(200);
      expect(await page.text()).toContain("<h1>home</h1>");
      // THE ONE THAT CAUGHT THE BUG. `static.dir` is resolved against this
      // file's own URL, and getting the number of `..` wrong 404s every asset
      // while every page keeps rendering.
      expect(chunk.status).toBe(200);
      expect(chunk.headers.get("content-type")).toContain("javascript");
      expect(missing.status).toBe(404);

      // A GET server function, through the built server: answered for the
      // stub's request, refused for the same URL without the stub's header.
      const payload = encodeURIComponent(JSON.stringify({ input: encodeWire({ name: "salama" }) }));
      const endpoint = `${base}/_barq/fn/${encodeURIComponent("src/reads.ts#readGreeting")}.data?payload=${payload}`;
      const [called, linked] = await Promise.all([
        fetch(endpoint, { headers: { "sec-fetch-site": "same-origin", "x-barq-fn": "1" } }),
        fetch(endpoint, { headers: { "sec-fetch-site": "same-origin" } }),
      ]);
      expect(called.status).toBe(200);
      expect(decodeWire<{ greeting: string; audited: string }>(await called.json())).toMatchObject({
        greeting: "hello salama",
        audited: "audit-server-half-must-not-ship",
      });
      expect(linked.status).toBe(403);
    } finally {
      child.kill();
      await child.exited;
    }
  }, 30_000);
});
