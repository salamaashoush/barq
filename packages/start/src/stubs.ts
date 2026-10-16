/**
 * The stubs a page has made, and how `live` calls one: a module of its own so
 * the frames client finds a stub by id without importing the stub's module.
 */

/** What the registry holds: a callable stub that knows its id. */
export type Stub = ((options?: unknown) => Promise<unknown>) & {
  readonly meta: { readonly id: string };
};

/** A call at the live address: where the last connection left off, and how to end this one. */
export interface LiveRequest {
  readonly lastEventId: string | null;
  readonly signal: AbortSignal;
}

/** How `live` calls a stub at the live address, its client middleware around the fetch. */
export const LIVE_CALL: unique symbol = Symbol.for("barq.server-fn.live");

/**
 * Every stub this page has made, by id: what a frame the page carries asks for
 * its connection through when it was called through `live` on the server.
 */
const STUBS = new Map<string, Stub>();

export function registerStub(id: string, stub: Stub): void {
  STUBS.set(id, stub);
}

export function clientStub(id: string): Stub | undefined {
  return STUBS.get(id);
}
