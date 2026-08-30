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
 * store, which is theirs too. `next()` with no argument is
 * unchanged and is what every existing middleware writes, so nothing had to
 * move: the chain is still compared by closure identity, which is what the
 * route-action manifest depends on.
 */
export type MiddlewareNext = (options?: {
  readonly context?: Record<string, unknown>;
  /**
   * Context the CALLER is given back, rather than the handler below.
   *
   * `context` travels inward and never leaves the server; this travels back out
   * on the response, so a middleware that resolved a session can tell the
   * browser who it decided the user is without a second round trip. TanStack's
   * name and TanStack's direction.
   *
   * It is SERIALIZED, so it carries what the value codec carries and nothing
   * else. A `context` holding a database handle is fine; a `sendContext`
   * holding one is a value the client cannot be given.
   */
  readonly sendContext?: Record<string, unknown>;
}) => Promise<unknown>;

/**
 * What a middleware built by {@link createMiddleware} is handed.
 *
 * The OBJECT shape, where a bare `Middleware` closure takes `next` positionally.
 * Both are supported and neither is deprecated: the closure is what a
 * one-line guard writes, and this is what a middleware with a validator, a
 * client half or a `sendContext` needs.
 */
export interface MiddlewareContext {
  readonly next: MiddlewareNext;
  /**
   * The input, as THIS middleware's validator left it.
   *
   * Validators compose along the chain: each one is handed what the one before
   * it returned, and the function's own runs last. That is TanStack's pipeline
   * (`createServerFn.ts:271-274`) and it is what lets a middleware normalise an
   * argument every function under it then receives already normalised.
   */
  readonly data: unknown;
  /** What the middlewares outside this one contributed. */
  readonly context: Record<string, unknown>;
  readonly signal: AbortSignal;
}

export type MiddlewareFn = (context: MiddlewareContext) => unknown;

/** What a built middleware carries, and what the runner reads off it. */
export interface MiddlewareOptions {
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
 */
export type BuiltMiddleware = Middleware & {
  readonly options: MiddlewareOptions;
  /** Middlewares that run BEFORE this one, flattened into the chain that uses it. */
  middleware(chain: readonly Middleware[]): BuiltMiddleware;
  /** Validates and narrows the input every step after this one is handed. */
  validator(schema: Validator<unknown>): BuiltMiddleware;
  /** The half that runs on the server, where the handler is. */
  server(fn: MiddlewareFn): BuiltMiddleware;
  /**
   * The half that runs in the BROWSER, around the fetch.
   *
   * `next({ sendContext })` from here is what travels to the server half as
   * `context`. The compiler carries this into the client stub and leaves the
   * server half behind, so a middleware may hold both without either reaching
   * the wrong bundle.
   */
  client(fn: MiddlewareFn): BuiltMiddleware;
};

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
export function createMiddleware(options: MiddlewareOptions = {}): BuiltMiddleware {
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
          signal: new AbortController().signal,
        });

  const extend = (more: MiddlewareOptions): BuiltMiddleware =>
    createMiddleware({ ...options, ...more });

  return Object.assign(run, {
    options,
    middleware: (chain: readonly Middleware[]) => extend({ middleware: chain }),
    validator: (schema: Validator<unknown>) => extend({ validator: schema }),
    server: (fn: MiddlewareFn) => extend({ server: fn }),
    client: (fn: MiddlewareFn) => extend({ client: fn }),
  });
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
      "[barq] middleware nesting is more than 100 deep; a chain probably contains itself",
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
    /** What travels back to the caller. */
    readonly sendContext: Record<string, unknown>;
    /** The innermost work: the handler on the server, the fetch on the client. */
    readonly run: (data: unknown) => Promise<unknown>;
  },
): Promise<unknown> {
  let data = start.data;
  let index = 0;
  const next: MiddlewareNext = async (step) => {
    if (step?.context !== undefined) Object.assign(start.context, step.context);
    if (step?.sendContext !== undefined) Object.assign(start.sendContext, step.sendContext);
    const middleware = chain[index++];
    if (middleware === undefined) return start.run(data);
    if (!isBuiltMiddleware(middleware)) {
      // A BARE CLOSURE IS A SERVER MIDDLEWARE, always. It takes `next` and runs
      // where the handler is; there is no half to choose and nothing about it
      // says it is safe in a browser — `requireSession` in the reference
      // application opens a sealed cookie. Calling one on the client would run
      // a session check in the page, so the client half skips it and only a
      // middleware that declared `.client(…)` runs there.
      return half === "server" ? middleware(next) : next();
    }
    // VALIDATION FIRST, so the body of this middleware sees what its own
    // validator produced and so does everything under it. TanStack applies them
    // in the same place and the same order.
    if (half === "server") data = await applyValidator(middleware.options.validator, data);
    const body = middleware.options[half];
    if (body === undefined) return next();
    return body({ next, data, context: start.context, signal: start.signal });
  };
  return next();
}
