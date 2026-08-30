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
  each as ssrEach,
  ssrDynamic,
  ssrErrored,
  ssrLoading,
} from "@barqjs/server";
import { HYDRATE, type Block, type Scope, cell, getOwner, provide, untrack } from "@barqjs/core";
import { encodeSeed } from "@barqjs/server/codec";
import { isbot } from "isbot";

import type { Middleware } from "@barqjs/start";
import {
  applyResponseDraft,
  createResponseDraft,
  draftedStatus,
  peekResponseDraft,
  withRequest,
} from "@barqjs/start";
import { crossOriginRefused, mountedFn } from "@barqjs/start/server";
import { PRERENDER_HEADER } from "@barqjs/start/protocol";

import { errorFallbackFor, isNotFound, isRedirect } from "./errors.ts";
import { type ManagedTag, projectHead, tagKey, tagProps } from "./head.ts";
import {
  type Reachability,
  describe as describeViolations,
  verifyRouteChains,
} from "./manifest.ts";
import { memoryHistory, normalizeBase, stripBase } from "./history.ts";
import { type Match, createMatcher } from "./matcher.ts";
import { settle } from "@barqjs/core";
import { setAsyncSession } from "@barqjs/core/internal";

import { isNavigable } from "./path.ts";
import {
  type AnyRouteDefinition,
  type Route,
  type RouteHandler,
  type RouteMethod,
  flattenRoutes,
  preloadMatched,
} from "./route.ts";
import {
  type BeforeLoadResult,
  type Guard,
  type RouteDefaults,
  type RouterConfig,
  type RouterState,
  ROUTE_CONTEXT_GLOBAL,
  createRouter,
  resolveSsr,
} from "./router.ts";
import {
  type HeadAssets,
  EMPTY_CHILDREN,
  HeadAssetsContext,
  LinkBackendContext,
  NOT_FOUND,
  RouteMatchContext,
  RouterContext,
  routePropsFor,
} from "./components.ts";

/**
 * Render the matched chain through the STRING backend.
 *
 * `renderDepth` in `components.ts` is the DOM one — it calls `branch` and
 * `boundary`, which build nodes. The string backend has its own implementations
 * of the same constructs (`ssrLoading`), and one ABI means no fallback cliff:
 * every component is `(s, props) -> Out`, and `Out` is a string here.
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
  link: (
    href: string,
    className: string,
    children: unknown,
    extra?: Readonly<Record<string, string>>,
  ): unknown => {
    let attributes =
      `href="${escapeSsrAttribute(href)}"` +
      (className === "" ? "" : ` class="${escapeSsrAttribute(className)}"`);
    // The NAME is checked as well as the value: it comes from a prop key, and
    // an attribute name carrying a space or a quote would close the tag and
    // let the rest of the key be read as markup.
    for (const [name, value] of Object.entries(extra ?? {})) {
      if (!/^[a-zA-Z_:][\w:.-]*$/.test(name)) continue;
      attributes += ` ${name}="${escapeSsrAttribute(value)}"`;
    }
    return ssrHtml(`<a ${attributes}>${esc(children)}</a>`);
  },
};

export function renderRoutes(state: RouterState): unknown {
  const chain = state.chain();

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
    if (route === undefined) {
      // AN UNMATCHED LOCATION, at depth 0, renders what the DOM path renders.
      //
      // `renderRoutes` used to return an empty string before it built any
      // region at all, while `renderDepth` built `config.notFound` — or a
      // `404 - Not Found` text node — inside the range structure every depth
      // writes. So every unmatched URL served an empty `#app` and then asked
      // the client to hydrate a tree that was not there. The client threw the
      // server's document away and rendered the whole page cold over it, which
      // on a real browser killed the tab.
      //
      // Reached through the ordinary depth walk rather than short-circuited, so
      // the ranges the client claims are the ranges the server wrote.
      if (!untrack(state.missed) || depth !== chain.length) return ssrHtml("");
      const fallback = state.config.notFound;
      // `<p>` with the text inside it, matching the template the DOM path
      // builds — same element, same hole, so the client claims rather than
      // rebuilds.
      // The same element and the same STATIC text the DOM template holds, so
      // the client claims it rather than rebuilding a range around it.
      if (fallback === undefined) return ssrHtml(`<p>${esc(NOT_FOUND)}</p>`);
      return (fallback as unknown as (s: unknown, p: unknown) => unknown)(
        getOwner(),
        routePropsFor(state, 0, null, EMPTY_CHILDREN),
      );
    }

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

export { NOT_FOUND, NotFound, REDIRECT, Redirect, errorFallbackFor, isNotFound, isRedirect, notFound, redirect } from "./errors.ts";

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
  /** The route table, as `routeTree.gen.ts` exports it. */
  readonly routeTree: readonly AnyRouteDefinition[];
  /**
   * The path the application is mounted under, matching `RouterConfig`'s.
   *
   * Stripped from the request before anything matches, so every route pattern
   * and every route HANDLER is written in application space. The client half
   * has to be given the same value; `barqStart` passes one through to both.
   */
  readonly basepath?: string;
  /** The router's per-route defaults, matching `RouterConfig`'s. */
  readonly defaults?: RouteDefaults;
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

  /**
   * Route id -> the stylesheets that route's chunks import, from
   * `virtual:barq-route-assets`.
   *
   * A separate map from {@link routeAssets} because it produces a different
   * tag: `rel="stylesheet"`, which BLOCKS the first paint, against
   * `rel="modulepreload"`, which does not. Without it a code-split route's CSS
   * only arrives when `__vitePreload` inserts it ahead of the chunk, so the
   * server-rendered markup paints unstyled first — the exact flash a server
   * render exists to remove, and the one the goober `<style>` tag used to
   * cover.
   */
  readonly routeCss?: Readonly<Record<string, readonly string[]>>;

  /**
   * The framework's collected stylesheet, read PER REQUEST.
   *
   * A thunk rather than a string, and that is the whole point: in dev the
   * compiler hands each module its rules at evaluation, so the sheet grows as
   * modules load and a value captured when the handler was built is the sheet
   * as it stood before the first route was reached.
   *
   * Supplied by `@barqjs/start`'s server entry, which is what owns the
   * dependency on `@barqjs/css`. A production build leaves it unset and links
   * assets instead.
   */
  readonly inlineCss?: () => string;

  /**
   * The rules THIS request's render registered, read at `<Scripts />`.
   *
   * Separate from {@link inlineCss} because the two have different lifetimes: a
   * module-scope rule belongs to every request and a rule a component body
   * registers belongs to one. Read after the body renders, which is the only
   * moment it is complete — `<head>` has long since flushed.
   */
  readonly requestCss?: () => string;

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
  /**
   * Render pages. On by default.
   *
   * Off leaves the route HANDLERS — an application whose pages are rendered in
   * the browser still has its API routes and its server functions here, and
   * only the document moves. A page GET then answers 404, which is what lets
   * `serveBarq`'s `spa` fall back to the built `index.html`.
   *
   * Without this, `barqStart({ pages: false })` still generated a page handler
   * and every page request died on "this route table declares no
   * `shellComponent`" — an SPA has no shell by construction, so the mode was
   * unreachable in a build however it was configured.
   */
  readonly pages?: boolean;
}

/**
 * Build the `fetch` half of a barq server.
 *
 * Pass it as `serveBarq({ fetch })`. Server functions are matched FIRST there,
 * which is deliberate: their URL is reserved, and a page handler that also
 * answered it would turn a mutation into an HTML response.
 */
/**
 * A route's own HTTP handlers — barq's API routes.
 *
 * Not a second route system: `server.handlers` is an option on an ordinary
 * route, so `/api/users` is a file under `src/routes` like any other and a
 * route may serve BOTH a page and an endpoint. TanStack's arrangement, and
 * their dispatch rules, which are worth having for the reasons each one states.
 */

/** The `Allow` header for a route, so a 405 says what it WOULD accept. */
function allowHeader(match: Match<Route> | null): string {
  const handlers = handlersOf(match);
  if (handlers === undefined) return "GET, HEAD";
  const named = Object.keys(handlers).filter((method) => method !== "ANY");
  // `ANY` accepts everything, so listing the named ones would understate it.
  if (handlers.ANY !== undefined) return [...new Set([...named, "GET", "HEAD"])].join(", ");
  const withHead = named.includes("GET") && !named.includes("HEAD") ? [...named, "HEAD"] : named;
  return withHead.length === 0 ? "GET, HEAD" : withHead.join(", ");
}

function handlersOf(
  match: Match<Route> | null,
): Partial<Record<RouteMethod, RouteHandler>> | undefined {
  return match?.route.chain.at(-1)?.definition.server?.handlers as
    | Partial<Record<RouteMethod, RouteHandler>>
    | undefined;
}

/**
 * Run the matched route's handler for this method, or answer `null`.
 *
 * `null` means "not mine" and the page render continues — which covers three
 * cases that must stay distinguishable: no route matched, the route declares no
 * handler for this method, and the handler ran and DECLINED by returning
 * `undefined`. The third is what lets one route answer JSON to a `fetch` and
 * render a page for a browser.
 */
async function runRouteHandlers(
  request: Request,
  url: URL,
  match: Match<Route> | null,
  refuse?: string,
): Promise<Response | null> {
  const handlers = handlersOf(match);
  if (handlers === undefined || match === null) return null;

  const method = request.method.toUpperCase() as RouteMethod;
  // RFC 9110 §9.3.2: HEAD must answer with the same header fields as GET, so a
  // route with a GET and no HEAD gets one for free, and its body is stripped
  // below rather than sent. Theirs resolves it in the same order.
  const handler =
    method === "HEAD"
      ? (handlers.HEAD ?? handlers.GET ?? handlers.ANY)
      : (handlers[method] ?? handlers.ANY);
  if (handler === undefined) return null;
  const headFallback = method === "HEAD" && handlers.HEAD === undefined;

  // CSRF, BEFORE the middleware and before the body is read. A forged request
  // must cost nothing and reach nothing — refusing after a middleware has
  // already touched a database is a refusal that still did work for the
  // attacker.
  const server = match.route.chain.at(-1)?.definition.server;
  if (server?.csrf !== false && crossOriginRefused(request, server?.allowedOrigins)) {
    return new Response("forbidden", { status: 403 });
  }

  // INHERITED, outermost first: a middleware on `/api` covers everything under
  // it, which is the only way a rate limit or an auth check is declared once.
  const chain: Middleware[] = [];
  for (const route of match.route.chain) {
    for (const one of route.definition.server?.middleware ?? []) chain.push(one);
  }

  const draft = createResponseDraft();
  const context: Record<string, unknown> = {};
  const run = async (): Promise<Response | undefined> =>
    handler({
      request,
      params: match.params,
      pathname: url.pathname,
      context,
    });

  let answered: Response | undefined;
  try {
    answered = await withRequest(
      request,
      async () => {
        let index = 0;
        const next = async (step?: {
          readonly context?: Record<string, unknown>;
        }): Promise<unknown> => {
          if (step?.context !== undefined) Object.assign(context, step.context);
          const middleware = chain[index++];
          return middleware === undefined ? run() : middleware(next);
        };
        return (await next()) as Response | undefined;
      },
      // The PRERENDER REFUSAL reaches a handler too. A build mints the
      // `Request`, so `getRequest()` inside one would answer with the build
      // machine's headers and a cookie jar that is empty for everyone — the
      // same trap the page render already refuses, and a handler is if anything
      // likelier to read a header than a component is.
      { refuse, response: draft },
    );
  } catch (error) {
    // A middleware refuses by throwing a `Response`, exactly as a server
    // function's does — one convention, because one closure guards both.
    const thrown = asResponse(error);
    if (thrown === null) throw error;
    return applyResponseDraft(thrown, draft);
  }

  // DECLINED. The handler ran, looked at the request and said "not me", so the
  // page render is still the answer.
  if (answered === undefined) return null;

  const merged = applyResponseDraft(answered, draft);
  if (!headFallback) return merged;
  // §9.3.2 again: the same headers, no body.
  return new Response(null, {
    status: merged.status,
    statusText: merged.statusText,
    headers: merged.headers,
  });
}

export function createPageHandler(
  options: PageHandlerOptions,
): (request: Request) => Promise<Response> {
  const matcher = createMatcher(flattenRoutes(options.routeTree));

  const base = options.basepath === undefined ? "" : normalizeBase(options.basepath);

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    // APPLICATION SPACE from here down. Everything after this line — the
    // matcher, the route handlers, the router state the render is given — sees
    // the path as if the application owned the origin, which is what lets a
    // route file be written without knowing where it was deployed.
    //
    // A request OUTSIDE the base is not this application's: answering it would
    // mean `/other/about` rendering the page `/about` does, from a path the
    // deployment never claimed.
    const inside = base === "" || url.pathname === base || url.pathname.startsWith(`${base}/`);
    if (!inside) return new Response("not found", { status: 404 });
    const pathname = base === "" ? url.pathname : stripBase(url.pathname, base);
    if (base !== "") url.pathname = pathname;
    const match = matcher.match(pathname);

    // A ROUTE'S OWN HANDLER ANSWERS FIRST, and before the method gate, because
    // the whole point of one is to answer a `POST` that a page never could.
    const handled = await runRouteHandlers(request, url, match, options.refuseRequest);
    if (handled !== null) return handled;

    // AFTER the handlers, so an API route still answers, and before the method
    // gate, so a POST to a path with no handler is a 404 rather than a 405 for
    // a page that does not exist here.
    if (options.pages === false) return new Response("not found", { status: 404 });

    // A page is a GET. Nothing upstream filters the method — Vite's dev
    // middlewares check none of them and `serveBarq` matches server functions
    // and then falls through — so without this a `POST /users/7` ran every
    // `beforeLoad`, every loader and every server function a loader calls, and
    // answered with an HTML document.
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("method not allowed", {
        status: 405,
        headers: { allow: allowHeader(match) },
      });
    }

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
    // request. A module-level "current answer" hands one request's to the next.
    let answer: Response | null = null;
    // `notFound()` is an ANSWER, not a failure: the page still renders (its
    // `notFoundComponent` does), and what changes is the status. Tracked
    // separately from `answer` for that reason — turning it into a `Response`
    // here would discard the markup the render just produced.
    let missing = false;
    const config: RouterConfig = {
      routeTree: options.routeTree,
      beforeEach: options.beforeEach,
      basepath: options.basepath,
      defaults: options.defaults,
      history: memoryHistory({ initial: [pathname + url.search] }),
      onLoaderError(error) {
        if (isNotFound(error)) missing = true;
        answer ??= asResponse(error);
      },
    };

    // Rule 2. The whole render, including every loader and every server
    // function a loader calls, runs with this request ambient.
    // The draft a loader, a `beforeLoad` or a route handler writes to through
    // `setCookie` / `setResponseHeader`. Held here, outside the render, because
    // the response is built after all of them have run — and because a STREAMED
    // response is handed back before its body exists, so the draft has to be
    // read at the moment the `Response` is constructed and not later.
    const draft = createResponseDraft();
    try {
      return await withRequest(
        request,
        async () => {
          const state = createRouter(config);
          // HOISTED, and the hoist is the fix rather than a tidy-up.
          //
          // This used to be declared just above the render, which left
          // everything between here and there — `runBeforeLoad`,
          // `preloadMatched`, `projectHead`, `contextScript`, `preloadTags` —
          // outside any guard. `projectHead` swallows a PER-ROUTE failure
          // (correct, and what `projectLane` does), but a rejection from the
          // `Promise.all` itself escaped, and so did a `lazy()` chunk that
          // failed to import. The request's whole router state leaked with it:
          // its history subscription, its loader cache, every in-flight cell.
          let disposed = false;
          const dispose = (): void => {
            if (disposed) return;
            disposed = true;
            state.dispose();
          };
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
            dispose();
            if (isNotFound(error)) return html("not found", 404);
            const early = asResponse(error);
            // THE DRAFT RIDES THE EARLY RETURN, and this is the login shape:
            // a `beforeLoad` that authenticates seats the session cookie and
            // THEN redirects. Returning the redirect bare dropped the cookie and
            // sent a user who is somehow still signed out — with the redirect
            // making it look as though it had worked.
            if (early !== null) return applyResponseDraft(early, draft);
            throw error;
          }
          // THE GUARD STARTS HERE, not at the render. Everything from this
          // point to the handover — the chunk imports, the head projection, the
          // asset tags — can throw, and a throw that skips `dispose` leaks the
          // request's whole router state.
          // THE GUARD STARTS HERE, not at the render. Everything from this
          // point to the handover — the chunk imports, the head projection, the
          // asset tags — can throw, and a throw that skips `dispose` leaks the
          // request's whole router state.
          try {
            state.setContexts(before.contexts);
            // The matched chain's MODULES, before the render.
            //
            // Every route a file-based table generates is `lazy()`, and a cold
            // cell throws `NotReadyError` — which the depth's boundary parks on.
            // Parking resumes once the import lands, and only THEN is the next
            // depth constructed, so a chain of N costs N import round trips one
            // after another. Awaiting here costs the same imports in ONE round.
            //
            // THE REASON THIS COMMENT USED TO GIVE IS STALE, and the measurement
            // it carried belongs to it: the non-streamed arm rendered exactly
            // TWICE, so a two-deep chain resolved its layout on the second pass
            // and its leaf on a third that never came — measured on the reference
            // application as a prerendered page with a nav and no content. That
            // pass is gone (`@barqjs/server`'s `renderPage` parks and resumes
            // like the stream), so the cost is now latency rather than a
            // truncated page. Preloading is right either way.
            await preloadMatched(match?.route.chain ?? []);
            // Decided BEFORE the head is projected, because it is what decides
            // whether `head` sees `loaderData` at all.
            const buffered = options.stream === false || isCrawler(request, options);
            const shell = shellComponentOf(options.routeTree);
            // `projectLane`, in the same pre-shell phase. Every route's `head` and
            // `scripts` run here with the params, the context and whatever
            // `loaderData` has already settled — which on a streamed page is
            // nothing, and on a buffered one is everything. `preloadMatched` has
            // just imported every module they live in.
            const chain = match?.route.chain ?? [];
            const params = match?.params ?? {};
            // THE LANE BREAKS AT `ssr: false`, and it is theirs rather than an
            // invention: `projectLane` runs the match's own `head` and THEN
            // `if (match.ssr === false || …) break`
            // (`router-core/src/load-server.ts:651-653`). So a route that opts out
            // still contributes its own tags — with whatever context and
            // `loaderData` exist, which for it is none, since its `beforeLoad` and
            // its loader were both skipped — and nothing BELOW it contributes any,
            // because the server rendered none of those routes.
            //
            // Mapping the whole chain, which is what this did, shipped a head
            // describing markup the document does not contain.
            // ONE session for the whole request, minted here rather than inside
            // the renderer, so that a loader awaited to give `head` its
            // `loaderData` is attributed to the SAME bucket the render seeds
            // from. A value first read under a different session is seeded into
            // nobody — measured previously as `__BARQ_DATA__=({})` with the
            // client refetching everything the server had already fetched.
            const session = Symbol("page-session");
            const restore = setAsyncSession(session);
            const modes = resolveSsr(chain, options.defaults?.ssr ?? true);
            const projected: { route: Route; ssr: boolean }[] = [];
            for (const [depth, route] of chain.entries()) {
              // `ssr: false` means NOTHING of this route runs on the server, so
              // its head runs (theirs does too) but its loader must not be
              // awaited for one — awaiting it is the single fetch `ssr: false`
              // exists to prevent, and it would seed a value the client is
              // supposed to fetch for itself. Caught by falsifying the fast-path
              // gate, which turned three `ssr` tests red at the same time.
              projected.push({ route, ssr: modes[depth] !== false });
              if (modes[depth] === false) break;
            }
            const assets = await projectHead(
              await Promise.all(
                projected.map(async ({ route, ssr }) => ({
                  params,
                  // A FUNCTION head is the signal that this route's loader must
                  // settle before the head is serialized — and the ONLY signal,
                  // because a `head` written as a plain object cannot read data
                  // and so must never cost a wait.
                  //
                  // MEASURED, on a 300 ms loader: an object head streams its
                  // first byte at 5 ms, a function head at 301 ms. Theirs waits
                  // for the whole matched chain on every page, so a static
                  // title pays there and does not here.
                  loaderData:
                    ssr && typeof route.definition.head === "function"
                      ? await settleLoader(state, route, params, session)
                      : undefined,
                  definition: route.definition as never,
                })),
              ),
              // `console.error` and a rendered page, which is what `projectLane`
              // does with the same failure: a broken `head` costs that route its
              // tags, never the document.
              { nonce: options.nonce, onError: (error) => console.error(error) },
            );
            setAsyncSession(restore);
            const context = contextScript(url, before.produced, options.nonce);
            const preloads = chainFiles(match?.route.chain ?? null, options.routeAssets);
            const preload = preloadTags(match?.route.chain ?? null, options.routeAssets);
            const headAssets: HeadAssets = {
              matches: assets,
              nonce: options.nonce,
              // The entry's stylesheets plus the matched chain's. The entry
              // carries only what its own static graph imports, which for a
              // route-split application is usually nothing at all.
              clientAssets: {
                ...options.clientAssets,
                css: [
                  ...(options.clientAssets?.css ?? []),
                  ...chainFiles(match?.route.chain ?? null, options.routeCss),
                ],
              },
              inlineCss: options.inlineCss?.(),
              // This request's own rules, and no other request's. Read at
              // `<Scripts />`, after the body — the only moment it is complete.
              lateCss: () => options.requestCss?.() ?? "",
              preloads,
              preload,
              // The string backend's own renderer, handed over the way
              // `LinkBackend` is: `HeadContent` and `Scripts` live in the
              // ISOMORPHIC entry because the ROOT ROUTE MODULE — which is where a
              // shell is declared — ships to the browser. Importing
              // `@barqjs/router/server` from it drags `node:async_hooks` into the
              // client bundle, and Vite answers that with "Module has been
              // externalized for browser compatibility" and an empty page.
              raw: (markup: string) => ssrHtml(markup),
              // The string backend's list primitive, handed over the same way
              // `raw` is. Keyed, so the two backends reconcile the same way and a
              // navigation reuses the tag it already has rather than replacing it.
              // NO range comments. The DOM side builds these with `element()`,
              // which claims the next node by TAG rather than by a delimited
              // range — so the wire carries the tags and nothing else, and the
              // enclosing `<head>` claim walks straight through them.
              tagTree: (scope, list) =>
                ssrEach(
                  scope,
                  null,
                  null,
                  list as never,
                  (tag: ManagedTag, index: number) => tagKey(tag, index),
                  (rowScope: Scope | null, tag: () => ManagedTag, index: () => number) =>
                    ssrDynamic(rowScope, {
                      component: tag().tag,
                      ...tagProps(tag(), index()),
                    }),
                ),
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
            if (buffered) {
              // `renderPage`, not `renderToString`: the sync one does not await an
              // async value, so every loader on the page would render as its
              // fallback and the seed would be empty. Measured on exactly that
              // mistake — a server function's result stringified as
              // "[object Promise]" and its handler ran detached from the render.
              const page = await renderPage(() => root() as never, {
                nonce: options.nonce,
                session,
              });
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
                    : DOCTYPE + withSeed(page.html, context + page.script),
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
              session,
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
                : shellStream(stream, options, url, dispose, () => answer, context),
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
        { refuse: options.refuseRequest, response: draft },
      );
    } catch (error) {
      const thrown = asResponse(error);
      // A `beforeLoad` that sets a cookie and THEN redirects keeps the cookie —
      // which is the whole shape of a login: authenticate, seat the session,
      // send the browser on. Dropping it would redirect a user who is somehow
      // still signed out.
      if (thrown !== null) return applyResponseDraft(thrown, draft);
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
  if (isRedirect(error)) return redirectResponse(error.to, error.status);
  return null;
}

function redirectResponse(to: string, status: number): Response {
  if (!isNavigable(to)) {
    // Inert in a 302, but this is the one place both arms can share a rule, and
    // a `Location: javascript:…` on the wire is a smell whatever the browser
    // does with it. See `isNavigable`.
    reportRefusedRedirect(to);
    return new Response("bad redirect", { status: 500 });
  }
  return new Response(null, { status, headers: { location: to } });
}

/**
 * A redirect target barq will not send a browser to.
 *
 * Reported rather than swallowed: it means an application forwarded something
 * into `redirect()` that it did not check, and silence there is how it stays
 * unchecked.
 */
function reportRefusedRedirect(to: string): void {
  console.error(
    `[barq-router] refused to redirect to ${JSON.stringify(to)}: only a path or an http(s) URL ` +
      "is navigable. A `javascript:` target EXECUTES when a streamed redirect replays it in the " +
      "browser, so this is cross-site scripting rather than a broken link — check whatever " +
      "produced it.",
  );
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
  // THE ESCALATION THIS PREVENTS: a 302 to `javascript:…` is inert, and
  // `location.replace("javascript:…")` executes — measured in Chrome. A
  // streamed redirect has to be the second one, so it has to check.
  if (!isNavigable(to)) {
    reportRefusedRedirect(to);
    return "";
  }
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
 * One matched chain's files, from a per-route map, deduplicated in chain order.
 *
 * Outermost first, because that is the order the browser will need them in: a
 * layout's chunk is parsed before the route it wraps. Duplicates are dropped
 * rather than emitted twice — a shared chunk appears in several routes' asset
 * lists by construction.
 *
 * Both per-route maps the build produces have this shape, so both go through
 * here: `routeAssets` for the modulepreloads and `routeCss` for the
 * stylesheets. It was `preloadFiles` while there was only one.
 */
export function chainFiles(
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
  for (const file of chainFiles(chain, assets)) {
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
 * once on any real server. A module-level "current request" hands one request's
 * URL to another, for the sake of one string.
 */
async function shellOf(options: PageHandlerOptions, shell: string, url: URL): Promise<string> {
  return options.transformShell === undefined ? shell : await options.transformShell(shell, url);
}

/**
 * A page response, carrying whatever the request drafted.
 *
 * ONE place, because every page answer this handler builds goes through it —
 * the rendered document, the 404, the buffered arm. A merge at each of those
 * would be three places to forget.
 *
 * `status` here is a FALLBACK: `setResponseStatus(403)` from a `beforeLoad` on
 * a page that renders fine is the deliberate case, and the caller's `missing
 * ? 404 : status` still wins when nothing drafted one.
 */
function html(body: string, status: number, extra?: Record<string, string>): Response {
  const draft = peekResponseDraft();
  const response = new Response(body, {
    ...draftedStatus(draft, status),
    headers: { "content-type": "text/html; charset=utf-8", ...extra },
  });
  return applyResponseDraft(response, draft);
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
 * What a server entry is, once the build has supplied the parts.
 *
 * All three hang off ONE object because a default export is the only thing a
 * one-line entry can provide, and the build needs all three: `createFetch` for
 * the prerenderer's non-streaming twin, `verifyChains` for the route-action
 * check. As named module exports they had to be written out by hand, which is
 * what made a hand-written entry a transcription of the generated one.
 */
export interface StartHandler {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly createFetch: (
    extra?: Partial<PageHandlerOptions>,
  ) => (request: Request) => Promise<Response>;
  readonly verifyChains: (reachability: Reachability) => Promise<string>;
}

/**
 * The whole server entry, as one call.
 *
 * `export default createStartHandler()` is the entire file, generated or
 * hand-written. That is TanStack's shape, whose own default entry names no
 * manifest, no assets and no route tree, and it is why THIS function holds the
 * build artefacts.
 *
 * WHAT IS AND IS NOT A VIRTUAL MODULE HERE. `virtual:barq-route-assets`,
 * `virtual:barq-client-assets` and `virtual:barq-server-fns` are things the
 * build synthesises and no author could write, so they are virtual and they are
 * imported here rather than by an application. `#barq-router-entry` is an ALIAS
 * to the project's own `src/router.ts` — a real file, importing
 * `./routeTree.gen` by a plain relative path. The route table is not hidden
 * behind a specifier only the bundler can resolve; that is theirs too.
 *
 * The imports are DYNAMIC and the handler is built on first request. Two
 * reasons, both load-bearing: this package's own suite imports this module with
 * no Vite plugin anywhere, so a static import would fail to resolve at load; and
 * `clientAssets` is only final after the client build, so reading it at module
 * scope reads the dev placeholder in a production bundle.
 *
 * `chainVerifier`'s own note explains why the check has to run from inside the
 * ssr bundle rather than from a Vite plugin. It still does: `resolve.noExternal`
 * compiles `@barqjs/*` into that bundle, so this module and the registry it asks
 * are the same copy. Being in APPLICATION source was never what made that work.
 */
export function createStartHandler(extra: Partial<PageHandlerOptions> = {}): StartHandler {
  let parts: Promise<PageHandlerOptions> | undefined;
  const app = (): Promise<PageHandlerOptions> => {
    parts ??= (async (): Promise<PageHandlerOptions> => {
      const [{ config }, { routeAssets, routeCss }, { clientAssets }] = await Promise.all([
        import("#barq-router-entry"),
        import("virtual:barq-route-assets"),
        import("virtual:barq-client-assets"),
      ]);
      // MOUNTS every server function the build found. Importing it is what
      // gives each one a URL — without it `/_barq/fn/<id>` 404s for all of them,
      // and `verifyChains` has an empty registry to ask.
      await import("virtual:barq-server-fns");
      return {
        ...config,
        routeAssets,
        routeCss,
        clientAssets,
        app: (state: RouterState): unknown => renderRoutes(state),
      };
    })();
    return parts;
  };

  const createFetch = (
    more: Partial<PageHandlerOptions> = {},
  ): ((request: Request) => Promise<Response>) => {
    let handler: ((request: Request) => Promise<Response>) | undefined;
    return async (request: Request): Promise<Response> => {
      handler ??= createPageHandler({ ...(await app()), ...extra, ...more });
      return handler(request);
    };
  };

  return {
    fetch: createFetch(),
    createFetch,
    verifyChains: async (reachability) => chainVerifier((await app()).routeTree)(reachability),
  };
}

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
  routeTree: readonly AnyRouteDefinition[],
): (reachability: Reachability) => Promise<string> {
  return async (reachability) => {
    const violations = await verifyRouteChains({ routeTree, reachability, lookup: mountedFn });
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
  // THE CHILDREN ARE BUILT FIRST, and the shell is wrapped around the result.
  //
  // `<head>` comes before `<body>` in the shell's own markup, so a shell that
  // built its head first serialised it before the routes had rendered — and
  // anything the routes REGISTER while rendering was therefore missing from it.
  // Measured on the reference application: `<style id="_goober">` shipped one
  // of the twenty-one classes the body used and none of the global rules, so
  // the first paint was unstyled and the page flashed white until the client
  // regenerated the sheet. A runtime CSS-in-JS sheet is the case that makes
  // this visible; it is true of anything a route registers during construction.
  //
  // React's server integrations invert the same way and for the same reason:
  // render the app, then build the document around what it produced.
  //
  // WHAT THIS COSTS is the one thing worth naming: a context the SHELL provides
  // no longer wraps the routes, because they are constructed before it runs.
  // `renderShell` provides `HeadAssetsContext` itself, outside the shell, so
  // `<HeadContent />` is unaffected; the router's own context is provided at
  // depth 0 inside `renderRoutes`. A shell that wants to provide something to
  // the routes has to do it in the ROOT ROUTE's component, which is where a
  // layout's providers belong anyway.
  const build = (inner: Scope | null): unknown => {
    const rendered = body();
    return shell(inner, { children: () => rendered });
  };
  if (owner === null) return build(null);
  return provide(owner, HeadAssetsContext, cell(assets), (inner) => build(inner as Scope));
}

/**
 * Settle one route's loader, inside the session the render will use.
 *
 * `settle(session)` is the primitive and the session argument is the whole
 * reason this works: it waits for the fetches attributed to THIS request and
 * not for whatever else the process has in flight. A poll loop was the first
 * spelling and it was wrong twice over — it burns wall clock in 5 ms steps, and
 * it cannot tell "still loading" from "settled to undefined".
 *
 * The read is BLOCKING (`dataFor(…, true)`): on the string backend a `latest()`
 * read of a cold cell answers `undefined` rather than parking, so a non-blocking
 * read would start nothing and settle nothing.
 */
async function settleLoader(
  state: RouterState,
  route: Route,
  params: Readonly<Record<string, string>>,
  session: symbol,
): Promise<unknown> {
  const loaded = state.dataFor(route, params, true);
  try {
    loaded();
  } catch {
    // `NotReadyError` is the point: the read STARTED the fetch. Anything else a
    // cold cell throws is the loader's own failure, which the render will throw
    // again with a boundary to catch it — swallowing it here is what keeps this
    // from turning a route error into a request error.
  }
  await settle(session);
  try {
    return loaded();
  } catch {
    // Still not ready, or failed. The head goes without it rather than the
    // request failing over a title.
    return undefined;
  }
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
  /**
   * The `beforeLoad` handoff, placed where the seed is rather than in `<head>`.
   *
   * `<head>` is rendered by `<HeadContent />` and the document is HYDRATED, so
   * every node in it has to be one the client's tree produces. The handoff is a
   * server-computed string with no client counterpart, so it cannot be one —
   * and it does not need to be: it is read by the boot, which runs at the end of
   * the body, so anywhere before that will do.
   */
  context: string,
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
      if (context !== "") controller.enqueue(encoder.encode(context));
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
