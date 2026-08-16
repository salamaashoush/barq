import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "bun:test"

import {
  duplicateRows,
  GATE_FIXTURES,
  KNOWN_FAILURES,
  registryIndex,
  registryKey,
  type KnownFailure,
} from "./known-failures.ts"
import { FIXTURE_DIR } from "./harness.ts"
import { L4_RULES } from "./graded.ts"
import { L4_DIR } from "./session.ts"
import { ADDRESS_CHANNEL_RULES } from "./addresses.ts"
import { HYDRATION_CHANNEL_RULES } from "./hydration.ts"
import { CHANNEL_RULES, OWNERSHIP_DIR } from "./ownership.ts"
import {
  documentedRules,
  indexedFixtures,
  listSemanticFixtures,
  SEMANTICS_DIR,
  namesRule,
  runSemanticFixture,
  type FixtureRun,
  type Outcome,
  documentedStatus,
  indexedStatuses,
  STATUS_LETTER,
} from "./semantics.ts"
import { FICTION_PINS, UNPINNED_RULES } from "./unpinned-rules.ts"
import { CURRENT_MILESTONE, OVERDUE_WHY, overdue } from "./milestone.ts"
import { digest, ratchet, regenerationReport } from "./ratchet.ts"

/**
 * Layer L1 of the oracle, run against the CURRENT compiler — `CODESIGN.md` §8's
 * M0 gate, and the only suite in this package that is expected to contain
 * failures. It does not contain them as `it.failing`, and it does not contain
 * them as skips: every claim below runs, and whether its outcome is acceptable
 * is decided by `known-failures.ts` alone.
 *
 * The gate is unusual and easy to get backwards, so, plainly:
 *
 * - a claim that FAILS and is registered is the intended state — the oracle can
 *   see a defect it is supposed to see;
 * - a claim that PASSES and is registered is a SUITE FAILURE. Either the bug
 *   was fixed without the registry being updated, or the claim never
 *   discriminated its rule and the oracle is blind where it reports sight;
 * - a claim that FAILS and is unregistered is a suite failure, which is what
 *   stops the registry absorbing anything by accident;
 * - a registered claim that fails for the wrong reason is a suite failure. The
 *   message must name its rule as a standalone token. "Expected <span>1</span>,
 *   got <span></span>" is not evidence that the oracle saw anything;
 * - a registered claim that fails DIFFERENTLY is a suite failure, and it is one
 *   whether the difference is a regression or an improvement. That is the
 *   ratchet, `ratchet.ts` says why, and it is the assertion that keeps a row's
 *   prose attached to an observation.
 *
 * The fixtures are run ONCE, here, and every assertion below reads that result.
 * They keep signals and counters at module scope and reset them per claim, so
 * re-running a fixture per assertion would be re-running the runtime, not
 * re-reading the observation.
 */

const RUNS: FixtureRun[] = []
for (const name of listSemanticFixtures()) {
  RUNS.push(await runSemanticFixture(name))
}

const DOCUMENTED = documentedRules()
const REGISTRY = registryIndex()

const OUTCOMES: Outcome[] = RUNS.flatMap((run) => run.outcomes)

/**
 * Every rule something executable can report: an L1 fixture that declares it,
 * the L2b ownership channel's declared reach, the address channel's, the
 * hydration channel's, or the L4 channels' — the metamorphic node-identity
 * grade, the leak oracle and the single-evaluation conformance, whose reach is
 * `graded.ts`'s `L4_RULES`.
 * Everything else in the document is prose, and `UNPINNED_RULES` is the
 * checked-in list of it.
 */
const PINNED = new Set<string>([
  ...RUNS.flatMap((run) => run.rules),
  ...CHANNEL_RULES,
  ...ADDRESS_CHANNEL_RULES,
  ...HYDRATION_CHANNEL_RULES,
  ...L4_RULES,
])

/**
 * Printed unconditionally, the way `ssr.test.ts` announces how many fixtures it
 * compared live. "Green except the known failures" is the state this suite
 * asserts, and a state nobody can read off the output is one a human ends up
 * eyeballing after all.
 */
const L1_DETAIL = join(import.meta.dir, ".l1-conformance.txt")

{
  const failed = OUTCOMES.filter((o) => o.failure !== null)
  const held = OUTCOMES.length - failed.length
  const byRule = new Map<string, number>()
  for (const o of failed) byRule.set(o.rule, (byRule.get(o.rule) ?? 0) + 1)
  const tally = [...byRule].sort().map(([rule, n]) => `${rule}×${n}`)
  const detail = failed.map((o) => {
    const row = REGISTRY.get(registryKey(o.fixture, o.claim))
    return (
      `${o.fixture} / ${o.claim}\n` +
      `  registered ${row?.rule ?? o.rule}, green at ${row?.greenAt ?? "?"}\n` +
      `  ${o.failure}`
    )
  })
  writeFileSync(L1_DETAIL, `${detail.join("\n\n")}\n`)
  console.log(
    `L1 conformance: ${RUNS.length} fixtures, ${OUTCOMES.length} claims — ` +
      `${failed.length} registered-and-still-failing, ${held} holding as controls\n` +
      `  the failures, by rule: ${tally.join(" ")}\n` +
      `  coverage: ${PINNED.size} of ${DOCUMENTED.size} documented rules have an executable ` +
      `channel; ${UNPINNED_RULES.length} have none (SEMANTICS.md §14 is the worklist)\n` +
      `  per-claim detail: ${L1_DETAIL} — kept off stdout, because a list of ` +
      `"<name> <sep> <name>" lines printed by a GREEN suite is read as bun's own failure format ` +
      `by anything scraping the log (BARQ_L1_DETAIL=1 prints it anyway)`,
  )
  if (process.env.BARQ_L1_DETAIL) for (const entry of detail) console.log(entry)
}

function report(outcome: Outcome, row: KnownFailure | undefined): string {
  const lines = [
    `  fixture   ${outcome.fixture}`,
    `  claim     ${outcome.claim}`,
    `  rule      ${outcome.rule} — ${outcome.says}`,
    `  observed  ${outcome.failure ?? "the claim held"}`,
  ]
  if (row) lines.push(`  registry  ${row.rule} ${row.status}, green at ${row.greenAt}: ${row.reason}`)
  else lines.push("  registry  no row")
  return `\n${lines.join("\n")}\n`
}

/**
 * The whole gate, as one pure function of an observation and the row that
 * addresses it. Returns `null` when the pair is acceptable and the message the
 * suite prints when it is not.
 *
 * It is pure so that every verdict can be driven from synthetic pairs
 * below. A gate whose own conditions are only ever exercised by the state the
 * repository happens to be in is a gate that has never been shown to close —
 * the same argument `oracle.test.ts` makes with its self-check corruptions.
 */
export function verdict(outcome: Outcome, row: KnownFailure | undefined): string | null {
  if (!row) {
    // Assertion 2. An unregistered claim must hold. This is the ordinary case,
    // and it is the one that keeps the registry from absorbing anything by
    // accident.
    if (outcome.failure === null) return null
    return (
      `${outcome.rule} failed and is NOT in the known-failure registry.` +
      report(outcome, row) +
      `\n  Either this is a new regression, or the registry needs a row — which is a deliberate ` +
      `act,\n  written into test/known-failures.ts with a reason and a milestone.\n`
    )
  }

  // Assertion 1. A registered claim that passes is stale, and it is stale in
  // one of two ways that both have to be seen.
  if (outcome.failure === null) {
    return (
      `STALE: ${row.rule} is registered as a known failure and the claim now PASSES.` +
      report(outcome, row) +
      `\n  If ${row.greenAt} landed this, delete the row — that is what a milestone's completion ` +
      `looks like.\n  If ${row.greenAt} has not landed, this claim never discriminated ` +
      `${row.rule} and the oracle is blind here.\n`
    )
  }

  // Assertion 3. Failing is not enough: it has to fail for the reason the
  // registry claims. A fixture that fails because it does not compile, or
  // because a signal was misspelled, is not evidence that the oracle can see
  // the bug.
  if (outcome.crashed) {
    return (
      `WRONG REASON: ${row.rule} is registered as a known failure, but the claim CRASHED instead ` +
      `of reporting a violation.` +
      report(outcome, row) +
      `\n  A crash is never evidence about a semantic rule. Fix the fixture.\n`
    )
  }
  if (!namesRule(outcome.failure, row.rule)) {
    return (
      `WRONG REASON: the failure does not name ${row.rule}.` +
      report(outcome, row) +
      `\n  A registered failure must fail naming its rule; this is the assertion that makes M0 ` +
      `mean anything.\n`
    )
  }

  // Assertion 7, the ratchet. Failing for the right rule is still not enough:
  // it has to fail the SAME WAY the row was written against. A partial fix
  // leaves the rule, the status and the milestone all correct and quietly
  // detaches the row's prose from what happens — which is what `CODESIGN.md`
  // §12 adopted from Solid's parity.test.js, and the one half none of this
  // project's three registries had.
  return ratchet({
    key: registryKey(outcome.fixture, outcome.claim),
    expected: row.observed,
    observed: outcome.failure,
    file: "test/known-failures.ts",
  })
}

// ---------------------------------------------------------------------------
// §15.2 assertion 4 — the document, the fixtures and the registry, in both
// directions. These run first because every assertion below is only meaningful
// once the rule IDs mean something.
// ---------------------------------------------------------------------------

describe("the registry, the fixtures and SEMANTICS.md agree", () => {
  it("SEMANTICS.md defines the rule IDs the registry is written in", () => {
    const undefined_ = KNOWN_FAILURES.filter((row) => !DOCUMENTED.has(row.rule))
    expect(
      undefined_.map((row) => `${registryKey(row.fixture, row.claim)} names ${row.rule}`),
    ).toEqual([])
  })

  it("SEMANTICS.md defines every rule the fixtures claim to pin", () => {
    const strays: string[] = []
    for (const run of RUNS) {
      for (const rule of run.rules) {
        if (!DOCUMENTED.has(rule)) strays.push(`${run.fixture} pins ${rule}`)
      }
    }
    expect(strays).toEqual([])
  })

  /**
   * §0.2 makes a status a claim about an OBSERVATION, and until now nothing
   * compared the two. That is how O2, X1, X3 and C6 stayed `VIOLATED` in the
   * document across three rounds in which their pinning fixtures passed, while
   * each round truthfully reported "rules moved: NONE" — a status nobody checks
   * is prose, and prose that contradicts the executable channel is worse than
   * an absent status, because a reader trusts it.
   *
   * Both directions. A rule the suite falsifies may not be recorded `HOLDS`,
   * and a rule every one of whose claims holds may not be left `VIOLATED` or
   * `PLANNED`. A rule with no L1 claim is not judged here — §14's worklist is
   * what tracks those.
   */
  it("no rule's Status contradicts what its own claims observe", () => {
    const status = documentedStatus()
    const byRule = new Map<string, { held: number; failed: number }>()
    for (const outcome of OUTCOMES) {
      const tally = byRule.get(outcome.rule) ?? { held: 0, failed: 0 }
      if (outcome.failure === null) tally.held++
      else tally.failed++
      byRule.set(outcome.rule, tally)
    }

    const drifted: string[] = []
    for (const [rule, tally] of byRule) {
      const recorded = status.get(rule)
      if (recorded === undefined) continue
      if (tally.failed === 0 && (recorded === "VIOLATED" || recorded === "PLANNED")) {
        drifted.push(
          `${rule} is recorded ${recorded} and all ${tally.held} of its L1 claims hold — ` +
            `move it to HOLDS with the observation that supports it`,
        )
      }
      if (tally.failed > 0 && recorded === "HOLDS") {
        drifted.push(
          `${rule} is recorded HOLDS and ${tally.failed} of its L1 claims fail — ` +
            `a status is a claim about an observation, and this one is falsified`,
        )
      }
    }
    expect(drifted).toEqual([])
  })

  it("each fixture's `rules` export is exactly the set of rules its claims carry", () => {
    const mismatched: string[] = []
    for (const run of RUNS) {
      const declared = [...new Set(run.rules)].sort()
      const claimed = [...new Set(run.outcomes.map((o) => o.rule))].sort()
      if (declared.join(",") !== claimed.join(",")) {
        mismatched.push(`${run.fixture}: declares [${declared}], its claims carry [${claimed}]`)
      }
    }
    expect(mismatched).toEqual([])
  })

  it("every registry row names the rule its claim declares", () => {
    const byClaim = new Map(OUTCOMES.map((o) => [registryKey(o.fixture, o.claim), o]))
    const wrong: string[] = []
    for (const row of KNOWN_FAILURES) {
      const outcome = byClaim.get(registryKey(row.fixture, row.claim))
      if (outcome && outcome.rule !== row.rule) {
        wrong.push(
          `${registryKey(row.fixture, row.claim)}: registry says ${row.rule}, the claim declares ${outcome.rule}`,
        )
      }
    }
    expect(wrong).toEqual([])
  })

  it("every registry row is well formed", () => {
    const malformed: string[] = []
    for (const row of KNOWN_FAILURES) {
      if (row.status !== "VIOLATED" && row.status !== "PLANNED") {
        malformed.push(`${registryKey(row.fixture, row.claim)}: status ${row.status}`)
      }
      if (!/^M[0-9]$/.test(row.greenAt)) {
        malformed.push(`${registryKey(row.fixture, row.claim)}: greenAt ${row.greenAt}`)
      }
      if (row.reason.trim().length < 40) {
        malformed.push(`${registryKey(row.fixture, row.claim)}: reason is too short to be one`)
      }
      if (!/^[0-9a-f]{12}$/.test(row.observed ?? "")) {
        malformed.push(
          `${registryKey(row.fixture, row.claim)}: observed ${row.observed ?? "(absent)"} is not a ` +
            "ratchet digest — run BARQ_RATCHET=print bun test",
        )
      }
    }
    expect(malformed).toEqual([])
  })

  it("no registry row is past the milestone it promised", () => {
    const late = KNOWN_FAILURES.filter((row) => overdue(row.greenAt)).map(
      (row) =>
        `OVERDUE: ${registryKey(row.fixture, row.claim)} promised green at ${row.greenAt} and is ` +
        `still ${row.status} at M${CURRENT_MILESTONE}`,
    )
    expect(late.join("\n"), OVERDUE_WHY).toBe("")
  })

  it("no claim has two rows", () => {
    expect(duplicateRows()).toEqual([])
  })

  it("says which documented rules nothing observes, and the list is checked in", () => {
    const unpinned = [...DOCUMENTED].filter((rule) => !PINNED.has(rule)).sort()
    const declared = [...UNPINNED_RULES].sort()
    const gained = declared.filter((rule) => !unpinned.includes(rule))
    const lost = unpinned.filter((rule) => !declared.includes(rule))
    expect(
      [
        ...gained.map((rule) => `+ ${rule} is now pinned — strike it off unpinned-rules.ts`),
        ...lost.map((rule) => `- ${rule} is documented and nothing observes it — add it, or pin it`),
      ].join("\n"),
      "SEMANTICS.md §0.3 calls the pinning bidirectional. This is the direction that was missing: " +
        "a rule added to the document with no fixture, or a fixture written without the rule " +
        "being struck off the unpinned list, is a diff either way.",
    ).toBe("")
  })

  it("marks a §13 fixture *(new)* if and only if it does not exist", () => {
    const roots = [FIXTURE_DIR, SEMANTICS_DIR, OWNERSHIP_DIR, L4_DIR]
    const wrong: string[] = []
    for (const entry of indexedFixtures()) {
      // A bench or a type-level test is not a fixture and has no .tsx on disk.
      if (entry.name.endsWith(".bench.ts") || entry.name.endsWith(".d.test.ts")) continue
      const base = entry.name.endsWith(".tsx") ? entry.name.slice(0, -4) : entry.name
      // A CHANNEL named in the fixture column — B7's real-browser caret check is
      // one — lives in this directory as a `.ts` and is checked for existence
      // exactly as a fixture is. The alternative is to name it in prose, which
      // is the same as not checking it.
      const onDisk = entry.name.endsWith(".ts")
        ? existsSync(join(import.meta.dir, entry.name))
        : roots.some((root) => existsSync(join(root, `${base}.tsx`)))
      if (onDisk && entry.isNew) {
        wrong.push(`${entry.rule}: ${base} is marked *(new)* and exists`)
      }
      if (!onDisk && !entry.isNew) {
        wrong.push(`${entry.rule}: ${base} is not marked *(new)* and does not exist`)
      }
    }
    expect(
      [...new Set(wrong)].join("\n"),
      "§13's fixture column is the one column a reader uses to tell a pinned rule from an " +
        "unpinned one, and it drifted: six cells still carried *(new)* for fixtures that had been " +
        "written. A hand-maintained coverage column that drifts reports coverage that does not exist.",
    ).toBe("")
  })

  /**
   * The four §13 cells that are one row about several rules. Written out rather
   * than derived, so adding a range row is a diff and not a silent widening of
   * what the checker is allowed not to read.
   */
  const RANGE_ROWS: Readonly<Record<string, readonly string[]>> = {
    "O3.1\u20133": ["O3.1", "O3.2", "O3.3"],
    "O3.4\u20135": ["O3.4", "O3.5"],
    "O4.1\u20132": ["O4.1", "O4.2"],
    "C3.1\u20135": ["C3.1", "C3.2", "C3.3", "C3.4", "C3.5"],
  }

  it("\u00a713's Status column says what the rule's own **Status.** line says", () => {
    const prose = documentedStatus()
    const index = indexedStatuses()
    const wrong: string[] = []
    const unreadable: string[] = []
    for (const [rule, cell] of index) {
      // A range row — `O3.1–3` — is one cell about several rules, and the prose
      // gives each of them its own word. Reading the row as a single ID left
      // four cells unchecked and, worse, made the SKIP invisible.
      for (const member of RANGE_ROWS[rule] ?? [rule]) {
        const word = prose.get(member)
        if (word === undefined) {
          unreadable.push(`${member} (§13 row ${rule}, cell "${cell}")`)
          continue
        }
        const letter = STATUS_LETTER[word]
        expect(
          letter,
          `SEMANTICS.md writes a status word §13 has no letter for: ${word}`,
        ).toBeString()
        if (!new RegExp(`(?<![A-Za-z])${letter}(?![A-Za-z])`).test(cell)) {
          wrong.push(`${member}: index says "${cell}", the rule's own **Status.** line says ${word}`)
        }
      }
    }
    expect(
      wrong.join("\n"),
      "§13 is the document's own summary and it is the first thing a reviewer reads. It disagreed " +
        "with the prose in 18 of 82 rows — O2, C6 and X1 were all listed VIOLATED while their own " +
        "sections said HOLDS — and nothing checked it, because the bidirectional pinning check " +
        "covers rule IDs and not statuses.",
    ).toBe("")
    // A row whose status the checker cannot READ is a row nobody reviews, and
    // for 21 of 82 rows — the whole ownership spine and the whole error spine —
    // that is what `if (word === undefined) continue` produced: a green suite
    // that structurally could not have been otherwise. It is now a reported
    // list rather than a silence, and the list has to be empty.
    expect(
      unreadable.join("\n"),
      "a §13 row with no prose **Status.** line to compare against is unreviewed, not agreed with",
    ).toBe("")
  })

  it("a rule whose prose claims HOLDS is pinned by a fixture that exists", () => {
    const prose = documentedStatus()
    const roots = [FIXTURE_DIR, SEMANTICS_DIR, OWNERSHIP_DIR, L4_DIR]
    const pins = new Map<string, string[]>()
    for (const entry of indexedFixtures()) {
      const list = pins.get(entry.rule) ?? []
      list.push(entry.name)
      pins.set(entry.rule, list)
    }
    const unbacked: string[] = []
    const fiction: string[] = []
    for (const [rule, named] of pins) {
      const word = prose.get(rule)
      if (word !== "HOLDS" && word !== "PARTIAL") continue
      const present = (name: string): boolean => {
        if (name.endsWith(".bench.ts") || name.endsWith(".d.test.ts")) return true
        if (name.endsWith(".md")) return existsSync(join(FIXTURE_DIR, "..", name))
        if (name.endsWith(".ts")) return existsSync(join(import.meta.dir, name))
        const base = name.endsWith(".tsx") ? name.slice(0, -4) : name
        return roots.some((root) => existsSync(join(root, `${base}.tsx`)))
      }
      if (!named.some(present)) {
        unbacked.push(`${rule} (${word}): ${named.join(", ")} — none of them exist`)
      }
      // EVERY named pin, not merely one of them. C6 named five and read HOLDS
      // while `sem-own-slot-arguments` — §13's own pin for the slot-parameter
      // half, and the half M4b's gate round found broken — did not exist. The
      // ones still missing are a checked-in list, not a silence.
      for (const name of named) {
        if (present(name)) continue
        const row = `${rule}: ${name.endsWith(".tsx") ? name.slice(0, -4) : name}`
        if (!FICTION_PINS.includes(row)) fiction.push(`+ ${row} is a named pin that does not exist`)
      }
    }
    for (const row of FICTION_PINS) {
      const [rule, name] = row.split(": ")
      const written = roots.some((root) => existsSync(join(root, `${name}.tsx`)))
      if (written) fiction.push(`- ${row} exists now — strike it off unpinned-rules.ts`)
      if (!pins.has(rule)) fiction.push(`- ${row} names a rule §13 no longer pins`)
    }
    expect(
      unbacked.join("\n"),
      "45 of the 96 fixtures §13 names had no file anywhere, and for three rules EVERY named pin " +
        "was absent while the prose read HOLDS. The *(new)* marker is machine-checked; existence " +
        "was not, so a rule could claim to hold on the strength of a fixture nobody had written.",
    ).toBe("")
    expect(
      fiction.join("\n"),
      "`.some(...)` let a rule hold on a SIBLING's evidence while the pin for the half in question " +
        "was fiction. Every named pin is checked now, and the ones still unwritten are a registry " +
        "row rather than a silence — bidirectionally, so writing one is a diff either way.",
    ).toBe("")
  })

  it("the registry is frozen, so nothing can widen it at run time", () => {
    expect(Object.isFrozen(KNOWN_FAILURES)).toBe(true)
    expect(KNOWN_FAILURES.every((row) => Object.isFrozen(row))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// §15.2 assertions 1-3 — one test per claim, so the failure the suite prints is
// the claim's own message rather than a count.
// ---------------------------------------------------------------------------

describe("the L1 conformance claims", () => {
  for (const run of RUNS) {
    describe(run.fixture, () => {
      for (const outcome of run.outcomes) {
        const row = REGISTRY.get(registryKey(outcome.fixture, outcome.claim))
        const label = row
          ? `${outcome.claim} — KNOWN ${row.rule} ${row.status}, green at ${row.greenAt}`
          : outcome.claim

        it(label, () => {
          const complaint = verdict(outcome, row)
          if (complaint !== null) throw new Error(complaint)
        })
      }
    })
  }
})

// ---------------------------------------------------------------------------
// The gate's own self-check. Every assertion above is a condition on a state
// this repository is not currently in, and a condition nothing ever satisfies
// is indistinguishable from one that is never evaluated. These drive the real
// verdict function with a real observation and a mutated row.
// ---------------------------------------------------------------------------

describe("the gate closes", () => {
  const failing = OUTCOMES.find((o) => o.failure !== null)
  const holding = OUTCOMES.find((o) => o.failure === null)
  if (!failing || !holding) {
    throw new Error("the self-check needs one failing and one holding claim; the corpus has both")
  }
  const rowFor = (o: Outcome): KnownFailure =>
    REGISTRY.get(registryKey(o.fixture, o.claim)) ?? {
      fixture: o.fixture,
      claim: o.claim,
      rule: o.rule,
      status: "VIOLATED",
      greenAt: "M3",
      reason: "synthetic row, used only by the self-check below",
      observed: digest(o.failure ?? ""),
    }

  it("accepts a registered failure that names its rule", () => {
    expect(verdict(failing, rowFor(failing))).toBeNull()
  })

  it("accepts an unregistered claim that holds", () => {
    expect(verdict(holding, undefined)).toBeNull()
  })

  it("rejects a failure with no row", () => {
    expect(verdict(failing, undefined)).toContain("NOT in the known-failure registry")
  })

  it("rejects a registered claim that has started passing", () => {
    expect(verdict(holding, rowFor(failing))).toContain("STALE")
  })

  it("rejects a registered failure that crashed instead of reporting", () => {
    expect(verdict({ ...failing, crashed: true }, rowFor(failing))).toContain("WRONG REASON")
  })

  it("rejects a registered failure whose message names no rule", () => {
    const mute = { ...failing, failure: "Expected <span>1</span>, got <span></span>" }
    expect(verdict(mute, rowFor(failing))).toContain("does not name")
  })

  it("rejects a registered failure that names a DIFFERENT rule", () => {
    const other = rowFor(failing).rule === "O2" ? "O5" : "O2"
    expect(verdict(failing, { ...rowFor(failing), rule: other })).toContain("does not name")
  })

  // The ratchet's own three conditions, driven the same way. An IMPROVEMENT is
  // asserted separately from a regression because failing on improvement is the
  // half `CODESIGN.md` §12 says this project did not have, and "it fails on any
  // change" is not the same statement as "it fails when the news is good".
  it("rejects a registered failure that now fails DIFFERENTLY", () => {
    const worse = { ...failing, failure: `${failing.failure} and one more thing besides` }
    expect(verdict(worse, rowFor(failing))).toContain("RATCHET")
  })

  it("rejects a registered failure that got BETTER without being deregistered", () => {
    // The C3.8 shape: still failing, still naming its rule, fewer pairs. Every
    // other assertion in this file is satisfied by this observation.
    const better = {
      ...failing,
      failure: `${failing.rule} violated: 2 of 18 (shape, slot) pairs took a Block and did not throw`,
    }
    expect(verdict(better, rowFor(failing))).toContain("RATCHET")
  })

  it("rejects a registered failure whose row carries no digest at all", () => {
    const unratcheted = { ...rowFor(failing), observed: undefined as unknown as string }
    expect(verdict(failing, unratcheted)).toContain("NO RATCHET")
  })

  it("does not accept O2.1 as evidence for O2", () => {
    // `includes("O2")` is satisfied by `O2.1`, and they are different rules
    // with different statuses. Conflating them is exactly what assertion 3 is
    // for, so the token match is asserted rather than assumed.
    expect(namesRule("O2.1 violated: …", "O2")).toBe(false)
    expect(namesRule("O2 violated: …", "O2")).toBe(true)
    expect(namesRule("E2.1 violated: …", "E2")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// §15.2 assertion 5 — a row that matches no claim.
// ---------------------------------------------------------------------------

describe("the registry has no rows left over", () => {
  it("every row addresses a claim that actually ran", () => {
    const ran = new Set(OUTCOMES.map((o) => registryKey(o.fixture, o.claim)))
    const orphans = KNOWN_FAILURES.filter(
      (row) => !ran.has(registryKey(row.fixture, row.claim)),
    ).map((row) => registryKey(row.fixture, row.claim))
    expect(orphans).toEqual([])
  })

  it("every fixture on disk was run", () => {
    expect(RUNS.map((r) => r.fixture)).toEqual(listSemanticFixtures())
  })
})

// ---------------------------------------------------------------------------
// §15.4 — the fixtures the gate is really about. Stated separately from the
// rows so that deleting a row cannot quietly delete the gate with it.
//
// At M0 this block asserted these fixtures FAIL on these rules: if the oracle
// could not see the bug that prompted the redesign, the oracle was worthless
// and nothing else could start. M3 is the milestone that fixes the bug, so the
// same list now asserts the opposite — every listed rule HOLDS, and holds
// through a claim that ran rather than through a claim that was skipped.
//
// The direction flipped; the list did not. That is why it is written down
// separately from the rows: a regression on any of these nine is a suite
// failure with the rule named, not a fixture that quietly stopped exercising
// anything. M0's proof that the oracle could see the bug is the 24 rows the
// registry carried, each with the observation it made.
// ---------------------------------------------------------------------------

describe("the M3 gate", () => {
  const REQUIRED: Record<string, string[]> = {
    "sem-ctx-provider-direct-child": ["O2", "O2.1", "X1", "C6"],
    "sem-ctx-provider-wrapper-component": ["O2", "O2.1", "X1"],
    "sem-err-construction-throw": ["E2.1", "O4.4"],
  }

  it("names the gate fixtures the registry and SEMANTICS.md §15.4 agree on", () => {
    expect([...GATE_FIXTURES].sort()).toEqual(Object.keys(REQUIRED).sort())
  })

  for (const [fixture, rules] of Object.entries(REQUIRED)) {
    for (const rule of rules) {
      it(`${fixture} holds on ${rule}`, () => {
        const claims = OUTCOMES.filter((o) => o.fixture === fixture && o.rule === rule)
        if (claims.length === 0) {
          throw new Error(
            `the gate fixture ${fixture} makes no claim about ${rule} any more.\n` +
              `  A gate that stopped asking is indistinguishable from a gate that passed ` +
              `(SEMANTICS.md §15.4).\n`,
          )
        }
        for (const outcome of claims) {
          if (outcome.failure !== null) {
            throw new Error(
              `the gate fixture ${fixture} still fails on ${rule}.\n` +
                `  claim     ${outcome.claim}\n` +
                `  observed  ${outcome.failure}\n` +
                `  This is the defect the whole redesign exists for. M3 is where it closes.\n`,
            )
          }
        }
      })
    }
  }

  it("each gate fixture also carries a control claim that HOLDS", () => {
    for (const fixture of GATE_FIXTURES) {
      const held = OUTCOMES.filter((o) => o.fixture === fixture && o.failure === null)
      if (held.length === 0) {
        throw new Error(
          `${fixture} has no passing control claim. Without one, its failures are evidence that ` +
            `something is broken but not evidence about WHAT: the explicit-thunk form is what ` +
            `attributes them to the direct form.`,
        )
      }
    }
  })
})

// `BARQ_RATCHET=print` collects the digests the stale rows should carry and
// prints them once, at exit, rather than one line per failing claim — a
// regeneration is a single edit to a single table and should read like one.
process.on("exit", () => {
  const report = regenerationReport()
  if (report) console.log(report)
})
