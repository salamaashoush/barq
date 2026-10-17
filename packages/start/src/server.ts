/**
 * The request handler: one URL shape, one lookup, and the checks that run
 * before a handler body does.
 *
 * Every default here is the strict one, because the survey found the same four
 * failures composing across shipping frameworks — an unvalidated, CSRF-unchecked,
 * publicly-mounted endpoint reached by an id enumerable from the client bundle.
 * Each is cheap to close and expensive to retrofit.
 */

import { isDev, isSafeError } from "@barqjs/core";
import {
  commitEventResponse,
  commitResponseStub,
  createRequestEvent,
  isNavigable,
} from "@barqjs/web/internal";
import { diagnosticsEnabled, emitDiagnostic } from "@barqjs/core/internal";
import { decodeWire, encodeWire } from "@barqjs/server/codec";
import { provideRequestEvent } from "@barqjs/server/storage";
import { createBodyTooLargeError, limitBodyStream } from "srvx/body-limit";

import {
  type ResponseDraft,
  applyResponseDraft,
  createResponseDraft,
  draftedStatus,
  invalidatedFrames,
  setRequestMiddlewareContext,
} from "./context.ts";
import {
  NOT_FOUND,
  PAYLOAD_PARAM,
  REDIRECT,
  RPC_CALLER,
  RPC_CONTEXT,
  RPC_CONTROL,
  RPC_RESPONSE,
  RPC_THROWN,
  RPC_STREAM,
  type RpcControl,
  type RpcStreamLine,
  type ServerFnInputAnswer,
  type ServerFnIssue,
  type ServerFnThrown,
} from "./client.ts";
import {
  type AnyServerFn,
  DATA_SUFFIX,
  LIVE_SUFFIX,
  type InputError,
  isInputError,
  RPC_PREFIX,
  type ServerFn,
  isServerFn,
  runRequestMiddleware,
  startOptions,
  takeSendContext,
} from "./index.ts";
import { serverTiming } from "./timing.ts";
import {
  type ServerFrame,
  flightResponse,
  frameResponse,
  mountedFrames,
  serverFrame,
} from "./frames-server.ts";
import { FRAMES_HEADER, installFrames, isFrame } from "./frames.ts";
import { liveResponse } from "./live-server.ts";

installFrames(serverFrame as never);

/**
 * id → function, and the ONLY way an id becomes callable.
 *
 * A `Map` rather than an object, because the id comes off the wire and an
 * object's prototype is reachable through one. A client-supplied name used as a
 * raw property access has shipped as a critical RCE elsewhere: asking for
 * `constructor` yields `Function`, and then arbitrary code. `Map.get`
 * has no prototype chain to walk into, so the guard is structural rather than a
 * `hasOwnProperty` call someone can later forget.
 */
interface Mounted {
  readonly registry: Map<string, ServerFn<unknown, unknown>>;
  /** How to mount the build's manifest, once something has said. */
  manifest: (() => Promise<unknown>) | null;
}

/**
 * ONE registry per process, whichever copy of this module asks.
 *
 * A build compiles this module INTO its server bundle, and a host that serves
 * that bundle through its own `serveBarq` has imported a second copy. Kept in
 * a module variable, each copy had a registry of its own: the bundle mounted
 * every function into one and the host answered 404 out of the other.
 */
const MOUNTED = ((globalThis as Record<symbol, unknown>)[Symbol.for("barq.start.server-fns")] ??= {
  registry: new Map<string, ServerFn<unknown, unknown>>(),
  manifest: null,
}) as Mounted;

const REGISTRY = MOUNTED.registry;

/**
 * Say how the build's manifest is mounted, so a call can ask for it.
 *
 * The server entry imports the manifest when it first renders a page, which is
 * late for a function called before any page has been asked for: a server that
 * has just started and a browser tab that was already open. The id it names
 * was in no registry yet, and the answer was a 404 for a function that exists.
 */
export function mountOnDemand(manifest: () => Promise<unknown>): void {
  MOUNTED.manifest = manifest;
}

/**
 * Mount a server function. The compiler emits one call per EXPORTED server
 * function in a module compiled for the server.
 *
 * Export-ness is what decides reachability, which is SvelteKit's rule and the
 * only genuine notion of an internal server function in the survey: a
 * non-exported one is never registered, so it has no id and no endpoint, and is
 * still callable from its siblings.
 */
export function mount(id: string, fn: AnyServerFn): void {
  if (!isServerFn(fn))
    throw new TypeError(
      `[barq] \`mount(${JSON.stringify(id)}, fn)\` was given something that is not a server function, so there is nothing to answer calls with. Pass a function built with \`createServerFn().handler(...)\`.`,
    );
  if (id === "")
    throw new TypeError(
      "[barq] `mount(id, fn)` was given an empty `id`, so no request could reach the function. Pass a non-empty string that is unique in the application.",
    );
  // RE-MOUNTING AN ID REPLACES, and refusing it was a dev-server bug rather
  // than a safeguard. The generated manifest is invalidated whenever a
  // server-function module is transformed and re-imported on the next request,
  // while this registry lives in a module nothing invalidates — so the second
  // evaluation was refusing ids the first had legitimately claimed, and every
  // page answered 500 after the first edit.
  //
  // Nothing is lost by replacing: an id is `<root-relative file>#<export>`, so
  // two DISTINCT functions can only collide if two paths normalise to one, and
  // the manifest generator refuses that where it can see the whole set at once.
  // Here there is no second set to compare against — only the same module,
  // again, newer.
  // Stamped rather than read. The compiler leaves the SERVER half of a module
  // alone — it is the module, compiled — so the builder has no id of its own;
  // the id lives in the manifest the build generates, and mounting is where the
  // two meet. `formAttr` reads it back off the function to write a form's
  // action, so a function that is mounted has a URL and one that is not has
  // neither an id nor an endpoint.
  fn.meta.id = id;
  REGISTRY.set(id, fn);
}

/** The mounted surface, for the build to record and a reviewer to read. */
export function mounted(): string[] {
  return [...REGISTRY.keys()].toSorted();
}

/**
 * The function mounted at an id, or `undefined`.
 *
 * Exported for the BUILD's chain check, which has to ask each reachable id what
 * middleware it actually carries. It reads the registry inside whichever bundle
 * it is called from, which is why the check runs through the server entry
 * rather than from the Vite plugin: `resolve.noExternal` compiles `@barqjs/*`
 * INTO the ssr bundle, so a plugin importing this module would be asking a
 * second, empty registry.
 */
export function mountedFn(id: string): ServerFn<unknown, unknown> | undefined {
  return REGISTRY.get(id);
}

/** Test seam. Not for application use. */
export function unmountAll(): void {
  REGISTRY.clear();
  MOUNTED.manifest = null;
}

export interface HandlerOptions {
  /**
   * Origins allowed to call, beyond the request's own. Same-origin is always
   * allowed; this widens it.
   */
  allowedOrigins?: readonly string[];
  /**
   * The largest body a call may send, in bytes. 1 MiB when omitted.
   *
   * Enforced on the bytes as they are read, and answered with a 413. The body
   * is parsed BEFORE the chain runs, so this is the only thing standing between
   * a caller no middleware has seen yet and the server's memory.
   *
   * srvx's `maxRequestBodySize` is the same idea for the whole server and has
   * no default; this one is for the server-function channel alone, so it holds
   * under a handler that srvx is not in front of.
   */
  maxBodySize?: number;
  /**
   * The largest FORM body, multipart or urlencoded. `maxBodySize` when omitted.
   *
   * Apart from it because a file upload is the one body that legitimately
   * outgrows the default, and raising `maxBodySize` to admit one would widen
   * the value channel by the same amount for no caller that needs it. A form is
   * parsed whole into memory, so this is what one request can make the server
   * hold.
   */
  maxFormSize?: number;
  /**
   * What a failed call may tell its caller about the error, beyond its status.
   *
   * Only the development server passes it, so a production server answers a
   * handler's failure with the status and a fixed line and nothing of the
   * error: its message can name a table, a column or a path. In development the
   * caller is the developer, and the error's name, message and stack (mapped
   * to source by the dev server) are what make the failure debuggable from the
   * browser.
   */
  revealError?: (error: unknown) => ServerFnThrown;
  /**
   * Whether some route in this application can reach this id.
   *
   * The narrow half of the route-action manifest. Export-ness already decides
   * what is MOUNTED, and that is deliberately generous — a server function
   * exported for a sibling to import is mounted whether or not any page calls
   * it. Next.js concedes the consequence in its own release notes: "Even if a
   * Server Action or utility function is not imported elsewhere in your code,
   * it's still a publicly accessible HTTP endpoint."
   *
   * This closes that: an id no route reaches answers the 404 an unknown id
   * already answers, so the two are indistinguishable from outside.
   *
   * It takes NO route from the caller, deliberately. A client-supplied route
   * selecting a policy lets the caller pick the weakest one that reaches the
   * action, and this file's own rule says why that is not allowed — values
   * derived from the request are fine to navigate to and never fine to
   * authorize with. Which CHAIN runs is decided at build time by
   * `@barqjs/router`, not here and not per request.
   */
  reachable?: (id: string) => boolean;
}

/**
 * Is this request allowed to invoke a server function?
 *
 * `Origin` first, then `Sec-Fetch-Site` when `Origin` is absent. That fallback
 * is Waku's post-CVE shape and it is the strictest default found: `Origin` is
 * legitimately absent on some same-origin requests and on non-browser clients,
 * while `Sec-Fetch-Site` is sent by every modern browser and cannot be forged
 * from script. Next.js warns and PROCEEDS on a missing `Origin`; this refuses.
 */
export function originAllowed(request: Request, options?: HandlerOptions): boolean {
  const origin = request.headers.get("origin");
  if (origin !== null) {
    // A sandboxed iframe sends the literal string, so it is refused rather than
    // read as absent and fallen through.
    if (origin === "null") return false;
    if (origin === new URL(request.url).origin) return true;
    return options?.allowedOrigins?.includes(origin) ?? false;
  }
  const site = request.headers.get("sec-fetch-site");
  if (site === null) return false;
  return site === "same-origin" || site === "none";
}

/** Methods that cannot change state, so CSRF does not apply to them. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Is this a request a BROWSER made from another origin?
 *
 * A DIFFERENT QUESTION FROM `originAllowed`, and the difference is the whole
 * design. `originAllowed` guards `/_barq/fn/*`, which only ever exists to be
 * called by this application's own pages — so a request with no origin signal at
 * all is refused there, because there is no legitimate caller that omits one.
 *
 * A route handler is the opposite: an API route exists so that something OTHER
 * than a browser can call it. A Stripe webhook, a GitHub delivery, a cron
 * hitting it with curl — none of them send `Origin` or `Sec-Fetch-Site`, and
 * refusing on their absence would refuse the main reason API routes exist.
 *
 * So this answers the narrower question, and the narrower question is the one
 * CSRF actually asks. A cross-site forgery is by definition made BY A BROWSER
 * with the victim's cookies attached, and a browser making a cross-origin
 * state-changing request always says so — `Origin` on any cross-origin POST
 * since forever, `Sec-Fetch-Site` on everything in every current browser. So:
 * refuse when a signal is present and says cross-origin; allow when there is no
 * signal, because then it is not a browser and cannot be a forgery.
 *
 * `null` origin — a sandboxed iframe, a `data:` URL — is refused rather than
 * read as absent, which is a bypass that has shipped.
 */
export function crossOriginRefused(request: Request, allowedOrigins?: readonly string[]): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return false;

  const origin = request.headers.get("origin");
  if (origin !== null) {
    if (origin === "null") return true;
    if (origin === new URL(request.url).origin) return false;
    return !(allowedOrigins?.includes(origin) ?? false);
  }

  const site = request.headers.get("sec-fetch-site");
  // No signal at all: not a browser, so not a forgery.
  if (site === null) return false;
  return site !== "same-origin" && site !== "none";
}

/**
 * Handle one server-function request, or return null if the URL is not one.
 *
 * Returning null rather than a 404 is what lets this compose as middleware in
 * front of a page handler.
 */
export async function handleServerFn(
  request: Request,
  options?: HandlerOptions,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(RPC_PREFIX)) return null;

  // A mutation must not be reachable by navigation. RedwoodSDK shipped server
  // functions invocable over GET, which made a plain link a one-click mutation
  // carrying SameSite=Lax cookies. A GET reaches only a function that asked for
  // it, and only with the header no link can send; both are checked below.
  const method = request.method;
  if (method !== "POST" && method !== "GET") {
    return new Response("method not allowed", { status: 405, headers: { allow: "GET, POST" } });
  }
  if (!originAllowed(request, options)) return new Response("forbidden", { status: 403 });

  // The URL decides the shape, so a form and an RPC call cannot be confused for
  // one another by a header either of them can set.
  const path = url.pathname.slice(RPC_PREFIX.length);
  // The live address answers what the data address does, framed as events for
  // as long as the answer stands. Only `live`'s loop calls it.
  const isLive = path.endsWith(LIVE_SUFFIX);
  const isData = isLive || path.endsWith(DATA_SUFFIX);
  let id: string;
  try {
    id = decodeURIComponent(
      isLive
        ? path.slice(0, -LIVE_SUFFIX.length)
        : isData
          ? path.slice(0, -DATA_SUFFIX.length)
          : path,
    );
  } catch {
    // Not percent-encoding at all, so it names nothing.
    return new Response("bad request", { status: 400 });
  }

  let fn = REGISTRY.get(id);
  if (fn === undefined && MOUNTED.manifest !== null) {
    await MOUNTED.manifest();
    fn = REGISTRY.get(id);
  }
  if (fn === undefined) return new Response("not found", { status: 404 });
  // Same answer as an unknown id, so a caller cannot tell a function that
  // exists but is unrouted from one that does not exist.
  if (options?.reachable?.(id) === false) return new Response("not found", { status: 404 });
  // The function's own method, and only on the channel that can carry it: a
  // form is a POST, so a GET function has the data channel alone.
  const expected = fn.meta.method ?? "POST";
  if (method !== expected) {
    return new Response("method not allowed", { status: 405, headers: { allow: expected } });
  }
  if (method === "GET") {
    if (!isData) return new Response("not found", { status: 404 });
    if (request.headers.get(RPC_CALLER) === null) return new Response("forbidden", { status: 403 });
  }

  const bodyLimit = options?.maxBodySize ?? DEFAULT_BODY_LIMIT;
  const target = fn;
  // The draft the handler writes to through `setCookie` / `setResponseHeader`,
  // held HERE because the response is built after the handler has returned.
  const draft = createResponseDraft();

  /**
   * The call itself: read the body, run the function, build the answer. The
   * innermost step of the request middleware chain, so a global middleware
   * that refuses does so before a byte of the payload has been parsed.
   */
  const respond = async (): Promise<Response> => {
    let input: unknown;
    let clientContext: Record<string, unknown> | undefined;
    if (isData && (method === "GET" || !isFormBody(request))) {
      try {
        const body = (
          method === "GET" ? queryPayload(url, bodyLimit) : await capped(request, bodyLimit).json()
        ) as {
          input?: unknown;
          context?: unknown;
        };
        input = body?.input === undefined ? undefined : decodeWire(body.input);
        // WHAT THE CLIENT HALVES SENT, and it is UNTRUSTED — a caller writes this
        // body by hand as readily as the stub does. It reaches a server half as
        // `clientContext` and is never merged into `context`; `serverRpc` says
        // what merging it would let through. Spread, so a body that put a string
        // or a list here still hands the chain an object.
        clientContext =
          body?.context === undefined ? undefined : { ...(decodeWire(body.context) as object) };
      } catch (error) {
        return unreadable(error);
      }
    } else {
      try {
        input = await capped(request, options?.maxFormSize ?? bodyLimit).formData();
      } catch (error) {
        return unreadable(error);
      }
    }

    try {
      // `{ data }` on the value channel; a bare `FormData` on the form one, which
      // is the shape `<form action={fn}>` hands the function on the enhanced path
      // — so a handler sees the same input type whether or not JS ran.
      // `sendContext` is taken INSIDE the request context, because that is where
      // the function's chain left it: each request has its own, so two calls that
      // settle together cannot read one another's.
      const result = await (input instanceof FormData
        ? target(input)
        : (target as (o: unknown, c?: Record<string, unknown>) => Promise<unknown>)(
            { data: input },
            clientContext,
          ));
      const sendContext = takeSendContext();
      if (isLive) {
        if (result instanceof Response) return applyResponseDraft(result, draft);
        return applyResponseDraft(liveResponse(result, request), draft);
      }
      // A RETURNED RESPONSE IS HONOURED ON BOTH CHANNELS, and it did not used to
      // be: the value channel handed it to `encodeWire`, which answered
      // `Seroval Error (step: 1)` and a 500 with nothing in it. So a function that
      // set a cookie by returning a response worked with JS disabled and crashed
      // with JS enabled — the one divergence the form path exists to prevent.
      if (result instanceof Response) {
        // The data channel's client reads every other answer as a wire value, so
        // this one says it is not. A browser following a form needs no telling.
        if (isData) draft.headers.set(RPC_CONTROL, RPC_RESPONSE);
        return applyResponseDraft(result, draft);
      }
      // A component is a frame: the region it renders, for the page to apply.
      // A browser following a form has no page to apply it to.
      if (isFrame(result)) {
        if (isData) return applyResponseDraft(await frameResponse(result as ServerFrame), draft);
        return applyResponseDraft(seeOther(request), draft);
      }
      if (isIterable(result)) {
        if (isData) {
          return applyResponseDraft(streamed(result, sendContext, id, revealerOf(options)), draft);
        }
        // A browser following a form has nothing to read a stream with, so the
        // function is told nobody is listening and the form goes back.
        void result[Symbol.asyncIterator]().return?.();
        return applyResponseDraft(seeOther(request), draft);
      }
      if (isData) {
        // `draftedStatus` here and NOT inside `applyResponseDraft`, because the
        // two answer different questions: this response is the framework's to
        // build, so `setResponseStatus(201)` decides it — where a response the
        // handler RETURNED has already decided for itself.
        const answer = draftedStatus(draft, 200);
        // SINGLE FLIGHT: a mutation that said which frames it changed answers
        // with them, rendered again for the arguments the page has them
        // mounted with, beside its value. Each is asked for through its own
        // function, so its validator and its middleware decide as for a call.
        const mountedHere = mountedFrames(request.headers.get(FRAMES_HEADER));
        const changed = invalidatedFrames();
        if (mountedHere.length > 0 && changed.size > 0) {
          const flight = await flightResponse(
            Object.keys(sendContext).length === 0 ? result : { result, context: sendContext },
            mountedHere,
            changed,
            async (frame) => {
              const asked = REGISTRY.get(frame.id);
              if (asked === undefined || options?.reachable?.(frame.id) === false) return undefined;
              try {
                return await (asked as (o: unknown) => Promise<unknown>)({
                  data: frame.args === undefined ? undefined : decodeWire(frame.args),
                });
              } catch (error) {
                console.error(
                  `[barq] The frame of ${JSON.stringify(frame.id)} could not be rendered again for the mutation ${JSON.stringify(id)}, so its answer leaves it out. The error:`,
                  error,
                );
                return undefined;
              }
            },
          );
          if (Object.keys(sendContext).length > 0) flight.headers.set(RPC_CONTEXT, "1");
          return applyResponseDraft(
            new Response(flight.body, { ...answer, headers: flight.headers }),
            draft,
          );
        }
        // The ordinary shape is the RESULT and nothing around it. A chain that
        // sent something back gets the envelope instead, flagged by a header, so
        // a call that sends nothing pays neither the wrapper nor a second parse.
        if (Object.keys(sendContext).length === 0) {
          return applyResponseDraft(Response.json(encodeWire(result), answer), draft);
        }
        return applyResponseDraft(
          Response.json(encodeWire({ result, context: sendContext }), {
            ...answer,
            headers: { [RPC_CONTEXT]: "1" },
          }),
          draft,
        );
      }
      // Otherwise the browser goes back where it came from, which is what makes
      // the no-JS path a round trip rather than a dead end.
      return applyResponseDraft(seeOther(request), draft);
    } catch (error) {
      // A middleware rejects by throwing a Response — `throw new Response("", {
      // status: 401 })` — and it is returned as it stands.
      // The draft rides an error out as well. A middleware that rotated a session
      // cookie and THEN refused must not lose the rotation — the browser would
      // keep replaying a token the server has already retired.
      if (error instanceof Response) return thrownAnswer(error, isData, draft);
      // `throw redirect(...)` and `throw notFound()` are ANSWERS, and a server
      // function is entitled to both — a handler that finds the session expired
      // redirects to the login page, and one asked for a row that is gone says
      // so. Left to the catch-all below they would be a 500 with nothing in it,
      // and the two most ordinary control-flow throws in the framework would be
      // the two it could not carry.
      const control = controlOf(error);
      if (control !== null) {
        return applyResponseDraft(
          controlResponse(control, isData, (error as { headers?: unknown }).headers),
          draft,
        );
      }
      // A validation failure is the caller's fault and says so, with what was
      // wrong with each field: the issues describe the caller's own input, so a
      // form can show them. Anything else is reported without a body: a
      // handler's message can name a table, a column or a path, and none of that
      // is the caller's business.
      if (isInputError(error)) {
        return applyResponseDraft(
          isData
            ? Response.json(inputAnswer(error), { status: 400 })
            : new Response("invalid input", { status: 400 }),
          draft,
        );
      }
      return applyResponseDraft(failed(id, error, isData, options, "threw"), draft);
    }
  };

  // AFTER the method, the origin and the id have been checked, never before: a
  // forged or mistyped call is refused above without a middleware having run
  // for it, so it costs nothing and reaches nothing.
  const context: Record<string, unknown> = {};
  const timing = isDev ? serverTiming() : undefined;
  const event = createRequestEvent(request, { response: draft });
  try {
    const response = await provideRequestEvent(event, () => {
      setRequestMiddlewareContext(context);
      return runRequestMiddleware(
        startOptions().requestMiddleware ?? [],
        { request, pathname: url.pathname, handlerType: "serverFn", context },
        respond,
      );
    });
    if (timing !== undefined) {
      timing.phase("barq-fn", id);
      draft.headers.append("server-timing", timing.header());
    }
    return commitEventResponse(response, event);
  } catch (error) {
    // A request middleware refuses the way a function's own does.
    if (error instanceof Response)
      return commitEventResponse(thrownAnswer(error, isData, draft), event);
    return commitEventResponse(failed(id, error, isData, options, "middleware"), event);
  } finally {
    commitResponseStub(draft, { event });
  }
}

/**
 * The 400 a refused input answers with: the refusal and each issue with the
 * path to the field it is about.
 */
function inputAnswer(error: InputError): ServerFnInputAnswer {
  const issues = (error as { issues?: ReadonlyArray<unknown> }).issues ?? [];
  return {
    error: "invalid input",
    message: error.message,
    issues: issues.map((issue): ServerFnIssue => {
      const { message, path } = (issue ?? {}) as { message?: unknown; path?: unknown };
      const keys = Array.isArray(path)
        ? path.map((segment: unknown) => {
            const key =
              typeof segment === "object" && segment !== null && "key" in segment
                ? segment.key
                : segment;
            return typeof key === "number" ? key : String(key);
          })
        : [];
      return keys.length === 0
        ? { message: String(message) }
        : { message: String(message), path: keys };
    }),
  };
}

/**
 * What a failed call may tell its caller: everything the development server
 * asks for, and in production only an error the application branded with
 * `markSafeError`, by its name and message.
 */
function revealerOf(
  options: HandlerOptions | undefined,
): (error: unknown) => ServerFnThrown | undefined {
  const reveal = options?.revealError;
  return (error) => {
    if (reveal !== undefined) return reveal(error);
    if (!(error instanceof Error) || !isSafeError(error)) return undefined;
    return { name: error.name, message: error.message };
  };
}

/**
 * A call that failed on the server: logged there, reported on the diagnostics
 * channel, and answered 500. The caller learns what was thrown only when the
 * development server asked for it.
 */
function failed(
  id: string,
  error: unknown,
  isData: boolean,
  options: HandlerOptions | undefined,
  where: "threw" | "middleware",
): Response {
  const thrown = revealerOf(options)(error);
  const happened =
    where === "threw"
      ? `The server function ${JSON.stringify(id)} threw`
      : `A request middleware threw before the server function ${JSON.stringify(id)} ran`;
  if (diagnosticsEnabled()) reportFailure(id, error, happened);
  console.error(
    `[barq] ${happened}, so the call answered 500${thrown === undefined ? " without the error's text" : ""}. The error:`,
    error,
  );
  if (thrown === undefined) return new Response("internal server error", { status: 500 });
  return isData
    ? Response.json({ error: "internal server error", thrown }, { status: 500 })
    : new Response(
        `internal server error\n\n${thrown.stack ?? `${thrown.name}: ${thrown.message}`}`,
        {
          status: 500,
        },
      );
}

function reportFailure(id: string, error: unknown, happened: string): void {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  emitDiagnostic(
    {
      code: "SERVER_FUNCTION_FAILED",
      kind: "ssr",
      severity: "error",
      message:
        `${happened}: \`${text}\`. The caller received a 500. Fix the throw at the top of the ` +
        "stack, or throw a `Response`, `redirect()` or `notFound()` to answer the caller on purpose.",
      data: { id, error },
    },
    null,
  );
}

/**
 * A `Response` the chain or the handler threw, as the answer. The data
 * channel's client rejects the call with it, so the header says it was thrown
 * rather than returned; a browser following a form needs no telling.
 */
function thrownAnswer(error: Response, isData: boolean, draft: ResponseDraft): Response {
  if (isData) draft.headers.set(RPC_CONTROL, RPC_THROWN);
  return applyResponseDraft(error, draft);
}

/**
 * Read a thrown value as a control answer, by BRAND rather than by class.
 *
 * The classes are `@barqjs/router`'s and this package cannot import them; see
 * {@link REDIRECT}. A brand check is also what lets the same code recognise a
 * redirect the router threw and one `@barqjs/start/client` rebuilt off the
 * wire, which matters when a server function calls another one.
 */
function controlOf(error: unknown): RpcControl | null {
  if (typeof error !== "object" || error === null) return null;
  const branded = error as Record<symbol, unknown> & {
    to?: unknown;
    status?: unknown;
    options?: unknown;
    data?: unknown;
    routeId?: unknown;
  };
  if (branded[REDIRECT] === true) {
    // The shape is checked rather than trusted: the brand says what this claims
    // to be, and a `to` that is not a string would put `undefined` in a
    // `Location` header.
    if (typeof branded.to !== "string") return null;
    const status = typeof branded.status === "number" ? branded.status : 302;
    const options = describedNavigation(branded.options);
    return {
      kind: "redirect",
      to: branded.to,
      status,
      ...(options === undefined ? {} : { options: encodeWire(options) }),
    };
  }
  if (branded[NOT_FOUND] === true) {
    const message = (error as { message?: unknown }).message;
    return {
      kind: "not-found",
      message: typeof message === "string" ? message : "not found",
      ...(branded.data === undefined ? {} : { data: encodeWire(branded.data) }),
      ...(typeof branded.routeId === "string" ? { routeId: branded.routeId } : {}),
    };
  }
  return null;
}

/** The parts of a navigation that are values, and so can be sent. */
const NAVIGATION = ["to", "from", "params", "search", "hash", "replace", "reloadDocument", "href"];

/**
 * The navigation an options-form redirect described, as far as it can cross.
 *
 * A function among them cannot: `search: (current) => ...` is asked about a
 * location only the browser has. A redirect holding one is sent as its resolved
 * target alone, which is what every redirect was sent as before this existed.
 * `statusCode` and `headers` are the answer rather than the navigation, and
 * travel as the status and on the response.
 */
function describedNavigation(described: unknown): Record<string, unknown> | undefined {
  if (typeof described !== "object" || described === null) return undefined;
  const given = described as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const name of NAVIGATION) {
    const value = given[name];
    if (value === undefined) continue;
    if (typeof value === "function") return undefined;
    out[name] = value;
  }
  if (typeof given.statusCode === "number") out.statusCode = given.statusCode;
  return out;
}

/**
 * A control answer, on whichever channel asked.
 *
 * THE TWO CHANNELS DIVERGE HERE ON PURPOSE, because their clients are different
 * programs. The form channel's client is a BROWSER following the response
 * itself, so a redirect has to be a real 3xx with a `Location`. The data
 * channel's client is `clientRpc`, and a real 3xx there would be FOLLOWED by
 * `fetch` — the caller would receive the target page's HTML instead of a
 * navigation. So the data channel answers 200 and describes the redirect in the
 * body, and the client re-throws it for the router to act on. That is a soft
 * navigation rather than a document load, which is both correct and faster;
 * TanStack returns the raw 3xx and the fetch follows it.
 *
 * `not-found` is a 404 on both, because 404 is the honest status and no client
 * follows one.
 *
 * `extra` is the thrown value's own `headers`, which are the response's on
 * either channel: a redirect that signs a visitor out carries the cookie that
 * does it.
 */
function controlResponse(control: RpcControl, isData: boolean, extra?: unknown): Response {
  const headers = answerHeaders(extra);
  if (control.kind === "not-found") {
    if (!isData) return new Response(control.message, { status: 404, headers });
    headers.set(RPC_CONTROL, control.kind);
    return Response.json(control, { status: 404, headers });
  }
  if (!isNavigable(control.to)) {
    reportRefusedRedirect(control.to);
    return new Response("bad redirect", { status: 500 });
  }
  if (isData) {
    headers.set(RPC_CONTROL, control.kind);
    return Response.json(control, { status: 200, headers });
  }
  // 303 unless the handler asked for something else, so the browser re-issues
  // as GET and a reload does not repost — the same reason `seeOther` below is
  // 303. A handler that set an explicit status gets the one it set.
  const status = control.status === 302 ? 303 : control.status;
  headers.set("location", control.to);
  return new Response(null, { status, headers });
}

/** A thrown answer's `headers`, or none when it carried nothing a response can take. */
function answerHeaders(extra: unknown): Headers {
  if (extra === undefined || extra === null) return new Headers();
  try {
    return new Headers(extra as HeadersInit);
  } catch {
    return new Headers();
  }
}

function reportRefusedRedirect(to: string): void {
  console.error(
    `[barq] A server function threw \`redirect(${JSON.stringify(to)})\`, which is not a path or an \`http(s)\` URL, so the redirect was refused and the call answered 500. ` +
      "Validate the value passed to `redirect()` before using it, especially when it comes from the request.",
  );
}

function isIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<AsyncIterable<unknown>>)[Symbol.asyncIterator] === "function"
  );
}

/**
 * An answer that arrives over time: one JSON line for each value yielded.
 *
 * Produced from `start`, so the function keeps running inside the request it
 * was called for: a `pull` is made from wherever the body is read, where there
 * is no request. It waits to be asked all the same, so a reader that falls
 * behind holds the function at its next `yield` rather than filling memory.
 *
 * A failure after the first value cannot become a status, so it is one last
 * line that says so and nothing else: a handler's message can name a table, a
 * column or a path.
 */
function streamed(
  values: AsyncIterable<unknown>,
  sendContext: Record<string, unknown>,
  id: string,
  reveal: (error: unknown) => ServerFnThrown | undefined,
): Response {
  const encoder = new TextEncoder();
  const line = (payload: RpcStreamLine): Uint8Array =>
    encoder.encode(`${JSON.stringify(payload)}\n`);
  const source = values[Symbol.asyncIterator]();
  let wanted: (() => void) | null = null;
  let cancelled = false;

  const produce = async (
    controller: ReadableStreamDefaultController<Uint8Array>,
  ): Promise<void> => {
    try {
      if (Object.keys(sendContext).length > 0) {
        controller.enqueue(line({ c: encodeWire(sendContext) }));
      }
      for (;;) {
        if ((controller.desiredSize ?? 1) <= 0) {
          await new Promise<void>((resolve) => {
            wanted = resolve;
          });
        }
        if (cancelled) return;
        const next = await source.next();
        if (cancelled || next.done === true) break;
        controller.enqueue(line({ v: encodeWire(next.value) }));
      }
      if (!cancelled) controller.close();
    } catch (error) {
      if (cancelled) return;
      const thrown = reveal(error);
      const happened = `The server function ${JSON.stringify(id)} threw while streaming its result`;
      if (diagnosticsEnabled()) reportFailure(id, error, happened);
      console.error(
        `[barq] ${happened}, so the stream ended early and the caller receives a \`ServerFnError\`. The error:`,
        error,
      );
      controller.enqueue(line(thrown === undefined ? { e: 1 } : { e: 1, t: thrown }));
      controller.close();
    }
  };

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      void produce(controller);
    },
    pull() {
      const waiting = wanted;
      wanted = null;
      waiting?.();
    },
    cancel() {
      cancelled = true;
      const waiting = wanted;
      wanted = null;
      waiting?.();
      void source.return?.();
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      [RPC_CONTROL]: RPC_STREAM,
    },
  });
}

const DEFAULT_BODY_LIMIT = 1024 * 1024;

/**
 * The request's body behind a cap, as something that can still be parsed.
 *
 * The declared length is only the early exit. A chunked request declares none
 * and a header can understate, so the stream is counted as it is read and
 * errors the moment it passes the limit, with the rest left unread.
 *
 * A `Response` carrying the content type, because that is what parses a
 * multipart body: the boundary is in the header, and srvx's own
 * `limitRequestBody` drops it and so cannot read a form.
 */
function capped(request: Request, limit: number): Response {
  if (Number(request.headers.get("content-length")) > limit) throw createBodyTooLargeError(limit);
  const type = request.headers.get("content-type");
  return new Response(
    request.body === null ? null : limitBodyStream(request.body, limit),
    type === null ? undefined : { headers: { "content-type": type } },
  );
}

/**
 * A GET call's payload: the body a POST would have sent, in `?payload=`.
 *
 * Held to the body limit, since a URL is a body a caller chose the size of,
 * and refused as a 413 the way an oversized body is.
 */
function queryPayload(url: URL, limit: number): unknown {
  const payload = url.searchParams.get(PAYLOAD_PARAM);
  if (payload === null) return {};
  if (payload.length > limit) throw createBodyTooLargeError(limit);
  return JSON.parse(payload);
}

/**
 * What a body that could not be read is answered with.
 *
 * By the error's code and not by who threw it: a server in front that enforces
 * `maxRequestBodySize` fails the read with the same error, and that caller is
 * owed the same 413.
 */
function unreadable(error: unknown): Response {
  return (error as { code?: unknown } | null)?.code === "ERR_BODY_TOO_LARGE"
    ? new Response("payload too large", { status: 413 })
    : new Response("bad request", { status: 400 });
}

/**
 * Whether the body is a form rather than a value. The enhanced path posts
 * `FormData` to the data channel so that a handler sees the SAME input type
 * whether or not JS ran.
 */
function isFormBody(request: Request): boolean {
  const type = request.headers.get("content-type") ?? "";
  return type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded");
}

/**
 * Back where the form was. 303 and not 302, so the browser re-issues as GET and
 * a reload does not repost — the POST/redirect/GET the no-JS path exists for.
 *
 * `Referer` is used only as a destination and never as a decision. SvelteKit's
 * docs make the distinction for the same reason: values derived from the
 * request are fine to navigate to and never fine to authorize with.
 */
function seeOther(request: Request): Response {
  const referer = request.headers.get("referer");
  const origin = new URL(request.url).origin;
  let location = "/";
  if (referer !== null) {
    try {
      const target = new URL(referer);
      // An off-site Referer would make this an open redirect.
      if (target.origin === origin) {
        const path = target.pathname + target.search;
        // A path that opens `//` is another HOST to a browser handed it alone,
        // and `/\` parses to the same thing. Written with its origin it can only
        // be what it was: a path on this one.
        location = path.startsWith("//") ? origin + path : path;
      }
    } catch {
      // A malformed Referer is not a destination.
    }
  }
  return new Response(null, { status: 303, headers: { location } });
}
