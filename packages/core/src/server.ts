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

import type { JSXElement } from "./dom.ts";
import { isSsrHtml, render } from "./dom.ts";
import type { Block, Scope } from "./scope.ts";
import { type StreamSink, esc, resumeDeferred, setStreamSink } from "./ssr.ts";
import {
  NotReadyError,
  clearHydrationData,
  createScope,
  flush,
  getHydrationData,
  setAsyncSession,
  settle,
} from "./signals.ts";

/**
 * Render synchronously to an HTML string. Pending async values render
 * their Loading fallbacks; use renderToStringAsync to wait for them.
 */
export function renderToString(fn: () => JSXElement): string {
  let container: HTMLElement | null = null;
  let markup: string | null = null;
  let dispose!: () => void;

  createScope((d) => {
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
): Promise<{ html: string; data: Record<string, unknown>; script: string }> {
  const session = Symbol("render-session");
  let dispose!: () => void;
  let container: HTMLElement | null = null;
  let stringMode = false;
  let markup = "";

  const prev = setAsyncSession(session);
  try {
    createScope((d) => {
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
    setAsyncSession(prev);
  }

  // Session-scoped: concurrent renders don't wait on each other's fetches
  await settle(session);

  if (stringMode) {
    // A string boundary has no later frame to swap content into, so the settled
    // values are read by rendering a second time. Keyed `computed` results
    // are cached against the session, so nothing is fetched twice.
    // `renderToStream` is the other answer: it parks the content Block instead
    // of re-running the page.
    const restore = setAsyncSession(session);
    try {
      let second!: () => void;
      createScope((d) => {
        second = d;
        const settled = fn();
        markup = isSsrHtml(settled) ? settled.t : typeof settled === "string" ? settled : "";
      }, true);
      flush();
      second();
    } finally {
      setAsyncSession(restore);
    }
  }

  const html = stringMode ? markup : ((container as HTMLElement | null)?.innerHTML ?? "");
  const data = getHydrationData(session);
  clearHydrationData(session);
  lastRenderData = data;
  dispose();

  return { html, data, script: hydrationScriptFor(data) };
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
  for (let i = dead.length; i--; ) dead[i].parentNode?.removeChild(dead[i]);
  open.parentNode?.insertBefore(t.content, node);
  open.data = "[0";
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
export function renderToStream(fn: () => JSXElement): ReadableStream<Uint8Array> {
  const session = Symbol("stream-session");
  const encoder = new TextEncoder();
  const parked: Continuation[] = [];
  let next = 0;
  const sink: StreamSink = {
    defer(body: Block<unknown>, scope: Scope | null): number {
      const id = next++;
      parked.push({ id, body, scope });
      return id;
    },
  };

  let dispose!: () => void;
  let shell = "";

  const previousSession = setAsyncSession(session);
  const previousSink = setStreamSink(sink);
  try {
    createScope((d) => {
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
    async start(controller): Promise<void> {
      try {
        controller.enqueue(encoder.encode(shell));
        if (parked.length > 0) {
          controller.enqueue(encoder.encode(`<script>${SWAP_SNIPPET}</script>`));
        }
        // A resumed boundary may park boundaries of its own, so the queue is
        // drained rather than iterated once.
        while (parked.length > 0) {
          const batch = parked.splice(0, parked.length);
          await settle(session);
          for (const record of batch) {
            const restore = setAsyncSession(session);
            const outerSink = setStreamSink(sink);
            let markup: string;
            try {
              markup = resumeDeferred(record.body, record.scope);
            } catch (error) {
              // A boundary that still cannot resolve keeps the fallback the
              // shell already flushed. Recovery is the point, not perfection.
              markup = "";
              if (!(error instanceof NotReadyError)) throw error;
            } finally {
              setStreamSink(outerSink);
              setAsyncSession(restore);
            }
            if (markup === "") continue;
            controller.enqueue(
              encoder.encode(
                `<template data-barq="${record.id}">${markup}</template>` +
                  `<script>window.__BARQ_SWAP__(${record.id})</script>`,
              ),
            );
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        dispose();
      }
    },
  });
}

/**
 * Make a JSON payload safe to inline inside a <script> element:
 * escapes characters that could close the tag or open markup.
 */
function escapeScriptPayload(json: string): string {
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
 * Claiming preserves the node, so the target is recorded as a PATH of child
 * indices and resolves to the same element after hydration. That is what puts
 * `keydown` and the typed value and the caret position in the queue at all;
 * `SEMANTICS.md` H6 is the rule it exists for. The coordinates are still
 * recorded, as the fallback for the recovered case — a page that had to be
 * re-rendered cold has no stable path, and a pointer event can still find its
 * way by `elementFromPoint`.
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
  "q.push({type:'@state',path:p(t),value:t.value,checked:t.checked,start:t.selectionStart===null?undefined:t.selectionStart,end:t.selectionEnd===null?undefined:t.selectionEnd,focus:document.activeElement===t,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false})};" +
  "var h=function(e){var t=e.target;" +
  "if(e.type==='input'||e.type==='change'||e.type==='focusin')st(t);" +
  "if(e.type==='focusin')return;" +
  "q.push({type:e.type,path:p(t),x:e.clientX,y:e.clientY,button:e.button,key:e.key,code:e.code,ctrlKey:!!e.ctrlKey,metaKey:!!e.metaKey,shiftKey:!!e.shiftKey,altKey:!!e.altKey})};" +
  "ts.forEach(function(t){document.addEventListener(t,h,true)});" +
  "return function(){ts.forEach(function(t){document.removeEventListener(t,h,true)})}})();";

function hydrationScriptFor(data: Record<string, unknown>): string {
  const payload = escapeScriptPayload(JSON.stringify(data));
  return `<script>window.__BARQ_DATA__=${payload};${EVENT_CAPTURE_SNIPPET}</script>`;
}

/**
 * Inline script transferring server-resolved async data to the client.
 * Reflects the most recent renderPage/renderToStringAsync; concurrent
 * servers should use the `script` returned by renderPage instead.
 * Place it before the bundle that calls hydrate().
 */
export function generateHydrationScript(): string {
  return hydrationScriptFor(lastRenderData);
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
