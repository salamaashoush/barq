import { type PageHandlerOptions, createPageHandler, renderRoutes } from "@barqjs/router/server";
import { clientAssets } from "virtual:barq-client-assets";
import { routeAssets } from "virtual:barq-route-assets";
import { routes } from "virtual:barq-routes";

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
export const createFetch = (extra: Partial<PageHandlerOptions>) =>
  createPageHandler({ ...options, ...extra });

export default { fetch: createFetch({}) };
