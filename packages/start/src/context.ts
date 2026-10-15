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

import { diagnosticsEnabled, emitDiagnostic } from "@barqjs/core/internal";

import { type CookieOptions, deleteCookieLine, parseCookies, serializeCookie } from "./cookies.ts";
import type { OpenContext } from "./middleware.ts";
import type { OpenSession } from "./session.ts";
import type { GlobalRequestContext } from "./start-instance.ts";

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
  /**
   * The response this draft describes has been handed to the server, status
   * and headers with it. A write after this reaches nothing.
   */
  sent?: boolean;
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
   * Reads every rule registered after THIS request's head sheet was serialised.
   *
   * What the page is owed once it has a head, in place of {@link css}: a rule
   * ANOTHER request registered after this one's head is one this render can
   * still use, as a class a module already holds, and it registers nothing
   * when it does. So the line is the head and not who registered what.
   */
  lateCss?: () => string;
  /**
   * What a server function's chain asked to send back, held for the request
   * handler to put on the response.
   *
   * Here and not in a module-level variable for the reason this file opens
   * with: two requests whose handlers settle in the same tick would each read
   * whichever chain wrote last, and that is one caller's `sendContext` on
   * another caller's response.
   */
  sendContext?: Record<string, unknown>;
  /**
   * The sessions this request has opened, by cookie name.
   *
   * The request's cookie is what the browser HAD. A second `useSession` that
   * read it again would start from before the first one's `update`, and its own
   * `update` would then seal a session without that change over the top of it.
   */
  sessions?: Map<string, Promise<OpenSession>>;
  /**
   * What the request middleware chain contributed with `next({ context })`.
   *
   * A server function's own chain starts from it, and a route handler is
   * handed it, so a global middleware that resolved a session says so once.
   */
  middlewareContext?: Record<string, unknown>;
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
/**
 * ONE storage per process, whichever copy of this module asks, for the reason
 * the server-function registry is one: a build compiles this module into its
 * server bundle, and a host serving that bundle through its own `serveBarq`
 * has imported a second copy. Each holding its own, the host entered the
 * request into one and the bundle's functions read the other, so every server
 * function that read a cookie answered 500.
 */
const SHARED = ((globalThis as Record<symbol, unknown>)[Symbol.for("barq.start.request")] ??= {
  storage: undefined,
}) as { storage: AsyncLocalStorage<RequestContext> | undefined };

function enterable(): AsyncLocalStorage<RequestContext> {
  if (SHARED.storage !== undefined) return SHARED.storage;
  if (typeof AsyncLocalStorage !== "function") {
    throw new Error(
      "[barq] `withRequest` was called where `AsyncLocalStorage` from `node:async_hooks` does not exist, so the request cannot be made available to the code it runs. " +
        "It works only on the server. If this is the browser, server-only code reached the browser bundle: " +
        "move it behind a server function.",
    );
  }
  SHARED.storage = new AsyncLocalStorage<RequestContext>();
  return SHARED.storage;
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
  const store = SHARED.storage?.getStore();
  if (store?.lateCss !== undefined) return store.lateCss();
  return store?.css === undefined ? "" : [...store.css.values()].join("");
}

/** `@barqjs/css`'s `CssSink`, restated so this package does not import that one. */
interface CssSink {
  (key: string, rules: string): boolean;
  head?(late: () => string): void;
}

export function installCssSink(setSink: (sink: CssSink) => void): void {
  const sink: CssSink = (key, rules) => {
    const store = SHARED.storage?.getStore();
    // Outside a request there is nothing to attribute the rule to — module
    // scope, which every request needs — so it goes to the package's own sheet.
    if (store === undefined) return false;
    store.css ??= new Map();
    store.css.set(key, rules);
    return true;
  };
  // The FIRST read of the whole sheet in a request is its `<head>`; a later
  // one is somebody else's and must not move the line.
  sink.head = (late) => {
    const store = SHARED.storage?.getStore();
    if (store !== undefined) store.lateCss ??= late;
  };
  setSink(sink);
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
  const found = SHARED.storage?.getStore();
  return found === undefined || found.refuse !== undefined ? undefined : found.request;
}

function context(): RequestContext {
  const found = SHARED.storage?.getStore();
  if (found === undefined) {
    throw new Error(
      "[barq] A request helper such as `getRequest()`, `getCookie()` or `setResponseHeader()` was called outside a request, so there is no request to read and no response to write to. " +
        "These helpers are only available inside a request: call them from a server function, a route handler, a loader or a `beforeLoad`.",
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
  return SHARED.storage?.getStore()?.response;
}

/**
 * Leave a chain's `sendContext` for whoever builds this request's response.
 *
 * Outside a request there is no response to carry it, so it is dropped: that is
 * a server function called in-process, whose caller is handed the result alone.
 */
export function offerSendContext(sendContext: Record<string, unknown>): void {
  const found = SHARED.storage?.getStore();
  if (found !== undefined) found.sendContext = sendContext;
}

/** Take the pending `sendContext`, leaving nothing behind for the next call. */
export function takeSendContext(): Record<string, unknown> {
  const found = SHARED.storage?.getStore();
  const taken = found?.sendContext ?? {};
  if (found !== undefined) found.sendContext = undefined;
  return taken;
}

/**
 * What this request's middleware chain has contributed, or an empty record
 * outside a request. TanStack's name.
 *
 * Typed by what the registered global request middleware passes to
 * `next({ context })`, each key optional: outside a request, or before the
 * chain has reached the step that adds it, it is not there.
 */
export function getGlobalStartContext(): OpenContext<Partial<GlobalRequestContext>> {
  const written: Record<string, unknown> = SHARED.storage?.getStore()?.middlewareContext ?? {};
  return written;
}

/** Record what the request middleware chain is contributing, for the rest of the request. */
export function setRequestMiddlewareContext(context: Record<string, unknown>): void {
  const found = SHARED.storage?.getStore();
  if (found !== undefined) found.middlewareContext = context;
}

/** The sessions this request has opened. See {@link RequestContext.sessions}. */
export function openSessions(): Map<string, Promise<OpenSession>> {
  const found = context();
  found.sessions ??= new Map();
  return found.sessions;
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
 * How far `X-Forwarded-For` is believed.
 *
 * `true` takes the LEFTMOST entry, and is safe only when the edge proxy
 * OVERWRITES the header. A proxy that appends, which is what most do, leaves
 * whatever the client sent at the front: `X-Forwarded-For: 203.0.113.9` on the
 * request arrives as `203.0.113.9, <real address>`, and the leftmost entry is
 * the one the caller typed.
 *
 * `{ trustedProxies: n }` counts from the RIGHT instead: the entry the nth
 * proxy in front of this process wrote, which is the address that proxy saw.
 * Entries to its left were there before any trusted hop touched the header, so
 * a forged prefix is never read. A header with fewer than `n` entries did not
 * come through that chain and is ignored whole.
 */
export type ForwardedForTrust = boolean | { readonly trustedProxies: number };

/** Refuse a hop count that names no entry, where the option is written. */
export function assertForwardedForTrust(trust: ForwardedForTrust | undefined): void {
  if (typeof trust !== "object") return;
  if (!Number.isInteger(trust.trustedProxies) || trust.trustedProxies < 1) {
    throw new RangeError(
      `[barq] \`trustedProxies\` must be a positive integer, and it is ${trust.trustedProxies}. ` +
        "Set it to the number of proxies you run in front of this server: each one appends one entry to `X-Forwarded-For`, and the client address is counted back from the end.",
    );
  }
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
 * client; every entry to its right was appended by a hop. {@link
 * ForwardedForTrust} says when that is forgeable and what to pass instead.
 */
export function getRequestIP(
  options: { readonly xForwardedFor?: ForwardedForTrust } = {},
): string | undefined {
  const request = getRequest();
  const trust = options.xForwardedFor;
  if (trust !== undefined && trust !== false) {
    assertForwardedForTrust(trust);
    const entries = request.headers.get("x-forwarded-for")?.split(",") ?? [];
    const entry = trust === true ? entries[0] : entries[entries.length - trust.trustedProxies];
    const address = entry?.trim();
    if (address !== undefined && address !== "") return address;
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

/**
 * Mark the draft's response as handed to the server. A streamed page goes on
 * rendering after this, and so does a streamed server function, and a header
 * one of them writes now changes nothing the browser receives.
 */
export function markResponseSent(draft: ResponseDraft | undefined): void {
  if (draft !== undefined) draft.sent = true;
}

/**
 * The draft a write goes to, reporting the write when the response has already
 * gone. `api` is the public function the caller called, so the stack the
 * report carries starts at the caller rather than in here.
 */
function draftFor(api: (...args: never[]) => unknown, argument?: unknown): ResponseDraft {
  const draft = context().response;
  if (draft.sent === true && diagnosticsEnabled()) reportLateWrite(api, argument);
  return draft;
}

function reportLateWrite(api: (...args: never[]) => unknown, argument: unknown): void {
  const call = `${api.name}(${argument === undefined ? "" : JSON.stringify(argument)})`;
  const error = new Error(`${call} ran after the response was sent`);
  Error.captureStackTrace(error, api);
  const caller = /^\s*at\s+(.*)$/m.exec(error.stack?.split("\n").slice(1).join("\n") ?? "")?.[1];
  emitDiagnostic(
    {
      code: "LATE_HEADER_WRITE",
      kind: "head",
      severity: "warn",
      message:
        `\`${call}\` ran ${caller === undefined ? "" : `at ${caller} `}after the response's status ` +
        "and headers had been sent, so it changed nothing the browser receives. Code runs that late " +
        "inside a part of the page that renders after the shell (a `<Loading>` boundary or a " +
        "loader the shell does not wait for), or in a streamed server function after its first " +
        "value. Set the status, headers and cookies while the response is still open: in a " +
        "`beforeLoad`, a loader the route awaits, a route handler, a middleware, or a server " +
        "function before it returns.",
      data: { call, error },
    },
    null,
  );
}

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
  const headers = draftFor(setResponseHeader, name).headers;
  if (typeof value === "string") {
    headers.set(name, value);
    return;
  }
  headers.delete(name);
  for (const one of value) headers.append(name, one);
}

/**
 * Add a value to a response header, keeping the ones already there.
 *
 * For a header that is a list: `Vary`, `Link`, `Cache-Control` built up by more
 * than one caller. `setResponseHeader` replaces.
 */
export function appendResponseHeader(name: string, value: string): void {
  draftFor(appendResponseHeader, name).headers.append(name, value);
}

export function setResponseHeaders(headers: Record<string, string>): void {
  for (const [name, value] of Object.entries(headers)) setResponseHeader(name, value);
}

export function removeResponseHeader(name: string): void {
  draftFor(removeResponseHeader, name).headers.delete(name);
}

/** Clear the named headers, or every header this request has drafted. */
export function clearResponseHeaders(names?: readonly string[]): void {
  const headers = draftFor(clearResponseHeaders).headers;
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
  const draft = draftFor(setResponseStatus, status);
  if (!Number.isInteger(status) || status < 200 || status > 599) {
    throw new RangeError(
      `[barq] \`setResponseStatus(${status})\` was given a value that is not an HTTP response status. Pass an integer from 200 to 599, such as \`setResponseStatus(404)\`.`,
    );
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
  draftFor(setCookie, name).headers.append(
    "set-cookie",
    serializeCookie(name, value, rooted(options)),
  );
}

/**
 * Set a cookie in place of any line this request already drafted for its name.
 *
 * For a cookie one request may write more than once and of which only the last
 * line means anything, which is a session: each of its lines runs to 4 KB, and
 * a proxy that buffers response headers in 4 or 8 KB answers 502 to two of
 * them. `setCookie` appends, which is right for everything else.
 */
export function replaceCookie(name: string, value: string, options?: CookieOptions): void {
  const headers = draftFor(replaceCookie, name).headers;
  // Serialized before anything is removed, so a cookie that is refused leaves
  // the draft as it was.
  const line = serializeCookie(name, value, rooted(options));
  const prefix = `${name}=`;
  const kept = headers.getSetCookie().filter((other) => !other.startsWith(prefix));
  headers.delete("set-cookie");
  for (const other of kept) headers.append("set-cookie", other);
  headers.append("set-cookie", line);
}

/**
 * The options, with `path: "/"` where the caller chose none.
 *
 * A browser gives a cookie that names no `Path` the directory of the URL that
 * set it (RFC 6265 §5.1.4). For a server function that is `/_barq/fn`, so the
 * cookie would come back on other server functions and on no page at all.
 * `serializeCookie` stays literal; the default belongs where the URL is known
 * to be the wrong scope.
 */
function rooted(options: CookieOptions | undefined): CookieOptions {
  return options?.path === undefined ? { ...options, path: "/" } : options;
}

/**
 * Delete a cookie.
 *
 * `path` and `domain` MUST match the ones it was set with, or the browser
 * deletes nothing and keeps the original — silently. They are options here for
 * exactly that reason rather than as decoration. With no `path` it names `/`,
 * which is what `setCookie` gave a cookie that was set with none.
 */
export function deleteCookie(name: string, options?: CookieOptions): void {
  draftFor(deleteCookie, name).headers.append(
    "set-cookie",
    deleteCookieLine(name, rooted(options)),
  );
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
  // A request middleware wraps a handler that has already folded this draft
  // into what it returned, and may have drafted more since. Each cookie line
  // goes onto a response once, however many times the draft is folded in.
  const sent = APPLIED.get(response) ?? new Set<string>();
  const cookies = draft.headers.getSetCookie().filter((line) => !sent.has(line));
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
    for (const cookie of cookies) sent.add(cookie);
    APPLIED.set(response, sent);
    return response;
  } catch {
    // Immutable. Fall through.
  }

  const headers = new Headers(response.headers);
  for (const [name, value] of others) {
    if (!headers.has(name)) headers.set(name, value);
  }
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  const rebuilt = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  for (const cookie of cookies) sent.add(cookie);
  APPLIED.set(rebuilt, sent);
  return rebuilt;
}

/** The cookie lines each response has already been given from a draft. */
const APPLIED = new WeakMap<Response, Set<string>>();

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
