/**
 * The project's own router entry, which `#barq-router-entry` aliases to.
 *
 * A project writes this file when it wants to configure the router; without it
 * the plugin generates an equivalent naming only the route tree. `basepath`
 * belongs here too, for a deployment mounted somewhere other than the origin
 * root.
 */

import { setupRouterSsrQueryIntegration } from "@barqjs/query/router";
import { createRouter } from "@barqjs/router";
import { QueryClient } from "@tanstack/query-core";

import { routeTree } from "./routeTree.gen.ts";

/**
 * One router, and one query client with it: for each request on the server,
 * and for the tab in the browser.
 *
 * A client at module scope would be one cache for every visitor the server
 * renders for, so whatever one request fetched could answer another's.
 */
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 5000, retry: 1 } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    /**
     * Answers for every route and every link that declares none of its own.
     *
     * `preload: "intent"` is the interesting one: no `<Link>` in this application
     * carries a `preload` prop, and hovering one still warms the target route's
     * loader. Set once here rather than repeated on every link.
     */
    defaults: { preload: "intent" as const },
  });
  // The root route places the provider itself, around its outlet.
  setupRouterSsrQueryIntegration({ router, queryClient, wrapQueryClient: false });
  return router;
}
