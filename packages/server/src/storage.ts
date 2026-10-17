/**
 * `@barqjs/server/storage`: Solid 2.0's `provideRequestEvent`.
 *
 * Its own entry because it imports `node:async_hooks`. The storage lives on the
 * global under the symbol `getRequestEvent` reads, so separately bundled copies
 * of the runtime, and `@barqjs/start`'s request handlers, share one.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import type { RequestEvent } from "@barqjs/web";

const REQUEST_EVENT = Symbol.for("barq.request-event");

/**
 * Run `cb` with `event` as the current request's, across every `await` inside
 * it. Build the event with `createRequestEvent` from `@barqjs/server`.
 *
 * `AsyncLocalStorage` is constructed on the first call rather than when this
 * module loads: a bundler answers `node:async_hooks` with an empty stub in a
 * browser build, and an isomorphic module that imports this one must still
 * evaluate there.
 */
export function provideRequestEvent<T>(event: RequestEvent, cb: () => T): T {
  const holder = globalThis as { [REQUEST_EVENT]?: AsyncLocalStorage<RequestEvent> };
  if (holder[REQUEST_EVENT] === undefined) {
    if (typeof AsyncLocalStorage !== "function") {
      throw new Error(
        "[barq] A request was entered where `AsyncLocalStorage` from `node:async_hooks` does not exist, so the request cannot be made available to the code it runs. " +
          "It works only on the server. If this is the browser, server-only code reached the browser bundle: move it behind a server function.",
      );
    }
    holder[REQUEST_EVENT] = new AsyncLocalStorage<RequestEvent>();
  }
  return holder[REQUEST_EVENT].run(event, cb);
}
