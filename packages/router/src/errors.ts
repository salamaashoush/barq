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

/** `error instanceof Redirect`, without importing a class that shares a name. */
export function isRedirect(error: unknown): error is Redirect {
  return error instanceof Redirect;
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
  constructor(message = "not found") {
    super(message);
    this.name = "NotFound";
  }
}

/** `throw notFound()`. */
export function notFound(message?: string): never {
  throw new NotFound(message);
}

/** `error instanceof NotFound`, for symmetry with `isRedirect`. */
export function isNotFound(error: unknown): error is NotFound {
  return error instanceof NotFound;
}

/**
 * The fallback for one depth's error boundary.
 *
 * One boundary serves both `errorComponent` and `notFoundComponent`, dispatching
 * on the error's CLASS at render time rather than installing two boundaries —
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
  return (scope, error, reset) => {
    const missing = error() instanceof NotFound;
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
