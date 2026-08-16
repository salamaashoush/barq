/**
 * L4 — the grade table. `CODESIGN.md` §6 L4.
 *
 * > React's `itRenders` grades its properties (full equality on clean render,
 * > node identity across hydration, text-content-only on deliberately bad
 * > markup) and needs no exemption machinery as a result. barq applies near-total
 * > equality everywhere and buys exceptions back.
 *
 * The sentence names the mechanism, not merely the symptom. Near-total equality
 * has one grade for everything, so anything that legitimately differs has to be
 * bought out per fixture — and every exemption is a hole whose size nobody
 * measures. Three of them existed before this file, and M9 removed the source
 * of all three by removing the reference they were exemptions FROM:
 *
 *  - `FixtureModule.wins`, which turned a step's DOM comparison into "differs,
 *    and here is the exact markup it must differ into". Gone: the per-fixture
 *    rendered-DOM golden records every frame, not only the differing ones.
 *  - `oracle-known-failures.ts`, which turned a whole fixture's comparison into
 *    "diverges on exactly these channels". Gone with the reference: all 34 rows
 *    were `cause: "C1"` or `"C6"`, both of which are facts about an un-compiled
 *    path that no longer runs.
 *  - the two `if (oracle.channels[i].html !== compiled.channels[i].html)
 *    continue` guards — exemptions nobody had to write down, because the
 *    node-identity and attribute-order channels switched THEMSELVES off, per
 *    frame, precisely when the frames disagreed. Gone with the differential
 *    identity channel they lived on; the metamorphic one that replaces it has
 *    no such guard, and never had.
 *
 * `graded.test.ts` asserts that no file outside a channel's `where` emits that
 * channel's id, so two properties cannot silently collide on one row again —
 * which is how the guard above stayed invisible while the table read
 * `exemptions: []` for a channel two files were buying an exception out of.
 *
 * A GRADE is the alternative. Each channel gets the property it can actually
 * carry, stated once here, and the property is then unconditional within its own
 * premise. Where a premise is needed it is a fact about the fixture — a source
 * text, a declaration — never an observation of the frames the property is about.
 *
 * ## The table
 *
 * The seven channels of §6 L4, with the grade each is checked at and where the
 * checking lives. This module is the machine-readable copy; `graded.test.ts`
 * asserts it against the code rather than letting it become a comment that drifts.
 */

import { LEAK_RULES } from "./leaks.ts"

export type Grade =
  /** two implementations, or two optimisation levels, compared for equality */
  | "differential"
  /** one implementation compared against ITSELF under a transform of the input */
  | "metamorphic"
  /** hand-written expected numbers, per fixture; an optimality claim, never an equivalence */
  | "absolute"
  /** both sides read off the same artefact, so no reference is involved at all */
  | "self-check"
  /** one fused golden per fixture: a silent drop becomes a visible diff */
  | "golden"
  /** stated, and deliberately unchecked. The one honest answer when nothing can see it */
  | "ungraded"

export interface Channel {
  readonly id: string
  readonly grade: Grade
  /** the property, in the terms the grade is stated in */
  readonly property: string
  /**
   * What the property is allowed to assume. For every grade except `ungraded`
   * this must be a fact about the FIXTURE or the emitted module — never a
   * property of the frames being compared, which is what makes a check switch
   * itself off exactly where it is most wanted.
   */
  readonly premise: string
  /** where the check lives */
  readonly where: readonly string[]
  /**
   * Exemptions this channel honours. The point of the regrade is that most of
   * these are empty; a non-empty one is a claim about the channel's weakness,
   * written down rather than discovered.
   */
  readonly exemptions: readonly string[]
  /** rules from `SEMANTICS.md` this channel can report */
  readonly rules: readonly string[]
}

export const CHANNELS: readonly Channel[] = Object.freeze([
  {
    id: "rendered-dom",
    grade: "differential",
    property: "the DOM after every frame is byte-identical at -O0, at -Ox and through the IR interpreter",
    premise: "the same fixture, compiled three ways from one lowered IR",
    where: ["differential.test.ts", "optimisation.test.ts", "interp.test.ts"],
    exemptions: [],
    rules: ["C1"],
  },
  {
    id: "rendered-dom-golden",
    grade: "golden",
    property:
      "every frame the fixture drives, and every element's attribute line, recorded per fixture — so a change to what the compiler RENDERS is a visible diff rather than an agreement between two builds that moved together",
    premise: "none",
    where: ["oracle.test.ts", "__snapshots__/"],
    exemptions: [],
    rules: ["C1"],
  },
  {
    id: "node-identity",
    grade: "metamorphic",
    property:
      "a re-render with unchanged inputs preserves every node; a write that does not change a branch key preserves every node in that branch; a keyed move preserves the moved row's nodes",
    premise:
      "the transform is an unchanged input, decided from the fixture's own source text (a step that reads the signal it writes is an increment) or from a per-step declaration in fixtures/l4/",
    where: ["metamorphic.ts", "metamorphic.test.ts"],
    exemptions: [],
    rules: ["K2", "K6", "O3.5"],
  },
  {
    id: "node-identity-differential",
    grade: "differential",
    property:
      "a build with one thing deliberately broken keeps the nodes the CLEAN build of the same fixture kept, element for element — the detector that says the metamorphic channel above is not inert",
    premise:
      "the two renders are the same fixture through the same compiler, so the channel runs on every frame unconditionally and has nothing to buy out of",
    where: ["harness.ts compareRenders", "browser-differential.ts compareRuns", "oracle.test.ts"],
    exemptions: [],
    rules: ["K2", "K6"],
  },
  {
    id: "leaks",
    grade: "absolute",
    property:
      "after disposal: zero scopes still alive, zero effect runs, zero listeners still registered, zero continuations that fire, zero nodes still attached",
    premise: "the render was disposed inside the observation window",
    where: ["leaks.ts", "leaks.test.ts", "leak-known-failures.ts"],
    exemptions: [
      "leak-known-failures.ts — three rows, all B4, all one defect: dom.ts registers a non-delegated handler with bare addEventListener and removes none",
    ],
    rules: [...LEAK_RULES],
  },
  {
    id: "single-evaluation",
    grade: "absolute",
    property:
      "every built-in consumer invokes its Block exactly once per activation, and the log of invocations is the exact sequence the fixture declares",
    premise: "the fixture instruments its own Block",
    where: ["single-evaluation.test.ts", "fixtures/l4/"],
    exemptions: [],
    rules: ["C7"],
  },
  {
    id: "effect-counts",
    grade: "absolute",
    property:
      "per-fixture effect creations, total runs and busiest single effect, each an EQUALITY against a hand-written number",
    premise: "none — the numbers are written down, not derived from a second execution",
    where: ["effect-counts.ts", "effect-counts.test.ts", "optimality.test.ts"],
    exemptions: [],
    rules: ["O4"],
  },
  {
    id: "marker-layout",
    grade: "self-check",
    property:
      "the anchors in the live DOM equal the anchors the template clones attached to it bake in, and every baked anchor is named by an insert call",
    premise: "none — both sides come off the emitted module and the clones it produced",
    where: ["harness.ts auditCompiled", "oracle.test.ts", "browser-differential.ts"],
    exemptions: [],
    rules: ["K7"],
  },
  {
    id: "anchor-position",
    grade: "ungraded",
    property:
      "no layer compares WHERE a marker sits: `a<!---->b` and `a b<!---->` serialize identically, L3 must not compare it because -O0 turns elision off, and Interp reads the same anchor::run output",
    premise: "none — this is the statement that the property is unchecked",
    where: ["normalize.ts (header)", "CODESIGN.md §6 L4"],
    exemptions: [],
    rules: [],
  },
  {
    id: "fused-golden",
    grade: "golden",
    property:
      "emitted bytes, diagnostics and sourcemap are one snapshot per fixture, so a silently-dropped diagnostic or a corrupted mapping is a visible diff",
    premise: "none",
    where: ["optimality.test.ts", "roundtrip.test.ts", "diagnostics.test.ts", "__snapshots__/"],
    exemptions: [],
    rules: [],
  },
])

/**
 * Every rule the three L4 channels can report — the channel's declared REACH,
 * the same contract `ownership.ts`'s `CHANNEL_RULES` states for L2b. A rule
 * leaves this set only when the check that can produce it is deleted, which is
 * what lets `semantics.test.ts` compute what the whole oracle covers without a
 * hand-maintained column.
 */
export const L4_RULES: readonly string[] = Object.freeze([
  ...new Set(
    CHANNELS.filter((channel) => channel.where.some((file) => file.startsWith("metamorphic") || file.startsWith("leaks") || file.startsWith("single-evaluation")))
      .flatMap((channel) => channel.rules),
  ),
])

export function channel(id: string): Channel {
  const found = CHANNELS.find((c) => c.id === id)
  if (found === undefined) throw new Error(`no L4 channel called ${id}`)
  return found
}

/**
 * The count of exemptions the whole table honours. §6 L4's complaint is that
 * barq "buys exceptions back", so the number is printed on every run: a regrade
 * that quietly grew its exemption list has not regraded anything.
 */
export function exemptionCount(): number {
  return CHANNELS.reduce((total, c) => total + c.exemptions.length, 0)
}
