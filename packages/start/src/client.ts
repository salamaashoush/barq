/**
 * The client half of a server function, and NOTHING the server half needs.
 *
 * Its own module because of what importing it costs. The compiler replaces a
 * server-function module's contents with `export const x = clientRpc("<id>")`,
 * and that stub used to import from `@barqjs/start` — whose index re-exports
 * `context.ts`, which is `node:async_hooks`. Every client bundle that reached
 * one server function therefore pulled the request-context machinery, the
 * middleware runner, the validators and the error classes, and Vite printed
 * "node:async_hooks has been externalized for browser compatibility" on every
 * build.
 *
 * That was survivable while a route module was `lazy()`, because the cost sat
 * in that route's own chunk. It stopped being survivable when `routeTree.gen.ts`
 * started importing route modules STATICALLY: measured on
 * `packages/kitchen-sink`, 25.7 kB of it moved into the set every page
 * preloads, for an application with two server functions on one route.
 *
 * So the stub imports from here. `index.ts` re-exports every name below, so an
 * application still writes `import { createServerFn } from "@barqjs/start"` and
 * nothing about the authoring surface changes.
 */

import { decodeWire, encodeWire } from "@barqjs/server/codec";
import { type Middleware, flattenMiddleware, runMiddleware } from "./middleware.ts";

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
 * The two brands a thrown redirect and a thrown `notFound()` carry.
 *
 * DECLARED TWICE ON PURPOSE. The classes live in `@barqjs/router`, which this
 * package must not import: the dependency runs router -> start and start is an
 * OPTIONAL peer of it, so an import here would be a cycle and would break the
 * router for anyone using it without server functions. `Symbol.for` is the
 * global registry, so both declarations name the same symbol with no edge
 * between the packages — `SERVER_FN` above already works this way. The other
 * declaration is `REDIRECT` / `NOT_FOUND` in `packages/router/src/errors.ts`,
 * and `server.test.ts` checks the two agree.
 */
export const REDIRECT = Symbol.for("barq.redirect");
export const NOT_FOUND = Symbol.for("barq.not-found");

/**
 * How the data channel says "the answer is an instruction, not a value".
 *
 * A HEADER rather than a body sniff, so a caller that does not care never
 * parses the body to find out, and so a handler returning a plain object that
 * happens to have a `to` field is never mistaken for a redirect.
 */
export const RPC_CONTROL = "x-barq-rpc";

/**
 * Present when a middleware's `sendContext` rides back with the result.
 *
 * A HEADER flagging a different body shape, which is what `RPC_CONTROL` already
 * does and for the same reason: an ordinary call — every call, in almost every
 * application — must not pay a second parse or a wrapper object to carry
 * something it does not have. With the flag the body is `{ result, context }`;
 * without it the body IS the result, byte for byte as before.
 */
export const RPC_CONTEXT = "x-barq-ctx";

/** The body shape {@link RPC_CONTEXT} announces. */
export interface RpcEnvelope {
  readonly result: unknown;
  readonly context: unknown;
}

/** What rides in the body under {@link RPC_CONTROL}. */
export type RpcControl =
  | { readonly kind: "redirect"; readonly to: string; readonly status: number }
  | { readonly kind: "not-found"; readonly message: string };

/**
 * A redirect that arrived over the wire, rebuilt on the client.
 *
 * NOT `@barqjs/router`'s `Redirect` — this package cannot construct that one.
 * It carries the same brand, so `isRedirect` from the router accepts it and the
 * router navigates on it exactly as it would on a redirect a loader threw. That
 * interchangeability is the whole reason those predicates are brand checks
 * rather than `instanceof`.
 */
export class RpcRedirect extends Error {
  readonly [REDIRECT] = true as const;
  readonly to: string;
  readonly status: number;
  constructor(to: string, status: number) {
    super(`redirect to ${to}`);
    this.name = "Redirect";
    this.to = to;
    this.status = status;
  }
}

/** The `notFound()` counterpart, branded for the same reason. */
export class RpcNotFound extends Error {
  readonly [NOT_FOUND] = true as const;
  constructor(message: string) {
    super(message);
    this.name = "NotFound";
  }
}

/**
 * A server function answered with a failure.
 *
 * THE MESSAGE IS NOT THE HANDLER'S, and that is deliberate rather than
 * unfinished. `server.ts` refuses to put a handler's error text on the wire
 * because it can name a table, a column or a filesystem path, and none of that
 * is the caller's business — TanStack serialises the whole error object to the
 * client instead. What a caller legitimately needs is the STATUS, so it is here
 * as a field rather than something to parse back out of a string.
 */
export class ServerFnError extends Error {
  readonly status: number;
  constructor(id: string, status: number) {
    super(`server function ${id} failed: ${status}`);
    this.name = "ServerFnError";
    this.status = status;
  }
}

export interface ServerFnMeta {
  /** Stable across edits and deploys: the module path and the export name. */
  id: string;
}

/**
 * How a server function is CALLED: `fn({ data })`, and `fn()` when it takes
 * none.
 *
 * TanStack's convention, and worth matching for a reason beyond fidelity: a
 * named field leaves room for the options that
 * come after it without ever changing the call shape again, and it removes the
 * `adminStats(undefined)` the bare form forced on every no-argument call.
 */
export type ServerFnArgs<In> = [undefined] extends [In]
  ? // The argument is OPTIONAL exactly when `undefined` is an acceptable input,
    // which covers both cases that want it: no validator at all (`In` is
    // `undefined`), and `.validator("unchecked")`, whose `In` is `unknown` and
    // which therefore admits `undefined` too. Asking `[In] extends [undefined]`
    // instead got the first and not the second, so every `unchecked` function
    // that takes nothing still had to be called with an argument.
    //
    // An optional ELEMENT, not a `void` one: a rest tuple with a `void` member
    // does not make the parameter optional, and `fn()` stayed "Expected 1
    // arguments, but got 0" until it was written this way.
    [options?: { readonly data: In } | FormData]
  : [options: { readonly data: In } | FormData];

/**
 * A server function, from either side.
 *
 * A bare `FormData` is accepted BESIDE the options object, and only there. It is
 * what `<form action={fn}>` hands the function on the enhanced path, and a
 * `FormData` can never be mistaken for an options object — so the no-JS
 * submission and the JS one reach the handler identically, which is the whole
 * point of that path. TanStack has no counterpart to match here.
 */
export type ServerFn<In, Out> = ((...args: ServerFnArgs<In>) => Promise<Out>) & {
  readonly [SERVER_FN]: true;
  readonly meta: ServerFnMeta;
};

/** The `data` out of a call, whichever of the two shapes it arrived in. */
export function dataOf(options: unknown): unknown {
  if (options instanceof FormData) return options;
  if (options === undefined || options === null) return undefined;
  return (options as { data?: unknown }).data;
}

/**
 * The client half. The compiler emits this in a module compiled for the client,
 * with the id, the chain, and nothing else — no handler body, no validator, no
 * imports the body needed.
 *
 * `chain` is the middlewares the function declared, and it is here so a
 * `.client()` half can run around the fetch. Only the CLIENT halves survive the
 * compile: `createMiddleware(...).server(fn)` has its `server` argument deleted
 * in the client build, so a middleware may hold both without the server body —
 * or the database import it needed — reaching the browser.
 */
export function clientRpc<In, Out>(
  id: string,
  chain: readonly Middleware[] = [],
): ServerFn<In, Out> {
  const flattened = flattenMiddleware(chain);

  /**
   * The fetch, as the INNERMOST step of the chain.
   *
   * A client middleware therefore wraps the request the way a server one wraps
   * the handler: it can read what it is about to send, add to `sendContext`,
   * and see the result on the way back. TanStack reaches the same arrangement
   * by appending the server function itself to the chain as a middleware.
   */
  const send = async (input: unknown, sendContext: Record<string, unknown>): Promise<Out> => {
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
      //
      // `context` is what the CLIENT halves asked to send. It is absent from the
      // body when they asked for nothing, so an application with no client
      // middleware sends exactly the bytes it sent before.
      body: form
        ? input
        : JSON.stringify(
            Object.keys(sendContext).length === 0
              ? { input: encodeWire(input) }
              : { input: encodeWire(input), context: encodeWire(sendContext) },
          ),
      credentials: "same-origin",
      // `manual` so a handler that answers with its OWN 3xx — a real
      // `new Response(null, { status: 302 })`, not a `throw redirect(...)` —
      // is handed back as a response rather than silently followed. The
      // default `follow` would fetch the target and hand the CALLER that
      // page's body, which is how TanStack's fetcher turns a redirecting
      // server function into an opaque HTML string.
      redirect: "manual",
    });
    // A control answer is an INSTRUCTION rather than a value, and it is read
    // off the header so an ordinary result never pays a second body parse.
    const control = response.headers.get(RPC_CONTROL);
    if (control !== null) throw fromControl((await response.json()) as RpcControl);
    if (!response.ok) throw new ServerFnError(id, response.status);
    if (response.headers.get(RPC_CONTEXT) === null) return decodeWire<Out>(await response.json());
    const envelope = decodeWire<RpcEnvelope>(await response.json());
    // What the SERVER's chain sent back, merged into the same object the client
    // halves have been writing. A client middleware reads it on the way out
    // through the `context` it was handed, which is that object.
    Object.assign(returned, envelope.context as Record<string, unknown>);
    return envelope.result as Out;
  };

  let returned: Record<string, unknown> = {};

  const call = async (options?: unknown): Promise<Out> => {
    const input = dataOf(options);
    // NO CHAIN, NO RUNNER. Every application without a client middleware takes
    // this line, and it is the line the compiler emitted before any of this
    // existed — one fetch, no closures built, no objects allocated.
    if (flattened.length === 0) return send(input, EMPTY_CONTEXT);

    const context: Record<string, unknown> = {};
    const sendContext: Record<string, unknown> = {};
    returned = context;
    return (await runMiddleware(flattened, "client", {
      data: input,
      signal: new AbortController().signal,
      context,
      sendContext,
      run: (data) => send(data, sendContext),
    })) as Out;
  };

  return Object.assign(call, { [SERVER_FN]: true as const, meta: { id } });
}

/** Shared, because the no-middleware path never writes to it. */
const EMPTY_CONTEXT: Record<string, unknown> = {};

/**
 * Rebuild the throwable a control answer describes.
 *
 * An UNKNOWN kind is an error rather than a pass-through: it means the server is
 * newer than the client and is describing something this build cannot act on,
 * and returning it as a value would let a navigation instruction be rendered as
 * data.
 */
function fromControl(control: RpcControl): Error {
  if (control.kind === "redirect") return new RpcRedirect(control.to, control.status);
  if (control.kind === "not-found") return new RpcNotFound(control.message);
  return new Error(
    `[barq] server function answered with an unrecognised ${RPC_CONTROL} kind ` +
      `${JSON.stringify((control as { kind: string }).kind)}; the server is newer than this client bundle.`,
  );
}

/** Whether a value is a server function, by brand rather than by shape. */
export function isServerFn(value: unknown): value is ServerFn<unknown, unknown> {
  return (
    typeof value === "function" && (value as unknown as Record<symbol, unknown>)[SERVER_FN] === true
  );
}
