/**
 * One middleware, declared once, referenced by BOTH a route and the server
 * functions that route can reach.
 *
 * The build compares those two references with `===`. That is the whole
 * mechanism: `Middleware` is an anonymous closure with no build-visible
 * identity, and every attempt to read `.middleware([…])` out of source dies on
 * the shapes people actually write — `[m]`, `[...chain]`, `chain.filter(Boolean)`.
 * Reference identity resolves all of them and needs no compiler work.
 */

import type { Middleware } from "@barqjs/start";

/**
 * Refuses before the handler's input is even parsed.
 *
 * `serverRpc` runs middleware BEFORE validation deliberately: an unauthenticated
 * caller should be refused without the server parsing its payload, and a
 * rejection that depended on well-formed input is one an attacker skips by
 * sending malformed input.
 */
export const requireSession: Middleware = async (next) => {
  // A real application reads a cookie here through `getRequest()`. The point of
  // the demo is the BINDING, not the check.
  //
  // `next({ context })` is how a middleware hands what it learned down to the
  // handler, which reads it as `({ context })` — theirs is the same shape. It
  // needs no module-level store, which is what makes it safe under concurrency.
  return next({ context: { session: { user: "ada" } } });
};
