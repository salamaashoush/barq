/**
 * The application-wide middleware, declared once.
 *
 * TanStack Start's `createStart`, written in a project's `src/start.ts`:
 *
 * ```ts
 * export const startInstance = createStart(() => ({
 *   requestMiddleware: [logging],
 *   functionMiddleware: [requireSession],
 * }));
 * ```
 *
 * Its own module, importing nothing that reaches `node:async_hooks`, because
 * the client stub reads it: a global function middleware's client half runs in
 * the browser around every call.
 */

import type { Middleware } from "./middleware.ts";

export interface StartOptions {
  /** Runs for every request the server answers: a page, a route handler, a server function. */
  readonly requestMiddleware?: readonly Middleware[];
  /** Runs for every server function, ahead of the function's own chain. */
  readonly functionMiddleware?: readonly Middleware[];
}

export interface StartInstance {
  getOptions(): StartOptions;
}

/**
 * One instance for the process, whichever copy of this module asks.
 *
 * It is configuration, fixed once the application has loaded, so it has none
 * of the hazards an ambient request would: nothing a visitor does changes it.
 * On the global registry for the reason the server-function registry is: a
 * build compiles this module into its server bundle, and a host serving that
 * bundle through its own `serveBarq` has imported a second copy.
 */
const REGISTERED = ((globalThis as Record<symbol, unknown>)[Symbol.for("barq.start.instance")] ??= {
  instance: null,
}) as { instance: StartInstance | null };

const NONE: StartOptions = Object.freeze({});

/**
 * Declare the application's global middleware.
 *
 * The function is called once, the first time anything asks, so a middleware
 * module that imports this one back is fully evaluated by then.
 */
export function createStart(options: () => StartOptions): StartInstance {
  let resolved: StartOptions | undefined;
  const instance: StartInstance = { getOptions: () => (resolved ??= options()) };
  REGISTERED.instance = instance;
  return instance;
}

/** What the application declared, or nothing. */
export function startOptions(): StartOptions {
  return REGISTERED.instance?.getOptions() ?? NONE;
}

/** Test seam. Not for application use. */
export function clearStart(): void {
  REGISTERED.instance = null;
}
