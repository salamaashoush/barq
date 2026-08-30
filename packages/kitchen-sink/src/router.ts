/**
 * The project's own router entry, which `#barq-router-entry` aliases to.
 *
 * A project writes this file when it wants to configure the router; without it
 * the plugin generates an equivalent naming only the route tree. `basepath`
 * belongs here too, for a deployment mounted somewhere other than the origin
 * root.
 */

import { routeTree } from "./routeTree.gen.ts";

export const config = {
  routeTree,
  /**
   * Answers for every route and every link that declares none of its own.
   *
   * `preload: "intent"` is the interesting one: no `<Link>` in this application
   * carries a `preload` prop, and hovering one still warms the target route's
   * loader. Set once here rather than repeated on every link.
   */
  defaults: { preload: "intent" as const },
};
