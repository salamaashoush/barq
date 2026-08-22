import "virtual:barq-server-fns";
import { createPageHandler, renderRoutes } from "@barqjs/router/server";
import { clientAssets } from "virtual:barq-client-assets";
import { routes } from "./routes.tsx";

export const options = {
  routes,
  app: (state: never) => renderRoutes(state),
  document: ({ body, seed, preload, context }: never) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8">${preload}${context}</head>` +
    `<body><div id="app">${body}</div>${seed}` +
    clientAssets.scripts.map((src: string) => `<script type="module" src="${src}"></script>`).join("") +
    `</body></html>`,
};

export const createFetch = (extra: never) =>
  createPageHandler({ ...(options as never), ...(extra as never) });

export default { fetch: createFetch({} as never) };
