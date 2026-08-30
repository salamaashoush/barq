/**
 * The request a server function, a loader or a route handler is running for —
 * and the response it is building.
 *
 * Ambient rather than threaded through every signature, because a handler five
 * calls deep needs the cookie header and passing a `Request` down to it turns
 * every intermediate function into plumbing. That argument applies to the
 * RESPONSE just as hard: a login sets a cookie from inside the function that
 * checked the password, and threading a `Response` back up through the value it
 * returns is the plumbing again, in the other direction.
 *
 * `AsyncLocalStorage` and not a module-level variable: two requests are in
 * flight at once on any real server, and a module-level variable would hand one
 * request's handler the other's session. SvelteKit shipped exactly that:
 * concurrent requests merged under one context, disclosing data across users.
 * TanStack reaches for the same primitive for the same reason.
 *
 * THE DRAFT IS THE FIX FOR A MEASURED HOLE. Before it, a server function could
 * not set a cookie at all on the JS path: `handleServerFn` answered the `.data`
 * channel with `Response.json(encodeWire(result))`, so a returned `Response`
 * went into the value codec and came back as `Seroval Error (step: 1)` — a 500
 * with nothing in it. The no-JS form path returned it correctly, so the same
 * function behaved differently depending on whether JS had run, which is the
 * one divergence progressive enhancement exists to prevent.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import { type CookieOptions, deleteCookieLine, parseCookies, serializeCookie } from "./cookies.ts";

/**
 * Headers and a status a handler asked for, merged into whatever is returned.
 *
 * A `Headers` rather than a plain object because `set-cookie` is the one header
 * that legitimately appears more than once, and only `Headers` can hold two.
 */
export interface ResponseDraft {
  readonly headers: Headers;
  status?: number;
  statusText?: string;
}

export interface RequestContext {
  request: Request;
  /** What the handler has asked the response to carry. */
  response: ResponseDraft;
  /**
   * The request's cookies, parsed ONCE.
   *
   * `getCookie` went through `parseCookies` every call, so a middleware that
   * reads a session, a handler that reads a preference and a loader that reads a
   * locale re-split the same header three times. The header is immutable for the
   * life of the request, so the parse is too.
   */
  cookies?: Record<string, string>;
  /**
   * Rules `@barqjs/css` registered while rendering THIS request.
   *
   * A server imports the application once and serves forever, so a module-scope
   * rule belongs to every request and a rule a component body registers belongs
   * to one. Kept here rather than in the css package because this is what knows
   * which request is current — two in flight at once cannot take each other's.
   */
  css?: Map<string, string>;
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

/**
 * Built on first use, never at module scope.
 *
 * `@barqjs/start` is documented as the ISOMORPHIC entry — `createServerFn`, the
 * context, sessions, cookies — so a browser bundle reaches this module whenever
 * an application imports any of them from a file the client graph can see. A
 * route that names a middleware closure for the build's chain check is the
 * ordinary way that happens, and it is not a mistake the application can avoid:
 * the check compares references, so the route has to import the same binding
 * the server function carries.
 *
 * `node:async_hooks` has no browser implementation, and a bundler answers it
 * with an empty stub rather than an error. Constructing at module scope
 * therefore turned "this module is in the graph" into `AsyncLocalStorage is not
 * a constructor`, thrown while the chunk evaluated — before any application
 * code ran, on a page that never intended to call a server API at all.
 *
 * Lazily, the read path below never constructs anything: no storage means no
 * request in flight, which is exactly what it already reports. Only a caller
 * that tries to ENTER a request context off-server reaches the constructor, and
 * that one gets told what it did.
 */
let storage: AsyncLocalStorage<RequestContext> | undefined;

function enterable(): AsyncLocalStorage<RequestContext> {
  if (storage !== undefined) return storage;
  if (typeof AsyncLocalStorage !== "function") {
    throw new Error(
      "[barq] a request context cannot be entered here: `node:async_hooks` has no " +
        "implementation in this environment. `withRequest` is server-only — it runs inside " +
        "`handleServerFn`, a route handler or the prerenderer, never in a browser bundle.",
    );
  }
  storage = new AsyncLocalStorage<RequestContext>();
  return storage;
}

/** A fresh, empty draft. One per request. */
export function createResponseDraft(): ResponseDraft {
  return { headers: new Headers() };
}

/**
 * Run `body` with `request` as the ambient one.
 *
 * The DRAFT is the caller's to hold, because the caller is what builds the
 * response and it does so after `body` has returned. `handleServerFn` and
 * `createPageHandler` both make one, pass it in, and merge it on the way out.
 */
/**
 * Send `@barqjs/css`'s render-time rules to whichever request is running.
 *
 * Installed once, by the generated server entry. Outside a request — module
 * scope, and the browser — there is nothing to attribute a rule to, so it falls
 * back to the package's own sheet, which is where a module-scope rule belongs.
 */
export function collectRequestCss(): string {
  const store = storage?.getStore();
  return store?.css === undefined ? "" : [...store.css.values()].join("");
}

export function installCssSink(
  setSink: (fn: (key: string, rules: string) => boolean) => void,
): void {
  setSink((key, rules) => {
    const store = storage?.getStore();
    // Outside a request there is nothing to attribute the rule to — module
    // scope, which every request needs — so it goes to the package's own sheet.
    if (store === undefined) return false;
    store.css ??= new Map();
    store.css.set(key, rules);
    return true;
  });
}

export function withRequest<T>(
  request: Request,
  body: () => T,
  options: { readonly refuse?: string; readonly response?: ResponseDraft } | string = {},
): T {
  // The third argument was a bare `refuse` string before the draft existed.
  // Both spellings work, because the string form reads better at the one call
  // site that uses it — the prerenderer, which refuses and carries no draft.
  const resolved = typeof options === "string" ? { refuse: options } : options;
  return enterable().run(
    {
      request,
      refuse: resolved.refuse,
      response: resolved.response ?? createResponseDraft(),
    },
    body,
  );
}

/**
 * The request this handler is running for.
 *
 * Throws outside one rather than returning undefined: a handler reading cookies
 * off `undefined` is a bug that should surface where it happens, not resolve to
 * "no session" and let the request through.
 */
export function getRequest(): Request {
  return context().request;
}

/**
 * The request, or undefined outside one. For code that legitimately runs both ways.
 *
 * A refused context reads as ABSENT here rather than throwing: `peekRequest` is
 * the "I may not be in a request" spelling, and a prerender is exactly that
 * case. Code that must have one calls `getRequest` and gets the refusal.
 */
export function peekRequest(): Request | undefined {
  const found = storage?.getStore();
  return found === undefined || found.refuse !== undefined ? undefined : found.request;
}

function context(): RequestContext {
  const found = storage?.getStore();
  if (found === undefined) {
    throw new Error(
      "[barq] this is only available inside a request — a server function, a route handler, " +
        "a loader or a `beforeLoad`. Outside one there is no request to read and no response " +
        "to write to.",
    );
  }
  if (found.refuse !== undefined) throw new Error(found.refuse);
  return found;
}

/**
 * The draft, or `undefined` outside a request.
 *
 * Used by the two handlers to merge on the way out, and by nothing else. A
 * REFUSED context still answers here: a prerender may not read the request, but
 * a `head` or a loader that sets a cache header during one is describing the
 * page rather than the requester, and the prerenderer can write it to disk.
 */
export function peekResponseDraft(): ResponseDraft | undefined {
  return storage?.getStore()?.response;
}

// ---------------------------------------------------------------------------
// The request, read
// ---------------------------------------------------------------------------

export function getRequestHeaders(): Headers {
  return getRequest().headers;
}

export function getRequestHeader(name: string): string | undefined {
  return getRequest().headers.get(name) ?? undefined;
}

/** The request URL, parsed. */
export function getRequestUrl(): URL {
  return new URL(getRequest().url);
}

/**
 * The client's address, or `undefined`.
 *
 * `xForwardedFor` IS OFF BY DEFAULT and that is the whole design of this
 * function. `X-Forwarded-For` is a header a client can send, so trusting it
 * unconditionally lets any caller claim any address — and an address is exactly
 * what rate limiting and audit logging key on. It is trustworthy only when a
 * proxy you control overwrites it, which is a fact about the deployment that
 * this process cannot discover. So it is opt-in, and the opt-in is per call.
 *
 * The LEFTMOST entry is taken when it is trusted, since that is the original
 * client; every entry to its right was appended by a hop.
 */
export function getRequestIP(
  options: { readonly xForwardedFor?: boolean } = {},
): string | undefined {
  const request = getRequest();
  if (options.xForwardedFor === true) {
    const forwarded = request.headers.get("x-forwarded-for");
    const first = forwarded?.split(",")[0]?.trim();
    if (first !== undefined && first !== "") return first;
  }
  // What a runtime attaches when it knows. `srvx` and Bun both use this name.
  const direct = (request as { ip?: string }).ip;
  return direct === "" ? undefined : direct;
}

/**
 * The host, from the URL — and from `X-Forwarded-Host` only when asked.
 *
 * Same rule as `getRequestIP`, and the consequence is sharper: a host taken
 * from an untrusted header and used to build an absolute URL is a host-header
 * injection, which turns a password-reset link into a link to the attacker.
 */
export function getRequestHost(options: { readonly xForwardedHost?: boolean } = {}): string {
  const request = getRequest();
  if (options.xForwardedHost === true) {
    const forwarded = request.headers.get("x-forwarded-host");
    if (forwarded !== null && forwarded !== "") return forwarded;
  }
  return new URL(request.url).host;
}

/** `http` or `https`. `X-Forwarded-Proto` only when asked, for the reason above. */
export function getRequestProtocol(options: { readonly xForwardedProto?: boolean } = {}): string {
  const request = getRequest();
  if (options.xForwardedProto === true) {
    const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (forwarded !== undefined && forwarded !== "") return forwarded;
  }
  return new URL(request.url).protocol.replace(":", "");
}

// ---------------------------------------------------------------------------
// The response, written
// ---------------------------------------------------------------------------

export function getResponseHeaders(): Headers {
  return context().response.headers;
}

export function getResponseHeader(name: string): string | undefined {
  return context().response.headers.get(name) ?? undefined;
}

/**
 * Set a response header. An array APPENDS each value, which is what a header
 * that may legitimately repeat needs.
 */
export function setResponseHeader(name: string, value: string | readonly string[]): void {
  const headers = context().response.headers;
  if (typeof value === "string") {
    headers.set(name, value);
    return;
  }
  headers.delete(name);
  for (const one of value) headers.append(name, one);
}

export function setResponseHeaders(headers: Record<string, string>): void {
  for (const [name, value] of Object.entries(headers)) setResponseHeader(name, value);
}

export function removeResponseHeader(name: string): void {
  context().response.headers.delete(name);
}

/** Clear the named headers, or every header this request has drafted. */
export function clearResponseHeaders(names?: readonly string[]): void {
  const headers = context().response.headers;
  if (names !== undefined) {
    for (const name of names) headers.delete(name);
    return;
  }
  // Collected first, because deleting while iterating a live `Headers` skips.
  const present: string[] = [];
  for (const name of headers.keys()) present.push(name);
  for (const name of present) headers.delete(name);
}

export function getResponseStatus(): number {
  return context().response.status ?? 200;
}

/**
 * Set the status the framework's own response will carry.
 *
 * It does NOT override a `Response` a handler returns for itself — see
 * `applyResponseDraft`, which says why.
 */
export function setResponseStatus(status: number, statusText?: string): void {
  const draft = context().response;
  if (!Number.isInteger(status) || status < 200 || status > 599) {
    throw new RangeError(`[barq] ${status} is not an HTTP status code`);
  }
  draft.status = status;
  if (statusText !== undefined) draft.statusText = statusText;
}

// ---------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------

/**
 * Every cookie the REQUEST carried, by name.
 *
 * Parsed once and memoised on the context: the header cannot change for the life
 * of the request, and re-splitting it per lookup made three readers three
 * parses. The object is returned as it stands rather than copied, which is the
 * point — copying it per call would put the allocation back.
 */
export function getCookies(): Record<string, string> {
  const found = context();
  found.cookies ??= parseCookies(found.request.headers.get("cookie"));
  return found.cookies;
}

export function getCookie(name: string): string | undefined {
  return getCookies()[name];
}

/**
 * Set a cookie on the response.
 *
 * APPENDS, because several cookies are several `Set-Cookie` lines and a
 * browser keeps only the last of a set. Setting the same NAME twice in one
 * request is the caller's business — the last one wins in the browser, as ever.
 */
export function setCookie(name: string, value: string, options?: CookieOptions): void {
  context().response.headers.append("set-cookie", serializeCookie(name, value, options));
}

/**
 * Delete a cookie.
 *
 * `path` and `domain` MUST match the ones it was set with, or the browser
 * deletes nothing and keeps the original — silently. They are options here for
 * exactly that reason rather than as decoration.
 */
export function deleteCookie(name: string, options?: CookieOptions): void {
  context().response.headers.append("set-cookie", deleteCookieLine(name, options));
}

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

/**
 * Fold a draft into a response.
 *
 * THE PRECEDENCE RULE, stated once and applied everywhere: a `Response` a
 * handler RETURNED wins on every header it sets and on its status, because a
 * handler that built a whole response has said what it wants. The one exception
 * is `set-cookie`, which is ADDITIVE — a middleware that refreshes a session and
 * a handler that sets a preference are both right, and dropping either is a bug
 * neither can see.
 *
 * A new `Response` rather than a mutation: `Headers` on a response that came
 * back from `fetch()` is guarded immutable, and mutating it throws.
 */
export function applyResponseDraft(response: Response, draft: ResponseDraft | undefined): Response {
  if (draft === undefined) return response;
  const cookies = draft.headers.getSetCookie();
  const others = [...draft.headers].filter(([name]) => name !== "set-cookie");
  if (cookies.length === 0 && others.length === 0 && draft.status === undefined) {
    return response;
  }

  // MUTATE FIRST, rebuild only if the response refuses.
  //
  // A rebuild is not equivalent, which cost an afternoon: `new Response(body,
  // { headers })` DROPS every `set-cookie` under happy-dom, so the whole merge
  // silently produced a cookie-less response in the router's suite while
  // passing in `packages/start`, which registers no DOM. Mutating the headers
  // the response already has touches none of that.
  //
  // The rebuild stays as the fallback because a response that came back from
  // `fetch()` has an immutable header guard and `set()` on it throws — which is
  // a real shape here, since a route handler may proxy one.
  try {
    for (const [name, value] of others) {
      if (!response.headers.has(name)) response.headers.set(name, value);
    }
    for (const cookie of cookies) response.headers.append("set-cookie", cookie);
    return response;
  } catch {
    // Immutable. Fall through.
  }

  const headers = new Headers(response.headers);
  for (const [name, value] of others) {
    if (!headers.has(name)) headers.set(name, value);
  }
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * The status and text a framework-built response should carry.
 *
 * Separate from `applyResponseDraft` because the two answer different
 * questions: this is "what did the handler ask for", used where the framework
 * is deciding the status itself, and that one is "what does a returned response
 * already say", where the handler has decided.
 */
export function draftedStatus(
  draft: ResponseDraft | undefined,
  fallback: number,
): { status: number; statusText?: string } {
  return { status: draft?.status ?? fallback, statusText: draft?.statusText };
}
