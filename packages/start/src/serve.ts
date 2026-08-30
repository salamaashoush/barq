/**
 * The production entry — runtime-agnostic.
 *
 * `srvx`'s root export resolves by runtime condition (`deno`, `bun`, `workerd`,
 * `node`, and a generic default), so one entry serves Node, Deno, Bun and
 * Cloudflare without a per-runtime adapter here. The handler below is an
 * ordinary `Request -> Response` function, which is the only shape all of them
 * agree on.
 *
 * The dev half is deliberately NOT this: Vite's middleware pipeline is
 * Connect-shaped and hands over a Node request/response pair, so `vite.ts`
 * adapts with `srvx/node`. That is adapting Vite, not choosing a runtime.
 */

import { type Server, type ServerOptions, serve } from "srvx";

import { type HandlerOptions, handleServerFn } from "./server.ts";
import { type StaticOptions, assetMiddleware } from "./static.ts";

export type { AssetManifest, PrerenderedAsset, StaticOptions } from "./static.ts";
export { ASSET_MANIFEST_FILE, assetMiddleware } from "./static.ts";

export interface BarqServeOptions extends Omit<ServerOptions, "fetch">, HandlerOptions {
  /**
   * What answers everything that is not a server function — a page render, a
   * static file, an API route.
   *
   * A 404 is the default rather than an error: a server that only exposes
   * server functions is a legitimate deployment, and inventing a page handler
   * for it would be worse than saying nothing is there.
   */
  fetch?: (request: Request) => Response | Promise<Response>;
  /**
   * Serve the build's own files, in front of everything else.
   *
   * `true` serves `dist/client` through the manifest the build wrote. Omitted,
   * nothing static is served — which is right for a deployment whose assets are
   * on a CDN and for a server that only answers server functions, and wrong
   * enough to notice for anything else.
   *
   * `static.ts` explains why a manifest rather than a `stat`: the common request
   * is a MISS, and answering it without touching the disk is worth 0.5 us.
   */
  static?: boolean | StaticOptions;
  /**
   * The document to answer a page request with, for a deployment that renders
   * its pages in the browser.
   *
   * A path to the built `index.html`. Consulted only after everything else has
   * declined — the assets, the server functions and the route handlers all run
   * first — so `/api/health` still answers JSON and `/_barq/fn/<id>` is still
   * reserved. Nothing else can do this job: the asset middleware answers what
   * the build WROTE, and an SPA's routes are exactly the paths it did not.
   */
  spa?: string;
}

/**
 * One request, in the order the checks have to happen.
 *
 * Server functions are matched FIRST. Their URL is reserved, so a page handler
 * that also matched it would be shadowing an endpoint rather than serving a
 * page — and the failure that produces is a mutation quietly answered with
 * HTML.
 */
export function createFetchHandler(
  options: BarqServeOptions = {},
): (request: Request) => Promise<Response> {
  const page = options.fetch ?? (() => new Response("not found", { status: 404 }));
  const document = options.spa;
  return async (request: Request): Promise<Response> => {
    const answered = await handleServerFn(request, options);
    if (answered !== null) return answered;
    const response = await page(request);
    if (document === undefined || response.status !== 404) return response;
    // Only a navigation. A 404 for a missing asset or an XHR is an answer the
    // caller has to see, and handing it a document instead is the failure every
    // SPA fallback that matches on "not a file" eventually produces.
    if (request.method !== "GET" && request.method !== "HEAD") return response;
    if (!(request.headers.get("accept") ?? "").includes("text/html")) return response;
    return spaDocument(document, response);
  };
}

/**
 * The built `index.html`, read once and held.
 *
 * `node:fs` is imported inside rather than at module scope, for the reason
 * `static.ts` gives: this module resolves on workerd too, where there is none.
 */
let spaBody: Promise<string> | undefined;
async function spaDocument(path: string, missing: Response): Promise<Response> {
  spaBody ??= import("node:fs/promises").then((fs) => fs.readFile(path, "utf8"));
  try {
    return new Response(await spaBody, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch {
    // The 404 the handler already produced, rather than a 500 about a file the
    // caller never asked for.
    spaBody = undefined;
    return missing;
  }
}

/**
 * Serve on whatever runtime this is.
 *
 * Mount the generated manifest before calling this — importing
 * `virtual:barq-server-fns` is what puts the ids in the registry, and without
 * it every call is a 404.
 */
export function serveBarq(options: BarqServeOptions = {}): Server {
  // `reachable` and `static` come out too. They were not, so both were handed
  // to `serve()` as options it has never heard of — harmless, and exactly the
  // drift that spreads once one key leaks.
  const {
    fetch: _page,
    allowedOrigins: _origins,
    reachable: _reachable,
    static: assets,
    spa: _spa,
    middleware,
    ...rest
  } = options;

  // FIRST in the chain, so a hashed chunk never enters the page handler. Ahead
  // of a project's own middleware too: those exist to shape application
  // responses, and an asset is not one.
  const chain =
    assets === undefined || assets === false
      ? middleware
      : [assetMiddleware(assets === true ? {} : assets), ...(middleware ?? [])];

  return serve({ ...rest, middleware: chain, fetch: createFetchHandler(options) });
}
