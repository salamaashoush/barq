/**
 * Server functions — the builder, and the two stubs the compiler emits.
 *
 * A server function is written once and reachable from both sides. The compiler
 * decides which side a module is being compiled for and replaces the handler
 * with the matching stub: `serverRpc` on the server, where the body runs, and
 * `clientRpc` on the client, where it becomes a fetch. That decision is a
 * compile-time one and is never taken at runtime, so the body cannot reach a
 * client bundle by being unreachable-but-present.
 *
 * Nothing in this file is safe to call from a browser bundle except
 * `clientRpc`. `./server` is where the request handler lives.
 */

export {
  type RequestContext,
  type ResponseDraft,
  applyResponseDraft,
  clearResponseHeaders,
  createResponseDraft,
  deleteCookie,
  draftedStatus,
  getCookie,
  getCookies,
  getRequest,
  getRequestHeader,
  getRequestHeaders,
  getRequestHost,
  getRequestIP,
  getRequestProtocol,
  getRequestUrl,
  getResponseHeader,
  getResponseHeaders,
  getResponseStatus,
  peekRequest,
  peekResponseDraft,
  removeResponseHeader,
  setCookie,
  setResponseHeader,
  setResponseHeaders,
  setResponseStatus,
  withRequest,
} from "./context.ts";

export { type CookieOptions, deleteCookieLine, parseCookies, serializeCookie } from "./cookies.ts";

/**
 * Sessions: a sealed cookie, with no store behind it.
 *
 * The interface is TanStack's (`start-server-core/src/session.ts`); the SEALING
 * is not — AES-GCM through WebCrypto rather than iron's AES-CBC plus a separate
 * HMAC, which costs no dependency and has no encrypt-then-MAC composition to get
 * wrong. A cookie sealed by one does not open in the other, and `session.ts`
 * says so where it can be read.
 */
/**
 * Rate limiting, as a middleware — so one closure guards a server function and a
 * route handler alike. The STORE has no default on purpose; `rate-limit.ts` says
 * why at length.
 */
export {
  type RateLimitCount,
  type RateLimitOptions,
  type RateLimitStore,
  byIP,
  memoryStore,
  rateLimit,
} from "./rate-limit.ts";

export {
  type Session,
  type SessionConfig,
  type SessionData,
  type SessionManager,
  clearSession,
  getSession,
  sealSession,
  unsealSession,
  updateSession,
  useSession,
} from "./session.ts";

/**
 * The client half lives in `./client.ts` and is re-exported here.
 *
 * SPLIT FOR ONE REASON: the compiler's client stub imports `clientRpc`, and
 * importing it from THIS module dragged `context.ts` — `node:async_hooks` — plus
 * the middleware runner and the validators into every client bundle that
 * reached one server function. Re-exporting keeps `import { createServerFn }
 * from "@barqjs/start"` the only thing an application writes.
 */
export {
  type ServerFn,
  type ServerFnArgs,
  type ServerFnMeta,
  DATA_SUFFIX,
  RPC_PREFIX,
  SERVER_FN,
  clientRpc,
  isServerFn,
} from "./client.ts";

import { SERVER_FN, type ServerFn, type ServerFnMeta, dataOf } from "./client.ts";

/**
 * A validator in the Standard Schema shape, which zod, valibot and arktype all
 * implement. Taking the interface rather than a library keeps the dependency
 * out and lets an application bring its own.
 */
export interface StandardSchema<In = unknown, Out = In> {
  "~standard": {
    version: 1;
    vendor: string;
    validate: (
      value: unknown,
    ) =>
      | { value: Out }
      | { issues: ReadonlyArray<unknown> }
      | Promise<{ value: Out } | { issues: ReadonlyArray<unknown> }>;
  };
}

/**
 * `'unchecked'` is the only way to open the input channel without a schema, and
 * it has to be typed out.
 *
 * The default is the opposite: a server function declared with no validator
 * rejects ANY argument off the wire with a 400. Every system surveyed except
 * SvelteKit passes raw deserialized input straight into the handler, and the
 * cost of not doing so is one word.
 */
export type Validator<T> = StandardSchema<unknown, T> | "unchecked";

/**
 * The caller's input was not acceptable — a 400 rather than a 500, whichever way
 * it failed. One base so the handler cannot answer one of them correctly and
 * turn the other into a server error, which is exactly what shipped first here.
 */
export class InputError extends Error {}

export class ValidationError extends InputError {
  readonly issues: ReadonlyArray<unknown>;
  constructor(issues: ReadonlyArray<unknown>) {
    super("server function input failed validation");
    this.name = "ValidationError";
    this.issues = issues;
  }
}

/** Thrown when a call arrives for a function that declared no validator. */
export class UncheckedInputError extends InputError {
  constructor() {
    super(
      "this server function takes no validated input; declare .validator(schema) to accept arguments, " +
        "or .validator('unchecked') to accept them unvalidated",
    );
    this.name = "UncheckedInputError";
  }
}

/**
 * A middleware runs before the handler and decides whether there is going to be
 * one. Rejecting is `throw new Response(...)`, which the request handler returns
 * as it stands.
 *
 * Per FUNCTION, not per route. Every framework in the survey documents the same
 * hole instead of closing it — Next.js: "A page-level authentication check does
 * not extend to the Server Actions defined within it… the Server Action is a
 * separate entry point." A middleware attached here cannot be escaped by
 * reaching the function from somewhere else, because there is nowhere else.
 */
export type Middleware = (next: MiddlewareNext) => Promise<unknown>;

/**
 * What a middleware calls to run the rest of the chain.
 *
 * `next({ context })` MERGES into what the handler is handed, which is how a
 * middleware that authenticates hands the session down without a module-level
 * store — theirs is `next({ context: { user } })`
 * (`start-client-core/src/createMiddleware.ts`). `next()` with no argument is
 * unchanged and is what every existing middleware writes, so nothing had to
 * move: the chain is still compared by closure identity, which is what the
 * route-action manifest depends on.
 */
export type MiddlewareNext = (options?: {
  readonly context?: Record<string, unknown>;
}) => Promise<unknown>;

/**
 * What a handler is handed — TanStack's shape
 * (`start-basic/src/utils/posts.tsx:12`, `.handler(async ({ data }) => …)`).
 *
 * `context` is what the middleware chain contributed, merged outermost-first.
 * `signal` aborts with the request, so a handler can hand it to `fetch` and a
 * client that navigates away stops paying for the work.
 */
export interface HandlerContext<In> {
  readonly data: In;
  readonly context: Record<string, unknown>;
  readonly signal: AbortSignal;
}

interface Built<In, Out> {
  validator: Validator<In> | null;
  middleware: readonly Middleware[];
  handler: (context: HandlerContext<In>) => Out | Promise<Out>;
}

/**
 * The three-state discriminator, which is SvelteKit's idea and the best value
 * in the survey: no validator means any argument is a 400, and opening the
 * channel costs a schema or the literal `'unchecked'`.
 */
export async function checkInput<In>(built: Built<In, unknown>, raw: unknown): Promise<In> {
  if (built.validator === null) {
    // `undefined` is what a no-argument call sends, and it is the only input a
    // function with no validator accepts.
    if (raw !== undefined) throw new UncheckedInputError();
    return undefined as In;
  }
  if (built.validator === "unchecked") return raw as In;
  const result = await built.validator["~standard"].validate(raw);
  if ("issues" in result) throw new ValidationError(result.issues);
  return result.value;
}

export interface ServerFnBuilder<In, Out> {
  middleware(chain: readonly Middleware[]): ServerFnBuilder<In, Out>;
  validator<T>(schema: Validator<T>): ServerFnBuilder<T, Out>;
  handler<R>(fn: (context: HandlerContext<In>) => R | Promise<R>): ServerFn<In, Awaited<R>>;
}

/**
 * What `createServerFn` accepts.
 *
 * `method` is here so a function copied from a TanStack application is a
 * TYPE error rather than a silently different program — and `"GET"` is not
 * assignable, deliberately. A server function reachable by navigation is a link
 * that mutates: RedwoodSDK shipped exactly that (CVE-2026-39371, CVSS 8.1),
 * where a `<a href>` became a one-click mutation carrying `SameSite=Lax`
 * cookies. `server.ts` answers 405 to anything but POST and says so there too.
 * The option exists to be REFUSED with a reason, which is the only honest thing
 * to do with an option barq will not implement.
 */
export interface ServerFnOptions {
  readonly method?: "POST";
}

/**
 * Author a server function. The value this returns is replaced by the compiler
 * on both sides, so what it does when compiled by nothing is only the
 * uncompiled-development path: it runs the handler in-process.
 */
export function createServerFn(options: ServerFnOptions = {}): ServerFnBuilder<undefined, unknown> {
  // A runtime refusal beside the type one, because a JavaScript application has
  // no type to fail and the reason is worth saying out loud.
  if (options.method !== undefined && options.method !== "POST") {
    throw new TypeError(
      `[barq] createServerFn({ method: ${JSON.stringify(options.method)} }) — a server function ` +
        "answers POST only. A mutation reachable by navigation is a link that mutates, which is " +
        "CVE-2026-39371 (CVSS 8.1). Fetch read-only data from a route `loader` instead.",
    );
  }
  const built: Built<unknown, unknown> = {
    validator: null,
    middleware: [],
    handler: () => undefined,
  };

  const builder: ServerFnBuilder<unknown, unknown> = {
    middleware(chain) {
      built.middleware = chain;
      return builder;
    },
    validator(schema) {
      built.validator = schema;
      return builder as never;
    },
    handler(fn) {
      built.handler = fn;
      return serverRpc({ id: "" }, built) as never;
    },
  };
  return builder as never;
}

/**
 * The server half. The compiler emits this in a module compiled for the server,
 * with the real handler and the id it assigned.
 */
export function serverRpc<In, Out>(meta: ServerFnMeta, built: Built<In, Out>): ServerFn<In, Out> {
  const call = async (options?: unknown): Promise<Out> => {
    const input = dataOf(options);
    // What the chain contributed, merged as it unwinds inward. One object the
    // chain mutates rather than one per step: `next({ context })` is additive
    // by definition, and a handler wants the union of everything above it.
    const context: Record<string, unknown> = {};
    const controller = new AbortController();

    // Middleware runs BEFORE validation. An unauthenticated caller should be
    // refused without the server parsing its payload first, and a rejection
    // that depended on the payload being well-formed would be one an attacker
    // could skip by sending a malformed one.
    const run = async (): Promise<Out> =>
      built.handler({
        data: await checkInput(built, input),
        context,
        signal: controller.signal,
      });

    let index = 0;
    const next: MiddlewareNext = async (step?: { readonly context?: Record<string, unknown> }) => {
      if (step?.context !== undefined) Object.assign(context, step.context);
      const middleware = built.middleware[index++];
      return middleware === undefined ? run() : middleware(next);
    };
    return (await next()) as Out;
  };

  return Object.assign(call, { [SERVER_FN]: true as const, meta, built });
}

/**
 * The middleware chain a server function carries, by REFERENCE.
 *
 * `serverRpc` attaches `built` to the function object, so the chain is the real
 * array of closures rather than something re-derived. That matters: a build
 * cannot read a chain out of source. `.middleware([m])`, `.middleware([...c])`
 * and `.middleware(c.filter(Boolean))` are all runtime expressions, and
 * `Middleware` is an anonymous closure with no build-visible identity — so the
 * only sound comparison is `===` against the same closure the route declared.
 *
 * Empty for a client stub, which carries no chain because it carries no handler.
 */
export function middlewareOf(fn: ServerFn<unknown, unknown>): readonly Middleware[] {
  const built = (fn as unknown as { built?: Built<unknown, unknown> }).built;
  return built?.middleware ?? [];
}
