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
import { startOptions } from "./start-instance.ts";

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
 * The {@link RPC_CONTROL} value for a `Response` the handler returned.
 *
 * The response IS the result then, and its body is whatever the handler wrote,
 * so the stub hands it back whole rather than reading it as a wire value. No
 * body rides under this one, which is why it is not an {@link RpcControl} kind.
 */
export const RPC_RESPONSE = "response";

/**
 * The {@link RPC_CONTROL} value for an answer that arrives over time.
 *
 * The body is then one JSON line for each value the function yielded, each
 * holding a wire-encoded value, and the stub hands the caller an async iterable
 * of them. A line that says the function failed ends it with a
 * {@link ServerFnError}.
 */
export const RPC_STREAM = "stream";

/** One line of a streamed answer: a value, the chain's `sendContext`, or a failure. */
export type RpcStreamLine = { readonly v: unknown } | { readonly c: unknown } | { readonly e: 1 };

/**
 * What a caller is handed for a handler's result.
 *
 * A function that returns a `ReadableStream` or an async iterable answers over
 * time, and both arrive as an async iterable of the values, in the browser and
 * in process alike.
 */
export type Streamed<Out> =
  Out extends ReadableStream<infer Value>
    ? AsyncIterableIterator<Value>
    : Out extends AsyncIterable<infer Value>
      ? AsyncIterableIterator<Value>
      : Out;

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

/**
 * What rides in the body under {@link RPC_CONTROL}.
 *
 * `options` and `data` are wire-encoded, so a `Date` in a redirect's search or
 * in a not-found's data arrives as one. Each is absent when the thrown value
 * carried none, which leaves the body the two fields it otherwise is.
 */
export type RpcControl =
  | {
      readonly kind: "redirect";
      readonly to: string;
      readonly status: number;
      readonly options?: unknown;
    }
  | {
      readonly kind: "not-found";
      readonly message: string;
      readonly data?: unknown;
      readonly routeId?: string;
    };

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
  readonly statusCode: number;
  /**
   * The navigation an options-form redirect described: `to`, `params`,
   * `search`, `hash`, `replace`, `reloadDocument`, `href`. The router goes
   * there in place of `to` when it is present.
   */
  readonly options?: Record<string, unknown>;
  constructor(to: string, status: number, options?: Record<string, unknown>) {
    super(`redirect to ${to}`);
    this.name = "Redirect";
    this.to = to;
    this.status = status;
    this.statusCode = status;
    this.options = options;
  }
}

/** The `notFound()` counterpart, branded for the same reason. */
export class RpcNotFound extends Error {
  readonly [NOT_FOUND] = true as const;
  readonly isNotFound = true as const;
  /** What `notFound({ data })` carried, for the `notFoundComponent` that renders this. */
  readonly data?: unknown;
  /** The route whose `notFoundComponent` answers, when the thrower named one. */
  readonly routeId?: string;
  constructor(message: string, data?: unknown, routeId?: string) {
    super(message);
    this.name = "NotFound";
    this.data = data;
    this.routeId = routeId;
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
  /**
   * The answer itself, unread.
   *
   * A middleware that refuses with `throw new Response("sign in first", {
   * status: 401 })` wrote that body for the caller, and this is where the
   * caller reads it. A handler's own failure has nothing here worth reading:
   * the server answers those with one fixed line, for the reason above.
   */
  readonly response?: Response;
  constructor(id: string, status: number, response?: Response) {
    super(
      `The server function \`${id}\` answered ${status}. A handler's own error text is never sent to the browser, so read it in the server's log. ` +
        "`error.response` holds the answer when a middleware refused the call.",
    );
    this.name = "ServerFnError";
    this.status = status;
    this.response = response;
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
/**
 * What a call may carry beside its `data`. TanStack's three, under their names.
 */
export interface ServerFnCallOptions {
  /**
   * Aborts the call. In the browser the fetch is cancelled, and the server sees
   * its request go away, which is what the handler's own `signal` follows.
   */
  readonly signal?: AbortSignal;
  /**
   * Sent with the request. A name set here wins over the same name from a
   * client middleware's `next({ headers })`, since the call is the more
   * specific of the two.
   */
  readonly headers?: HeadersInit;
  /** Used in place of the global `fetch`, for this call alone. */
  readonly fetch?: typeof fetch;
}

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
    [options?: ({ readonly data?: In } & ServerFnCallOptions) | FormData]
  : [options: ({ readonly data: In } & ServerFnCallOptions) | FormData];

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
  /**
   * Where a form posts to reach this function: what `<form action={fn}>`
   * writes. Empty for a function that is not mounted, which has no endpoint.
   */
  readonly url: string;
};

/**
 * Any server function, whatever it takes and returns.
 *
 * `never` in, because the input sits in a parameter: a function that takes a
 * string does not accept `unknown`, and every function accepts `never`.
 */
export type AnyServerFn = ServerFn<never, unknown>;

/** The form endpoint of a mounted id, or nothing for a function with none. */
export function urlOf(id: string): string {
  return id === "" ? "" : RPC_PREFIX + encodeURIComponent(id);
}

/** The `data` out of a call, whichever of the two shapes it arrived in. */
export function dataOf(options: unknown): unknown {
  if (options instanceof FormData) return options;
  if (options === undefined || options === null) return undefined;
  return (options as { data?: unknown }).data;
}

/** What a call asked for beside its `data`. A bare `FormData` asks for nothing. */
export function callOptionsOf(options: unknown): ServerFnCallOptions | undefined {
  if (options instanceof FormData || options === undefined || options === null) return undefined;
  return options;
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
  // With the application's global function middleware ahead of the function's
  // own, read when first needed for the reason `serverRpc` gives.
  let composed: { from: readonly Middleware[] | undefined; chain: readonly Middleware[] } | null =
    null;
  const composition = (): readonly Middleware[] => {
    const global = startOptions().functionMiddleware;
    if (composed === null || composed.from !== global) {
      composed = { from: global, chain: flattenMiddleware([...(global ?? []), ...chain]) };
    }
    return composed.chain;
  };

  /**
   * The fetch, as the INNERMOST step of the chain.
   *
   * A client middleware therefore wraps the request the way a server one wraps
   * the handler: it can read what it is about to send, add to `sendContext`,
   * and see the result on the way back. TanStack reaches the same arrangement
   * by appending the server function itself to the chain as a middleware.
   */
  const send = async (
    input: unknown,
    sendContext: Record<string, unknown>,
    /**
     * THIS call's context, which is where the server chain's answer is merged.
     * Absent on the path with no chain, where nothing could read it.
     */
    context?: Record<string, unknown>,
    asked?: ServerFnCallOptions,
    /** What the client halves passed to `next({ headers })`. */
    chainHeaders?: Headers,
  ): Promise<Out> => {
    // FormData goes as FormData. Routing it through the value codec would hand
    // the handler a plain OBJECT here and a real `FormData` on the no-JS path —
    // the same function seeing two input types depending on whether JS ran,
    // which is the divergence progressive enhancement exists to avoid. It also
    // keeps files, which no value codec in this class carries.
    const form = input instanceof FormData;
    // No content-type for the form case: the browser sets the multipart
    // boundary, and setting it by hand produces a body nothing can parse.
    let headers: HeadersInit | undefined = form ? undefined : JSON_BODY;
    if (chainHeaders !== undefined || asked?.headers !== undefined) {
      const merged = new Headers(chainHeaders);
      if (asked?.headers !== undefined) {
        for (const [name, value] of new Headers(asked.headers)) merged.set(name, value);
      }
      // Ours either way: the body is what this function encoded, whatever a
      // caller or a middleware believes it is sending.
      if (form) merged.delete("content-type");
      else merged.set("content-type", "application/json");
      headers = merged;
    }
    const response = await (asked?.fetch ?? fetch)(
      RPC_PREFIX + encodeURIComponent(id) + DATA_SUFFIX,
      {
        method: "POST",
        headers,
        signal: asked?.signal,
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
      },
    );
    // A control answer is an INSTRUCTION rather than a value, and it is read
    // off the header so an ordinary result never pays a second body parse.
    // A BROWSER hides a redirect it was told not to follow: status 0 and no
    // headers, so nothing below can recognise it. It is still the handler's
    // answer, and the status check would report it as a failure with no status.
    if (response.type === "opaqueredirect") return response as Out;
    const control = response.headers.get(RPC_CONTROL);
    // Before the status check: a response the handler returned is its answer
    // whatever status it chose.
    if (control === RPC_RESPONSE) return response as Out;
    if (control === RPC_STREAM) return received(response, id, context) as Out;
    if (control !== null) throw fromControl((await response.json()) as RpcControl);
    if (!response.ok) throw new ServerFnError(id, response.status, response);
    if (response.headers.get(RPC_CONTEXT) === null) return decodeWire<Out>(await response.json());
    const envelope = decodeWire<RpcEnvelope>(await response.json());
    // What the SERVER's chain sent back, merged into the same object the client
    // halves have been writing. A client middleware reads it on the way out
    // through the `context` it was handed, which is that object.
    if (context !== undefined) Object.assign(context, envelope.context);
    return envelope.result as Out;
  };

  const call = async (options?: unknown): Promise<Out> => {
    const input = dataOf(options);
    // NO CHAIN, NO RUNNER. Every application without a client middleware takes
    // this line, and it is the line the compiler emitted before any of this
    // existed — one fetch, no closures built, no objects allocated.
    const asked = callOptionsOf(options);
    const flattened = composition();
    if (flattened.length === 0) return send(input, EMPTY_CONTEXT, undefined, asked);

    const context: Record<string, unknown> = {};
    const sendContext: Record<string, unknown> = {};
    const headers = new Headers();
    return (await runMiddleware(flattened, "client", {
      data: input,
      signal: asked?.signal ?? new AbortController().signal,
      context,
      sendContext,
      headers,
      run: (data) => send(data, sendContext, context, asked, headers),
    })) as Out;
  };

  return Object.assign(call, { [SERVER_FN]: true as const, meta: { id }, url: urlOf(id) });
}

/**
 * A streamed answer, as the values it carries.
 *
 * Read a line at a time, so a value is handed over when its line has arrived
 * rather than when the answer is complete. Leaving the loop early cancels the
 * body, which is what tells the server to stop producing.
 */
async function* received(
  response: Response,
  id: string,
  context: Record<string, unknown> | undefined,
): AsyncIterableIterator<unknown> {
  const body = response.body;
  if (body === null) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end = pending.indexOf("\n");
      while (end !== -1) {
        const line = JSON.parse(pending.slice(0, end)) as RpcStreamLine;
        pending = pending.slice(end + 1);
        if ("e" in line) throw new ServerFnError(id, 500);
        if ("c" in line) {
          if (context !== undefined) Object.assign(context, decodeWire(line.c));
        } else yield decodeWire(line.v);
        end = pending.indexOf("\n");
      }
      if (done) return;
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
}

/** One object for every JSON call, which only ever reads it. */
const JSON_BODY = { "content-type": "application/json" };

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
  if (control.kind === "redirect") {
    return new RpcRedirect(
      control.to,
      control.status,
      control.options === undefined ? undefined : decodeWire(control.options),
    );
  }
  if (control.kind === "not-found") {
    return new RpcNotFound(
      control.message,
      control.data === undefined ? undefined : decodeWire(control.data),
      control.routeId,
    );
  }
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
