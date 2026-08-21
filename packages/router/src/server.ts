/**
 * The page handler: one request in, one `Response` out.
 *
 * Three rules, each of which exists because the code it sits on made it
 * necessary rather than because a framework elsewhere does it.
 *
 *  1. **The status is decided BEFORE the shell flushes.** No SSR entry point
 *     carries a status — `renderToString`, `renderToStringAsync`, `renderPage`
 *     and `renderToStream` all return markup only — and `renderToStream` emits
 *     the shell synchronously, so a 404 discovered mid-render would land after
 *     the headers. The match runs first, the status comes from it, and the
 *     render is entered afterwards.
 *  2. **The render runs inside `withRequest`.** Nothing else enters it for a
 *     page — `handleServerFn` is its only other caller — so without this a
 *     loader's server function calling `getRequest()` throws *inside* the
 *     render. With it, a middleware that refuses throws a `Response` this
 *     handler returns as the page's own.
 *  3. **The router owns the document.** `renderPage` returns body markup;
 *     there is no `<head>`, no doctype and no title anywhere in the runtime,
 *     and `Portal` writes nothing on the server so it is not an escape hatch.
 */

import { renderToStream, renderToString } from "@barqjs/server";
import { withRequest } from "@barqjs/start";

import { memoryHistory } from "./history.ts";
import { createMatcher } from "./matcher.ts";
import { type Route, type RouteDefinition, flattenRoutes } from "./route.ts";
import { type Guard, type RouterConfig, createRouter } from "./router.ts";

/** Thrown by a loader or a guard to send the browser somewhere else. */
export class Redirect extends Error {
  readonly to: string;
  readonly status: number;
  constructor(to: string, status = 302) {
    super(`redirect to ${to}`);
    this.name = "Redirect";
    this.to = to;
    this.status = status;
  }
}

/** `throw redirect("/login")`. Carried over the wire by the codec as an Error. */
export function redirect(to: string, status = 302): never {
  throw new Redirect(to, status);
}

export interface DocumentParts {
  /** The application's markup. */
  readonly body: string;
  /** The matched chain, for a title or meta tags. `null` when nothing matched. */
  readonly chain: readonly Route[] | null;
  readonly url: URL;
}

export interface PageHandlerOptions {
  readonly routes: readonly RouteDefinition<never, never>[];
  /**
   * The application, as the string backend wants it: a zero-argument thunk
   * whose return value is `SsrHtml`. It is invoked inside the render, inside
   * `withRequest`, with the router already provided.
   */
  readonly app: () => unknown;
  /**
   * Wraps the app's markup in a document. Given the matched chain so a route
   * can decide the title.
   */
  readonly document: (parts: DocumentParts) => string;
  readonly beforeEach?: readonly Guard[];
  readonly base?: string;
  /** Streamed by default. A crawler or a test may want the whole thing at once. */
  readonly stream?: boolean;
  readonly nonce?: string;
}

/**
 * Build the `fetch` half of a barq server.
 *
 * Pass it as `serveBarq({ fetch })`. Server functions are matched FIRST there,
 * which is deliberate: their URL is reserved, and a page handler that also
 * answered it would turn a mutation into an HTML response.
 */
export function createPageHandler(
  options: PageHandlerOptions,
): (request: Request) => Promise<Response> {
  const matcher = createMatcher(flattenRoutes(options.routes));

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const match = matcher.match(url.pathname);

    // Rule 1. Everything that can decide a status happens here, before any
    // byte of the shell exists.
    if (options.beforeEach !== undefined) {
      const location = {
        pathname: url.pathname,
        search: url.search,
        hash: "",
        state: null,
        key: "",
      };
      for (const guard of options.beforeEach) {
        let verdict: boolean | string;
        try {
          verdict = await guard({ from: location, to: location, params: match?.params ?? {} });
        } catch (error) {
          const answer = asResponse(error);
          if (answer !== null) return answer;
          throw error;
        }
        if (verdict === false) return new Response("forbidden", { status: 403 });
        if (typeof verdict === "string") return redirectResponse(verdict, 302);
      }
    }

    const status = match === null ? 404 : 200;

    const config: RouterConfig = {
      routes: options.routes,
      beforeEach: options.beforeEach,
      history: memoryHistory({ initial: [url.pathname + url.search] }),
    };

    // Rule 2. The whole render, including every loader and every server
    // function a loader calls, runs with this request ambient.
    try {
      return await withRequest(request, async () => {
        const state = createRouter(config);
        try {
          if (options.stream === false) {
            const body = renderToString(options.app as never);
            return html(options.document({ body, chain: match?.route.chain ?? null, url }), status);
          }
          const stream = renderToStream(options.app as never, {
            signal: request.signal,
            nonce: options.nonce,
          });
          return new Response(wrapStream(stream, options, match?.route.chain ?? null, url), {
            status,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        } finally {
          state.dispose();
        }
      });
    } catch (error) {
      const answer = asResponse(error);
      if (answer !== null) return answer;
      throw error;
    }
  };
}

/**
 * A middleware refuses by throwing a `Response`; a loader redirects by throwing
 * a `Redirect`. Both are answers, not failures, and both become this page's
 * response rather than a 500.
 */
function asResponse(error: unknown): Response | null {
  if (error instanceof Response) return error;
  if (error instanceof Redirect) return redirectResponse(error.to, error.status);
  return null;
}

function redirectResponse(to: string, status: number): Response {
  return new Response(null, { status, headers: { location: to } });
}

function html(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * Split the document around the app's markup and stream the middle.
 *
 * The document function is called once, with an empty body, and the result is
 * cut at the marker — so the head reaches the browser before the first loader
 * has settled, which is the entire point of streaming.
 */
const BODY_MARKER = "<!--barq-body-->";

function wrapStream(
  stream: ReadableStream<Uint8Array>,
  options: PageHandlerOptions,
  chain: readonly Route[] | null,
  url: URL,
): ReadableStream<Uint8Array> {
  const document = options.document({ body: BODY_MARKER, chain, url });
  const cut = document.indexOf(BODY_MARKER);
  if (cut === -1) {
    throw new Error(
      "the document function must place its `body` argument in the markup it returns",
    );
  }
  const head = document.slice(0, cut);
  const tail = document.slice(cut + BODY_MARKER.length);

  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(head));
      const reader = stream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        reader.releaseLock();
      }
      controller.enqueue(encoder.encode(tail));
      controller.close();
    },
    cancel(reason) {
      // The client went away. Cancelling the inner stream is what stops the
      // render doing work nobody will read — on Lambda a stream that is not
      // cancelled is billed for its full duration.
      void stream.cancel(reason);
    },
  });
}
