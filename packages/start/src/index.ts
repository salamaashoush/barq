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
  collectRequestCss,
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
  installCssSink,
  setResponseStatus,
  withRequest,
} from "./context.ts";

export { type CookieOptions, deleteCookieLine, parseCookies, serializeCookie } from "./cookies.ts";

/**
 * Sessions: a sealed cookie, with no store behind it.
 *
 * The interface is TanStack's; the SEALING is not: AES-GCM through WebCrypto rather than iron's AES-CBC plus a separate
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
  type RpcControl,
  type ServerFn,
  type ServerFnArgs,
  type ServerFnMeta,
  DATA_SUFFIX,
  NOT_FOUND,
  REDIRECT,
  RPC_CONTEXT,
  RPC_CONTROL,
  RPC_PREFIX,
  RpcNotFound,
  RpcRedirect,
  SERVER_FN,
  ServerFnError,
  clientRpc,
  isServerFn,
} from "./client.ts";

import { SERVER_FN, type ServerFn, type ServerFnMeta, dataOf } from "./client.ts";
import {
  type Middleware,
  type Validator,
  UncheckedInputError,
  ValidationError,
  flattenMiddleware,
  isBuiltMiddleware,
  runMiddleware,
} from "./middleware.ts";

/**
 * Middleware and the validator surface it composes, re-exported so an
 * application still writes one import. `middleware.ts` says why they live apart.
 */
export {
  type IsomorphicBuilder,
  type IsomorphicFn,
  createClientOnlyFn,
  createIsomorphicFn,
  createServerOnlyFn,
} from "./env.ts";

export {
  type BuiltMiddleware,
  type Middleware,
  type MiddlewareContext,
  type MiddlewareFn,
  type MiddlewareNext,
  type MiddlewareOptions,
  type StandardSchema,
  type Validator,
  InputError,
  UncheckedInputError,
  ValidationError,
  applyValidator,
  createMiddleware,
  flattenMiddleware,
  isBuiltMiddleware,
  runMiddleware,
} from "./middleware.ts";

export async function checkInput<In>(
  built: Built<In, unknown>,
  raw: unknown,
  /**
   * Whether a MIDDLEWARE in the chain declared a validator.
   *
   * The refusal below asks "does anything expect input?", and before middleware
   * validators existed the function's own was the only thing that could answer.
   * A chain that validates has opened the channel just as surely, so refusing
   * here would make `.validator(schema)` on a middleware unusable by any
   * function that declares none of its own — which is the whole point of
   * putting one there.
   */
  chainValidates = false,
): Promise<In> {
  if (built.validator === null) {
    // `undefined` is what a no-argument call sends, and it is the only input a
    // function with no validator accepts.
    if (raw !== undefined && !chainValidates) throw new UncheckedInputError();
    return raw as In;
  }
  if (built.validator === "unchecked") return raw as In;
  const result = await built.validator["~standard"].validate(raw);
  if ("issues" in result) throw new ValidationError(result.issues);
  return result.value;
}

/**
 * What a handler is handed, which is TanStack's shape:
 * `.handler(async ({ data }) => …)`.
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
 * that mutates: RedwoodSDK shipped exactly that, where an `<a href>` became a
 * one-click mutation carrying `SameSite=Lax` cookies. `server.ts` answers 405 to anything but POST and says so there too.
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
        "answers POST only. A mutation reachable by navigation is a link that mutates. Fetch " +
        "read-only data from a route `loader` instead.",
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
  const chain = flattenMiddleware(built.middleware);
  // Asked ONCE, at build of the function rather than per call: the chain is
  // fixed and this decides whether a bare argument is refused.
  const chainValidates = chain.some(
    (step) => isBuiltMiddleware(step) && step.options.validator !== undefined,
  );

  const call = async (
    options?: unknown,
    /**
     * What the CLIENT's halves sent, and it is UNTRUSTED.
     *
     * A second positional rather than a property of `options`, so it is
     * invisible to the public `ServerFn` signature and cannot be reached by
     * writing `fn({ data, context })` in application code. The request handler
     * is the only caller that passes it.
     *
     * Seeded UNDER the chain's own output: the server's middlewares run after
     * this and overwrite anything the wire claimed, so a client cannot forge
     * the `session` a server middleware sets. TanStack orders it the same way.
     */
    clientContext?: Record<string, unknown>,
  ): Promise<Out> => {
    const input = dataOf(options);
    // What the chain contributed, merged as it unwinds inward. One object the
    // chain mutates rather than one per step: `next({ context })` is additive
    // by definition, and a handler wants the union of everything above it.
    const context: Record<string, unknown> = { ...clientContext };
    const sendContext: Record<string, unknown> = {};
    const controller = new AbortController();

    // Middleware runs BEFORE the function's own validation. An unauthenticated
    // caller should be refused without the server parsing its payload first,
    // and a rejection that depended on the payload being well-formed would be
    // one an attacker could skip by sending a malformed one. A MIDDLEWARE's own
    // validator is the exception and has to be: its body is handed `data`.
    const result = (await runMiddleware(chain, "server", {
      data: input,
      signal: controller.signal,
      context,
      sendContext,
      run: async (data) =>
        built.handler({
          data: await checkInput(built, data, chainValidates),
          context,
          signal: controller.signal,
        }),
    })) as Out;

    lastSendContext = sendContext;
    return result;
  };

  return Object.assign(call, { [SERVER_FN]: true as const, meta, built });
}

/**
 * What the last call's chain asked to send back, for the request handler to put
 * on the response.
 *
 * A MODULE-LEVEL HANDOFF and it is safe here, unlike the ambient request
 * context: `serverRpc`'s `call` sets this synchronously with respect to its own
 * return, and `handleServerFn` reads it in the statement after awaiting that
 * call. No other await sits between the two, so a second request cannot
 * interleave. Returning it would have been cleaner and is not available: the
 * call's return type is the handler's, and a server function invoked
 * IN-PROCESS by a loader must see that type and nothing wrapped around it.
 */
let lastSendContext: Record<string, unknown> = {};

/** Take the pending `sendContext`, leaving nothing behind for the next call. */
export function takeSendContext(): Record<string, unknown> {
  const taken = lastSendContext;
  lastSendContext = {};
  return taken;
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
