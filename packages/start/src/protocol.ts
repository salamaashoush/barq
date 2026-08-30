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
 * ALL THREE HANG OFF `default`, because a default export is the only thing a
 * one-line entry can provide and `export default createStartHandler()` is the
 * whole file. They were named module exports, which is exactly why a
 * hand-written entry had to be a transcription of the generated one: the build
 * needs all three, and only the build does.
 *
 * `createFetch` beside `fetch` is the reason one declaration serves three
 * callers: `stream` is fixed when the handler is built, so a prerenderer handed
 * only `fetch` has nothing to build a non-streaming twin from — and a streamed
 * response buffered to a string is not a static page, it is a static page with
 * its placeholders and swap scripts baked in.
 *
 * `verifyChains` is the route-action chain check. It runs from inside the ssr
 * bundle rather than from a Vite plugin because that is the only place that can
 * see both halves: `resolve.noExternal` compiles `@barqjs/*` into that bundle,
 * so the registry a plugin would import is a different, empty one, and the route
 * definitions' `middleware` are closures that exist nowhere else. Living in
 * APPLICATION source was never part of that — `@barqjs/router/server` is
 * compiled into the same bundle, which is where it is now.
 *
 * Every member is optional so a project may default-export a bare `{ fetch }`
 * and get a server with no prerender and no chain check, which is a legitimate
 * thing to deploy.
 */
export interface ServerEntryModule {
  readonly default?: {
    readonly fetch?: (request: Request) => Promise<Response>;
    readonly createFetch?: (
      extra: Record<string, unknown>,
    ) => (request: Request) => Promise<Response>;
    readonly verifyChains?: (
      reachability: ReadonlyMap<string, ReadonlySet<string>>,
    ) => string | Promise<string>;
  };
}
