/**
 * The server entry, and it is OPTIONAL for the same reason the client one is:
 * `barqStart` generates this exact module when a project writes none.
 *
 * No `document` template — the document is `shellComponent` on the root route,
 * and `<HeadContent />` and `<Scripts />` place themselves. The only thing this
 * hands over is `clientAssets`, which the build produces and no route can know
 * about.
 *
 * The dev server adds `transformShell`; the prerenderer sets `stream: false`
 * and `refuseRequest`. Both build from THIS declaration, so a page rendered at
 * build time comes from the same one as a page rendered for a request.
 */

import {
  type PageHandlerOptions,
  chainVerifier,
  createPageHandler,
  renderRoutes,
} from "@barqjs/router/server";
import { clientAssets } from "virtual:barq-client-assets";
import { routeAssets } from "virtual:barq-route-assets";
// MOUNTS every server function the build found. Importing it is what gives each
// one a URL — without this line `/_barq/fn/<id>` 404s for all of them, and the
// route-action check below has an empty registry to ask.
import "virtual:barq-server-fns";

import { routeTree } from "./routeTree.gen.ts";

export const options: PageHandlerOptions = {
  routeTree,
  routeAssets,
  clientAssets,
  app: (state) => renderRoutes(state),
};

/**
 * The route-action chain check, exposed to the BUILD.
 *
 * It runs here rather than in the Vite plugin because this is the only place
 * that can see both halves: `resolve.noExternal` compiles `@barqjs/*` into this
 * bundle, so a plugin importing the registry would be asking a second, empty
 * one — and a route's `middleware` are closures that exist nowhere else.
 */
export const verifyChains = chainVerifier(options.routeTree);

export const createFetch = (extra: Partial<PageHandlerOptions>) =>
  createPageHandler({ ...options, ...extra });

export default { fetch: createFetch({}) };
