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
  branch as ssrBranch,
  esc,
  escapeAttribute as escapeSsrAttribute,
  html as ssrHtml,
  renderPage,
  renderToStream,
  ssrErrored,
  ssrLoading,
} from "@barqjs/server";
import { HYDRATE, type Block, type Scope, cell, getOwner, provide } from "@barqjs/core";
import { encodeSeed } from "@barqjs/server/codec";
import { isbot } from "isbot";

import { withRequest } from "@barqjs/start";
import { mountedFn } from "@barqjs/start/server";
import { PRERENDER_HEADER } from "@barqjs/start/protocol";

import { NotFound, Redirect, errorFallbackFor } from "./errors.ts";
import { projectHead } from "./head.ts";
import {
  type Reachability,
  describe as describeViolations,
  verifyRouteChains,
} from "./manifest.ts";
import { memoryHistory } from "./history.ts";
import { createMatcher } from "./matcher.ts";
import { type AnyRouteDefinition, type Route, flattenRoutes, preloadMatched } from "./route.ts";
import {
  type BeforeLoadResult,
  type Guard,
  type RouterConfig,
  type RouterState,
  ROUTE_CONTEXT_GLOBAL,
  createRouter,
} from "./router.ts";
import {
  type HeadAssets,
  HeadAssetsContext,
  LinkBackendContext,
  RouteMatchContext,
  RouterContext,
  routePropsFor,
} from "./components.ts";

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
type Invoked = (s: Scope | null, props: unknown) => unknown;

/**
 * `<Link>` and `<NavLink>`, as bytes.
 *
 * `components.ts` builds DOM — `template()` and `bindProp` — so before this
 * existed no SSR'd page could contain a link at all. It lives here rather than
 * there because it needs `@barqjs/server`, and `components.ts` is the
 * isomorphic entry: importing the server runtime from it would put the whole
 * thing in the browser bundle, which is the mistake `index.ts` already records
 * for `manifest.ts`.
 *
 * No `onClick`, and none is wanted. A server-rendered anchor is an ordinary
 * anchor; the client's own `<Link>` claims this element on hydration and binds
 * the interception then. What has to be right in the meantime is the `href`,
 * which is what makes the page work with no JavaScript at all.
 */
const linkBackend = {
  link: (href: string, className: string, children: unknown): unknown => {
    const attributes =
      `href="${escapeSsrAttribute(href)}"` +
      (className === "" ? "" : ` class="${escapeSsrAttribute(className)}"`);
    return ssrHtml(`<a ${attributes}>${esc(children)}</a>`);
  },
};

export function renderRoutes(state: RouterState): unknown {
  const chain = state.chain();
  if (chain.length === 0) return ssrHtml("");

  // Before depth 0 is built, and from HERE rather than from the page handler:
  // this runs inside the render session, and a value first read outside one is
  // seeded into nobody. See `RouterState.prime`.
  state.prime(true);

  const modes = state.ssrModes();

  // One `branch` per depth, then a `loading`, then an `error` — the same three
  // ranges `renderDepth` claims, in the same order. The walk itself is still
  // one pass outermost-first, and there is still no re-keying on this side;
  // what the branch buys is that the two halves write and claim the same shape.
  // Without it the DOM side claimed a range the string side never wrote, and
  // the mismatch surfaced as `not-hydratable` on every page.
  const at = (depth: number): unknown =>
    ssrBranch(
      getOwner(),
      null,
      null,
      () => chain[depth] ?? null,
      (): unknown => {
        if (depth !== 0) return bodyAt(depth);
        // `RouterContext`, provided ONCE at the outermost depth — which is what
        // `RouterProvider` does on the DOM side and what this side never did.
        // Without it every route component calling `useLocation`, `useParams`
        // or `useRouter` threw `NoOwnerError` INSIDE its own error boundary, so
        // the page rendered EMPTY and nothing said why. Found by the first
        // application whose layout has a nav in it.
        //
        // `getOwner()` rather than a scope parameter: this body is not a
        // `block()`, so `invokeBlock` reads it as a Cell and calls it with no
        // arguments. `activate` has already entered the scope, so the ambient
        // owner IS the one to provide on.
        const owner = getOwner();
        if (owner === null) return bodyAt(depth);
        return provide(owner, RouterContext, cell(state), (inner) =>
          provide(inner as Scope, LinkBackendContext, cell(linkBackend), () => bodyAt(depth)),
        );
      },
      HYDRATE,
    );

  // A depth past the end of the chain is still a RANGE, because `renderDepth`
  // builds one there too — a leaf's `children` Block is invoked by any layout
  // that places it, and on that side the empty answer comes from inside the
  // branch rather than instead of it.
  const bodyAt = (depth: number): unknown => {
    const route = chain[depth];
    if (route === undefined) return ssrHtml("");

    const children = ((): unknown => at(depth + 1)) as never;
    const component = route.definition.component;
    const pendingComponent = route.definition.pendingComponent;
    // The same match the DOM path provides, so `<Outlet />` and the route-scoped
    // hooks work in a component that is rendered on BOTH sides — which is every
    // component. Without it a layout using `<Outlet />` rendered its own markup
    // and then nothing.
    const inMatch = (fallback: Block<unknown>, body: (inner: Scope | null) => unknown): unknown => {
      const owner = getOwner();
      const match = { state, depth, route, children: fallback, blocking: true };
      if (owner === null) return body(null);
      return provide(owner, RouteMatchContext, cell(match), body);
    };
    const content = (): unknown => {
      // As on the DOM path: a refused validator throws inside this depth's
      // error boundary rather than out of the render.
      const refused = state.searchErrorAt(depth);
      if (refused !== null) throw refused;
      // `ssr: false` and `"data-only"` both mean the COMPONENT does not render
      // here. The difference is upstream: `"data-only"` still ran its loader,
      // so its value is seeded and the client's first read consumes it rather
      // than refetching. What goes on the wire is this depth's `pendingComponent`
      // fallback, which is what the client will replace.
      if (modes[depth] !== true) {
        if (pendingComponent === undefined) return ssrHtml("");
        const empty = (() => ssrHtml("")) as unknown as Block<unknown>;
        return inMatch(empty, (inner) =>
          (pendingComponent as unknown as Invoked)(
            inner,
            routePropsFor(state, depth, route, empty, true),
          ),
        );
      }
      if (component === undefined) return at(depth + 1);
      return inMatch(children, (inner) =>
        (component as unknown as Invoked)(
          inner,
          routePropsFor(state, depth, route, children, true),
        ),
      );
    };

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
    // `getOwner()`, not `null`. `requireScope(null)` answers `null`, and
    // `enter(null)` then builds a scope with NO PARENT — so every construct this
    // walk created was detached, and a context provided above it could never be
    // found below it. That is why `useLocation` in a route component threw on
    // the server and the page rendered empty inside its own error boundary.
    return ssrLoading(
      getOwner(),
      {
        fallback: () => {
          if (pendingComponent === undefined) return ssrHtml("");
          const empty = (() => ssrHtml("")) as unknown as Block<unknown>;
          return inMatch(empty, (inner) =>
            (pendingComponent as unknown as Invoked)(
              inner,
              routePropsFor(state, depth, route, empty, true),
            ),
          );
        },
        children: () =>
          ssrErrored(
            getOwner(),
            {
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
            },
            HYDRATE,
          ),
      },
      HYDRATE,
    );
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
  /**
   * `<link rel="modulepreload">` tags for the matched chain, ready to place in
   * the head.
   *
   * Empty unless `routeAssets` was supplied. This is the channel that stops a
   * code-split route flashing its `pending` fallback on first hydration: without
   * it the browser does not learn the route's chunk exists until the entry
   * module has parsed and asked for it, which is one round trip after the
   * markup it is already showing.
   *
   * A STRING rather than a list, because the document function places it and
   * the escaping is this module's job, not the application's.
   */
  readonly preload: string;
  /**
   * The route context the server built, as a `<script>`, for the caller to
   * place in the `<head>`.
   *
   * Empty when no route on the page declares a `beforeLoad`, so a document that
   * places it pays nothing for it.
   *
   * WHY IT BELONGS IN THE HEAD: the client router reads it when it mounts, and
   * a script after the body may not have arrived by then on a streamed page.
   * Placing it later is not wrong — the router falls back to running
   * `beforeLoad` itself — it just costs the duplicate run this exists to avoid.
   */
  readonly context: string;
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
   *
   * SUPERSEDED by the root route's `shellComponent`, which renders `<html>` as
   * JSX and lets `<HeadContent />` and `<Scripts />` place themselves. This
   * remains for a table that declares no shell, and for `@barqjs/start`'s own
   * tests, which have no router.
   */
  readonly document?: (parts: DocumentParts) => string;
  /**
   * What the client build emitted, for `<Scripts />` and `<HeadContent />`.
   *
   * The framework's own tags — the entry module, its CSS — reach the document
   * through the same components a route's do, rather than through a template
   * the application has to assemble in the right order.
   */
  readonly clientAssets?: {
    readonly scripts?: readonly string[];
    readonly css?: readonly string[];
  };
  /**
   * Answer a crawler with the WHOLE page instead of a stream.
   *
   * A streamed page's head is the head as of shell time, and a route whose
   * `head` reads `loaderData` has not run by then. TanStack answers this with a
   * user-agent check and nothing else — `renderRouterToStream` does
   * `if (isbot(...)) await waitForReadyOrAbort(...)` — and barq can do it in one
   * line rather than one transform, because `stream: false` is already a
   * different renderer that settles the graph before it emits a byte.
   *
   * Default: `isbot` on the `user-agent`. `false` disables it; a function
   * replaces it.
   */
  readonly bufferForCrawlers?: boolean | ((request: Request) => boolean);
  readonly beforeEach?: readonly Guard[];
  readonly base?: string;
  /**
   * Route id -> the client assets that route needs, from
   * `virtual:barq-route-assets`.
   *
   * The build produces it; nothing at runtime can. `lazy()` cannot report its
   * own module URL, so without this map the matched chain's chunks are
   * unknowable to the server.
   */
  readonly routeAssets?: Readonly<Record<string, readonly string[]>>;
  /** Streamed by default. A crawler or a test may want the whole thing at once. */
  readonly stream?: boolean;
  readonly nonce?: string;
  /**
   * Last look at the bytes that go out BEFORE the app's markup.
   *
   * In stream mode that is the document up to the `body` marker — the head, the
   * opening `<body>`, and the mount element — flushed in one piece ahead of the
   * first loader. Otherwise it is the whole document, because there is no
   * earlier moment.
   *
   * It exists for the dev server, which has to get `/@vite/client` and every
   * `transformIndexHtml` plugin into a document Vite never sees a file for.
   * Reading one chunk off the returned stream and hoping the first enqueue is
   * the whole head is an undocumented invariant, not a contract; this is the
   * contract.
   */
  readonly transformShell?: (shell: string, url: URL) => string | Promise<string>;
  /**
   * Refuse `getRequest()` inside this render.
   *
   * A prerender has no request: the `Request` the handler is holding was minted
   * by a build, and a loader that reads a header or a cookie from it is reading
   * a build machine. SvelteKit guards exactly one thing here and lets cookies
   * and headers silently answer null, which its own issue tracker records as
   * days of debugging. This throws instead, naming what asked.
   */
  readonly refuseRequest?: string;
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
    // A page is a GET. Nothing upstream filters the method — Vite's dev
    // middlewares check none of them and `serveBarq` matches server functions
    // and then falls through — so without this a `POST /users/7` ran every
    // `beforeLoad`, every loader and every server function a loader calls, and
    // answered with an HTML document.
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("method not allowed", {
        status: 405,
        headers: { allow: "GET, HEAD" },
      });
    }
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

    // What the matched route says about being written to disk, for a
    // PRERENDERER to read off the response.
    //
    // A header rather than a second entry point: the prerenderer lives in
    // `@barqjs/start`, which must not depend on the router, and "is this path
    // prerenderable" is a fact about the route table. It is emitted only for the
    // handler a prerender built — a live response carries nothing extra.
    const prerenderable =
      options.refuseRequest === undefined
        ? null
        : (match?.route.chain ?? []).at(-1)?.definition.prerender === true
          ? "1"
          : "0";

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
      return await withRequest(
        request,
        async () => {
          const state = createRouter(config);
          // `beforeLoad` runs BEFORE the shell, which is the whole reason it is a
          // separate phase from the loader: here the status is still open, so a
          // `throw redirect(...)` becomes a real 302 and a `throw notFound()` a
          // real 404. The same throw from a LOADER cannot — see `redirectScript`.
          let before: BeforeLoadResult;
          try {
            before = await state.runBeforeLoad(
              {
                pathname: url.pathname,
                search: url.search,
                hash: url.hash,
                state: null,
                key: "",
              },
              match,
              { server: true },
            );
          } catch (error) {
            state.dispose();
            if (error instanceof NotFound) return html("not found", 404);
            const early = asResponse(error);
            if (early !== null) return early;
            throw error;
          }
          state.setContexts(before.contexts);
          // The matched chain's MODULES, before the render.
          //
          // Every route a file-based table generates is `lazy()`, and a cold cell
          // throws `NotReadyError` — which the depth's boundary parks on. The
          // non-streamed arm renders exactly TWICE, so a chain two deep resolves
          // its layout on the second pass and its leaf on a third that never
          // happens: measured on the reference application as a prerendered page
          // with a nav and no content. Awaiting here costs the same imports the
          // render would have done, in one round instead of one per depth.
          await preloadMatched(match?.route.chain ?? []);
          // Decided BEFORE the head is projected, because it is what decides
          // whether `head` sees `loaderData` at all.
          const buffered = options.stream === false || isCrawler(request, options);
          const shell = shellComponentOf(options.routes);
          // `projectLane`, in the same pre-shell phase. Every route's `head` and
          // `scripts` run here with the params, the context and whatever
          // `loaderData` has already settled — which on a streamed page is
          // nothing, and on a buffered one is everything. `preloadMatched` has
          // just imported every module they live in.
          const chain = match?.route.chain ?? [];
          const params = match?.params ?? {};
          const assets = await projectHead(
            await Promise.all(
              chain.map(async (route) => ({
                params,
                loaderData: loaderDataFor(),
                definition: route.definition as never,
              })),
            ),
            // `console.error` and a rendered page, which is what `projectLane`
            // does with the same failure: a broken `head` costs that route its
            // tags, never the document.
            { nonce: options.nonce, onError: (error) => console.error(error) },
          );
          const context = contextScript(url, before.produced, options.nonce);
          const preloads = preloadFiles(match?.route.chain ?? null, options.routeAssets);
          const preload = preloadTags(match?.route.chain ?? null, options.routeAssets);
          const headAssets: HeadAssets = {
            matches: assets,
            nonce: options.nonce,
            clientAssets: options.clientAssets,
            preloads,
            preload,
            context,
            // The string backend's own renderer, handed over the way
            // `LinkBackend` is: `HeadContent` and `Scripts` live in the
            // ISOMORPHIC entry because the ROOT ROUTE MODULE — which is where a
            // shell is declared — ships to the browser. Importing
            // `@barqjs/router/server` from it drags `node:async_hooks` into the
            // client bundle, and Vite answers that with "Module has been
            // externalized for browser compatibility" and an empty page.
            raw: (markup: string) => ssrHtml(markup),
          };
          // The whole document when a shell is declared, the app's markup when
          // it is not — and the `document()` template then wraps it.
          const root = (): unknown =>
            shell === undefined ? options.app(state) : renderShell(state, shell, headAssets);
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
            if (buffered) {
              // `renderPage`, not `renderToString`: the sync one does not await an
              // async value, so every loader on the page would render as its
              // fallback and the seed would be empty. Measured on exactly that
              // mistake — a server function's result stringified as
              // "[object Promise]" and its handler ran detached from the render.
              const page = await renderPage(() => root() as never, { nonce: options.nonce });
              // A loader that threw a `Response` or a `Redirect` decided this
              // page, even though the render completed around it.
              dispose();
              if (answer !== null) return answer;
              return html(
                await shellOf(
                  options,
                  shell === undefined
                    ? documentOf(options, {
                        body: page.html,
                        seed: page.script,
                        chain: match?.route.chain ?? null,
                        preload,
                        context,
                        url,
                      })
                    : DOCTYPE + withSeed(page.html, page.script),
                  url,
                ),
                // A rendered 404 rather than a bare one. In STREAM mode the status
                // is already on the wire by the time a loader can say this, so a
                // `notFound()` that must set the status belongs where the status
                // is still open — the same rule redirects follow.
                missing ? 404 : status,
                prerenderable === null ? undefined : { [PRERENDER_HEADER]: prerenderable },
              );
            }
            const stream = renderToStream(() => root() as never, {
              signal: request.signal,
              nonce: options.nonce,
            });
            return new Response(
              shell === undefined
                ? wrapStream(
                    stream,
                    options,
                    match?.route.chain ?? null,
                    url,
                    dispose,
                    () => answer,
                    context,
                  )
                : shellStream(stream, options, url, dispose, () => answer),
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
        },
        options.refuseRequest,
      );
    } catch (error) {
      const thrown = asResponse(error);
      if (thrown !== null) return thrown;
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

/**
 * The modulepreload tags for one matched chain, deduplicated in chain order.
 *
 * Outermost first, because that is the order the browser will need them in: a
 * layout's chunk is parsed before the route it wraps. Duplicates are dropped
 * rather than emitted twice — a shared chunk appears in several routes' asset
 * lists by construction.
 */
export function preloadFiles(
  chain: readonly Route[] | null,
  assets: Readonly<Record<string, readonly string[]>> | undefined,
): string[] {
  if (chain === null || assets === undefined) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const route of chain) {
    for (const file of assets[route.id] ?? []) {
      if (seen.has(file)) continue;
      seen.add(file);
      out.push(file);
    }
  }
  return out;
}

/**
 * The same set, rendered.
 *
 * Still a string for the `document()` template, which is markup rather than a
 * tree and has nowhere to put a tag list. A declared `shellComponent` goes
 * through `<HeadContent />` instead, where the preloads are ordinary members of
 * the one managed list.
 */
export function preloadTags(
  chain: readonly Route[] | null,
  assets: Readonly<Record<string, readonly string[]>> | undefined,
): string {
  let out = "";
  for (const file of preloadFiles(chain, assets)) {
    out += `<link rel="modulepreload" href="${escapeAttribute(file)}">`;
  }
  return out;
}

/** Enough for a URL in an attribute: the four that can end it or open a tag. */
function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * The hydration handoff for the route context.
 *
 * Only the `beforeLoad` RETURNS travel. The synchronous `context()`s re-run on
 * the client, because they take no I/O and re-running one is cheaper than
 * serializing it — which is TanStack's split too: they carry `__beforeLoadContext`
 * under the wire key `b` and recompute `_ctx` beside it.
 *
 * `encodeSeed` rather than `JSON.stringify`, so the context carries what the
 * hydration seed carries — a `Date`, a `Map`, a cycle — and escapes its own
 * script-breaking content.
 */
export function contextScript(
  url: URL,
  produced: readonly (Record<string, unknown> | undefined)[],
  nonce?: string,
): string {
  if (!produced.some((entry) => entry !== undefined)) return "";
  const payload = encodeSeed({
    href: url.pathname + url.search + url.hash,
    produced,
  });
  const attr = nonce === undefined ? "" : ` nonce="${nonce}"`;
  return `<script${attr}>window.${ROUTE_CONTEXT_GLOBAL}=${payload}</script>`;
}

/**
 * `transformShell`, or the bytes unchanged.
 *
 * The URL is a PARAMETER rather than something the caller reads off an ambient
 * request, because the dev server needs it and two requests are in flight at
 * once on any real server. A module-level "current request" is
 * GHSA-hgv7-v322-mmgr, and it would be that here for the sake of one string.
 */
async function shellOf(options: PageHandlerOptions, shell: string, url: URL): Promise<string> {
  return options.transformShell === undefined ? shell : await options.transformShell(shell, url);
}

function html(body: string, status: number, extra?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...extra },
  });
}

/**
 * The header a prerenderer reads to decide whether to keep a crawled page.
 *
 * Re-exported rather than declared: `@barqjs/start/protocol` owns it, because
 * the prerenderer is the party that READS it and a second literal here is the
 * shape where the two halves drift apart in silence.
 */
export { PRERENDER_HEADER };

/** Re-exported so a server entry need not reach into the isomorphic one. */
export { HeadContent, Scripts } from "./components.ts";

/**
 * Split the document around the app's markup and stream the middle.
 *
 * The document function is called once, with an empty body, and the result is
 * cut at the marker — so the head reaches the browser before the first loader
 * has settled, which is the entire point of streaming.
 */
const BODY_MARKER = "<!--barq-body-->";

/**
 * A JSX shell cannot emit a doctype — it is not an element — so the handler
 * prepends it. TanStack does the same thing for the same reason:
 * `renderRouterToStream` puts `Solid.ssr('<!DOCTYPE html>')` ahead of the tree.
 */
const DOCTYPE = "<!doctype html>";

function wrapStream(
  stream: ReadableStream<Uint8Array>,
  options: PageHandlerOptions,
  chain: readonly Route[] | null,
  url: URL,
  /** Runs when the body is finished or abandoned — never before. */
  done: () => void,
  /** What a loader threw, read AFTER the render — see `redirectScript`. */
  answer: () => Response | null,
  /** The route-context handoff, which goes in the head like the preloads. */
  context: string,
): ReadableStream<Uint8Array> {
  const document = documentOf(options, {
    body: BODY_MARKER,
    seed: "",
    chain,
    // Before the shell flushes, which is the only moment it is worth anything:
    // the tags have to reach the browser ahead of the markup that needs them.
    preload: preloadTags(chain, options.routeAssets),
    context,
    url,
  });
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
      controller.enqueue(encoder.encode(await shellOf(options, head, url)));
      const reader = stream.getReader();
      try {
        for (;;) {
          const { done: finished, value } = await reader.read();
          if (finished) break;
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

/**
 * The route→action chain check, as the SERVER ENTRY exposes it to the build.
 *
 * WHY IT LIVES ON THE ENTRY. The check needs two things at once: the route
 * definitions with their `middleware` CLOSURES, and the registry those reachable
 * ids resolve against. Both exist only inside the built ssr bundle —
 * `resolve.noExternal` compiles `@barqjs/*` into it, so a Vite plugin importing
 * `@barqjs/start/server` would be asking a second, empty registry — and
 * `environment.runner` is a DEV environment's API, so `buildEnd` cannot run app
 * code either. What the build CAN do is import the bundle it just wrote, which
 * is what the prerenderer already does. So the entry exports this, and the build
 * calls it with the module-graph fact only the build has.
 *
 * Returns a report, or `""` when every reachable action carries its route's
 * chain. The caller decides whether that fails the build.
 */
export function chainVerifier(
  routes: readonly AnyRouteDefinition[],
): (reachability: Reachability) => Promise<string> {
  return async (reachability) => {
    const violations = await verifyRouteChains({ routes, reachability, lookup: mountedFn });
    return violations.length === 0 ? "" : describeViolations(violations);
  };
}

/**
 * Render the document: the root route's `shellComponent` around the matched chain.
 *
 * The shell is a component and the document is JSX, which is TanStack's
 * `shellComponent` and which replaces the string `document()` this had before.
 * What that buys is not tidiness: a template with six parts to place in the
 * right order had already grown one ordering trap — a document that shipped its
 * own `<title>` ahead of the route's made every route's title inert, because
 * `document.title` is the first title in tree order.
 */
export function renderShell(
  state: RouterState,
  shell: ((scope: Scope | null, props: { children: unknown }) => unknown) | undefined,
  assets: HeadAssets,
): unknown {
  const body = (): unknown => renderRoutes(state);
  if (shell === undefined) return body();
  const owner = getOwner();
  if (owner === null) return shell(null, { children: body });
  return provide(owner, HeadAssetsContext, cell(assets), (inner) =>
    shell(inner as Scope, { children: body }),
  );
}

/**
 * `loaderData` for `head` — NOT YET WIRED, and the reason is measured.
 *
 * TanStack's `projectLane` runs after a match's loader resolves, which is what
 * makes `head: ({ loaderData })` work. Reading a loader HERE does not: the
 * pre-shell phase is outside the render's async session, and a keyed value first
 * read outside one is "seeded into nobody" — `RouterState.prime` says so and the
 * suite proved it, `__BARQ_DATA__=({})` with the deferred value gone and the
 * client refetching everything the server had already fetched.
 *
 * The mechanism that closes it, named so the next pass starts from the design
 * rather than the symptom: project the head INSIDE the render session — either
 * by running `projectHead` under `setAsyncSession` with the session `renderPage`
 * made, or on `renderPage`'s SECOND pass, which already has every value settled
 * and reads them back from the session bucket rather than refetching.
 *
 * Until then `head` is a function of `{ params, matches, match }` and
 * `loaderData` is `undefined`. Narrower than TanStack's, and said out loud.
 */
function loaderDataFor(): undefined {
  return undefined;
}

/**
 * The root route's `shellComponent`, or `undefined` for a table with no shell.
 *
 * Only the root's is looked at, and the generator only emits one there:
 * `shellComponent` renders `<html>`, so a nested route declaring one would be a
 * second document inside the first.
 */
function shellComponentOf(
  routes: readonly AnyRouteDefinition[],
): ((scope: Scope | null, props: { children: unknown }) => unknown) | undefined {
  const declared = (routes[0] as { shellComponent?: unknown } | undefined)?.shellComponent;
  return typeof declared === "function"
    ? (declared as (scope: Scope | null, props: { children: unknown }) => unknown)
    : undefined;
}

/** `document()`, refused rather than defaulted when a table declares neither. */
function documentOf(options: PageHandlerOptions, parts: DocumentParts): string {
  if (options.document !== undefined) return options.document(parts);
  throw new Error(
    "[barq-router] this route table declares no `shellComponent` on its root route and no " +
      "`document` was passed. One of them has to say what the document is — prefer the shell: " +
      "`export const shellComponent = ({ children }) => <html>…<HeadContent /></html>`.",
  );
}

/**
 * The hydration seed, placed just before `</body>`.
 *
 * The ONE splice left, and it is in framework code rather than in a contract an
 * application has to satisfy. It cannot be a component: `renderPage` produces
 * the seed BY rendering, so nothing rendered during that render can emit it.
 * TanStack has the same seam and answers it the same way — their stream
 * transform holds everything from `</body>` so router scripts land before it.
 */
function withSeed(document: string, seed: string): string {
  if (seed === "") return document;
  const at = document.lastIndexOf("</body>");
  return at === -1 ? document + seed : document.slice(0, at) + seed + document.slice(at);
}

/**
 * Is this a crawler? `isbot`, which is what TanStack uses for the same decision.
 *
 * A bot gets the buffered arm: the whole page, with every loader settled, so a
 * route whose `head` reads `loaderData` produces the title the crawler indexes.
 */
function isCrawler(request: Request, options: PageHandlerOptions): boolean {
  const decide = options.bufferForCrawlers ?? true;
  if (decide === false) return false;
  if (typeof decide === "function") return decide(request);
  return isbot(request.headers.get("user-agent"));
}

/**
 * A streamed document that the SHELL produced, so there is nothing to wrap.
 *
 * `wrapStream`'s whole job was to cut a `document()` template in two and put the
 * body between the halves. A shell renders the document itself, so the stream is
 * already the response — this only appends what has to come after it.
 *
 * KNOWN LIMIT, and it is the one thing TanStack does that this does not: their
 * transform holds every byte from `</body>` so a boundary's swap script lands
 * inside the body. Here a swap that resolves after the render has walked past
 * `</body>` is emitted after `</html>`. Every browser tolerates it — React,
 * Solid and SvelteKit all ship it — and it is a transform's worth of work to
 * fix, so it is stated rather than hidden.
 */
function shellStream(
  stream: ReadableStream<Uint8Array>,
  options: PageHandlerOptions,
  url: URL,
  done: () => void,
  answer: () => Response | null,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let first = true;
  // Everything from `</body>` onward, HELD until the stream is finished.
  //
  // The shell is one chunk and it is a whole document, so piping it straight
  // through put every `<template>`, every swap script and every seed AFTER
  // `</html>`. Browsers reparent that into the body and it renders, which is why
  // it survived — but it is not a document, and it is the one thing `wrapStream`
  // has always got right for the `document()` path: it splits at its body marker
  // and emits the tail last. This is the same rule for the JSX shell.
  //
  // TanStack does it too, and says why:
  // `router-core/src/ssr/transformStreamWithRouter.ts` — "captured bytes from
  // `</body>` onward; must stay behind router scripts", and "router HTML would
  // put scripts after `</body>` or drop them silently".
  //
  // Not a growing buffer: what is held is a SUFFIX of the shell — `</body></html>`
  // and whatever the shell put between them — captured once and never appended to.
  let tail = "";
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = stream.getReader();
      try {
        for (;;) {
          const { done: finished, value } = await reader.read();
          if (finished) break;
          if (first) {
            first = false;
            let head = DOCTYPE + new TextDecoder().decode(value);
            if (options.transformShell !== undefined) {
              head = await options.transformShell(head, url);
            }
            // The LAST one: a `</body>` inside the page's own text is escaped,
            // but a shell is free to contain more than one element that ends in
            // one, and the document's is the final.
            const cut = head.lastIndexOf("</body>");
            if (cut !== -1) {
              tail = head.slice(cut);
              head = head.slice(0, cut);
            }
            controller.enqueue(encoder.encode(head));
            continue;
          }
          controller.enqueue(value);
        }
      } finally {
        reader.releaseLock();
      }
      const late = redirectScript(answer());
      if (late !== "") controller.enqueue(encoder.encode(late));
      if (tail !== "") controller.enqueue(encoder.encode(tail));
      controller.close();
      done();
    },
    cancel(reason) {
      void stream.cancel(reason);
      done();
    },
  });
}
