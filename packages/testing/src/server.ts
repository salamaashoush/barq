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
  DATA_SUFFIX,
  RPC_PREFIX,
  type ResponseDraft,
  applyResponseDraft,
  createResponseDraft,
  draftedStatus,
  withRequest,
} from "@barqjs/start";
import { type HandlerOptions, handleServerFn } from "@barqjs/start/server";
import { decodeWire, encodeWire } from "@barqjs/server/codec";
import type { AnyRouteDefinition } from "@barqjs/router";
import { type PageHandlerOptions, createPageHandler, renderRoutes } from "@barqjs/router/server";

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

/**
 * One page, server-rendered, as the `Response` a browser would receive.
 *
 * `renderRoute` is the other half of the pair and renders into a DOM; this one
 * renders into BYTES, which is a second implementation of the same ABI and
 * fails in ways the DOM one cannot: a shell that forgets `<Scripts />`, a head
 * whose tags arrive after the body, a loader whose value never reaches the
 * markup. `router/src/server.test.ts` drove `createPageHandler` by hand and was
 * the only thing that ever had.
 *
 * `stream: false` BY DEFAULT, and it is a different renderer rather than a
 * buffered stream: the graph settles before a byte is emitted, so `html` is the
 * finished document instead of a shell plus the swap scripts that would fill
 * it. A test that wants the streaming arm asks for it.
 */
export interface SsrPageOptions extends Omit<PageHandlerOptions, "app" | "routeTree"> {
  /** The table. A test's own, not `routeTree.gen.ts`. */
  readonly routeTree: readonly AnyRouteDefinition[];
  /**
   * How the chain is rendered. Defaults to the framework's own `renderRoutes`,
   * which is what `createStartHandler` passes.
   */
  readonly app?: PageHandlerOptions["app"];
  /** Sent instead of a plain GET, for asserting on cookies, headers or method. */
  readonly request?: Request;
}

export interface SsrPageResult {
  readonly response: Response;
  readonly status: number;
  readonly headers: Headers;
  /** The whole document, doctype included. */
  readonly html: string;
  /**
   * The parsed `<body>`, so `within(result.container)` reaches the queries.
   *
   * Parsed rather than mounted: this markup has not been hydrated and must not
   * be, or the assertion is about the client's render and not the server's.
   */
  readonly container: HTMLElement;
}

export async function ssrPage(path: string, options: SsrPageOptions): Promise<SsrPageResult> {
  const { routeTree, app, request, ...rest } = options;
  const handler = createPageHandler({
    routeTree,
    app: app ?? ((state) => renderRoutes(state)),
    stream: false,
    ...rest,
  });

  const response = await handler(request ?? testRequest(path));
  const html = await response.text();
  const parsed = new DOMParser().parseFromString(html, "text/html");

  return {
    response,
    status: response.status,
    headers: response.headers,
    html,
    container: parsed.body,
  };
}

export interface CallServerFnOptions extends HandlerOptions {
  /** The mounted id, byte for byte what the compiler put in the client stub. */
  readonly id: string;
  /** The argument, encoded through the codec the real client uses. */
  readonly input?: unknown;
  /**
   * The no-JS channel: `<form action={fn}>` posts multipart to the id WITHOUT
   * the `.data` suffix, and the handler answers 303 rather than a value. Takes
   * precedence over `input`.
   */
  readonly form?: FormData;
  /** Default `POST`. Anything else proves the method gate rather than calling. */
  readonly method?: string;
  /**
   * The `Origin` header. Defaults to the request's own, which is allowed.
   *
   * A forbidden header, so it cannot be set on a `Request` you construct —
   * which is why a CSRF test written without `testRequest` passes whatever the
   * check does.
   */
  readonly origin?: string;
  readonly headers?: Record<string, string>;
  readonly cookies?: Record<string, string>;
}

export interface ServerFnCall<T> {
  readonly response: Response;
  readonly status: number;
  /** Decoded through the client's own codec. `undefined` unless the call answered a value. */
  readonly value: T | undefined;
  /** Every `set-cookie` the handler wrote. */
  readonly cookies: readonly string[];
}

/**
 * Call a mounted server function over the WIRE.
 *
 * Nothing exercised this path: `handleServerFn` is one HTTP endpoint per
 * function, and a test that calls the handler directly skips the method gate,
 * the origin check, `reachable`, and the split between the JSON channel and the
 * FormData one. Those are the four things a server function's security rests
 * on, and every one of them is invisible to a direct call.
 *
 * Mount first, with `mount` from `@barqjs/start/server`. This deliberately does
 * not mount for you: which ids exist is what `reachable` and the 404 are about.
 * The registry is module state and `mount` refuses an id that is already there,
 * so a suite that mounts per test wants `beforeEach(unmountAll)`.
 */
export async function callServerFn<T = unknown>(
  options: CallServerFnOptions,
): Promise<ServerFnCall<T>> {
  const { id, input, form, method, origin, headers, cookies, ...handler } = options;

  const url = `http://localhost${RPC_PREFIX}${encodeURIComponent(id)}${form === undefined ? DATA_SUFFIX : ""}`;
  const request = testRequest(url, {
    method: method ?? "POST",
    // Same-origin unless a test says otherwise, because that is the case a
    // legitimate caller is in and the one every other assertion depends on.
    headers: {
      ...(form === undefined ? { "content-type": "application/json" } : {}),
      ...headers,
      origin: origin ?? "http://localhost",
    },
    cookies,
    body:
      form ??
      (method === undefined || method === "POST"
        ? JSON.stringify({ input: encodeWire(input) })
        : undefined),
  });

  const response = await handleServerFn(request, handler);
  if (response === null) throw new Error(`${url} is not a server-function URL`);

  // Only the value channel answers a body worth decoding. A form post answers
  // 303 and a refusal answers text, and running either through the codec turns
  // a clear status into a parse error.
  const value =
    response.status === 200 && form === undefined
      ? decodeWire<T>(await response.clone().json())
      : undefined;

  return { response, status: response.status, value, cookies: response.headers.getSetCookie() };
}
