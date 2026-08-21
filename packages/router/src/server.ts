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

import {
  html as ssrHtml,
  renderPage,
  renderToStream,
  ssrErrored,
  ssrLoading,
} from "@barqjs/server";
import { withRequest } from "@barqjs/start";

import { NotFound, Redirect, errorFallbackFor } from "./errors.ts";
import { memoryHistory } from "./history.ts";
import { createMatcher } from "./matcher.ts";
import { type AnyRouteDefinition, type Route, flattenRoutes } from "./route.ts";
import { type Guard, type RouterConfig, type RouterState, createRouter } from "./router.ts";
import { routePropsFor } from "./components.ts";

/**
 * Render the matched chain through the STRING backend.
 *
 * `renderDepth` in `components.ts` is the DOM one — it calls `branch` and
 * `boundary`, which build nodes. The string backend has its own implementations
 * of the same constructs (`ssrLoading`), and CODESIGN §3.11's "one ABI means no
 * fallback cliff" is what makes a userland component drivable by both: every
 * component is `(s, props) -> Out` and `Out` is a string here.
 *
 * There is no `branch` on this side and none is needed. A string render has no
 * later frame to re-key into, so the chain is walked once, outermost first,
 * with each depth's `children` a Block the layout may place where it likes.
 */
export function renderRoutes(state: RouterState): unknown {
  const chain = state.chain();
  if (chain.length === 0) return ssrHtml("");

  // Before depth 0 is built, and from HERE rather than from the page handler:
  // this runs inside the render session, and a value first read outside one is
  // seeded into nobody. See `RouterState.prime`.
  state.prime();

  const at = (depth: number): unknown => {
    const route = chain[depth];
    if (route === undefined) return ssrHtml("");

    const children = ((): unknown => at(depth + 1)) as never;
    const component = route.definition.component;
    const content = (): unknown =>
      component === undefined
        ? at(depth + 1)
        : (component as unknown as (s: null, p: unknown) => unknown)(
            null,
            routePropsFor(state, depth, route, children, true),
          );

    // An error boundary INSIDE the loading one, and the nesting is the whole
    // point rather than a style choice.
    //
    // A loader that rejects after the shell has flushed throws on RESUME, and
    // the stream's round loop swallows only `NotReadyError`
    // (`packages/server/src/server.ts`) — anything else reaches
    // `controller.error` and tears the body mid-document. An error boundary
    // placed OUTSIDE the loading one cannot help: by resume time `ssrErrored`
    // has already returned, so its `try` is gone. What the stream re-invokes is
    // the loading boundary's own content Block, so the catch has to be in
    // there. `Errored` re-throws `NotReadyError` on both backends, so parking
    // still works through it.
    const pending = route.definition.pending;
    return ssrLoading(null, {
      fallback: () =>
        pending === undefined
          ? ssrHtml("")
          : (pending as unknown as (s: null, p: unknown) => unknown)(
              null,
              routePropsFor(state, depth, route, (() => ssrHtml("")) as never, true),
            ),
      children: () =>
        ssrErrored(null, {
          // The string backend hands an error fallback `(error, reset)`
          // positionally, exactly as `flow.ts`'s does.
          fallback: (fallbackScope: unknown, error: () => Error, reset: () => void) => {
            const shown = errorFallbackFor(chain, depth, () => state.params())(
              fallbackScope,
              error,
              reset,
            );
            return shown === null || shown === undefined ? ssrHtml("") : shown;
          },
          children: content,
        }),
    });
  };

  return at(0);
}

export { NotFound, Redirect, errorFallbackFor, notFound, redirect } from "./errors.ts";

export interface DocumentParts {
  /** The application's markup. */
  readonly body: string;
  /**
   * The hydration seed, as a `<script>`, for the caller to place.
   *
   * Non-empty only when `stream` is false. A streamed page emits its own seed
   * scripts inline as each boundary settles — including values that settle
   * AFTER the shell — so there is nothing here to place.
   */
  readonly seed: string;
  /** The matched chain, for a title or meta tags. `null` when nothing matched. */
  readonly chain: readonly Route[] | null;
  readonly url: URL;
}

export interface PageHandlerOptions {
  readonly routes: readonly AnyRouteDefinition[];
  /**
   * The application, as the string backend wants it: returns `SsrHtml`.
   *
   * It is handed the request's router state and should render it with
   * `<RouterProvider state>` rather than building a second one. The handler owns
   * the state because it needs to give it an `onLoaderError` and read the answer
   * back — a loader's `throw redirect(...)` does not otherwise unwind out of the
   * render.
   */
  readonly app: (state: RouterState) => unknown;
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

    // Request-scoped, so the answer a loader throws cannot reach another
    // request. A module-level "current answer" is GHSA-hgv7-v322-mmgr.
    let answer: Response | null = null;
    // `notFound()` is an ANSWER, not a failure: the page still renders (its
    // `notFoundComponent` does), and what changes is the status. Tracked
    // separately from `answer` for that reason — turning it into a `Response`
    // here would discard the markup the render just produced.
    let missing = false;
    const config: RouterConfig = {
      routes: options.routes,
      beforeEach: options.beforeEach,
      history: memoryHistory({ initial: [url.pathname + url.search] }),
      onLoaderError(error) {
        if (error instanceof NotFound) missing = true;
        answer ??= asResponse(error);
      },
    };

    // Rule 2. The whole render, including every loader and every server
    // function a loader calls, runs with this request ambient.
    try {
      return await withRequest(request, async () => {
        const state = createRouter(config);
        // `beforeLoad` runs BEFORE the shell, which is the whole reason it is a
        // separate phase from the loader: here the status is still open, so a
        // `throw redirect(...)` becomes a real 302 and a `throw notFound()` a
        // real 404. The same throw from a LOADER cannot — see `redirectScript`.
        let contexts: readonly Record<string, unknown>[];
        try {
          contexts = await state.runBeforeLoad(
            {
              pathname: url.pathname,
              search: url.search,
              hash: url.hash,
              state: null,
              key: "",
            },
            match,
          );
        } catch (error) {
          state.dispose();
          if (error instanceof NotFound) return html("not found", 404);
          const early = asResponse(error);
          if (early !== null) return early;
          throw error;
        }
        state.setContexts(contexts);
        // A streamed response is not finished when this function returns it:
        // `renderToStream` hands back the `ReadableStream` before a byte of the
        // body exists, and the boundaries resume against this state afterwards.
        // Disposing in a `finally` therefore cleared the loader cache and
        // unsubscribed history MID-RENDER, and every entry was re-minted on
        // resume — masked today only because a re-minted cell for a settled key
        // answers from the session bucket instead of refetching.
        let disposed = false;
        const dispose = (): void => {
          if (disposed) return;
          disposed = true;
          state.dispose();
        };
        try {
          if (options.stream === false) {
            // `renderPage`, not `renderToString`: the sync one does not await an
            // async value, so every loader on the page would render as its
            // fallback and the seed would be empty. Measured on exactly that
            // mistake — a server function's result stringified as
            // "[object Promise]" and its handler ran detached from the render.
            const page = await renderPage(() => options.app(state) as never, {
              nonce: options.nonce,
            });
            // A loader that threw a `Response` or a `Redirect` decided this
            // page, even though the render completed around it.
            dispose();
            if (answer !== null) return answer;
            return html(
              options.document({
                body: page.html,
                seed: page.script,
                chain: match?.route.chain ?? null,
                url,
              }),
              // A rendered 404 rather than a bare one. In STREAM mode the status
              // is already on the wire by the time a loader can say this, so a
              // `notFound()` that must set the status belongs where the status
              // is still open — the same rule redirects follow.
              missing ? 404 : status,
            );
          }
          const stream = renderToStream(() => options.app(state) as never, {
            signal: request.signal,
            nonce: options.nonce,
          });
          return new Response(
            wrapStream(stream, options, match?.route.chain ?? null, url, dispose, () => answer),
            {
              status,
              headers: { "content-type": "text/html; charset=utf-8" },
            },
          );
        } catch (error) {
          // The stream was never handed over, so nothing else will dispose it.
          dispose();
          throw error;
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

/**
 * A redirect a LOADER threw, once the shell is already on the wire.
 *
 * Rule 1 says the status is decided before the shell flushes, and
 * `renderToStream` emits the shell synchronously — so this redirect cannot be a
 * 302 and pretending otherwise would mean awaiting the whole chain before the
 * first byte, which is streaming that does not stream. It becomes a client-side
 * redirect instead, with a `<noscript>` fallback so a scripting-disabled client
 * still arrives.
 *
 * A redirect that MUST be a 302 belongs in `beforeEach`, which runs before the
 * render and gets one. A non-redirect answer — a middleware's `throw new
 * Response(401)` — cannot be honoured here at all: the route's error boundary
 * has already replaced the content with its fallback, and that is the whole of
 * what a stream can do about it. Authorization belongs before the shell.
 */
function redirectScript(answer: Response | null): string {
  if (answer === null || answer.status < 300 || answer.status >= 400) return "";
  const to = answer.headers.get("location");
  if (to === null || to === "") return "";
  // `JSON.stringify` handles quotes and backslashes; `<` is escaped separately
  // because `</script>` inside a string literal still ends the element.
  const js = JSON.stringify(to).replaceAll("<", "\\u003c");
  const attr = to.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return (
    `<script>location.replace(${js})</script>` +
    `<noscript><meta http-equiv="refresh" content="0;url=${attr}"></noscript>`
  );
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
  /** Runs when the body is finished or abandoned — never before. */
  done: () => void,
  /** What a loader threw, read AFTER the render — see `redirectScript`. */
  answer: () => Response | null,
): ReadableStream<Uint8Array> {
  const document = options.document({ body: BODY_MARKER, seed: "", chain, url });
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
      const late = redirectScript(answer());
      if (late !== "") controller.enqueue(encoder.encode(late));
      controller.enqueue(encoder.encode(tail));
      controller.close();
      done();
    },
    cancel(reason) {
      // The client went away. Cancelling the inner stream is what stops the
      // render doing work nobody will read — on Lambda a stream that is not
      // cancelled is billed for its full duration.
      void stream.cancel(reason);
      done();
    },
  });
}
