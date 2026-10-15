/**
 * Middleware, and the input validation it composes.
 *
 * ITS OWN MODULE FOR ONE REASON: `client.ts` needs it. A middleware's client
 * half runs in the browser, so the runner has to be reachable from the client
 * stub — and `index.ts` re-exports `context.ts`, which reaches
 * `node:async_hooks`. Importing the index from `client.ts` is the leak
 * `DEFAULT_CLIENT_SOURCE` exists to avoid, and it is not theoretical: the same
 * import through a route's `middleware` once left a fully server-rendered page
 * on which nothing was interactive.
 *
 * Nothing here imports anything of barq's, for that reason.
 */

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
    /** The spec's type carrier: what the schema takes and what it produces. */
    readonly types?: { readonly input: In; readonly output: Out };
  };
}

/** Anything with a Standard Schema validator on it, which is all a schema is read for. */
export interface StandardSchemaLike {
  readonly "~standard": { readonly validate: (value: unknown) => unknown };
}

/** What a caller hands a schema: its declared input, or anything when it declares none. */
export type StandardInput<Schema> = [SchemaTypes<Schema>] extends [{ readonly input: infer In }]
  ? In
  : unknown;

/** What a schema produces: its declared output, or what its `validate` succeeds with. */
export type StandardOutput<Schema> = [SchemaTypes<Schema>] extends [{ readonly output: infer Out }]
  ? Out
  : Schema extends { readonly "~standard": { readonly validate: (value: unknown) => infer Result } }
    ? Succeeded<Awaited<Result>>
    : unknown;

/** The spec's optional `types`, read by key: a schema without it shares no member to match on. */
type SchemaTypes<Schema> = Schema extends { readonly "~standard": infer Spec }
  ? "types" extends keyof Spec
    ? NonNullable<Spec["types" & keyof Spec]>
    : undefined
  : undefined;

type Succeeded<Result> = Result extends { readonly value: infer Out } ? Out : never;

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
 * What `.validator()` and `.inputValidator()` accept: a Standard Schema, a
 * function that returns the validated value or throws, or an object with a
 * `parse` that does. TanStack's three, probed in that order, since a zod schema
 * is both the first and the third and the first reports issues without
 * throwing.
 */
export type ValidatorInput<T> =
  | Validator<T>
  | ((input: unknown) => T | Promise<T>)
  | { readonly parse: (input: unknown) => T | Promise<T> };

/** Any accepted validator, as the one shape the runner applies. */
export function toValidator<T>(input: ValidatorInput<T>): Validator<T> {
  if (input === "unchecked") return input;
  // The schema before the function: an arktype type is BOTH, and called as a
  // function it returns its errors rather than throwing them.
  if ("~standard" in input) return input;
  if (typeof input === "function") return checkedBy(input);
  return checkedBy((raw) => input.parse(raw));
}

function checkedBy<T>(check: (input: unknown) => T | Promise<T>): StandardSchema<unknown, T> {
  return {
    "~standard": {
      version: 1,
      vendor: "barq",
      validate: async (value) => {
        try {
          return { value: await check(value) };
        } catch (error) {
          // A refusal that is an answer of its own stays one.
          if (error instanceof Response) throw error;
          return { issues: [{ message: error instanceof Error ? error.message : String(error) }] };
        }
      },
    },
  };
}

const INPUT_ERROR = Symbol.for("barq.input-error");

/**
 * The caller's input was not acceptable — a 400 rather than a 500, whichever way
 * it failed. One base so the handler cannot answer one of them correctly and
 * turn the other into a server error, which is exactly what shipped first here.
 */
export class InputError extends Error {
  /**
   * A brand, read by {@link isInputError}, because `instanceof` answers for one
   * copy of this module: a host's request handler would read a refusal the
   * bundle's validator threw as a server error and answer 500.
   */
  readonly [INPUT_ERROR] = true as const;
}

/** Whether a thrown value is the caller's fault, whichever copy of this module threw it. */
export function isInputError(error: unknown): error is InputError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as Record<symbol, unknown>)[INPUT_ERROR] === true
  );
}

export class ValidationError extends InputError {
  readonly issues: ReadonlyArray<unknown>;
  constructor(issues: ReadonlyArray<unknown>) {
    super(
      "The `data` passed to this server function failed validation against its `.validator(schema)`, so the handler did not run. " +
        "Read `error.issues` for what failed.",
    );
    this.name = "ValidationError";
    this.issues = issues;
  }
}

/** Thrown when a call arrives for a function that declared no validator. */
export class UncheckedInputError extends InputError {
  constructor() {
    super(
      "This server function was called with `data`, but it declares no validator, so the call was refused. " +
        'Add `.validator(schema)` to validate the input, or `.validator("unchecked")` to accept it as it arrives.',
    );
    this.name = "UncheckedInputError";
  }
}

/** The empty contribution: what a step that adds nothing adds. */
export type Empty = object;

/**
 * A context the types know some of. A key no typed step declared still reads,
 * as `unknown`: an untyped closure may have put it there.
 */
export type OpenContext<Known extends object> = Known & Record<string, unknown>;

declare const NEXT: unique symbol;

/**
 * What `next()` resolves to, as far as the types can see.
 *
 * At runtime it is whatever the rest of the chain answered. The type carries
 * what this call contributed, so a middleware's context is read off the
 * `return next({ context })` it ends with rather than declared a second time.
 */
export interface NextResult<Context extends object = Empty, Sent extends object = Empty> {
  readonly [NEXT]: { readonly context: Context; readonly sent: Sent };
}

/** What a middleware may hand `next`. */
export interface NextOptions<Context extends object = Empty, Sent extends object = Empty> {
  /**
   * MERGED into what every step below is handed, the handler included. This is
   * how a middleware that authenticates hands the session down without a
   * module-level store.
   */
  readonly context?: Context;
  /**
   * Context the OTHER side is given.
   *
   * From a server half it travels back on the response, so a middleware that
   * resolved a session can tell the browser who it decided the user is without
   * a second round trip. From a client half it travels to the server, where it
   * arrives as `clientContext`: untrusted input, never `context`.
   *
   * It is SERIALIZED, so it carries what the value codec carries and nothing
   * else. A `context` holding a database handle is fine; a `sendContext`
   * holding one is a value the other side cannot be given.
   */
  readonly sendContext?: Sent;
  /**
   * Request headers for the fetch, from a CLIENT half: an `Authorization` a
   * middleware holds the token for, a trace id.
   *
   * A later step's value for a name replaces an earlier one's, and the call's
   * own `headers` replace both. A server half has no request to add to, so
   * there it does nothing; its response headers are `setResponseHeader`'s.
   */
  readonly headers?: HeadersInit;
  /**
   * The `fetch` the call goes out through, from a CLIENT half: a retry, a
   * tracer, a test double. A later step's replaces an earlier one's, and the
   * call's own `fetch` option replaces both.
   */
  readonly fetch?: typeof fetch;
}

/**
 * What a middleware calls to run the rest of the chain. `next()` with no
 * argument runs it unchanged.
 */
export type MiddlewareNext = <Context extends object = Empty, Sent extends object = Empty>(
  options?: NextOptions<Context, Sent>,
  // Read off the argument alone: inferred from where the result is returned to,
  // `next()` would satisfy any context a declared `Middleware<…>` promises.
) => Promise<NextResult<NoInfer<Context>, NoInfer<Sent>>>;

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
 *
 * `Context` is what a bare closure promises to add, and it is checked against
 * what it passes to `next`: `Middleware<{ user: string }>` that ends in
 * `next()` is a type error. A built middleware needs no annotation, since its
 * context is read off its body.
 */
export type Middleware<Context extends object = Empty> = Empty extends Context
  ? (next: MiddlewareNext) => Promise<unknown>
  : (next: MiddlewareNext) => Promise<NextResult<Context>>;

/**
 * What a middleware contributes to everything after it, at the type level.
 * Nothing here exists at runtime.
 */
export interface Contribution {
  /** Added to the server `context` of every later step and of the handler. */
  readonly context: object;
  /** What its server halves send back to the caller. */
  readonly sent: object;
  /** What its client halves add to the client `context`. */
  readonly clientContext: object;
  /** What the first validator in the chain is handed: the caller's `data`. */
  readonly input: unknown;
  /** What the last validator in the chain produced: every later step's `data`. */
  readonly output: unknown;
  readonly validates: boolean;
}

export interface NoContribution extends Contribution {
  readonly context: Empty;
  readonly sent: Empty;
  readonly clientContext: Empty;
  readonly input: undefined;
  readonly output: undefined;
  readonly validates: false;
}

/** `first`, then `second`: in the order the chain runs them. */
export interface Merged<
  First extends Contribution,
  Second extends Contribution,
> extends Contribution {
  readonly context: First["context"] & Second["context"];
  readonly sent: First["sent"] & Second["sent"];
  readonly clientContext: First["clientContext"] & Second["clientContext"];
  readonly input: First["validates"] extends true ? First["input"] : Second["input"];
  readonly output: Second["validates"] extends true ? Second["output"] : First["output"];
  readonly validates: First["validates"] extends true ? true : Second["validates"];
}

/** What one `next(...)` call contributed, from the result it resolved to. */
export type FromNext<Result> =
  Result extends NextResult<infer Context, infer Sent>
    ? { readonly context: Plain<Context>; readonly sent: Plain<Sent> }
    : never;

/** The same keys as one object, so a hover shows the context rather than how it was built. */
export type Plain<Value> = { [Key in keyof Value]: Value[Key] };

/**
 * What a body contributed, from everything it can return. A branch that
 * answers without calling `next` contributes nothing, and the handler never
 * runs on it, so it is left out rather than widening the rest to nothing.
 */
export type ContributedBy<Result> = [FromNext<Result>] extends [never]
  ? { readonly context: Empty; readonly sent: Empty }
  : FromNext<Result>;

declare const CONTRIBUTES: unique symbol;

/**
 * The type-level record a built middleware carries.
 *
 * A METHOD and optional, so it exists in no value and compares bivariantly:
 * one builder implementation serves every state, and what is read back is
 * exact because it is read with `infer`.
 */
export interface Carries<Types extends Contribution> {
  [CONTRIBUTES]?(types: Types): void;
}

/** What a middleware contributes, whichever way it was written. */
export type ContributionOf<Step> =
  Step extends Carries<infer Types>
    ? Types
    : Step extends (next: never) => Promise<infer Result>
      ? Merged<
          NoContribution,
          NoContribution & Omit<ContributedBy<Result>, never>
        > extends infer Out
        ? Out extends Contribution
          ? Out
          : NoContribution
        : NoContribution
      : NoContribution;

/** What a whole chain contributes, steps in the order they run. */
export type ChainContribution<Chain> = Chain extends readonly [infer Head, ...infer Rest]
  ? Merged<ContributionOf<Head>, ChainContribution<Rest>>
  : Chain extends readonly []
    ? NoContribution
    : Chain extends readonly (infer Step)[]
      ? ContributionOf<Step>
      : NoContribution;

/** Where a built middleware is: the chain it declared, and what it adds itself. */
export interface MiddlewareState {
  readonly chain: Contribution;
  readonly own: Contribution;
}

export interface FreshMiddleware extends MiddlewareState {
  readonly chain: NoContribution;
  readonly own: NoContribution;
}

export interface WithChain<State extends MiddlewareState, Chain> extends MiddlewareState {
  readonly chain: ChainContribution<Chain>;
  readonly own: State["own"];
}

export interface OwnReplaced<
  Own extends Contribution,
  Context extends object,
  Sent extends object,
> extends Contribution {
  readonly context: Context;
  readonly sent: Sent;
  readonly clientContext: Own["clientContext"];
  readonly input: Own["input"];
  readonly output: Own["output"];
  readonly validates: Own["validates"];
}

export interface WithServer<State extends MiddlewareState, Result> extends MiddlewareState {
  readonly chain: State["chain"];
  readonly own: OwnReplaced<
    State["own"],
    ContributedBy<Awaited<Result>>["context"],
    ContributedBy<Awaited<Result>>["sent"]
  >;
}

export interface ClientReplaced<
  Own extends Contribution,
  ClientContext extends object,
> extends Contribution {
  readonly context: Own["context"];
  readonly sent: Own["sent"];
  readonly clientContext: ClientContext;
  readonly input: Own["input"];
  readonly output: Own["output"];
  readonly validates: Own["validates"];
}

export interface WithClient<State extends MiddlewareState, Result> extends MiddlewareState {
  readonly chain: State["chain"];
  readonly own: ClientReplaced<State["own"], ContributedBy<Awaited<Result>>["context"]>;
}

export interface ValidatorReplaced<Own extends Contribution, In, Out> extends Contribution {
  readonly context: Own["context"];
  readonly sent: Own["sent"];
  readonly clientContext: Own["clientContext"];
  readonly input: In;
  readonly output: Out;
  readonly validates: true;
}

export interface WithValidator<State extends MiddlewareState, In, Out> extends MiddlewareState {
  readonly chain: State["chain"];
  readonly own: ValidatorReplaced<State["own"], In, Out>;
}

/** What a built middleware contributes: its chain, then itself. */
export type ContributionOfState<State extends MiddlewareState> = Merged<
  State["chain"],
  State["own"]
>;

/** The `data` a step is handed: what the nearest validator above it produced. */
export type DataAt<State extends MiddlewareState> = State["own"]["validates"] extends true
  ? State["own"]["output"]
  : State["chain"]["validates"] extends true
    ? State["chain"]["output"]
    : unknown;

/**
 * What a built middleware's server half is handed.
 *
 * The OBJECT shape, where a bare `Middleware` closure takes `next` positionally.
 * Both are supported and neither is deprecated: the closure is what a
 * one-line guard writes, and this is what a middleware with a validator, a
 * client half or a `sendContext` needs.
 */
export interface MiddlewareContext<Data = unknown, Context extends object = Empty> {
  readonly next: MiddlewareNext;
  /**
   * The input, as THIS middleware's validator left it.
   *
   * Validators compose along the chain: each one is handed what the one before
   * it returned, and the function's own runs last. That is TanStack's pipeline
   * (`createServerFn.ts:271-274`) and it is what lets a middleware normalise an
   * argument every function under it then receives already normalised.
   */
  readonly data: Data;
  /** What the middlewares outside this one contributed. */
  readonly context: OpenContext<Context>;
  /**
   * What the client halves sent with `next({ sendContext })`, as it came off
   * the wire.
   *
   * UNTRUSTED, and kept apart from `context` for that reason: a caller writes
   * the request body by hand as readily as the stub does, so this is input to
   * check and never a fact to act on. Everything read from `context` was put
   * there by a server step; a value from here joins it only when a server half
   * passes it on with `next({ context })`. Untyped for the same reason: a type
   * here would be a claim about what a stranger sent.
   *
   * Empty in a client half, and for a call made in-process.
   */
  readonly clientContext: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal;
  /**
   * The request, when this middleware is running for one: as a request
   * middleware, global or on a route. Absent around a server function's own
   * chain, where `getRequest()` is the way to it.
   */
  readonly request?: Request;
  /** The request's path, with any base stripped. Present with `request`. */
  readonly pathname?: string;
  /** What the request is for. Present with `request`. */
  readonly handlerType?: "router" | "serverFn";
  /**
   * The server function this chain is running around, by its id. Absent for a
   * request middleware, and the id is empty for a function that is not mounted.
   */
  readonly serverFnMeta?: { readonly id: string };
  /** The method the server function answers. Absent for a request middleware. */
  readonly method?: "GET" | "POST";
}

/**
 * What a client half is handed: the caller's raw `data`, since validators run
 * on the server, and a `context` holding what the client halves before it
 * added and, once `next()` has resolved, what the server sent back.
 */
export interface ClientMiddlewareContext<
  Context extends object = Empty,
  Sent extends object = Empty,
> extends MiddlewareContext<unknown, Context & Partial<Sent>> {}

/** Any server or client half, as the runner calls it. */
export type MiddlewareFn = (context: MiddlewareContext) => unknown;

/** What a request middleware calls to run the rest of the request. */
export type RequestMiddlewareNext = <Context extends object = Empty>(options?: {
  readonly context?: Context;
}) => Promise<(Response & NextResult<NoInfer<Context>>) | undefined>;

/**
 * What a request middleware is handed: the request is always there.
 *
 * `next()` resolves to the response, or `undefined` from a route handler that
 * declined, so the page render answers instead.
 */
export interface RequestMiddlewareContext<Context extends object = Empty> {
  readonly next: RequestMiddlewareNext;
  readonly data: undefined;
  readonly context: OpenContext<Context>;
  readonly clientContext: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal;
  readonly request: Request;
  readonly pathname: string;
  readonly handlerType: "router" | "serverFn";
}

export type RequestMiddlewareFn = (context: RequestMiddlewareContext) => unknown;

/** What a built middleware carries, and what the runner reads off it. */
export interface MiddlewareOptions {
  /**
   * TanStack's two kinds. `"request"` runs for a server request and is handed
   * it; `"function"` runs around a server function and may have a client half.
   * One builder makes both and the runner asks only where a middleware was
   * listed, so the kind decides the TYPES of what `.server` is handed.
   */
  readonly type?: "request" | "function";
  readonly middleware?: readonly Middleware[];
  readonly validator?: Validator<unknown>;
  readonly server?: MiddlewareFn;
  readonly client?: MiddlewareFn;
}

/**
 * A middleware with more than a body: a chain of its own, an input validator,
 * and separate halves for the two sides.
 *
 * IT IS STILL A FUNCTION. `Middleware` is a callable and the route-action
 * verifier compares chains with `===`, so making this an object — which is what
 * TanStack's is — would have broken both at once: a route's `middleware: [m]`
 * would no longer typecheck, and every existing bare closure would need
 * wrapping. A callable object is neither: it runs where a closure ran, it
 * compares by identity as a closure did, and `options` is there for the runner
 * that wants more.
 *
 * What each step adds is TYPED: a `.server` that ends in
 * `next({ context: { user } })` hands `user` to every function that lists this
 * middleware, typed as the body wrote it.
 */
export type BuiltMiddleware<State extends MiddlewareState = MiddlewareState> = Middleware &
  Carries<ContributionOfState<State>> & {
    readonly options: MiddlewareOptions;
    /** Middlewares that run BEFORE this one, flattened into the chain that uses it. */
    middleware<const Chain extends readonly Middleware[]>(
      chain: Chain,
    ): BuiltMiddleware<WithChain<State, Chain>>;
    /**
     * Validates and narrows the input every step after this one is handed. The
     * schema form is tried first: an arktype type is callable as well, and read
     * as a function its declared input would be lost.
     */
    validator<Schema extends StandardSchemaLike>(
      schema: Schema,
    ): BuiltMiddleware<WithValidator<State, StandardInput<Schema>, StandardOutput<Schema>>>;
    validator<In, Out>(
      validate: (input: In) => Out,
    ): BuiltMiddleware<WithValidator<State, In, Awaited<Out>>>;
    validator<In, Out>(schema: {
      readonly parse: (input: In) => Out;
    }): BuiltMiddleware<WithValidator<State, In, Awaited<Out>>>;
    validator(unchecked: "unchecked"): BuiltMiddleware<WithValidator<State, unknown, unknown>>;
    /** `validator` under the name TanStack's release candidates used. */
    inputValidator<Schema extends StandardSchemaLike>(
      schema: Schema,
    ): BuiltMiddleware<WithValidator<State, StandardInput<Schema>, StandardOutput<Schema>>>;
    inputValidator<In, Out>(
      validate: (input: In) => Out,
    ): BuiltMiddleware<WithValidator<State, In, Awaited<Out>>>;
    inputValidator<In, Out>(schema: {
      readonly parse: (input: In) => Out;
    }): BuiltMiddleware<WithValidator<State, In, Awaited<Out>>>;
    inputValidator(unchecked: "unchecked"): BuiltMiddleware<WithValidator<State, unknown, unknown>>;
    /** The half that runs on the server, where the handler is. */
    server<Result>(
      fn: (context: MiddlewareContext<DataAt<State>, State["chain"]["context"]>) => Result,
    ): BuiltMiddleware<WithServer<State, Result>>;
    /**
     * The half that runs in the BROWSER, around the fetch.
     *
     * `next({ sendContext })` from here is what travels to the server half as
     * `clientContext`. The compiler carries this into the client stub and leaves
     * the server half behind, so a middleware may hold both without either
     * reaching the wrong bundle.
     */
    client<Result>(
      fn: (
        context: ClientMiddlewareContext<State["chain"]["clientContext"], State["chain"]["sent"]>,
      ) => Result,
    ): BuiltMiddleware<WithClient<State, Result>>;
  };

/**
 * The two brands a thrown redirect and a thrown `notFound()` carry.
 *
 * DECLARED TWICE ON PURPOSE. The classes live in `@barqjs/router`, which this
 * package must not import: the dependency runs router -> start and start is an
 * OPTIONAL peer of it, so an import here would be a cycle and would break the
 * router for anyone using it without server functions. `Symbol.for` is the
 * global registry, so both declarations name the same symbol with no edge
 * between the packages — `SERVER_FN` in `client.ts` already works this way. The other
 * declaration is `REDIRECT` / `NOT_FOUND` in `packages/router/src/errors.ts`,
 * and `server.test.ts` checks the two agree.
 */
export const REDIRECT: unique symbol = Symbol.for("barq.redirect");
export const NOT_FOUND: unique symbol = Symbol.for("barq.not-found");

/**
 * What a middleware handed back, held to TanStack's rule: it ends in
 * `return next(...)`, answers with a result of its own, or throws.
 *
 * `undefined` is the one answer that cannot be a decision. Returned without
 * `next()` having been called, the step neither ran the rest of the chain nor
 * said what to answer with; returned after a `next()` that resolved to
 * something, it is the `return` the body forgot, and the result the handler
 * produced would be lost without a word. Either way the call would resolve to
 * nothing, so it fails here, naming the step. A thrown or returned redirect
 * or `notFound()` is an answer, so a returned one is thrown as one.
 */
function answerOf(returned: unknown, answers: readonly unknown[], step: () => string): unknown {
  if (isControl(returned)) throw returned;
  if (returned !== undefined || answers.includes(undefined)) return returned;
  throw new Error(
    answers.length === 0
      ? `[barq] ${step()} returned without calling \`next()\`, so the call has no answer. ` +
          "A middleware ends in `return next(...)`, returns a result of its own, or throws (a `Response` to refuse)."
      : `[barq] ${step()} called \`next()\` and returned \`undefined\` in place of its result, so the result was lost. ` +
          "Return what `next()` resolved to: `return next(...)`.",
  );
}

function isControl(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const branded = value as Record<symbol, unknown>;
  return branded[REDIRECT] === true || branded[NOT_FOUND] === true;
}

/**
 * Which step a refusal is about, for a person reading the error: its name when
 * the closure or the half has one, its place in the chain, and the function.
 */
function describeStep(
  kind: string,
  named: readonly ((...args: never[]) => unknown)[],
  position: number,
  length: number,
  around: string,
): string {
  const name = named
    .map((fn) => fn.name)
    .find((candidate) => candidate !== "" && candidate !== "run");
  const place = `${position + 1} of ${length}`;
  return name === undefined
    ? `The ${kind} middleware ${place} ${around}`
    : `The ${kind} middleware \`${name}\` (${place}) ${around}`;
}

/** Frozen, because every call that was sent nothing is handed this one object. */
const NOTHING_SENT: Record<string, unknown> = Object.freeze({});

/** Whether a middleware was built by {@link createMiddleware}. */
export function isBuiltMiddleware(value: Middleware): value is BuiltMiddleware {
  return (value as Partial<BuiltMiddleware>).options !== undefined;
}

/**
 * Author a middleware that is more than one closure.
 *
 * `createMiddleware().server(async ({ next, context }) => next({ context: … }))`
 * is the ordinary shape, and it is what a bare closure already did. What the
 * builder adds is the three things a closure has nowhere to put: a chain of its
 * own, an input validator, and a client half.
 *
 * EACH CALL RETURNS A NEW MIDDLEWARE, and the exported one is the last. That
 * matters because the verifier compares by identity: a builder that mutated and
 * returned itself would make every intermediate the same object as the final
 * one, which is harmless, and one that shared its options object across
 * branches — which TanStack's does — would make two middlewares built from one
 * base overwrite each other. Neither is a risk worth carrying for an allocation.
 */
export function createMiddleware(
  options: MiddlewareOptions & { readonly type: "request" },
): RequestMiddleware<FreshMiddleware>;
export function createMiddleware(options?: MiddlewareOptions): BuiltMiddleware<FreshMiddleware>;
export function createMiddleware(
  options: MiddlewareOptions = {},
): BuiltMiddleware<FreshMiddleware> | RequestMiddleware<FreshMiddleware> {
  return built<FreshMiddleware>(options);
}

/**
 * A typed body, stored where the runner reads it.
 *
 * The runner hands each body the `data` its validators produced and the
 * `context` the steps outside it wrote, which is what the body's own types say;
 * the types cannot follow a value through `options`, so they are restated here,
 * once, rather than at every call.
 */
function asBody<Data, Context extends object>(
  fn: (context: MiddlewareContext<Data, Context>) => unknown,
): MiddlewareFn {
  return fn as MiddlewareFn;
}

/**
 * A runner's `next`.
 *
 * It resolves to whatever the rest of the chain answered. `NextResult` is the
 * types' record of what the caller passed, and no value carries it, so the one
 * place a runner makes a `next` is the one place that says so.
 */
function nextOf(step: (options?: NextOptions) => Promise<unknown>): MiddlewareNext {
  return step as MiddlewareNext;
}

function built<State extends MiddlewareState>(options: MiddlewareOptions): BuiltMiddleware<State> {
  // The callable body is the SERVER half, because that is where a middleware in
  // a chain is invoked from. A middleware with no server half still has to be
  // callable — it may exist only to validate, or only to run on the client — and
  // passing straight through is what "no half here" means.
  const run: Middleware = async (next) =>
    options.server === undefined
      ? next()
      : options.server({
          next,
          data: undefined,
          context: {},
          clientContext: NOTHING_SENT,
          signal: new AbortController().signal,
        });

  function validated<Schema extends StandardSchemaLike>(
    schema: Schema,
  ): BuiltMiddleware<WithValidator<State, StandardInput<Schema>, StandardOutput<Schema>>>;
  function validated<In, Out>(
    validate: (input: In) => Out,
  ): BuiltMiddleware<WithValidator<State, In, Awaited<Out>>>;
  function validated<In, Out>(schema: {
    readonly parse: (input: In) => Out;
  }): BuiltMiddleware<WithValidator<State, In, Awaited<Out>>>;
  function validated(
    unchecked: "unchecked",
  ): BuiltMiddleware<WithValidator<State, unknown, unknown>>;
  function validated(schema: ValidatorInput<unknown>): BuiltMiddleware {
    return built({ ...options, validator: toValidator(schema) });
  }

  return Object.assign(run, {
    options,
    middleware: <const Chain extends readonly Middleware[]>(chain: Chain) =>
      built<WithChain<State, Chain>>({ ...options, middleware: chain }),
    validator: validated,
    inputValidator: validated,
    server: <Result>(
      fn: (context: MiddlewareContext<DataAt<State>, State["chain"]["context"]>) => Result,
    ) => built<WithServer<State, Result>>({ ...options, server: asBody(fn) }),
    client: <Result>(
      fn: (
        context: ClientMiddlewareContext<State["chain"]["clientContext"], State["chain"]["sent"]>,
      ) => Result,
    ) => built<WithClient<State, Result>>({ ...options, client: asBody(fn) }),
  });
}

/**
 * A middleware built with `type: "request"`: a chain of its own and a server
 * body that is always handed the request. It is a {@link BuiltMiddleware}
 * underneath, so it goes wherever a `Middleware` does, and what its body passes
 * to `next({ context })` is typed into everything after it.
 */
export type RequestMiddleware<State extends MiddlewareState = MiddlewareState> = Middleware &
  Carries<ContributionOfState<State>> & {
    readonly options: MiddlewareOptions;
    middleware<const Chain extends readonly Middleware[]>(
      chain: Chain,
    ): RequestMiddleware<WithChain<State, Chain>>;
    server<Result>(
      fn: (context: RequestMiddlewareContext<State["chain"]["context"]>) => Result,
    ): RequestMiddleware<WithServer<State, NonNullable<Awaited<Result>>>>;
  };

/** Where a request middleware chain is running. */
export interface RequestMiddlewareStart {
  readonly request: Request;
  readonly pathname: string;
  readonly handlerType: "router" | "serverFn";
  /** What the chain has produced so far; mutated as it unwinds inward. */
  readonly context: Record<string, unknown>;
}

/**
 * Run a chain of request middleware around `run`.
 *
 * `next()` resolves to whatever is inside: the response, or `undefined` from a
 * route handler that declined. A middleware answers with what it returns, so
 * one that returns `next()` passes the answer through and one that returns a
 * `Response` of its own replaces it.
 */
export async function runRequestMiddleware<T>(
  chain: readonly Middleware[],
  start: RequestMiddlewareStart,
  run: () => Promise<T>,
): Promise<T> {
  if (chain.length === 0) return run();
  const flattened = flattenMiddleware(chain);
  // By position, for the reason `runMiddleware` gives: a second `next()`
  // re-enters the steps below it instead of skipping them.
  const dispatch = async (position: number): Promise<unknown> => {
    const middleware = flattened[position];
    if (middleware === undefined) return run();
    const answers: unknown[] = [];
    const next = nextOf(async (step) => {
      if (step?.context !== undefined) Object.assign(start.context, step.context);
      const answer = await dispatch(position + 1);
      answers.push(answer);
      return answer;
    });
    const body = isBuiltMiddleware(middleware) ? middleware.options.server : undefined;
    if (isBuiltMiddleware(middleware) && body === undefined) return next();
    const returned = await (body === undefined
      ? middleware(next)
      : body({
          next,
          data: undefined,
          context: start.context,
          clientContext: NOTHING_SENT,
          signal: start.request.signal,
          request: start.request,
          pathname: start.pathname,
          handlerType: start.handlerType,
        }));
    return answerOf(returned, answers, () =>
      describeStep(
        "request",
        body === undefined ? [middleware] : [body],
        position,
        flattened.length,
        `on ${start.request.method} ${start.pathname}`,
      ),
    );
  };
  return (await dispatch(0)) as T;
}

/**
 * The chain a middleware list really is: every nested chain spliced in ahead of
 * the middleware that declared it, each step once.
 *
 * Depth-first and parents-first, which is TanStack's `flattenMiddlewares` and
 * the only order that means anything — a middleware declares a chain because it
 * DEPENDS on it, so those steps have to have run by the time it does.
 *
 * Deduplicated by IDENTITY, so two middlewares that both depend on
 * `requireSession` do not authenticate twice. That is also what keeps the
 * route-action verifier honest: it asks whether a function's flattened chain
 * contains the route's steps, and a step reached through a nest counts.
 */
export function flattenMiddleware(chain: readonly Middleware[], depth = 0): readonly Middleware[] {
  // A chain that reaches itself would otherwise recurse until the stack goes.
  // The cap is TanStack's and the number is theirs.
  if (depth > 100) {
    throw new RangeError(
      "[barq] A middleware chain nests more than 100 levels deep, which almost always means a middleware's own `middleware` list reaches the middleware itself. " +
        "Remove the cycle.",
    );
  }
  const out: Middleware[] = [];
  const push = (step: Middleware): void => {
    if (!out.includes(step)) out.push(step);
  };
  for (const step of chain) {
    if (isBuiltMiddleware(step) && step.options.middleware !== undefined) {
      for (const nested of flattenMiddleware(step.options.middleware, depth + 1)) push(nested);
    }
    push(step);
  }
  return out;
}

/** One validator, applied. `"unchecked"` and absence both pass the value through. */
export async function applyValidator(
  validator: Validator<unknown> | undefined,
  raw: unknown,
): Promise<unknown> {
  if (validator === undefined || validator === "unchecked") return raw;
  const result = await validator["~standard"].validate(raw);
  if ("issues" in result) throw new ValidationError(result.issues);
  return result.value;
}

/**
 * Run a flattened chain, then the innermost work.
 *
 * ONE RUNNER FOR BOTH SIDES, and `half` is which of a built middleware's two
 * bodies to call. A bare closure has neither and is invoked positionally, which
 * is what it has always been — so a chain may mix the two spellings and the
 * order is the order it was written in.
 *
 * A middleware that declares no half for THIS side is skipped rather than
 * refused: a `.server(...)`-only middleware is transparent in the browser, and
 * a `.client(...)`-only one is transparent on the server. That is what makes
 * one exported middleware usable from a route and a server function alike.
 */
export async function runMiddleware(
  chain: readonly Middleware[],
  half: "server" | "client",
  start: {
    readonly data: unknown;
    readonly signal: AbortSignal;
    /** What the chain has produced so far; mutated as the chain unwinds inward. */
    readonly context: Record<string, unknown>;
    /** What the client halves sent, on the server. Never merged into `context`. */
    readonly clientContext?: Record<string, unknown>;
    /** What travels back to the caller. */
    readonly sendContext: Record<string, unknown>;
    /** Where a client half's `next({ headers })` collects. Absent on the server. */
    readonly headers?: Headers;
    /** Where a client half's `next({ fetch })` lands. Absent on the server. */
    readonly fetch?: { current: typeof fetch | undefined };
    /** The function the chain is running around. */
    readonly meta?: { readonly id: string };
    /** The method that function answers. */
    readonly method?: "GET" | "POST";
    /** The innermost work: the handler on the server, the fetch on the client. */
    readonly run: (data: unknown) => Promise<unknown>;
  },
): Promise<unknown> {
  // BY POSITION, never by a counter the whole chain shares. A middleware may
  // call `next` twice (a retry, a fallback), and a shared counter has already
  // moved past every step below it by then, so the second call would land on
  // the handler with the guards in between skipped. Each step's `next` names the
  // step after it, so a repeat re-enters the same guards.
  const dispatch = async (position: number, received: unknown): Promise<unknown> => {
    const middleware = chain[position];
    if (middleware === undefined) return start.run(received);
    let data = received;
    const answers: unknown[] = [];
    const next = nextOf(async (step) => {
      if (step?.context !== undefined) Object.assign(start.context, step.context);
      if (step?.sendContext !== undefined) Object.assign(start.sendContext, step.sendContext);
      if (step?.headers !== undefined && start.headers !== undefined) {
        for (const [name, value] of new Headers(step.headers)) start.headers.set(name, value);
      }
      if (step?.fetch !== undefined && start.fetch !== undefined) start.fetch.current = step.fetch;
      const answer = await dispatch(position + 1, data);
      answers.push(answer);
      return answer;
    });
    const step = (named: (...args: never[]) => unknown): string =>
      describeStep(
        half,
        [named],
        position,
        chain.length,
        `around the server function ${JSON.stringify(start.meta?.id ?? "")}`,
      );
    if (!isBuiltMiddleware(middleware)) {
      // A BARE CLOSURE IS A SERVER MIDDLEWARE, always. It takes `next` and runs
      // where the handler is; there is no half to choose and nothing about it
      // says it is safe in a browser — `requireSession` in the reference
      // application opens a sealed cookie. Calling one on the client would run
      // a session check in the page, so the client half skips it and only a
      // middleware that declared `.client(…)` runs there.
      if (half !== "server") return next();
      return answerOf(await middleware(next), answers, () => step(middleware));
    }
    // VALIDATION FIRST, so the body of this middleware sees what its own
    // validator produced and so does everything under it. TanStack applies them
    // in the same place and the same order.
    if (half === "server") data = await applyValidator(middleware.options.validator, data);
    const body = middleware.options[half];
    if (body === undefined) return next();
    const returned = await body({
      next,
      data,
      context: start.context,
      clientContext: start.clientContext ?? NOTHING_SENT,
      signal: start.signal,
      serverFnMeta: start.meta,
      method: start.method,
    });
    return answerOf(returned, answers, () => step(body));
  };
  return dispatch(0, start.data);
}
