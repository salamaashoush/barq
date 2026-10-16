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
import {
  type FailedAnswer,
  type ServerFnIssue,
  type ServerFnThrown,
  ServerFnError,
} from "./fn-error.ts";
import { applyFlight, applyFrameResponse, mountedFramesHeader } from "./frames-client.ts";
import { LIVE_CALL, type LiveRequest, registerStub } from "./stubs.ts";
import { FRAMES_HEADER, RPC_FLIGHT, RPC_FRAME } from "./frames.ts";
import {
  type Middleware,
  NOT_FOUND,
  REDIRECT,
  flattenMiddleware,
  runMiddleware,
} from "./middleware.ts";
import { startOptions } from "./start-instance.ts";

export { STATIC_PREFIX, staticFunctionMiddleware, staticUrl } from "./static-fn.ts";
export { NOT_FOUND, REDIRECT } from "./middleware.ts";
export { ServerFnError, type ServerFnIssue, type ServerFnThrown } from "./fn-error.ts";
export { LIVE_CALL, type LiveRequest, clientStub } from "./stubs.ts";
export { type FrameComponent, applyFrameResponse, frameAdapter } from "./frames-client.ts";
export { type LiveIterable, type LiveStatus, live } from "./live-client.ts";
export { type BindingSlot, FRAME_APPLIED_EVENT, type Slot, isFrame } from "./frames.ts";

export const SERVER_FN: unique symbol = Symbol.for("barq.server-fn");

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
 * `/_barq/fn/<id>.live` is the live address: the data address's answer, framed
 * as server-sent events for as long as it stands. Its own URL, because a cache
 * keys on the URL and not on a header nothing tells it to vary by.
 */
export const LIVE_SUFFIX = ".live";

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
 * The {@link RPC_CONTROL} value for a `Response` a handler, a validator or a
 * middleware THREW: the call rejects with that response itself, as TanStack's
 * does. Its body and status are what the author wrote for the caller.
 */
export const RPC_THROWN = "thrown";

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
export type RpcStreamLine =
  | { readonly v: unknown }
  | { readonly c: unknown }
  | { readonly e: 1; readonly t?: ServerFnThrown };

/** The body of a 400 for refused input. */
export interface ServerFnInputAnswer {
  readonly error: "invalid input";
  readonly message: string;
  readonly issues: readonly ServerFnIssue[];
}

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

/** The JSON a failed call answered with, read from a copy so `error.response` stays unread. */
async function failedAnswer(response: Response): Promise<FailedAnswer | undefined> {
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) return undefined;
  try {
    return (await response.clone().json()) as FailedAnswer;
  } catch {
    return undefined;
  }
}

/**
 * The HTTP methods a server function answers. `GET` is the default, for a read
 * the browser and a CDN may cache; see {@link RPC_CALLER} for what keeps a link
 * from reaching one. `POST` is for a write and is the only one a form can reach.
 */
export type ServerFnMethod = "GET" | "POST";

export interface ServerFnMeta {
  /** Stable across edits and deploys: the module path and the export name. */
  id: string;
  /** Absent for `POST`, which is every function that did not ask for `GET`. */
  readonly method?: ServerFnMethod;
}

/**
 * The request header every GET call the stub makes carries, and is refused
 * without.
 *
 * A link, an `<img>`, a prefetch and a navigation cannot set a header; only
 * script can, and a cross-origin script that sets one is preflighted and
 * refused by the origin check. So a `GET` server function stays out of reach
 * of everything that is not this application's own code, which is the reason
 * `GET` was once refused outright: a mutation reachable by navigation is a
 * one-click CSRF carrying `SameSite=Lax` cookies.
 */
export const RPC_CALLER = "x-barq-fn";

/** Where a GET call's payload rides, since a GET has no body. */
export const PAYLOAD_PARAM = "payload";

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

export type ServerFnArgs<In, Method extends ServerFnMethod = "POST"> = [undefined] extends [In]
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
    [options?: ({ readonly data?: In } & ServerFnCallOptions) | FormFor<Method>]
  : [options: ({ readonly data: In } & ServerFnCallOptions) | FormFor<Method>];

/** A form is a body, so only a `POST` function takes one. */
type FormFor<Method extends ServerFnMethod> = Method extends "POST" ? FormData : never;

/**
 * A server function, from either side.
 *
 * A bare `FormData` is accepted BESIDE the options object, and only there. It is
 * what `<form action={fn}>` hands the function on the enhanced path, and a
 * `FormData` can never be mistaken for an options object — so the no-JS
 * submission and the JS one reach the handler identically, which is the whole
 * point of that path. TanStack has no counterpart to match here.
 */
export type ServerFn<In, Out, Method extends ServerFnMethod = "POST"> = ((
  ...args: ServerFnArgs<In, Method>
) => Promise<Out>) & {
  readonly [SERVER_FN]: true;
  readonly meta: ServerFnMeta;
  /** TanStack's name for `meta`: the id this function is mounted at. */
  readonly serverFnMeta: ServerFnMeta;
  /** The method this function answers. */
  readonly method: ServerFnMethod;
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
 * string does not accept `unknown`, and every function accepts `never`. The
 * method is `never` for the same reason: it decides whether a form is a
 * parameter.
 */
export type AnyServerFn = ServerFn<never, unknown, never>;

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
export function clientRpc<In, Out, Method extends ServerFnMethod = "POST">(
  id: string,
  declaredChain: readonly ChainStep[] = [],
  declared?: { readonly method?: Method },
): ServerFn<In, Out, Method> {
  const method: ServerFnMethod = declared?.method ?? "POST";
  const chain = inlineServerFns(declaredChain);
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
    /** What the client halves passed to `next({ fetch })`, the last one winning. */
    chainFetch?: typeof fetch,
    /** A call at the live address, whose answer is handed back whole for `live`'s loop to read. */
    live?: LiveRequest,
  ): Promise<Out> => {
    // FormData goes as FormData. Routing it through the value codec would hand
    // the handler a plain OBJECT here and a real `FormData` on the no-JS path —
    // the same function seeing two input types depending on whether JS ran,
    // which is the divergence progressive enhancement exists to avoid. It also
    // keeps files, which no value codec in this class carries.
    const form = input instanceof FormData;
    if (form && method === "GET") {
      throw new TypeError(
        `[barq] The server function \`${id}\` answers GET, and a GET has no body to carry a form. ` +
          'Declare it `createServerFn({ method: "POST" })` to accept a `FormData`.',
      );
    }
    // Otherwise seroval's JSON channel, so an argument carries a Date, a Map or
    // a cycle the same way a hydration seed does — and reconstructs through
    // `fromJSON`, which evaluates nothing.
    //
    // `context` is what the CLIENT halves asked to send. It is absent from the
    // payload when they asked for nothing, so an application with no client
    // middleware sends exactly the bytes it sent before.
    const payload = form
      ? undefined
      : JSON.stringify(
          Object.keys(sendContext).length === 0
            ? { input: encodeWire(input) }
            : { input: encodeWire(input), context: encodeWire(sendContext) },
        );
    // No content-type for the form case: the browser sets the multipart
    // boundary, and setting it by hand produces a body nothing can parse. None
    // for a GET either, which has no body to describe.
    let headers: HeadersInit | undefined = method === "GET" ? CALLER : form ? undefined : JSON_BODY;
    // A mutation names the frames the page has mounted, so its answer can
    // carry the ones it changed.
    const mountedFrames = method === "POST" && live === undefined ? mountedFramesHeader() : null;
    if (mountedFrames !== null) {
      const withFrames = new Headers(headers);
      withFrames.set(FRAMES_HEADER, mountedFrames);
      headers = withFrames;
    }
    if (chainHeaders !== undefined || asked?.headers !== undefined) {
      const merged = new Headers(chainHeaders);
      if (mountedFrames !== null) merged.set(FRAMES_HEADER, mountedFrames);
      if (asked?.headers !== undefined) {
        for (const [name, value] of new Headers(asked.headers)) merged.set(name, value);
      }
      // Ours either way: the body is what this function encoded, whatever a
      // caller or a middleware believes it is sending.
      if (form || method === "GET") merged.delete("content-type");
      else merged.set("content-type", "application/json");
      if (method === "GET") merged.set(RPC_CALLER, "1");
      headers = merged;
    }
    if (live !== undefined) {
      const withPosition = new Headers(headers);
      if (live.lastEventId !== null) withPosition.set("last-event-id", live.lastEventId);
      headers = withPosition;
    }
    const endpoint =
      RPC_PREFIX + encodeURIComponent(id) + (live === undefined ? DATA_SUFFIX : LIVE_SUFFIX);
    const response = await (asked?.fetch ?? chainFetch ?? startOptions().serverFns?.fetch ?? fetch)(
      method === "GET"
        ? `${endpoint}?${PAYLOAD_PARAM}=${encodeURIComponent(payload ?? "")}`
        : endpoint,
      {
        method,
        headers,
        signal: live?.signal ?? asked?.signal,
        body: method === "GET" ? undefined : form ? input : payload,
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
    if (live !== undefined) return response as Out;
    const control = response.headers.get(RPC_CONTROL);
    // Before the status check: a response the handler returned is its answer
    // whatever status it chose.
    if (control === RPC_RESPONSE) return response as Out;
    if (control === RPC_THROWN) throw response;
    if (control === RPC_STREAM) return received(response, id, context) as Out;
    if (control === RPC_FRAME) return (await applyFrameResponse(response)) as Out;
    if (control === RPC_FLIGHT) {
      const flown = await applyFlight(response);
      if (response.headers.get(RPC_CONTEXT) === null) return flown as Out;
      const envelope = flown as RpcEnvelope;
      if (context !== undefined) Object.assign(context, envelope.context);
      return envelope.result as Out;
    }
    if (control !== null) throw fromControl((await response.json()) as RpcControl);
    if (!response.ok) {
      throw new ServerFnError(id, response.status, response, await failedAnswer(response));
    }
    if (response.headers.get(RPC_CONTEXT) === null) return decodeWire<Out>(await response.json());
    const envelope = decodeWire<RpcEnvelope>(await response.json());
    // What the SERVER's chain sent back, merged into the same object the client
    // halves have been writing. A client middleware reads it on the way out
    // through the `context` it was handed, which is that object.
    if (context !== undefined) Object.assign(context, envelope.context);
    return envelope.result as Out;
  };

  const call = async (options?: unknown, live?: LiveRequest): Promise<Out> => {
    const input = dataOf(options);
    // NO CHAIN, NO RUNNER. Every application without a client middleware takes
    // this line, and it is the line the compiler emitted before any of this
    // existed — one fetch, no closures built, no objects allocated.
    const asked = callOptionsOf(options);
    const flattened = composition();
    if (flattened.length === 0)
      return send(input, EMPTY_CONTEXT, undefined, asked, undefined, undefined, live);

    const context: Record<string, unknown> = {};
    const sendContext: Record<string, unknown> = {};
    const headers = new Headers();
    const chosen: { current: typeof fetch | undefined } = { current: undefined };
    return (await runMiddleware(flattened, "client", {
      data: input,
      meta: { id },
      method,
      signal: asked?.signal ?? new AbortController().signal,
      context,
      sendContext,
      headers,
      fetch: chosen,
      run: (data) => send(data, sendContext, context, asked, headers, chosen.current, live),
    })) as Out;
  };

  const meta: ServerFnMeta = method === "GET" ? { id, method } : { id };
  const stub = Object.assign((options?: unknown) => call(options), {
    [SERVER_FN]: true as const,
    [SERVER_FN_CHAIN]: chain,
    [LIVE_CALL]: (options: unknown, live: LiveRequest): Promise<Response> =>
      call(options, live) as Promise<Response>,
    meta,
    serverFnMeta: meta,
    method,
    url: urlOf(id),
  });
  registerStub(id, stub);
  return stub;
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
        if ("e" in line) throw new ServerFnError(id, 500, undefined, { thrown: line.t });
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

/** What a GET call carries in place of a body's type. */
const CALLER = { [RPC_CALLER]: "1" };

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

/** Where a server function keeps the middleware it declared, for another to inline. */
export const SERVER_FN_CHAIN: unique symbol = Symbol.for("barq.server-fn-chain");

/** What `.middleware([...])` takes: a middleware, or a server function whose chain it inlines. */
export type ChainStep = Middleware | AnyServerFn;

/**
 * A chain with each server function in it replaced by the middleware that
 * function declared, which is TanStack's rule: listing a function lists its
 * guards, never its handler.
 */
export function inlineServerFns(chain: readonly ChainStep[]): readonly Middleware[] {
  return chain.flatMap((step): readonly Middleware[] =>
    isServerFn(step) ? chainOf(step) : [step as Middleware],
  );
}

function chainOf(fn: AnyServerFn | ServerFn<unknown, unknown>): readonly Middleware[] {
  return (
    (fn as unknown as Record<symbol, readonly Middleware[] | undefined>)[SERVER_FN_CHAIN] ?? []
  );
}

/** Whether a value is a server function, by brand rather than by shape. */
export function isServerFn(value: unknown): value is ServerFn<unknown, unknown> {
  return (
    typeof value === "function" && (value as unknown as Record<symbol, unknown>)[SERVER_FN] === true
  );
}
