import { isServer } from "@barqjs/web";

export interface UrlStateOptions {
  /** The parameter of the hash the state is kept under: `#state=…`. @default "state" */
  key?: string;
}

export interface UrlStateLinkOptions extends UrlStateOptions {
  /** The page the link opens; its hash keeps its other parameters. @default the current page */
  base?: string;
}

export interface WriteUrlStateOptions extends UrlStateOptions {
  /** A new history entry, or the current one rewritten. @default "replace" */
  history?: "replace" | "push";
}

const DEFAULT_KEY = "state";
// `btoa` takes a binary string, and `String.fromCharCode` a bounded argument list.
const CHUNK = 0x8000;

async function through(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const piped = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const standard = text.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(standard + "=".repeat((4 - (standard.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);
  return bytes;
}

/**
 * A JSON value as a string a URL carries: its JSON compressed with
 * `deflate-raw` and written in base64url, so it needs no escaping in a hash or
 * a query.
 *
 * ```ts
 * const encoded = await encodeUrlState({ files: { "main.toy": "print 1" } });
 * ```
 *
 * It rejects a value `JSON.stringify` cannot write, such as one with a cycle.
 */
export async function encodeUrlState(value: unknown): Promise<string> {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError("encodeUrlState: the value has no JSON form");
  const bytes = new TextEncoder().encode(json);
  return toBase64Url(await through(bytes, new CompressionStream("deflate-raw")));
}

/**
 * The value {@link encodeUrlState} wrote. It rejects text that is not base64url,
 * not `deflate-raw`, or not JSON: a link cut short or edited by hand.
 */
export async function decodeUrlState<T = unknown>(encoded: string): Promise<T> {
  const bytes = await through(fromBase64Url(encoded), new DecompressionStream("deflate-raw"));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function hashParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
}

function withState(href: string, key: string, encoded: string): string {
  const url = new URL(href);
  const params = hashParams(url.hash);
  params.set(key, encoded);
  url.hash = params.toString();
  return url.href;
}

/**
 * The state kept in the page's hash under `key`, or `undefined` when there is
 * none or it does not decode. On a server, which never sees a hash, it is
 * always `undefined`.
 *
 * ```ts
 * const shared = await readUrlState<Workspace>();
 * ```
 */
export async function readUrlState<T = unknown>(
  options: UrlStateOptions = {},
): Promise<T | undefined> {
  if (isServer) return undefined;
  const encoded = hashParams(location.hash).get(options.key ?? DEFAULT_KEY);
  if (encoded === null || encoded === "") return undefined;
  try {
    return await decodeUrlState<T>(encoded);
  } catch {
    return undefined;
  }
}

/**
 * A link to `base` that carries `value` in its hash, beside whatever else the
 * hash already holds.
 */
export async function urlStateLink(
  value: unknown,
  options: UrlStateLinkOptions = {},
): Promise<string> {
  const encoded = await encodeUrlState(value);
  const base = options.base ?? (isServer ? "http://localhost/" : location.href);
  return withState(base, options.key ?? DEFAULT_KEY, encoded);
}

/**
 * Put `value` in the page's own hash, so the address bar is the link to it,
 * and answer with that address. It rewrites the history entry by default, and
 * neither navigates, scrolls nor fires `hashchange`. On a server it only
 * answers with the link.
 */
export async function writeUrlState(
  value: unknown,
  options: WriteUrlStateOptions = {},
): Promise<string> {
  const href = await urlStateLink(value, options);
  if (isServer) return href;
  if (options.history === "push") history.pushState(history.state, "", href);
  else history.replaceState(history.state, "", href);
  return href;
}
