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
  type StrictAccessor,
  bindProp,
  block,
  boundary,
  branch,
  cell,
  context,
  listen,
  onCleanup,
  props as sources,
  provide,
  read,
  readSlot,
  setAttr,
  setClass,
  template,
  untrack,
} from "@barqjs/core";

import { type RouterState, createRouter } from "./router.ts";
import { type Route, type RouteProps } from "./route.ts";
import { errorFallbackFor } from "./errors.ts";
import { interpolate, isUnder, leavesTheApp, resolvePath } from "./path.ts";

/** The real ABI. `RouteComponent` is declared props-first for TypeScript's sake. */
type Invoked = (scope: Scope | null, props: RouteProps) => unknown;

const RouterContext = context<RouterState>(undefined, "barq-router");

/** The router this subtree is under. Resolved through the SCOPE chain, so a portalled `<Link>` still finds it. */
export function useRouter(): RouterState {
  return read(RouterContext)();
}

const NOT_FOUND = "404 - Not Found";

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
      if (depth > 0) return null;
      const fallback = state.config.notFound;
      if (fallback !== undefined) {
        return (fallback as unknown as Invoked)(instance, routeProps(state, depth, null));
      }
      return document.createTextNode(NOT_FOUND);
    }

    const component = route.definition.component;
    // UNTRACKED, per CODESIGN §3.9: "component bodies running untracked" is one
    // of the two structural exits from reactivity. A body that reads
    // `props.params()` directly would otherwise subscribe the enclosing block
    // and rebuild the whole route on a parameter change — measured: two builds
    // for one navigation within the same route.
    const content = (contentScope: Scope | null): unknown =>
      untrack(() => {
        // A validator that refused throws HERE, inside this depth's error
        // boundary, so a bad `?page=banana` renders that route's
        // `errorComponent` rather than taking the whole page down.
        const refused = state.searchErrorAt(depth);
        if (refused !== null) throw refused;
        return component === undefined
          ? renderDepth(contentScope, state, depth + 1, null, null)
          : (component as unknown as Invoked)(contentScope, routeProps(state, depth, route));
      });

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
        content as Block<unknown>,
        0,
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
      routeFallback(route),
      guarded,
      0,
      // Re-arm on navigation: when `on()` changes while work is pending the
      // fallback comes back instead of holding the previous route's content.
      // This is the whole of "show the skeleton again on navigation" and it
      // needs no transition API, which this codebase does not have.
      () => state.location().pathname,
    );
  };

  return branch(scope, parent, anchor, routeAt as Cell<unknown>, body);
}

function routeFallback(route: Route): Block<unknown> | null {
  const pending = route.definition.pending;
  if (pending === undefined) return null;
  return ((fallbackScope: Scope | null) =>
    (pending as unknown as Invoked)(fallbackScope, {
      params: () => ({}),
      data: () => undefined,
      context: () => ({}),
      children: (() => null) as unknown as Child,
    })) as Block<unknown>;
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

function routeProps(state: RouterState, depth: number, route: Route | null): RouteProps {
  return sources([
    {
      params: () => state.params(),
      data: () => (route === null ? undefined : state.dataFor(route, state.params())()),
      context: () => state.contexts()[depth] ?? {},
      // A Block, which is what `RouteProps.children` documents itself as
      // carrying even though it is typed `Child` so `{props.children}` compiles.
      children: block((childScope: Scope | null) =>
        renderDepth(childScope, state, depth + 1, null, null),
      ) as unknown as Child,
    },
  ]) as unknown as RouteProps;
}

// ---------------------------------------------------------------- components

type Incoming<P> = { [K in keyof P]-?: StrictAccessor<P[K]> };

export interface RouterProps {
  readonly routes: RouterState["config"]["routes"];
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
    routes: readSlot(props.routes, "Router.routes") as RouterProps["routes"],
    history:
      props.history === undefined
        ? undefined
        : (readSlot(props.history, "Router.history") as RouterProps["history"]),
    notFound:
      props.notFound === undefined
        ? undefined
        : (readSlot(props.notFound, "Router.notFound") as RouterProps["notFound"]),
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

export interface LinkProps {
  /** A path, or a route id when `params` is given. */
  readonly to: string;
  readonly params?: Record<string, string>;
  readonly search?: string | Record<string, string>;
  readonly replace?: boolean;
  readonly state?: unknown;
  readonly class?: string;
  readonly children?: unknown;
}

const anchorTemplate = template("<a></a>");

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

  const params = props.params === undefined ? undefined : readSlot(props.params, "Link.params");
  const pattern = state.matcher.routes.find((route) => route.id === to)?.fullPath;
  const path =
    pattern !== undefined
      ? interpolate(pattern, (params ?? {}) as Record<string, string>)
      : params !== undefined
        ? interpolate(to, params as Record<string, string>)
        : resolvePath(to, state.location().pathname);

  const search = props.search === undefined ? undefined : readSlot(props.search, "Link.search");
  if (search === undefined) return path;
  const query =
    typeof search === "string"
      ? search.replace(/^\?/, "")
      : new URLSearchParams(search as Record<string, string>).toString();
  return query === "" ? path : `${path}?${query}`;
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

  bindProp(scope, element, setAttr, "href", target);
  if (props.class !== undefined) {
    bindProp(scope, element, setClass, "class", () => readSlot(props.class, "Link.class"));
  }

  listen(scope, element, "click", ((event: MouseEvent) => {
    const to = target();
    if (leavesTheApp(to)) return;
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (element.hasAttribute("download") || element.target === "_blank") return;
    event.preventDefault();
    void state.navigate(to, {
      replace:
        props.replace === undefined ? false : Boolean(readSlot(props.replace, "Link.replace")),
      state: props.state === undefined ? undefined : readSlot(props.state, "Link.state"),
    });
  }) as EventListener);

  extra(element, target);

  const children = props.children;
  if (children !== undefined) {
    const value = readSlot(children, "Link.children");
    if (value !== undefined && value !== null) element.append(value as never);
  }
  return element;
}

function LinkImpl(scope: Scope | null, props: Incoming<LinkProps>): Node {
  return anchorElement(scope, props, () => {});
}

export interface NavLinkProps extends LinkProps {
  readonly activeClass?: string;
  /** Exact match instead of the default segment-prefix match. */
  readonly end?: boolean;
}

function NavLinkImpl(scope: Scope | null, props: Incoming<NavLinkProps>): Node {
  const state = useRouter();
  return anchorElement(scope, props as Incoming<LinkProps>, (element, target) => {
    const active = (): boolean => {
      const to = target().split("?")[0] as string;
      const here = state.location().pathname;
      const end = props.end === undefined ? false : Boolean(readSlot(props.end, "NavLink.end"));
      return end ? here === to : isUnder(here, to);
    };
    const activeClass = (): string =>
      (props.activeClass === undefined
        ? "active"
        : (readSlot(props.activeClass, "NavLink.activeClass") as string)) as string;
    bindProp(scope, element, setAttr, "aria-current", () => (active() ? "page" : null));
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
