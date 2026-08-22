/**
 * The server-entry contract: what a built `dist/server` module exports, and the
 * one header the prerenderer and the page handler agree on.
 *
 * It is its own module because three parties need it and none of them may
 * depend on the other two. `prerender.ts` reads the header and calls the entry;
 * `@barqjs/router/server` writes the header; `vite.ts` generates an entry that
 * has to match. Nothing here imports anything — no `node:fs`, no
 * `node:async_hooks` — so the router, which runs on workerd as readily as on
 * Node, can import it without dragging a runtime in.
 *
 * Before this existed the header was a string literal in two files.
 */

/**
 * The header a page handler answers with when it was built for a prerender.
 *
 * `"0"` means the matched route did not declare `prerender`, so a path the
 * CRAWL found is rendered and discarded rather than written. A path the config
 * named is always written — naming it is the declaration.
 */
export const PRERENDER_HEADER = "x-barq-prerender";

/**
 * What the built server entry has to export.
 *
 * `createFetch` beside `default` is the whole reason one declaration serves
 * three callers: `stream` is fixed when the handler is built, so a prerenderer
 * handed only `fetch` has nothing to build a non-streaming twin from — and a
 * streamed response buffered to a string is not a static page, it is a static
 * page with its placeholders and swap scripts baked in.
 */
export interface ServerEntryModule {
  readonly default?: { readonly fetch?: (request: Request) => Promise<Response> };
  readonly createFetch?: (
    extra: Record<string, unknown>,
  ) => (request: Request) => Promise<Response>;
  /**
   * The route-action chain check, from `chainVerifier(options.routes)`.
   *
   * Optional, and it lives HERE rather than in the plugin because it is the
   * only place that can see both halves: `resolve.noExternal` compiles
   * `@barqjs/*` into the ssr bundle, so the registry a plugin would import is a
   * different, empty one, and the route definitions' `middleware` are closures
   * that exist nowhere else.
   */
  readonly verifyChains?: (
    reachability: ReadonlyMap<string, ReadonlySet<string>>,
  ) => string | Promise<string>;
}
