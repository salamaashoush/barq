/**
 * Server-side rendering.
 *
 * Renders through the same component stack as the client against an
 * ambient DOM implementation (`document` must exist - e.g. happy-dom's
 * GlobalRegistrator on a Bun/Node server). Text goes through real text
 * nodes, so HTML injection is escaped by construction.
 *
 * Async flow: components read keyed async values (computed with
 * `key`); renderToStringAsync settles the graph, Loading boundaries swap
 * to content, and the resolved values are captured for the client via
 * generateHydrationScript - hydrate() then resolves them synchronously
 * without refetching.
 */

import {
  type Block,
  type JSXElement,
  HYDRATE,
  type Scope,
  NotReadyError,
  flush,
  isSsrHtml,
  render,
  scope,
  settle,
} from "@barqjs/core";
import {
  abandonPendingSeeds,
  clearHydrationData,
  getHydrationData,
  pendingSeedsOf,
  setAsyncSession,
  settleStep,
} from "@barqjs/core/internal";
import { type StreamSink, esc, escapeAttribute, resumeDeferred, setStreamSink } from "./ssr.ts";
import { createSeedEncoder, encodeSeed } from "./codec.ts";

/**
 * Render synchronously to an HTML string. Pending async values render
 * their Loading fallbacks; use renderToStringAsync to wait for them.
 */
export function renderToString(fn: () => JSXElement): string {
  let container: HTMLElement | null = null;
  let markup: string | null = null;
  let dispose!: () => void;

  scope((d) => {
    dispose = d;
    const value = fn();
    // A module compiled by the SSR string backend already IS the markup, and
    // renders with no DOM at all. Anything else — a hand-written `createElement`
    // tree, a component from a module this compiler never saw — goes through the
    // ambient DOM as before. Since M6 nothing the compiler emits takes that
    // path: `uninlinable_flow` and the whole-module downgrade behind it are
    // deleted, and every construct has a string lowering.
    if (isSsrHtml(value)) {
      markup = value.t;
      return;
    }
    if (typeof document === "undefined") {
      throw new Error(
        "renderToString needs a DOM implementation (e.g. happy-dom's GlobalRegistrator) registered before rendering.",
      );
    }
    container = document.createElement("div");
    render(value, container);
  }, true);
  flush();

  const html = markup ?? (container as HTMLElement | null)?.innerHTML ?? "";
  dispose();
  return html;
}

/**
 * Render to an HTML string after all async work settles: Loading
 * boundaries resolve to content and keyed async values are recorded for
 * generateHydrationScript.
 */
export async function renderToStringAsync(fn: () => JSXElement): Promise<string> {
  const { html } = await renderPage(fn);
  return html;
}

/** Data captured by the most recent renderPage/renderToStringAsync */
let lastRenderData: Record<string, unknown> = {};

/**
 * Render a page after async work settles, returning the HTML, the
 * resolved keyed async data, and the inline hydration script. Safe for
 * concurrent renders: each render only waits for and serializes its own
 * session's fetches.
 */
export async function renderPage(
  fn: () => JSXElement,
  options?: { nonce?: string },
): Promise<{ html: string; data: Record<string, unknown>; script: string }> {
  const session = Symbol("render-session");
  let dispose!: () => void;
  let container: HTMLElement | null = null;
  let stringMode = false;
  let markup = "";

  // The SAME park-and-resume machinery the streamed arm uses. This is the whole
  // of the unification: a boundary that cannot settle inside the shell parks its
  // content Block here exactly as it does for a stream, and the loop below
  // resumes it and patches the settled markup into the bytes.
  //
  // What this REPLACED was a second full render of the page, which is a
  // mechanism neither reference has — Solid's `renderToStringAsync` IS
  // `renderToStream` awaited (`dom-expressions/src/server.js:63-73`), and
  // TanStack renders one stream and awaits it for a bot
  // (`solid-router/src/ssr/renderRouterToStream.tsx:124-129`). It cost two real
  // defects: the second pass built under a fresh root so every auto-key missed
  // and crawlers and the prerenderer were served SKELETONS, and one extra pass
  // settles exactly one level of nesting, so a boundary inside a boundary
  // shipped a skeleton whatever happened.
  const parked: Continuation[] = [];
  let nextId = 0;
  const sink: StreamSink = {
    defer(body: Block<unknown>, scope: Scope | null, flags = 0): number {
      const id = nextId++;
      parked.push({ id, body, scope, at: Date.now(), hydrate: (flags & HYDRATE) !== 0 });
      return id;
    },
  };

  const prev = setAsyncSession(session);
  const prevSink = setStreamSink(sink);
  try {
    scope((d) => {
      dispose = d;
      const value = fn();
      if (isSsrHtml(value)) {
        stringMode = true;
        markup = value.t;
        return;
      }
      if (typeof document === "undefined") {
        throw new Error(
          "renderToStringAsync needs a DOM implementation (e.g. happy-dom's GlobalRegistrator) registered before rendering.",
        );
      }
      container = document.createElement("div");
      render(value, container);
    }, true);
    flush();
  } finally {
    setStreamSink(prevSink);
    setAsyncSession(prev);
  }

  // Session-scoped: concurrent renders don't wait on each other's fetches
  await settle(session);

  if (stringMode) markup = await drainParked(markup, parked, sink, session);

  const html = stringMode ? markup : ((container as HTMLElement | null)?.innerHTML ?? "");
  const data = await settleNested(getHydrationData(session));
  // Anything still in flight is given up on, exactly as the streamed arm does.
  // A buffered page settles everything it can before this line, so in practice
  // this releases only what a boundary deadline abandoned — and it is what keeps
  // the registry from outliving the render.
  abandonPendingSeeds(session);
  clearHydrationData(session);
  lastRenderData = data;
  dispose();

  return { html, data, script: hydrationScriptFor(data, options?.nonce) };
}

/**
 * Resume every parked boundary and patch each settled one into the bytes.
 *
 * The buffered arm of the same park-and-resume the stream uses, which is what
 * lets one render serve both. A boundary resumed here may park boundaries of ITS
 * OWN — that is what nesting is — so the queue is drained rather than iterated
 * once, and the depth of nesting a page can resolve is not bounded by a pass
 * count. The two-pass render this replaced could resolve exactly one level.
 */
async function drainParked(
  markup: string,
  parked: Continuation[],
  sink: StreamSink,
  session: symbol,
): Promise<string> {
  let out = markup;
  while (parked.length > 0) {
    const round = parked.splice(0, parked.length);
    const again: Continuation[] = [];
    for (const record of round) {
      const restore = setAsyncSession(session);
      const outerSink = setStreamSink(sink);
      let settled: string | null;
      try {
        settled = resumeDeferred(record.body, record.scope);
      } catch (error) {
        if (!(error instanceof NotReadyError)) throw error;
        settled = null;
      } finally {
        setStreamSink(outerSink);
        setAsyncSession(restore);
      }
      if (settled === null) {
        // Past its own deadline it is abandoned to the fallback the shell
        // already carries, which is the rule the streamed arm applies too.
        if (Date.now() - record.at < BOUNDARY_TIMEOUT) again.push(record);
        continue;
      }
      out = patchDeferredRange(out, record.id, settled, record.hydrate);
    }
    if (again.length > 0) parked.unshift(...again);
    if (parked.length === 0) break;
    if (!(await settleStep(session))) break;
  }
  return out;
}

/**
 * Resolve promises NESTED inside settled values, before they reach the encoder.
 *
 * `settle` resolves what the reactive graph knows about. A promise sitting in a
 * property of an already-resolved value was never registered with it — a loader
 * that returns `{ rows, total: countRows() }` is exactly that shape — and the
 * seed encoder cannot represent one: `serialize` throws
 * `SerovalUnsupportedNodeError` on a promise constructor, so the whole request
 * died with a seroval stack and no mention of the route that caused it.
 *
 * A non-streamed render is "the whole thing at once" by definition — there is no
 * later chunk to resolve into — so awaiting is the only answer available here,
 * and it is the right one. `renderToStream` does NOT do this: deferring is what
 * a stream is for.
 *
 * Bounded, because a cyclic structure must not become an infinite walk. Plain
 * objects and arrays only: anything else is handed to the encoder as it stands,
 * which is what keeps a `Map`, a `Date` or a class instance behaving as it did.
 */
async function settleNested<T>(value: T, seen: WeakSet<object> = new WeakSet()): Promise<T> {
  if (value === null || typeof value !== "object") return value;
  if (typeof (value as { then?: unknown }).then === "function") {
    // Cast at the await, not around it: `T` is not known to be thenable, and the
    // runtime check above is the only thing that establishes it.
    return settleNested((await (value as unknown as PromiseLike<unknown>)) as T, seen);
  }
  // A cycle is left EXACTLY as it stands. Rebuilding one truncates it, and the
  // encoder carries cycles on purpose — a first version of this walk copied
  // every object and turned a cyclic seed into an eight-deep tree, which the
  // codec's own test caught.
  if (seen.has(value)) return value;

  if (Array.isArray(value)) {
    seen.add(value as object);
    let moved = false;
    const out = await Promise.all(
      value.map(async (item: unknown) => {
        const next = await settleNested(item, seen);
        if (next !== item) moved = true;
        return next;
      }),
    );
    return moved ? (out as T) : value;
  }

  // Plain objects only: a `Map`, a `Date` or a class instance is handed over as
  // it stands, so nothing this walk touches changes how the encoder sees it.
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  seen.add(value);
  let moved = false;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const next = await settleNested(item, seen);
    if (next !== item) moved = true;
    out[key] = next;
  }
  // The ORIGINAL when nothing moved, so identity and cycles survive the common
  // case untouched: only a subtree that actually held a promise is rebuilt.
  return moved ? (out as T) : value;
}

// ── streaming (CODESIGN.md §3.11) ────────────────────────────────────────
//
// "Streaming falls out of Blocks: an unready boundary flushes
// `<!--[b:7-->fallback<!--]-->` plus a continuation record `(Block, Scope)`;
// when its promises settle the server flushes a `<template>` and a swap. The
// Block is re-invocable with its scope, so there is no second code path."
//
// That is the whole implementation. The shell is one ordinary string render
// with a SINK installed; every unready `Loading` parks its content Block and
// its scope instead of settling for the fallback, and the loop below resumes
// them in the order they settle.

interface Continuation {
  id: number;
  body: Block<unknown>;
  scope: Scope | null;
  /** When it parked, so its own deadline is measured from there. */
  at: number;
  /** Whether this boundary's page hydrates — see `StreamSink.defer`. */
  hydrate: boolean;
}

export interface StreamOptions {
  /** Stops the render. The stream closes and parked boundaries keep their fallbacks. */
  signal?: AbortSignal;
  /** CSP nonce, applied to every inline script this render emits. */
  nonce?: string;
  /**
   * How long one boundary may stay parked before it is abandoned to its
   * fallback, in ms. Remix ships 5000 and React Router 4950 for the same knob.
   */
  timeout?: number;
  /**
   * Every error this render raises after the shell. Defaults to `console.error`,
   * which is React's default too (`ReactFizzServer.js`'s `defaultErrorHandler`).
   *
   * A SHELL failure never reaches here: the shell is rendered before the stream
   * is constructed, so it throws out of `renderToStream` itself and the caller
   * still has an open status to answer with.
   */
  onError?: (error: unknown) => void;
  /** The shell is on the wire. Nothing after this can change the status. */
  onShellReady?: () => void;
  /** Every boundary has settled or been abandoned, and the stream is closing. */
  onAllReady?: () => void;
}

/** React's `defaultErrorHandler`: a server that says nothing is worse than a log. */
function defaultStreamError(error: unknown): void {
  console.error(error);
}

const BOUNDARY_TIMEOUT = 5_000;

/**
 * How long the whole stream outlives a boundary deadline. Separate on purpose:
 * a boundary rejected at its deadline still has to reach the wire, and a
 * resumed boundary may park boundaries of its own, so the stream needs its own
 * backstop rather than inheriting the per-boundary one.
 */
const STREAM_GRACE = 1_000;

/**
 * The SERVER half of the same swap, on a string that has not been flushed yet.
 *
 * This is what makes one renderer serve both arms, which is how Solid and
 * TanStack do it and what barq did not: Solid's stream replaces a placeholder in
 * place while `!firstFlushed` (`dom-expressions/src/server.js`'s `replacePlaceholder`)
 * and only emits `<template>` + `$df` once bytes are gone; TanStack renders one
 * stream and, for a bot, simply awaits it
 * (`solid-router/src/ssr/renderRouterToStream.tsx:124-129`).
 *
 * barq used to answer the buffered case by RENDERING THE PAGE A SECOND TIME and
 * hoping every value was cached under the same key. It cost two real defects:
 * the second pass built under a fresh root so every auto-key missed and the page
 * shipped skeletons to crawlers and to the prerenderer, and one extra pass
 * settles exactly ONE level of nesting, so a boundary inside a boundary shipped a
 * skeleton no matter what.
 *
 * The scan is `swapDeferredRange`'s, on bytes instead of nodes: find this
 * boundary's open comment, count depth so a nested range's `<!--]-->` is not
 * mistaken for this one's, and leave a PLAIN `<!--[-->` behind so the result is
 * indistinguishable from a boundary that settled inside the shell.
 */
export function patchDeferredRange(
  html: string,
  id: number,
  markup: string,
  hydrate = true,
): string {
  const open = `<!--[b:${id}-->`;
  const start = html.indexOf(open);
  if (start === -1) return html;
  let depth = 0;
  const comments = /<!--([\s\S]*?)-->/g;
  comments.lastIndex = start + open.length;
  for (let m = comments.exec(html); m !== null; m = comments.exec(html)) {
    const data = m[1] ?? "";
    if (data.charAt(0) === "[") {
      depth++;
      continue;
    }
    if (data !== "]") continue;
    if (depth === 0) {
      // A hydratable page keeps the range — the client claims it, and after this
      // the boundary is indistinguishable from one that settled inside the
      // shell. A page that does not hydrate keeps neither comment: the markers
      // existed only so this patch could find the range.
      const close = m.index + (m[0] ?? "").length;
      return hydrate
        ? html.slice(0, start) + "<!--[-->" + markup + html.slice(m.index)
        : html.slice(0, start) + markup + html.slice(close);
    }
    depth--;
  }
  return html;
}

/**
 * The client half of a swap: replace the range between `<!--[b:n-->` and its
 * matching `<!--]-->` with the template that just arrived.
 *
 * It reads the boundary comments the string backend wrote, which is the whole
 * reason §11 Q4 paid the bytes for them. Nested ranges are why the scan counts
 * depth rather than stopping at the first close: a fallback may itself contain a
 * range, and its `<!--]-->` is not this boundary's.
 *
 * Three constraints, and each of them is a property of the SOURCE rather than of
 * the behaviour, because this function is shipped by `toString()`:
 *
 * - it closes over NOTHING. Every name it uses is a global or a local, so the
 *   text below runs on a page that has none of this module.
 * - it contains no `<`. Script data is raw text — the tokenizer decodes nothing
 *   inside it, so there is no entity to escape a `<` with, and a `<` there is
 *   the first byte of the sequence that can leave the element early. Hence the
 *   countdown loop rather than `i < dead.length`.
 * - it is the FUNCTION the tests drive. A snippet written as a string literal
 *   beside a test that paraphrases it is two implementations, and the one that
 *   ships is the one nothing runs.
 */
export function swapDeferredRange(n: number): void {
  const t = document.querySelector<HTMLTemplateElement>(`template[data-barq="${n}"]`);
  if (!t) return;
  const w = document.createTreeWalker(document.body, 128);
  let c: Node | null;
  let open: Comment | null = null;
  while ((c = w.nextNode())) {
    if ((c as Comment).data === `[b:${n}`) {
      open = c as Comment;
      break;
    }
  }
  if (open === null) return;
  let depth = 0;
  let node: Node | null = open.nextSibling;
  const dead: Node[] = [];
  while (node) {
    if (node.nodeType === 8) {
      const data = (node as Comment).data;
      if (data.charAt(0) === "[") depth++;
      else if (data === "]") {
        if (depth === 0) break;
        depth--;
      }
    }
    dead.push(node);
    node = node.nextSibling;
  }
  for (let i = dead.length; i--;) dead[i].parentNode?.removeChild(dead[i]);
  open.parentNode?.insertBefore(t.content, node);
  // Back to the PLAIN open comment, not `[0`. Once the content is in, this
  // range is indistinguishable from one the shell settled, and it has to read
  // that way to both readers: `loadingBoundary` claims a settled range and
  // parks a `b:` one, and `reconcileKey` compares whatever key is here against
  // the client's own — `[0` announced a branch key of "0" that no client would
  // ever match.
  open.data = "[";
  t.parentNode?.removeChild(t);
}

/** The same function, as the bytes a page gets. Inlined once per stream. */
const SWAP_SNIPPET = `window.__BARQ_SWAP__=${swapDeferredRange.toString()};`;

/**
 * Render to a stream: the shell first, then one `<template>` per boundary as
 * its promises settle.
 *
 * The parts are not "chunks of a string that was already built" — the shell is
 * flushed before any deferred boundary has resolved, which is the only thing
 * that makes streaming worth doing.
 */
export function renderToStream(
  fn: () => JSXElement,
  options?: StreamOptions,
): ReadableStream<Uint8Array> {
  const session = Symbol("stream-session");
  const encoder = new TextEncoder();
  const parked: Continuation[] = [];
  let next = 0;
  const sink: StreamSink = {
    defer(body: Block<unknown>, scope: Scope | null, flags = 0): number {
      const id = next++;
      parked.push({ id, body, scope, at: Date.now(), hydrate: (flags & HYDRATE) !== 0 });
      return id;
    },
  };

  // One resolve, called from every path that stops the render: the consumer
  // cancelling, the caller's signal, or the deadline. The loop races it against
  // `settleStep`, which is the only reason a boundary whose promise never
  // settles cannot hold the render open for good.
  let stop!: () => void;
  const stopped = new Promise<"stopped">((resolve) => {
    stop = () => resolve("stopped");
  });
  let ended = false;
  // Distinct from `ended`: the consumer tearing the stream down has already
  // closed it, so `controller.close()` would throw. Our own deadline and the
  // caller's signal both still want the response terminated.
  let consumerCancelled = false;
  const end = (): void => {
    ended = true;
    stop();
  };

  const deadline = options?.timeout ?? BOUNDARY_TIMEOUT;
  const timer = setTimeout(end, deadline + STREAM_GRACE);
  // A pending timer must not be what keeps a server process alive.
  (timer as { unref?: () => void }).unref?.();

  // Keys already on the wire. A streamed render resolves values AFTER the shell
  // is gone, so the seed cannot be one script at the end the way `renderPage`'s
  // is — it is flushed incrementally, and each flush carries only what the
  // previous ones did not.
  const sent = new Set<string>();
  // Keys that went out as PROMISES. They are settled over at the end of the
  // stream — see `settleSeedScript`.
  const promised = new Set<string>();
  // One encoder for the whole render, so a value reachable from two keys seeded
  // in different rounds is ONE object on the client.
  const seeds = createSeedEncoder();
  let seededHeader = false;
  // Deferred values still being serialized. The stream stays open until this
  // reaches zero: closing on top of one drops it, and the client would wait for
  // a value that never comes rather than fetching it.
  let outstanding = 0;
  let drained: (() => void) | null = null;
  const later: string[] = [];

  const seedScript = (): string => {
    const fresh: Record<string, unknown> = {};
    let any = false;
    for (const [key, value] of Object.entries(getHydrationData(session))) {
      if (sent.has(key)) continue;
      sent.add(key);
      fresh[key] = value;
      any = true;
    }
    // …and the keys still IN FLIGHT, as the promises themselves. This is Solid's
    // `registerFragment`: `serializer.write(key, p)` the moment a boundary parks,
    // so the client's store holds something to AWAIT rather than a hole
    // (`dom-expressions/src/server.js`, and `Suspense.ts:144-167` consumes it).
    //
    // Sent ONCE, like any other key: the promise is the value, and
    // `crossSerializeStream` emits its resolution as a later statement, so a
    // second seed for the settled value would be a second copy of it.
    for (const [key, promise] of Object.entries(pendingSeedsOf(session))) {
      if (sent.has(key)) continue;
      sent.add(key);
      promised.add(key);
      fresh[key] = promise;
      any = true;
    }
    if (!any) return "";
    const header = seededHeader ? "" : `${seeds.header};`;
    seededHeader = true;
    const keys = Object.keys(fresh);
    // A loader may return a value with a promise still inside it — deferred
    // data. `crossSerialize` refuses one outright, so a payload that carries one
    // goes through the streaming encoder and its resolutions are enqueued as
    // they land. THIS is what a stream is for; `renderPage` awaits them instead,
    // because it has no later chunk to put them in.
    const payload = seeds.hasPending(fresh)
      ? ((): string => {
          outstanding++;
          return seeds.encodeDeferred(
            fresh,
            (statement) => later.push(statement),
            () => {
              outstanding--;
              if (outstanding === 0 && drained !== null) drained();
            },
          );
        })()
      : seeds.encode(fresh);
    void keys;
    return (
      `<script${nonceAttr(options?.nonce)}>` +
      `${header}window.__BARQ_DATA__=Object.assign(window.__BARQ_DATA__||{},${payload});` +
      "</script>"
    );
  };

  /**
   * Replace every promise still standing in the store with the value it settled
   * on, once nothing more is coming.
   *
   * A key seeded eagerly is a promise on the wire, which is the point: a read
   * that runs while the stream is open awaits it instead of refetching. But a
   * client that hydrates AFTER the stream has ended — which is every client
   * today, because the entry is a deferred module — would find a promise where
   * a plain value used to be, and `.then` is asynchronous however settled the
   * promise is. Its boundary would render the FALLBACK and hydration would
   * mismatch against markup that already holds the content. Measured on the
   * streaming oracle as `recovered: true` on all three fixtures.
   *
   * Solid draws the same line from the other side: `Suspense.ts:147` awaits
   * `sharedConfig.load(key)` only when it is NOT already resolved.
   *
   * Encoded through the same `refs` map, so the value is a reference to what the
   * resolution statement already built rather than a second copy of it.
   */
  const settleSeedScript = (): string => {
    if (promised.size === 0) return "";
    const settledValues: Record<string, unknown> = {};
    let any = false;
    for (const [key, value] of Object.entries(getHydrationData(session))) {
      if (!promised.has(key)) continue;
      settledValues[key] = value;
      any = true;
    }
    if (!any) return "";
    return (
      `<script${nonceAttr(options?.nonce)}>` +
      `window.__BARQ_DATA__=Object.assign(window.__BARQ_DATA__||{},${seeds.encode(settledValues)});` +
      "</script>"
    );
  };

  const signal = options?.signal;
  if (signal?.aborted) end();
  signal?.addEventListener("abort", end, { once: true });
  const release = (): void => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", end);
  };

  let dispose!: () => void;
  let shell = "";

  const previousSession = setAsyncSession(session);
  const previousSink = setStreamSink(sink);
  try {
    scope((d) => {
      dispose = d;
      const value = fn();
      shell = isSsrHtml(value) ? value.t : esc(value);
    }, true);
    flush();
  } finally {
    setStreamSink(previousSink);
    setAsyncSession(previousSession);
  }

  return new ReadableStream<Uint8Array>({
    // A consumer that goes away stops the work. Without this the render runs to
    // completion against a socket nobody is reading — which on AWS Lambda is
    // billed for the full function duration, because a streamed response is not
    // interrupted when the invoking client connection breaks.
    cancel(): void {
      consumerCancelled = true;
      end();
    },
    async start(controller): Promise<void> {
      const flushLater = (target: ReadableStreamDefaultController<Uint8Array>): void => {
        if (later.length === 0 || consumerCancelled) return;
        const statements = later.splice(0, later.length).join(";");
        target.enqueue(
          encoder.encode(
            // The resolutions themselves. A statement here settles a promise the
            // initial payload already put in `__BARQ_DATA__`, so the read that is
            // awaiting it wakes with no channel in between.
            `<script${nonceAttr(options?.nonce)}>${statements}</script>`,
          ),
        );
      };
      try {
        controller.enqueue(encoder.encode(shell));
        // The status is settled from here: these bytes are gone and nothing
        // after them can change the response line. React draws the same line
        // with `onShellReady`.
        options?.onShellReady?.();
        // Pre-hydration input capture, on the STREAMED path too.
        //
        // `hydrationScriptFor` installs it for `renderPage`, and nothing
        // installed it here — so the DEFAULT page (`createPageHandler` streams
        // unless told otherwise) dropped every click and keystroke made before
        // hydration, and `SEMANTICS.md` H6's whole claim-based replay was
        // unreachable on the path most pages take. Counted in the emitted bytes:
        // 1 occurrence on a non-streamed page, 0 on a streamed one.
        //
        // Right after the shell, which is the earliest a stream can manage —
        // the shell is one synchronous render and there is no byte before it to
        // hang a listener from.
        controller.enqueue(
          encoder.encode(`<script${nonceAttr(options?.nonce)}>${EVENT_CAPTURE_SNIPPET}</script>`),
        );
        // Whatever the shell already resolved. Without this a streamed page
        // seeded nothing at all and the client refetched every value the server
        // had just awaited.
        const shellSeed = seedScript();
        if (shellSeed !== "") controller.enqueue(encoder.encode(shellSeed));
        if (parked.length > 0) {
          controller.enqueue(
            encoder.encode(`<script${nonceAttr(options?.nonce)}>${SWAP_SNIPPET}</script>`),
          );
        }
        // One round per settled promise, not one round per session. `settle`
        // here would hold every boundary until the slowest one in the session
        // resolved, which is not streaming — it is the shell followed by
        // everything at once. A resumed boundary may park boundaries of its
        // own, so the queue is drained rather than iterated once.
        // `ended` is set by `end()` — the deadline timer and the caller's
        // `AbortSignal` — and this loop awaits, so it flips BETWEEN rounds and
        // never inside one. The rule cannot see that; the alternative it is
        // warning about is exactly the unbounded loop this condition bounds.
        // oxlint-disable-next-line no-unmodified-loop-condition
        while (parked.length > 0 && !ended) {
          const round = parked.splice(0, parked.length);
          const again: Continuation[] = [];
          for (const record of round) {
            if (ended) {
              again.push(record);
              continue;
            }
            const restore = setAsyncSession(session);
            const outerSink = setStreamSink(sink);
            let markup: string | null;
            try {
              markup = resumeDeferred(record.body, record.scope);
            } catch (error) {
              if (!(error instanceof NotReadyError)) throw error;
              // Still unready, so it goes back on the queue. Dropping it here
              // is what left a boundary showing its fallback for good once the
              // batch barrier stopped guaranteeing readiness.
              markup = null;
            } finally {
              setStreamSink(outerSink);
              setAsyncSession(restore);
            }
            if (markup === null) {
              // Past its own deadline it is abandoned rather than requeued, and
              // the fallback the shell already flushed stands.
              if (Date.now() - record.at < deadline) again.push(record);
              continue;
            }
            controller.enqueue(
              encoder.encode(
                `<template data-barq="${record.id}">${markup}</template>` +
                  `<script${nonceAttr(options?.nonce)}>window.__BARQ_SWAP__(${record.id})</script>`,
              ),
            );
          }
          const roundSeed = seedScript();
          if (roundSeed !== "") controller.enqueue(encoder.encode(roundSeed));
          // Anything a deferred value resolved into since the last round.
          flushLater(controller);
          // Boundaries parked BY this round are already in `parked`; the ones
          // that merely stayed unready go in front of them.
          if (again.length > 0) parked.unshift(...again);
          if (parked.length === 0) break;
          // Nothing left in flight and something still parked: those boundaries
          // keep the fallback the shell flushed. Recovery is the point.
          //
          // The race is what bounds this loop. `settleStep` alone waits on a
          // promise that a caller is free never to settle, and a resumed
          // boundary may park boundaries of its own, so neither the queue nor
          // any single await is bounded without it.
          if ((await Promise.race([settleStep(session), stopped])) !== true) break;
        }
        // Deferred values, if any are still in flight. Closing on top of one
        // drops it, and a client waiting on that key would wait for a value
        // that never comes instead of fetching it — so the stream is held open,
        // bounded by the same `stopped` promise everything else here is.
        if (outstanding > 0) {
          await Promise.race([
            new Promise<void>((resolve) => {
              drained = resolve;
            }),
            stopped,
          ]);
        }
        // Nothing more is coming. Every key still in flight is REJECTED rather
        // than left pending, so the client read waiting on it falls back to
        // fetching instead of waiting for a value that will never arrive — the
        // job `__BARQ_SEED__.done()` used to do, per key rather than as one
        // global flag, so only the reads whose keys were abandoned fall back.
        abandonPendingSeeds(session);
        if (outstanding > 0) {
          await Promise.race([
            new Promise<void>((resolve) => {
              drained = resolve;
            }),
            stopped,
          ]);
        }
        flushLater(controller);
        if (!consumerCancelled) {
          const settledOver = settleSeedScript();
          if (settledOver !== "") controller.enqueue(encoder.encode(settledOver));
        }
        options?.onAllReady?.();
        if (!consumerCancelled) controller.close();
      } catch (error) {
        // NEVER `controller.error` here, and that is the whole policy. Anything
        // thrown in this function is POST-SHELL by construction — the shell is
        // rendered before the stream exists, so a shell failure propagates out
        // of `renderToStream` and the caller can still answer with a 500.
        //
        // Tearing the body now hands the client a truncated document with no
        // error UI and no way to recover, when the bytes it already has are a
        // VALID page showing fallbacks. React errors the boundary rather than
        // the response for exactly this reason. The boundary that failed keeps
        // the fallback the shell flushed; the client re-runs it on hydration and
        // its own error boundary reports it.
        //
        // Measured before this existed: a `computed` that rejected after the
        // shell produced `STREAM REJECTED: Error: late boom` and no page at all.
        (options?.onError ?? defaultStreamError)(error);
        if (!consumerCancelled) {
          try {
            controller.close();
          } catch {
            // Already closed or errored by the consumer; nothing to answer to.
          }
        }
      } finally {
        release();
        clearHydrationData(session);
        dispose();
      }
    },
  });
}

/**
 * Make a JSON payload safe to inline inside a <script> element:
 * escapes characters that could close the tag or open markup.
 *
 * NOT for the seed, which is no longer JSON. seroval's JS output inlines
 * helpers that use `<` as a real operator \u2014 a base64 decoder's
 * `for (let i = 0; i < length; i++)` is the one bare `<` a typed-array payload
 * contains \u2014 so a blanket pass over it corrupts the payload rather than
 * protecting it. That output escapes its own strings (`</script>` leaves as
 * `\x3C/script>`, U+2028/9 as `\u2028`/`\u2029`), which is where the guarantee
 * comes from now. Kept for callers embedding genuine JSON.
 */
export function escapeScriptPayload(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Inline pre-hydration capture, claim-based.
 *
 * The old one recorded a click's COORDINATES, because hydration replaced every
 * node and there was nothing else to aim at — and it captured no keyboard or
 * input events at all, for the same reason: a keystroke has no coordinates and
 * a typed value has nowhere to go once its input has been thrown away.
 *
 * Claiming preserves the node, so the target is recorded as the NODE ITSELF.
 * That is what puts `keydown` and the typed value and the caret position in the
 * queue at all; `SEMANTICS.md` H6 is the rule it exists for.
 *
 * A node reference and not a child-index path, and the difference is a bug this
 * shipped with: `__BARQ_SWAP__` replaces a settled boundary's fallback between
 * capture and replay, so a path recorded against a spinner resolves after the
 * swap to whatever the real content put at that index — a click on a `pending`
 * placeholder replayed onto a live control. A reference to a swapped-away node
 * is merely detached, which is answerable; a path is confidently wrong. The
 * path is still recorded for the RECOVERED case, where every node was replaced
 * and neither a reference nor a path survives, and the coordinates behind it.
 *
 * A `@state` record is not an event. It is the value, the checked flag, the
 * selection and the focus of an element the user was editing, sampled on every
 * input; the last one for a given element wins, and `hydrate` applies them all
 * before it replays anything.
 */
const EVENT_CAPTURE_SNIPPET =
  "window.__BARQ_EVTS__=[];window.__BARQ_EVTS_STOP__=(function(){" +
  "var q=window.__BARQ_EVTS__;" +
  'var ts=["click","dblclick","pointerdown","pointerup","mousedown","mouseup","touchstart","touchend","contextmenu","keydown","keyup","keypress","input","change","focusin"];' +
  "var p=function(n){var a=[];while(n&&n!==document.body){var i=0;var s=n;while((s=s.previousSibling))i++;a.unshift(i);n=n.parentNode}return n?a:[]};" +
  "var st=function(t){if(!t||t.value===undefined)return;" +
  "q.push({type:'@state',node:t,path:p(t),value:t.value,checked:t.checked,start:t.selectionStart===null?undefined:t.selectionStart,end:t.selectionEnd===null?undefined:t.selectionEnd,focus:document.activeElement===t,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false})};" +
  "var h=function(e){var t=e.target;" +
  "if(e.type==='input'||e.type==='change'||e.type==='focusin')st(t);" +
  "if(e.type==='focusin')return;" +
  "q.push({type:e.type,node:t,path:p(t),x:e.clientX,y:e.clientY,button:e.button,key:e.key,code:e.code,ctrlKey:!!e.ctrlKey,metaKey:!!e.metaKey,shiftKey:!!e.shiftKey,altKey:!!e.altKey})};" +
  "ts.forEach(function(t){document.addEventListener(t,h,true)});" +
  "return function(){ts.forEach(function(t){document.removeEventListener(t,h,true)})}})();";

function hydrationScriptFor(data: Record<string, unknown>, nonce?: string): string {
  return `<script${nonceAttr(nonce)}>window.__BARQ_DATA__=${encodeSeed(data)};${EVENT_CAPTURE_SNIPPET}</script>`;
}

/**
 * Every inline script a render emits carries the caller's nonce, or none of
 * them do. A streamed page emits at least three — the swap snippet, one swap
 * per resumed boundary, and the seed — so without this the page needs
 * `script-src 'unsafe-inline'`, which is the directive CSP exists to avoid.
 */
function nonceAttr(nonce?: string): string {
  return nonce === undefined ? "" : ` nonce="${escapeAttribute(nonce)}"`;
}

/**
 * Inline script transferring server-resolved async data to the client.
 * Reflects the most recent renderPage/renderToStringAsync; concurrent
 * servers should use the `script` returned by renderPage instead.
 * Place it before the bundle that calls hydrate().
 */
export function generateHydrationScript(nonce?: string): string {
  return hydrationScriptFor(lastRenderData, nonce);
}

/**
 * Keyed async data resolved by the most recent renderPage/
 * renderToStringAsync. Concurrent servers should use the `data` returned
 * by renderPage instead.
 */
export function getRenderData(): Record<string, unknown> {
  return lastRenderData;
}

/** Reset all recorded async data and the last-render snapshot */
export function clearRenderData(): void {
  clearHydrationData();
  lastRenderData = {};
}

export { settle };
