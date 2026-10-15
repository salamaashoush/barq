/**
 * Static server functions: answered once, at prerender time, and read back as
 * files.
 *
 * `staticFunctionMiddleware` is TanStack's. While the build prerenders, its
 * server half writes each call's answer to `/_barq/static/<key>.json` in the
 * client output; in the browser its client half asks for that file first and
 * calls the server only when there is none. A site prerendered whole can then
 * answer these calls from a static host with no server at all.
 *
 * Nothing here imports anything that is not safe in a browser: the client stub
 * names this middleware, so the whole module reaches the client bundle. The
 * writer that touches the disk belongs to the prerenderer and is handed over
 * through {@link installStaticWriter}.
 */

import { decodeWire, encodeWire } from "@barqjs/server/codec";

import { createMiddleware } from "./middleware.ts";

/** Where a static answer is served from, under the client output. */
export const STATIC_PREFIX = "/_barq/static/";

/** What a static answer file holds. */
export interface StaticAnswer {
  readonly result: unknown;
}

/**
 * What the prerenderer hands over to receive each answer: the file's key, the
 * function and input it was derived from, and the file's contents.
 */
export type StaticWriter = (key: string, identity: string, answer: string) => Promise<void>;

/**
 * One writer per process, whichever copy of this module asks: the prerenderer
 * imports the server bundle, which carries a copy of its own, and installs the
 * writer from outside it.
 */
const SHARED = ((globalThis as Record<symbol, unknown>)[Symbol.for("barq.start.static-writer")] ??=
  { writer: null }) as { writer: StaticWriter | null };

/** Install the prerenderer's writer, or remove it with `null`. Not for application use. */
export function installStaticWriter(writer: StaticWriter | null): void {
  SHARED.writer = writer;
}

/**
 * The input as one string that does not depend on how the caller ordered its
 * keys: `{ a, b }` and `{ b, a }` are the same call and must find the same
 * file.
 */
export function canonicalInput(input: unknown): string {
  return JSON.stringify(encodeWire(sorted(input)));
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (typeof value !== "object" || value === null) return value;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).toSorted()) {
    out[key] = sorted((value as Record<string, unknown>)[key]);
  }
  return out;
}

/**
 * The file name for one function and one input.
 *
 * Two independent 53-bit hashes, so a name is 106 bits wide: a collision would
 * hand one input's answer to another, and the prerenderer refuses one outright
 * if it ever sees it. Not a cryptographic hash, because nothing here is secret
 * and `crypto.subtle` exists only in a secure context, which a page served over
 * plain HTTP is not.
 */
export function staticKey(id: string, input: string): string {
  const text = `${id}\n${input}`;
  return (
    hash53(text, 0x9e3779b9).toString(16).padStart(14, "0") +
    hash53(text, 0x85ebca6b).toString(16).padStart(14, "0")
  );
}

function hash53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Where the answer for one call is, as a URL. */
export function staticUrl(id: string, input: unknown): string {
  return `${STATIC_PREFIX}${staticKey(id, canonicalInput(input))}.json`;
}

/** Whether an answer can be written to a file and read back as the same value. */
function cacheable(answer: unknown): boolean {
  if (answer instanceof Response || answer instanceof ReadableStream) return false;
  return !(
    typeof answer === "object" &&
    answer !== null &&
    typeof (answer as Partial<AsyncIterable<unknown>>)[Symbol.asyncIterator] === "function"
  );
}

const MISSING = Symbol("missing");

/** The file's answer, or {@link MISSING} when there is no file to read. */
async function readStatic(id: string, input: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(staticUrl(id, input), { headers: { accept: "application/json" } });
  } catch {
    return MISSING;
  }
  // A dev server or a host with an SPA fallback answers a missing file with a
  // page, so the type is what says the file exists.
  if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) {
    return MISSING;
  }
  return decodeWire<StaticAnswer>(await response.json()).result;
}

/**
 * Make a server function static: answered at prerender time, read from a file
 * afterwards.
 *
 * List it LAST: the key is the input as this middleware sees it, which is the
 * input the caller passed only when nothing before it has validated or
 * reshaped it. An input no prerendered page called with has no file, and the
 * call goes to the server as any other would.
 *
 * Only the RESULT is stored. What a server middleware sends back with
 * `sendContext` is not, and a `Response` or a stream is never written.
 */
export const staticFunctionMiddleware = /* @__PURE__ */ createMiddleware({ type: "function" })
  .client(async ({ next, data, serverFnMeta }) => {
    if (serverFnMeta === undefined || serverFnMeta.id === "" || data instanceof FormData) {
      return next();
    }
    const found = await readStatic(serverFnMeta.id, data);
    return found === MISSING ? next() : found;
  })
  .server(async ({ next, data, serverFnMeta }) => {
    const answer: unknown = await next();
    const writer = SHARED.writer;
    if (
      writer !== null &&
      serverFnMeta !== undefined &&
      serverFnMeta.id !== "" &&
      !(data instanceof FormData) &&
      cacheable(answer)
    ) {
      const input = canonicalInput(data);
      await writer(
        staticKey(serverFnMeta.id, input),
        `${serverFnMeta.id}\n${input}`,
        JSON.stringify(encodeWire({ result: answer } satisfies StaticAnswer)),
      );
    }
    return answer;
  });
