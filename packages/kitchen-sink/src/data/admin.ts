/**
 * The server functions `/admin` can reach.
 *
 * Both carry `requireSession`, and they have to: `/admin` declares it, the build
 * walks the CLIENT module graph from the route to this module, and every id it
 * finds must carry the route's whole chain. Delete `.middleware([requireSession])`
 * from either one and `vite build` fails naming the route, the function, and how
 * many of the chain it is missing.
 *
 * That is the hole every framework surveyed documents instead of closing. A
 * server function is its own HTTP endpoint: the guard on the route that renders
 * it does not run when the function is called directly, and no amount of route
 * middleware changes that. What CAN be checked is that the two agree, before the
 * build ships.
 */

import { createServerFn } from "@barqjs/start";

import { requireSession } from "../auth.ts";

export interface AdminStats {
  readonly users: number;
  readonly sessions: number;
}

export const adminStats = createServerFn()
  .middleware([requireSession])
  // `({ data, context, signal })` is what a handler is handed, which is theirs
  // (`start-basic/src/utils/posts.tsx:12`). This one takes no input, so it is
  // called `adminStats()` — the bare convention forced `adminStats(undefined)`.
  .handler((): AdminStats => ({ users: 3, sessions: 7 }));

/**
 * REACHABILITY IS PER-MODULE, not per-function, and that is a stated limit
 * rather than an oversight: the synthesized client stub declares every export of
 * its module whatever the importer used, and a bundler's graph exposes imported
 * ids and not imported bindings. So this function is "reachable from /admin"
 * even for a page that only ever calls `adminStats`. The consequence is
 * over-restriction, which fails safe.
 */
export const rotateKeys = createServerFn()
  .middleware([requireSession])
  .handler(() => ({ rotated: true }));
