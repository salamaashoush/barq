/**
 * The components, on the primitive ABI the compiler emits.
 *
 * Written against `branch`/`boundary`/`provide` directly rather than authored in
 * JSX, so there is one implementation in an application bundle and in this
 * package's own tests. `packages/extra/src/router.ts` does the same and for the
 * same reason.
 *
 * Two shapes are load-bearing and neither is React's:
 *
 *  - **`(scope, props)`.** Every component and every Block. The scope is first
 *    and is not optional.
 *  - **`children` is a Block**, so a layout CONSTRUCTS the next route inside its
 *    own scope. A provider or a boundary a layout installs is therefore visible
 *    to the route it wraps, which an outlet cannot do.
 */

import {
  type Block,
  type Child,
  type JSXElement,
  type Cell,
  type Scope,
  type Incoming,
  HYDRATE,
  bindProp,
  block,
  boundary,
  branch,
  cell,
  context,
  effect,
  element,
  insert,
  listen,
  onCleanup,
  props as sources,
  provide,
  read,
  readSlot,
  setAttr,
  signal,
  setClass,
  template,
  untrack,
  WHOLE,
} from "@barqjs/core";

import {
  type ManagedTag,
  projectHead,
  renderTags,
  resolveHead,
  resolveScripts,
  styleText,
  tagProps,
} from "./head.ts";
import type { JSX as CoreJSX } from "@barqjs/core/jsx-runtime";
import type { ToPath } from "./register.ts";
import { type RouterState, createRouter } from "./router.ts";
import { type Route, type RouteProps } from "./route.ts";
import { NotFound, errorFallbackFor } from "./errors.ts";
import { addBase } from "./history.ts";
import {
  applyTrailingSlash,
  interpolate,
  isUnder,
  leavesTheApp,
  resolvePath,
  withoutTrailingSlash,
} from "./path.ts";

/** The real ABI. `RouteComponent` is declared props-first for TypeScript's sake. */
type Invoked = (scope: Scope | null, props: RouteProps) => unknown;

const RouterContext = context<RouterState>(undefined, "barq-router");

/**
 * The string backend's own `Link` and `NavLink`, installed by `renderRoutes`.
 *
 * This module builds DOM: `anchorElement` calls `template()` and `bindProp`,
 * which need a `document`. So until this existed, **no SSR'd page could contain
 * a link** — `<NavLink>` in a layout threw inside its own error boundary and the
 * page rendered empty. Every real application's layout has navigation in it,
 * which is how it was found: the first one.
 *
 * A CONTEXT rather than a `typeof document` test, because that test is wrong
 * here and the repo has already paid for learning it — happy-dom defines
 * `document` in exactly the process that renders the string backend. Each
 * backend knows which it is and says so, which is the same rule
 * `routePropsFor`'s `blocking` follows.
 *
 * It lives in `server.ts` because building the markup needs `@barqjs/server`,
 * and this module is the ISOMORPHIC entry — importing it here would put the
 * server runtime in the browser bundle.
 */
export interface LinkBackend {
  /**
   * `<ClientOnly>`, on the string backend.
   *
   * It cannot use the DOM `branch` — that renders nothing without a document —
   * and it must not simply emit the fallback either: the client builds a BRANCH
   * there, and a server that wrote no range is a tree the client cannot claim.
   * So the backend writes the same two-armed region with the first arm chosen,
   * which is the shape the client's first render produces.
   */
  readonly clientOnly?: (fallback: Block<unknown>, children: Block<unknown>) => unknown;
  readonly link: (
    href: string,
    className: string,
    children: unknown,
    /**
     * Everything the link did not interpret itself — `id`, `title`, `rel`,
     * `data-*`. The DOM path binds these onto the element; without them here
     * the SERVER wrote an anchor missing every one, so the markup a crawler and
     * a no-JS visitor see disagreed with the hydrated page.
     */
    attributes?: Readonly<Record<string, string>>,
  ) => unknown;
}

// `null` is the DEFAULT, not `undefined`: a context created with `undefined`
// has no default at all, and reading one nobody provided THROWS. The DOM path
// provides nothing here, so the default is the answer it gets.
export const LinkBackendContext = context<LinkBackend | null>(null, "barq-router-link");

/** `null` on the DOM path, which is every path but a string render. */
function linkBackend(): LinkBackend | null {
  return read(LinkBackendContext)();
}

/**
 * How `<HeadContent />` and `<Scripts />` reach the resolved tags.
 *
 * Provided by `renderShell` AROUND the shell, not by `renderRoutes` inside it:
 * the shell is what contains `<head>`, so a context provided at route depth 0
 * is below the component that needs it.
 *
 * `null` is the default and it is what the DOM path gets. On the client the
 * shell is never rendered — barq hydrates `#app`, not the document — so both
 * components render nothing there and a navigation's head is patched by
 * `installHead` instead. That is a divergence from TanStack, whose `HeadContent`
 * lives in the reactive tree and portals into `<head>`. It falls out of barq hydrating a container
 * rather than the document.
 */
export interface HeadAssets {
  readonly matches: readonly import("./head.ts").MatchAssets[];
  readonly nonce?: string;
  /** What the client build emitted: the entry scripts and its CSS. */
  readonly clientAssets?: {
    readonly scripts?: readonly string[];
    readonly css?: readonly string[];
  };
  /**
   * `<link rel="modulepreload">` for the matched chain, as HREFS.
   *
   * The tags themselves are built by `resolveHead` into the one managed list,
   * which is TanStack's shape and the only shape a hydrated `<head>` can have:
   * the claim takes an element's children WHOLE, so anything `<HeadContent />`
   * does not produce is reconciled away.
   */
  readonly preloads?: readonly string[];
  /**
   * The framework's collected stylesheet, as text. Dev and `bun test` deliver a
   * module's CSS to a registry rather than to an asset, because neither has a
   * bundle to emit one from; this is that registry, drained per request.
   */
  readonly inlineCss?: string;
  /**
   * Rules that registered AFTER the head was taken, read at `<Scripts />`.
   *
   * `<head>` renders before `<body>`, so a block evaluated during a component's
   * render — which is what an uncompiled `css` call is — cannot be in the head's
   * sheet. It was measured reaching no server-rendered page at all: `/css`
   * carried the class `rv14nqj` in its markup against a zero-byte sheet.
   *
   * Late is worse than early and better than never: those rules apply on parse
   * rather than before it. Compiling the block (BARQ015 names the fix) puts it
   * in the head instead.
   */
  readonly lateCss?: () => string;
  /** The same set rendered, for the `document()` template, which has no tree. */
  readonly preload?: string;
  /** The route-context handoff, already rendered. */
  readonly context?: string;
  /**
   * How this backend turns markup into an element.
   *
   * Still needed for the parts that are opaque strings on both sides — what the
   * `beforeLoad` handoff, which is a server-produced string on both sides.
   */
  readonly raw: (markup: string) => unknown;
  /**
   * How this backend renders the managed tags as a real, KEYED tree.
   *
   * TanStack's `HeadContent` is `tags.map(tag => <Asset {...tag} key={…} />)`
   * (`react-router/src/HeadContent.tsx:22-26`) — a tree, not a string, which is
   * what makes a navigation update the head through ordinary reactivity instead
   * of through a second mechanism that patches `document.head` behind the
   * render.
   *
   * It arrives through the CONTEXT for the reason `LinkBackend` does: this
   * module is the ISOMORPHIC entry and is hand-written rather than compiled, so
   * its own `each` would be the DOM one on both sides. The string backend has
   * `ssrFor`/`ssrDynamic` of its own, and each backend hands over the one that
   * is its.
   */
  readonly tagTree?: (scope: Scope | null, list: () => readonly ManagedTag[]) => unknown;
}

export const HeadAssetsContext = context<HeadAssets | null>(null, "barq-router-head");

/**
 * TanStack's `<HeadContent />`: every managed tag for the matched chain.
 *
 * Placed inside `<head>` in the shell. Renders the merged `meta`, `links`,
 * `styles` and head `scripts` from every route's `head`, plus the three things
 * the framework itself puts there — the modulepreloads for the matched chunks,
 * and the `beforeLoad` handoff.
 *
 * IT LIVES HERE, in the ISOMORPHIC entry, and that is not a filing decision. A
 * shell is declared in the ROOT ROUTE MODULE, and that module ships to the
 * browser like every other route module — so importing `@barqjs/router/server`
 * from it drags `node:async_hooks` into the client bundle. Vite answers with
 * "Module `node:async_hooks` has been externalized for browser compatibility",
 * the root route throws, and the page renders EMPTY. Measured on the reference
 * application. `HeadContent` in TanStack is `@tanstack/solid-router`, not their
 * server entry, for the same reason.
 *
 * So the markup builder arrives through the CONTEXT, exactly as `LinkBackend`
 * does, and for the same reason: each backend knows which it is and says so, rather than being
 * sniffed with `typeof document`.
 *
 * SERVER ONLY. There are no assets on the client — the shell is never rendered
 * there, because barq hydrates `#app` rather than the document.
 */
// The props parameter is never read; it is declared so JSX reads the FIRST
// parameter as the scope. `Outlet` carries the same note and the same reason.
export function HeadContent(scope: Scope | null, _props?: Record<string, never>): JSXElement {
  const assets = read(HeadAssetsContext)();
  if (assets === null) return null;
  const list = (): readonly ManagedTag[] =>
    resolveHead(assets.matches, {
      nonce: assets.nonce,
      preloads: assets.preloads,
      css: assets.clientAssets?.css,
      inlineCss: assets.inlineCss,
    });
  // A backend with no tree renderer gets the string it always got. That is the
  // `document()` template's path, which is markup and has nowhere to put a tree.
  if (assets.tagTree === undefined) {
    return assets.raw(renderTags(list()) + (assets.context ?? "")) as JSXElement;
  }
  // ONLY the managed tags. Everything else that used to be written here is
  // placed with the seed instead, because `<head>` is hydrated and every node
  // in it has to be one this tree produces.
  return assets.tagTree(scope, list) as JSXElement;
}

/**
 * TanStack's `<Scripts />`: the BODY scripts, plus the client entry.
 *
 * Last thing in `<body>`, which is where a module entry belongs — it is
 * deferred either way, and putting it there keeps it out of the parser's path.
 * The hydration seed is NOT here: it is produced BY the render, so nothing
 * rendered during that render can emit it, and the handler places it.
 */
export function Scripts(): JSXElement {
  const assets = read(HeadAssetsContext)();
  if (assets === null) return null;
  const nonce = assets.nonce === undefined ? "" : ` nonce="${escapeHeadAttribute(assets.nonce)}"`;
  const late = assets.lateCss?.() ?? "";
  return assets.raw(
    (late === "" ? "" : `<style id="barq-css-late"${nonce}>${styleText(late)}</style>`) +
      renderTags(resolveScripts(assets.matches, { nonce: assets.nonce })) +
      (assets.clientAssets?.scripts ?? [])
        .map((src) => `<script type="module"${nonce} src="${escapeHeadAttribute(src)}"></script>`)
        .join(""),
  ) as JSXElement;
}

/** Enough for a URL in an attribute: the four that can end it or open a tag. */
function escapeHeadAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * The DOM backend's `HeadAssets`, and the reason `installHead` is gone.
 *
 * The patcher wrote `document.head` from OUTSIDE the render: an effect ran
 * `projectHead`, awaited every route module, and then reconciled the document
 * by hand against an ownership attribute. Everything it did the render already
 * does — `<HeadContent />` is a keyed list, and a keyed list reuses the node it
 * already has, which is the whole of "reuse before replace".
 *
 * What survives from it is the ORDERING GUARD, because it is not a patcher
 * concern: `projectHead` awaits each route's module, so two navigations in
 * quick succession resolve on their own schedule and can finish out of order,
 * and the loser writing last leaves the document describing a page nobody is on.
 * Each run takes a token and writes only if it is still the newest.
 *
 * The resolved assets land in a SIGNAL, so the head is part of the render and a
 * navigation updates it in the same frame as the route content. The patcher
 * could not do that — it applied a tick late, and the tab title lagged one
 * navigation behind on every link.
 */
/**
 * The framework's own head tags, read back off the document the server sent.
 *
 * The client cannot be handed a manifest: the asset map of the client bundle
 * cannot live INSIDE the client bundle without changing the hashes it is a map
 * of. TanStack solves it by serialising the manifest into the page; barq does
 * not have to, because the server already wrote these tags and the parser has
 * already turned them into elements. Reading them back is the same information
 * with no second channel to keep in step.
 *
 * `getAttribute`, not `.href`: the property is absolutised against the document
 * and the attribute is what the server wrote, and only the second one round
 * trips into a tag that claims the node it came from.
 */
function assetsFromDocument(): {
  preloads: string[];
  css: string[];
  inlineCss: string;
  lateCss: string;
} {
  const preloads: string[] = [];
  const css: string[] = [];
  // The framework's own sheet, read back for the same reason the links are:
  // `<HeadContent />` is a KEYED list and the claim takes `<head>`'s children
  // whole, so a tag the server wrote and the client does not produce is
  // reconciled away. A server-only `<style>` there took the whole document with
  // it — `document.head` was null by the time this ran.
  const inlineCss = document.getElementById("barq-css")?.textContent ?? "";
  // `<Scripts />` writes the same shape at the end of `<body>`, and the same
  // rule applies: the client has to produce the tag the server did.
  const lateCss = document.getElementById("barq-css-late")?.textContent ?? "";

  /**
   * `document.head` is not a given, and the case where it is missing is the one
   * that matters most.
   *
   * A hydration mismatch recovers by clearing the container and rendering cold.
   * The container here is the DOCUMENT, so `clear` means
   * `documentElement.remove()` — and this function then runs, inside that
   * re-render, against a document with no head. Throwing turned a recoverable
   * mismatch into a destroyed page: the removal had already happened, the throw
   * aborted the render that was going to rebuild it, and every route in the
   * application ended as a bare doctype with no delegation and no bindings.
   *
   * Measured on `packages/kitchen-sink`: 12 of 13 routes, all with
   * `Cannot read properties of null (reading 'querySelectorAll')`. There is
   * genuinely nothing to read in that state — the server's tags are gone —
   * and an empty list is what "no server markup to read" means.
   */
  const head = document.head;
  if (head === null) return { preloads, css, inlineCss, lateCss };

  for (const link of head.querySelectorAll("link[rel]")) {
    const href = link.getAttribute("href");
    if (href === null) continue;
    const rel = link.getAttribute("rel");
    if (rel === "modulepreload") preloads.push(href);
    else if (rel === "stylesheet") css.push(href);
  }
  return { preloads, css, inlineCss, lateCss };
}

/**
 * This match's head assets, resolved.
 *
 * Exported because the BOOT has to await it before hydrating. The list is keyed,
 * so a first render with an empty list claims nothing and then replaces every
 * tag when the promise settles — measured as the server's `<title>` node being
 * thrown away while every other head node was claimed.
 */
export async function resolveHeadFor(
  state: RouterState,
): Promise<readonly import("./head.ts").MatchAssets[]> {
  // `state.chain()`, not `state.match()`. On an unmatched location the chain is
  // the ROOT route standing in, and the server renders its `head` — so reading
  // the match here gave the client an EMPTY head for every 404, and
  // `<HeadContent />` then reconciled away every tag the server had written.
  const match = state.match();
  const chain = state.chain();
  return projectHead(
    chain.map((route) => ({
      params: match?.params ?? {},
      loaderData: undefined,
      definition: route.definition as never,
    })),
  );
}

/**
 * What the SERVER wrote, captured at import.
 *
 * Not at render: hydration replaces the document before `Document()` runs, so a
 * read from inside it finds an empty `<head>` and every link, preload and style
 * the server placed is reconciled away — measured in a browser as a fully
 * server-rendered page hydrating to plain unstyled text, with no error of any
 * kind. The client bundle imports this module before it boots, which is the
 * last moment the document is still exactly what the server sent.
 */
const served =
  typeof document === "undefined"
    ? { preloads: [], css: [], inlineCss: "", lateCss: "" }
    : assetsFromDocument();

export function clientHeadAssets(
  state: RouterState,
  options: {
    readonly clientAssets?: HeadAssets["clientAssets"];
    readonly preloads?: readonly string[];
    readonly nonce?: string;
    /**
     * The framework's sheet. Defaults to what the SERVER wrote, read back out
     * of the document — `<HeadContent />` is a keyed list and the claim takes
     * `<head>`'s children whole, so a tag the server produced and the client
     * does not is reconciled away, and that one took the document with it.
     */
    readonly inlineCss?: string;
    /** What the boot already resolved, so the first render claims. */
    readonly initial?: readonly import("./head.ts").MatchAssets[];
  } = {},
): HeadAssets {
  const resolved = signal<readonly import("./head.ts").MatchAssets[]>(options.initial ?? []);
  let newest = 0;
  let first = options.initial !== undefined;
  effect(() => {
    // SUBSCRIBED, all three, so a navigation that keeps the same match still
    // re-runs — the head depends on the params and the contexts too.
    state.match();
    state.location();
    state.contexts();
    // The boot already resolved this one, and re-resolving it would replace
    // every tag the render just claimed.
    if (first) {
      first = false;
      return;
    }
    const mine = ++newest;
    void resolveHeadFor(state)
      .then((assets) => {
        if (mine === newest) resolved.set(assets);
      })
      // A `head` that throws must not become an unhandled rejection that
      // silently leaves the document describing the previous page.
      .catch((error: unknown) => console.error(error));
  });

  return {
    // A GETTER: `<HeadContent />` reads this inside the list's own effect, so
    // the head re-renders when a navigation resolves.
    get matches() {
      return resolved();
    },
    nonce: options.nonce,
    // The document's own stylesheets are UNIONED in, not replaced.
    //
    // `<HeadContent />` is a keyed list and the claim takes `<head>`'s children
    // whole, so every link the client does not produce is reconciled away.
    // `clientAssets.css` is the ENTRY chunk's CSS, which for a route-split
    // application is empty — so the per-route sheets the server linked were
    // removed the moment hydration ran, and the page rendered unstyled with no
    // error of any kind.
    clientAssets: {
      ...options.clientAssets,
      css: [...new Set([...(options.clientAssets?.css ?? []), ...served.css])],
    },
    inlineCss: options.inlineCss ?? served.inlineCss,
    lateCss: () => served.lateCss,
    preloads: options.preloads ?? served.preloads,
    raw: (markup: string) => {
      const host = document.createElement("template");
      host.innerHTML = markup;
      return [...host.content.childNodes];
    },
    // An ACCESSOR of elements, not an `each`.
    //
    // `each` claims through `claimAt(parent, anchor, …)`, and a hydrating list
    // therefore needs the element it sits in — which is why the compiler emits
    // `_$each(_s$, _el$2, _el$6, …)` with both. A hand-written component has
    // neither: it returns a value and the caller's `insert` decides where it
    // goes. Calling `each` with nulls claimed nothing and the enclosing WHOLE
    // claim then reconciled the server's whole head away.
    //
    // `element()` needs no position: it claims the next node by TAG, which is
    // the same path `<html>`, `<head>` and `<body>` already take. Returning a
    // function makes the caller's `insert` re-run it on a navigation, and
    // `insert` reconciles the array it produces.
    tagTree: (_scope, list) => () =>
      list().map((tag, index) => element(null, tag.tag, tagProps(tag, index))),
  };
}

/**
 * The DOCUMENT, on the client: the root route's shell with the app inside it.
 *
 * The server renders the shell through `renderShell`; this is the same tree on
 * the other backend, and it is what makes `hydrate(…, document)` possible at
 * all. Without it the client rendered into `#app` and the shell never ran, so
 * `<head>` had no counterpart in the tree and a second mechanism had to keep it
 * in step — which is what `installHead` was.
 *
 * The shell is `lazy()`, so it must already be loaded when this runs.
 * `preloadMatched` is what loads it, and the boot awaits that before hydrating
 * for exactly this reason: a cold `lazy()` here throws `NotReadyError` from a
 * position with no boundary above it and the whole page fails.
 */
export function Document(
  scope: Scope | null,
  props: { readonly state: unknown; readonly head?: unknown; readonly children: unknown },
): JSXElement {
  const state = readSlot(props.state, "Document.state") as RouterState;
  const shell = shellComponentOf(state.config.routeTree);
  const assets = clientHeadAssets(state, {
    initial:
      props.head === undefined
        ? undefined
        : (readSlot(props.head, "Document.head") as readonly import("./head.ts").MatchAssets[]),
  });
  // `children` crosses BY IDENTITY. It is a Block — the shell places it with
  // `insert`, which calls it with the scope it is holding — and `readSlot`
  // refuses a Block in a value slot, which is what "Document.children was
  // invoked without a scope" was saying.
  const children = props.children;
  if (shell === undefined) return children as JSXElement;
  // A null scope has nothing to provide ON, and `renderShell` makes the same
  // split for the same reason.
  if (scope === null) return shell(null, { children }) as JSXElement;
  return provide(scope, HeadAssetsContext, cell(assets), (inner) =>
    shell(inner, { children }),
  ) as JSXElement;
}

/**
 * The root route's `shellComponent`, or `undefined` for a table without one.
 *
 * `shellComponent` renders `<html>`, so only the root may declare one and the
 * generated table only ever emits it there.
 */
function shellComponentOf(
  routes: readonly unknown[],
): ((scope: Scope | null, props: { children: unknown }) => unknown) | undefined {
  const declared = (routes[0] as { shellComponent?: unknown } | undefined)?.shellComponent;
  return typeof declared === "function"
    ? (declared as (scope: Scope | null, props: { children: unknown }) => unknown)
    : undefined;
}

/** What the shell was handed, or `null` where there is no shell. */
export function useHeadAssets(): HeadAssets | null {
  return read(HeadAssetsContext)();
}

/** The resolved href a `<Link>` points at, for either backend. */
export function linkHref(state: RouterState, props: Incoming<LinkProps>): string {
  return resolveTo(state, props);
}

/**
 * The same target, as the BROWSER must see it.
 *
 * Two spellings because they answer different questions. Everything inside the
 * router — matching, the active check, `navigate` — works in application space,
 * where `/about` is `/about` whatever the deployment mounted it under. The
 * `href` ATTRIBUTE is the one string that leaves for the browser, and it has to
 * carry the base or a middle-click opens a URL the server does not serve.
 *
 * That asymmetry is why the base was never wired up before: on the click path
 * the router intercepts and the missing base is invisible, so the bug only
 * appears on "open in new tab", a reload, or a crawler.
 */
export function linkAttrHref(state: RouterState, to: string): string {
  return state.base === "" || leavesTheApp(to) ? to : addBase(to, state.base);
}

/** Whether a `<NavLink>` points at where you are, for either backend. */
export function linkIsActive(
  state: RouterState,
  href: string,
  end: boolean,
  options?: ActiveOptions,
): boolean {
  // Split once: `to` may carry a query and a fragment now that `<Link>` writes
  // both, and comparing the whole string against a pathname never matched.
  const hashAt = href.indexOf("#");
  const withoutHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const linkHash = hashAt === -1 ? "" : href.slice(hashAt + 1);
  const queryAt = withoutHash.indexOf("?");
  const to = queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt);
  const linkQuery = queryAt === -1 ? "" : withoutHash.slice(queryAt + 1);

  // COMPARED without either trailing slash. The location a browser arrived at
  // is whatever was typed or linked, so `/about/` against a link built as
  // `/about` was inactive — and under `trailingSlash: "always"` the two sides
  // disagree the other way round.
  const here = withoutTrailingSlash(state.location().pathname);
  const target = withoutTrailingSlash(to);
  const exact = options?.exact ?? end;
  if (!(exact ? here === target : isUnder(here, target))) return false;

  if (options?.includeSearch === true) {
    // A SUBSET rather than an equality: a link to `?tab=a` is active on
    // `?tab=a&page=2`, which is what a tab strip beside a paginator needs.
    const current = state.search();
    for (const [key, value] of new URLSearchParams(linkQuery)) {
      if (current.get(key) !== value) return false;
    }
  }
  if (options?.includeHash === true) {
    const currentHash = state.location().hash.replace(/^#/, "");
    if (currentHash !== linkHash) return false;
  }
  return true;
}

/** The router this subtree is under. Resolved through the SCOPE chain, so a portalled `<Link>` still finds it. */
export function useRouter(): RouterState {
  return read(RouterContext)();
}

/**
 * What a location matching NO route renders when the application declares no
 * `notFound`.
 *
 * Exported because the STRING backend has to write the same thing. It rendered
 * nothing at all, so every unmatched URL was a guaranteed hydration mismatch:
 * the server sent an empty app and the client built a text node inside it.
 */
export const NOT_FOUND = "404 - Not Found";

/**
 * A code-split component's tracked readiness probe, when it has one.
 *
 * `lazy()` gives its component a `ready()`; an eagerly imported component has
 * none and needs none. Calling it establishes the dependency that lets the
 * module landing wake the boundary that parked on it.
 */
function readyOf(component: unknown): void {
  const ready = (component as { ready?: () => void } | undefined)?.ready;
  if (typeof ready === "function") ready();
}

/**
 * One `branch` per depth, keyed on the route's identity.
 *
 * `data` is deliberately NOT in the key. It arrives as a Cell, so a loader
 * landing UPDATES the route rather than remounting it — which is what keeps a
 * surviving `<Link>`'s element identity across a navigation within the same
 * layout, and what an identity-gated re-render used to be hand-rolled for.
 */
export function renderDepth(
  scope: Scope | null,
  state: RouterState,
  depth: number,
  parent: Node | null,
  anchor: Node | null,
): Node | null {
  const routeAt = (): Route | null => state.chain()[depth] ?? null;

  const body = (instance: Scope | null): unknown => {
    const route = untrack(routeAt);
    if (route === null) {
      // The not-found goes where the MATCHED route would have gone, which with
      // a root route in the table is depth 1 rather than depth 0. That keeps
      // the shell and the navigation the root renders, and it keeps a miss the
      // same shape as a hit — which is what hydration compares.
      if (!untrack(state.missed) || depth !== untrack(() => state.chain()).length) return null;
      // A ROUTE'S OWN `notFoundComponent` FIRST, walking outward — which is
      // what `notFoundMode: "fuzzy"` is for: the chain here is the deepest
      // layout owning a prefix of the path, so its answer is the specific one.
      // `config.notFound` is the application-wide fallback beneath it.
      const own = errorFallbackFor(
        untrack(() => state.chain()),
        depth - 1,
        () => state.params(),
      )(instance, () => NOT_FOUND_ERROR, NOOP_RESET);
      if (own !== null && own !== undefined) return own as Node;
      const fallback = state.config.notFound;
      if (fallback !== undefined) {
        // A not-found route has no next depth, so its `children` is the Block
        // that places nothing. Omitting the argument was a type error the
        // package's own `typecheck` has been failing on.
        return (fallback as unknown as Invoked)(
          instance,
          routeProps(state, depth, null, EMPTY_CHILDREN),
        );
      }
      // THROUGH `template`, not `document.createTextNode`.
      //
      // A raw node is invisible to hydration: it cannot be claimed, so the
      // client rebuilt it over markup the server had written and `hydrate`
      // RECOVERED — threw the whole document away and rendered the page cold.
      // On a real browser that killed the tab.
      //
      // The text is STATIC, so it lives in the template rather than going
      // through `insert`, which would write a range around a constant. The
      // server emits the same element with the same text and no range, and the
      // client claims it.
      return notFoundTemplate();
    }

    const component = route.definition.component;
    // UNTRACKED: a component body is one of the two structural exits from
    // reactivity. A body that reads `useParams()` directly would otherwise
    // subscribe the enclosing block and rebuild the whole route on a parameter
    // change. Measured: two builds for one navigation within the same route.
    const content = (contentScope: Scope | null): unknown => {
      // TRACKED, and outside the `untrack` below on purpose. A code-split route
      // is a `lazy()`, and reading its cell inside `untrack` subscribes to
      // nothing — so the `NotReadyError` parks this depth's boundary and the
      // module landing never wakes it. Measured: navigating to any route a
      // file-based table generated showed its fallback forever.
      readyOf(component);
      return untrack(() => {
        // A refused parameter throws HERE, inside this depth's error boundary,
        // so a bad `?page=banana` or a `/users/abc` that had to be a number
        // renders that route's `errorComponent` rather than taking the whole
        // page down. The PATH is checked first: it decided which route this is.
        const refused = state.paramsErrorAt(depth) ?? state.searchErrorAt(depth);
        if (refused !== null) throw refused;
        if (component === undefined) return renderDepth(contentScope, state, depth + 1, null, null);
        const children = block((childScope: Scope | null) =>
          renderDepth(childScope, state, depth + 1, null, null),
        );
        return withMatch(
          contentScope,
          { state, depth, route, children, blocking: false },
          (inner) =>
            (component as unknown as Invoked)(inner, routeProps(state, depth, route, children)),
        );
      });
    };

    // An `Errored` per depth, INSIDE the `Loading`, matching what the string
    // backend emits. Without it a loader that rejects on the client after
    // hydration has nothing to catch it at all — the DOM path installed only
    // `"loading"`, so the throw walked out of the render.
    //
    // Inside rather than outside, for the reason the string side records: what
    // is re-entered after a park is the loading boundary's own content, so a
    // catcher outside it is not in the path on the retry.
    const guarded: Block<unknown> = (contentScope: Scope | null): unknown =>
      boundary(
        contentScope,
        null,
        null,
        "error",
        ((fallbackScope: Scope | null, error: () => Error, reset: () => void) => {
          const shown = errorFallbackFor(
            untrack(() => state.chain()),
            depth,
            () => state.params(),
          )(fallbackScope, error, reset);
          return shown === null || shown === undefined ? null : shown;
        }) as Block<unknown>,
        content,
        HYDRATE,
      );

    // One `Loading` per depth, by construction rather than by asking the author
    // for one. It is not a convenience: `renderToStream` opens the seed channel
    // only `if (parked.length > 0)`, and a boundary parking is the only thing
    // that fills `parked`. A route whose loader is read outside one does not
    // merely fail to seed — the render throws `NotReadyError` and produces
    // nothing.
    return boundary(
      instance,
      null,
      null,
      "loading",
      routeFallback(state, route),
      guarded,
      HYDRATE,
      // Re-arm on navigation: when `on()` changes while work is pending the
      // fallback comes back instead of holding the previous route's content.
      // This is the whole of "show the skeleton again on navigation" and it
      // needs no transition API, which this codebase does not have.
      () => state.location().pathname,
    );
  };

  // HYDRATE on all three, and `renderRoutes` writes the same three ranges in
  // the same order. Without it the string backend still wrote its boundary
  // ranges while this side claimed none of them, and every SSR'd page threw its
  // markup away and re-rendered cold — measured as `claimed: 0, recovered: true`
  // against a real dev server before this line existed.
  return branch(scope, parent, anchor, routeAt as Cell<unknown>, body, HYDRATE);
}

/**
 * The `pending` fallback, delayed by `pendingMs` and timed for `pendingMinMs`.
 *
 * A loader that answers in 40 ms does not want a skeleton — the flash of one is
 * worse than the wait — so nothing is shown until the delay elapses. Once it IS
 * shown, `markPending` records when, which is what `pendingMinMs` measures from:
 * only the thing that renders the fallback knows that moment.
 */
function routeFallback(state: RouterState, route: Route): Block<unknown> | null {
  const pending = route.definition.pendingComponent;
  if (pending === undefined) return null;
  const delay = route.definition.pendingMs ?? state.config.defaults?.pendingMs ?? 0;

  return (fallbackScope: Scope | null) => {
    const shown = (pending as unknown as Invoked)(fallbackScope, {
      params: () => state.params(),
      data: () => undefined,
      context: () => ({}),
      children: () => null,
    });
    if (delay === 0) {
      state.markPending(route);
      return shown;
    }

    // HIDDEN, not absent, and that is forced rather than chosen. The boundary
    // places its fallback's output ONCE; nodes inserted afterwards are outside
    // the range it tracks, so revealing the content removed what it knew about
    // and left the skeleton behind — measured, as "SKELETONdata" in the DOM.
    //
    // `display: contents` keeps the wrapper out of layout entirely, so the
    // delayed fallback lays out exactly as an undelayed one does once it
    // appears.
    const holder = document.createElement("div");
    holder.style.display = "none";
    holder.append(shown as never);
    const timer = setTimeout(() => {
      holder.style.display = "contents";
      state.markPending(route);
    }, delay);
    onCleanup(() => clearTimeout(timer));
    return holder;
  };
}

/**
 * A prop whose value is a COMPONENT, read without `readSlot`'s Block refusal.
 *
 * The compiler wraps a JSX attribute in a thunk, so the prop arrives as an
 * accessor whose result is the component — which is a Block, and a Block in a
 * Cell slot is exactly what `readSlot` exists to catch. Here it is the point.
 */
function componentSlot(slot: unknown): unknown {
  if (slot === undefined) return undefined;
  return typeof slot === "function" ? untrack(() => (slot as () => unknown)()) : slot;
}

/** `children` is a Block, so a layout builds the next route in its own scope. */
export function routePropsFor(
  state: RouterState,
  depth: number,
  route: Route | null,
  children: Block<unknown>,
  /** The string backend passes `true` — see `RouterState.dataFor`. */
  blocking = false,
): RouteProps {
  return sources([
    {
      params: () => state.params(),
      data: () => (route === null ? undefined : state.dataFor(route, state.params(), blocking)()),
      context: () => state.contexts()[depth] ?? {},
      children,
    },
  ]) as unknown as RouteProps;
}

/** The `children` of a depth that has none: a Block that places nothing. */
/** A route with no next depth places nothing. Shared with the string backend. */
export const EMPTY_CHILDREN: Block<unknown> = () => null;

function routeProps(
  state: RouterState,
  depth: number,
  route: Route | null,
  children: Block<unknown>,
): RouteProps {
  return routePropsFor(state, depth, route, children);
}

/**
 * The MATCH a component is rendering for, so `<Outlet />` and the route-scoped
 * hooks can find it without being handed props.
 *
 * TanStack's route components take no props at all — data comes from
 * `Route.useLoaderData()` and the next depth from `<Outlet />`. Both need to know
 * which depth is being rendered, and a context is the only channel that survives
 * an arbitrarily deep component tree between the route and the `<Outlet />` that
 * places its child.
 */
export interface RouteMatchInfo {
  readonly state: RouterState;
  readonly depth: number;
  readonly route: Route | null;
  /** The next depth down, as a Block, so it is CONSTRUCTED where `<Outlet />` sits. */
  readonly children: Block<unknown>;
  /** The string backend reads a loader BLOCKING — see `RouterState.dataFor`. */
  readonly blocking: boolean;
}

export const RouteMatchContext = context<RouteMatchInfo | null>(null, "barq-router-match");

/**
 * Run `body` with `match` ambient.
 *
 * A null scope means there is nothing to provide ON, which is the case the two
 * backends reach differently — the DOM path can be handed `null` by a caller
 * that is not in a scope, and the string path asks `getOwner()`. Neither can
 * install a context there, and a hook called under one throws `NoOwnerError`
 * with its own message, which is a better failure than a silently absent match.
 */
function withMatch(
  scope: Scope | null,
  match: RouteMatchInfo,
  body: (inner: Scope | null) => unknown,
): unknown {
  if (scope === null) return body(null);
  return provide(scope, RouteMatchContext, cell(match), body);
}

/**
 * The match a route-scoped hook is asking about.
 *
 * `null` outside a route component — `<Outlet />` answers nothing there and the
 * hooks say so by name rather than by returning `undefined`.
 */
export function useRouteMatch(): RouteMatchInfo | null {
  return read(RouteMatchContext)();
}

/**
 * TanStack's `<Outlet />`: the next matched route, rendered HERE.
 *
 * barq's is a Block invoked with the scope `<Outlet />` itself sits in, so the
 * child is still CONSTRUCTED inside the layout — a provider or a boundary the
 * layout installed is visible to the route it wraps. That is the property the
 * old `props.children` had and the reason this file used to say an outlet could
 * not have it; it can, as long as the outlet places a Block rather than a
 * pre-built tree.
 */
// The props parameter is never read. It is declared because the calling
// convention is `(scope, props)` and JSX reads the FIRST parameter of a
// one-argument component as its props — so without it `<Outlet />` type-checks
// its (absent) attributes against `Scope`. `route.ts` records the same asymmetry
// for authored components, which C1 rewrites into this shape.
export function Outlet(scope: Scope | null, _props?: Record<string, never>): JSXElement {
  const match = read(RouteMatchContext)();
  if (match === null) return null;
  return match.children(scope) as JSXElement;
}

export interface ClientOnlyProps {
  /** Shown once the browser has taken over. */
  readonly children?: unknown;
  /** Shown on the server, and on the first client render. Nothing by default. */
  readonly fallback?: unknown;
}

/**
 * Render `children` only once the client is running; `fallback` until then.
 *
 * For the subtree that CANNOT be server-rendered — a chart measuring its
 * container, a map, anything reading `window` at build time. `ssr: false` is
 * the route-level answer to the same problem; this is the component-level one,
 * so a page that is otherwise server-rendered can carve out one region.
 *
 * WHY A SIGNAL AND NOT `typeof document`. The two renders have to AGREE: the
 * server writes the fallback, and the client's first render must write the
 * fallback too or hydration is comparing different trees. A signal that starts
 * `false` and is flipped by an `effect` gives exactly that — the effect runs
 * after the first render on the client and never on the string backend, so the
 * swap happens on the second render, with the server's markup already claimed.
 *
 * Sniffing the environment cannot do this: it would be `true` on the client's
 * FIRST render, which is the render that has to match the server's.
 */
function ClientOnlyImpl(scope: Scope | null, props: Incoming<ClientOnlyProps>): JSXElement {
  const shown = signal(false);
  // Never runs on the string backend, which is what makes the server's answer
  // the fallback without asking what environment this is.
  effect(() => {
    shown.set(true);
  });
  // A Block is INVOKED with the scope the branch is holding, exactly as
  // `Outlet` invokes the next depth; anything else is a value and is returned.
  // That is what lets `<ClientOnly>` take JSX children and a JSX fallback.
  const place = (slot: unknown) => (inner: Scope | null) =>
    typeof slot === "function" ? (slot as (s: Scope | null) => unknown)(inner) : (slot ?? null);

  const bodies = [block(place(props.fallback)), block(place(props.children))] as const;
  // The string backend writes the same region with the fallback arm chosen.
  const backend = linkBackend();
  if (backend?.clientOnly !== undefined) {
    return backend.clientOnly(bodies[0], bodies[1]) as JSXElement;
  }
  // The key is an INDEX into `bodies`, not a boolean — core's own
  // `errorBoundary` picks `0` or `1` the same way. A boolean key selects
  // `bodies[false]`, which is `undefined`, and the region renders nothing.
  const arm = (): number => (shown() ? 1 : 0);
  return branch(scope, null, null, arm as Cell<number>, [
    // Index 0 is `false`: the fallback. Index 1 is `true`: the children.
    bodies[0],
    bodies[1],
  ]) as JSXElement;
}

export const ClientOnly = ClientOnlyImpl as unknown as (props: ClientOnlyProps) => JSXElement;

// ---------------------------------------------------------------- components

export interface RouterProps {
  readonly routeTree: RouterState["config"]["routeTree"];
  readonly history?: RouterState["history"];
  readonly notFound?: RouterState["config"]["notFound"];
  readonly beforeEach?: RouterState["config"]["beforeEach"];
  readonly afterEach?: RouterState["config"]["afterEach"];
}

/**
 * Render an ALREADY-BUILT router state.
 *
 * The server needs this: the page handler creates the state so it can hand it an
 * `onLoaderError` and read the answer back, and the app renders that state
 * rather than making a second one.
 */
function RouterProviderImpl(scope: Scope | null, props: Incoming<{ state: RouterState }>): unknown {
  const state = readSlot(props.state, "RouterProvider.state") as RouterState;
  void state.start();
  return provide(scope as Scope, RouterContext, cell(state), (inner: Scope | null) =>
    renderDepth(inner, state, 0, null, null),
  );
}

function RouterImpl(scope: Scope | null, props: Incoming<RouterProps>): unknown {
  const state = createRouter({
    routeTree: readSlot(props.routeTree, "Router.routeTree") as RouterProps["routeTree"],
    history:
      props.history === undefined
        ? undefined
        : (readSlot(props.history, "Router.history") as RouterProps["history"]),
    // NOT `readSlot`. A component IS a Block, and `readSlot` refuses a Block
    // yielded by a Cell — C5.1, and rightly, because a Block reaching a VALUE
    // slot is a bug. This slot does not hold a value: it holds the component to
    // render when nothing matched. Reading it through `readSlot` threw
    // `ScopeMissingError: Router.notFound (a Cell yielded a Block)` for every
    // caller that passed one, which is every caller that used the prop.
    notFound: componentSlot(props.notFound) as RouterProps["notFound"],
    beforeEach:
      props.beforeEach === undefined
        ? undefined
        : (readSlot(props.beforeEach, "Router.beforeEach") as RouterProps["beforeEach"]),
    afterEach:
      props.afterEach === undefined
        ? undefined
        : (readSlot(props.afterEach, "Router.afterEach") as RouterProps["afterEach"]),
  });
  onCleanup(() => state.dispose());
  void state.start();
  return provide(scope as Scope, RouterContext, cell(state), (inner: Scope | null) =>
    renderDepth(inner, state, 0, null, null),
  );
}

/**
 * When a link warms the cache for where it points.
 *
 * `"intent"` is hover, focus or touch; `"viewport"` is an `IntersectionObserver`;
 * `"render"` fires once when the link is built. `false` is the default, because
 * a preload is a request the user did not ask for.
 */
export type PreloadStrategy = "intent" | "viewport" | "render" | false;

/** Hover before it counts as intent. TanStack's default, and it is a good one. */
const PRELOAD_DELAY = 50;
/** How early a viewport link counts as visible. TanStack's `rootMargin`. */
const VIEWPORT_MARGIN = "100px";

/**
 * Everything an `<a>` takes, minus what `<Link>` decides for itself.
 *
 * `href` is the one the link OWNS — it is built from `to`, `params`, `search`
 * and `hash` — and `children` is declared below with the shape the router's own
 * components use. Everything else is a real anchor attribute or a real event
 * handler, typed as the DOM already types it, so `id`, `title`, `rel`,
 * `target`, `data-*` and `onClick` all check.
 *
 * An index signature was the alternative and is worse: it admits every
 * misspelling too, so `activeClas` would silently become an attribute.
 */
// Reached through `IntrinsicElements["a"]`, which is exported, rather than
// through `HTMLAttributes`, which is internal to the namespace.
type AnchorProps = Omit<
  CoreJSX.IntrinsicElements["a"],
  // `href` the link OWNS, `children` is declared below with the router's own
  // shape, and `preload` COLLIDES: on a media element it is
  // `"auto" | "metadata" | "none"`, and on a `<Link>` it is the cache strategy.
  // The router's meaning is the one an author writing `<Link preload>` means.
  "href" | "children" | "preload"
>;

export interface LinkProps extends AnchorProps {
  /**
   * A path, or a route id when `params` is given.
   *
   * Narrowed to the application's own routes once a `routeTree.gen.ts` has
   * registered them, so an editor offers them and a typo is visible. It still
   * ADMITS any string — see `ToPath` for why barq stops one step short of
   * TanStack's strictness, and which checker catches the typo instead.
   */
  readonly to: ToPath;
  /** Warm the cache for this link's target. The router's `defaults.preload` otherwise. */
  readonly preload?: PreloadStrategy;
  readonly params?: Record<string, string>;
  /**
   * The query, as a string, a record, or a FUNCTION of the current one.
   *
   * The functional form is what a link that edits one parameter needs:
   * `search={(prev) => ({ ...prev, page: "2" })}` keeps the rest of the query
   * instead of replacing it, which is otherwise a read of `useSearch()` at
   * every call site.
   */
  readonly search?:
    | string
    | Record<string, string>
    | ((current: Record<string, string>) => Record<string, string>);
  /** The fragment, without its `#`. Written into the href and carried by a click. */
  readonly hash?: string;
  readonly replace?: boolean;
  readonly state?: unknown;
  readonly class?: string;
  /**
   * Resolve a relative `to` against THIS path rather than the current location.
   *
   * A `<Link to="../edit">` inside a component rendered under several routes
   * otherwise means something different depending on where it was rendered.
   */
  readonly from?: string;
  /**
   * Leave the click to the browser: a full document load rather than a
   * navigation. For a link out of the application's own routing.
   */
  readonly reloadDocument?: boolean;
  /** Refuse the click, and mark the anchor `aria-disabled`. */
  readonly disabled?: boolean;
  /** Scroll to the top after this navigation. Default `true`. */
  readonly resetScroll?: boolean;
  /** Wrap this navigation in a view transition. The router's default otherwise. */
  readonly viewTransition?: boolean;
  readonly children?: unknown;
}

/** The default not-found, as an element the server writes identically. */
const notFoundTemplate = template(`<p>${NOT_FOUND}</p>`);

/** A fuzzy not-found has nothing to retry, so its `reset` does nothing. */
const NOOP_RESET = (): void => {};

/**
 * The error a route's `notFoundComponent` is handed for an unmatched LOCATION.
 *
 * One instance: it carries no per-request detail — the path is in
 * `location()` — and a fresh object per render would make every re-render a
 * change to anything comparing it.
 */
const NOT_FOUND_ERROR = new NotFound(NOT_FOUND);

const anchorTemplate = template("<a></a>");

/**
 * The props `<Link>` and `<NavLink>` interpret themselves. Everything else is
 * an attribute of the anchor.
 *
 * A SET rather than a check per name, because this runs once per link built and
 * the list is fixed.
 */
/**
 * The DOM event a prop name addresses, or `null` for an ordinary attribute.
 *
 * `onClick` and `onclick` both, because `IntrinsicElements["a"]` declares each
 * spelling and an author may write either.
 */
function eventNameOf(name: string): string | null {
  if (!name.startsWith("on") || name.length < 3) return null;
  const rest = name.slice(2);
  // `on-` prefixed data attributes are not events; a letter has to follow.
  if (!/^[a-zA-Z]/.test(rest)) return null;
  return rest.toLowerCase();
}

const LINK_OWN_PROPS = new Set([
  "to",
  "preload",
  "params",
  "search",
  "hash",
  "replace",
  "state",
  "class",
  "from",
  "reloadDocument",
  "disabled",
  "resetScroll",
  "viewTransition",
  "children",
  "activeClass",
  "end",
  "activeOptions",
  "activeProps",
  "inactiveProps",
]);

/**
 * Resolve a `to` that may be a route ID, a relative path or an absolute one.
 *
 * A route id is tried first and falls through to path resolution, so
 * `to="/users/$id"` with `params` builds `/users/7` while `to="/users/7"` is
 * taken as it stands.
 */
function resolveTo(state: RouterState, props: Incoming<LinkProps>): string {
  const to = readSlot(props.to, "Link.to") as string;
  if (leavesTheApp(to)) return to;

  const given = props.params === undefined ? undefined : readSlot(props.params, "Link.params");
  const destination = state.matcher.routes.find((route) => route.id === to);
  const pattern = destination?.fullPath;
  const params =
    given === undefined
      ? undefined
      : stringifyParams(destination?.chain, given as Record<string, unknown>);
  // `from` pins what a relative `to` is relative TO. Without it a
  // `<Link to="../edit">` in a shared component means something different
  // depending on which route rendered it.
  const origin =
    props.from === undefined
      ? state.location().pathname
      : (readSlot(props.from, "Link.from") as string);
  const built =
    pattern !== undefined
      ? interpolate(pattern, params ?? {})
      : params !== undefined
        ? interpolate(to, params)
        : resolvePath(to, origin);
  // A `to` that is a route ID carries the pattern's spelling, not the caller's,
  // so `"preserve"` reads the ORIGIN when `to` addressed nowhere new — which is
  // the `<Link to=".">` that re-renders where you already are.
  const path = applyTrailingSlash(
    built,
    state.trailingSlash,
    (to === "" || to === "." ? origin : to).endsWith("/"),
  );

  const query = queryFor(state, props);
  const hash = props.hash === undefined ? "" : (readSlot(props.hash, "Link.hash") as string);
  const fragment = hash === "" ? "" : `#${hash.replace(/^#/, "")}`;
  return (query === "" ? path : `${path}?${query}`) + fragment;
}

/**
 * `params.stringify`, for every route on the way to the destination.
 *
 * The inverse of the `parse` that produced the value: a route working in `Date`
 * has to write a URL, and `interpolate` only knows how to encode a string. Runs
 * outermost first so a leaf can override what a layout wrote for a shared name,
 * which is the direction every other chain merge in the router goes.
 *
 * A THROW IS SWALLOWED, which is TanStack's choice (`router.ts:1943-1952`) and
 * the right one here: this runs while a link is being rendered, where there is
 * no boundary to catch it and nobody waiting on an answer. The paired `parse`
 * refuses the same value on the way back in, with a boundary, if the link is
 * ever followed.
 */
function stringifyParams(
  chain: readonly Route[] | undefined,
  given: Record<string, unknown>,
): Record<string, string> {
  let out: Record<string, unknown> = given;
  for (const route of chain ?? []) {
    const stringify = route.definition.params?.stringify;
    if (stringify === undefined) continue;
    try {
      out = { ...out, ...stringify(out) };
    } catch {
      /* see above: a link cannot report this and must still render */
    }
  }
  return out as Record<string, string>;
}

/**
 * The query string a link contributes, in whichever of the three forms it gave.
 *
 * A FUNCTION is handled before `readSlot` rather than through it, and that is
 * forced rather than chosen: every prop in barq is a slot, so `readSlot` calls
 * a function prop as an accessor with no arguments — which makes an updater and
 * an accessor the same thing to it, and made `(prev) => ({ ...prev, page })`
 * spread `undefined` and silently drop the rest of the query.
 *
 * Calling it with the current query instead serves both spellings: an accessor
 * that ignores its argument behaves exactly as it did, and an updater gets what
 * it needs. That is why there is no separate prop for it.
 */
function queryFor(state: RouterState, props: Incoming<LinkProps>): string {
  if (props.search === undefined) return "";
  const raw = props.search as unknown;
  let search: unknown =
    typeof raw === "function"
      ? (raw as (current: Record<string, string>) => unknown)(searchRecordOf(state))
      : readSlot(props.search, "Link.search");
  // TWICE, at most: the compiler wraps a JSX attribute in an accessor, so an
  // updater written in a route file arrives as `() => (prev) => ({...})`. The
  // first call unwraps the accessor and hands the record to something that
  // ignores it; the second reaches the updater. A plain accessor returning a
  // record settles on the first, and nothing loops.
  if (typeof search === "function") {
    search = (search as (current: Record<string, string>) => unknown)(searchRecordOf(state));
  }
  if (typeof search === "string") return search.replace(/^\?/, "");
  return new URLSearchParams(search as Record<string, string>).toString();
}

/**
 * The props a link did not interpret, flattened for the string backend.
 *
 * The DOM path binds these reactively; a string render happens once, so it
 * reads each slot a single time.
 */
export function linkExtraAttrs(props: Incoming<LinkProps>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of Object.keys(props)) {
    if (LINK_OWN_PROPS.has(name)) continue;
    // A handler has no markup counterpart; the DOM half attaches it.
    if (eventNameOf(name) !== null) continue;
    const read = readSlot((props as Record<string, unknown>)[name], `Link.${name}`);
    if (read === false || read === null || read === undefined) continue;
    out[name] = String(read);
  }
  // The one interpreted prop that still has to reach the markup: the DOM path
  // binds `aria-disabled`, and without it here the server's anchor and the
  // hydrated one disagreed about whether the link was refused.
  if (props.disabled !== undefined && Boolean(readSlot(props.disabled, "Link.disabled"))) {
    out["aria-disabled"] = "true";
  }
  return out;
}

/** The current query as a plain record, for the functional `search` form. */
function searchRecordOf(state: RouterState): Record<string, string> {
  const current: Record<string, string> = {};
  for (const [key, value] of state.search()) current[key] = value;
  return current;
}

function anchorElement(
  scope: Scope | null,
  props: Incoming<LinkProps>,
  extra: (element: HTMLAnchorElement, target: () => string) => void,
): Node {
  const state = useRouter();
  const element = anchorTemplate() as HTMLAnchorElement;
  // Read inside the effect, not captured at construction: a surviving `<Link>`
  // under a layout must re-resolve when the location moves, or it points at the
  // path it was built under forever.
  const target = (): string => resolveTo(state, props);

  bindProp(scope, element, setAttr, "href", () => linkAttrHref(state, target()));
  if (props.class !== undefined) {
    bindProp(scope, element, setClass, "class", () => readSlot(props.class, "Link.class"));
  }

  // EVERY OTHER PROP REACHES THE ANCHOR. A `<Link>` is an `<a>`, and an `<a>`
  // takes `id`, `title`, `aria-*`, `data-*`, `target`, `rel`, `download`. Those
  // were silently dropped: the element rendered, the attribute did not, and
  // nothing said so — the click path even READS `download` and `target` off the
  // element, which no `<Link>` could set.
  for (const name of Object.keys(props)) {
    if (LINK_OWN_PROPS.has(name)) continue;
    const value = (props as Record<string, unknown>)[name];
    // An `on*` prop is a HANDLER, not an attribute. Stringifying one would put
    // the function's source text in the DOM and attach nothing, and `onClick`
    // on a link is the ordinary case — a nav that closes a menu on click.
    const event = eventNameOf(name);
    if (event !== null) {
      listen(scope, element, event, ((payload: Event) => {
        (value as (e: Event) => void)(payload);
      }) as EventListener);
      continue;
    }
    bindProp(scope, element, setAttr, name, () => {
      const read = readSlot(value, `Link.${name}`);
      // `false` and `null` REMOVE, so `download={false}` is not the string
      // "false" — which is truthy as an attribute and would enable it.
      return read === false || read === null || read === undefined ? null : String(read);
    });
  }

  // The strategy is read WHEN A LISTENER FIRES, so a link whose prop moves acts
  // on what it now says — but the OBSERVER is constructed only for `viewport`.
  // The old router built an `IntersectionObserver` for every link regardless,
  // checked the strategy inside the callback, and therefore never disconnected
  // one for a link that was not `viewport`: a list of 500 default links kept 500
  // live observers doing layout work for nothing.
  const strategy = (): PreloadStrategy =>
    props.preload === undefined
      ? // The router's answer when the link does not give one. `false` still,
        // unless a project turned preloading on for every link at once.
        (state.config.defaults?.preload ?? false)
      : ((readSlot(props.preload, "Link.preload") as PreloadStrategy) ?? false);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const warm = (): void => {
    const to = target();
    if (leavesTheApp(to)) return;
    void state.preload(to);
  };
  const cancel = (): void => {
    clearTimeout(timer);
    timer = undefined;
  };
  // Cleared on UNMOUNT as well as on leave. The old router cleared only on
  // `mouseleave`, so unmounting inside the hover window still fired a preload
  // against a disposed scope.
  onCleanup(cancel);

  const onIntent = (): void => {
    if (strategy() !== "intent" || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      warm();
    }, state.config.defaults?.preloadDelay ?? PRELOAD_DELAY);
  };

  listen(scope, element, "mouseenter", onIntent);
  listen(scope, element, "mouseleave", cancel);
  // Keyboard and touch users preloaded not at all in the old router, which had
  // `mouseenter` and nothing else. A touch fires immediately: there is no hover
  // before a tap, so a delay is just latency.
  listen(scope, element, "focusin", onIntent);
  listen(scope, element, "blur", cancel);
  listen(scope, element, "touchstart", () => {
    if (strategy() !== "intent") return;
    cancel();
    warm();
  });

  if (untrack(strategy) === "render") {
    warm();
  } else if (untrack(strategy) === "viewport" && typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[entries.length - 1]?.isIntersecting) return;
        observer.disconnect();
        warm();
      },
      { rootMargin: VIEWPORT_MARGIN },
    );
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  }

  const flag = (value: unknown, name: string): boolean | undefined =>
    value === undefined ? undefined : Boolean(readSlot(value, name));

  // `aria-disabled` rather than the `disabled` attribute, which an `<a>` does
  // not have. The click is refused below; this is what says so to a screen
  // reader.
  if (props.disabled !== undefined) {
    bindProp(scope, element, setAttr, "aria-disabled", () =>
      flag(props.disabled, "Link.disabled") === true ? "true" : null,
    );
  }

  listen(scope, element, "click", ((event: MouseEvent) => {
    if (flag(props.disabled, "Link.disabled") === true) {
      // Refused entirely: no navigation and no document load either.
      event.preventDefault();
      return;
    }
    const to = target();
    if (leavesTheApp(to)) return;
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (element.hasAttribute("download") || element.target === "_blank") return;
    // `reloadDocument` hands the click back to the browser, which is the whole
    // of it: no `preventDefault`, so the anchor navigates the document.
    if (flag(props.reloadDocument, "Link.reloadDocument") === true) return;
    event.preventDefault();
    void state.navigate(to, {
      replace:
        props.replace === undefined ? false : Boolean(readSlot(props.replace, "Link.replace")),
      state: props.state === undefined ? undefined : readSlot(props.state, "Link.state"),
      resetScroll: flag(props.resetScroll, "Link.resetScroll"),
      viewTransition: flag(props.viewTransition, "Link.viewTransition"),
    });
  }) as EventListener);

  extra(element, target);

  // `insert`, NEVER `append`. The template CLAIMS the server's `<a>` during
  // hydration, text and all, so appending the children put a SECOND copy of
  // them inside it — measured on the reference application as every one of the
  // ten navigation links reading "AboutAbout" and the sidebar growing by a row,
  // which is a layout shift on every page that has a link in it. `insert` is
  // the seam that claims what the server wrote instead of adding to it, and it
  // takes the slot unresolved so children that change still update.
  // WHOLE: the string backend writes an anchor's children with no boundary
  // comments — `backend.link` interpolates them straight into the tag — so the
  // claim here is every child of the node, not a delimited range. Without it
  // hydration looked for a `<!--]-->` that was never written and rebuilt the
  // link, which is `expected <!--]--> before the end of <a>, found the text
  // "Signals & State"`.
  const children = props.children;
  if (children !== undefined) insert(scope, element, children as Child, null, WHOLE);
  return element;
}

function LinkImpl(scope: Scope | null, props: Incoming<LinkProps>): Node {
  const backend = linkBackend();
  if (backend !== null) {
    const className =
      props.class === undefined ? "" : (readSlot(props.class, "Link.class") as string);
    const state = useRouter();
    // The ATTRIBUTE carries the base; nothing else does. See `linkAttrHref`.
    return backend.link(
      linkAttrHref(state, linkHref(state, props)),
      className,
      props.children,
      linkExtraAttrs(props),
    ) as never;
  }
  return anchorElement(scope, props, () => {});
}

/**
 * What counts as "you are here".
 *
 * `end` alone answered only the pathname, so a nav that paginates —
 * `?page=1` beside `?page=2` — marked both links active, and a table of
 * contents linking `#install` beside `#usage` marked every one. TanStack's
 * `activeOptions` names the same three questions.
 */
export interface ActiveOptions {
  /** Exact pathname match instead of the default segment-prefix match. */
  readonly exact?: boolean;
  /** The link's query must be a subset of the current one. */
  readonly includeSearch?: boolean;
  /** The link's fragment must equal the current one. */
  readonly includeHash?: boolean;
}

export interface NavLinkProps extends LinkProps {
  readonly activeClass?: string;
  /** Exact match instead of the default segment-prefix match. `activeOptions.exact` is the same thing. */
  readonly end?: boolean;
  readonly activeOptions?: ActiveOptions;
  /**
   * Attributes applied while this link points at where you are.
   *
   * A record rather than a second class name, because "active" is not only ever
   * a class: `aria-current` is set for you, but a nav may also want
   * `data-state`, a `title`, or `tabindex="-1"` on the link to the page it is
   * already on.
   */
  readonly activeProps?: Record<string, string | null>;
  /** Attributes applied while it does not. */
  readonly inactiveProps?: Record<string, string | null>;
}

function NavLinkImpl(scope: Scope | null, props: Incoming<NavLinkProps>): Node {
  const state = useRouter();
  const backend = linkBackend();
  if (backend !== null) {
    const href = linkHref(state, props);
    const end = props.end === undefined ? false : Boolean(readSlot(props.end, "NavLink.end"));
    const base =
      props.class === undefined ? "" : (readSlot(props.class, "NavLink.class") as string);
    const activeClass =
      props.activeClass === undefined
        ? ""
        : (readSlot(props.activeClass, "NavLink.activeClass") as string);
    const activeOptions =
      props.activeOptions === undefined
        ? undefined
        : (readSlot(props.activeOptions, "NavLink.activeOptions") as ActiveOptions);
    const active = linkIsActive(state, href, end, activeOptions);
    const className = active ? `${base} ${activeClass}`.trim() : base;
    return backend.link(
      linkAttrHref(state, href),
      className,
      props.children,
      linkExtraAttrs(props),
    ) as never;
  }
  return anchorElement(scope, props, (element, target) => {
    // ONE implementation, shared with the string backend. It used to be
    // duplicated here and compared the whole `to` against a pathname, so a link
    // carrying a query or a fragment — which `<Link>` now writes — never
    // matched.
    const active = (): boolean =>
      linkIsActive(
        state,
        target(),
        props.end === undefined ? false : Boolean(readSlot(props.end, "NavLink.end")),
        props.activeOptions === undefined
          ? undefined
          : (readSlot(props.activeOptions, "NavLink.activeOptions") as ActiveOptions),
      );
    const activeClass = (): string =>
      props.activeClass === undefined
        ? "active"
        : (readSlot(props.activeClass, "NavLink.activeClass") as string);
    bindProp(scope, element, setAttr, "aria-current", () => (active() ? "page" : null));

    // Every name from BOTH records gets a binding, so a name present in one and
    // absent from the other is REMOVED when the state flips rather than left
    // behind — which is what a naive "apply the active record" does.
    const activeProps = (): Record<string, string | null> =>
      props.activeProps === undefined
        ? {}
        : ((readSlot(props.activeProps, "NavLink.activeProps") ?? {}) as Record<
            string,
            string | null
          >);
    const inactiveProps = (): Record<string, string | null> =>
      props.inactiveProps === undefined
        ? {}
        : ((readSlot(props.inactiveProps, "NavLink.inactiveProps") ?? {}) as Record<
            string,
            string | null
          >);
    const names = new Set([
      ...Object.keys(untrack(activeProps)),
      ...Object.keys(untrack(inactiveProps)),
    ]);
    for (const name of names) {
      bindProp(scope, element, setAttr, name, () =>
        active() ? (activeProps()[name] ?? null) : (inactiveProps()[name] ?? null),
      );
    }
    bindProp(scope, element, setClass, "class", () => {
      const base = props.class === undefined ? "" : (readSlot(props.class, "Link.class") as string);
      return active() ? `${base} ${activeClass()}`.trim() : base;
    });
  });
}

/** Navigate on construction. */
export interface RedirectProps {
  readonly to: string;
  readonly replace?: boolean;
}

function RedirectImpl(_scope: Scope | null, props: Incoming<RedirectProps>): null {
  const state = useRouter();
  void state.navigate(readSlot(props.to, "Redirect.to") as string, {
    replace:
      props.replace === undefined ? true : Boolean(readSlot(props.replace, "Redirect.replace")),
  });
  return null;
}

/**
 * `block()` applied by hand and the type asserted props-first.
 *
 * This module is not compiled, so C1's rewrite of the declaration does not
 * happen to it. A generated route module needs neither.
 */
type Authored<P> = (props: P) => JSXElement;

export const Router = block(RouterImpl) as unknown as Authored<RouterProps>;
export const RouterProvider = block(RouterProviderImpl) as unknown as Authored<{
  state: RouterState;
}>;
export const Link = block(LinkImpl) as unknown as Authored<LinkProps>;
export const NavLink = block(NavLinkImpl) as unknown as Authored<NavLinkProps>;
export const Redirect = block(RedirectImpl) as unknown as Authored<RedirectProps>;

export { RouterContext };
