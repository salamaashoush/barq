/**
 * The request a server function is running for.
 *
 * Ambient rather than threaded through every signature, because a handler five
 * calls deep needs the cookie header and passing a `Request` down to it turns
 * every intermediate function into plumbing.
 *
 * `AsyncLocalStorage` and not a module-level variable: two requests are in
 * flight at once on any real server, and a module-level variable would hand one
 * request's handler the other's session. That is
 * [GHSA-hgv7-v322-mmgr](https://github.com/advisories/GHSA-hgv7-v322-mmgr) in
 * SvelteKit — `query.batch()` merging concurrent requests under one context and
 * disclosing data across users.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  request: Request;
  /**
   * Why this request must not be read, when it must not be.
   *
   * A PRERENDER holds a `Request` a build minted, so `getRequest()` would
   * answer with a build machine's headers and a cookie jar that is empty for
   * everyone. SvelteKit guards `url.search` alone and lets `cookies.get` and
   * `request.headers` return null in silence; its own tracker records that as
   * multi-day debugging. Refusing is the honest answer, and the message names
   * what to do instead.
   */
  refuse?: string;
}

const STORAGE = new AsyncLocalStorage<RequestContext>();

/** Run `body` with `request` as the ambient one. */
export function withRequest<T>(request: Request, body: () => T, refuse?: string): T {
  return STORAGE.run({ request, refuse }, body);
}

/**
 * The request this server function is running for.
 *
 * Throws outside one rather than returning undefined: a handler reading cookies
 * off `undefined` is a bug that should surface where it happens, not resolve to
 * "no session" and let the request through.
 */
export function getRequest(): Request {
  const context = STORAGE.getStore();
  if (context === undefined) {
    throw new Error("getRequest() is only available inside a server function");
  }
  if (context.refuse !== undefined) throw new Error(context.refuse);
  return context.request;
}

/**
 * The request, or undefined outside one. For code that legitimately runs both ways.
 *
 * A refused context reads as ABSENT here rather than throwing: `peekRequest` is
 * the "I may not be in a request" spelling, and a prerender is exactly that
 * case. Code that must have one calls `getRequest` and gets the refusal.
 */
export function peekRequest(): Request | undefined {
  const context = STORAGE.getStore();
  return context === undefined || context.refuse !== undefined ? undefined : context.request;
}
