/**
 * Server-side rendering.
 *
 * Renders through the same component stack as the client against an
 * ambient DOM implementation (`document` must exist - e.g. happy-dom's
 * GlobalRegistrator on a Bun/Node server). Text goes through real text
 * nodes, so HTML injection is escaped by construction.
 *
 * Async flow: components read keyed async values (createAsync with
 * `key`); renderToStringAsync settles the graph, Loading boundaries swap
 * to content, and the resolved values are captured for the client via
 * generateHydrationScript - hydrate() then resolves them synchronously
 * without refetching.
 */

import type { JSXElement } from "./dom.ts";
import { isSsrHtml, render } from "./dom.ts";
import {
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
    // renders with no DOM at all. Anything else — including a module that fell
    // back to the DOM backend for DESIGN §5's eight non-inlinable flow
    // components — goes through the ambient DOM as before.
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
    // The string backend has no Loading boundary to swap in place, so the
    // settled values are read by rendering a second time. Keyed `createAsync`
    // results are cached against the session, so nothing is fetched twice.
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
 * Inline pre-hydration event capture: pointer-style interactions that land
 * before the bundle hydrates are recorded (as coordinates - the nodes get
 * replaced) and replayed by hydrate(). Keyboard/input events can't be
 * replayed faithfully across node replacement and are not captured.
 */
const EVENT_CAPTURE_SNIPPET =
  "window.__BARQ_EVTS__=[];window.__BARQ_EVTS_STOP__=(function(){" +
  'var q=window.__BARQ_EVTS__;var ts=["click","dblclick","pointerdown","pointerup","mousedown","mouseup","touchstart","touchend","contextmenu"];' +
  "var h=function(e){q.push({type:e.type,x:e.clientX,y:e.clientY,button:e.button,ctrlKey:e.ctrlKey,metaKey:e.metaKey,shiftKey:e.shiftKey,altKey:e.altKey})};" +
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
