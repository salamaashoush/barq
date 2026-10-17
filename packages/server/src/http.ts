/**
 * Solid 2.0's response-head lifecycle for a handler written on this package:
 * build the event with `createRequestEvent`, run under it with
 * `provideRequestEvent`, and let the page leave through `createSSRResponse`
 * and anything else through `commitEventResponse`.
 *
 * `@barqjs/router`'s page handler is one such handler. It commits its head at
 * its own edge, with `commitEventResponse` once the request middleware has
 * unwound, so a middleware may still set a cookie after `next()`.
 */

import type { RequestEvent, ResponseStub } from "@barqjs/web";
import {
  COMPOSED_BODY_FRAMING,
  commitResponseStub,
  getExpectedRedirectStatus,
  mergeServerTiming,
} from "@barqjs/web/internal";

import { escapeAttribute } from "./ssr.ts";

export interface SSRResponseOptions {
  /** The status and headers a page answers with where the head does not say. */
  readonly responseInit?: ResponseInit;
  /** Carried by the script that honours a redirect declared after the shell. */
  readonly nonce?: string | null;
  /** Rewrites each chunk of HTML on its way out: a doctype, an entry script. */
  readonly transformChunk?: (chunk: string) => string;
}

/** The parts of a `renderToStream` result this consumes. */
type StreamedRender =
  | { readonly readable: ReadableStream<Uint8Array> }
  | { pipe(writable: { write: (chunk: string) => unknown; end: () => unknown }): void };

/** Headers the init carried, with every `set-cookie` kept as its own line. */
function copied(init: HeadersInit | undefined): Headers {
  const source = init as Headers | undefined;
  if (source === undefined || typeof source.getSetCookie !== "function") return new Headers(init);
  const headers = new Headers();
  for (const [name, value] of source) if (name !== "set-cookie") headers.append(name, value);
  for (const line of source.getSetCookie()) headers.append("set-cookie", line);
  return headers;
}

/** The head a page answers with: the init, with the stub's status and headers over it. */
function deriveHead(
  stub: ResponseStub | undefined,
  init: ResponseInit = {},
): { status: number; statusText: string | undefined; headers: Headers } {
  const headers = copied(init.headers);
  if (stub !== undefined) {
    for (const [name, value] of stub.headers) {
      if (name === "server-timing") mergeServerTiming(headers, value);
      else if (name !== "set-cookie") headers.set(name, value);
    }
    for (const line of stub.headers.getSetCookie()) headers.append("set-cookie", line);
  }
  // This runtime writes the body, so framing written before it cannot describe it.
  for (const name of COMPOSED_BODY_FRAMING) headers.delete(name);
  return {
    status: stub?.status ?? init.status ?? 200,
    statusText: stub?.statusText ?? init.statusText,
    headers,
  };
}

/**
 * The `Response` built, headers appended after construction: under a DOM
 * registered on the server, an init's `set-cookie` lines are dropped.
 */
function built(
  body: BodyInit | null,
  head: { status: number; statusText: string | undefined; headers: Headers },
): Response {
  const response = new Response(body, { status: head.status, statusText: head.statusText });
  response.headers.delete("content-type");
  for (const [name, value] of head.headers) {
    if (name !== "set-cookie") response.headers.append(name, value);
  }
  for (const line of head.headers.getSetCookie()) response.headers.append("set-cookie", line);
  return response;
}

function redirectFrom(
  stub: ResponseStub,
  head: { status: number; statusText: string | undefined; headers: Headers },
): Response {
  return built(null, {
    status: getExpectedRedirectStatus(stub),
    statusText: undefined,
    headers: head.headers,
  });
}

function html(
  body: BodyInit | null,
  head: { status: number; statusText: string | undefined; headers: Headers },
): Response {
  if (!head.headers.has("content-type"))
    head.headers.set("content-type", "text/html; charset=utf-8");
  return built(body, head);
}

/** A target a script may send the browser to: a path, or an `http(s)` URL. */
function navigable(target: string): boolean {
  try {
    const url = new URL(target, "http://localhost");
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The `Response` for a rendered page, deriving its head from `event.response`
 * at the moment the head freezes.
 *
 * A string, from `renderToString` or an awaited `renderToStream`, answers at
 * once. A `Location` on the head makes it a bodiless redirect instead.
 *
 * A `renderToStream` result answers when its shell flushes, which is when the
 * head is committed: a later write to it reaches nothing. A `Location` declared
 * before the flush is a real redirect and the render is torn down; one declared
 * after can only be honoured in the page, so the stream ends with a script
 * that goes there. Cancelling the body stops the render.
 */
export function createSSRResponse(
  result: string,
  event: RequestEvent | undefined,
  options?: SSRResponseOptions,
): Response;
export function createSSRResponse(
  result: StreamedRender,
  event: RequestEvent | undefined,
  options?: SSRResponseOptions,
): Promise<Response>;
export function createSSRResponse(
  result: string | StreamedRender,
  event: RequestEvent | undefined,
  options: SSRResponseOptions = {},
): Response | Promise<Response> {
  const stub = event?.response;
  const transform = options.transformChunk;
  if (typeof result === "string") {
    if (stub !== undefined) commitResponseStub(stub, { event });
    const head = deriveHead(stub, options.responseInit);
    if (stub !== undefined && stub.headers.get("location") !== null)
      return redirectFrom(stub, head);
    return html(transform === undefined ? result : transform(result), head);
  }

  const encoder = new TextEncoder();
  return new Promise<Response>((resolve) => {
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    let flushed = false;
    let closed = false;
    let stop: () => void = () => {};
    const enqueue = (text: string): void => {
      if (closed || controller === null || text === "") return;
      try {
        controller.enqueue(encoder.encode(text));
      } catch {
        // The consumer has gone; the render is stopped by `cancel`.
        closed = true;
      }
    };
    const write = (chunk: string): void => {
      if (!flushed) {
        flushed = true;
        if (stub !== undefined) commitResponseStub(stub, { allowLateLocation: true, event });
        const head = deriveHead(stub, options.responseInit);
        if (stub !== undefined && stub.headers.get("location") !== null) {
          closed = true;
          resolve(redirectFrom(stub, head));
          stop();
          return;
        }
        resolve(
          html(
            new ReadableStream<Uint8Array>({
              start(given) {
                controller = given;
              },
              cancel() {
                if (closed) return;
                closed = true;
                stop();
              },
            }),
            head,
          ),
        );
      }
      enqueue(transform === undefined ? chunk : transform(chunk));
    };
    const end = (): void => {
      if (!flushed) write("");
      if (closed || controller === null) return;
      const location = stub?.headers.get("location") ?? null;
      if (location !== null && navigable(location)) {
        const nonce = options.nonce;
        const attribute =
          nonce === undefined || nonce === null || nonce === ""
            ? ""
            : ` nonce="${escapeAttribute(nonce)}"`;
        enqueue(
          `<script${attribute}>window.location=${JSON.stringify(location).replaceAll("<", "\\u003c")}</script>`,
        );
      }
      closed = true;
      try {
        controller.close();
      } catch {
        // Already closed by the consumer.
      }
    };

    if ("readable" in result) {
      const reader = result.readable.getReader();
      stop = () => {
        void reader.cancel().catch(() => {});
      };
      const decoder = new TextDecoder();
      void (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            write(decoder.decode(value, { stream: true }));
            if (closed) return;
          }
        } catch {
          // A stream that errored has said all it will.
        }
        end();
      })();
      return;
    }
    result.pipe({ write, end });
  });
}

/** A fetch-style middleware: the request, and what runs after it. */
export type FetchMiddleware = (
  request: Request,
  next: (request?: Request) => Promise<Response>,
) => Response | Promise<Response>;

/**
 * Compose fetch-style middleware into one function of the same shape, whose
 * `next` is the handler. `next(request)` hands a different request down. Runs
 * in whatever request scope the caller entered, so `getRequestEvent()` answers
 * inside a middleware as it does in application code, and nothing reaches the
 * wire until the outermost one returns.
 */
export function composeMiddleware(
  middlewares: readonly FetchMiddleware[],
): (
  request: Request,
  next: (request: Request) => Response | Promise<Response>,
) => Promise<Response> {
  return (request, last) => {
    let reached = -1;
    const dispatch = (at: number, current: Request): Promise<Response> => {
      if (at <= reached)
        return Promise.reject(new Error("[barq] `next()` was called twice in one middleware."));
      reached = at;
      const middleware = middlewares[at];
      if (middleware === undefined) return Promise.resolve(last(current));
      return Promise.resolve(middleware(current, (next) => dispatch(at + 1, next ?? current)));
    };
    return dispatch(0, request);
  };
}
