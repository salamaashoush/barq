/**
 * Solid 2.0's request event, the response head a request builds, and the
 * lifecycle that freezes that head on its way to the wire.
 *
 * The event is found through an `AsyncLocalStorage` on the global under a
 * registered symbol, which `@barqjs/server/storage` creates and enters. This
 * module never imports `node:async_hooks`, so it is the same code in a browser
 * bundle, where no storage exists and every call answers "no request".
 *
 * A response leaves through one of two exits: a page through
 * `createSSRResponse` (`@barqjs/server`), anything else through
 * `commitEventResponse`. Both fold the head this module keeps onto the outgoing
 * `Response` and commit it, after which a write to it reaches nothing.
 */

import { getOwner, onCleanup } from "@barqjs/core";

import { currentRenderSession, diagnosticsEnabled, emitDiagnostic } from "@barqjs/core/internal";
import {
  type TraceContext,
  type TraceRecord,
  appendTraceServerTiming,
  mergeServerTiming,
  traceFor,
  traceForEvent,
} from "./trace-context.ts";

/** Augment it to type what middleware puts on `locals`. */
export interface RequestEventLocals {
  [key: string | number | symbol]: unknown;
}

/**
 * The response head as it forms. `committed` is set once it has been derived
 * for the wire; nothing after that reaches the browser.
 */
export interface ResponseStub {
  status?: number;
  statusText?: string;
  readonly headers: Headers;
  committed?: boolean;
}

export interface RequestEvent {
  readonly request: Request;
  readonly locals: RequestEventLocals;
  readonly response?: ResponseStub;
}

export const REQUEST_EVENT: unique symbol = Symbol.for("barq.request-event") as never;

interface EventStorage {
  getStore(): RequestEvent | undefined;
}

/** The current request's event, or `undefined` outside one and in the browser. */
export function getRequestEvent(): RequestEvent | undefined {
  return (globalThis as { [REQUEST_EVENT]?: EventStorage })[REQUEST_EVENT]?.getStore();
}

/** A fresh, uncommitted response head. */
export function createResponseStub(): ResponseStub {
  return { status: undefined, statusText: undefined, headers: new Headers(), committed: false };
}

/**
 * The event an HTTP handler runs a request under: the request, a `locals` bag,
 * and a fresh response head. `init` spreads over the defaults, so a framework
 * adds fields of its own, or a `response` it already holds.
 */
export function createRequestEvent<T extends object = {}>(
  request: Request,
  init?: T,
): RequestEvent & { readonly response: ResponseStub } & T {
  return { request, locals: {}, response: createResponseStub(), ...init } as RequestEvent & {
    readonly response: ResponseStub;
  } & T;
}

/**
 * The trace the current request belongs to: continued from an incoming
 * `traceparent`, or originated here. The same object for every read inside one
 * request. Outside a request, a server render's own trace, read within it, and
 * `undefined` elsewhere and in the browser. Forward it downstream with
 * `getTraceContext()?.entries.traceparent`.
 */
export function getTraceContext(): TraceContext | undefined {
  const event = getRequestEvent();
  if (event !== undefined) return traceForEvent(event).context;
  const session = currentRenderSession();
  return session === null ? undefined : traceFor(session, undefined).context;
}

/**
 * The trace a head is emitted with: the event named, or the ambient one when
 * this stub is its head. A stub no event owns has no request to speak for.
 */
function traceForStub(
  stub: ResponseStub,
  event: RequestEvent | undefined,
): TraceRecord | undefined {
  if (event !== undefined) return traceForEvent(event);
  const ambient = getRequestEvent();
  return ambient?.response === stub ? traceForEvent(ambient) : undefined;
}

/**
 * The live declarations `httpStatus` and `httpHeader` made, per head.
 *
 * A snapshot restored at disposal is right only when scopes dispose in the
 * reverse of the order they declared in. Sibling boundaries recover in any
 * order, and restoring an earlier one's snapshot would delete what a later
 * one still declares: a session cookie, gone. So each field keeps what the
 * integration had written before the first declaration and the declarations
 * still alive, and a retraction replays the survivors over that base.
 */
interface StatusEntry {
  readonly status: number | undefined;
  readonly statusText: string | undefined;
}
interface HeaderDeclaration {
  readonly value: string;
  readonly append: boolean;
}
interface Ledger {
  status?: { readonly base: StatusEntry; readonly live: StatusEntry[] };
  readonly headers: Map<
    string,
    { readonly base: string | string[] | null; readonly live: HeaderDeclaration[] }
  >;
  /** A render that completed froze what it declared: its disposal retracts nothing. */
  frozen: boolean;
}

const LEDGERS = new WeakMap<ResponseStub, Ledger>();

function ledgerOf(response: ResponseStub): Ledger {
  let ledger = LEDGERS.get(response);
  if (ledger === undefined) {
    ledger = { headers: new Map(), frozen: false };
    LEDGERS.set(response, ledger);
  }
  return ledger;
}

function retractable(response: ResponseStub, ledger: Ledger): boolean {
  return response.committed !== true && !ledger.frozen;
}

/**
 * Keep every declaration made so far for the life of the head, which is what a
 * render that completed hands its caller: the scopes are disposed with the
 * render, and the status they declared is the page's. A render that throws is
 * not frozen, and its declarations go with it.
 */
export function freezeDeclarations(response: ResponseStub | undefined): void {
  if (response !== undefined) ledgerOf(response).frozen = true;
}

/**
 * Declare the response status for as long as the calling scope lives.
 *
 * A scope disposed while the head is still open takes its declaration back,
 * and the status falls back to the latest declaration still alive: an error
 * boundary that recovers un-declares its 500 without taking a 404 the page
 * around it declared. Once the head is committed a declaration reaches nothing,
 * and a development build says so. A no-op outside a request.
 */
export function httpStatus(code: number, text?: string): void {
  const response = getRequestEvent()?.response;
  if (response === undefined) return;
  if (response.committed === true) {
    reportLate(`httpStatus(${code})`, httpStatus);
    return;
  }
  const ledger = ledgerOf(response);
  ledger.status ??= {
    base: { status: response.status, statusText: response.statusText },
    live: [],
  };
  const declared: StatusEntry = { status: code, statusText: text };
  const record = ledger.status;
  record.live.push(declared);
  response.status = code;
  response.statusText = text;
  if (getOwner() === null) return;
  onCleanup(() => {
    if (!retractable(response, ledger)) return;
    const at = record.live.indexOf(declared);
    if (at === -1) return;
    record.live.splice(at, 1);
    const effective = record.live.at(-1) ?? record.base;
    response.status = effective.status;
    response.statusText = effective.statusText;
    if (record.live.length === 0) ledger.status = undefined;
  });
}

/**
 * Declare a response header for as long as the calling scope lives. `append`
 * adds a value beside the ones already there, which `set-cookie` needs. A
 * retraction replays the declarations still alive over what was there before
 * the first, so siblings dispose in any order without touching each other's.
 */
export function httpHeader(name: string, value: string, options?: { append?: boolean }): void {
  const response = getRequestEvent()?.response;
  if (response === undefined) return;
  if (response.committed === true) {
    reportLate(`httpHeader(${JSON.stringify(name)})`, httpHeader);
    return;
  }
  const headers = response.headers;
  const key = name.toLowerCase();
  const cookie = key === "set-cookie";
  const ledger = ledgerOf(response);
  let record = ledger.headers.get(key);
  if (record === undefined) {
    // Entry by entry for `set-cookie`: `get()` comma-joins its lines, and a
    // cookie's `Expires` carries a comma of its own.
    record = { base: cookie ? [...headers.getSetCookie()] : headers.get(name), live: [] };
    ledger.headers.set(key, record);
  }
  const declared: HeaderDeclaration = { value, append: options?.append === true };
  record.live.push(declared);
  if (declared.append) headers.append(name, value);
  else headers.set(name, value);
  if (getOwner() === null) return;
  const held = record;
  onCleanup(() => {
    if (!retractable(response, ledger)) return;
    const at = held.live.indexOf(declared);
    if (at === -1) return;
    held.live.splice(at, 1);
    headers.delete(name);
    if (Array.isArray(held.base)) for (const line of held.base) headers.append(name, line);
    else if (held.base !== null) headers.set(name, held.base);
    for (const survivor of held.live) {
      if (survivor.append) headers.append(name, survivor.value);
      else headers.set(name, survivor.value);
    }
    if (held.live.length === 0) ledger.headers.delete(key);
  });
}

function reportLate(call: string, api: (...args: never[]) => unknown): void {
  if (!diagnosticsEnabled()) return;
  const error = new Error(`${call} ran after the response's head was committed`);
  Error.captureStackTrace?.(error, api);
  emitDiagnostic(
    {
      code: "LATE_HEADER_WRITE",
      kind: "head",
      severity: "warn",
      message:
        `\`${call}\` ran after the response's status and headers had been sent, so it changed ` +
        "nothing the browser receives. A declaration in a part of the page that renders after the " +
        "shell, inside a `<Loading>` boundary the shell did not wait for, comes too late. Declare " +
        "the status and headers from what the shell renders, or decide them before the render: " +
        "in a `beforeLoad`, a route handler or a middleware.",
      data: { call, error },
    },
    null,
  );
}

const MUTATORS = ["set", "append", "delete"] as const;

/**
 * Freeze a head: it has been derived for the wire. Its trace's `Server-Timing`
 * entries are the last thing written to it, so a name the application wrote
 * itself is respected, and from here a write through `headers` reaches nothing
 * and says so, whoever makes it.
 *
 * `allowLateLocation` keeps `headers.set("location")` open, for a stream whose
 * completion still honours a redirect declared after its shell, with a script.
 */
export function commitResponseStub(
  stub: ResponseStub,
  options: { readonly allowLateLocation?: boolean; readonly event?: RequestEvent } = {},
): ResponseStub {
  if (stub.committed === true) return stub;
  const trace = traceForStub(stub, options.event);
  if (trace !== undefined) appendTraceServerTiming(stub.headers, trace);
  stub.committed = true;
  const headers = stub.headers as Headers & Record<string, unknown>;
  for (const method of MUTATORS) {
    const original = headers[method].bind(headers) as (name: string, value?: string) => void;
    Object.defineProperty(headers, method, {
      configurable: true,
      value(name: string, value?: string): void {
        if (
          options.allowLateLocation === true &&
          method === "set" &&
          name.toLowerCase() === "location"
        ) {
          original(name, value);
          return;
        }
        reportLate(`headers.${method}(${JSON.stringify(name)})`, headers[method] as never);
      },
    });
  }
  return stub;
}

/**
 * Is this somewhere a browser may be SENT?
 *
 * A path, a relative path, a protocol-relative URL and an `http(s)` URL: yes.
 * Any other scheme: no. `javascript:` is the one that matters and `data:` is the
 * one after it.
 *
 * MEASURED, in a real browser, because the answer is not obvious: a 302 whose
 * `Location` is `javascript:…` is INERT — no browser follows it — but barq's
 * streaming redirect cannot be a 302, and
 * `<script>location.replace("javascript:…")</script>` EXECUTES. So a route doing
 * the ordinary `redirect(searchParams.get("next"))` has an open redirect on the
 * pre-shell path and a cross-site scripting hole on the streamed one. The
 * severity escalation is barq's, so the refusal is barq's.
 *
 * A protocol-relative `//host` and an absolute `https://host` are ALLOWED. They
 * are an open redirect if an application forwards user input into one, which is
 * that application's bug and is what every framework's `redirect` does — and
 * refusing them would break the OAuth hand-off that is the main reason to
 * redirect off-origin at all.
 */
export function isNavigable(to: string): boolean {
  const scheme = /^([a-zA-Z][a-zA-Z\d+\-.]*):/.exec(to);
  if (scheme === null) return true;
  const name = (scheme[1] ?? "").toLowerCase();
  return name === "http" || name === "https";
}

/** The status a redirect preempting a page takes: the head's own when it is a redirect status, 302 otherwise. */
export function getExpectedRedirectStatus(response: ResponseStub): number {
  const status = response.status;
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
    ? status
    : 302;
}

/** What a body this runtime composes cannot be described by from before it existed. */
export const COMPOSED_BODY_FRAMING: ReadonlySet<string> = new Set([
  "content-length",
  "content-encoding",
  "transfer-encoding",
]);

/** The cookie lines each response has already been given from a head. */
const APPLIED = new WeakMap<Response, Set<string>>();

/**
 * A copy of `response` this runtime owns, with its status and every header.
 *
 * Headers go on AFTER construction: under a DOM registered on the server
 * (happy-dom's `GlobalRegistrator`), `new Response(body, { headers })` drops
 * every `set-cookie` in the init, and appending to the built response keeps
 * them.
 */
function owned(response: Response): Response {
  const out = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
  });
  out.headers.delete("content-type");
  for (const [name, value] of response.headers) {
    if (name !== "set-cookie") out.headers.append(name, value);
  }
  for (const line of response.headers.getSetCookie()) out.headers.append("set-cookie", line);
  return out;
}

/**
 * Fold a head onto a response that did not derive its own from it.
 *
 * The response's own status and headers win, because a handler that built a
 * whole response has said what it wants. `set-cookie` is additive: a
 * middleware that refreshes a session and a handler that sets a preference are
 * both right. `server-timing` is a list, folded entry by entry. A `location`
 * on the head never fills in, since it would make a success body a redirect,
 * and neither does body framing on a response without a body.
 *
 * A NEW `Response`, never the given one mutated: an application may return one
 * object for every request, and folding into it served one visitor's cookie to
 * the next. A response folded more than once, at each level of a middleware
 * chain, is given each cookie line once.
 */
export function foldResponseStub(response: Response, stub: ResponseStub | undefined): Response {
  if (stub === undefined) return response;
  // `Response.error()` and an opaque response have no status to rebuild with.
  if (response.status < 200 || response.status > 599) return response;
  const sent = APPLIED.get(response) ?? new Set<string>();
  const cookies = stub.headers.getSetCookie().filter((line) => !sent.has(line));
  const gaps: [string, string][] = [];
  let timing: string | null = null;
  for (const [name, value] of stub.headers) {
    if (name === "set-cookie") continue;
    if (name === "server-timing") {
      timing = value;
      continue;
    }
    if (name === "location" || response.headers.has(name)) continue;
    if (response.body === null && (name === "content-type" || name === "content-length")) continue;
    gaps.push([name, value]);
  }
  if (cookies.length === 0 && gaps.length === 0 && timing === null) return response;
  const out = owned(response);
  for (const [name, value] of gaps) out.headers.set(name, value);
  for (const line of cookies) out.headers.append("set-cookie", line);
  if (timing !== null) mergeServerTiming(out.headers, timing);
  APPLIED.set(out, new Set([...sent, ...cookies]));
  return out;
}

/**
 * The exit for a `Response` that did not come from `createSSRResponse`: a
 * middleware's early answer, a route handler's, a server function's. Folds the
 * event's head onto it (see `foldResponseStub`) and commits the head. A head
 * already committed passes the response through, so a handler applies this
 * once at its edge after its middleware has unwound, whatever answered.
 *
 * An event with no head still hands the request's trace on.
 */
export function commitEventResponse(
  response: Response,
  event: RequestEvent | undefined = getRequestEvent(),
): Response {
  const stub = event?.response;
  if (stub === undefined || stub.committed === true) {
    if (event === undefined || stub !== undefined) return response;
    const trace = traceForEvent(event);
    if (!trace.emit || response.status < 200 || response.status > 599) return response;
    const out = owned(response);
    appendTraceServerTiming(out.headers, trace);
    return out;
  }
  commitResponseStub(stub, { event });
  return foldResponseStub(response, stub);
}
