/**
 * `@barqjs/server/storage`: Solid 2.0's `provideRequestEvent`.
 *
 * Its own entry because it imports `node:async_hooks`. The storage lives on the
 * global under the symbol `getRequestEvent` reads, so separately bundled copies
 * of the runtime, and `@barqjs/start`'s request handlers, share one.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import type { RequestEvent } from "@barqjs/core";

const REQUEST_EVENT = Symbol.for("barq.request-event");

/** Run `cb` with `event` as the current request's, across every `await` inside it. */
export function provideRequestEvent<T>(event: RequestEvent, cb: () => T): T {
  const holder = globalThis as { [REQUEST_EVENT]?: AsyncLocalStorage<RequestEvent> };
  holder[REQUEST_EVENT] ??= new AsyncLocalStorage<RequestEvent>();
  return holder[REQUEST_EVENT].run(event, cb);
}
