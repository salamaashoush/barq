/**
 * The request handler: one URL shape, one lookup, and the checks that run
 * before a handler body does.
 *
 * Every default here is the strict one, because the survey found the same four
 * failures composing across shipping frameworks — an unvalidated, CSRF-unchecked,
 * publicly-mounted endpoint reached by an id enumerable from the client bundle.
 * Each is cheap to close and expensive to retrofit.
 */

import { decodeWire, encodeWire } from "@barqjs/server/codec";

import { applyResponseDraft, createResponseDraft, draftedStatus, withRequest } from "./context.ts";
import { DATA_SUFFIX, InputError, RPC_PREFIX, type ServerFn, isServerFn } from "./index.ts";

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
export function mount(id: string, fn: ServerFn<unknown, unknown>): void {
  if (!isServerFn(fn)) throw new TypeError("mount() takes a server function");
  if (id === "") throw new TypeError("a mounted server function needs an id");
  if (REGISTRY.has(id)) throw new TypeError(`two server functions claim the id ${id}`);
  // Stamped rather than read. The compiler leaves the SERVER half of a module
  // alone — it is the module, compiled — so the builder has no id of its own;
  // the id lives in the manifest the build generates, and mounting is where the
  // two meet. `formAttr` reads it back off the function to write a form's
  // action, so a function that is mounted has a URL and one that is not has
  // neither an id nor an endpoint.
  fn.meta.id = id;
  REGISTRY.set(id, fn);
}

/** The mounted surface, for the build to record and a reviewer to read. */
export function mounted(): string[] {
  return [...REGISTRY.keys()].toSorted();
}

/**
 * The function mounted at an id, or `undefined`.
 *
 * Exported for the BUILD's chain check, which has to ask each reachable id what
 * middleware it actually carries. It reads the registry inside whichever bundle
 * it is called from, which is why the check runs through the server entry
 * rather than from the Vite plugin: `resolve.noExternal` compiles `@barqjs/*`
 * INTO the ssr bundle, so a plugin importing this module would be asking a
 * second, empty registry.
 */
export function mountedFn(id: string): ServerFn<unknown, unknown> | undefined {
  return REGISTRY.get(id);
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
  /**
   * Whether some route in this application can reach this id.
   *
   * The narrow half of the route-action manifest. Export-ness already decides
   * what is MOUNTED, and that is deliberately generous — a server function
   * exported for a sibling to import is mounted whether or not any page calls
   * it. Next.js concedes the consequence in its own release notes: "Even if a
   * Server Action or utility function is not imported elsewhere in your code,
   * it's still a publicly accessible HTTP endpoint."
   *
   * This closes that: an id no route reaches answers the 404 an unknown id
   * already answers, so the two are indistinguishable from outside.
   *
   * It takes NO route from the caller, deliberately. A client-supplied route
   * selecting a policy lets the caller pick the weakest one that reaches the
   * action, and this file's own rule says why that is not allowed — values
   * derived from the request are fine to navigate to and never fine to
   * authorize with. Which CHAIN runs is decided at build time by
   * `@barqjs/router`, not here and not per request.
   */
  reachable?: (id: string) => boolean;
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

  // The URL decides the shape, so a form and an RPC call cannot be confused for
  // one another by a header either of them can set.
  const path = url.pathname.slice(RPC_PREFIX.length);
  const isData = path.endsWith(DATA_SUFFIX);
  const id = decodeURIComponent(isData ? path.slice(0, -DATA_SUFFIX.length) : path);

  const fn = REGISTRY.get(id);
  if (fn === undefined) return new Response("not found", { status: 404 });
  // Same answer as an unknown id, so a caller cannot tell a function that
  // exists but is unrouted from one that does not exist.
  if (options?.reachable?.(id) === false) return new Response("not found", { status: 404 });

  let input: unknown;
  if (isData && !isFormBody(request)) {
    try {
      const body = (await request.json()) as { input?: unknown };
      input = body?.input === undefined ? undefined : decodeWire(body.input);
    } catch {
      return new Response("bad request", { status: 400 });
    }
  } else {
    try {
      input = await request.formData();
    } catch {
      return new Response("bad request", { status: 400 });
    }
  }

  // The draft the handler writes to through `setCookie` / `setResponseHeader`,
  // held HERE because the response is built after the handler has returned.
  const draft = createResponseDraft();
  try {
    // `{ data }` on the value channel; a bare `FormData` on the form one, which
    // is the shape `<form action={fn}>` hands the function on the enhanced path
    // — so a handler sees the same input type whether or not JS ran.
    const result = await withRequest(
      request,
      () => (input instanceof FormData ? fn(input) : fn({ data: input })),
      { response: draft },
    );
    // A RETURNED RESPONSE IS HONOURED ON BOTH CHANNELS, and it did not used to
    // be: the value channel handed it to `encodeWire`, which answered
    // `Seroval Error (step: 1)` and a 500 with nothing in it. So a function that
    // set a cookie by returning a response worked with JS disabled and crashed
    // with JS enabled — the one divergence the form path exists to prevent.
    if (result instanceof Response) return applyResponseDraft(result, draft);
    if (isData) {
      // `draftedStatus` here and NOT inside `applyResponseDraft`, because the
      // two answer different questions: this response is the framework's to
      // build, so `setResponseStatus(201)` decides it — where a response the
      // handler RETURNED has already decided for itself.
      return applyResponseDraft(
        Response.json(encodeWire(result), draftedStatus(draft, 200)),
        draft,
      );
    }
    // Otherwise the browser goes back where it came from, which is what makes
    // the no-JS path a round trip rather than a dead end.
    return applyResponseDraft(seeOther(request), draft);
  } catch (error) {
    // A middleware rejects by throwing a Response — `throw new Response("", {
    // status: 401 })` — and it is returned as it stands.
    // The draft rides an error out as well. A middleware that rotated a session
    // cookie and THEN refused must not lose the rotation — the browser would
    // keep replaying a token the server has already retired.
    if (error instanceof Response) return applyResponseDraft(error, draft);
    // A validation failure is the caller's fault and says so. Anything else is
    // reported without a body: a handler's message can name a table, a column
    // or a path, and none of that is the caller's business.
    if (error instanceof InputError) {
      return applyResponseDraft(
        isData
          ? Response.json({ error: "invalid input" }, { status: 400 })
          : new Response("invalid input", { status: 400 }),
        draft,
      );
    }
    throw error;
  }
}

/**
 * Whether the body is a form rather than a value. The enhanced path posts
 * `FormData` to the data channel so that a handler sees the SAME input type
 * whether or not JS ran.
 */
function isFormBody(request: Request): boolean {
  const type = request.headers.get("content-type") ?? "";
  return type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded");
}

/**
 * Back where the form was. 303 and not 302, so the browser re-issues as GET and
 * a reload does not repost — the POST/redirect/GET the no-JS path exists for.
 *
 * `Referer` is used only as a destination and never as a decision. SvelteKit's
 * docs make the distinction for the same reason: values derived from the
 * request are fine to navigate to and never fine to authorize with.
 */
function seeOther(request: Request): Response {
  const referer = request.headers.get("referer");
  const origin = new URL(request.url).origin;
  let location = "/";
  if (referer !== null) {
    try {
      const target = new URL(referer);
      // An off-site Referer would make this an open redirect.
      if (target.origin === origin) location = target.pathname + target.search;
    } catch {
      // A malformed Referer is not a destination.
    }
  }
  return new Response(null, { status: 303, headers: { location } });
}
