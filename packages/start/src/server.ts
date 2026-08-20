/**
 * The request handler: one URL shape, one lookup, and the checks that run
 * before a handler body does.
 *
 * Every default here is the strict one, because the survey found the same four
 * failures composing across shipping frameworks — an unvalidated, CSRF-unchecked,
 * publicly-mounted endpoint reached by an id enumerable from the client bundle.
 * Each is cheap to close and expensive to retrofit.
 */

import { InputError, RPC_PREFIX, type ServerFn, isServerFn } from "./index.ts";

/**
 * id → function, and the ONLY way an id becomes callable.
 *
 * A `Map` rather than an object, because the id comes off the wire and an
 * object's prototype is reachable through one. CVE-2025-55182 was CVSS 10.0 and
 * was exactly that: a client-supplied name used as a raw property access, so
 * asking for `constructor` yielded `Function` and then arbitrary code. `Map.get`
 * has no prototype chain to walk into, so the guard is structural rather than a
 * `hasOwnProperty` call someone can later forget.
 */
const REGISTRY = new Map<string, ServerFn<unknown, unknown>>();

/**
 * Mount a server function. The compiler emits one call per EXPORTED server
 * function in a module compiled for the server.
 *
 * Export-ness is what decides reachability, which is SvelteKit's rule and the
 * only genuine notion of an internal server function in the survey: a
 * non-exported one is never registered, so it has no id and no endpoint, and is
 * still callable from its siblings.
 */
export function mount(fn: ServerFn<unknown, unknown>): void {
  if (!isServerFn(fn)) throw new TypeError("mount() takes a server function");
  const id = fn.meta.id;
  if (id === "") throw new TypeError("a mounted server function needs an id");
  if (REGISTRY.has(id)) throw new TypeError(`two server functions claim the id ${id}`);
  REGISTRY.set(id, fn);
}

/** The mounted surface, for the build to record and a reviewer to read. */
export function mounted(): string[] {
  return [...REGISTRY.keys()].toSorted();
}

/** Test seam. Not for application use. */
export function unmountAll(): void {
  REGISTRY.clear();
}

export interface HandlerOptions {
  /**
   * Origins allowed to call, beyond the request's own. Same-origin is always
   * allowed; this widens it.
   */
  allowedOrigins?: readonly string[];
}

/**
 * Is this request allowed to invoke a server function?
 *
 * `Origin` first, then `Sec-Fetch-Site` when `Origin` is absent. That fallback
 * is Waku's post-CVE shape and it is the strictest default found: `Origin` is
 * legitimately absent on some same-origin requests and on non-browser clients,
 * while `Sec-Fetch-Site` is sent by every modern browser and cannot be forged
 * from script. Next.js warns and PROCEEDS on a missing `Origin`; this refuses.
 */
export function originAllowed(request: Request, options?: HandlerOptions): boolean {
  const origin = request.headers.get("origin");
  if (origin !== null) {
    // A sandboxed iframe sends the literal string. Treating it as "absent" is
    // CVE-2026-27978, so it is refused rather than fallen through.
    if (origin === "null") return false;
    if (origin === new URL(request.url).origin) return true;
    return options?.allowedOrigins?.includes(origin) ?? false;
  }
  const site = request.headers.get("sec-fetch-site");
  if (site === null) return false;
  return site === "same-origin" || site === "none";
}

/**
 * Handle one server-function request, or return null if the URL is not one.
 *
 * Returning null rather than a 404 is what lets this compose as middleware in
 * front of a page handler.
 */
export async function handleServerFn(
  request: Request,
  options?: HandlerOptions,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(RPC_PREFIX)) return null;

  // A mutation must not be reachable by navigation. RedwoodSDK shipped server
  // functions invocable over GET (CVE-2026-39371, CVSS 8.1), which made a plain
  // link a one-click mutation carrying SameSite=Lax cookies.
  if (request.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: { allow: "POST" } });
  }
  if (!originAllowed(request, options)) return new Response("forbidden", { status: 403 });

  const id = decodeURIComponent(url.pathname.slice(RPC_PREFIX.length));
  const fn = REGISTRY.get(id);
  if (fn === undefined) return new Response("not found", { status: 404 });

  let input: unknown;
  try {
    const body = (await request.json()) as { input?: unknown };
    input = body?.input;
  } catch {
    return new Response("bad request", { status: 400 });
  }

  try {
    return Response.json(await fn(input));
  } catch (error) {
    // A validation failure is the caller's fault and says so. Anything else is
    // reported without a body: a handler's message can name a table, a column
    // or a path, and none of that is the caller's business.
    if (error instanceof InputError) {
      return Response.json({ error: "invalid input" }, { status: 400 });
    }
    throw error;
  }
}
