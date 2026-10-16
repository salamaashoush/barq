/**
 * Server-side rendering: Solid 2.0's entry points over barq's two backends.
 *
 * `renderToString` is one synchronous pass. `renderToStream` renders the shell
 * synchronously and hands back Solid's result: the shell then one template per
 * boundary as it settles through `readable`, `pipe` or `pipeTo`, or the whole
 * settled document through `then`. Both ways are the same render, decided by
 * which consumer claims it, so no page is ever rendered twice.
 *
 * A string-compiled module is markup already. Anything else is built against
 * an ambient DOM (happy-dom's `GlobalRegistrator` on a server) and serialized.
 */

import {
  type HeadTag,
  type JSXElement,
  HYDRATE,
  type Scope,
  NotReadyError,
  flush,
  isSsrHtml,
  render,
  rootScope,
  runWithOwner,
  settle,
  errorOwnerPath,
} from "@barqjs/core";
import {
  abandonPendingSeeds,
  clearHydrationData,
  disposeScope,
  getHydrationData,
  pendingSeedsOf,
  setAsyncSession,
  settleStep,
  diagnosticsEnabled,
  emitDiagnostic,
  headKey,
  setHeadSink,
  thrownBy,
} from "@barqjs/core/internal";
import {
  type LateCatcher,
  type RevealGroup,
  type SsrHtml,
  html as ssrHtml,
  type StreamSink,
  contentRange,
  esc,
  guardedRange,
  escapeAttribute,
  escapeText,
  rawText,
  setStreamSink,
} from "./ssr.ts";
import {
  type AnySerializationAdapter,
  createSeedEncoder,
  encodeSeed,
  sanitizeThrown,
  serializationAdapters,
} from "./codec.ts";
import { HEAD_SNIPPET, SWAP_SNIPPET, swapDeferredRange } from "#swap";

export { swapDeferredRange };

/**
 * The root of a server render, which takes the scope it is given.
 *
 * `render` on the DOM backend has always handed its callback a scope; this did
 * not, so the root component was called with `null` and every `each` and
 * `branch` below it opened a scope parented to nothing. A provider installs on
 * the ambient owner and its consumer inside a row found nothing, so on the
 * server an accordion, a tab list and a menu each threw "must be rendered
 * inside" — the client was fine and only the server was wrong.
 *
 * The parameter is optional so a hand-written caller — a test, a snippet, any
 * module the compiler never saw — still type-checks with `() => <App />`.
 */
export type RootRender = (scope?: Scope) => JSXElement | SsrHtml;

/**
 * Where a failure was met, Solid's `ServerErrorContext` for a render: `failed`
 * fails the request (the shell threw), `fallback` is an error boundary that
 * shows its fallback for it, and `client` is a boundary the stream gave up on,
 * which the browser builds again.
 */
export interface ServerErrorContext {
  readonly kind: "render";
  readonly handling: "failed" | "fallback" | "client";
}

/** A one-argument listener still works; it hears every failure. */
export type ServerErrorHook = (error: unknown, context: ServerErrorContext) => void;

export interface RenderToStringOptions {
  nonce?: CSPNonce;
  /**
   * Namespaces the ids this render writes, so two renders in one document do
   * not answer each other's boundaries. The client passes the same id.
   */
  renderId?: string;
  /** No script at all: no seed, no input capture. */
  noScripts?: boolean;
  /** Serialization adapters for this render, beside the process's registry. */
  plugins?: readonly AnySerializationAdapter[];
  onError?: ServerErrorHook;
  /**
   * What `useHead` declared, as markup, when the render has no `</head>` to
   * put it in: the host's own document template places it.
   */
  onHead?: (head: string) => void;
  /** The assets each `lazy()` module needs, put in the head when one renders. */
  manifest?: AssetManifest;
}

/**
 * Render synchronously to an HTML string.
 *
 * Pending async values render their `Loading` fallbacks. What the render did
 * resolve is seeded unless `noScripts`, before `</body>` when the markup is a
 * document and after it otherwise, so the client does not fetch it again.
 */
export function renderToString(fn: RootRender, options: RenderToStringOptions = {}): string {
  let container: HTMLElement | null = null;
  let markup: string | null = null;
  const session = Symbol("render");
  const previous = setAsyncSession(session);
  const head = new HeadCollector(options.manifest);
  const previousHead = setHeadSink(head.sink);
  const owner = rootScope(null, options.renderId);
  try {
    runWithOwner(owner, () => {
      const value = fn(owner);
      // A module compiled by the SSR string backend already IS the markup, and
      // renders with no DOM at all. Anything else goes through the ambient DOM.
      if (isSsrHtml(value)) {
        markup = value.t;
        return;
      }
      if (typeof document === "undefined") {
        throw new Error(
          "`renderToString` was given a view that was not compiled for the server, and there is no global `document` to build it with. " +
            "Compile the module with the `@barqjs/compiler` Vite plugin in an SSR build, or register a DOM such as happy-dom's `GlobalRegistrator` before rendering.",
        );
      }
      container = document.createElement("div");
      render(value, container);
    });
    flush();
    const html = withHead(
      markup ?? (container as HTMLElement | null)?.innerHTML ?? "",
      head,
      options.onHead,
    );
    if (options.noScripts === true) return html;
    const data = getHydrationData(session);
    if (Object.keys(data).length === 0) return html;
    const script =
      `<script${nonceAttr(scriptNonce(options.nonce))}>` +
      adapted(
        `window.__BARQ_DATA__=Object.assign(window.__BARQ_DATA__||{},${encodeSeed(data, options.plugins)});${SEED_SETTLE_GUARD}`,
      ) +
      "</script>";
    return beforeBodyEnd(html, script);
  } catch (error) {
    options.onError?.(error, FAILED);
    throw error;
  } finally {
    disposeScope(owner);
    setAsyncSession(previous);
    setHeadSink(previousHead);
    clearHydrationData(session);
  }
}

const FAILED: ServerErrorContext = { kind: "render", handling: "failed" };
const FALLBACK: ServerErrorContext = { kind: "render", handling: "fallback" };
const CLIENT: ServerErrorContext = { kind: "render", handling: "client" };

function beforeBodyEnd(html: string, script: string): string {
  const at = html.lastIndexOf("</body>");
  return at === -1 ? html + script : html.slice(0, at) + script + html.slice(at);
}

/**
 * Render to an HTML string after all async work settles. Solid removed it for
 * `await renderToStream(...)`, which is the same document with its seed.
 */
export async function renderToStringAsync(fn: RootRender): Promise<string> {
  const { html } = await renderPage(fn);
  return html;
}

/**
 * Render a page after async work settles, returning the HTML, the resolved
 * keyed async data, and the inline script that seeds it. Concurrent renders
 * are independent: each waits for and serializes only its own session's reads.
 */
export async function renderPage(
  fn: RootRender,
  options?: {
    nonce?: CSPNonce;
    /**
     * The async session to attribute this render's keyed reads to.
     *
     * Minted here when absent, which is every caller but one. `@barqjs/router`'s
     * page handler passes its own so that work done BEFORE the render — a loader
     * awaited to give `head` its `loaderData` — lands in the same bucket the
     * seed is written from. A value first read under a different session is
     * "seeded into nobody" and the client refetches everything.
     */
    session?: symbol;
    plugins?: readonly AnySerializationAdapter[];
    renderId?: string;
    manifest?: AssetManifest;
  },
): Promise<{ html: string; data: Record<string, unknown>; script: string }> {
  const job = startRender(
    fn,
    { session: options?.session, renderId: options?.renderId, manifest: options?.manifest },
    true,
  );
  const page = await settledPage(job, BOUNDARY_TIMEOUT, null);
  return {
    html: page.html,
    data: page.data,
    script: await seedScriptFor(page.data, scriptNonce(options?.nonce), options?.plugins),
  };
}

/** A boundary the shell parked, with the stamped markers that find it again. */
interface Parked {
  id: number;
  /** The build the shell refused to wait for. Throws `NotReadyError` while it still cannot. */
  resume: () => string;
  /** When it parked, so its own deadline is measured from there. */
  at: number;
  /** What its last attempt threw: the value it is waiting for. */
  parkedOn: NotReadyError;
  /** Whether this boundary's page hydrates — see `StreamSink.defer`. */
  hydrate: boolean;
  open: string;
  close: string;
  /** The error boundary that stood around it, for a failure on a later resume. */
  catcher: LateCatcher | null;
  /** Where on the page it stands, for a stream. */
  namespace: Namespace;
  /** The `<Reveal>` it stands in. */
  group: RevealGroup | null;
}

/** An error boundary a parked boundary below it may still fail. */
interface Guard {
  id: number;
  flags: number;
  /** Whether a stream can address it, `<!--[e:N-->`; see `guardedRange`. */
  streamable: boolean;
  namespace: Namespace;
  /** Its fallback has replaced the range, and everything that stood in it. */
  failed: boolean;
}

/**
 * One render's shell, and everything a consumer needs to finish it either way.
 *
 * The sink writes markers carrying a value minted for this render, because the
 * buffered consumer finds a range again in the bytes and nothing on the page
 * can reproduce that value. A stream rewrites them into the comments the client
 * reads (`wireOf`) as each piece leaves.
 */
interface Job {
  session: symbol;
  stamp: string;
  markers: RegExp;
  renderId: string;
  owner: Scope | null;
  shell: string;
  /** Built as DOM rather than as markup, so the page is read off `container`. */
  container: HTMLElement | null;
  parked: Parked[];
  guards: Map<LateCatcher, Guard>;
  guardsById: Map<number, Guard>;
  sink: StreamSink;
  /** What `useHead` declared, by identity, and what came after the shell. */
  head: HeadCollector;
  /** Each `<Reveal>`'s parked boundaries, in the order they parked. */
  groups: Map<RevealGroup, Parked[]>;
  /** Boundaries resumed into the shell, which a group counts as revealed. */
  inlined: Set<Parked>;
  released: boolean;
}

/**
 * What a `lazy()` module needs on the page: its chunk and the chunks it
 * imports, and its stylesheets. Keyed by the URL the bundler gave the module,
 * or answered by a function a host computes it with.
 */
export type AssetManifest =
  | Readonly<Record<string, ModuleAssets>>
  | ((moduleUrl: string) => ModuleAssets | undefined);

export interface ModuleAssets {
  readonly js?: readonly string[];
  readonly css?: readonly string[];
}

/** One render's `useHead` declarations, and the assets its `lazy()` modules need. */
class HeadCollector {
  constructor(private readonly manifest?: AssetManifest) {}
  readonly tags = new Map<string, HeadTag>();
  /** Set once the shell's head is written; declarations after it are patches. */
  sealed = false;
  fresh = new Map<string, HeadTag>();
  readonly sink = {
    add: (tags: readonly HeadTag[]): void => {
      for (const tag of tags) {
        const key = headKey(tag);
        this.tags.set(key, tag);
        if (this.sealed) this.fresh.set(key, tag);
      }
    },
    module: (url: string): void => {
      const manifest = this.manifest;
      if (manifest === undefined) return;
      const assets = typeof manifest === "function" ? manifest(url) : manifest[url];
      if (assets === undefined) return;
      const tags: HeadTag[] = [];
      for (const href of assets.css ?? []) {
        tags.push({ tag: "link", props: { rel: "stylesheet", href } });
      }
      for (const href of assets.js ?? []) {
        tags.push({ tag: "link", props: { rel: "modulepreload", href } });
      }
      // A module that rendered once has said everything it has to say.
      this.sink.add(tags.filter((tag) => !this.tags.has(headKey(tag))));
    },
  };

  /** The shell's head, as markup. */
  markup(): string {
    let out = "";
    for (const [key, tag] of this.tags) out += headMarkup(key, tag);
    return out;
  }

  /** What was declared since the last call, as the patch `__BARQ_HEAD__` applies. */
  patch(): string {
    if (this.fresh.size === 0) return "";
    const ops = [...this.fresh].map(([key, tag]) => ({
      k: key,
      t: tag.tag,
      a: attributesOf(tag),
      c: tag.children,
    }));
    this.fresh = new Map();
    return `window.__BARQ_HEAD__(${JSON.stringify(ops).replaceAll("<", "\\u003c")})`;
  }
}

function attributesOf(tag: HeadTag): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(tag.props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    out[name] = value === true ? "" : String(value);
  }
  return out;
}

function headMarkup(key: string, tag: HeadTag): string {
  let attributes = "";
  for (const [name, value] of Object.entries(attributesOf(tag))) {
    attributes += value === "" ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`;
  }
  attributes += ` data-bh="${escapeAttribute(key)}"`;
  if (tag.tag === "meta" || tag.tag === "link" || tag.tag === "base")
    return `<${tag.tag}${attributes}>`;
  const body =
    tag.children === undefined
      ? ""
      : tag.tag === "title"
        ? escapeText(tag.children)
        : rawText(tag.children, tag.tag);
  return `<${tag.tag}${attributes}>${body}</${tag.tag}>`;
}

/**
 * The shell with what `useHead` declared, inside its `<head>` when it has one
 * and handed to `onHead` when the host writes the head itself.
 */
function withHead(html: string, head: HeadCollector, onHead?: (markup: string) => void): string {
  head.sealed = true;
  const markup = head.markup();
  if (markup === "") return html;
  const at = html.indexOf("</head>");
  if (at === -1) {
    onHead?.(markup);
    return html;
  }
  return html.slice(0, at) + markup + html.slice(at);
}

/**
 * Render the shell, synchronously. A throw is the shell failing, and it leaves
 * nothing held.
 */
function startRender(
  fn: RootRender,
  options: { session?: symbol; renderId?: string; manifest?: AssetManifest },
  viaDom: boolean,
): Job {
  const stamp = crypto.randomUUID();
  const job: Job = {
    session: options.session ?? Symbol("render-session"),
    stamp,
    markers: new RegExp(`<!--([\\[\\]])([be]):(\\d+):${stamp}-->`, "g"),
    renderId: options.renderId ?? "",
    owner: null,
    shell: "",
    container: null,
    parked: [],
    guards: new Map(),
    guardsById: new Map(),
    sink: null as never,
    head: new HeadCollector(options.manifest),
    groups: new Map(),
    inlined: new Set(),
    released: false,
  };
  let next = 0;
  job.sink = {
    defer(resume, fallback, flags, parkedOn, catcher, group): string {
      const id = next++;
      const open = `<!--[b:${id}:${stamp}-->`;
      const close = `<!--]b:${id}:${stamp}-->`;
      const record: Parked = {
        id,
        resume,
        at: Date.now(),
        parkedOn,
        hydrate: (flags & HYDRATE) !== 0,
        open,
        close,
        catcher,
        namespace: "html",
        group,
      };
      job.parked.push(record);
      if (group !== null) {
        let members = job.groups.get(group);
        if (members === undefined) job.groups.set(group, (members = []));
        members.push(record);
      }
      return open + fallback + close;
    },
    guard(catcher, built, flags): string {
      const id = next++;
      catcher.open = `<!--[e:${id}:${stamp}-->`;
      catcher.close = `<!--]e:${id}:${stamp}-->`;
      const guard: Guard = {
        id,
        flags,
        streamable: guardedRange(id, "", flags) !== null,
        namespace: "html",
        failed: false,
      };
      job.guards.set(catcher, guard);
      job.guardsById.set(id, guard);
      return catcher.open + built + catcher.close;
    },
  };

  const previousSink = setStreamSink(job.sink);
  const previousHead = setHeadSink(job.head.sink);
  try {
    const previousSession = setAsyncSession(job.session);
    try {
      const root = rootScope(null, job.renderId);
      job.owner = root;
      runWithOwner(root, () => {
        const value = fn(root);
        if (isSsrHtml(value)) {
          job.shell = value.t;
          return;
        }
        if (!viaDom) {
          job.shell = esc(value);
          return;
        }
        if (typeof document === "undefined") {
          throw new Error(
            "`renderToStringAsync` was given a view that was not compiled for the server, and there is no global `document` to build it with. " +
              "Compile the module with the `@barqjs/compiler` Vite plugin in an SSR build, or register a DOM such as happy-dom's `GlobalRegistrator` before rendering.",
          );
        }
        job.container = document.createElement("div");
        render(value, job.container);
      });
    } finally {
      setAsyncSession(previousSession);
    }
    // The flush is the whole process's: it runs whatever any render has
    // pending, so it is not made in this one's name.
    flush();
  } catch (error) {
    release(job);
    throw error;
  } finally {
    setStreamSink(previousSink);
    setHeadSink(previousHead);
  }
  return job;
}

/** Everything a render holds, let go of once, on every way out of it. */
function release(job: Job): void {
  if (job.released) return;
  job.released = true;
  abandonPendingSeeds(job.session);
  clearHydrationData(job.session);
  if (job.owner !== null) disposeScope(job.owner);
}

const CONTENT_EDGES = new Map<number, readonly [open: string, close: string]>();

/** What an error boundary writes around its content when nothing below it failed. */
function contentEdges(flags: number): readonly [open: string, close: string] {
  let edges = CONTENT_EDGES.get(flags);
  if (edges === undefined) {
    const [open = "", close = ""] = contentRange("\u0000", flags).split("\u0000");
    edges = [open, close];
    CONTENT_EDGES.set(flags, edges);
  }
  return edges;
}

/** The id a boundary has on the wire, namespaced by the render's `renderId`. */
function wireId(job: Job, id: number): string {
  return `${job.renderId}${id}`;
}

/**
 * Markup as it leaves on a stream: a parked boundary is the `<!--[b:N-->` range
 * the swap finds, and an error boundary is the `<!--[e:N-->` range a late
 * failure replaces, or its ordinary range where no stream can address it.
 */
function wireOf(job: Job, markup: string): string {
  if (!markup.includes(job.stamp)) return markup;
  return markup.replace(job.markers, (_, edge: string, kind: string, id: string) => {
    if (kind === "b") return edge === "[" ? `<!--[b:${wireId(job, Number(id))}-->` : "<!--]-->";
    const guard = job.guardsById.get(Number(id));
    if (guard !== undefined && guard.streamable) {
      return edge === "[" ? `<!--[e:${wireId(job, guard.id)}-->` : "<!--]-->";
    }
    const [open, close] = contentEdges(guard?.flags ?? 0);
    return edge === "[" ? open : close;
  });
}

/**
 * The same, for a page that is finished: what never settled is the range the
 * client reads as "build this one yourself", and an error boundary that did
 * not fail is the range it would have written in the shell.
 */
function finishedWireOf(job: Job, markup: string): string {
  if (!markup.includes(job.stamp)) return markup;
  return markup.replace(job.markers, (_, edge: string, kind: string, id: string) => {
    if (kind === "b") return edge === "[" ? `<!--[b:${wireId(job, Number(id))}-->` : "<!--]-->";
    const [open, close] = contentEdges(job.guardsById.get(Number(id))?.flags ?? 0);
    return edge === "[" ? open : close;
  });
}

/**
 * The buffered completion: resume every parked boundary into the bytes, then
 * collect what the render resolved.
 *
 * `uncaught`, when given, hears a late failure no error boundary stands
 * around, and the boundary keeps its fallback. Without it that failure fails
 * the render, as a shell failure does.
 */
async function settledPage(
  job: Job,
  deadline: number,
  uncaught: ((error: unknown) => void) | null,
  onHead?: (head: string) => void,
): Promise<{ html: string; data: Record<string, unknown> }> {
  let html: string;
  let data: Record<string, unknown>;
  try {
    // Session-scoped: concurrent renders don't wait on each other's fetches.
    // Bounded by the boundary deadline, because `settle` waits for every flight
    // and a fetch that never answers would hold the response for good; what is
    // still parked past it is abandoned by the drain below.
    await withinDeadline(settle(job.session), deadline);
    html =
      job.container === null
        ? await drainParked(
            job.shell,
            job.parked,
            job.sink,
            job.session,
            deadline,
            uncaught,
            job.head,
          )
        : job.container.innerHTML;
    html = withHead(finishedWireOf(job, html), job.head, onHead);
    // A key whose read FAILED is owed to the client as much as one that
    // settled: the page already shows the error boundary that caught it, and a
    // client that refetched instead would build the content over that markup.
    const flights = pendingSeedsOf(job.session);
    abandonPendingSeeds(job.session);
    data = await settleNested(await withFailures(getHydrationData(job.session), flights));
  } finally {
    release(job);
  }
  return { html, data };
}

/**
 * Resume every parked boundary and patch each settled one into the bytes.
 *
 * The buffered arm of the same park-and-resume the stream uses, which is what
 * lets one render serve both. A boundary resumed here may park boundaries of ITS
 * OWN — that is what nesting is — so the queue is drained rather than iterated
 * once, and the depth of nesting a page can resolve is not bounded by a pass
 * count. The two-pass render this replaced could resolve exactly one level.
 *
 * What it gives up on is left in `parked` for the caller.
 */
async function drainParked(
  markup: string,
  parked: Parked[],
  sink: StreamSink,
  session: symbol,
  deadline: number,
  uncaught: ((error: unknown) => void) | null,
  head: HeadCollector,
): Promise<string> {
  let out = markup;
  const unsettled: Parked[] = [];
  // Set once a failure has replaced an error boundary's markup, which may have
  // taken boundaries still parked inside it off the page.
  let cut = false;
  while (parked.length > 0) {
    const round = parked.splice(0, parked.length);
    const again: Parked[] = [];
    for (const record of round) {
      if (cut && !out.includes(record.open)) continue;
      const restore = setAsyncSession(session);
      const outerSink = setStreamSink(sink);
      const outerHead = setHeadSink(head.sink);
      let settled: string | null = null;
      try {
        settled = record.resume();
      } catch (error) {
        if (!(error instanceof NotReadyError)) {
          const failed = failLate(out, record, error);
          if (failed !== null) {
            out = failed;
            cut = true;
          } else if (uncaught === null) {
            throw error;
          } else {
            uncaught(thrownBy(error));
            unsettled.push(record);
          }
          continue;
        }
        record.parkedOn = error;
      } finally {
        setStreamSink(outerSink);
        setHeadSink(outerHead);
        setAsyncSession(restore);
      }
      if (settled === null) {
        // Past its own deadline it is abandoned to the fallback the shell
        // already carries, which is the rule the streamed arm applies too.
        if (Date.now() - record.at < deadline) again.push(record);
        else unsettled.push(record);
        continue;
      }
      // A hydratable page keeps the range — the client claims it, and after
      // this the boundary is indistinguishable from one that settled inside
      // the shell. A page that does not hydrate keeps neither comment: the
      // markers existed only so this patch could find the range.
      const content = record.hydrate ? `<!--[-->${settled}<!--]-->` : settled;
      out = replaceBetween(out, record.open, record.close, () => content);
    }
    if (again.length > 0) parked.unshift(...again);
    if (parked.length === 0) break;
    // A flight another render started is not this one's to wait out: `settle`
    // bounds nothing, so the oldest boundary's deadline does, and the round
    // after it abandons whatever is past its own.
    const oldest = Math.min(...parked.map((record) => record.at));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<"expired">((resolve) => {
      timer = setTimeout(() => resolve("expired"), oldest + deadline - Date.now());
    });
    let stepped: boolean | "expired";
    try {
      stepped = await Promise.race([settleStep(session, flightsOf(parked)), expired]);
    } finally {
      clearTimeout(timer);
    }
    // Nothing this render is waiting on is still in the air: what is left
    // keeps its fallback.
    if (stepped === false) break;
  }
  parked.unshift(...unsettled);
  return out;
}

async function withinDeadline(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** What each parked boundary's last attempt threw, for `settleStep` to wait on. */
function flightsOf(parked: readonly Parked[]): NotReadyError[] {
  return parked.map((record) => record.parkedOn);
}

/**
 * A parked boundary failed on a resume, after the error boundary around it
 * had written its markup. That error boundary's fallback replaces all of it,
 * which is what it would have shown had the failure come while it was still
 * building. `null` when no error boundary stands around it.
 */
function failLate(page: string, record: Parked, error: unknown): string | null {
  // An outer failure already took this boundary off the page.
  if (!page.includes(record.open)) return page;
  const catcher = record.catcher;
  if (catcher === null || catcher.open === null || catcher.close === null) return null;
  return replaceBetween(page, catcher.open, catcher.close, () => {
    try {
      return catcher.fallback(thrownBy(error));
    } catch (fallbackError) {
      // A fallback that is not ready yet has nothing to show, the rule
      // `loadingBoundary` applies to its own.
      if (fallbackError instanceof NotReadyError) return "";
      throw fallbackError;
    }
  });
}

/**
 * The keys whose reads failed, added to what settled, as the rejections they
 * are. Only a failure is added: a flight still open when the render ended was
 * abandoned, and the client fetches that one itself.
 */
async function withFailures(
  data: Record<string, unknown>,
  flights: Record<string, Promise<unknown>>,
): Promise<Record<string, unknown>> {
  let out = data;
  for (const [key, flight] of Object.entries(flights)) {
    if (Object.hasOwn(data, key)) continue;
    const failure = await flight.then(
      () => null,
      (error: unknown) => ({ error }),
    );
    if (failure === null) continue;
    if (out === data) out = { ...data };
    out[key] = handledRejection(failure.error);
  }
  return out;
}

/**
 * Rewrite one parked range of a buffered page, found by the markers this
 * render wrote around it.
 *
 * Found, and not parsed for. A page is full of bytes its author did not write —
 * an attribute value is escaped for `&` and `"` and nothing else, so `<!--[`
 * and `<!--]-->` pass through one untouched — and a scan that reads comment
 * syntax out of the serialised page takes those for the renderer's own. The
 * markers carry a value minted for this render, which nothing on the page can
 * reproduce, and the close marker names its boundary, so no depth is counted
 * and no other range's close can be taken for this one's.
 */
function replaceBetween(
  page: string,
  open: string,
  close: string,
  write: (inner: string) => string,
): string {
  const start = page.indexOf(open);
  if (start === -1) return page;
  const inner = start + open.length;
  const end = page.indexOf(close, inner);
  if (end === -1) return page;
  return page.slice(0, start) + write(page.slice(inner, end)) + page.slice(end + close.length);
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
  if (isThenable(value)) {
    let arrived: unknown;
    try {
      arrived = await value;
    } catch (error) {
      // A DEFERRED VALUE THAT REJECTED, and letting this escape was a live
      // defect rather than a gap: this walk runs after the markup exists, so the
      // rejection left `renderPage`, left the page handler, and the request got
      // NO RESPONSE AT ALL — no status, no body, no error boundary — for a page
      // that had already rendered. The streamed arm has always carried it
      // (seroval emits `resolver.f(error)` in a later chunk), so a browser was
      // served the page and a crawler, which `isbot` routes to the buffered arm,
      // took the request down.
      throw new DeferredRejection(error);
    }
    return settleNested(arrived as T, seen);
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
        // BOXED, for the reason `DeferredRejection` is thrown: an async callback
        // adopts a thenable it returns, so a placed rejection handed back bare
        // would reject the `Promise.all` instead of taking its slot.
        try {
          const next = await settleNested(item, seen);
          if (next !== item) moved = true;
          return { next };
        } catch (error) {
          moved = true;
          return { next: placed(error) };
        }
      }),
    );
    return moved ? (out.map((entry) => entry.next) as T) : value;
  }

  // Plain objects only: a `Map`, a `Date` or a class instance is handed over as
  // it stands, so nothing this walk touches changes how the encoder sees it.
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  seen.add(value);
  let moved = false;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    let next: unknown;
    try {
      next = await settleNested(item, seen);
    } catch (error) {
      next = placed(error);
    }
    if (next !== item) moved = true;
    out[key] = next;
  }
  // The ORIGINAL when nothing moved, so identity and cycles survive the common
  // case untouched: only a subtree that actually held a promise is rebuilt.
  return moved ? (out as T) : value;
}

/**
 * A PREDICATE rather than a cast: `T` is not known to be thenable, and narrowing
 * is what lets the `await` above need no assertion at all.
 */
function isThenable(value: object): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown }).then === "function";
}

/**
 * A deferred value rejected, travelling to the composite that holds it.
 *
 * A THROW rather than a return, and that is forced rather than chosen: an
 * `async` function ADOPTS a thenable it returns, so handing the rejected
 * promise back would reject `settleNested`'s own promise and put the failure
 * straight back where it came from. Thrown, it lands in the array or object
 * branch one level up, which is the thing that has a slot to put it in.
 */
class DeferredRejection {
  constructor(readonly cause: unknown) {}
}

/** A placed rejection, or a rethrow for anything that is not one. */
function placed(error: unknown): unknown {
  if (error instanceof DeferredRejection) return handledRejection(error.cause);
  throw error;
}
/**
 * A flight as the browser is told of it: what it settles on, or what it threw
 * after `sanitizeThrown`. Handled here, because a rejection seroval has not
 * subscribed to yet would otherwise be reported as unhandled.
 */
function sanitizedFlight(flight: Promise<unknown>): Promise<unknown> {
  const told = flight.then(
    (value) => value,
    (error: unknown) => {
      throw sanitizeThrown(error);
    },
  );
  told.catch(() => {});
  return told;
}

/**
 * A promise that is already rejected and already handled.
 *
 * The `catch` is not error handling — it is what stops the runtime reporting an
 * unhandled rejection for a value whose only consumer is the encoder, which
 * attaches its own handler a moment later.
 */
function handledRejection(reason: unknown): Promise<never> {
  const rejected = Promise.reject(sanitizeThrown(reason));
  rejected.catch(() => {});
  return rejected;
}

// ── streaming ────────────────────────────────────────────────────────────
//
// Streaming falls out of Blocks: an unready boundary flushes
// `<!--[b:7-->fallback<!--]-->` plus a continuation record `(Block, Scope)`, and
// when its promises settle the server flushes a `<template>` and a swap. The
// Block is re-invocable with its scope, so there is no second code path.
//
// That is the whole implementation. The shell is one ordinary string render
// with a SINK installed; every unready `Loading` parks the build of its content
// instead of settling for the fallback, and the loop below resumes them in the
// order they settle.

/**
 * A failure after the shell, on the diagnostics channel. The status has gone
 * out with the shell, so the response cannot say it, and this is where a
 * development server picks it up to show it over the page.
 */
function reportContained(error: unknown): void {
  const thrown = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  emitDiagnostic(
    {
      code: "SSR_RENDER_ERROR_CONTAINED",
      kind: "ssr",
      severity: "error",
      message:
        `Part of the page threw \`${thrown}\` while it rendered after the shell had been sent. ` +
        "The status and headers were already on the wire, so the page streamed on: the nearest " +
        "error boundary the stream wrote shows its fallback, and without one the part keeps its " +
        "loading fallback and the browser builds it again. Fix the throw at the top of the stack, " +
        "or wrap the part in `<Errored>` or give its route an `errorComponent` to show the " +
        "failure on purpose.",
      data: { error },
      ownerPath: errorOwnerPath(error),
    },
    null,
  );
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
 * The namespace a deferred boundary stands in. A `<template>` is parsed as
 * HTML whatever the boundary's position on the page was, so a payload bound
 * for foreign content is shipped inside an element of that namespace and
 * `swapDeferredRange` unwraps it.
 */
type Namespace = "html" | "svg" | "math";

const FOREIGN_WRAP: Record<Namespace, readonly [open: string, close: string]> = {
  html: ["", ""],
  svg: ["<svg>", "</svg>"],
  math: ["<math>", "</math>"],
};

/**
 * Record where each boundary that `markup` parked or guarded stands.
 *
 * Nothing tells a boundary its namespace when it is called: the string backend
 * builds children before their parent's bytes exist, and the compiler passes
 * no hint. The markup the boundary landed in is the only place the answer is,
 * and it is complete by the time anything is streamed, so this is asked once
 * per piece of markup that parked something.
 */
function placeParked(
  markup: string,
  outer: Namespace,
  fresh: readonly { readonly id: number; namespace: Namespace }[],
  job: Job,
): void {
  if (fresh.length === 0) return;
  const found = namespacesOf(markup, outer);
  for (const record of fresh) record.namespace = found.get(wireId(job, record.id)) ?? outer;
}

const FOREIGN_ROOT = /<(?:svg|math)[\s/>]/i;

/** Elements whose content the HTML tokenizer hands over as text. */
const TEXT_CONTENT = new Set([
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "plaintext",
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
]);

/** MathML's text integration points: a start tag inside one is HTML. */
const MATH_TEXT = new Set(["mi", "mn", "mo", "ms", "mtext"]);

const TEXT_END = new Map<string, RegExp>();

/** Where the text content of `name`, starting at `from`, ends. */
function endOfText(markup: string, name: string, from: number): number {
  if (name === "plaintext") return markup.length;
  let pattern = TEXT_END.get(name);
  if (pattern === undefined) {
    pattern = new RegExp(`</${name}[\\s/>]`, "gi");
    TEXT_END.set(name, pattern);
  }
  pattern.lastIndex = from;
  const match = pattern.exec(markup);
  return match === null ? markup.length : match.index;
}

function isSpace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 12 || code === 13;
}

/**
 * The namespace at every `<!--[b:N-->` and `<!--[e:N-->` in `markup`, which
 * starts in `outer`.
 *
 * A TOKENIZER, and it has to be one. An attribute value leaves `<` and `>`
 * raw, so a search for `<svg` or for the comment itself would be answered by a
 * value as readily as by an element: tags are found only where a tag can
 * start, a value is skipped as a value, and text content is skipped as text.
 *
 * It is not a tree builder. The only elements it keeps are the ones a
 * namespace turns on: the root of a foreign subtree, the points inside one
 * where HTML resumes, and an element of the same name nested in either, so
 * that its end tag is not taken for the outer one's.
 */
function namespacesOf(markup: string, outer: Namespace): Map<string, Namespace> {
  const found = new Map<string, Namespace>();
  if (outer === "html" && !FOREIGN_ROOT.test(markup)) return found;
  const length = markup.length;
  const entered: { name: string; back: Namespace }[] = [];
  let ns = outer;
  let at = 0;
  for (;;) {
    const lt = markup.indexOf("<", at);
    if (lt === -1) break;
    at = lt + 1;
    let code = markup.charCodeAt(at);
    if (code === 33) {
      if (markup.startsWith("--", at + 1)) {
        const end = markup.indexOf("-->", at + 3);
        const stop = end === -1 ? length : end;
        if (markup.startsWith("[b:", at + 3) || markup.startsWith("[e:", at + 3)) {
          found.set(markup.slice(at + 6, stop), ns);
        }
        at = stop + 3;
      } else if (ns !== "html" && markup.startsWith("[CDATA[", at + 1)) {
        const end = markup.indexOf("]]>", at + 8);
        at = end === -1 ? length : end + 3;
      } else {
        const end = markup.indexOf(">", at);
        at = end === -1 ? length : end + 1;
      }
      continue;
    }
    const closing = code === 47;
    if (closing) code = markup.charCodeAt(++at);
    // `<` followed by anything but an ASCII letter is text.
    if ((code | 32) < 97 || (code | 32) > 122) continue;
    const nameAt = at;
    for (; at < length; at++) {
      code = markup.charCodeAt(at);
      if (code === 62 || code === 47 || isSpace(code)) break;
    }
    const name = markup.slice(nameAt, at).toLowerCase();

    let selfClosing = false;
    let htmlEncoded = false;
    while (at < length) {
      code = markup.charCodeAt(at);
      if (code === 62) break;
      if (code === 47 || isSpace(code)) {
        selfClosing = code === 47;
        at++;
        continue;
      }
      selfClosing = false;
      const attributeAt = at++;
      for (; at < length; at++) {
        code = markup.charCodeAt(at);
        if (code === 61 || code === 62 || code === 47 || isSpace(code)) break;
      }
      const attributeEnd = at;
      while (at < length && isSpace(markup.charCodeAt(at))) at++;
      if (markup.charCodeAt(at) !== 61) continue;
      at++;
      while (at < length && isSpace(markup.charCodeAt(at))) at++;
      const quote = markup.charCodeAt(at);
      let valueAt = at;
      let valueEnd: number;
      if (quote === 34 || quote === 39) {
        valueAt = at + 1;
        const end = markup.indexOf(quote === 34 ? '"' : "'", valueAt);
        valueEnd = end === -1 ? length : end;
        at = valueEnd + 1;
      } else {
        for (; at < length; at++) {
          code = markup.charCodeAt(at);
          if (code === 62 || isSpace(code)) break;
        }
        valueEnd = at;
      }
      if (
        name === "annotation-xml" &&
        markup.slice(attributeAt, attributeEnd).toLowerCase() === "encoding"
      ) {
        const encoding = markup.slice(valueAt, valueEnd).toLowerCase();
        htmlEncoded = encoding === "text/html" || encoding === "application/xhtml+xml";
      }
    }
    at++;

    const top = entered[entered.length - 1];
    if (closing) {
      if (top !== undefined && top.name === name) {
        entered.pop();
        ns = top.back;
      }
      continue;
    }
    if (ns === "html") {
      if (name === "svg" || name === "math") {
        if (!selfClosing) {
          entered.push({ name, back: ns });
          ns = name;
        }
      } else if (TEXT_CONTENT.has(name)) {
        at = endOfText(markup, name, at);
      } else if (top !== undefined && top.name === name) {
        entered.push({ name, back: ns });
      }
      continue;
    }
    if (selfClosing) continue;
    if (ns === "svg") {
      if (name === "foreignobject" || name === "desc" || name === "title") {
        entered.push({ name, back: ns });
        ns = "html";
      } else if (name === "svg" || (top !== undefined && top.name === name)) {
        entered.push({ name, back: ns });
      }
      continue;
    }
    if (MATH_TEXT.has(name) || (name === "annotation-xml" && htmlEncoded)) {
      entered.push({ name, back: ns });
      ns = "html";
    } else if (name === "svg" && top !== undefined && top.name === "annotation-xml") {
      entered.push({ name, back: ns });
      ns = "svg";
    } else if (
      name === "math" ||
      name === "annotation-xml" ||
      (top !== undefined && top.name === name)
    ) {
      entered.push({ name, back: ns });
    }
  }
  return found;
}

export interface RenderToStreamOptions {
  /**
   * The async session to attribute this render's keyed reads to. See
   * `renderPage`'s own option — the reason is the same and so is the default.
   */
  session?: symbol;
  /** Stops the render. The stream closes and parked boundaries keep their fallbacks. */
  signal?: AbortSignal;
  /** Applied to every inline script this render emits. */
  nonce?: CSPNonce;
  renderId?: string;
  /**
   * No seed and no input capture. The swaps stay: without them a streamed
   * boundary's content never reaches the page.
   */
  noScripts?: boolean;
  plugins?: readonly AnySerializationAdapter[];
  /** See `RenderToStringOptions.onHead`. Later declarations stream as patches. */
  onHead?: (head: string) => void;
  /** See `RenderToStringOptions.manifest`. A module that renders late streams its links. */
  manifest?: AssetManifest;
  /**
   * How long one boundary may stay parked before it is abandoned to its
   * fallback, in ms. Remix ships 5000 and React Router 4950 for the same knob.
   */
  timeout?: number;
  /**
   * Every failure the render meets, with where it was met. A shell that throws
   * is heard here with `handling: "failed"` and then thrown out of
   * `renderToStream` itself, while the caller still has a status to answer
   * with. Defaults to `console.error` for what comes after the shell.
   */
  onError?: ServerErrorHook;
  /**
   * The shell and its scripts are on the wire. `write` puts markup right after
   * them, ahead of every boundary still to come: the place for a module entry
   * that may run as soon as it loads.
   */
  onCompleteShell?: (info: { write: (markup: string) => void }) => void;
  /** Every boundary has settled or been abandoned; `write` adds the last bytes. */
  onCompleteAll?: (info: { write: (markup: string) => void }) => void;
}

/** The name it had before Solid's options. */
export type StreamOptions = RenderToStreamOptions;

/**
 * Solid's `renderToStream` result: the settled document as a promise, and the
 * bytes through `readable`, `pipe` or `pipeTo`.
 *
 * Exactly one kind of consumer. A stream consumer claims the render in the
 * tick it was started in, as `new Response(stream.readable)` does; a render no
 * stream claimed by then is settled for the promise, every boundary resumed in
 * place and the seed before `</body>`, as `renderPage` builds it. The promise
 * never rejects: a late failure with no error boundary is heard by `onError`
 * and keeps its fallback. Under a stream consumer it resolves with `""` once
 * the stream ends, because the document went out as the stream.
 */
export interface RenderToStreamResult extends Promise<string> {
  /** `Uint8Array` chunks, ready for `new Response(stream.readable)`. The same stream on every read. */
  readonly readable: ReadableStream<Uint8Array>;
  /** A Node-style writable: `write` per chunk, `end` once. */
  pipe(writable: { write: (chunk: string) => unknown; end: () => unknown }): void;
  /** Settles once the whole render has been written. */
  pipeTo(writable: WritableStream<Uint8Array>): Promise<void>;
}

/**
 * Render to a stream: the shell first, then one `<template>` per boundary as
 * its promises settle.
 *
 * The shell is rendered here, synchronously, so a shell that throws throws out
 * of this call while the caller can still answer with a status.
 */
export function renderToStream(
  fn: RootRender,
  options: RenderToStreamOptions = {},
): RenderToStreamResult {
  let job: Job;
  try {
    job = startRender(
      fn,
      { session: options.session, renderId: options.renderId, manifest: options.manifest },
      false,
    );
  } catch (error) {
    options.onError?.(error, FAILED);
    throw error;
  }
  const deadline = options.timeout ?? BOUNDARY_TIMEOUT;

  let finish!: (html: string) => void;
  const settled = new Promise<string>((resolve) => {
    finish = resolve;
  });
  let consumer: string | null = null;
  const claim = (name: string): void => {
    if (consumer !== null && consumer !== name) {
      throw new Error(
        `This \`renderToStream\` result was already consumed through \`${consumer}\` and cannot also be consumed through \`${name}\`. ` +
          "Use exactly one of `readable`, `pipe` or `pipeTo`, in the tick the render started, or await it for the settled document.",
      );
    }
    consumer = name;
  };
  queueMicrotask(() => {
    if (consumer !== null) return;
    consumer = "the promise";
    void settledDocument(job, options, deadline).then(finish);
  });
  let body: ReadableStream<Uint8Array> | null = null;
  const bytes = (): ReadableStream<Uint8Array> =>
    (body ??= streamBody(job, options, deadline, () => finish("")));

  return Object.defineProperties(settled, {
    readable: {
      get(): ReadableStream<Uint8Array> {
        claim("readable");
        return bytes();
      },
    },
    pipe: {
      value(writable: { write: (chunk: string) => unknown; end: () => unknown }): void {
        claim("pipe");
        void pump(bytes(), writable);
      },
    },
    pipeTo: {
      value(writable: WritableStream<Uint8Array>): Promise<void> {
        claim("pipeTo");
        return pumpTo(bytes(), writable);
      },
    },
  }) as RenderToStreamResult;
}

async function pump(
  stream: ReadableStream<Uint8Array>,
  writable: { write: (chunk: string) => unknown; end: () => unknown },
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      writable.write(decoder.decode(value, { stream: true }));
    }
  } catch {
    // A writable that threw has gone away; cancelling stops the render.
    await reader.cancel().catch(() => {});
  } finally {
    writable.end();
  }
}

/**
 * By hand rather than `ReadableStream.prototype.pipeTo`, which refuses a
 * writable from another realm: a server with a DOM registered has two.
 */
async function pumpTo(
  stream: ReadableStream<Uint8Array>,
  writable: WritableStream<Uint8Array>,
): Promise<void> {
  const reader = stream.getReader();
  const writer = writable.getWriter();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await writer.write(value);
    }
    await writer.close();
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    await writer.abort(error).catch(() => {});
  } finally {
    writer.releaseLock();
  }
}

async function settledDocument(
  job: Job,
  options: RenderToStreamOptions,
  deadline: number,
): Promise<string> {
  const report = reporter(options);
  try {
    const page = await settledPage(job, deadline, (error) => report(error, CLIENT), options.onHead);
    let html = page.html;
    if (options.noScripts !== true) {
      html = beforeBodyEnd(
        html,
        await seedScriptFor(page.data, scriptNonce(options.nonce), options.plugins),
      );
    }
    options.onCompleteAll?.({
      write: (markup) => {
        html += markup;
      },
    });
    return html;
  } catch (error) {
    report(error, FAILED);
    return "";
  }
}

/** React's `defaultErrorHandler`: a server that says nothing is worse than a log. */
function reporter(
  options: RenderToStreamOptions,
): (error: unknown, context: ServerErrorContext) => void {
  const onError = options.onError;
  return (error, context) => {
    if (diagnosticsEnabled()) reportContained(error);
    if (onError === undefined) console.error(error);
    else onError(error, context);
  };
}

/** The bytes of a streamed render. */
function streamBody(
  job: Job,
  options: RenderToStreamOptions,
  deadline: number,
  written: () => void,
): ReadableStream<Uint8Array> {
  const session = job.session;
  const parked = job.parked;
  const encoder = new TextEncoder();
  const nonce = scriptNonce(options.nonce);
  const scripts = options.noScripts !== true;
  const report = reporter(options);

  // Whether a failure has taken this error boundary, or one it stands in, off
  // the page: what was parked under it has nowhere left to go.
  const gone = (catcher: LateCatcher | null): boolean => {
    for (let at = catcher; at !== null; at = at.outer) {
      if (job.guards.get(at)?.failed === true) return true;
    }
    return false;
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

  const timer = setTimeout(end, deadline + STREAM_GRACE);
  // A pending timer must not be what keeps a server process alive.
  (timer as { unref?: () => void }).unref?.();

  // Keys already on the wire. A streamed render resolves values AFTER the shell
  // is gone, so the seed cannot be one script at the end the way `renderPage`'s
  // is — it is flushed incrementally, and each flush carries only what the
  // previous ones did not.
  const sent = new Set<string>();
  // Keys that went out as PROMISES. They are settled over at the end of the
  // stream — see `settleSeed`.
  const promised = new Set<string>();
  // One encoder for the whole render, so a value reachable from two keys seeded
  // in different rounds is ONE object on the client.
  const seeds = createSeedEncoder(options.plugins);
  let seededHeader = false;
  // Deferred values still being serialized. The stream stays open until this
  // reaches zero: closing on top of one drops it, and the client would wait for
  // a value that never comes rather than fetching it.
  let outstanding = 0;
  let drained: (() => void) | null = null;
  const later: string[] = [];

  /** The statements that seed what is new since the last call, or `""`. */
  const seed = (): string => {
    if (!scripts) return "";
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
    // so the client's store holds something to AWAIT rather than a hole.
    //
    // Sent ONCE, like any other key: the promise is the value, and
    // `crossSerializeStream` emits its resolution as a later statement, so a
    // second seed for the settled value would be a second copy of it.
    for (const [key, promise] of Object.entries(pendingSeedsOf(session))) {
      if (sent.has(key)) continue;
      sent.add(key);
      promised.add(key);
      fresh[key] = sanitizedFlight(promise);
      any = true;
    }
    if (!any) return "";
    const header = seededHeader ? "" : `${seeds.header};`;
    seededHeader = true;
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
    return (
      header +
      adapted(
        `window.__BARQ_DATA__=Object.assign(window.__BARQ_DATA__||{},${payload});${SEED_SETTLE_GUARD}`,
      )
    );
  };

  /**
   * The resolutions themselves. A statement here settles a promise the initial
   * payload already put in `__BARQ_DATA__`, so the read that is awaiting it
   * wakes with no channel in between.
   *
   * QUEUED WITH THE PAYLOAD when adapters deferred it. These reference `$R`
   * slots the initial payload creates, so running them ahead of it reads an
   * empty reference table — measured in Chrome as `Cannot read properties of
   * undefined (reading 's')` on the first deferred value of an adapted page.
   */
  const resolutions = (): string =>
    later.length === 0 ? "" : adapted(later.splice(0, later.length).join(";"));

  /**
   * Replace every promise still standing in the store with the value it settled
   * on, once nothing more is coming.
   *
   * A key seeded eagerly is a promise on the wire, which is the point: a read
   * that runs while the stream is open awaits it instead of refetching. But a
   * client that hydrates AFTER the stream has ended would find a promise where a
   * plain value used to be, and `.then` is asynchronous however settled the
   * promise is. Its boundary would render the FALLBACK and hydration would
   * mismatch against markup that already holds the content.
   *
   * Solid draws the same line from the other side: `Suspense.ts:147` awaits
   * `sharedConfig.load(key)` only when it is NOT already resolved.
   *
   * Encoded through the same `refs` map, so the value is a reference to what the
   * resolution statement already built rather than a second copy of it.
   */
  const settleSeed = (): string => {
    if (promised.size === 0) return "";
    const settledValues: Record<string, unknown> = {};
    let any = false;
    for (const [key, value] of Object.entries(getHydrationData(session))) {
      if (!promised.has(key)) continue;
      settledValues[key] = value;
      any = true;
    }
    if (!any) return "";
    return adapted(
      `window.__BARQ_DATA__=Object.assign(window.__BARQ_DATA__||{},${seeds.encode(settledValues)});${SEED_SETTLE_GUARD}`,
    );
  };

  let headInstalled = false;
  const headPatch = (): string => {
    const patch = job.head.patch();
    if (patch === "") return "";
    const install = headInstalled ? "" : HEAD_SNIPPET;
    headInstalled = true;
    return install + patch;
  };

  const script = (...bodies: string[]): string => {
    const joined = bodies.filter((body) => body !== "").join(";");
    return joined === "" ? "" : `<script${nonceAttr(nonce)}>${joined}</script>`;
  };

  const signal = options.signal;
  if (signal?.aborted) end();
  signal?.addEventListener("abort", end, { once: true });
  const letGo = (): void => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", end);
    release(job);
  };

  const swapCall = (id: number, ...flags: string[]): string =>
    `window.__BARQ_SWAP__(${job.renderId === "" ? String(id) : JSON.stringify(wireId(job, id))}${flags.join("")})`;

  /**
   * The swap that puts an error boundary's fallback where its content stood,
   * for a boundary below it that failed after the shell. `null` when there is
   * nothing to place: no error boundary the stream wrote stands around it, and
   * the client rebuilds it instead, where its error boundary reports it.
   */
  const placeFailure = (record: Parked, error: unknown): Swap | null => {
    const catcher = record.catcher;
    const guard = catcher === null ? undefined : job.guards.get(catcher);
    if (catcher === null || guard === undefined || !guard.streamable) return null;
    const before = parked.length;
    let shown: string;
    try {
      shown = catcher.fallback(thrownBy(error));
    } catch (fallbackError) {
      // A fallback that is not ready yet has nothing to show, the rule
      // `loadingBoundary` applies to its own.
      if (!(fallbackError instanceof NotReadyError)) throw fallbackError;
      shown = "";
    }
    guard.failed = true;
    const markup = wireOf(job, shown);
    placeParked(markup, guard.namespace, [...parked.slice(before), ...guardsIn(job, shown)], job);
    const [wrapOpen, wrapClose] = FOREIGN_WRAP[guard.namespace];
    const wrapped = guard.namespace === "html" ? "false" : "true";
    return {
      template: `<template data-barq="${wireId(job, guard.id)}">${wrapOpen}${markup}${wrapClose}</template>`,
      call: swapCall(guard.id, `,${wrapped},true`),
    };
  };

  const serialized = async (): Promise<void> => {
    if (outstanding === 0) return;
    await Promise.race([
      new Promise<void>((resolve) => {
        drained = resolve;
      }),
      stopped,
    ]);
  };

  // BACK-PRESSURE. A slow reader holds the render rather than the render
  // queueing the page in memory for it: after each chunk the work waits until
  // the consumer has room, and resumes no boundary in the meantime. The tail
  // that settles promised keys is small and is never held.
  let wake: (() => void) | null = null;
  let controllerOf: ReadableStreamDefaultController<Uint8Array> | null = null;
  const full = (target: ReadableStreamDefaultController<Uint8Array>): boolean =>
    !ended && target.desiredSize !== null && target.desiredSize <= 0;
  // Raced with `stopped`, so an abort or the deadline ends a paused render
  // without waiting for a reader that may never come back.
  const room = async (target: ReadableStreamDefaultController<Uint8Array>): Promise<void> => {
    while (full(target)) {
      await Promise.race([
        new Promise<void>((resolve) => {
          wake = resolve;
        }),
        stopped,
      ]);
    }
  };
  let closed = false;
  const enqueue = (text: string): void => {
    // A consumer that left has closed the stream, and enqueueing throws.
    if (text === "" || consumerCancelled || closed || controllerOf === null) return;
    controllerOf.enqueue(encoder.encode(text));
  };
  const send = async (
    target: ReadableStreamDefaultController<Uint8Array>,
    text: string,
  ): Promise<void> => {
    enqueue(text);
    await room(target);
  };

  const finish = async (): Promise<void> => {
    // Deferred values, if any are still in flight. Closing on top of one
    // drops it, and a client waiting on that key would wait for a value
    // that never comes instead of fetching it — so the stream is held open,
    // bounded by the same `stopped` promise everything else here is.
    await serialized();
    // Nothing more is coming. Every key still in flight is settled with a
    // marker rather than left pending, so the client read waiting on it falls
    // back to fetching instead of waiting for a value that will never arrive —
    // per key rather than as one global flag, so only the reads whose keys were
    // abandoned fall back.
    abandonPendingSeeds(session);
    await serialized();
    // A group whose earlier boundary was abandoned shows the rest at the end
    // rather than never.
    for (const members of job.groups.values()) for (const member of members) take(member);
    if (revealed.length > 0) {
      const late = revealed.splice(0, revealed.length);
      enqueue(
        late.map((swap) => swap.template).join("") +
          script(late.map((swap) => swap.call).join(";")),
      );
    }
    enqueue(script(resolutions()));
    if (!consumerCancelled) enqueue(script(settleSeed()));
    options.onCompleteAll?.({ write: enqueue });
  };

  // `<Reveal>`: a boundary's swap waits for the ones its group puts before it.
  const held = new Map<Parked, Swap | null>();
  const revealed: Swap[] = [];
  const reveal = (record: Parked, swap: Swap | null): void => {
    const group = record.group;
    const members = group === null ? undefined : job.groups.get(group);
    if (group === null || members === undefined || group.order === "natural") {
      if (swap !== null) revealed.push(swap);
      return;
    }
    held.set(record, swap);
    if (group.order === "together") {
      if (!members.every((member) => held.has(member) || job.inlined.has(member))) return;
      for (const member of members) take(member);
      return;
    }
    for (const member of members) {
      if (job.inlined.has(member)) continue;
      if (!held.has(member)) return;
      take(member);
    }
  };
  const take = (member: Parked): void => {
    const swap = held.get(member);
    if (swap !== undefined && swap !== null) revealed.push(swap);
    held.set(member, null);
  };

  const run = async (controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> => {
    controllerOf = controller;
    try {
      await inlineSettled(job, signal);
      const shell = wireOf(job, withHead(job.shell, job.head, options.onHead));
      placeParked(shell, "html", [...parked, ...job.guardsById.values()], job);
      // The status is settled from here: these bytes are gone and nothing
      // after them can change the response line.
      enqueue(shell);
      // What the browser needs before anything of the application runs, in
      // ONE script right after the shell and ahead of `onCompleteShell`'s
      // writes: input capture, the values the shell resolved, and the swap
      // every boundary below calls. A module entry written after it may run as
      // soon as it loads, and finds them all in place.
      enqueue(
        script(scripts ? EVENT_CAPTURE_SNIPPET : "", seed(), parked.length > 0 ? SWAP_SNIPPET : ""),
      );
      options.onCompleteShell?.({ write: enqueue });
      await room(controller);
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
        const again: Parked[] = [];
        const swaps: Swap[] = [];
        for (const record of round) {
          if (ended) {
            again.push(record);
            continue;
          }
          if (gone(record.catcher)) continue;
          const before = parked.length;
          const restore = setAsyncSession(session);
          const outerSink = setStreamSink(job.sink);
          const outerHead = setHeadSink(job.head.sink);
          let built: string | null = null;
          try {
            built = record.resume();
          } catch (error) {
            if (error instanceof NotReadyError) {
              // Still unready, so it goes back on the queue. Past its own
              // deadline it is abandoned rather than requeued, and the
              // fallback the shell already flushed stands.
              record.parkedOn = error;
              if (Date.now() - record.at < deadline) again.push(record);
            } else {
              // ONE boundary failed, and that is all that failed: every other
              // boundary on the page is still owed its content. The error
              // boundary around it shows its fallback in place of all it held;
              // with none the stream wrote, the boundary keeps the fallback the
              // shell flushed and the client rebuilds it.
              const failed = placeFailure(record, error);
              report(thrownBy(error), failed === null ? CLIENT : FALLBACK);
              if (failed !== null) swaps.push(failed);
              reveal(record, null);
            }
          } finally {
            setStreamSink(outerSink);
            setHeadSink(outerHead);
            setAsyncSession(restore);
          }
          if (built === null) continue;
          const markup = wireOf(job, built);
          placeParked(
            markup,
            record.namespace,
            [...parked.slice(before), ...guardsIn(job, built)],
            job,
          );
          const [wrapOpen, wrapClose] = FOREIGN_WRAP[record.namespace];
          reveal(record, {
            template: `<template data-barq="${wireId(job, record.id)}">${wrapOpen}${markup}${wrapClose}</template>`,
            call: swapCall(record.id, record.namespace === "html" ? "" : ",true"),
          });
        }
        swaps.push(...revealed.splice(0, revealed.length));
        // Boundaries parked BY this round are already in `parked`; the ones
        // that merely stayed unready go in front of them.
        if (again.length > 0) parked.unshift(...again);
        // Asked BEFORE anything waits for the reader. A flight that lands while
        // the render is paused is still one these boundaries were waiting on,
        // and asked afterwards it reads as nothing in the air.
        const step =
          parked.length === 0
            ? null
            : Promise.race([settleStep(session, flightsOf(parked)), stopped]);
        // A round is ONE script after its templates: the swaps, then the values
        // they read. A client that hydrated at shell time adopts the swapped
        // nodes when those values wake its boundary, and the two arriving in
        // one script means no task can run between the markup and its data.
        await send(
          controller,
          swaps.map((swap) => swap.template).join("") +
            script(swaps.map((swap) => swap.call).join(";"), headPatch(), seed(), resolutions()),
        );
        if (step === null || (await step) !== true) break;
      }
    } catch (error) {
      // NEVER `controller.error` here, and that is the whole policy. Anything
      // thrown in this function is POST-SHELL by construction — the shell is
      // rendered before the stream exists, so a shell failure propagates out
      // of `renderToStream` and the caller can still answer with a 500.
      //
      // Tearing the body now hands the client a truncated document with no
      // error UI and no way to recover, when the bytes it already has are a
      // VALID page showing fallbacks.
      report(error, CLIENT);
    } finally {
      // The tail runs however the loop ended. What it owes does not depend on
      // why: a client holding a promise for a key is waiting on this stream to
      // settle it or to say it never will.
      try {
        await finish();
      } catch (error) {
        report(error, CLIENT);
      } finally {
        if (!consumerCancelled) {
          closed = true;
          try {
            controller.close();
          } catch {
            // Already closed, or errored by the consumer; nothing to answer to.
          }
        }
        letGo();
        written();
      }
    }
  };

  return new ReadableStream<Uint8Array>({
    // Returns at once: the stream calls `pull` only after `start` has settled,
    // and `pull` is what lets a paused render go on.
    start(controller): void {
      void run(controller);
    },
    pull(): void {
      const resume = wake;
      wake = null;
      resume?.();
    },
    // A consumer that goes away stops the work. Without this the render runs to
    // completion against a socket nobody is reading — which on AWS Lambda is
    // billed for the full function duration, because a streamed response is not
    // interrupted when the invoking client connection breaks.
    cancel(): void {
      consumerCancelled = true;
      end();
    },
  });
}

/**
 * Put into the shell every boundary whose values are already there.
 *
 * A read that has settled, or settles within a few microtask turns, is not
 * worth a fallback, a template and a script: a loader that answered
 * synchronously, a cache hit. Waiting on anything slower than that is what
 * streaming exists to avoid, so this asks `settleStep` with a budget of
 * microtasks and stops the moment a round brings nothing.
 */
async function inlineSettled(job: Job, signal: AbortSignal | undefined): Promise<void> {
  for (let round = 0; round < SHELL_ROUNDS && job.parked.length > 0; round++) {
    if (signal?.aborted === true) return;
    const stepped = await Promise.race([
      settleStep(job.session, flightsOf(job.parked)),
      microtasks(SHELL_TURNS),
    ]);
    if (stepped !== true) return;
    const waiting = job.parked.splice(0, job.parked.length);
    const again: Parked[] = [];
    let resumed = false;
    for (const record of waiting) {
      if (!inlinable(job, record)) {
        again.push(record);
        continue;
      }
      const restore = setAsyncSession(job.session);
      const outerSink = setStreamSink(job.sink);
      const outerHead = setHeadSink(job.head.sink);
      let built: string | null = null;
      try {
        built = record.resume();
      } catch (error) {
        // Unready, or failed: either way the stream's own rounds answer it,
        // with a template or with the error boundary's fallback.
        if (error instanceof NotReadyError) record.parkedOn = error;
        again.push(record);
      } finally {
        setStreamSink(outerSink);
        setHeadSink(outerHead);
        setAsyncSession(restore);
      }
      if (built === null) continue;
      resumed = true;
      job.inlined.add(record);
      const content = record.hydrate ? `<!--[-->${built}<!--]-->` : built;
      job.shell = replaceBetween(job.shell, record.open, record.close, () => content);
    }
    job.parked.unshift(...again);
    if (!resumed) return;
  }
}

/**
 * Whether the shell may show this boundary now: a `sequential` group's member
 * only once every one before it is in the shell too, and a `together` group's
 * never, since the rest of the group is what it waits for.
 */
function inlinable(job: Job, record: Parked): boolean {
  const group = record.group;
  if (group === null || group.order === "natural") return true;
  if (group.order === "together") return false;
  for (const member of job.groups.get(group) ?? []) {
    if (member === record) return true;
    if (!job.inlined.has(member)) return false;
  }
  return true;
}

/** Rounds of `inlineSettled`: a boundary resumed into the shell may park one of its own. */
const SHELL_ROUNDS = 4;

/** What an already-settled read needs to reach the engine, and no macrotask. */
const SHELL_TURNS = 8;

function microtasks(turns: number): Promise<"idle"> {
  let chain: Promise<unknown> = Promise.resolve();
  for (let turn = 0; turn < turns; turn++) chain = chain.then(() => {});
  return chain.then(() => "idle" as const);
}

interface Swap {
  template: string;
  call: string;
}

/** The guards whose markers stand in `markup`, the ones a resume just wrote. */
function guardsIn(job: Job, markup: string): Guard[] {
  const out: Guard[] = [];
  if (!markup.includes(job.stamp)) return out;
  for (const match of markup.matchAll(job.markers)) {
    if (match[1] !== "[" || match[2] !== "e") continue;
    const guard = job.guardsById.get(Number(match[3]));
    if (guard !== undefined) out.push(guard);
  }
  return out;
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
 * queue at all, which is the rule it exists for.
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
const CAPTURED_EVENTS: readonly string[] = [
  "click",
  "dblclick",
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "touchstart",
  "touchend",
  "contextmenu",
  "keydown",
  "keyup",
  "keypress",
  "input",
  "change",
  "focusin",
];

/**
 * Installed once per document: a page whose head carries `HydrationScript` and
 * whose stream writes the capture again after the shell keeps the queue the
 * first one filled.
 */
function eventCapture(eventNames: readonly string[] = CAPTURED_EVENTS): string {
  return (
    "if(!window.__BARQ_EVTS_STOP__){window.__BARQ_EVTS__=[];window.__BARQ_EVTS_STOP__=(function(){" +
    "var q=window.__BARQ_EVTS__;" +
    `var ts=${JSON.stringify(eventNames).replaceAll("<", "\\u003c")};` +
    "var p=function(n){var a=[];while(n&&n!==document.body){var i=0;var s=n;while((s=s.previousSibling))i++;a.unshift(i);n=n.parentNode}return n?a:[]};" +
    "var st=function(t){if(!t||t.value===undefined)return;" +
    "q.push({type:'@state',node:t,path:p(t),value:t.value,checked:t.checked,start:t.selectionStart===null?undefined:t.selectionStart,end:t.selectionEnd===null?undefined:t.selectionEnd,focus:document.activeElement===t,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false})};" +
    "var h=function(e){var t=e.target;" +
    "if(e.type==='input'||e.type==='change'||e.type==='focusin')st(t);" +
    "if(e.type==='focusin')return;" +
    "q.push({type:e.type,node:t,path:p(t),x:e.clientX,y:e.clientY,button:e.button,key:e.key,code:e.code,ctrlKey:!!e.ctrlKey,metaKey:!!e.metaKey,shiftKey:!!e.shiftKey,altKey:!!e.altKey})};" +
    "ts.forEach(function(t){document.addEventListener(t,h,true)});" +
    "return function(){ts.forEach(function(t){document.removeEventListener(t,h,true)})}})()}"
  );
}

const EVENT_CAPTURE_SNIPPET = eventCapture();

/**
 * Mark every seeded promise as handled, the moment it exists.
 *
 * A DEFERRED value is on the wire as a promise the stream settles later, and a
 * loader that threw settles it by REJECTING. The consumer is `hydrate()`, which
 * runs from a module script — deferred by definition, so it runs after the
 * document has been parsed and therefore after the rejection chunk at the end
 * of the body has already run. For that window the rejected promise has no
 * handler, and the browser reports an unhandled rejection: a console error on
 * every streamed page whose loader failed, and a spurious event for anything
 * listening on `unhandledrejection` to report crashes.
 *
 * `then(null, noop)` marks it handled without consuming it — the value is still
 * there for the read that claims it, and its rejection still reaches the route's
 * error boundary through the read. Emitted after every assignment because a
 * streamed page adds keys as it goes.
 *
 * IT WALKS, and a top-level sweep was not enough. Deferred data's ordinary
 * shape is a promise INSIDE the loader's value — `{ fastData, slowData }`, which
 * is the shape `<Await>` exists for — so the keys of `__BARQ_DATA__` are objects
 * and the promise is one level down. Measured in a real browser against a
 * loader whose deferred half rejects: the page rendered its error boundary
 * correctly and the console still carried an unhandled rejection.
 *
 * The walk is the client's half of `settleNested` and stops in the same places:
 * plain objects and arrays only, and a cycle is visited once.
 */
/**
 * The reviver an adapted value's seed calls, and the buffer that makes it work.
 *
 * THE ORDERING PROBLEM. `fromSerializable` is a closure in the application's
 * bundle, so an emitted seed can only NAME it — and the seed is an inline
 * script that runs while the client entry, a module, has not evaluated yet. At
 * that moment no adapter is registered and the value would rebuild as its
 * reduced form, silently and one call away from where it matters.
 *
 * So the whole seed ASSIGNMENT is deferred rather than any single value: the
 * script pushes a thunk, and `startClient` drains the queue once the adapters
 * are in. A chunk that arrives after that runs immediately, which is what makes
 * a streamed page work — its later seeds land long after hydration began.
 * TanStack buffers at the same point and for the same reason
 * (`load-client.ts:2163`).
 *
 * EMITTED ONLY WHEN AN ADAPTER IS REGISTERED. A seed is the most delicate thing
 * this file writes, and an application with no adapters gets the same bytes it
 * got before any of this existed.
 */
const ADAPTER_BOOTSTRAP =
  "window.__BARQ_SEED__=window.__BARQ_SEED__||{ready:false,q:[]," +
  "push:function(f){if(this.ready){f()}else{this.q.push(f)}}," +
  "drain:function(){this.ready=true;var q=this.q;this.q=[];" +
  "q.forEach(function(f){f()})}};" +
  "window.__BARQ_ADAPTERS__=window.__BARQ_ADAPTERS__||new Map;" +
  "window.__BARQ_REVIVE__=window.__BARQ_REVIVE__||function(k,v){" +
  "var f=window.__BARQ_ADAPTERS__.get(k);return f?f(v):v};";

const SEED_SETTLE_GUARD =
  "(function(){var s=[];var w=function(v){" +
  "if(!v||typeof v!=='object')return;" +
  "if(typeof v.then==='function'){v.then(null,function(){});return}" +
  "if(s.indexOf(v)!==-1)return;s.push(v);" +
  "if(Array.isArray(v)){v.forEach(w);return}" +
  "if(Object.getPrototypeOf(v)!==Object.prototype)return;" +
  "for(var k in v)w(v[k])};w(window.__BARQ_DATA__)})()";

function hydrationScriptFor(
  data: Record<string, unknown>,
  nonce: string | undefined,
  plugins: readonly AnySerializationAdapter[] | undefined,
): string {
  return (
    `<script${nonceAttr(nonce)}>${adapted(`window.__BARQ_DATA__=${encodeSeed(data, plugins)};${SEED_SETTLE_GUARD};`)}` +
    `${EVENT_CAPTURE_SNIPPET}</script>`
  );
}

/**
 * The seed's assignment, deferred when an adapter could be needed to build it.
 *
 * The guard rides INSIDE the thunk: it walks `__BARQ_DATA__` to mark promises
 * handled, and there is nothing to walk until the assignment has run.
 */
function adapted(assignment: string): string {
  if (serializationAdapters().length === 0) return assignment;
  return `${ADAPTER_BOOTSTRAP}window.__BARQ_SEED__.push(function(){${assignment}});`;
}

/**
 * The seed for a BUFFERED page, which is one script and has no later chunk.
 *
 * `settleNested` has already replaced every deferred promise with what it
 * settled on, so the ordinary path is a plain `serialize` and nothing here
 * runs. What survives it is a promise that REJECTED: there is no settled value
 * to inline, and the client has to find a rejected promise where the streamed
 * arm would have sent one — its boundary already rendered the error, and a
 * settled value there would hydrate different markup.
 *
 * `crossSerialize` refuses a promise outright, so that case takes the streaming
 * encoder and waits for it. Every statement it produces goes in the same script
 * rather than in a later chunk, which is the only difference between the two
 * arms once the encoder is the same.
 */
async function seedScriptFor(
  data: Record<string, unknown>,
  nonce: string | undefined,
  plugins: readonly AnySerializationAdapter[] | undefined,
): Promise<string> {
  const seeds = createSeedEncoder(plugins);
  if (!seeds.hasPending(data)) return hydrationScriptFor(data, nonce, plugins);

  const later: string[] = [];
  let finish!: () => void;
  // Built before `encodeDeferred` runs, because `onDone` may fire during it.
  const drained = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const initial = seeds.encodeDeferred(data, (statement) => later.push(statement), finish);
  await drained;
  const statements = later.length === 0 ? "" : `${later.join(";")};`;
  return (
    `<script${nonceAttr(nonce)}>${seeds.header};` +
    adapted(
      `window.__BARQ_DATA__=Object.assign(window.__BARQ_DATA__||{},${initial});` +
        `${statements}${SEED_SETTLE_GUARD};`,
    ) +
    `${EVENT_CAPTURE_SNIPPET}</script>`
  );
}

/**
 * Every inline script a render emits carries the caller's nonce, or none of
 * them do. A streamed page emits at least three — the swap snippet, one swap
 * per resumed boundary, and the seed — so without this the page needs
 * `script-src 'unsafe-inline'`, which is the directive CSP exists to avoid.
 */
function nonceAttr(nonce?: string): string {
  return nonce === undefined || nonce === "" ? "" : ` nonce="${escapeAttribute(nonce)}"`;
}

/**
 * Solid's `CSPNonce`. Only `script-src` and `style-src` match a nonce, so a
 * page whose policy gives the two different values names both.
 */
export type CSPNonce = string | { readonly script?: string; readonly style?: string };

export function scriptNonce(nonce: CSPNonce | undefined): string | undefined {
  return typeof nonce === "string" ? nonce : nonce?.script;
}

export function styleNonce(nonce: CSPNonce | undefined): string | undefined {
  return typeof nonce === "string" ? nonce : nonce?.style;
}

/**
 * Solid's `generateHydrationScript`: the bootstrap a hand-built document puts
 * ahead of the application, which captures input made before `hydrate` runs so
 * it can be replayed onto the claimed nodes.
 *
 * It carries no render's data. A render's seed is its own and is returned by
 * that render (`renderPage`'s `script`, the stream's chunks); an answer from
 * this function that held one would be whichever render finished last, which
 * on a server with two requests in flight is another user's.
 */
export function generateHydrationScript(options?: {
  nonce?: CSPNonce;
  eventNames?: readonly string[];
}): string {
  return `<script${nonceAttr(scriptNonce(options?.nonce))}>${eventCapture(options?.eventNames)}</script>`;
}

/** The same bootstrap as markup the string backend writes where it stands. */
export function HydrationScript(props?: {
  nonce?: CSPNonce;
  eventNames?: readonly string[];
}): SsrHtml {
  return ssrHtml(generateHydrationScript(props));
}

export { settle };
