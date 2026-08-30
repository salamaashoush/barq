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

import type { Route } from "./route.ts";

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
export const REDIRECT = Symbol.for("barq.redirect");
export const NOT_FOUND = Symbol.for("barq.not-found");

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

/** Thrown by a loader or a guard to send the browser somewhere else. */
export class Redirect extends Error implements RedirectLike {
  readonly [REDIRECT] = true as const;
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
  constructor(message = "not found") {
    super(message);
    this.name = "NotFound";
  }
}

/** `throw notFound()`. */
export function notFound(message?: string): never {
  throw new NotFound(message);
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
): (scope: unknown, error: () => Error, reset: () => void) => unknown {
  // ONE report per error OBJECT. The fallback re-renders — a reset, a
  // re-entered branch — and `onCatch` is a notification, not a render step, so
  // firing it every time would report one failure many times to a crash
  // reporter. A `notFound()` is an ANSWER rather than a failure and is not
  // reported at all.
  let reported: unknown = null;
  return (scope, error, reset) => {
    const missing = isNotFound(error());
    if (!missing && reported !== error()) {
      reported = error();
      for (let at = depth; at >= 0; at--) chain[at]?.definition.onCatch?.(error());
    }
    for (let at = depth; at >= 0; at--) {
      const definition = chain[at]?.definition;
      const component = missing
        ? (definition?.notFoundComponent ?? definition?.errorComponent)
        : definition?.errorComponent;
      if (component !== undefined) {
        // Scope-first, like every other component the router invokes. On the
        // string backend it is `null`; on the DOM one it is the fallback arm's
        // own instance scope, and passing `null` there would leave anything the
        // error component created with no owner to die with.
        return (component as unknown as (s: unknown, p: unknown) => unknown)(scope, {
          error,
          reset,
          params,
        });
      }
    }
    // No `errorComponent` anywhere up the chain, so the boundary shows nothing
    // — and shows nothing SILENTLY, which is the shape that made an SSR'd page
    // render as an empty `<div id="app">` with no clue why. A route that has
    // not said what to do with an error still deserves to have the error said
    // out loud once.
    if (!missing) reportUnhandled(chain[depth]?.id ?? `depth ${depth}`, error());
    return null;
  };
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
    `[barq-router] ${route} threw and no route in its chain declares an ` +
      `\`errorComponent\`, so the boundary rendered nothing:\n`,
    error,
  );
}
