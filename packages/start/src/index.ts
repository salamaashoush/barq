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

export { getRequest, peekRequest, withRequest } from "./context.ts";

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
  type ServerFnMeta,
  DATA_SUFFIX,
  RPC_PREFIX,
  SERVER_FN,
  clientRpc,
  isServerFn,
} from "./client.ts";

import { SERVER_FN, type ServerFn, type ServerFnMeta } from "./client.ts";

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
export type Middleware = (next: () => Promise<unknown>) => Promise<unknown>;

interface Built<In, Out> {
  validator: Validator<In> | null;
  middleware: readonly Middleware[];
  handler: (input: In) => Out | Promise<Out>;
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
  handler<R>(fn: (input: In) => R | Promise<R>): ServerFn<In, Awaited<R>>;
}

/**
 * Author a server function. The value this returns is replaced by the compiler
 * on both sides, so what it does when compiled by nothing is only the
 * uncompiled-development path: it runs the handler in-process.
 */
export function createServerFn(): ServerFnBuilder<undefined, unknown> {
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
  // Middleware runs BEFORE validation. An unauthenticated caller should be
  // refused without the server parsing its payload first, and a rejection that
  // depended on the payload being well-formed would be one an attacker could
  // skip by sending a malformed one.
  const run = async (input: In): Promise<Out> => built.handler(await checkInput(built, input));

  const call = async (input: In): Promise<Out> => {
    let index = 0;
    const next = async (): Promise<unknown> => {
      const step = built.middleware[index++];
      return step === undefined ? run(input) : step(next);
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
