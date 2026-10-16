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
  markResponseSent,
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
  type ChainStep,
  type RpcControl,
  type ServerFn,
  type ServerFnArgs,
  type ServerFnCallOptions,
  type ServerFnMeta,
  type ServerFnMethod,
  type Streamed,
  DATA_SUFFIX,
  NOT_FOUND,
  PAYLOAD_PARAM,
  REDIRECT,
  RPC_CALLER,
  RPC_CONTEXT,
  RPC_CONTROL,
  RPC_PREFIX,
  RPC_STREAM,
  RpcNotFound,
  RpcRedirect,
  SERVER_FN,
  STATIC_PREFIX,
  ServerFnError,
  clientRpc,
  isServerFn,
  staticFunctionMiddleware,
  staticUrl,
} from "./client.ts";
export type { ServerFnInputAnswer, ServerFnIssue, ServerFnThrown } from "./client.ts";
export { type ServerTiming, serverTiming } from "./timing.ts";
export { FRAME_APPLIED_EVENT, type Slot, isFrame } from "./frames.ts";

import {
  type AnyServerFn,
  type ChainStep,
  SERVER_FN,
  SERVER_FN_CHAIN,
  type ServerFn,
  type ServerFnMeta,
  type ServerFnMethod,
  type Streamed,
  callOptionsOf,
  dataOf,
  inlineServerFns,
  urlOf,
} from "./client.ts";
import { getGlobalStartContext, offerSendContext, peekRequest } from "./context.ts";
import { asFrame } from "./frames.ts";
import {
  type Carries,
  type ChainContribution,
  type Contribution,
  type Empty,
  type Merged,
  type Middleware,
  type NoContribution,
  type OpenContext,
  type StandardInput,
  type StandardOutput,
  type StandardSchemaLike,
  type Validator,
  type ValidatorInput,
  UncheckedInputError,
  applyValidator,
  flattenMiddleware,
  isBuiltMiddleware,
  runMiddleware,
  toValidator,
} from "./middleware.ts";
import { type GlobalFunctionContext, startOptions } from "./start-instance.ts";
import type { Crossable, InputProblem, ResultProblem, StrictOn, Strictness } from "./wire-types.ts";

export type {
  Crossable,
  InputProblem,
  ResultProblem,
  StrictOn,
  Strictness,
  WireProblem,
} from "./wire-types.ts";

export {
  type FunctionContextOf,
  type GlobalFunctionContext,
  type GlobalRequestContext,
  type Register,
  type RequestContextOf,
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
  type Carries,
  type ChainContribution,
  type ClientReplaced,
  type DataAt,
  type FreshMiddleware,
  type FromNext,
  type OwnReplaced,
  type Plain,
  type ValidatorReplaced,
  type WithChain,
  type WithClient,
  type WithServer,
  type WithValidator,
  type ClientMiddlewareContext,
  type ContributedBy,
  type Contribution,
  type ContributionOf,
  type Empty,
  type Merged,
  type Middleware,
  type MiddlewareContext,
  type MiddlewareFn,
  type MiddlewareNext,
  type MiddlewareOptions,
  type MiddlewareState,
  type NextOptions,
  type NextResult,
  type NoContribution,
  type OpenContext,
  type RequestMiddleware,
  type RequestMiddlewareContext,
  type RequestMiddlewareFn,
  type RequestMiddlewareNext,
  type RequestMiddlewareStart,
  type StandardInput,
  type StandardOutput,
  type StandardSchema,
  type StandardSchemaLike,
  type Validator,
  type ValidatorInput,
  InputError,
  UncheckedInputError,
  ValidationError,
  applyValidator,
  createMiddleware,
  isInputError,
  flattenMiddleware,
  isBuiltMiddleware,
  runMiddleware,
  runRequestMiddleware,
  toValidator,
} from "./middleware.ts";

export {
  type AnySerializationAdapter,
  type SerializationAdapter,
  createSerializationAdapter,
} from "@barqjs/server/codec";

/** TanStack's `json`: a JSON `Response`, which a handler returns as its answer. */
export function json(payload: unknown, init?: ResponseInit): Response {
  return Response.json(payload, init);
}

export async function checkInput(
  built: { readonly validator: Validator<unknown> | null },
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
): Promise<unknown> {
  if (built.validator === null) {
    // `undefined` is what a no-argument call sends, and it is the only input a
    // function with no validator accepts.
    if (raw !== undefined && !chainValidates) throw new UncheckedInputError();
    return raw;
  }
  return applyValidator(built.validator, raw);
}

/**
 * What a handler is handed, which is TanStack's shape:
 * `.handler(async ({ data }) => …)`.
 *
 * `context` is what the middleware chain contributed, merged outermost-first,
 * and typed by what each middleware passed to `next({ context })`.
 * `signal` aborts with the request, so a handler can hand it to `fetch` and a
 * client that navigates away stops paying for the work.
 */
export interface HandlerContext<In, Context extends object = Empty> {
  readonly data: In;
  readonly context: OpenContext<Context>;
  readonly signal: AbortSignal;
  /** The method this function answers. */
  readonly method: ServerFnMethod;
  /** Which function is running, by the id it is mounted at. Empty when it is not mounted. */
  readonly serverFnMeta: { readonly id: string };
}

interface Built<Data, Out, Context extends object = Empty> {
  validator: Validator<unknown> | null;
  middleware: readonly Middleware[];
  handler: (context: HandlerContext<Data, Context>) => Out | Promise<Out>;
}

interface Staged {
  readonly validator: Validator<unknown> | null;
  readonly middleware: readonly Middleware[];
  readonly method: ServerFnMethod;
}

/**
 * Where a server function's builder is: its chain, its own validator, its
 * method, and whether what crosses the wire is checked.
 */
export interface ServerFnState {
  readonly chain: Contribution;
  readonly own: Contribution;
  readonly method: ServerFnMethod;
  readonly strict: Strictness;
}

export interface FreshServerFn<
  Method extends ServerFnMethod,
  Strict extends Strictness = true,
> extends ServerFnState {
  readonly chain: NoContribution;
  readonly own: NoContribution;
  readonly method: Method;
  readonly strict: Strict;
}

export interface FnWithChain<State extends ServerFnState, Chain> extends ServerFnState {
  readonly chain: Merged<State["chain"], ChainContribution<Chain>>;
  readonly own: State["own"];
  readonly method: State["method"];
  readonly strict: State["strict"];
}

export interface Validates<In, Out> extends Contribution {
  readonly context: Empty;
  readonly sent: Empty;
  readonly clientContext: Empty;
  readonly input: In;
  readonly output: Out;
  readonly validates: true;
}

export interface FnWithValidator<State extends ServerFnState, In, Out> extends ServerFnState {
  readonly chain: State["chain"];
  readonly own: Validates<In, Out>;
  readonly method: State["method"];
  readonly strict: State["strict"];
}

/**
 * What a validator's input must also be: anything, unless it holds something
 * the codec cannot carry, when it must be a type naming that, which nothing is.
 */
export type InputCheck<State extends ServerFnState, In> =
  StrictOn<State["strict"], "input"> extends true
    ? Crossable<InputProblem<In, State["method"]>>
    : unknown;

/** The same, for what a handler returns. */
export type ResultCheck<State extends ServerFnState, Result> =
  StrictOn<State["strict"], "output"> extends true ? Crossable<ResultProblem<Result>> : unknown;

/**
 * What the caller passes: the input of the first validator that runs, which is
 * a middleware's when the chain validates. `undefined` when nothing validates,
 * since a function that declares no validator accepts no argument.
 */
export type CallerInput<State extends ServerFnState> = State["chain"]["validates"] extends true
  ? State["chain"]["input"]
  : State["own"]["validates"] extends true
    ? State["own"]["input"]
    : undefined;

/** What the handler is handed: the last validator's output. */
export type HandlerData<State extends ServerFnState> = State["own"]["validates"] extends true
  ? State["own"]["output"]
  : State["chain"]["validates"] extends true
    ? State["chain"]["output"]
    : undefined;

/** What the handler's `context` holds: the global middleware's, then its own chain's. */
export type HandlerContextOf<State extends ServerFnState> = GlobalFunctionContext &
  State["chain"]["context"];

/**
 * The three-state discriminator, which is SvelteKit's idea and the best value
 * in the survey: no validator means any argument is a 400, and opening the
 * channel costs a schema or the literal `'unchecked'`.
 *
 * Every step is typed: the schema decides what a caller passes and what the
 * handler is handed, and each middleware's `next({ context })` decides what the
 * handler's `context` holds.
 */
export interface ServerFnBuilder<State extends ServerFnState = ServerFnState> {
  /**
   * Middleware that runs before the handler, after any listed before. A server
   * function in the list stands for the middleware it declared: its guards
   * run here, its handler does not.
   */
  middleware<const Chain extends readonly ChainStep[]>(
    chain: Chain,
  ): ServerFnBuilder<FnWithChain<State, Chain>>;
  /**
   * Open the input channel: a Standard Schema, a function that returns the
   * validated value or throws, an object with a `parse`, or `"unchecked"`.
   * What a caller passes is the schema's input, and what it produces is the
   * type of `data` in the handler. The schema form is tried first: an arktype
   * type is callable as well, and read as a function its input would be lost.
   */
  validator<Schema extends StandardSchemaLike>(
    schema: Schema & InputCheck<State, StandardInput<Schema>>,
  ): ServerFnBuilder<FnWithValidator<State, StandardInput<Schema>, StandardOutput<Schema>>>;
  validator<In, Out>(
    validate: ((input: In) => Out) & InputCheck<State, In>,
  ): ServerFnBuilder<FnWithValidator<State, In, Awaited<Out>>>;
  validator<In, Out>(
    schema: { readonly parse: (input: In) => Out } & InputCheck<State, In>,
  ): ServerFnBuilder<FnWithValidator<State, In, Awaited<Out>>>;
  validator(unchecked: "unchecked"): ServerFnBuilder<FnWithValidator<State, unknown, unknown>>;
  /** `validator` under the name TanStack's release candidates used. */
  inputValidator<Schema extends StandardSchemaLike>(
    schema: Schema & InputCheck<State, StandardInput<Schema>>,
  ): ServerFnBuilder<FnWithValidator<State, StandardInput<Schema>, StandardOutput<Schema>>>;
  inputValidator<In, Out>(
    validate: ((input: In) => Out) & InputCheck<State, In>,
  ): ServerFnBuilder<FnWithValidator<State, In, Awaited<Out>>>;
  inputValidator<In, Out>(
    schema: { readonly parse: (input: In) => Out } & InputCheck<State, In>,
  ): ServerFnBuilder<FnWithValidator<State, In, Awaited<Out>>>;
  inputValidator(unchecked: "unchecked"): ServerFnBuilder<FnWithValidator<State, unknown, unknown>>;
  /**
   * The body. What it returns must cross the wire: a function, a symbol, or an
   * instance of a class the codec refuses is a type error here, naming where
   * it is. `createServerFn({ strict: false })` turns the check off.
   */
  handler<Result>(
    fn: ((
      context: HandlerContext<HandlerData<State>, HandlerContextOf<State>>,
    ) => Result | Promise<Result>) &
      ResultCheck<State, Result>,
  ): ServerFn<CallerInput<State>, Streamed<Awaited<Result>>, State["method"]> &
    Carries<State["chain"]>;
}

/**
 * What `createServerFn` accepts.
 *
 * `method` is TanStack's, with TanStack's default: `GET`. A function that
 * writes declares `POST`, which is also the only method a form can reach. A
 * link still cannot reach a `GET` one: every call carries the
 * {@link RPC_CALLER} header, which nothing but script can set, and the server
 * refuses a `GET` without it.
 */
export interface ServerFnOptions<
  Method extends ServerFnMethod = ServerFnMethod,
  Strict extends Strictness = Strictness,
> {
  readonly method?: Method;
  /**
   * Whether the types refuse an input or a result the codec cannot carry. On
   * by default; `false` turns both off, `{ input: false }` or
   * `{ output: false }` one side. The codec still refuses at runtime what it
   * cannot carry: this only says the author knows, as for a class a
   * `createSerializationAdapter` carries.
   */
  readonly strict?: Strict;
}

/**
 * Author a server function. The value this returns is replaced by the compiler
 * on both sides, so what it does when compiled by nothing is only the
 * uncompiled-development path: it runs the handler in-process.
 */
export function createServerFn<
  Method extends ServerFnMethod = "GET",
  const Strict extends Strictness = true,
>(options: ServerFnOptions<Method, Strict> = {}): ServerFnBuilder<FreshServerFn<Method, Strict>> {
  // A runtime refusal beside the type one, because a JavaScript application has
  // no type to fail.
  const method = options.method ?? "GET";
  if (method !== "POST" && method !== "GET") {
    throw new TypeError(
      `[barq] \`createServerFn({ method: ${JSON.stringify(method)} })\` is not supported: a server function answers GET or POST. ` +
        "Use a route's `server.handlers` for any other method.",
    );
  }
  return builderAt<FreshServerFn<Method, Strict>>({ validator: null, middleware: [], method });
}

/**
 * A NEW BUILDER PER STEP, as `createMiddleware` is: one that mutated a shared
 * record would let a base kept in a variable and finished twice hand the first
 * function the second one's handler, validator and chain.
 */
function builderAt<State extends ServerFnState>(staged: Staged): ServerFnBuilder<State> {
  function validated<Schema extends StandardSchemaLike>(
    schema: Schema & InputCheck<State, StandardInput<Schema>>,
  ): ServerFnBuilder<FnWithValidator<State, StandardInput<Schema>, StandardOutput<Schema>>>;
  function validated<In, Out>(
    validate: ((input: In) => Out) & InputCheck<State, In>,
  ): ServerFnBuilder<FnWithValidator<State, In, Awaited<Out>>>;
  function validated<In, Out>(
    schema: { readonly parse: (input: In) => Out } & InputCheck<State, In>,
  ): ServerFnBuilder<FnWithValidator<State, In, Awaited<Out>>>;
  function validated(
    unchecked: "unchecked",
  ): ServerFnBuilder<FnWithValidator<State, unknown, unknown>>;
  function validated(
    schema: ValidatorInput<unknown>,
  ): ServerFnBuilder<FnWithValidator<State, unknown, unknown>> {
    return builderAt({ ...staged, validator: toValidator(schema) });
  }
  return {
    middleware: <const Chain extends readonly ChainStep[]>(chain: Chain) =>
      builderAt<FnWithChain<State, Chain>>({
        ...staged,
        middleware: [...staged.middleware, ...inlineServerFns(chain)],
      }),
    validator: validated,
    inputValidator: validated,
    handler: <Result>(
      fn: ((
        context: HandlerContext<HandlerData<State>, HandlerContextOf<State>>,
      ) => Result | Promise<Result>) &
        ResultCheck<State, Result>,
    ) =>
      serverRpc<
        CallerInput<State>,
        Result,
        HandlerData<State>,
        HandlerContextOf<State>,
        State["method"]
      >(staged.method === "GET" ? { id: "", method: "GET" } : { id: "" }, {
        validator: staged.validator,
        middleware: staged.middleware,
        handler: fn,
      }),
  };
}

/**
 * The server half. The compiler emits this in a module compiled for the server,
 * with the real handler and the id it assigned.
 *
 * `In` is what a caller passes and `Data` what the handler is handed; the
 * validator is what turns one into the other, at runtime.
 */
export function serverRpc<
  In,
  Out,
  Data = In,
  Context extends object = Empty,
  Method extends ServerFnMethod = "POST",
>(
  meta: ServerFnMeta,
  built: Built<Data, Out, Context>,
): ServerFn<In, Streamed<Awaited<Out>>, Method> {
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
  ): Promise<Streamed<Awaited<Out>>> => {
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
    const method = meta.method ?? "POST";
    const result = await runMiddleware(chain, "server", {
      data: input,
      meta,
      method,
      signal,
      context,
      clientContext,
      sendContext,
      run: async (data) =>
        built.handler({
          // What the validators produced and what the chain wrote: the two
          // facts the builder's types describe, which exist only at runtime.
          data: (await checkInput(built, data, chainValidates)) as Data,
          context: context as OpenContext<Context>,
          signal,
          method,
          serverFnMeta: { id: meta.id },
        }),
    });

    offerSendContext(sendContext);
    // A `ReadableStream` is handed on as the async iterable every caller is
    // told to expect, so one in process reads what one in a browser does, and
    // a component is a frame, which a route renders and a browser asks for.
    if (result instanceof ReadableStream) return valuesOf(result) as Streamed<Awaited<Out>>;
    return asFrame(meta.id, input, result) as Streamed<Awaited<Out>>;
  };

  const fn = Object.assign(call, {
    [SERVER_FN]: true as const,
    [SERVER_FN_CHAIN]: built.middleware,
    meta,
    serverFnMeta: meta,
    method: meta.method ?? "POST",
    built,
    url: "",
  });
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
