/**
 * The STREAMING half of the hydration oracle.
 *
 * `hydration.ts` renders a fixture's string module in one shot and hydrates over
 * the result. That is the buffered page, and it is the easy one: every byte
 * exists before the client sees any of it.
 *
 * A streamed page is assembled instead — a shell, then one `<template>` per
 * boundary as its promises settle, each followed by the script that swaps it
 * into place. Nothing in this repo had ever hydrated one, so "streaming works"
 * and "hydration works" were two facts with no proof that they COMPOSE.
 *
 * What this file provides is the assembly, done the way a browser does it:
 * chunks appended to a live document in arrival order, with each chunk's inline
 * scripts executed before the next chunk lands. `innerHTML` does not run a
 * script, so running them here is not a cheat — it is the parser's job, and
 * `swapDeferredRange` IS the shipped snippet rather than a paraphrase of one
 * (`SWAP_SNIPPET` is its `toString()`).
 */

import type { FixtureModule } from "./harness.ts";

/** Everything `renderToStream` produced, in order. */
export async function chunksOf(mod: FixtureModule): Promise<string[]> {
  const server = await import("@barqjs/server");
  // A SHORT deadline, because the corpus contains fixtures whose promise never
  // settles by design — `renderToStream`'s production default is 5 s plus a 1 s
  // grace, and 143 fixtures against that is a suite nobody runs. What is being
  // measured is the assembly, not the clock: every fixture that settles at all
  // settles on a `tick`.
  const stream = server.renderToStream(
    (() => (mod.default as unknown as (s: unknown) => unknown)(null)) as never,
    { timeout: 150 },
  );
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const out: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.push(decoder.decode(value));
  }
  return out;
}

/** The inline scripts of one chunk, in document order. */
function scriptsOf(chunk: string): string[] {
  return [...chunk.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? "");
}

/** The same chunk with its scripts removed, so appending it does not re-add them. */
function withoutScripts(chunk: string): string {
  return chunk.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
}

export interface Assembled {
  /** How many chunks the stream produced. One means nothing deferred. */
  chunks: number;
  /** How many boundaries were swapped in after the shell. */
  swaps: number;
  /** How many `<template data-barq>` payloads arrived. Must equal `swaps`. */
  templates: number;
}

/**
 * Assemble a streamed page into `container`, as a browser would.
 *
 * The container must already be in the document: `swapDeferredRange` walks
 * `document.body` for the boundary comment and `document.querySelector`s for the
 * template, which is what makes this the shipped path rather than a test-only
 * one.
 */
export async function assemble(mod: FixtureModule, container: HTMLElement): Promise<Assembled> {
  const chunks = await chunksOf(mod);
  let swaps = 0;
  let templates = 0;

  const run = (source: string): void => {
    if (source.trim() === "") return;
    if (/__BARQ_SWAP__\(/.test(source)) swaps++;
    // Indirect eval, so the snippet runs in global scope exactly as a
    // `<script>` would — `swapDeferredRange` closes over nothing for this
    // reason and says so at its definition.
    (0, eval)(source);
  };

  for (const [index, chunk] of chunks.entries()) {
    templates += (chunk.match(/<template data-barq=/g) ?? []).length;
    if (index === 0) {
      container.innerHTML = withoutScripts(chunk);
    } else {
      // `insertAdjacentHTML`, never `innerHTML +=`: the second reparses the
      // whole container and destroys every node identity already in it, which
      // would make the reuse census measure the assembly rather than hydration.
      container.insertAdjacentHTML("beforeend", withoutScripts(chunk));
    }
    for (const source of scriptsOf(chunk)) run(source);
  }

  return { chunks: chunks.length, swaps, templates };
}

/**
 * The STREAMING corpus, written here rather than added to `fixtures/`.
 *
 * The shared corpus contains no fixture that defers a boundary and later settles
 * it — `control-flow-await-suspense`'s resource never resolves, by design — so
 * every streaming property measured over it is vacuous. The oracle's own guard
 * says so out loud rather than passing quietly.
 *
 * These live here because a `fixtures/` entry is enumerated by six other oracles
 * with per-fixture registered rows (effect counts, the ownership census, the
 * optimality targets). A fixture whose only purpose is to make a promise settle
 * on a macrotask would owe all of them a row, and none of those rows would mean
 * anything.
 *
 * Each source settles on `setTimeout(…, 0)`: late enough that the shell renders
 * the FALLBACK, early enough that the stream resumes it well inside the deadline.
 */
export const STREAM_SOURCES: Readonly<Record<string, string>> = Object.freeze({
  /** One boundary, settling after the shell. The basic swap. */
  "stream-one-boundary": `
import { Loading, resource } from "@barqjs/core"
export default function StreamOneBoundary() {
  const late = resource(() => null, () => new Promise((r) => setTimeout(() => r("LATE"), 0)))
  return (
    <div>
      <p>before</p>
      <Loading fallback={<span class="skel">skel</span>}>
        <b class="done">{() => late()}</b>
      </Loading>
      <p>after</p>
    </div>
  )
}
`,

  /** Two SIBLING boundaries whose promises settle in the opposite order. */
  "stream-two-boundaries": `
import { Loading, resource } from "@barqjs/core"
export default function StreamTwoBoundaries() {
  const slow = resource(() => null, () => new Promise((r) => setTimeout(() => r("SLOW"), 12)))
  const fast = resource(() => null, () => new Promise((r) => setTimeout(() => r("FAST"), 0)))
  return (
    <div>
      <Loading fallback={<span class="s1">skel-one</span>}>
        <b class="slow">{() => slow()}</b>
      </Loading>
      <Loading fallback={<span class="s2">skel-two</span>}>
        <i class="fast">{() => fast()}</i>
      </Loading>
    </div>
  )
}
`,

  /**
   * A boundary that NEVER settles, beside live content.
   *
   * The dehydrated case, and the foundation selective hydration stands on: the
   * rest of the page must hydrate and become interactive while this boundary
   * keeps the fallback the server wrote. React spells the same state `<!--$?-->`
   * (`ReactDOMFizzInstructionSetShared.js`); barq spells it `<!--[b:N-->`.
   */
  "stream-dehydrated-boundary": `
import { Loading, resource } from "@barqjs/core"
export default function StreamDehydratedBoundary() {
  const never = resource(() => null, () => new Promise(() => {}))
  return (
    <div>
      <p class="before">before</p>
      <Loading fallback={<span class="skel">skel</span>}>
        <b class="content">{() => never()}</b>
      </Loading>
      <p class="after">after</p>
    </div>
  )
}
`,

  /** A boundary INSIDE a boundary, the inner one settling last. */
  "stream-nested-boundaries": `
import { Loading, resource } from "@barqjs/core"
export default function StreamNestedBoundaries() {
  const outer = resource(() => null, () => new Promise((r) => setTimeout(() => r("OUTER"), 0)))
  const inner = resource(() => null, () => new Promise((r) => setTimeout(() => r("INNER"), 10)))
  return (
    <div>
      <Loading fallback={<span class="o">skel-outer</span>}>
        <section>
          <b class="ov">{() => outer()}</b>
          <Loading fallback={<span class="i">skel-inner</span>}>
            <u class="iv">{() => inner()}</u>
          </Loading>
        </section>
      </Loading>
    </div>
  )
}
`,
});
