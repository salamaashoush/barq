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

import { type AnySerializationAdapter, registerSerializationAdapters } from "@barqjs/server/codec";

import type { ChainContribution, Empty, Middleware } from "./middleware.ts";

export interface StartOptions {
  /** Runs for every request the server answers: a page, a route handler, a server function. */
  readonly requestMiddleware?: readonly Middleware[];
  /** Runs for every server function, ahead of the function's own chain. */
  readonly functionMiddleware?: readonly Middleware[];
  /**
   * How a type only the application knows crosses the wire, in a server
   * function's input and result and in the page's seed. Installed when the
   * options are first read, which both sides do before they encode anything.
   */
  readonly serializationAdapters?: readonly AnySerializationAdapter[];
  readonly serverFns?: {
    /**
     * The `fetch` every call goes out through, in place of the global one. A
     * client middleware's `next({ fetch })` and the call's own `fetch` win
     * over it.
     */
    readonly fetch?: typeof fetch;
  };
}

export interface StartInstance<Options extends StartOptions = StartOptions> {
  getOptions(): Options;
}

declare const UNREGISTERED: unique symbol;

/**
 * Where an application tells the types about its `src/start.ts`:
 *
 * ```ts
 * declare module "@barqjs/start" {
 *   interface Register {
 *     start: typeof startInstance;
 *   }
 * }
 * ```
 *
 * With that, what the global middleware passes to `next({ context })` is typed
 * in every server function's `context` and in `getGlobalStartContext()`.
 * Without it they are untyped, never wrong. The member below exists so the
 * interface is not the empty object type before anything augments it.
 */
export interface Register {
  readonly [UNREGISTERED]?: never;
}

type RegisteredInstance = Register extends { readonly start: infer Instance }
  ? Instance
  : StartInstance;

/** What an instance's request middleware adds, for the whole request. */
export type RequestContextOf<Instance> =
  Instance extends StartInstance<infer Options>
    ? ChainContribution<NonNullable<Options["requestMiddleware"]>>["context"]
    : Empty;

/** What an instance's middleware hands every server function: request, then function. */
export type FunctionContextOf<Instance> =
  Instance extends StartInstance<infer Options>
    ? RequestContextOf<Instance> &
        ChainContribution<NonNullable<Options["functionMiddleware"]>>["context"]
    : Empty;

/** What the registered global request middleware adds, for the whole request. */
export type GlobalRequestContext = RequestContextOf<RegisteredInstance>;

/** What every server function's `context` starts from. */
export type GlobalFunctionContext = FunctionContextOf<RegisteredInstance>;

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
export function createStart<const Options extends StartOptions>(
  options: () => Options,
): StartInstance<Options> {
  let resolved: Options | undefined;
  const instance: StartInstance<Options> = {
    getOptions: () => {
      if (resolved === undefined) {
        resolved = options();
        if (resolved.serializationAdapters !== undefined) {
          registerSerializationAdapters(resolved.serializationAdapters);
        }
      }
      return resolved;
    },
  };
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
