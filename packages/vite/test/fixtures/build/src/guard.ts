/**
 * A middleware closure, imported from CLIENT code.
 *
 * This is not a contrived shape: `verify` compares the route's declared chain
 * against each server function's by REFERENCE, so a route that declares one has
 * to import the same binding the function carries — which puts this module, and
 * everything it imports, in the client graph. `@barqjs/start` is documented as
 * the isomorphic entry, so importing `useSession` from it here is what an
 * application is told to write.
 *
 * `context.ts` used to build its `AsyncLocalStorage` at module scope, and a
 * bundler answers `node:async_hooks` with an empty stub rather than an error.
 * The chunk therefore evaluated in the browser and threw
 * `AsyncLocalStorage is not a constructor` before any application code ran.
 */

import { type Middleware, useSession } from "@barqjs/start";

/**
 * A string literal, because the assertion has to survive minification: every
 * identifier in the emitted chunk is renamed, so `useSession` is not a marker
 * and `guard.ts` reaching the browser is not otherwise visible from outside.
 */
const MARKER = "guard-module-reached-the-client";

export const requireSession: Middleware = async (next) => {
  const session = await useSession<{ user: string }>({ password: "fixture-key-not-a-secret" });
  return next({ context: { user: session.data.user ?? MARKER } });
};
