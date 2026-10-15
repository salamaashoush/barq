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
  type ForwardedForTrust,
  type RequestContext,
  type ResponseDraft,
  appendResponseHeader,
  applyResponseDraft,
  clearResponseHeaders,
  collectRequestCss,
  createResponseDraft,
  deleteCookie,
  draftedStatus,
  getCookie,
  getCookies,
  getGlobalStartContext,
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
  setRequestMiddlewareContext,
  setResponseStatus,
  takeSendContext,
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
  type AnyServerFn,
  type RpcControl,
  type ServerFn,
  type ServerFnArgs,
  type ServerFnCallOptions,
  type ServerFnMeta,
  type Streamed,
  DATA_SUFFIX,
  NOT_FOUND,
  REDIRECT,
  RPC_CONTEXT,
  RPC_CONTROL,
  RPC_PREFIX,
  RPC_STREAM,
  RpcNotFound,
  RpcRedirect,
  SERVER_FN,
  ServerFnError,
  clientRpc,
  isServerFn,
} from "./client.ts";

import {
  type AnyServerFn,
  SERVER_FN,
  type ServerFn,
  type ServerFnMeta,
  type Streamed,
  callOptionsOf,
  dataOf,
  urlOf,
} from "./client.ts";
import { getGlobalStartContext, offerSendContext, peekRequest } from "./context.ts";
import {
  type Middleware,
  type Validator,
  type ValidatorInput,
  UncheckedInputError,
  ValidationError,
  flattenMiddleware,
  isBuiltMiddleware,
  runMiddleware,
  toValidator,
} from "./middleware.ts";
import { startOptions } from "./start-instance.ts";

export {
  type StartInstance,
  type StartOptions,
  clearStart,
  createStart,
  startOptions,
} from "./start-instance.ts";

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
  type RequestMiddleware,
  type RequestMiddlewareContext,
  type RequestMiddlewareFn,
  type RequestMiddlewareStart,
  type StandardSchema,
  type Validator,
  type ValidatorInput,
  InputError,
  UncheckedInputError,
  ValidationError,
  applyValidator,
  createMiddleware,
  flattenMiddleware,
  isBuiltMiddleware,
  runMiddleware,
  runRequestMiddleware,
  toValidator,
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

type Staged = Omit<Built<unknown, unknown>, "handler">;

/**
 * The three-state discriminator, which is SvelteKit's idea and the best value
 * in the survey: no validator means any argument is a 400, and opening the
 * channel costs a schema or the literal `'unchecked'`.
 */

export interface ServerFnBuilder<In, Out> {
  middleware(chain: readonly Middleware[]): ServerFnBuilder<In, Out>;
  /**
   * Open the input channel: a Standard Schema, a function that returns the
   * validated value or throws, an object with a `parse`, or `"unchecked"`.
   * What it produces is the type of `data` in the handler.
   */
  validator<T>(schema: ValidatorInput<T>): ServerFnBuilder<T, Out>;
  /** TanStack's name for `validator`. */
  inputValidator<T>(schema: ValidatorInput<T>): ServerFnBuilder<T, Out>;
  handler<R>(
    fn: (context: HandlerContext<In>) => R | Promise<R>,
  ): ServerFn<In, Streamed<Awaited<R>>>;
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
      `[barq] \`createServerFn({ method: ${JSON.stringify(options.method)} })\` is not supported: a server function answers POST only, so that a link or a prefetch can never trigger one. ` +
        "Remove `method`, and fetch read-only data from a route `loader` instead.",
    );
  }
  // A NEW BUILDER PER STEP, as `createMiddleware` is: one that mutated a shared
  // record would let a base kept in a variable and finished twice hand the first
  // function the second one's handler, validator and chain.
  const step = (staged: Staged): ServerFnBuilder<unknown, unknown> => ({
    middleware: (chain) => step({ ...staged, middleware: chain }),
    validator: (schema) => step({ ...staged, validator: toValidator(schema) }) as never,
    inputValidator: (schema) => step({ ...staged, validator: toValidator(schema) }) as never,
    handler: (fn) => serverRpc({ id: "" }, { ...staged, handler: fn }) as never,
  });
  return step({ validator: null, middleware: [] }) as never;
}

/**
 * The server half. The compiler emits this in a module compiled for the server,
 * with the real handler and the id it assigned.
 */
export function serverRpc<In, Out>(meta: ServerFnMeta, built: Built<In, Out>): ServerFn<In, Out> {
  // The application's global function middleware runs ahead of the function's
  // own, and is read when it is first needed: `src/start.ts` may be evaluated
  // after the module that declares this function. Flattening drops a step the
  // function lists again, so a guard named in both places runs once.
  let composed: {
    readonly from: readonly Middleware[] | undefined;
    readonly chain: readonly Middleware[];
    /** Whether a bare argument has somewhere to be validated before the handler. */
    readonly validates: boolean;
  } | null = null;
  const composition = (): NonNullable<typeof composed> => {
    const global = startOptions().functionMiddleware;
    if (composed !== null && composed.from === global) return composed;
    const chain = flattenMiddleware([...(global ?? []), ...built.middleware]);
    composed = {
      from: global,
      chain,
      validates: chain.some(
        (step) => isBuiltMiddleware(step) && step.options.validator !== undefined,
      ),
    };
    return composed;
  };

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
     * Handed to the chain BESIDE `context` and never merged into it. Merging it
     * under would let it survive wherever no server step set the same key on
     * this request, and a middleware that names the user only for a signed-in
     * caller would leave `context.user` to whoever is not signed in.
     */
    clientContext?: Record<string, unknown>,
  ): Promise<Out> => {
    const input = dataOf(options);
    const { chain, validates: chainValidates } = composition();
    // What the chain contributed, merged as it unwinds inward. One object the
    // chain mutates rather than one per step: `next({ context })` is additive
    // by definition, and a handler wants the union of everything above it. It
    // starts from what the request's own middleware already said.
    const context: Record<string, unknown> = { ...getGlobalStartContext() };
    const sendContext: Record<string, unknown> = {};
    // The call's own when it named one, which only an in-process caller can.
    // Otherwise the request's, so a caller that goes away stops the work it
    // asked for; with neither there is nothing to abort it.
    const signal =
      callOptionsOf(options)?.signal ?? peekRequest()?.signal ?? new AbortController().signal;

    // Middleware runs BEFORE the function's own validation. An unauthenticated
    // caller should be refused without the server parsing its payload first,
    // and a rejection that depended on the payload being well-formed would be
    // one an attacker could skip by sending a malformed one. A MIDDLEWARE's own
    // validator is the exception and has to be: its body is handed `data`.
    const result = (await runMiddleware(chain, "server", {
      data: input,
      signal,
      context,
      clientContext,
      sendContext,
      run: async (data) =>
        built.handler({
          data: await checkInput(built, data, chainValidates),
          context,
          signal,
        }),
    })) as Out;

    offerSendContext(sendContext);
    // A `ReadableStream` is handed on as the async iterable every caller is
    // told to expect, so one in process reads what one in a browser does.
    return (result instanceof ReadableStream ? valuesOf(result) : result) as Out;
  };

  const fn = Object.assign(call, { [SERVER_FN]: true as const, meta, built, url: "" });
  // Read when asked: the id is stamped when the function is mounted.
  Object.defineProperty(fn, "url", { enumerable: true, get: () => urlOf(meta.id) });
  return fn;
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
export function middlewareOf(fn: AnyServerFn): readonly Middleware[] {
  const built = (fn as unknown as { built?: Built<unknown, unknown> }).built;
  return built?.middleware ?? [];
}

/** A stream's values, releasing it when the reader leaves early. */
async function* valuesOf(stream: ReadableStream<unknown>): AsyncIterableIterator<unknown> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
}
