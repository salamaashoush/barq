/**
 * The optimisation-level axis — `CODESIGN.md` §5.1 and §6 L3.
 *
 * The settled answer in the optimising-compiler literature is that the
 * reference for an optimising compiler is YOUR OWN COMPILER WITH THE
 * OPTIMISATIONS OFF, not a hand-written sibling with its own history and its
 * own bugs. `-O0` shares the front end, the IR, the ABI, the props model and
 * the ownership model, so it cannot encode a legacy decision and cannot share
 * an optimisation bug — which is exactly what the `createElement` oracle could
 * not say about itself. What `-O0` cannot say about ITSELF is the other half:
 * two builds that share a front end cannot grade it, so P2 `classify` and P4
 * `shape` need an ABSOLUTE grader and the oracle does not retire until one
 * exists. `CODESIGN.md` §6 states it; the last describe block here asserts it.
 *
 * This file is the M1 half of that: `-O0` is a build that RUNS and renders what
 * `-Ox` renders. The channels it compares are the ones L4 grades as
 * differential (rendered DOM across every frame, and the side channels read off
 * it). The ones it deliberately does NOT compare are the ones L4 grades as
 * absolute optimality claims rather than equivalence claims — effect counts and
 * baked anchor counts move by design when fusion and elision are off, and a
 * suite that demanded they agree would be asserting that the optimisations do
 * nothing.
 */

import { describe, expect, it } from "bun:test"

import { emittedFlags, FLAG_CENSUS } from "./flag-census.ts"

import { liveModes, oneSourceOrderExplainsBoth, renderSource, type Mode } from "./differential.ts"
import {
  compileFixture,
  compileSource,
  countTemplateAnchors,
  drive,
  fixtureSource,
  listFixtures,
  renderViaCompiler,
  stripLiterals,
  templateHtml,
} from "./harness.ts"
import { listSemanticFixtures, runSemanticFixture, type FixtureRun } from "./semantics.ts"
import { renderCode, sameTree, ssrStatus } from "./ssr.ts"

const O0 = { optimize: 0 }

/**
 * What every differential below ASSUMES, asserted per fixture instead.
 *
 * A differential compares two builds and says nothing about either one, so it is
 * only worth what its inputs are worth — and the null hypothesis is brutal: an
 * identity `transform(code) { return { code } }` leaves the emitted JSX for bun
 * to lower through the `@barqjs/core` automatic runtime, both sides render
 * through `createElement`, and 931 of the 938 assertions in this file and
 * `differential.test.ts` go green against a compiler that compiled nothing. A
 * build that dropped the `optimize` option is the same failure one level down:
 * every comparison becomes a module against itself.
 *
 * So each fixture states the preconditions of its own comparison, and each is a
 * fact no build that skipped the work can produce:
 *
 *  - the emitted module is not the source, and carries at least one `_$` helper,
 *    so SOMETHING compiled it;
 *  - `-O0` never back-walks (`walk` off means every node descends from its own
 *    parent), read off the literal-blanked module so a fixture's own doc comment
 *    cannot satisfy it;
 *  - `-O0` bakes at least as many anchors as `-Ox` (`anchor` off means every hole
 *    gets its own), which is an inequality a build ignoring the level cannot
 *    satisfy on any fixture where elision fires.
 */
function anchors(code: string): number {
  return templateHtml(code).reduce((n, html) => n + countTemplateAnchors(html), 0)
}

function preconditions(name: string, optimised: string, reference: string): void {
  expect(optimised, `${name}: the build handed the source back — nothing compiled it`).not.toBe(
    fixtureSource(name),
  )
  expect(optimised.includes("_$"), `${name}: -Ox emitted no runtime helper at all`).toBe(true)
  expect(reference.includes("_$"), `${name}: -O0 emitted no runtime helper at all`).toBe(true)

  const blanked = stripLiterals(reference)
  expect(blanked.includes(".lastChild"), `${name}: -O0 back-walked with \`walk\` off`).toBe(false)
  expect(blanked.includes(".previousSibling"), `${name}: -O0 back-walked with \`walk\` off`).toBe(
    false,
  )
  expect(
    anchors(reference),
    `${name}: -O0 baked FEWER anchors than -Ox, so elision cannot be off`,
  ).toBeGreaterThanOrEqual(anchors(optimised))
}

/**
 * Deliberately no exemption list. The whole indictment of the retired oracle is
 * that its exemption machinery — 12 `wins`, 16 `goesLive` — was a specification
 * in the least reviewable possible form, and that the fixtures needing an
 * exemption were exactly the interesting ones. A differential between two builds
 * of ONE compiler has nothing to exempt: both sides read the same analysed IR,
 * so neither can know something the other does not. The day a row is needed
 * here, the design has gone wrong and the row is the evidence.
 */
describe("-O0 is a build, not a debug mode", () => {
  const fixtures = listFixtures()

  it("compiles every fixture in the corpus", () => {
    for (const name of fixtures) {
      const code = compileFixture(name, O0)
      expect(code.length, name).toBeGreaterThan(0)
    }
  })

  /**
   * The one thing `-O0` may never be: smaller. Every knob it turns off removes
   * a transformation that made the output shorter or the runtime work smaller,
   * so a corpus where `-O0` came out identical everywhere would mean the
   * optimisations are not running at `-Ox`.
   */
  it("differs from -Ox on a substantial share of the corpus", () => {
    const moved = fixtures.filter((name) => compileFixture(name, O0) !== compileFixture(name))
    expect(moved.length).toBeGreaterThan(fixtures.length / 2)
  })
})

/**
 * L3, over the fixture corpus. This is the channel `CODESIGN.md` §6 L4 grades
 * "differential — `-O0` vs `-Ox` byte-identical", and it is the property that
 * makes `-O0` usable as the oracle's reference at all: an optimisation that
 * changes what the program DOES fails here, on the exact frame it changed.
 */
describe("L3 — the -O0/-Ox differential over the corpus", () => {
  for (const name of listFixtures()) {
    it(`${name} renders identically at both levels`, async () => {
      const optimised = await drive(name, "compiler")
      const reference = await renderViaCompiler(name, {}, O0)
      preconditions(name, optimised.code ?? "", reference.code ?? "")

      expect(reference.html, `${name}: initial render`).toBe(optimised.html)
      expect(reference.frames, `${name}: scripted steps`).toEqual(optimised.frames)
      expect(reference.eventFrames, `${name}: dispatched events`).toEqual(optimised.eventFrames)

      // The side channels the normaliser reads off each frame. `attributes`
      // carries the order the DOM reports, which rule 2 sorts out of `html`,
      // and `identity` carries per-element ordinals stamped on first sight —
      // so a level that produced the right markup by rebuilding nodes, or by
      // applying attributes in a different order, diverges here and nowhere
      // else.
      //
      // `markers` and `anchors` are NOT compared, and the reason is the whole
      // shape of the axis: `-O0` turns anchor elision off, so it bakes a
      // `<!---->` where `-Ox` anchors against a node the template already
      // carries. Demanding they agree would be demanding that the optimisation
      // do nothing. §6 L4 grades that channel self-check rather than
      // differential for exactly this reason, and `oracle.test.ts` already
      // holds each level to its own baked-in count.
      expect(reference.channels.length, `${name}: frame count`).toBe(optimised.channels.length)
      for (const [index, frame] of reference.channels.entries()) {
        const at = `${name}: frame ${index}`
        const there = optimised.channels[index]!.attributes
        // Byte equality on the ORDER is the wrong predicate across two levels
        // and the generator proved it on its 21st seed: P3 `fold` migrates a
        // constant attribute into the template AT ITS SOURCE POSITION, so the
        // baked/patched partition differs between the levels and a correct
        // compiler emits a different observable order. What survives is the
        // property the channel exists for — one source order and one split point
        // per build explain both — and it still rejects a group emitted
        // backwards. No fixture carries the shape today, so this is green either
        // way; the version that was here would have turned red the day one did.
        expect(
          frame.attributes.map((line) => line.slice(0, line.indexOf(": "))),
          `${at}: elements carrying attributes`,
        ).toEqual(there.map((line) => line.slice(0, line.indexOf(": "))))
        for (const [line, entry] of frame.attributes.entries()) {
          const names = (text: string): string[] => text.slice(text.indexOf(": ") + 2).split(",")
          expect(
            oneSourceOrderExplainsBoth(names(entry), names(there[line]!)),
            `${at}: attribute order — no one source order explains\n  -O0: ${entry}\n  -Ox: ${there[line]}`,
          ).toBe(true)
        }
        expect(frame.identity, `${at}: element identity`).toEqual(
          optimised.channels[index]!.identity,
        )
      }
    })
  }
})

/**
 * THE SAME DIFFERENTIAL, BISECTED TO ONE PASS — M4b.
 *
 * `-O0` turns nine flags off at once, which makes it a good acceptance test and
 * a poor diagnosis: a divergence there says "one of nine passes", and until M4b
 * the flow pass was not one of them at all. M4 shipped the runtime half and
 * reported the compiler half as not delivered, so `-O0` and `-Ox` emitted the
 * same `Show(_s$, { when, fallback, children })` and the whole corpus
 * differential above was green ON A PAIR THAT DID NOT CHANGE. Green for the
 * right reason and green because there is nothing to compare are the same
 * colour, and the second is the one §6 exists to prevent.
 *
 * This describe is the answer in the sharpest available form: `flow` OFF is the
 * only difference between the two builds, so every fixture below compares an
 * adapter call against a primitive call and nothing else moves. Two properties
 * follow that the corpus differential cannot state:
 *
 *  - a divergence bisects to `flow` on the spot, with no second run;
 *  - the POPULATION is asserted. If the pass stops lowering, this suite does not
 *    go quietly green with nothing to compare — it fails on the count.
 */
describe("L3 — the flow pass alone, bisected", () => {
  const FLOW_OFF = { passes: [["flow", "off"]] }
  const PRIMITIVES = ["branch", "each", "boundary", "portal"]

  /** The fixtures the pass actually moves, which is the population under test. */
  const lowered = listFixtures().filter(
    (name) => compileFixture(name) !== compileFixture(name, FLOW_OFF),
  )

  it("lowers a construct in a substantial share of the corpus", () => {
    // The anti-vacuity clause, and the one M4 could not have satisfied: with the
    // pass unwired this list is EMPTY and every `it` below disappears, so a
    // suite that stopped comparing anything would have reported success.
    expect(lowered.length, "the flow pass moves no fixture at all").toBeGreaterThan(24)
  })

  for (const name of lowered) {
    it(`${name} renders identically with the flow pass off`, async () => {
      const optimised = await renderViaCompiler(name)
      const reference = await renderViaCompiler(name, {}, FLOW_OFF)

      // The precondition, per fixture: the two builds differ in the one way
      // this axis is about. Without it a build that ignored the override would
      // compare a module against itself, which is the failure mode the whole
      // file's `preconditions` helper exists for one level up.
      const emitted = stripLiterals(optimised.code ?? "")
      const plain = stripLiterals(reference.code ?? "")
      const primitives = PRIMITIVES.filter(
        (primitive) => emitted.includes(`_$${primitive}(`) && !plain.includes(`_$${primitive}(`),
      )
      expect(
        primitives.length,
        `${name}: -Ox emits no primitive that the flow-off build does not`,
      ).toBeGreaterThan(0)

      expect(reference.html, `${name}: initial render`).toBe(optimised.html)
      expect(reference.frames, `${name}: scripted steps`).toEqual(optimised.frames)
      expect(reference.eventFrames, `${name}: dispatched events`).toEqual(optimised.eventFrames)
      expect(reference.channels.length, `${name}: frame count`).toBe(optimised.channels.length)
      for (const [index, frame] of reference.channels.entries()) {
        // Node identity is the channel that catches a region rebuilding what the
        // adapter reused, and vice versa — the one divergence that leaves the
        // markup byte-identical.
        expect(frame.identity, `${name}: frame ${index} element identity`).toEqual(
          optimised.channels[index]!.identity,
        )
        expect(frame.attributes, `${name}: frame ${index} attributes`).toEqual(
          optimised.channels[index]!.attributes,
        )
      }
    })
  }
})

/**
 * The same differential through the second backend. It is a weaker test than
 * the DOM one — the string backend runs three fewer passes, so `-O0` moves less
 * — and it is worth having anyway: the `Backend` trait is what both backends
 * lower through now, and a regression that reached only the string rows would
 * otherwise be invisible until M6.
 */
describe("L3 — the -O0/-Ox differential through the string backend", () => {
  const ssr = (name: string, optimize?: number): string =>
    compileSource(fixtureSource(name), `${name}.tsx`, { ssr: true, optimize })

  /**
   * The gate, stated once and asserted rather than assumed.
   *
   * `if (!ssrStatus.landed) return` was fail-open twice over. A compiler that
   * PANICS on `ssr: true` — the repo's own `splice-into-a-non-dom-backend`
   * mutant does exactly that, on 106 of 117 fixtures — turned all 117 tests
   * below into silent passes; and a build that IGNORED the option compared DOM
   * against DOM and called it a string-backend differential. `ssrStatus` is now
   * three-valued for the first reason and compares the probe against a plain
   * compile for the second, and `broken` is a hard failure here rather than an
   * early return.
   */
  it("never mistakes a broken string backend for one that has not landed", () => {
    expect(ssrStatus.state, ssrStatus.refusal).not.toBe("broken")
    expect(ssrStatus.state === "live" || ssrStatus.refusal.length > 0).toBe(true)
  })

  for (const name of listFixtures()) {
    it(`${name} serialises identically at both levels`, async () => {
      expect(ssrStatus.state, ssrStatus.refusal).not.toBe("broken")
      if (!ssrStatus.landed) return
      const optimised = await renderCode(ssr(name), `ssr-Ox-${name}`)
      const reference = await renderCode(ssr(name, 0), `ssr-O0-${name}`)

      // An optimisation level may not decide which backend a module gets.
      expect(reference.string, `${name}: took the same emission path`).toBe(optimised.string)

      if (optimised.string) {
        // A compiled SSR string carries no comment at all — `ssr.test.ts`
        // asserts that separately — so the raw bytes are comparable and are
        // what gets compared.
        expect(reference.html, name).toBe(optimised.html)
        return
      }
      // The module used one of the eight flow components the string backend
      // cannot inline, so it fell back to the DOM backend and was serialised by
      // `renderToString`. Two things in that markup are not level differences:
      // the flow components' NAMED marker pairs carry a process-global counter
      // that differs between any two renders in one process, and the insert
      // anchors are the elision this level turns off. Comparing the tree with
      // the comments dropped is the same normalisation `ssr.test.ts` uses to
      // compare two rendering strategies, and the DOM differential above
      // already holds these fixtures to the frame-by-frame comparison.
      expect(sameTree(reference.html), name).toBe(sameTree(optimised.html))
    })
  }
})

/**
 * L3's BLIND SPOT, graded absolutely because a differential cannot grade it at
 * all.
 *
 * `passes::run` gates `fold`, `fuse`, `anchor`, `walk`, `dedup`, `eta`, `hoist`,
 * `splice` and `flow`. It does not gate `analysis::bind`, `harvest`, `lower`, P2
 * `classify` or P4 `shape` — roughly 5000 lines of front end that both levels
 * and all three backends share, by design. Everything L3 says is of the form
 * "the two builds agree", so a front end that is wrong is wrong on both sides
 * and L3 stays green. That was measured, not feared: mutating `classify` so that
 * every tracked signal read comes out `React::Static` — the most consequential
 * single bug this compiler can have — left the whole `-O0` differential and the
 * whole Interp differential fully green.
 *
 * Gating `classify` would not fix it, and `CODESIGN.md` §6 now says why: the
 * pessimal choice for the reactivity analysis is not "assume nothing", it is a
 * DIFFERENT PROGRAM. With P2 skipped every patch stays the `Op::SetOpaque` /
 * `InsertPlan::Opaque` that P1 emitted, which `codegen::dom` passes to the
 * runtime UNWRAPPED — so `{count()}` is read once and `-O0` would be
 * non-reactive where `-Ox` is reactive. And forcing `Rx::OPAQUE` while still
 * resolving patches changes the props model instead: `getter_shaped` turns a
 * function prop into a getter, and `component-function-props` asserts, in
 * rendered DOM, that `props.cb === props.cb`. A knob that changes what the
 * program means is not an optimisation level.
 *
 * What grades the ungated front end is therefore an ABSOLUTE claim, and these
 * are the smallest ones that pin the decision the classifier makes: a tracked
 * read is LIVE wherever it is written, and a snapshot of one is not. They are
 * run in every live mode, so a backend that agrees with its siblings by all
 * being wrong fails here — and they are written in the DIRECT form, which is
 * exactly the form `fixtures/README.md` steers the corpus away from and the
 * reason only 9 fixtures noticed the mutant at all.
 */
const REACTIVITY_PROBES: Array<{ what: string; source: string; before: string; after: string }> = [
  {
    what: "a direct read in a child hole is live",
    source:
      'import { signal } from "@barqjs/core"\n' +
      "export const c = signal(1)\n" +
      'export default function P() { return <p class="probe">{c()}</p> }\n' +
      "export const steps = [() => c.set(2)]\n",
    before: '<p class="probe">1</p>',
    after: '<p class="probe">2</p>',
  },
  {
    what: "a direct read in an attribute is live",
    source:
      'import { signal } from "@barqjs/core"\n' +
      'export const c = signal("one")\n' +
      'export default function P() { return <p class="probe" title={c()}>x</p> }\n' +
      'export const steps = [() => c.set("two")]\n',
    before: '<p class="probe" title="one">x</p>',
    after: '<p class="probe" title="two">x</p>',
  },
  {
    what: "the explicit thunk the corpus is written in is live too",
    source:
      'import { signal } from "@barqjs/core"\n' +
      "export const c = signal(1)\n" +
      'export default function P() { return <p class="probe">{() => c()}</p> }\n' +
      "export const steps = [() => c.set(2)]\n",
    before: '<p class="probe">1</p>',
    after: '<p class="probe">2</p>',
  },
  {
    // B2. The REMOVAL half of a normalising channel's diff, which exists only
    // because the record slot holds what the channel returned. Downgrade
    // `Diff::Thread` to the plain `!==` guard and the channel is handed
    // `undefined` every run: it can still add `b`, and it can no longer take
    // `a` away. L3 is structurally blind to this — P2 `classify` is shared by
    // both levels and all three backends, so `-O0`, `-Ox` and `Interp` are
    // wrong in exactly the same way — which is why the probe is here.
    what: "a normalising channel still REMOVES what vanished",
    source:
      'import { signal } from "@barqjs/core"\n' +
      "export const on = signal(true)\n" +
      "export default function P() {\n" +
      "  return <p data-probe=\"yes\" classList={() => ({ a: on(), b: !on() })} />\n" +
      "}\n" +
      "export const steps = [() => on.set(false)]\n",
    before: '<p class="a" data-probe="yes"></p>',
    after: '<p class="b" data-probe="yes"></p>',
  },
  {
    what: "a normalising channel replaces its own class and keeps nothing stale",
    source:
      'import { signal } from "@barqjs/core"\n' +
      "export const on = signal(true)\n" +
      "export default function P() {\n" +
      '  return <p data-probe="yes" class={() => (on() ? "x" : "y")} />\n' +
      "}\n" +
      "export const steps = [() => on.set(false)]\n",
    before: '<p class="x" data-probe="yes"></p>',
    after: '<p class="y" data-probe="yes"></p>',
  },
  {
    what: "a snapshot of a read is NOT live, however reactive its source was",
    source:
      'import { signal } from "@barqjs/core"\n' +
      "export const c = signal(1)\n" +
      "const snapshot = c()\n" +
      'export default function P() { return <p class="probe">{snapshot}</p> }\n' +
      "export const steps = [() => c.set(2)]\n",
    before: '<p class="probe">1</p>',
    after: '<p class="probe">1</p>',
  },
]

describe("the front end L3 cannot grade, graded absolutely", () => {
  /**
   * The flag census, in the suite the mutation runner drives — because a flag
   * is the one thing in this pass that L3 structurally cannot grade.
   *
   * `-O0` emits no region at all, so the differential can only ever see a
   * flag's SYMPTOM. Dropping a proven flag has none by construction: the
   * program is correct and merely slower. SHIPPING an unproven one is a
   * miscompilation, and it had a symptom until M4b's gate round, when `insert`
   * began owning its render effect by the scope it was handed (O4.5) and the
   * DOM divergence `flow-ships-no-scope-unproven` was killed by on
   * `dashboard-composite` went away. The mutation is no less wrong; the
   * differential simply stopped being able to see it. This is the channel that
   * can, in both directions, and it is the reason it lives here as well as in
   * `optimality.test.ts` — one list, two suites, imported.
   */
  it("every flag the corpus emits is one the compiler proved", () => {
    expect(emittedFlags()).toEqual([...FLAG_CENSUS])
  })

  for (const mode of liveModes()) {
    for (const [index, probe] of REACTIVITY_PROBES.entries()) {
      it(`${mode}: ${probe.what}`, async () => {
        const render = await renderSource(probe.source, `rx-probe-${index}-${mode}`, mode as Mode)
        expect(render.html, `${probe.what}: initial render`).toBe(probe.before)
        expect(render.frames[0], `${probe.what}: after the signal was written`).toBe(probe.after)
      })
    }
  }
})

/**
 * The differential the fixture corpus cannot state: `listFixtures()` does not
 * enumerate `fixtures/semantics/`, so until now the L1 conformance corpus only
 * ever ran at `-Ox` and a level that changed a conformance VERDICT would have
 * gone unseen. The dangerous direction is the one that looks like good news — a
 * registered known failure going green at `-O0` — because `-O0` is about to
 * become the oracle's reference, and a reference that disagrees with the build
 * it is referencing is worth less than no reference at all.
 *
 * The comparison is on the verdict, not the DOM: each claim's rule and its
 * failure message, in order. None of the messages embeds a generated identifier,
 * and the one claim that reads the emitted text reports a component NAME, which
 * is level-invariant.
 */
describe("L3 — the -O0/-Ox differential over the L1 conformance corpus", () => {
  const shape = (run: FixtureRun): string[] =>
    run.outcomes.map((o) => `${o.claim} :: ${o.rule} :: ${o.failure ?? "HELD"}`)

  for (const name of listSemanticFixtures()) {
    it(`${name} reaches the same verdict at both levels`, async () => {
      const optimised = await runSemanticFixture(name)
      const reference = await runSemanticFixture(name, O0)

      expect(shape(reference), `${name}: -O0 changed a conformance verdict`).toEqual(
        shape(optimised),
      )
    })
  }
})
