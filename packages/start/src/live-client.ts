/**
 * `live`: a server function's answer as a standing one, kept current for as
 * long as the caller reads it, Solid 2.0's declaration.
 *
 * In the browser, calling a live function returns an async iterable that
 * survives its connection. Each connection is a call at the live address,
 * read as server-sent events: a value per event, or, for a frame, the region
 * applied where it is mounted, the same component yielded once per connection
 * so a `dynamic` over it never remounts. A body that ends without saying it
 * is complete is a death, and the loop calls again, after a pause that grows
 * with each failure in a row and resets on a healthy connection, naming the
 * last event it applied. A failure on the first connection rejects as a call
 * would, and so does a refusal the server will repeat.
 *
 * On the server, in process, there is no connection: the call is the call,
 * and a frame it answers with is marked so the page connects once claimed.
 */

import type { ServerFn } from "./client.ts";
import { type LiveIterable, type LiveStub, liveIterable } from "./frames-client.ts";
import { FRAME } from "./frames.ts";

export type { LiveIterable, LiveStatus } from "./frames-client.ts";

/** Whether a server function is the server half, which runs in this process. */
function inProcess(fn: unknown): boolean {
  return typeof fn === "function" && "built" in fn;
}

/**
 * Declare a server function's answer a standing one. In the browser, calling
 * the result returns an iterable that stays connected; on the server it is the
 * call itself, a frame it answers with marked for the page to connect.
 */
export function live<In, Out>(
  fn: ServerFn<In, Out, never>,
): (...args: Parameters<ServerFn<In, Out, never>>) => LiveIterable<Awaited<Out>> {
  if (inProcess(fn)) {
    return ((...args: unknown[]) =>
      (fn as unknown as (...given: unknown[]) => Promise<unknown>)(...args).then((answer) => {
        const frame =
          typeof answer === "function"
            ? (answer as unknown as Record<symbol, { live?: boolean }>)[FRAME]
            : undefined;
        if (frame !== undefined) frame.live = true;
        return answer;
      })) as never;
  }
  return ((options?: unknown) => liveIterable(fn as unknown as LiveStub, options)) as never;
}
