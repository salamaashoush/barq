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

import { decodeWire, encodeWire } from "@barqjs/server/codec";

export { getRequest, peekRequest, withRequest } from "./context.ts";

export const SERVER_FN = Symbol.for("barq.server-fn");

/** Where mounted server functions answer. */
export const RPC_PREFIX = "/_barq/fn/";

/**
 * What distinguishes an RPC call from a form submission: the URL, not a header.
 *
 * `/_barq/fn/<id>` is what `<form action={fn}>` writes, takes `FormData`, and
 * answers with a redirect a browser can follow with JS disabled.
 * `/_barq/fn/<id>.data` is the JSON channel and answers with a value.
 *
 * React Router's `.data` suffix, and the reason is its reason: a header decides
 * the response shape invisibly, and a form cannot set one. RedwoodSDK shows the
 * failure — it emits the right hidden fields for a no-JS submit and never reads
 * them, so the form posts, returns 200, and nothing happens.
 */
export const DATA_SUFFIX = ".data";

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
 * The client half. The compiler emits this in a module compiled for the client,
 * with the id and nothing else — no handler body, no validator, no imports the
 * body needed.
 */
export function clientRpc<In, Out>(id: string): ServerFn<In, Out> {
  const call = async (input: In): Promise<Out> => {
    // FormData goes as FormData. Routing it through the value codec would hand
    // the handler a plain OBJECT here and a real `FormData` on the no-JS path —
    // the same function seeing two input types depending on whether JS ran,
    // which is the divergence progressive enhancement exists to avoid. It also
    // keeps files, which no value codec in this class carries.
    const form = input instanceof FormData;
    const response = await fetch(RPC_PREFIX + encodeURIComponent(id) + DATA_SUFFIX, {
      method: "POST",
      // No content-type for the form case: the browser sets the multipart
      // boundary, and setting it by hand produces a body nothing can parse.
      headers: form ? undefined : { "content-type": "application/json" },
      // Otherwise seroval's JSON channel, so an argument carries a Date, a Map
      // or a cycle the same way a hydration seed does — and reconstructs
      // through `fromJSON`, which evaluates nothing.
      body: form ? (input as FormData) : JSON.stringify({ input: encodeWire(input) }),
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error(`server function ${id} failed: ${response.status}`);
    return decodeWire<Out>(await response.json());
  };
  return Object.assign(call, { [SERVER_FN]: true as const, meta: { id } });
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

/** Whether a value is a server function, by brand rather than by shape. */
export function isServerFn(value: unknown): value is ServerFn<unknown, unknown> {
  return (
    typeof value === "function" && (value as unknown as Record<symbol, unknown>)[SERVER_FN] === true
  );
}
