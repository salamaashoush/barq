import type { AddressedRequest } from "./context.ts";

export interface ProxyOptions {
  /** Set on the forwarded request, replacing what the client sent under the same names. */
  headers?: HeadersInit;
  /**
   * Request headers not to forward, beyond the hop-by-hop ones.
   *
   * `accept-encoding` is left out by default: `fetch` decodes the body it gets
   * back, so the runtime has to ask only for encodings it can decode, and
   * Node before 24 cannot decode the zstd a browser asks for.
   */
  drop?: readonly string[];
  /**
   * Follow the upstream's redirects here, or hand them to the client.
   * `"manual"` by default: a sign-in's 303 sets cookies the browser has to
   * receive with it, and following it here would answer with the page it
   * points at and lose them.
   */
  redirect?: RequestRedirect;
  /**
   * What to do with a `Location` pointing at the upstream: by default it
   * keeps its path and drops the upstream's origin, which is right when the
   * proxy serves the upstream's paths as they are. A function maps it
   * otherwise, and `false` leaves it alone.
   */
  location?: false | ((location: URL) => string);
  /** Add `x-forwarded-for`, `-host` and `-proto`. On by default. */
  forwarded?: boolean;
  signal?: AbortSignal;
  /** The `fetch` to call. The global one by default. */
  fetch?: (request: Request) => Promise<Response>;
}

/** Headers that describe one connection and must not cross a proxy. */
const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

/**
 * Forward a request to another server and answer with its response.
 *
 * For an app whose API lives elsewhere: the browser talks only to this
 * origin, so cookies stay first-party and nothing needs CORS.
 *
 * ```ts
 * export const Route = createFileRoute("/api/$")({
 *   server: {
 *     handlers: {
 *       ANY: ({ request }) => {
 *         const url = new URL(request.url);
 *         return proxyRequest(request, `${API}${url.pathname}${url.search}`);
 *       },
 *     },
 *   },
 * });
 * ```
 *
 * The body streams both ways. A redirect whose `Location` points back at the
 * upstream is rewritten to this origin (see `location`), so the client follows
 * it through the proxy rather than around it.
 */
export async function proxyRequest(
  request: Request,
  target: string | URL,
  options: ProxyOptions = {},
): Promise<Response> {
  const destination = new URL(target);
  const incoming = new URL(request.url);

  const headers = new Headers(request.headers);
  for (const name of [
    ...HOP_BY_HOP,
    "host",
    "content-length",
    ...(options.drop ?? ["accept-encoding"]),
  ]) {
    headers.delete(name);
  }
  for (const name of (request.headers.get("connection") ?? "").split(",")) {
    if (name.trim() !== "") headers.delete(name.trim());
  }
  if (options.forwarded !== false) {
    const address = (request as AddressedRequest).ip;
    if (address !== undefined) {
      const before = request.headers.get("x-forwarded-for");
      headers.set("x-forwarded-for", before === null ? address : `${before}, ${address}`);
    }
    headers.set("x-forwarded-host", request.headers.get("host") ?? incoming.host);
    headers.set("x-forwarded-proto", incoming.protocol.slice(0, -1));
  }
  for (const [name, value] of new Headers(options.headers)) headers.set(name, value);

  const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.body !== null;
  const outgoing = new Request(destination, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: options.redirect ?? "manual",
    signal: options.signal ?? request.signal,
    ...(hasBody ? { duplex: "half" } : {}),
  });

  const answer = await (options.fetch ?? fetch)(outgoing);

  const back = new Headers(answer.headers);
  for (const name of HOP_BY_HOP) back.delete(name);
  // `fetch` decoded the body; the length and encoding describe bytes no
  // longer being sent.
  if (back.has("content-encoding")) {
    back.delete("content-encoding");
    back.delete("content-length");
  }
  const location = back.get("location");
  if (location !== null && options.location !== false) {
    const pointed = new URL(location, destination);
    if (pointed.origin === destination.origin) {
      back.set(
        "location",
        options.location?.(pointed) ?? `${pointed.pathname}${pointed.search}${pointed.hash}`,
      );
    }
  }
  return new Response(answer.body, {
    status: answer.status,
    statusText: answer.statusText,
    headers: back,
  });
}
