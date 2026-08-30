/**
 * Testing the half that runs on the server: cookies, sessions, the response
 * draft, and route handlers.
 *
 * Every suite that needed this hand-rolled it, and two traps caught each one in
 * turn. Both are the reason this module exists rather than a `withRequest` call
 * in each test:
 *
 *  1. **`Cookie` cannot be set on a `Request` you construct.** It is a forbidden
 *     header per the fetch spec, and happy-dom enforces it — which
 *     `@barqjs/testing` registers. A server receives it off the wire and never
 *     constructs one, so a test that writes `new Request(url, { headers: {
 *     cookie } })` silently sends no cookie and every session test reads an
 *     empty session. `Origin` and every `Sec-` name behave the same way.
 *  2. **A `Response` built with `new Response(body, { headers })` DROPS every
 *     `set-cookie`** under happy-dom, so a handler that set one appears not to
 *     have. `applyResponseDraft` mutates the response's own headers for exactly
 *     this reason, and `runInRequest` returns the draft so a test can assert on
 *     what was set without going near a `Response`.
 */

import {
  type ResponseDraft,
  applyResponseDraft,
  createResponseDraft,
  draftedStatus,
  withRequest,
} from "@barqjs/start";

/** Headers a `Request` constructor refuses, which a server nonetheless receives. */
const FORBIDDEN = /^(cookie|origin|host|referer|connection|sec-)/i;

export interface TestRequestInit extends Omit<RequestInit, "headers"> {
  readonly headers?: Record<string, string>;
  /** Sugar for a `Cookie` header. `{ session: "abc" }` becomes `session=abc`. */
  readonly cookies?: Record<string, string>;
}

/**
 * A `Request` carrying the headers a real one would, forbidden ones included.
 *
 * The forbidden set is installed by redefining `headers` on the instance rather
 * than by passing them to the constructor, which drops them without a word.
 * That is the same escape hatch `packages/start`'s own suite documents; it is
 * here so no test has to know about it.
 */
export function testRequest(url: string, init: TestRequestInit = {}): Request {
  const { headers = {}, cookies, ...rest } = init;
  const cookieHeader =
    cookies === undefined
      ? undefined
      : Object.entries(cookies)
          .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
          .join("; ");

  const wanted = { ...headers, ...(cookieHeader === undefined ? {} : { cookie: cookieHeader }) };
  const allowed: Record<string, string> = {};
  const forbidden: [string, string][] = [];
  for (const [name, value] of Object.entries(wanted)) {
    if (FORBIDDEN.test(name)) forbidden.push([name, value]);
    else allowed[name] = value;
  }

  const request = new Request(url.startsWith("http") ? url : `http://localhost${url}`, {
    ...rest,
    headers: allowed,
  });
  if (forbidden.length === 0) return request;

  // The constructor already dropped these, so the map is rebuilt from what
  // survived plus what a server would actually have received.
  const merged = new Headers(request.headers);
  for (const [name, value] of forbidden) merged.set(name, value);
  Object.defineProperty(request, "headers", { value: merged, configurable: true });
  return request;
}

export interface RequestRun<T> {
  /** Whatever the body returned. */
  readonly value: T;
  /**
   * What the handler asked the response to carry, BEFORE it became a
   * `Response` — which is where a `set-cookie` is still readable.
   */
  readonly draft: ResponseDraft;
  /** Every `set-cookie` the body wrote, in order. */
  readonly cookies: readonly string[];
  /** `draft.status`, or `undefined` when nothing set one. */
  readonly status: number | undefined;
  /**
   * The draft applied to a response, for asserting on the wire form.
   *
   * Given no response, one is BUILT and the drafted status is used.
   * `applyResponseDraft` deliberately does not set a status — its own header
   * says why: a response the handler returned has already decided, and only a
   * framework building one should read `draftedStatus`. Building one is exactly
   * what this does, so it reads both.
   */
  apply: (response?: Response) => Response;
}

/**
 * Run `body` as though a request were in flight.
 *
 * `getRequest`, `getCookie`, `useSession`, `setResponseHeader` and everything
 * else in `@barqjs/start` reads the ambient context, so without this they throw
 * rather than answer. The draft is created HERE and handed back, which is the
 * half a test wants: a `set-cookie` is readable on it and is not readable on a
 * `Response` that happy-dom built.
 */
export async function runInRequest<T>(
  request: Request | string,
  body: () => T | Promise<T>,
): Promise<RequestRun<Awaited<T>>> {
  const resolved = typeof request === "string" ? testRequest(request) : request;
  const draft = createResponseDraft();
  const value = await withRequest(resolved, body, { response: draft });
  return {
    value,
    draft,
    cookies: draft.headers.getSetCookie(),
    status: draft.status,
    apply: (response) =>
      applyResponseDraft(response ?? new Response(null, draftedStatus(draft, 200)), draft),
  };
}

/**
 * The cookies a run set, parsed to `name -> value`.
 *
 * A `set-cookie` line carries its attributes (`Path`, `HttpOnly`, `Max-Age`),
 * and a test asserting on the VALUE should not have to parse them. Assert on
 * `run.cookies` directly when the attributes are the point.
 */
export function cookiesOf(run: RequestRun<unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of run.cookies) {
    const [pair] = line.split(";");
    const at = pair?.indexOf("=") ?? -1;
    if (pair === undefined || at < 0) continue;
    out[pair.slice(0, at).trim()] = decodeURIComponent(pair.slice(at + 1).trim());
  }
  return out;
}
