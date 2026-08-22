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
