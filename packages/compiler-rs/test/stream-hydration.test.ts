import { describe, expect, test } from "bun:test";

import { fixtureSource, listFixtures } from "./harness.ts";
import {
  HYDRATION_KNOWN,
  census,
  compileText,
  host,
  reuse,
  shape,
  type Reuse,
} from "./hydration.ts";
import { STREAM_SOURCES, assemble } from "./stream.ts";

/**
 * L5-S — the STREAMING hydration oracle.
 *
 * The buffered oracle (`hydration.test.ts`) proves a page rendered in one shot
 * hydrates over itself. It says nothing about the page a stream produces, and
 * those are not the same document: a streamed page arrives as a shell whose
 * boundaries hold FALLBACKS, and the real content is spliced in afterwards by
 * `swapDeferredRange`. Until this file, "streaming works" and "hydration works"
 * were two separately-true facts with no proof that they COMPOSE — and the
 * composition is the thing every SSR page actually does.
 *
 * Three properties, over the whole corpus:
 *
 *  1. CONVERGENCE. The DOM a stream assembles to must equal the DOM the buffered
 *     renderer produces. Two code paths, one answer. The reference is
 *     `renderPage`, not `renderToString`: the sync renderer cannot await, so on
 *     an async fixture it emits the FALLBACK and would make a passing comparison
 *     meaningless.
 *  2. ROUND TRIP. Hydrating the assembled page reports no mismatch and ends at
 *     the DOM a cold client render would have built.
 *  3. IDENTITY. The nodes the stream delivered are the nodes the page keeps —
 *     node-reuse, because a replaced node and a claimed node serialise
 *     identically and a markup diff cannot tell them apart.
 */

const FIXTURES = listFixtures();

interface StreamResult {
  name: string;
  chunks: number;
  swaps: number;
  templates: number;
  streamedShape: string;
  /** `null` when the buffered renderer could not settle this fixture at all. */
  bufferedShape: string | null;
  hydratedShape: string;
  coldShape: string;
  reuse: Reuse;
  recovered: boolean;
  mismatches: string[];
}

async function streamFixture(name: string): Promise<StreamResult> {
  return streamSource(name, fixtureSource(name));
}

async function streamSource(name: string, source: string): Promise<StreamResult> {
  // TWO compilations of the same source, and the second name is what separates
  // them. A fixture may hold module-level state — a signal at the top of the
  // file — and rendering ONE module twice lets the buffered reference's render
  // leak into the streamed one. Measured on `attribute-namespaces`, whose second
  // render carried a `rows="2"` the first had not written.
  const reference = await compileText(source, `${name}-stream-ref`, true, false);
  const compiled = await compileText(source, `${name}-stream`, true, false);
  const core = await import("@barqjs/core");
  const server = await import("@barqjs/server");

  // (1) the buffered reference, fully settled — BOUNDED, because the corpus
  // contains fixtures whose promise never settles by design and `renderPage`
  // awaits without a deadline. `null` records "this fixture cannot be compared",
  // which is a different fact from "it matched", and the guard below makes sure
  // the whole corpus never quietly becomes `null`.
  const settled = await Promise.race([
    server
      .renderPage((() =>
        (reference.ssr.default as unknown as (s: unknown) => unknown)(null)) as never)
      .then((page) => page.html),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 250)),
  ]);
  let bufferedShape: string | null = null;
  if (settled !== null) {
    const buffered = host(settled);
    bufferedShape = shape(buffered);
    buffered.remove();
  }

  // (2) the streamed assembly, done the way a browser does it.
  const container = host("");
  const assembled = await assemble(compiled.ssr, container);
  const streamedShape = shape(container);

  // (3) hydrate the assembled page.
  //
  // The CLIENT epoch is reset first. Root ids are numbered per async session and
  // the client's session is `null`, so in a process that renders many pages the
  // counter keeps climbing — the second hydrate builds under `r1` and looks up
  // seeds the server wrote under `r0`. A browser hydrates one document per page
  // load, which is `r0` every time; without this the oracle would measure its own
  // bookkeeping instead of the round trip.
  const before = census(container);
  core.resetChildIds();
  const dispose = core.hydrate(compiled.dom.default as never, container);
  const claim = reuse(before, container);
  const report = core.hydrate.report;
  const hydratedShape = shape(container);

  const cold = host("");
  core.resetChildIds();
  const rendered = core.render(compiled.dom.default as never, cold);
  const coldShape = shape(cold);

  dispose();
  rendered();
  container.remove();
  cold.remove();

  return {
    name,
    chunks: assembled.chunks,
    swaps: assembled.swaps,
    templates: assembled.templates,
    streamedShape,
    bufferedShape,
    hydratedShape,
    coldShape,
    reuse: claim,
    recovered: report.recovered,
    mismatches: report.mismatches.map((m) => m.kind),
  };
}

/**
 * One pass over the corpus, shared by every assertion — the buffered oracle
 * takes the same shape and for the same reason: a check that runs before the
 * corpus has finished is a check that cannot fail.
 */
const ALL: Promise<Map<string, StreamResult>> = (async () => {
  const out = new Map<string, StreamResult>();
  for (const name of FIXTURES) out.set(name, await streamFixture(name));
  return out;
})();

describe("L5-S streaming hydration conformance", () => {
  for (const name of FIXTURES) {
    test(`${name} streams to the same page it buffers, and hydrates over it`, async () => {
      const result = (await ALL).get(name) as StreamResult;

      // 1. CONVERGENCE, where the buffered renderer can settle at all.
      if (result.bufferedShape !== null) {
        expect({ name, shape: result.streamedShape }).toEqual({
          name,
          shape: result.bufferedShape,
        });
      }

      // 2 and 3 are held to the SAME registry the buffered oracle uses, which
      // makes the property "streaming makes nothing worse than buffering". A
      // fixture that is clean buffered must be clean streamed; a fixture with a
      // declared divergence must have the SAME one, not a bigger one.
      const known = HYDRATION_KNOWN[name];

      // 2. ROUND TRIP.
      if (known?.shape != null) {
        expect(result.hydratedShape).toBe(known.shape);
        expect(result.hydratedShape).not.toBe(result.coldShape);
      } else {
        expect(result.hydratedShape).toBe(result.coldShape);
      }

      if (known === undefined) {
        expect({ name, recovered: result.recovered, mismatches: result.mismatches }).toEqual({
          name,
          recovered: false,
          mismatches: [],
        });
        // 3. IDENTITY.
        expect({ name, percent: result.reuse.percent, lost: result.reuse.firstLost }).toEqual({
          name,
          percent: 100,
          lost: null,
        });
        return;
      }

      expect({
        name,
        recovered: result.recovered,
        kinds: [...new Set(result.mismatches)].toSorted(),
        reuse: Math.round(result.reuse.percent),
      }).toEqual({
        name,
        recovered: known.recovered,
        kinds: known.kinds,
        reuse: known.reuse,
      });
    });
  }

  /**
   * The silent-success guard. Every assertion above is satisfied by a corpus
   * where NOTHING streams — one chunk, no swap, and the three properties hold
   * trivially. This is the row that fails when the oracle stops exercising the
   * mechanism it exists to measure.
   */
  test("the corpus actually streams: some fixture defers a boundary and swaps it in", async () => {
    const all = [...(await ALL).values()];
    const streamed = all.filter((r) => r.chunks > 1);
    const swapped = all.filter((r) => r.swaps > 0);
    // …and the convergence half is not vacuous either: if every fixture failed
    // to settle, property 1 would be skipped for all of them and this suite
    // would be green while checking nothing.
    const comparable = all.filter((r) => r.bufferedShape !== null);
    // The shared corpus does NOT swap — nothing in `fixtures/` defers a boundary
    // that later settles, which is why `STREAM_SOURCES` exists and why the swap
    // half of this guard is asserted over that corpus instead, below.
    expect({
      streamedFixtures: streamed.length > 0,
      mostAreComparable: comparable.length > all.length / 2,
    }).toEqual({ streamedFixtures: true, mostAreComparable: true });
    expect(swapped.length).toBe(0);
  });
});

/**
 * The same three properties, over sources that ACTUALLY stream.
 *
 * Everything above is a regression net: it proves streaming does not damage a
 * page that was never going to defer anything. This is the part that measures
 * the mechanism — a shell carrying fallbacks, a `<template>` per boundary, and
 * `swapDeferredRange` splicing each one into place.
 */
describe("L5-S the streaming mechanism itself", () => {
  const STREAMED: Promise<Map<string, StreamResult>> = (async () => {
    await ALL;
    const out = new Map<string, StreamResult>();
    for (const [name, source] of Object.entries(STREAM_SOURCES)) {
      out.set(name, await streamSource(name, source));
    }
    return out;
  })();

  for (const name of Object.keys(STREAM_SOURCES)) {
    // The dehydrated fixture never settles by design, so it has its own row
    // below rather than the swap-and-converge one.
    if (name === "stream-dehydrated-boundary") continue;
    test(`${name} defers, swaps, converges and hydrates`, async () => {
      const result = (await STREAMED).get(name) as StreamResult;

      // It really streamed: a shell plus at least one deferred boundary.
      expect({ name, deferred: result.chunks > 1, swapped: result.swaps > 0 }).toEqual({
        name,
        deferred: true,
        swapped: true,
      });

      // 1. CONVERGENCE — the assembled page IS the buffered page.
      expect({ name, shape: result.streamedShape }).toEqual({
        name,
        shape: result.bufferedShape,
      });

      // The fallback is gone and the settled content is in: a convergence check
      // against a buffered render that ALSO failed would pass on two identical
      // skeletons.
      expect(result.streamedShape).not.toContain("skel");

      // 2. ROUND TRIP.
      expect({ name, recovered: result.recovered, mismatches: result.mismatches }).toEqual({
        name,
        recovered: false,
        mismatches: [],
      });

      // Hydration must not CHANGE the page it hydrated. The cold render is the
      // wrong reference here and asserting against it was a mistake: a cold
      // client render has no seed, so its resource has not settled and it shows
      // the FALLBACK. That hydration ends up with content where a cold render
      // shows a skeleton is the entire value of seeding — the two are SUPPOSED
      // to differ, and the two rows below pin that they do.
      expect(result.hydratedShape).toBe(result.streamedShape);
      expect(result.coldShape).toContain("skel");
      expect(result.hydratedShape).not.toContain("skel");

      // 3. IDENTITY — the nodes the SWAP delivered are the nodes hydration keeps.
      expect({ name, percent: result.reuse.percent, lost: result.reuse.firstLost }).toEqual({
        name,
        percent: 100,
        lost: null,
      });
    });
  }

  /**
   * THE DEHYDRATED BOUNDARY — what selective hydration is built on.
   *
   * A boundary whose data never arrives must not cost the page its hydration.
   * React keeps such a boundary's fallback hydrated and its content dehydrated
   * (`<!--$?-->`, `ReactDOMFizzInstructionSetShared.js`); barq's `<!--[b:N-->`
   * behaves the same way since an unsettled range hands its claim to the
   * boundary's own fallback instead of being left unclaimed.
   *
   * Measured before that existed: `recovered: true` and 0% reuse — ONE pending
   * boundary threw the whole page away and rebuilt it cold.
   */
  test("a boundary that never settles keeps its fallback and costs the page nothing", async () => {
    const result = (await STREAMED).get("stream-dehydrated-boundary") as StreamResult;

    // Nothing was swapped: the boundary is still waiting.
    expect({ swaps: result.swaps, templates: result.templates }).toEqual({
      swaps: 0,
      templates: 0,
    });
    // The page hydrated anyway, and kept every node the server sent.
    expect({ recovered: result.recovered, mismatches: result.mismatches }).toEqual({
      recovered: false,
      mismatches: [],
    });
    expect({ percent: result.reuse.percent, lost: result.reuse.firstLost }).toEqual({
      percent: 100,
      lost: null,
    });
    // The server's fallback is what is still on screen — not a second copy of
    // it. Counted on the ELEMENT: `class="skel"` and the text `skel` are two
    // occurrences of the word in one span.
    expect(result.hydratedShape).toContain("skel");
    expect(result.hydratedShape.match(/class="skel"/g)).toHaveLength(1);
    // …and the content around it is intact.
    expect(result.hydratedShape).toContain("before");
    expect(result.hydratedShape).toContain("after");
  });

  test("each boundary is delivered exactly once: one template, one swap", async () => {
    for (const [name, result] of await STREAMED) {
      if (name === "stream-dehydrated-boundary") continue;
      // A template with no swap is content that never reaches the page; a swap
      // with no template is a snippet looking for a payload that never arrived.
      expect({ name, templates: result.templates, swaps: result.swaps }).toEqual({
        name,
        templates: result.swaps,
        swaps: result.swaps,
      });
      expect(result.swaps).toBeGreaterThan(0);
    }
  });
});
