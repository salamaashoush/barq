import {
  type PageHandlerOptions,
  chainVerifier,
  createPageHandler,
  renderRoutes,
} from "@barqjs/router/server";
import { clientAssets } from "virtual:barq-client-assets";
import { routeAssets } from "virtual:barq-route-assets";
import { routes } from "virtual:barq-routes";
// MOUNTS every server function the build found. Importing it is what gives each
// one a URL — without this line `/_barq/fn/<id>` 404s for all of them, and the
// route-action check below has an empty registry to ask.
import "virtual:barq-server-fns";

import { baseStyles, collectStyles } from "./styles";

baseStyles();

export const options: PageHandlerOptions = {
  routes,
  routeAssets,
  app: (state) => renderRoutes(state),
  document: ({ body, seed, preload, context }) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Barq Kitchen Sink</title>` +
    `<style id="_goober">${collectStyles()}</style>` +
    `${clientAssets.css.map((href: string) => `<link rel="stylesheet" href="${href}">`).join("")}` +
    `${preload}${context}</head><body><div id="app">${body}</div>${seed}` +
    `${clientAssets.scripts.map((src: string) => `<script type="module" src="${src}"></script>`).join("")}` +
    `</body></html>`,
};

/**
 * The dev server adds `transformShell`; the prerenderer sets `stream: false`
 * and `refuseRequest`. Both build from THIS declaration, so a page rendered at
 * build time comes from the same one as a page rendered for a request.
 */
/**
 * The route-action chain check, exposed to the BUILD.
 *
 * It runs here rather than in the Vite plugin because this is the only place
 * that can see both halves: `resolve.noExternal` compiles `@barqjs/*` into this
 * bundle, so a plugin importing the registry would be asking a second, empty
 * one — and a route's `middleware` are closures that exist nowhere else.
 */
export const verifyChains = chainVerifier(options.routes);

export const createFetch = (extra: Partial<PageHandlerOptions>) =>
  createPageHandler({ ...options, ...extra });

export default { fetch: createFetch({}) };
