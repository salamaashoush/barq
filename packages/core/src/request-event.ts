/**
 * Solid 2.0's request event and the two response declarations a render makes.
 *
 * The event is found through an `AsyncLocalStorage` on the global under a
 * registered symbol, which `@barqjs/server/storage` and `@barqjs/start` create
 * and enter. This module never imports `node:async_hooks`, so it is the same
 * code in a browser bundle, where no storage exists and every call answers
 * "no request".
 */

import { getOwner, onCleanup } from "@solidjs/signals";

import { diagnosticsEnabled, emitDiagnostic } from "./signals.ts";

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

/** `@barqjs/start` marks a draft it has handed to the server as `sent`. */
function committed(response: ResponseStub): boolean {
  return response.committed === true || (response as { sent?: boolean }).sent === true;
}

/**
 * Declare the response status for as long as the calling scope lives.
 *
 * A scope disposed while the head is still open takes its declaration back:
 * an error boundary that recovers un-declares its 500. Once the head is
 * committed — the shell has flushed — a declaration reaches nothing, and a
 * development build says so. A no-op outside a request.
 */
export function httpStatus(code: number, text?: string): void {
  const response = getRequestEvent()?.response;
  if (response === undefined) return;
  if (committed(response)) {
    reportLate(`httpStatus(${code})`, httpStatus);
    return;
  }
  const previous = { status: response.status, statusText: response.statusText };
  response.status = code;
  if (text !== undefined) response.statusText = text;
  if (getOwner() === null) return;
  onCleanup(() => {
    if (committed(response) || response.status !== code) return;
    response.status = previous.status;
    response.statusText = previous.statusText;
  });
}

/**
 * Declare a response header for as long as the calling scope lives. `append`
 * adds a value beside the ones already there, which `set-cookie` needs.
 */
export function httpHeader(name: string, value: string, options?: { append?: boolean }): void {
  const response = getRequestEvent()?.response;
  if (response === undefined) return;
  if (committed(response)) {
    reportLate(`httpHeader(${JSON.stringify(name)})`, httpHeader);
    return;
  }
  const headers = response.headers;
  const lower = name.toLowerCase();
  // A copy: an implementation may hand back the list it keeps.
  const before = lower === "set-cookie" ? [...headers.getSetCookie()] : headers.get(name);
  if (options?.append === true) headers.append(name, value);
  else headers.set(name, value);
  if (getOwner() === null) return;
  onCleanup(() => {
    if (committed(response)) return;
    headers.delete(name);
    if (Array.isArray(before)) for (const line of before) headers.append(name, line);
    else if (before !== null) headers.set(name, before);
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
