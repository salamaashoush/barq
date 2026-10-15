/**
 * The answers a loader can throw, and the fallback both backends share.
 *
 * Its own module rather than `server.ts`'s, and the reason is the bundle rather
 * than tidiness: `components.ts` needs `errorFallbackFor` for the DOM path, and
 * `server.ts` imports `@barqjs/server` and `@barqjs/start`. Reaching for it
 * there would put the whole server runtime in the client graph, reached by an
 * import rather than by a server function.
 *
 * Nothing here touches a `Request`, a `Response` or the DOM.
 */

import { errorOwnerPath, isDev } from "@barqjs/core";

import { interpolate } from "./path.ts";
import { type Route, ROOT_ROUTE_ID } from "./route.ts";
import type { NavigateOptionsFor } from "./register.ts";
import type { NavigateOptions } from "./router.ts";
import { toSearchString } from "./search.ts";

/**
 * The two brands, and why they are `Symbol.for` rather than a shared import.
 *
 * A server function throws these and `@barqjs/start` has to recognise them — but
 * start CANNOT import this module. The dependency runs router -> start, and it
 * is an OPTIONAL peer at that: `@barqjs/router` resolves and runs with no
 * `@barqjs/start` installed, so a value import here would break the router for
 * everyone using it without server functions.
 *
 * The global symbol registry is what that constraint is for. Both packages
 * write `Symbol.for("barq.redirect")` independently and get the identical
 * symbol, with no edge between them — the same arrangement `SERVER_FN` already
 * uses in `@barqjs/start/client`. The other declaration is in
 * `packages/start/src/client.ts`; the two are checked against each other by
 * `errors.test.ts`.
 *
 * IT ALSO FIXES A BUG `instanceof` HAS. Two copies of `@barqjs/router` in one
 * page — a mis-deduped transitive dependency, which is ordinary — give two
 * `Redirect` classes, and a redirect thrown through one is invisible to the
 * other's `instanceof`. A brand is the same symbol in both.
 */
export const REDIRECT: unique symbol = Symbol.for("barq.redirect");
export const NOT_FOUND: unique symbol = Symbol.for("barq.not-found");

/**
 * What a redirect looks like to anything that did not construct it.
 *
 * `@barqjs/start` throws its own branded value on the client when a server
 * function's redirect comes back over the wire — it cannot reach the class
 * above — so every consumer here is written against this shape rather than
 * against `Redirect` itself.
 */
export interface RedirectLike {
  readonly to: string;
  readonly status: number;
}

/**
 * TanStack's `redirect` options: a navigation, plus what the HTTP answer carries.
 *
 * `statusCode` defaults to 307 here, as theirs does, while the positional form
 * keeps its 302.
 */
export interface RedirectOptions extends NavigateOptions, RedirectAnswer {}

/** What a redirect says besides where it goes. */
export interface RedirectAnswer {
  readonly statusCode?: number;
  /** TanStack's deprecated spelling of `statusCode`. */
  readonly code?: number;
  readonly headers?: HeadersInit;
  /** Throw the redirect instead of returning it. */
  readonly throw?: unknown;
}

/**
 * The target of an options-form redirect, as far as it can be known with no
 * router to ask.
 *
 * A redirect a server function throws crosses the wire as `to` and `status`
 * alone, so whatever can be resolved has to be resolved where it is thrown. A
 * relative `to` and an updater function need the current location; the router
 * resolves those from `options` when it catches the redirect in process.
 */
function staticTarget(options: RedirectOptions): string {
  if (options.href !== undefined) return options.href;
  const to = options.to ?? ".";
  const given = options.params;
  let path = to;
  if (to.startsWith("/") && typeof given === "object" && given !== null) {
    try {
      path = interpolate(to, given as Record<string, string>);
    } catch {
      path = to;
    }
  }
  const search = options.search;
  const query =
    typeof search === "string"
      ? search === "" || search.startsWith("?")
        ? search
        : `?${search}`
      : typeof search === "object" && search !== null
        ? toSearchString(search)
        : "";
  const hash = typeof options.hash === "string" && options.hash !== "" ? options.hash : "";
  return `${path}${query}${hash === "" ? "" : `#${hash.replace(/^#/, "")}`}`;
}

/** Thrown by a loader or a guard to send the browser somewhere else. */
export class Redirect extends Error implements RedirectLike {
  readonly [REDIRECT] = true as const;
  readonly to: string;
  readonly status: number;
  readonly statusCode: number;
  readonly headers?: HeadersInit;
  /** The navigation an options-form redirect described, for the router to resolve. */
  readonly options?: RedirectOptions;
  constructor(to: string | RedirectOptions, status?: number) {
    const target = typeof to === "string" ? to : staticTarget(to);
    super(`redirect to ${target}`);
    this.name = "Redirect";
    this.to = target;
    this.status =
      typeof to === "string" ? (status ?? 302) : (to.statusCode ?? to.code ?? status ?? 307);
    this.statusCode = this.status;
    if (typeof to !== "string") {
      this.options = to;
      this.headers = to.headers;
    }
  }
}

/**
 * `throw redirect("/login")`, or TanStack's `throw redirect({ to: "/login" })`.
 *
 * The positional form throws by itself. The options form RETURNS the redirect,
 * as theirs does, so it is written `throw redirect({...})`, and throws by
 * itself only when `throw` is set.
 */
export function redirect(to: string, status?: number): never;
export function redirect<const To extends string = ".", const From extends string = string>(
  options: NavigateOptionsFor<To, From> & RedirectAnswer & { readonly throw: true },
): never;
export function redirect<const To extends string = ".", const From extends string = string>(
  options: NavigateOptionsFor<To, From> & RedirectAnswer,
): Redirect;
export function redirect(to: string | RedirectOptions, status?: number): Redirect {
  const made = new Redirect(to, status);
  if (typeof to === "string" || Boolean(to.throw)) throw made;
  return made;
}

/**
 * Whether a thrown value is a redirect, by BRAND rather than by class.
 *
 * A redirect a server function threw is reconstructed by `@barqjs/start` and is
 * not an instance of the class above; see {@link REDIRECT}.
 */
export function isRedirect(error: unknown): error is Redirect & RedirectLike {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as Record<symbol, unknown>)[REDIRECT] === true
  );
}

/**
 * Thrown by a loader for "this exists as a route, and the thing it names does
 * not".
 *
 * A separate class from an ordinary failure because it is an ANSWER: it renders
 * different markup and, when it is known before the shell flushes, it answers a
 * different status. A row that is missing is not a bug in the page.
 */
export class NotFound extends Error {
  readonly [NOT_FOUND] = true as const;
  /** TanStack's own brand, so code written against `error.isNotFound` ports. */
  readonly isNotFound = true as const;
  /** Handed to the `notFoundComponent` that renders this. */
  readonly data?: unknown;
  /** The route whose `notFoundComponent` should answer, instead of the thrower's. */
  readonly routeId?: string;
  /** Response headers for the 404, when it is answered on the server. */
  readonly headers?: HeadersInit;
  constructor(message: string | NotFoundOptions = "not found") {
    super(typeof message === "string" ? message : "not found");
    this.name = "NotFound";
    if (typeof message !== "string") {
      this.data = message.data;
      this.routeId = message.global === true ? ROOT_ROUTE_ID : message.routeId;
      this.headers = message.headers;
    }
  }
}

/** TanStack's `NotFoundError` options. */
export interface NotFoundOptions {
  readonly data?: unknown;
  readonly routeId?: string;
  readonly headers?: HeadersInit;
  /** Throw instead of returning. */
  readonly throw?: boolean;
  /** TanStack's deprecated spelling of `routeId: "__root__"`. */
  readonly global?: boolean;
}

/**
 * `throw notFound()`, or TanStack's `throw notFound({ data, routeId })`.
 *
 * With no argument or a message it throws by itself. The options form RETURNS
 * the error, as theirs does, and throws by itself only when `throw` is set.
 */
export function notFound(message?: string): never;
export function notFound(options: NotFoundOptions & { readonly throw: true }): never;
export function notFound(options: NotFoundOptions): NotFound;
export function notFound(message?: string | NotFoundOptions): NotFound {
  const made = new NotFound(message);
  if (typeof message !== "object" || message.throw === true) throw made;
  return made;
}

/**
 * A route's `params.parse` refused the segment the URL gave it.
 *
 * The path analogue of `SearchParamError`, and the same shape for the same
 * reason: `/users/abc` where `abc` had to be a number is a bad REQUEST, not a
 * bug, so it renders that route's `errorComponent` rather than taking the page.
 * `cause` carries whatever the parse threw, so a schema's own issues survive.
 */
export class PathParamError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PathParamError";
  }
}

/** By brand rather than by class, for the reason {@link REDIRECT} gives. */
export function isNotFound(error: unknown): error is NotFound {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as Record<symbol, unknown>)[NOT_FOUND] === true
  );
}

/**
 * The fallback for one depth's error boundary.
 *
 * One boundary serves both `errorComponent` and `notFoundComponent`, dispatching
 * on the error's BRAND at render time rather than installing two boundaries —
 * core's error boundary is a branch with two arms, and a second one nested
 * inside it would catch nothing the first did not.
 *
 * The chain is searched OUTWARD from the failing depth, so one at the root
 * covers everything and a route may override it. `notFound` falls through to
 * `errorComponent`, because a page that styles its errors and forgets its 404s
 * should get the styled one rather than a blank.
 */
export function errorFallbackFor(
  chain: readonly Route[],
  depth: number,
  params: () => Record<string, string>,
  fallbacks?: ErrorFallbacks,
): (error: () => Error, reset: () => void) => unknown {
  // ONE report per error OBJECT. The fallback re-renders — a reset, a
  // re-entered branch — and `onCatch` is a notification, not a render step, so
  // firing it every time would report one failure many times to a crash
  // reporter. A `notFound()` is an ANSWER rather than a failure and is not
  // reported at all.
  let reported: unknown = null;
  watchUnload();
  return (error, reset) => {
    const thrown = error();
    if (abortedByUnload(thrown)) {
      retries.add(reset);
      return null;
    }
    const missing = isNotFound(thrown);
    if (!missing && reported !== thrown) {
      reported = thrown;
      let told = false;
      for (let at = depth; at >= 0; at--) {
        const own = chain[at]?.definition.onCatch;
        if (own === undefined) continue;
        told = true;
        own(thrown);
      }
      if (!told) fallbacks?.onCatch?.(thrown);
    }
    // `notFound({ routeId })` names the route that answers. A route below the
    // boundary that caught cannot render here, so only an ancestor moves the
    // search's starting point.
    const named = missing && thrown.routeId !== undefined ? thrown.routeId : undefined;
    const target = named === undefined ? -1 : chain.findIndex((route) => route.id === named);
    const from = target !== -1 && target <= depth ? target : depth;
    const data = missing ? thrown.data : undefined;
    for (let at = from; at >= 0; at--) {
      const definition = chain[at]?.definition;
      const component = missing
        ? (definition?.notFoundComponent ?? definition?.errorComponent)
        : definition?.errorComponent;
      if (component !== undefined) {
        // A component is a function of its props; whatever it creates is owned
        // by the fallback arm's own instance scope, which the boundary entered
        // before invoking this.
        return (component as unknown as (p: unknown) => unknown)({
          error,
          reset,
          params,
          data: () => data,
        });
      }
    }
    const last = missing
      ? (fallbacks?.notFoundComponent ?? fallbacks?.errorComponent)
      : fallbacks?.errorComponent;
    if (last !== undefined) {
      return (last as unknown as (p: unknown) => unknown)({
        error,
        reset,
        params,
        data: () => data,
      });
    }
    // No `errorComponent` anywhere up the chain, so the boundary shows nothing
    // — and shows nothing SILENTLY, which is the shape that made an SSR'd page
    // render as an empty `<div id="app">` with no clue why. A route that has
    // not said what to do with an error still deserves to have the error said
    // out loud once.
    if (missing) return null;
    const route = chain[depth]?.id ?? `depth ${depth}`;
    reportUnhandled(route, thrown);
    // In development the region says what happened instead of standing empty.
    // Text, so the server's string and the browser's node are the same thing.
    return isDev ? unhandledText(route, thrown) : null;
  };
}

let unloading = false;
let watching = false;
const retries = new Set<() => void>();

/**
 * A browser cancels the fetches of a page it is unloading, and the rejection
 * reaches a route like any other. `pagehide` is the one event every browser
 * fires on the way out, and `pageshow` the one that says the page came back
 * from the back/forward cache, where what the unload stopped is asked again.
 */
function watchUnload(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  window.addEventListener("pagehide", () => {
    unloading = true;
  });
  window.addEventListener("pageshow", () => {
    unloading = false;
    const due = [...retries];
    retries.clear();
    for (const retry of due) retry();
  });
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { readonly name?: unknown }).name === "AbortError"
  );
}

/** An abort the browser raised because the page is going away, which no route caused. */
export function abortedByUnload(error: unknown): boolean {
  return unloading && isAbortError(error);
}

/** The router-wide answers a chain falls back to: `defaultErrorComponent` and friends. */
export interface ErrorFallbacks {
  readonly errorComponent?: unknown;
  readonly notFoundComponent?: unknown;
  readonly onCatch?: (error: Error) => void;
}

/**
 * What a development build shows where a route with no `errorComponent` failed:
 * the route, the error and the component it was thrown in.
 */
export function unhandledText(route: string, error: Error): string {
  const path = errorOwnerPath(error);
  return (
    `The route ${JSON.stringify(route)} threw ${error.name}: ${error.message}` +
    (path === undefined ? "" : ` (in ${path.join(" › ")})`) +
    ". No route up the chain declares an `errorComponent`, so this text stands in for one in " +
    "development; a production build renders nothing here. Add `errorComponent` to the route, " +
    "or to the root route to cover every page."
  );
}

/**
 * An error a boundary caught that nothing was written to display.
 *
 * `console.error` rather than a rethrow: rethrowing here tears the document
 * mid-body on the streamed path, which is strictly worse than an empty region.
 * What was missing was not a different recovery — it was any evidence at all.
 */
function reportUnhandled(route: string, error: Error): void {
  console.error(
    `[barq-router] The route ${JSON.stringify(route)} threw while rendering, and neither it nor a parent route declares an \`errorComponent\`, so that part of the page is empty. ` +
      `Add \`errorComponent\` to the route, or to the root route to cover every page. The error:\n`,
    error,
  );
}
