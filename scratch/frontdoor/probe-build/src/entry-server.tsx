import { adminOnly } from "./serveronly.ts";
import "virtual:barq-server-fns";
import { createPageHandler, renderRoutes } from "@barqjs/router/server";
import { routes } from "./routes.tsx";

export const _keep = adminOnly;
export default {
  fetch: createPageHandler({
    routes,
    app: (state) => renderRoutes(state),
    document: ({ body }) => `<!doctype html><html><head></head><body><div id="app">${body}</div></body></html>`,
  }),
};
