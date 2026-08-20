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
}

const STORAGE = new AsyncLocalStorage<RequestContext>();

/** Run `body` with `request` as the ambient one. */
export function withRequest<T>(request: Request, body: () => T): T {
  return STORAGE.run({ request }, body);
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
  return context.request;
}

/** The request, or undefined outside one. For code that legitimately runs both ways. */
export function peekRequest(): Request | undefined {
  return STORAGE.getStore()?.request;
}
