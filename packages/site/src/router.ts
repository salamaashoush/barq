/**
 * The project's own router entry, which `#barq-router-entry` aliases to.
 *
 * Without this file the plugin generates one naming the route tree and nothing
 * else, which is `preload: false` — a `<Link>` warms nothing until it is
 * clicked, and the commit then waits for the route's chunk with the fetch not
 * yet started. `"intent"` is TanStack Start's own default (`defaultPreload`),
 * and it is what makes the wait a warm cache rather than a network round trip.
 */

import { routeTree } from "./routeTree.gen.ts";

export const config = {
  routeTree,
  defaults: { preload: "intent" as const },
};
