import { describe, expect, test } from "bun:test"

import { compileSource } from "./harness.ts"
import { census, compileText, host, reuse, shape, wire } from "./hydration.ts"

/**
 * L6 pointed at hydration. `CODESIGN.md` §6 L6, §11 Q4.
 *
 * **A property no mutation can violate is not a property.** The conformance
 * suite next door says every fixture hydrates cleanly; on its own that is a
 * statement about a corpus, not about a detector. This file corrupts the wire
 * one way at a time and asks the two questions §11 Q4 paid the bytes for:
 *
 *   1. was the corruption DETECTED?
 *   2. did it degrade to a full client render, or to a wrong tree?
 *
 * The second question is the one that matters. `solid-start#1807` is titled
 * "hydration fails silently without an error", and React documents the
 * consequence as event handlers attaching to the wrong elements. A mutation that
 * survives here is exactly that bug, in this codebase, with a name.
 *
 * The first row is the NULL mutation — the wire unedited. It must hydrate
 * cleanly, or every red row below is an artefact of the harness rather than a
 * detection.
 */

const SOURCE = `
import { For, Show, signal } from "@barqjs/core";
export const on = signal(true);
export const label = signal("alpha");
export const rows = signal(["one", "two", "three"]);
export default function Page() {
  return (
    <main class="page">
      <h1>{label()}</h1>
      <Show when={on()} fallback={<em class="off">off</em>}>
        <p class="on">on</p>
      </Show>
      <ul>
        <For each={rows()}>{(row) => <li>{row}</li>}</For>
      </ul>
      <footer>tail</footer>
    </main>
  );
}
`

/**
 * What the page degrades to: `"claim"` — hydration completed with the server's
 * nodes; `"local"` — one range rebuilt, the rest claimed; `"cold"` — the whole
 * page re-rendered on the client, which is exactly today's behaviour.
 */
type Degradation = "claim" | "local" | "cold"

interface Expected {
  /** `true` when the corruption must be reported or thrown. */
  detected: boolean
  degrades: Degradation
  /**
   * The shape the page ends at when it is NOT the shape a cold client render
   * would have produced — a SURVIVING corruption, written down.
   *
   * There are three of them and they are all the same trade. §12 moved the
   * subtree comparison onto the detection axis, so a production build no longer
   * walks a claimed subtree against the template it would have built, and a
   * corruption that is invisible to the claim itself — an extra element, a
   * missing one, a swapped tag in the middle of a template — survives. That is
   * what Solid does and it is what §12 chose: the check runs where the bug is
   * debugged, and the same three rows are DETECTED in the development column.
   *
   * Recorded exactly rather than tolerated. A row that starts matching the cold
   * render is as stale as one that starts diverging, and both fail.
   */
  diverges?: string
}

interface Mutation {
  name: string
  /** What the corruption stands for, in the reader's terms. */
  about: string
  apply: (wire: string) => string
  /**
   * The verdict in a PRODUCTION build, and `null` when the corruption cannot be
   * expressed there at all.
   *
   * `null` is a claim rather than an omission, and `the table` holds it to one:
   * the mutation must leave a production wire UNCHANGED. §12 moved the branch
   * key onto the detection axis, so "the server says it took arm `true`" is a
   * sentence a production wire cannot say — and the row that reads it stays
   * here, aimed at the build that can.
   */
  production: Expected | null
  /** The verdict in a DEVELOPMENT build — `dev` plus `hydratable`. */
  development: Expected
}

/** The three shapes a PRODUCTION build ends at when the corruption survives. */
const WRONG_TAG =
  '<main class="page"><h2>alpha</h2><p class="on">on</p><ul><li>one</li><li>two</li>' +
  "<li>three</li></ul><footer>tail</footer></main>"
const NO_FOOTER =
  '<main class="page"><h1>alpha</h1><p class="on">on</p><ul><li>one</li><li>two</li>' +
  "<li>three</li></ul></main>"
const EXTRA_ASIDE =
  '<main class="page"><h1>alpha</h1><p class="on">on</p><ul><li>one</li><li>two</li>' +
  "<li>three</li></ul><aside>x</aside><footer>tail</footer></main>"

const MUTATIONS: Mutation[] = [
  {
    name: "null (the wire, unedited)",
    about: "the control. Every row below is meaningless if this one is not clean.",
    apply: (w) => w,
    production: { detected: false, degrades: "claim" },
    development: { detected: false, degrades: "claim" },
  },
  {
    name: "a branch index disagrees",
    about:
      "the server says it took arm `true`, the client's own read says `false`. H2 forbids " +
      "re-deriving the condition, so the written key is the only evidence there is — and " +
      "§12 put that key on the DETECTION axis, so this is the one corruption a production " +
      "wire cannot express.",
    apply: (w) => w.replace("<!--[true-->", "<!--[false-->"),
    production: null,
    development: { detected: true, degrades: "local" },
  },
  {
    name: "the server rendered the other branch arm",
    about:
      "the same divergence, expressed in the bytes a PRODUCTION wire does carry. With no " +
      "key to compare, the claim fails on the tag it lands on — and the region rebuilds " +
      "its own range rather than the page, which is H4's radius reached structurally.",
    apply: (w) => w.replace('<p class="on">on</p>', '<em class="off">off</em>'),
    production: { detected: true, degrades: "local" },
    development: { detected: true, degrades: "local" },
  },
  {
    name: "a branch comment is dropped",
    about: "a proxy, a sanitiser or a CDN that strips comments — the byte the design pays for.",
    apply: (w) => w.replace(/<!--\[[^]*?-->/, ""),
    production: { detected: true, degrades: "cold" },
    development: { detected: true, degrades: "cold" },
  },
  {
    name: "a closing range comment is dropped",
    about: "the same, at the other end: the anchor every later write to that range uses.",
    apply: (w) => w.replace("<!--]-->", ""),
    production: { detected: true, degrades: "cold" },
    development: { detected: true, degrades: "cold" },
  },
  {
    name: "the wrong node is at a claim position",
    about:
      "the tag the client builds is not the tag the server wrote. React's documented " +
      "consequence of not catching this is handlers attached to the wrong elements.",
    apply: (w) => w.replace("<h1>", "<h2>").replace("</h1>", "</h2>"),
    production: { detected: false, degrades: "claim", diverges: WRONG_TAG },
    development: { detected: true, degrades: "cold" },
  },
  {
    name: "the client would build a different tree (an element is missing)",
    about: "the server's markup is a prefix of the client's — the walk runs out.",
    apply: (w) => w.replace("<footer>tail</footer>", ""),
    production: { detected: false, degrades: "claim", diverges: NO_FOOTER },
    development: { detected: true, degrades: "cold" },
  },
  {
    name: "the client would build a different tree (an element is extra)",
    about: "the reverse: markup the client's walk has no position for.",
    apply: (w) => w.replace("<footer>", "<aside>x</aside><footer>"),
    production: { detected: false, degrades: "claim", diverges: EXTRA_ASIDE },
    development: { detected: true, degrades: "cold" },
  },
  {
    name: "a row disappears from a list",
    about:
      "the list the server rendered is not the list the client renders. The rows that DO " +
      "match must still keep their nodes — that is H4's blast radius on a list. A row " +
      "carries no comments of its own since §12, so the corruption is the row itself.",
    apply: (w) => w.replace("<li>two</li>", ""),
    // `claim`, and K1 is why: a row removed from the middle is not a missing row
    // — it is every later row shifting up by one. Each of them claims the node
    // the server wrote at its position and the text is written through it, so
    // nothing is replaced and the last row builds cold. The report says both: a
    // text drift and a row the server did not write.
    production: { detected: true, degrades: "claim" },
    development: { detected: true, degrades: "claim" },
  },
  {
    name: "a row's text drifts",
    about:
      "the ordinary case — a timestamp, a locale, a random id. It RECOVERS: the node is " +
      "kept and the text written through it. Reporting it anyway is what makes " +
      "'nothing was reported' mean something.",
    apply: (w) => w.replace(">two<", ">TWO<"),
    production: { detected: true, degrades: "claim" },
    development: { detected: true, degrades: "claim" },
  },
  {
    name: "the whole container is empty",
    about: "a server that failed, a cache that served nothing.",
    apply: () => "",
    production: { detected: true, degrades: "cold" },
    development: { detected: true, degrades: "cold" },
  },
  {
    name: "every range comment is stripped",
    about:
      "the wire as it would be with NO claim scaffolding at all — Vapor's zero-byte " +
      "scheme, in effect. §12 already took most of it away; what is left is what recovery " +
      "cannot do without, and removing that has to be caught.",
    apply: (w) => w.replaceAll(/<!--\[[^]*?-->/g, "").replaceAll("<!--]-->", ""),
    production: { detected: true, degrades: "cold" },
    development: { detected: true, degrades: "cold" },
  },
]

interface Verdict {
  name: string
  detected: boolean
  degraded: Degradation
  reuse: number
  kinds: string[]
  /** Whether the corruption changed the wire at all. */
  bit: boolean
}

async function run(mutation: Mutation, dev: boolean): Promise<Verdict> {
  const tag = `mut-${dev ? "dev" : "prod"}-${mutation.name.replaceAll(/\W+/g, "-")}`
  const compiled = await compileText(SOURCE, tag, true, dev)
  const core = await import("@barqjs/core")

  const clean = wire(compiled.ssr)
  const corrupted = mutation.apply(clean)
  const container = host(corrupted)
  const before = census(container)
  const dispose = core.hydrate(compiled.dom.default as never, container)
  const claim = reuse(before, container)
  const report = core.hydrate.report
  const hydrated = shape(container)
  dispose()
  container.remove()

  const cold = host("")
  const rendered = core.render(compiled.dom.default as never, cold)
  const coldShape = shape(cold)
  rendered()
  cold.remove()

  // THE point of the whole exercise: whatever the corruption was, the page the
  // user is looking at is the page the client would have built. A mutation that
  // produced a different tree here is the silent-failure bug, found — and the
  // three rows that DO produce one carry the tree they produce, so the bug is
  // named rather than absorbed.
  const expected = dev ? mutation.development : mutation.production
  if (expected?.diverges !== undefined) {
    expect({ mutation: mutation.name, dev, shape: hydrated }).toEqual({
      mutation: mutation.name,
      dev,
      shape: expected.diverges,
    })
    expect(hydrated).not.toBe(coldShape)
  } else {
    expect({ mutation: mutation.name, dev, shape: hydrated }).toEqual({
      mutation: mutation.name,
      dev,
      shape: coldShape,
    })
  }

  return {
    name: mutation.name,
    detected: report.recovered || report.mismatches.length > 0,
    degraded: report.recovered ? "cold" : claim.percent === 100 ? "claim" : "local",
    reuse: Math.round(claim.percent),
    kinds: [...new Set(report.mismatches.map((m) => m.kind))].toSorted(),
    bit: corrupted !== clean,
  }
}

/**
 * The table, run twice — once against a PRODUCTION `hydratable` build and once
 * against a DEVELOPMENT one.
 *
 * That is §12's split, made falsifiable. The two builds emit different bytes on
 * both backends, so "the detector works" is a claim about two artefacts and not
 * one, and the row that is `null` in production is the axis itself: with the key
 * off the wire the corruption has nothing to bite on, and the assertion is that
 * it really has nothing to bite on rather than that nobody looked.
 */
for (const dev of [false, true]) {
  const build = dev ? "development" : "production"

  describe(`L6 hydration mutations — ${build}`, () => {
    const verdicts: { mutation: Mutation; verdict: Verdict }[] = []

    for (const mutation of MUTATIONS) {
      const expected = dev ? mutation.development : mutation.production
      test(`${mutation.name} — ${expected === null ? "cannot be expressed" : "detected and degraded as declared"}`, async () => {
        const verdict = await run(mutation, dev)
        verdicts.push({ mutation, verdict })
        if (expected === null) {
          // The `null` claim, held to: the corruption left the wire alone, so
          // the page hydrates exactly as the control does. A row that started
          // biting here would mean the key is back on the production wire.
          expect({ name: verdict.name, bit: verdict.bit }).toEqual({
            name: mutation.name,
            bit: false,
          })
          expect({ name: verdict.name, detected: verdict.detected }).toEqual({
            name: mutation.name,
            detected: false,
          })
          return
        }
        // A corruption that is DECLARED to be expressible must actually change
        // the bytes. Every row below is an artefact otherwise, which is exactly
        // what three of them silently became when §12 shrank the wire — they
        // went on passing because a no-op is never caught and was never
        // supposed to be.
        expect({ name: verdict.name, bit: verdict.bit }).toEqual({
          name: mutation.name,
          bit: mutation !== MUTATIONS[0],
        })
        expect({
          name: verdict.name,
          detected: verdict.detected,
          degraded: verdict.degraded,
        }).toEqual({
          name: mutation.name,
          detected: expected.detected,
          degraded: expected.degrades,
        })
      })
    }

    test("the table", () => {
      // A row whose corruption did not change the bytes is NOT a silent
      // failure — there was nothing to fail on. The assertion below already
      // filters on `bit`; the printed table says so too, so a reader skimming
      // it reaches the same three names the equality does.
      const rows = verdicts.map(({ verdict: v }) =>
        v.bit
          ? `  ${v.name.padEnd(52)} ${v.detected ? "DETECTED" : "silent  "}  ` +
            `${v.degraded.padEnd(6)} reuse ${String(v.reuse).padStart(3)}%  ${v.kinds.join(",")}`
          : `  ${v.name.padEnd(52)} n/a       not expressible on this wire`,
      )
      console.log(`L6 hydration mutations (${build}):\n${rows.join("\n")}`)
      // Every mutation that BIT has to be caught, and the ones that are not are
      // named — an EQUALITY, so a new silent row cannot slip in beside them and
      // a declared one that starts being caught fails as stale.
      //
      // The development column's list is empty and that is §12's promise kept:
      // silent failure is the dominant harm, the argument is about development,
      // and no corruption on this table survives a development build. The
      // production column's three are the price, listed rather than averaged.
      const silent = verdicts
        .filter(({ mutation, verdict }) => mutation !== MUTATIONS[0] && verdict.bit && !verdict.detected)
        .map(({ verdict }) => verdict.name)
      const declared = MUTATIONS.filter(
        (m) => (dev ? m.development : m.production)?.diverges !== undefined,
      ).map((m) => m.name)
      expect(silent).toEqual(declared)
    })
  })
}

// ---------------------------------------------------------------------------
// the build-level mutation: the flag itself
// ---------------------------------------------------------------------------

describe("hydrating a page the compiler never made hydratable", () => {
  /**
   * The mutation that cannot be made by editing markup: compile BOTH halves
   * without `hydratable` and hydrate anyway. Nothing throws — there is no range
   * to disagree with — so this is the one failure that has to be detected by
   * what did NOT happen, and it is the case the old replace-based `hydrate`
   * silently was.
   */
  test("is detected by the claim that never happened, and renders cold", async () => {
    const compiled = await compileText(SOURCE, "mut-not-hydratable", false)
    const core = await import("@barqjs/core")
    const container = host(wire(compiled.ssr))
    const before = census(container)
    const dispose = core.hydrate(compiled.dom.default as never, container)
    const report = core.hydrate.report
    const hydrated = shape(container)
    const claim = reuse(before, container)
    dispose()
    container.remove()

    const cold = host("")
    const rendered = core.render(compiled.dom.default as never, cold)
    const coldShape = shape(cold)
    rendered()
    cold.remove()

    expect(report.recovered).toBe(true)
    // Either detector is acceptable and both are honest: the subtree check
    // reaches it first on a page with any structure — the server's `<main>` has
    // the hole's own nodes where a hydratable render would have a range — and
    // the claimed-nothing check is what catches a page with none.
    expect(["structure", "not-hydratable"]).toContain(report.mismatches[0]?.kind)
    expect(hydrated).toBe(coldShape)
    expect(claim.percent).toBe(0)
  })

  /**
   * The other direction, and the one a deployment can actually get wrong: the
   * SERVER was built hydratable and the CLIENT was not. The client's walk is
   * native `.firstChild`/`.nextSibling`, so it steps straight onto a boundary
   * comment and addresses everything after it one position out — the exact shape
   * of "event handlers attached to the wrong elements". It must not be silent.
   */
  test("a hydratable server paired with a non-hydratable client is caught too", async () => {
    const core = await import("@barqjs/core")
    const server = await compileText(SOURCE, "mut-mixed-server", true)
    const client = await compileText(SOURCE, "mut-mixed-client", false)

    const container = host(wire(server.ssr))
    const dispose = core.hydrate(client.dom.default as never, container)
    const report = core.hydrate.report
    const hydrated = shape(container)
    dispose()
    container.remove()

    const cold = host("")
    const rendered = core.render(client.dom.default as never, cold)
    const coldShape = shape(cold)
    rendered()
    cold.remove()

    // DETECTED is the requirement; which degradation it takes is a fact about
    // where the client's first native step happens to land. On this page every
    // region reports that it reached its primitive without the flag and rebuilds
    // its own range, so the answer is `local` rather than `cold` — and the tree
    // is still the tree the client would have built, which is the only thing the
    // user can tell apart.
    expect(report.recovered || report.mismatches.length > 0).toBe(true)
    expect(hydrated).toBe(coldShape)
  })

  /**
   * §12's split, stated as three wires over one source.
   *
   * `hydratable` off writes no claim scaffolding at all. `hydratable` on writes
   * the ranges RECOVERY needs — around the branch, whose extent is data, and
   * around nothing else here, because the `<h1>`'s hole and the `<li>`'s hole
   * each own their element and the `<ul>`'s list owns its own. `dev` on top of
   * it adds the KEY and nothing else, which is the whole of what detection puts
   * on the wire.
   */
  test("the three wires: none, recovery, recovery plus detection", async () => {
    const plain = wire((await compileText(SOURCE, "wire-plain", false)).ssr)
    const production = wire((await compileText(SOURCE, "wire-prod", true)).ssr)
    const development = wire((await compileText(SOURCE, "wire-dev", true, true)).ssr)

    expect(plain).not.toContain("<!--")

    // What recovery needs, and the shape of what it does not. The branch has a
    // range; the two holes and the list do not, because each of them owns the
    // element it sits in.
    expect(production).toContain("<!--[-->")
    expect(production).toContain("<!--]-->")
    expect(production).toContain("<h1>alpha</h1>")
    expect(production).toContain("<li>one</li>")
    expect(production).toContain("<ul><li>one</li>")
    expect(production.match(/<!--\[/g)?.length).toBe(1)

    // Detection adds two things and they are both about the KEY. The branch's
    // open comment gains `true`, and the list gets its comments BACK — a range
    // that owns its element writes none in production, and a development build
    // writes them anyway because the open comment is the only place a key can
    // live. An `each` has no key, so the second is the axis paying for a
    // uniform range shape rather than for information.
    expect(development).toContain("<!--[true-->")
    expect(development).toContain("<ul><!--[--><li>one</li>")
    expect(
      development
        .replace("<!--[true-->", "<!--[-->")
        .replace("<ul><!--[-->", "<ul>")
        .replace("<!--]--></ul>", "</ul>"),
    ).toBe(production)

    // And the numbers §12 turns on, on this page: recovery costs one range,
    // detection costs a key and a second range, and a build that hydrates
    // nothing costs neither.
    expect(production.length - plain.length).toBe("<!--[-->".length + "<!--]-->".length)
    expect(development.length - production.length).toBe(
      "true".length + "<!--[-->".length + "<!--]-->".length,
    )
  })
})
