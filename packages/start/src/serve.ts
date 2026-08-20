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
  return async (request: Request): Promise<Response> => {
    const answered = await handleServerFn(request, options);
    return answered ?? (await page(request));
  };
}

/**
 * Serve on whatever runtime this is.
 *
 * Mount the generated manifest before calling this — importing
 * `virtual:barq-server-fns` is what puts the ids in the registry, and without
 * it every call is a 404.
 */
export function serveBarq(options: BarqServeOptions = {}): Server {
  const { fetch: _page, allowedOrigins: _origins, ...rest } = options;
  return serve({ ...rest, fetch: createFetchHandler(options) });
}
