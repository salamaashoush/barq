/**
 * A middleware with a half on each side. The client half stamps when the call
 * left; the server half reads which function it runs around and sends back
 * when it answered. `forgetsNext` is the mistake the runner refuses: a server
 * half that returns without calling `next()`.
 */

import { createMiddleware } from "@barqjs/start";

export const traced = createMiddleware()
  .client(({ next }) => next({ sendContext: { sentAt: new Date() } }))
  .server(({ next, method, serverFnMeta, clientContext }) =>
    next({
      context: {
        trace: `${method ?? "?"} ${serverFnMeta?.id ?? "?"}`,
        sentAt: clientContext.sentAt instanceof Date ? clientContext.sentAt : null,
      },
      sendContext: { servedAt: new Date() },
    }),
  );

export const forgetsNext = createMiddleware().server(async function forgetsNext() {});
