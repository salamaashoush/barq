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

export const SERVER_FN = Symbol.for("barq.server-fn");

/** Where mounted server functions answer. One path, one shape. */
export const RPC_PREFIX = "/_barq/fn/";

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

export interface ServerFnMeta {
  /** Stable across edits and deploys: the module path and the export name. */
  id: string;
}

export type ServerFn<In, Out> = ((input: In) => Promise<Out>) & {
  readonly [SERVER_FN]: true;
  readonly meta: ServerFnMeta;
};

interface Built<In, Out> {
  validator: Validator<In> | null;
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
  validator<T>(schema: Validator<T>): ServerFnBuilder<T, Out>;
  handler<R>(fn: (input: In) => R | Promise<R>): ServerFn<In, Awaited<R>>;
}

/**
 * Author a server function. The value this returns is replaced by the compiler
 * on both sides, so what it does when compiled by nothing is only the
 * uncompiled-development path: it runs the handler in-process.
 */
export function createServerFn(): ServerFnBuilder<undefined, unknown> {
  const built: Built<unknown, unknown> = { validator: null, handler: () => undefined };

  const builder: ServerFnBuilder<unknown, unknown> = {
    validator(schema) {
      built.validator = schema as Validator<unknown>;
      return builder as never;
    },
    handler(fn) {
      built.handler = fn as (input: unknown) => unknown;
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
  const call = async (input: In): Promise<Out> => built.handler(await checkInput(built, input));
  return Object.assign(call, { [SERVER_FN]: true as const, meta, built }) as ServerFn<In, Out>;
}

/**
 * The client half. The compiler emits this in a module compiled for the client,
 * with the id and nothing else — no handler body, no validator, no imports the
 * body needed.
 */
export function clientRpc<In, Out>(id: string): ServerFn<In, Out> {
  const call = async (input: In): Promise<Out> => {
    const response = await fetch(RPC_PREFIX + encodeURIComponent(id), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input }),
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error(`server function ${id} failed: ${response.status}`);
    return (await response.json()) as Out;
  };
  return Object.assign(call, { [SERVER_FN]: true as const, meta: { id } }) as ServerFn<In, Out>;
}

/** Whether a value is a server function, by brand rather than by shape. */
export function isServerFn(value: unknown): value is ServerFn<unknown, unknown> {
  return typeof value === "function" && (value as Record<symbol, unknown>)[SERVER_FN] === true;
}
