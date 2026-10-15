import { createMiddleware } from "@barqjs/start";

/**
 * Both halves. The client one reaches the browser with the stub that names
 * this chain; the server one, and the string it holds, must not.
 */
export const audit = createMiddleware()
  .client(({ next }) => next({ sendContext: { from: "audit-client-half-reached-the-client" } }))
  .server(({ next }) => next({ context: { audited: "audit-server-half-must-not-ship" } }));
