/**
 * Testing what the browser actually does with a server-rendered page.
 *
 * `grep -c hydrate packages/testing/src/index.ts` was `0`, so every suite that
 * needed this hand-rolled it. `packages/router/src/server.test.ts`'s `hydration`
 * describe is the one that got it right, and this is that harness with the
 * router taken out of it.
 *
 * WHY TWO COMPONENTS. A barq module is compiled for ONE side: the string backend
 * emits markup and the DOM backend emits node-building code, and they are
 * different lowerings of the same source. In an application the compiler
 * produces both from one file; inside a single test process there is only one
 * compilation, so a hydration test has to supply both halves itself. Handing the
 * same function twice does not work and fails in a way worth naming — a DOM
 * render's `innerHTML` carries none of the `<!--[-->` range markers the string
 * backend writes, so the walk finds nothing to claim and rebuilds silently.
 *
 * THE MEASURE IS NODE IDENTITY, NOT MARKUP. A component behind a cold `lazy()`
 * parks its boundary and REBUILDS, which produces markup identical to the
 * server's — so a test comparing HTML passes at exactly the moment hydration
 * threw the server's work away. `kept` counts the server's own nodes that are
 * still in the tree afterwards, by reference.
 */

import { flush, hydrate } from "@barqjs/core";
import type { JSXElement } from "@barqjs/core";
import { type SsrHtml, renderToString } from "@barqjs/server";

import type { Ui } from "./types.ts";

/** What `hydrate` recorded, plus what survived it. */
export interface HydrationResult {
  /** The markup the server half produced, before the walk touched it. */
  readonly html: string;
  readonly container: HTMLElement;
  /** Ranges the walk claimed. Zero means it rebuilt the page. */
  readonly claimed: number;
  /** Every divergence the walk recorded, with its kind. */
  readonly mismatches: readonly { kind: string; detail: string }[];
  /** Whether the walk gave up and re-rendered from scratch. */
  readonly recovered: boolean;
  /** Server nodes still in the tree, by REFERENCE. */
  readonly kept: number;
  /** How many the server wrote. */
  readonly total: number;
  /** `kept / total`, or 1 when the server wrote nothing. */
  readonly reuse: number;
  readonly unmount: () => void;
}

export interface HydrateOptions {
  /**
   * The server half — a module compiled by the string backend, or any function
   * `renderToString` accepts.
   *
   * `SsrHtml` is in the union because `html()` is how a test writes the server
   * half by hand, and it is what a string-compiled module returns.
   */
  readonly server: () => JSXElement | SsrHtml;
  /** The client half: the DOM-compiled component that claims what the server wrote. */
  readonly client: Ui;
  /**
   * The seed script's PAYLOAD, without its `<script>` wrapper.
   *
   * A loader's result travels in one, and a client that does not receive it
   * re-runs the loader — which a test asserting "the loader ran once" has to be
   * able to tell apart from a hydration failure.
   */
  readonly seed?: string;
  /** Defaults to a fresh `<div>` appended to `document.body`. */
  readonly container?: HTMLElement;
}

/**
 * Server-render, install the seed, hydrate, and report what survived.
 *
 * `flush()` before reading the report, because the walk claims synchronously but
 * the effects that read the claimed nodes run on the microtask queue.
 */
export function renderAndHydrate(options: HydrateOptions): HydrationResult {
  const html = renderToString(options.server);

  if (options.seed !== undefined) installSeed(options.seed);

  const container = options.container ?? document.body.appendChild(document.createElement("div"));
  container.innerHTML = html;

  // BEFORE the walk. Afterwards the same query answers with whatever is in the
  // tree, which is exactly the thing being measured and cannot be its own
  // baseline.
  const written = [...container.querySelectorAll("*")];

  hydrate(options.client as never, container);
  flush();

  const kept = written.filter((node) => container.contains(node)).length;
  const report = hydrate.report;

  return {
    html,
    container,
    claimed: report.claimed,
    mismatches: report.mismatches.map((one) => ({ kind: one.kind, detail: one.detail })),
    recovered: report.recovered,
    kept,
    total: written.length,
    reuse: written.length === 0 ? 1 : kept / written.length,
    unmount: () => {
      container.remove();
    },
  };
}

/**
 * Run a seed payload the way a browser runs the script tag carrying it.
 *
 * `window.` is rewritten to `globalThis.` because happy-dom registers a
 * `window` that is not the module's global object, so a payload assigning
 * `window.X` lands somewhere the code reading `globalThis.X` cannot see. That
 * is the same rewrite `server.test.ts` does, and the reason is worth keeping
 * next to it rather than rediscovering.
 */
export function installSeed(payload: string): void {
  const script = payload
    .replace(/^<script[^>]*>/, "")
    .replace(/<\/script>$/, "")
    .replaceAll("window.", "globalThis.");
  // oxlint-disable-next-line no-eval -- running a seed IS what this reproduces
  (0, eval)(script);
}
