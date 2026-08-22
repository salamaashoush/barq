// Importing IS the effect: this is what mounts every server function the build
// found. `import * as` rather than a bare side-effect import only because the
// lint rule cannot tell the two apart.
import * as mounts from "virtual:barq-server-fns";

import { clientAssets } from "virtual:barq-client-assets";

void mounts;

const PAGES: Record<string, string> = {
  "/": `<h1>home</h1><a href="/about">about</a><a href="/deep/page">deep</a>`,
  "/about": `<h1>about</h1><a href="/">home</a>`,
  "/deep/page": `<h1>deep</h1>`,
};

/**
 * A hand-written server entry, so this package can test the WIRING without
 * depending on `@barqjs/router` — which depends on it.
 *
 * `createFetch` is the export the dev server and the prerenderer both build
 * from, so a page rendered at build time comes from the same declaration as one
 * rendered for a request.
 */
/**
 * The route-action chain check, as the BUILD reaches it.
 *
 * The real one is `chainVerifier(options.routes)` from `@barqjs/router/server`,
 * which this package cannot import — the router depends on it, not the other way
 * round. What is under test HERE is the plumbing: that `buildApp` finds this
 * export, hands it the module-graph fact, and does the right thing with what it
 * answers. The verifier's own logic is `router/src/manifest.test.ts`.
 */
export const verifyChains = (reachability: ReadonlyMap<string, ReadonlySet<string>>): string => {
  const ids = [...reachability.values()].flatMap((set) => [...set]);
  return ids.includes("src/data.ts#loadUser")
    ? "1 server function(s) do not carry the middleware of a route that reaches them."
    : "";
};

export const createFetch = (extra: Record<string, unknown>) => {
  const streaming = extra.stream !== false;
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const body = PAGES[url.pathname];
    if (body === undefined) return new Response("not found", { status: 404 });
    const scripts = clientAssets.scripts
      .map((src) => `<script type="module" src="${src}"></script>`)
      .join("");
    return new Response(
      `<!doctype html><html><head><title>${url.pathname}</title></head>` +
        `<body><div id="app">${body}</div>${streaming ? "<!--streamed-->" : ""}${scripts}</body></html>`,
      {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "x-page": url.pathname },
      },
    );
  };
};

export default { fetch: createFetch({}) };
