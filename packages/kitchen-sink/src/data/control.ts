/**
 * Server functions whose ANSWER is a control-flow throw.
 *
 * `throw redirect(...)` and `throw notFound()` are the two most ordinary things
 * a handler does after it looks something up, and until recently a server
 * function could carry neither: both fell past the request handler's rethrow and
 * became a 500 with an opaque body. What makes them work is a brand rather than
 * a class, because `@barqjs/start` cannot import `@barqjs/router` to check
 * `instanceof` against — see `REDIRECT` in `packages/router/src/errors.ts`.
 *
 * These are here rather than in the route file because a server function has to
 * live in a module of its own: `BARQ012` enforces the split, and the reason is
 * that the handler body must not reach the client bundle.
 */

import { notFound, redirect } from "@barqjs/router";
import { createServerFn } from "@barqjs/start";

/** A row that exists, so the ordinary path has something to answer with. */
const ROWS: Record<string, { readonly title: string }> = {
  "1": { title: "the first row" },
};

/**
 * The shape a real handler has: look it up, and say so when it is not there.
 *
 * On the DATA channel this answers 404 with a body the client turns back into a
 * `notFound()`, so the route's `notFoundComponent` renders. It is not a 500 and
 * not a rejected promise with a stringified error.
 */
export const loadRow = createServerFn()
  .validator("unchecked")
  .handler(({ data }): { readonly title: string } => {
    const row = ROWS[String(data)];
    if (row === undefined) notFound(`no row ${JSON.stringify(String(data))}`);
    return row;
  });

/**
 * A handler that decides the caller belongs somewhere else.
 *
 * The two channels answer differently and have to: a browser following a form
 * POST needs a real 3xx, and `fetch` would FOLLOW one — handing the caller the
 * target page's HTML instead of a navigation. So the data channel answers 200
 * and describes the redirect, and the client re-throws it for the router, which
 * makes it a soft navigation rather than a document load.
 */
export const gatedAction = createServerFn()
  .validator("unchecked")
  .handler(({ data }): never => {
    redirect(`/about?from=${encodeURIComponent(String(data))}`);
  });
