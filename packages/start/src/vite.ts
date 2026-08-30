/**
 * The build half: discover server functions, mount them, and answer their URL
 * in dev.
 *
 * The compiler already decides what a module's exports are and synthesizes the
 * client half. What is missing without this is the other side of the same fact —
 * the server needs one `mount(id, fn)` per exported server function, and the id
 * has to be the same string on both sides or a call reaches nothing.
 *
 * So the ids come from ONE place: the compiler's `serverFns` artefact, taken on
 * a callback and replayed into a generated module the server imports. Deriving
 * them twice, once per side, is how the two halves drift.
 *
 * Environment-API throughout, following `@tanstack/start-plugin-core`: which
 * half a module is compiled for is `this.environment.name`, the manifest exists
 * only in the server environment (`applyToEnvironment`), and a dev request runs
 * through `environment.runner.import` rather than the legacy `ssrLoadModule`.
 */

import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { type BarqCompilerOptions, barqVitePlugin } from "@barqjs/compiler/vite";
import { NodeRequest, sendNodeResponse } from "srvx/node";
import { type Plugin, type ViteDevServer, isRunnableDevEnvironment } from "vite";

import { RPC_PREFIX } from "./index.ts";
import { type PrerenderedPage, type ServerEntryModule, prerender } from "./prerender.ts";
import { PRERENDER_HEADER } from "./protocol.ts";
import { ASSET_MANIFEST_FILE, type AssetManifest } from "./static.ts";

/**
 * Vite's own environment names. `ssr` for the server one rather than something
 * prettier, because plugins that predate the Environment API still branch on
 * that string — the reason `@tanstack/start-plugin-core` gives for the same
 * choice, naming tailwindcss.
 */
export const ENVIRONMENTS = { client: "client", server: "ssr" } as const;

/** The module a server entry imports to mount everything the build found. */
export const MANIFEST_ID = "virtual:barq-server-fns";

const RESOLVED_MANIFEST_ID = `\0${MANIFEST_ID}`;

/**
 * The two entries, as module ids rather than as paths.
 *
 * Resolved to `src/entry-client.*` / `src/entry-server.*` when the project has
 * one, and to a generated default when it does not — TanStack's split, and for
 * their reason: one stable specifier that the config, the dev middleware and
 * the build all name, so "the user did not write an entry" costs nothing
 * anywhere else.
 *
 * A virtual id IS a valid per-environment build input; measured on Vite 8.2.2,
 * `{ index: "virtual:barq-entry-client" }` and `{ server: … }` both bundle. The
 * ssr output filename comes from the input KEY, which is why they are named.
 */
export const CLIENT_ENTRY_ID = "virtual:barq-entry-client";
export const SERVER_ENTRY_ID = "virtual:barq-entry-server";
/** The runnable half. Always generated; there is nothing in it to override. */
export const SERVE_ENTRY_ID = "virtual:barq-entry-serve";
const RESOLVED_CLIENT_ENTRY_ID = `\0${CLIENT_ENTRY_ID}`;
const RESOLVED_SERVER_ENTRY_ID = `\0${SERVER_ENTRY_ID}`;
const RESOLVED_SERVE_ENTRY_ID = `\0${SERVE_ENTRY_ID}`;

/** Tried in order, against `<root>/<srcDir>/entry-{client,server}`. */
const ENTRY_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

function findEntry(root: string, srcDir: string, half: "client" | "server"): string | null {
  for (const extension of ENTRY_EXTENSIONS) {
    const file = join(root, srcDir, `entry-${half}${extension}`);
    if (existsSync(file)) return file;
  }
  return null;
}

/**
 * Does the project own the client entry?
 *
 * An `index.html` at the Vite root is Vite's own answer to "what is the entry",
 * and a project that wrote one has already said the browser boots from there.
 * The virtual client entry is for every other project, which is nearly all of
 * them — a server-rendered application has no `index.html` because the document
 * is its root route's shell.
 */
function hasIndexHtml(root: string): boolean {
  return existsSync(join(root, "index.html"));
}

/**
 * The application's router, as a specifier the FRAMEWORK can import.
 *
 * `#`-prefixed rather than `virtual:` on purpose, and the distinction is
 * TanStack's: `ENTRY_POINTS.router` is `#tanstack-router-entry`
 * and resolves to the project's OWN
 * `src/router.tsx` through `resolve.alias` (`vite/planning.ts:34-39`), while
 * `virtual:` is reserved for modules the plugin synthesises. This is an alias to
 * a real file, so it gets the real-file spelling.
 *
 * NO APPLICATION FILE NAMES THIS. Grepped across both of their `start-basic`
 * examples: user code names no `virtual:` and no `#` specifier at all. What a
 * project writes is `src/router.ts`, which imports `./routeTree.gen` by a plain
 * relative path — the route table is not hidden behind a specifier only the
 * bundler can resolve, and never was.
 */
export const ROUTER_ENTRY_ID = "#barq-router-entry";
const RESOLVED_ROUTER_ENTRY_ID = `\0${ROUTER_ENTRY_ID}`;

function findRouterEntry(root: string, srcDir: string): string | null {
  for (const extension of ENTRY_EXTENSIONS) {
    const file = join(root, srcDir, `router${extension}`);
    if (existsSync(file)) return file;
  }
  return null;
}

/**
 * Index what the build put on disk, so serving it costs no `stat`.
 *
 * Written LAST, because it describes the finished directory: the client chunks,
 * anything copied out of `public/`, and every page the prerenderer wrote. A
 * request path is the key, so the server does one lookup rather than reproducing
 * the candidate rules (`/about` -> `about/index.html`) at runtime.
 *
 * IT CARRIES `status` AND `headers` FOR A PAGE. `PrerenderedPage` has recorded
 * both since the prerenderer was written and nothing persisted them, so a
 * prerendered 404 was served as a 200 by anything reading the directory alone —
 * `packages/kitchen-sink/preview.mjs` did exactly that.
 *
 * Nothing else about a file is recorded. `content-type`, `etag` and `size` are
 * derivable from the bytes and `srvx/static` derives them; a copy here is a
 * second source of truth that goes stale against the file it describes.
 */
async function writeAssetManifest(
  clientOut: string,
  pages: readonly PrerenderedPage[],
  base: string,
): Promise<void> {
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  // RELATIVE to the output directory, in the manifest too. `file` arrives
  // absolute, which is the build machine's path — persisting that ships a
  // deployable artefact that only resolves on the machine that produced it.
  const fileOf = (page: PrerenderedPage): string =>
    relative(clientOut, page.file).replaceAll("\\", "/");
  const written = new Set(pages.map(fileOf));

  const files: string[] = [];
  const walk = async (dir: string, at: string): Promise<void> => {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const child = join(dir, item.name);
      const url = `${at}/${item.name}`;
      if (item.isDirectory()) {
        await walk(child, url);
        continue;
      }
      // A prerendered page is indexed under its REQUEST path below, with the
      // status it was rendered as. Listing the file here too would let
      // `/about/index.html` be fetched directly and answer 200 regardless.
      if (!written.has(relative(clientOut, child).replaceAll("\\", "/"))) files.push(url);
    }
  };
  await walk(clientOut, "");

  const entries: Record<
    string,
    { file: string; status: number; headers?: Record<string, string> }
  > = {};
  for (const page of pages) {
    const path = `${prefix}${page.path}`;
    // `x-barq-prerender` is how the handler told the PRERENDERER whether to keep
    // the page. It is build-time signalling and has no business on a response to
    // a browser, so it does not travel into the manifest.
    const { [PRERENDER_HEADER]: _internal, ...headers } = page.headers;
    entries[path === "" ? "/" : path] = {
      file: fileOf(page),
      status: page.status,
      ...(Object.keys(headers).length === 0 ? {} : { headers }),
    };
  }

  const manifest: AssetManifest = {
    pages: entries,
    files: files.map((file) => `${prefix}${file}`).toSorted(),
  };
  await writeFile(join(clientOut, ASSET_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * What `#barq-router-entry` is when the project has not written `src/router.ts`.
 *
 * Theirs is REQUIRED (`planning.ts:107-113`) because their router carries the
 * options; barq's `RouterConfig` is optional in every field but `routeTree`, so
 * a project with nothing to configure should not have to write a file that says
 * so. The default re-exports the generated table under the same name the written
 * file would export, so the two are interchangeable to every consumer.
 */
function defaultRouterEntry(routeTreeImport: string): string {
  return [
    `import { routeTree } from ${JSON.stringify(routeTreeImport)};`,
    ``,
    `export const config = { routeTree };`,
    ``,
  ].join("\n");
}

/**
 * The client half, when the project has not written one.
 *
 * Two lines, and both are what an application writes by hand when it overrides
 * this — which is the point of the shape. NO ROUTE TREE IMPORT: it used to pass
 * `routeTree` from `routeTree.gen.ts`, so overriding meant importing a generated
 * file to hand back a value the framework can reach itself. `startClient` reads
 * `#barq-router-entry`, which is the project's own `src/router.ts`.
 *
 * `startClient` owns the boot ORDER, which is load-bearing three times over —
 * `start()` before the
 * walk, because hydration claims one range per route depth and an empty chain
 * claims ranges for nothing; the matched chunks before the walk, because a cold
 * `lazy()` throws `NotReadyError` and parks the depth's boundary onto a rebuild,
 * discarding exactly the markup hydration exists to keep; and the head before
 * the walk, because `<HeadContent />` is a keyed list.
 *
 * PROVIDERS DO NOT BELONG HERE and neither do global styles. Both go in the
 * ROOT ROUTE's component, where they wrap every route on both backends rather
 * than only on this one — which is theirs too.
 *
 * THIS WAS STALE and it is worth saying what it used to do, because nothing
 * caught it: it hydrated `RouterProvider` into `document.getElementById("app")`.
 * Once the document became JSX — `shellComponent` renders `<html>` — that skips
 * `Document`'s `provide`, so `<HeadContent />` read no assets and rendered
 * nothing, and hydration still CLAIMED the server's tags, which hid it until the
 * first navigation reconciled the whole head away. Only `packages/kitchen-sink`
 * exercised the current design, because only it wrote its own entry.
 */
function defaultClientEntry(): string {
  return [
    `import { startClient } from "@barqjs/router/client";`,
    ``,
    `await startClient();`,
    ``,
  ].join("\n");
}

/**
 * The server half, when the project has not written one.
 *
 * TWO LINES, and they are the two lines a project writes by hand when it does
 * override the entry — which is the whole point of the shape. Theirs is the same
 * size and for the same reason.
 *
 * IT USED TO NAME FOUR BUILD ARTEFACTS: `virtual:barq-route-assets`,
 * `virtual:barq-client-assets`, `virtual:barq-server-fns` and the generated
 * table. So overriding the entry meant transcribing specifiers that have no
 * types of their own, and `packages/kitchen-sink/src/virtual.d.ts` existed for
 * no other purpose than to make that transcription typecheck. They all moved
 * into `createStartHandler`, which is in `@barqjs/router/server` — the same
 * place TanStack keeps theirs.
 *
 * `stream` is still fixed when the handler is built and the prerenderer still
 * needs a non-streaming twin of the SAME declaration, so `createStartHandler`
 * returns `createFetch` beside `fetch` rather than the entry declaring both.
 *
 * NO `document` TEMPLATE. The document is `shellComponent` on the root route and
 * `<HeadContent />` and `<Scripts />` place themselves, so there is no order to
 * get right here — which is the trap the string template had: it serialised the
 * head before the body and shipped a page with no styles until the first
 * navigation.
 */
function defaultServerEntry(pages: boolean): string {
  // `{ pages: false }` keeps the route HANDLERS and drops the document, which is
  // what an SPA deployment is: its API routes and server functions are here and
  // its pages are rendered in the browser. Without it the handler asked the
  // route table for a `shellComponent`, which an SPA has no reason to declare,
  // and every page request answered 500.
  const argument = pages ? "" : "{ pages: false }";
  return [
    `import { createStartHandler } from "@barqjs/router/server";`,
    ``,
    `export default createStartHandler(${argument});`,
    ``,
  ].join("\n");
}

/**
 * The RUNNABLE half, emitted beside the importable one as `dist/server/serve.js`.
 *
 * Two files rather than one, and the reason is measured rather than stylistic.
 * `bun <file>` auto-serves any module whose DEFAULT export has a `fetch`
 * function — probed on bun 1.4 against a plain object, an object with extra
 * keys, and a class instance, and all three start a server. So a single entry
 * that both default-exports the handler and starts its own server binds the
 * port twice and dies with `EADDRINUSE`, which is exactly what it did.
 *
 * Splitting them also removes a problem that had nothing to do with bun: `vite
 * build` imports the server entry to prerender and to run the route-action
 * check, and a `serve()` at module scope in THAT file would hold a port in the
 * middle of a build. Nitro splits the same way, for the same reason — its node
 * preset (`presets/node/runtime/node-server.ts`) is a serve call with no default
 * export, and the app is a separate module it imports.
 *
 * So: `server.js` is importable and serves nothing, `serve.js` runs and exports
 * nothing.
 */
function defaultServeEntry(server: BarqServerOptions | undefined, spa: boolean): string {
  const assets = server?.static ?? true;
  const options: string[] = [`fetch: handler.fetch`];
  if (assets !== false) {
    const tuning =
      assets === true
        ? ""
        : Object.entries(assets)
            .map(([k, v]) => `, ${k}: ${v}`)
            .join("");
    // Resolved at RUNTIME against this file, not baked in: the build machine's
    // directory layout is not the deployment's, which is the same mistake the
    // prerender manifest made before it started storing relative names.
    // `../client`, because this file is `<out>/server/serve.js` and the client
    // build is `<out>/client`. `./client` resolved to `<out>/server/client` and
    // every asset 404'd while every page still rendered, which is why the gate
    // below fetches an asset rather than a page.
    options.push(`static: { dir: new URL("../client", import.meta.url).pathname${tuning} }`);
  }
  // The SPA fallback, resolved the same way and for the same reason. Only for a
  // project that renders no pages here AND wrote its own `index.html`: with
  // pages on, the handler IS the answer for a path the build did not write, and
  // a document here would shadow its 404.
  if (spa) {
    options.push(`spa: new URL("../client/index.html", import.meta.url).pathname`);
  }
  // `PORT` first because every host sets it, and a configured port is the
  // fallback rather than the override.
  const port = server?.port ?? 3000;
  options.push(`port: Number(process.env.PORT ?? ${port})`);
  if (server?.hostname !== undefined) options.push(`hostname: ${JSON.stringify(server.hostname)}`);

  return [
    `import { serveBarq } from "@barqjs/start/serve";`,
    ``,
    `import handler from "${SERVER_ENTRY_ID}";`,
    ``,
    `serveBarq({ ${options.join(", ")} });`,
    ``,
  ].join("\n");
}

/**
 * What the client build emitted, for the server half to place in the document.
 *
 * In dev it is the entry's own module id, which Vite serves; in a build it is
 * the hashed chunk plus its CSS, captured from the client `generateBundle`.
 */
export const CLIENT_ASSETS_ID = "virtual:barq-client-assets";
const RESOLVED_CLIENT_ASSETS_ID = `\0${CLIENT_ASSETS_ID}`;

interface ClientAssets {
  scripts: string[];
  css: string[];
}

export interface PrerenderOptions {
  /**
   * Where to start. `"/"` when nothing is given, because a site with nothing
   * prerendered does not ask for a prerenderer.
   */
  readonly routes?: readonly string[];
  /**
   * Follow same-origin `href`s out of the HTML each page produced.
   *
   * On by default, which is SvelteKit's choice rather than Nitro's. A route
   * marked prerenderable that quietly was not prerendered is the failure that
   * costs a deploy; a crawl that finds too much costs a build a few seconds.
   */
  readonly crawl?: boolean;
  /** How many pages at once. */
  readonly concurrency?: number;
  /**
   * `/about` -> `about/index.html` rather than `about.html`.
   *
   * On by default: a directory index is what every static host serves for a
   * clean URL without configuration.
   */
  readonly subfolderIndex?: boolean;
  /**
   * Told what was written, with each page's response HEADERS.
   *
   * A static host cannot recover a header from a file, and this is where an
   * adapter turns them into whatever its platform reads. Every framework that
   * drops them instead has an open issue about it.
   */
  readonly onPages?: (pages: readonly PrerenderedPage[]) => void;
}

/**
 * RE-EXPORTED, not restated. It was declared here as well as in `prerender.ts`,
 * two identical copies of a five-field interface, which is the same drift the
 * local `ServerEntry` type had before `tsc` caught it.
 */
export type { PrerenderedPage };

/**
 * Vite's HTML transforms, run over the bytes that go out before the app.
 *
 * Streaming is why this is not simply `transformIndexHtml`. What we hold is the
 * head, the opening `<body>` and the mount element — no `</body>` to aim at —
 * so every hook asking for `injectTo: "body"` takes Vite's fallback and appends
 * at the END of the string, which is INSIDE the mount element. Measured: the
 * compiler's own overlay script landed between `<div id="app">` and the app's
 * first range comment, and the newline in front of it became a text node the
 * hydration walk tripped over — `expected <!--[--> at a root region, found the
 * text "\n"`, and the whole page re-rendered cold.
 *
 * So the shell is transformed with a sentinel standing in for the rest of the
 * document, and whatever lands past it is moved into the head. A tag that asked
 * for the end of the body gets the end of the head instead — earlier than it
 * asked for, which is the direction that cannot break anything — and the mount
 * element keeps the app's markup as its first child.
 */
const SHELL_END = "<!--barq-shell-end-->";

/**
 * Vite's HMR client, moved out of `<head>`.
 *
 * Vite injects it as the FIRST child of `<head>`, and `<head>` is rendered by
 * `<HeadContent />` — so under document hydration it is a node the tree did not
 * produce, and a claimed element takes its children WHOLE and reconciles those
 * away. Measured: an unowned tag in `<head>` is DELETED on hydration with
 * `mismatches: []` and nothing reported.
 *
 * A module script runs the same wherever it sits, so moving it is free. TanStack
 * does not have the problem at all because they never let the dev server touch
 * the HTML: their dev client entry is a manifest entry rendered by the tree
 * (`start-manifest-plugin/plugin.ts:138-155`), and Vite's client rides in
 * through the module graph.
 */
// The surrounding whitespace goes with it. Vite writes the tag on its own
// indented line, and the text node that leaves behind is itself a child of
// `<head>` that the tree does not produce.
const VITE_CLIENT = /\s*<script\b[^>]*\bsrc="[^"]*@vite\/client"[^>]*>\s*<\/script>\s*/i;

function moveViteClientToBody(markup: string): string {
  const found = VITE_CLIENT.exec(markup);
  if (found === null) return markup;
  const tag = found[0].trim();
  const without = markup.slice(0, found.index) + markup.slice(found.index + found[0].length);
  const close = without.lastIndexOf("</body>");
  return close === -1 ? without + tag : without.slice(0, close) + tag + without.slice(close);
}

async function transformShell(server: ViteDevServer, shell: string, url: URL): Promise<string> {
  const out = await server.transformIndexHtml(url.pathname + url.search, shell + SHELL_END);
  const cut = out.indexOf(SHELL_END);
  if (cut === -1) return moveViteClientToBody(out);
  const head = out.slice(0, cut);
  const trailing = out.slice(cut + SHELL_END.length);
  if (trailing.trim() === "") return moveViteClientToBody(head);
  const close = head.lastIndexOf("</head>");
  return moveViteClientToBody(
    close === -1 ? trailing + head : head.slice(0, close) + trailing + head.slice(close),
  );
}

interface Discovered {
  /** Absolute module id, as Vite spells it. */
  file: string;
  /** Export names that are server functions, in source order. */
  names: string[];
}

/**
 * What the generated server entry serves with, when it is run as the program.
 *
 * SERIALISABLE ONLY, and that is the whole boundary. `vite.config.ts` is
 * build-time and the entry is generated source, so a closure written here could
 * not be embedded in it. srvx's `plugins`, `middleware` and `error` are
 * functions, and they belong in a project's own `src/entry-server.ts` — which
 * after `createStartHandler` is four lines, so owning it is cheap:
 *
 * ```ts
 * import { createStartHandler } from "@barqjs/router/server";
 * import { serveIfMain } from "@barqjs/start/serve";
 *
 * const handler = createStartHandler();
 * serveIfMain(import.meta, { fetch: handler.fetch, plugins: [logPlugin()] });
 * export default handler;
 * ```
 *
 * Everything here is available there too, because both end up as
 * `BarqServeOptions`.
 */
export interface BarqServerOptions {
  /**
   * Which srvx adapter the entry imports `serve` from.
   *
   * `"auto"` is the default and imports from `srvx`, whose root export resolves
   * by runtime condition — `deno`, `bun`, `workerd`, `node`, and a generic
   * fallback. That genuinely covers Node, Bun and Deno with no configuration,
   * which is why it is the default rather than a guess.
   *
   * Naming one pins the import to `srvx/<name>` instead. That matters when the
   * BUILD's conditions are not the deployment's, which is every bundled target.
   *
   * `cloudflare` and `aws-lambda` are deliberately absent: their entry has a
   * different EXPORT SHAPE, not a different adapter import, and an export is not
   * something a runtime condition can add. Write `src/entry-server.ts` for
   * those; `serve.ts` documents what each needs.
   */
  readonly target?: "auto" | "node" | "bun" | "deno";
  /** Overridden by `PORT` in the environment, which every host sets. */
  readonly port?: number;
  readonly hostname?: string;
  /**
   * Serve `dist/client` in front of the page handler.
   *
   * On by default, because a build that emits a client directory and a server
   * that refuses to serve it is not a deployment. `false` is for the case where
   * a CDN is in front, which is also the case where the 0.419 us
   * `assetMiddleware` saves stops mattering.
   */
  readonly static?: boolean | { readonly maxAge?: number; readonly immutable?: boolean };
}

export interface BarqStartOptions {
  /**
   * Origins allowed to call a server function beyond the request's own. Passed
   * to the dev handler; a production server passes its own.
   */
  allowedOrigins?: readonly string[];
  /** What the generated entry serves with when it is run as the program. */
  server?: BarqServerOptions;
  /** Forwarded to the compiler plugin this one configures. */
  compiler?: Omit<BarqCompilerOptions, "serverFns" | "onServerFns" | "root">;
  /** Where `entry-client.*` and `entry-server.*` are looked for. */
  srcDirectory?: string;
  /**
   * Where `barqRouter` writes the generated tree, project-relative.
   *
   * Only the DEFAULT entries read this — a project that writes its own imports
   * the file by path like any other module. It has to be told rather than
   * guessed because the two plugins are configured independently, and a default
   * entry that imported a file the router was told to write somewhere else
   * would fail to resolve with nothing to point at.
   */
  routeTree?: string;
  /** Write static HTML for some paths after the build. */
  prerender?: PrerenderOptions;
  /** `dist/client` and `dist/server` under it. */
  outputDirectory?: string;
  /**
   * Answer pages in dev.
   *
   * On by default. Off leaves `barqStart()` as the server-function half alone,
   * which is a legitimate deployment — an SPA that calls RPC — and is what a
   * project with its own `index.html` wants.
   */
  pages?: boolean;
  /**
   * Fail the build when a route reaches a server function that does not carry
   * that route's declared middleware.
   *
   * THE HOLE THIS CLOSES is the one every framework surveyed documents instead.
   * Next.js: "A page-level authentication check does not extend to the Server
   * Actions defined within it… the Server Action is a separate entry point."
   * TanStack says it three times in their own docs. A server function is its own
   * HTTP endpoint; a guard on the route that renders it does not run when the
   * function is called directly.
   *
   * VALIDATE AND REJECT, never redispatch. `@vitejs/plugin-rsc` re-runs a
   * mis-routed action through the owning route's middleware; Next.js is REMOVING
   * action forwarding because the action then executes under a
   * different request context, and the deeper reason is this repo's own rule —
   * a client-supplied route selecting a middleware chain lets the caller pick
   * the weakest chain that reaches the action.
   *
   * Runs in `buildApp`, after the ssr build, against the bundle imported there:
   * it needs the route definitions' middleware CLOSURES and the mounted
   * registry, and both exist only inside that bundle.
   */
  verify?: {
    /**
     * Route -> the server-fn ids reachable from it, from `barqRouter`.
     *
     * A getter rather than a value, because the answer is produced by the
     * CLIENT build's `buildEnd` and read after the SSR build — two different
     * moments, in two plugins that cannot share a closure across environments.
     * `barqRouter({ onReachability })` is the other half, the same way
     * `onRoutes` feeds the compiler's route table.
     */
    reachability: () => ReadonlyMap<string, ReadonlySet<string>> | undefined;
    /** `"error"` fails the build. Default `"error"`. */
    onViolation?: "error" | "warn";
  };
}

/**
 * The artefact the compiler emits, as it crosses back.
 *
 * Parsed rather than trusted: it is this plugin's own compiler talking, but a
 * shape mismatch here would mount nothing and look like an app with no server
 * functions, which is the failure that is hardest to notice.
 */
interface ServerFnArtifact {
  version: number;
  module: string;
  exports: Array<{ name: string; serverFn: boolean }>;
}

function namesOf(json: string): string[] | null {
  let parsed: ServerFnArtifact;
  try {
    parsed = JSON.parse(json) as ServerFnArtifact;
  } catch {
    return null;
  }
  if (parsed.version !== 1 || !Array.isArray(parsed.exports)) return null;
  const names = parsed.exports.filter((e) => e.serverFn).map((e) => e.name);
  return names.length > 0 ? names : null;
}

/**
 * The compiler plugin, the manifest and the dev handler, as one entry.
 *
 * `barqStart()` owns the compiler plugin rather than sitting beside it, because
 * the ids have to come from one place: it turns `serverFns` on and takes the
 * artefact on the callback, so there is no configuration in which the manifest
 * is generated from a different answer than the client stubs were.
 */
export function barqStart(options: BarqStartOptions = {}): Plugin[] {
  const found = new Map<string, Discovered>();
  let root = process.cwd();
  let server: ViteDevServer | null = null;
  let base = "/";
  const srcDirectory = options.srcDirectory ?? "src";
  const outputDirectory = options.outputDirectory ?? "dist";
  const serving = options.pages ?? true;

  // Populated by the CLIENT build's `generateBundle` and read by the server
  // environment's `load`. Those are different plugin INSTANCES unless the
  // plugin opts in: with `sharedConfigBuild` false — the default — Vite resolves
  // the config once per environment, so each gets its own closure. Measured, the
  // ssr build read `null` where the client had just written the chunk name.
  // `sharedDuringBuild: true` on every plugin here is what makes this one map.
  let clientAssets: ClientAssets = { scripts: [], css: [] };
  let serverFile = "server.js";

  /**
   * `<project-relative module>#<export>`, byte for byte what the compiler put
   * in the client stub — pinned by a test that compiles a module and compares
   * the two strings rather than the two rules.
   */
  const idOf = (file: string, name: string): string => {
    const rel = file.startsWith(root) ? file.slice(root.length) : file;
    return `${rel.replace(/^[/\\]+/, "").replaceAll("\\", "/")}#${name}`;
  };

  const record = (id: string, artifact: string): void => {
    const names = namesOf(artifact);
    if (names === null) {
      found.delete(id);
      return;
    }
    found.set(id, { file: id, names });
    // A module that gains or loses a server function has to invalidate the
    // manifest, or the dev server keeps mounting yesterday's set.
    const graph = server?.environments[ENVIRONMENTS.server]?.moduleGraph;
    const module = graph?.getModuleById(RESOLVED_MANIFEST_ID);
    if (module !== undefined && module !== null) graph?.invalidateModule(module);
  };

  /**
   * The entry a specifier resolves to, and whether it is the project's own.
   *
   * Recomputed per call rather than cached: `configResolved` runs once per
   * environment under a build, and a `src/entry-client.tsx` added while the dev
   * server is running should be picked up on the next request rather than on a
   * restart.
   */
  /**
   * The URL a browser asks for the client entry by, in dev.
   *
   * A project file is served at its root-relative path; a generated default has
   * no file, so it goes through `/@id/`, which is what Vite serves a virtual
   * module at.
   */
  const clientEntryUrl = (): string => {
    const own = findEntry(root, srcDirectory, "client");
    if (own === null) return `${base}@id/${CLIENT_ENTRY_ID}`;
    return base + relative(root, own).replaceAll("\\", "/");
  };

  const entries: Plugin = {
    name: "barq-start:entries",
    sharedDuringBuild: true,
    /**
     * A project's own entry resolves to the FILE, not to a re-export of it.
     *
     * The shim spelling was tried and is wrong: `export * from` does not
     * forward a default, so an `entry-server.ts` exporting `default { fetch }`
     * arrived with no `fetch` and the dev server refused it. Resolving to the
     * path also keeps the module's own identity in the graph, so HMR and the
     * watcher see the file the author edits.
     */
    resolveId(id) {
      if (id === CLIENT_ENTRY_ID) {
        return findEntry(root, srcDirectory, "client") ?? RESOLVED_CLIENT_ENTRY_ID;
      }
      if (id === SERVER_ENTRY_ID) {
        return findEntry(root, srcDirectory, "server") ?? RESOLVED_SERVER_ENTRY_ID;
      }
      // The project's own `src/router.ts` when it has one, exactly as an entry
      // resolves — so the framework imports one stable specifier and the choice
      // costs nothing anywhere else.
      if (id === SERVE_ENTRY_ID) return RESOLVED_SERVE_ENTRY_ID;
      if (id === ROUTER_ENTRY_ID) {
        return findRouterEntry(root, srcDirectory) ?? RESOLVED_ROUTER_ENTRY_ID;
      }
      return id === CLIENT_ASSETS_ID ? RESOLVED_CLIENT_ASSETS_ID : null;
    },
    load(id) {
      // A VIRTUAL module has no directory of its own, so a relative specifier
      // in it resolves against nothing. The generated default names the file by
      // its absolute path, which Vite resolves everywhere.
      const treeImport = join(root, options.routeTree ?? "src/routeTree.gen.ts").replaceAll(
        "\\",
        "/",
      );
      if (id === RESOLVED_CLIENT_ENTRY_ID) return defaultClientEntry();
      if (id === RESOLVED_SERVER_ENTRY_ID) return defaultServerEntry(serving);
      if (id === RESOLVED_SERVE_ENTRY_ID) {
        return defaultServeEntry(options.server, !serving && hasIndexHtml(root));
      }
      if (id === RESOLVED_ROUTER_ENTRY_ID) return defaultRouterEntry(treeImport);
      if (id !== RESOLVED_CLIENT_ASSETS_ID) return null;
      // In dev the entry is a module Vite serves; there are no chunks and no
      // CSS files, because the browser's own module graph does that work.
      const assets = server === null ? clientAssets : { scripts: [clientEntryUrl()], css: [] };
      return `export const clientAssets = ${JSON.stringify(assets)};\nexport default clientAssets;\n`;
    },
    /**
     * The client's own emitted names, for the server half to place.
     *
     * Keyed on OUR named input rather than on "an entry chunk": TanStack's
     * equivalent is `applyToEnvironment(env => env.name === "client")` with no
     * identity check, which throws when another framework in the same Vite app
     * owns an environment called `client`.
     */
    generateBundle(_output, bundle) {
      const environment = (this as { environment?: { name?: string } }).environment?.name;
      if (environment === ENVIRONMENTS.server) {
        // RECORDED, not reconstructed: rebuilding this name from the input path
        // dies on any `entryFileNames`, and the build already knows what it
        // wrote.
        for (const chunk of Object.values(bundle)) {
          if (chunk.type === "chunk" && chunk.isEntry && chunk.name === "server") {
            serverFile = chunk.fileName;
          }
        }
        return;
      }
      if (environment !== ENVIRONMENTS.client) return;
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk" || !chunk.isEntry || chunk.name !== "index") continue;
        const css = [...(chunk.viteMetadata?.importedCss ?? [])];
        clientAssets = {
          scripts: [`${base}${chunk.fileName}`],
          css: css.map((file) => `${base}${file}`),
        };
      }
    },
  };

  /** What the manifest actually shipped, for `buildEnd` to check against. */
  let mounted: Set<string> | null = null;

  const manifest: Plugin = {
    name: "barq-start:manifest",
    sharedDuringBuild: true,
    // Server-only by construction rather than by a check inside the hook: the
    // manifest imports every server-function module, so resolving it in the
    // client environment would pull all of them into the browser graph.
    applyToEnvironment: (environment) => environment.name !== ENVIRONMENTS.client,
    resolveId(id) {
      return id === MANIFEST_ID ? RESOLVED_MANIFEST_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_MANIFEST_ID) return null;
      mounted = new Set(found.keys());
      return manifestModule(found, idOf);
    },

    /**
     * The manifest is a RACE against the graph walk, and this is what stops it
     * being a silent one.
     *
     * `found` is filled by the compiler's `onServerFns`, which fires on
     * TRANSFORM. The manifest is a static import of the server entry, so
     * rolldown loads it before it has walked to any server-function module —
     * measured on a real two-environment build, `load(barq-server-fns)` ran with
     * `found.size = 0` and `transform(data.ts)` ran after it, so the built
     * server mounted NOTHING and every RPC 404'd on an app that works in dev.
     * Dev survives it on the module-graph invalidation at `record`; a build has
     * no invalidation.
     *
     * With `sharedDuringBuild` the client build runs first and fills `found`,
     * which covers every server function client code can reach — the normal
     * case, since calling one from the browser is what they are for. What it
     * cannot cover is a module reachable ONLY from the server entry, and that is
     * what this refuses. A build error naming the module beats a 404 at runtime,
     * and it is the same method BARQ012 uses: refuse the shape rather than
     * analyse around it.
     */
    buildEnd(this: unknown) {
      const context = this as {
        environment?: { name?: string };
        error: (message: string) => never;
      };
      if ((context.environment?.name ?? "") === ENVIRONMENTS.client) return;
      if (mounted === null) return;
      const late = [...found.keys()].filter((file) => !(mounted as Set<string>).has(file));
      if (late.length === 0) return;
      context.error(
        "[barq-start] these modules declare server functions but were discovered after the " +
          "manifest was generated, so nothing would mount them and every call to them would " +
          `404:\n  ${late.join("\n  ")}\n` +
          "Import them from client code — which is what a server function is for — or from a " +
          "module the client entry reaches, so the client build finds them first.",
      );
    },
  };

  const dev: Plugin = {
    name: "barq-start:dev",
    sharedDuringBuild: true,
    // `config` rather than `configResolved`: the environments have to exist
    // before Vite resolves them, and `consumer` is what decides whether a
    // module graph is a browser one.
    config(user) {
      // `configResolved` is too late — the environments have to exist by the
      // end of this hook — so the root is resolved the way Vite resolves it.
      const ownsEntry = hasIndexHtml(resolve(user.root ?? process.cwd()));
      const target = options.server?.target ?? "auto";
      const pinnedTarget = target === "auto" ? null : target;
      const inputs = {
        // NAMED, both of them. The client name is what `generateBundle` above
        // identifies its own entry chunk by, and the ssr name is the emitted
        // filename, and reconstructing it from the input path breaks on any
        // `entryFileNames`.
        //
        // NOT WHEN THE PROJECT WROTE AN `index.html`. `pages: false` is
        // documented as "the server-function half alone … what a project with
        // its own `index.html` wants", and forcing the input made that false:
        // `index.html` was not an input, so the build emitted chunks and no
        // document, and the application had nothing to serve. Left undefined,
        // Vite's own default takes `index.html` and the project's entry with
        // it. Keyed on the FILE rather than on `pages`, because those are two
        // different questions and `packages/start`'s own build fixture answers
        // them differently: it turns pages off and still wants this entry.
        client: ownsEntry ? undefined : { index: CLIENT_ENTRY_ID },
        // TWO ssr inputs: `server.js` is what the build imports to prerender and
        // what a platform imports for its `fetch`, and `serve.js` is what a
        // person runs. `defaultServeEntry` says why they cannot be one file.
        server: { server: SERVER_ENTRY_ID, serve: SERVE_ENTRY_ID },
      };
      return {
        // `?? "custom"`, never a bare assignment: `mergeConfig` lets a plugin's
        // scalar win, so returning it unconditionally would silently delete a
        // user's own `index.html` handling. Under `custom` Vite drops
        // `htmlFallbackMiddleware`, `indexHtmlMiddleware` and `notFoundMiddleware`
        // — the three that would otherwise answer a page URL before we do.
        appType: user.appType ?? (serving ? ("custom" as const) : undefined),
        // Declaring `builder` at all is what makes a plain `vite build` an APP
        // build; measured, `builder: {}` from a plugin's `config` is enough and
        // `--app` is not needed. With none declared, `buildApp` still fires but
        // `builder.environments.ssr` is undefined and the build dies.
        builder: {},
        environments: {
          [ENVIRONMENTS.client]: {
            consumer: "client" as const,
            build: {
              rollupOptions: { input: inputs.client },
              outDir: `${outputDirectory}/client`,
            },
          },
          [ENVIRONMENTS.server]: {
            consumer: "server" as const,
            // The framework has to be COMPILED here, not externalised. A
            // `@barqjs/*` in node_modules is resolved by the runtime's own
            // resolver otherwise, which takes the `import` condition to a built
            // `dist/` — and a stale one renders a spinner with an empty seed,
            // which is indistinguishable from a bug the repo had already fixed.
            resolve: {
              noExternal: [/@barqjs\//],
              // `target` is a BUILD-time choice, resolved here rather than by a
              // dynamic import at runtime. srvx's root export picks its adapter
              // from the runtime condition, and under a bundler the condition
              // applied is the BUILD's, not the deployment's — so a bundle built
              // on Node and run on Bun would carry the Node adapter. Naming the
              // target pins it.
              //
              // Anchored, so `srvx/static` is not rewritten to `srvx/bun/static`.
              alias:
                pinnedTarget === null
                  ? []
                  : [{ find: /^srvx$/, replacement: `srvx/${pinnedTarget}` }],
            },
            build: {
              ssr: true,
              rollupOptions: { input: inputs.server },
              outDir: `${outputDirectory}/server`,
              copyPublicDir: false,
            },
          },
        },
      };
    },

    /**
     * Client first, then ssr, and the order is not cosmetic: the server half
     * places the client's hashed chunk in its `<head>`, and that name only
     * exists once the client build has emitted it.
     *
     * Building them here rather than leaving it to Vite's fallback also pins the
     * order — the fallback iterates `Object.keys(config.environments)`, which is
     * config-merge order rather than anything declared.
     */
    async buildApp(builder) {
      const client = builder.environments[ENVIRONMENTS.client];
      const ssr = builder.environments[ENVIRONMENTS.server];
      if (client === undefined || ssr === undefined) {
        throw new Error(
          `[barq-start] expected a \`${ENVIRONMENTS.client}\` and an \`${ENVIRONMENTS.server}\` environment`,
        );
      }
      if (!client.isBuilt) await builder.build(client);
      if (!ssr.isBuilt) await builder.build(ssr);

      const wanted = options.prerender;
      if (wanted === undefined && options.verify === undefined) return;

      /**
       * IN-PROCESS, against the bundle that was just written.
       *
       * TanStack spawns `vite.preview()` and fetches over a socket, which costs
       * them a config re-resolved from disk that loses how the parent was
       * launched, and a server filename reconstructed from the input. What it
       * does NOT cost them, and what this inherits exactly, is that a
       * platform-targeted bundle cannot be imported into Node at all. That is a
       * limit of importing a server build, not of the
       * transport, and it is stated rather than papered over: a project
       * targeting a non-Node runtime prerenders on that runtime or not at all.
       */
      // RESOLVED against the root: `build.outDir` may be relative, and joining a
      // relative one lands next to the process's cwd rather than the project's.
      const outDirOf = (environment: { config: { root: string; build: { outDir: string } } }) =>
        resolve(environment.config.root, environment.config.build.outDir);
      const file = join(outDirOf(ssr), serverFile);
      const entry = (await import(pathToFileURL(file).href)) as ServerEntryModule;

      // The chain check, BEFORE anything is written. A build that is going to
      // fail should not leave half a site on disk first.
      const verify = options.verify;
      if (verify !== undefined) {
        const check = entry.default?.verifyChains;
        const reachability = verify.reachability();
        if (typeof check !== "function") {
          throw new TypeError(
            "[barq-start] `verify` needs the server entry to default-export " +
              "`verifyChains` — `export default createStartHandler()` from " +
              "`@barqjs/router/server` provides it. The check runs inside the built bundle " +
              "because that is where the route middleware and the mounted registry both are.",
          );
        }
        if (reachability === undefined) {
          throw new TypeError(
            "[barq-start] `verify.reachability()` answered nothing, so no route reaches any " +
              "server function as far as this build can tell. Wire " +
              "`barqRouter({ onReachability })` to the same variable — without it the check " +
              "would pass by knowing nothing.",
          );
        }
        const report = await check(reachability);
        if (report !== "") {
          if ((verify.onViolation ?? "error") === "warn") {
            builder.config.logger.warn(`[barq-start] ${report}`);
          } else {
            throw new Error(`[barq-start] ${report}`);
          }
        }
      }

      const clientOut = outDirOf(client);
      let pages: readonly PrerenderedPage[] = [];
      if (wanted !== undefined) {
        const result = await prerender({
          entry,
          outDir: clientOut,
          routes: wanted.routes ?? [],
          crawl: wanted.crawl ?? true,
          concurrency: wanted.concurrency ?? 4,
          subfolderIndex: wanted.subfolderIndex ?? true,
          base,
          log: (message) => builder.config.logger.info(`[barq] prerender ${message}`),
        });
        pages = result.pages;
        wanted.onPages?.(pages);
      }

      // LAST, and unconditionally: the manifest indexes what is on disk, so it
      // is written after the prerenderer has finished putting things there, and
      // a project with no prerender still has chunks and `public/` files to
      // serve. Skipped only when there is no client output at all.
      if (existsSync(clientOut)) await writeAssetManifest(clientOut, pages, base);
    },

    configResolved(config) {
      root = config.root;
      base = config.base ?? "/";
    },

    configureServer(viteServer) {
      server = viteServer;
      const environment = viteServer.environments[ENVIRONMENTS.server];
      if (!isRunnableDevEnvironment(environment)) {
        throw new Error(
          `[barq-start] the \`${ENVIRONMENTS.server}\` environment is not runnable, so server ` +
            "functions cannot be answered in dev",
        );
      }

      const report = (error: unknown): void => {
        try {
          viteServer.ssrFixStacktrace(error as Error);
        } catch {
          // A stack this cannot map is still an error worth reporting.
        }
      };

      /**
       * The URL this request is really for, base stripped.
       *
       * Two middlewares rewrite `req.url` before ours and neither restores it.
       * `baseMiddleware` strips the base — but it is registered AFTER the hooks
       * that run here, so a pre-hook sees the base-PREFIXED url; and Vite's SPA
       * fallback rewrites to `/index.html`, which is why `originalUrl` has to be
       * put back. Without the strip, `RPC_PREFIX` never matched under any
       * `base` other than `/` and every server function 404'd.
       */
      const pathOf = (req: { url?: string; originalUrl?: string }): string => {
        const raw = req.originalUrl ?? req.url ?? "/";
        if (base === "/" || !raw.startsWith(base)) return raw;
        const rest = raw.slice(base.length - 1);
        return rest.startsWith("/") ? rest : `/${rest}`;
      };

      // Before Vite's own middleware: a server-function URL is not a file and
      // not a page, and letting the SPA fallback answer it turns a 404 into an
      // HTML document a client would then try to parse as a value.
      viteServer.middlewares.use((req, res, next) => {
        const path = pathOf(req);
        req.url = path;
        if (!path.startsWith(RPC_PREFIX)) {
          next();
          return;
        }
        void (async () => {
          try {
            // Through the module runner, so a server function edited on disk is
            // the one that answers the next call.
            const start = (await environment.runner.import(
              "@barqjs/start/server",
            )) as typeof import("./server.ts");
            await environment.runner.import(MANIFEST_ID);

            const response = await start.handleServerFn(new NodeRequest({ req, res }), options);
            if (response === null) {
              next();
              return;
            }
            await sendNodeResponse(res, response);
          } catch (error) {
            report(error);
            next(error);
          }
        })();
      });

      // `undefined` and not a bare `return`: this hook's other arm returns the
      // POST hook, and a function that returns a value on one path and nothing
      // on another is what `consistent-return` is for.
      if (!serving) return undefined;

      /**
       * The page handler, as a POST hook.
       *
       * Returned rather than `use`d, and that is the whole ordering argument.
       * Vite runs `configureServer` bodies before its own stack and the
       * FUNCTIONS they return after it, so a returned middleware sits behind
       * `transformMiddleware`, `serveRawFs`, `serveStatic` and `servePublic` —
       * `/@vite/client`, `/src/*`, `node_modules` and everything in `public/`
       * are answered by Vite, and only what nothing claimed reaches SSR. The
       * RPC handler above is a PRE hook, so "server functions match before the
       * page" holds by stack position rather than by a comment.
       */
      /**
       * One handler per module INSTANCE, not per request.
       *
       * `createFetch` builds a matcher over the whole route table, so calling it
       * per request would recompile the app on every navigation. The runner
       * hands back a new module object when the entry or anything under it
       * changes, so keying on the object is the invalidation.
       */
      let built: { from: object; fetch: (request: Request) => Promise<Response> } | null = null;

      // `ServerEntryModule`, not a local restatement of it. There WAS a local
      // one here, declaring `createFetch` as a named module export, and it was
      // the second copy `protocol.ts`'s own header warns about — it went stale
      // the moment the contract moved onto `default` and `tsc` caught it.
      const pageFetch = async (): Promise<(request: Request) => Promise<Response>> => {
        const entry = (await environment.runner.import(SERVER_ENTRY_ID)) as ServerEntryModule;
        if (built !== null && built.from === entry) return built.fetch;
        // `createFetch` is how the dev server gets `/@vite/client` and every
        // `transformIndexHtml` plugin into a document Vite has no file for.
        // Reading one chunk off the response and hoping it is the whole head is
        // an undocumented invariant; this is the contract, and an entry without
        // it degrades to no injection rather than to a broken page.
        const fetchPage =
          typeof entry.default?.createFetch === "function"
            ? entry.default.createFetch({
                transformShell: (shell: string, url: URL) => transformShell(viteServer, shell, url),
              })
            : entry.default?.fetch;
        if (typeof fetchPage !== "function") {
          throw new Error(
            `[barq-start] ${SERVER_ENTRY_ID} must default-export \`createStartHandler()\` ` +
              "or `{ fetch(request): Response }`",
          );
        }
        built = { from: entry, fetch: fetchPage };
        return fetchPage;
      };

      return () => {
        viteServer.middlewares.use((req, res, next) => {
          void (async () => {
            try {
              req.url = pathOf(req);
              const response = await (await pageFetch())(new NodeRequest({ req, res }));
              await sendNodeResponse(res, response);
            } catch (error) {
              report(error);
              next(error);
            }
          })();
        });
      };
    },
  };

  return [
    {
      // SHARED with the rest of them, and sharing SOME is worse than sharing
      // none. `found` lives in this closure and only the compiler plugin's
      // `onServerFns` fills it; with `sharedConfigBuild` false Vite re-resolves
      // the whole config per environment, so an unshared compiler plugin belongs
      // to a DIFFERENT `barqStart()` call than the shared manifest reads from —
      // and the manifest then generates empty in every environment. Measured on
      // a real build: the client half was a correct `clientRpc` stub and the
      // server bundle mounted nothing.
      sharedDuringBuild: true,
      ...barqVitePlugin({
        // `.ts` and `.js` are in the set because a server-function module is
        // normally one of them — it holds no JSX, which is exactly why the
        // compiler's own default (`.tsx`, `.jsx`) does not reach it. Without this
        // the client half of `users.ts` is never synthesized and its handler
        // bodies ship, silently, because nothing transformed the module at all.
        //
        // A module with no JSX and no server function passes through unchanged,
        // so the cost is one parse.
        include: [".tsx", ".jsx", ".ts", ".js"],
        ...options.compiler,
        serverFns: true,
        onServerFns: record,
      }),
    },
    entries,
    manifest,
    dev,
  ];
}

function manifestModule(
  found: Map<string, Discovered>,
  idOf: (file: string, name: string) => string,
): string {
  const lines: string[] = [`import { mount } from "@barqjs/start/server";`];
  let index = 0;
  for (const { file, names } of found.values()) {
    const alias = `m${index++}`;
    lines.push(`import * as ${alias} from ${JSON.stringify(file)};`);
    for (const name of names) {
      lines.push(`mount(${JSON.stringify(idOf(file, name))}, ${alias}.${name});`);
    }
  }
  // An empty manifest is a module, not an error: an app with no server
  // functions still imports this and still has to load.
  lines.push("export {};");
  return lines.join("\n");
}
