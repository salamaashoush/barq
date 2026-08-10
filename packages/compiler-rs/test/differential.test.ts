/**
 * L3, drivers 2 and 3 — `CODESIGN.md` §6 L3.
 *
 * §6 L3 names three drivers for the `-O0`/`-Ox` differential. Driver 1, the
 * fixture corpus, is `optimisation.test.ts`. This file is the other two:
 *
 *  2. **a JSX generator** — random valid JSX, compiled both ways, diffed. See
 *     `generator.ts` for what it can and cannot express, and why each exclusion
 *     is there; Csmith's discipline is that a generated program must have ONE
 *     defined behaviour or a divergence teaches nothing.
 *  3. **EMI-style mutation** — a subtree the driver never renders is rewritten
 *     arbitrarily and the output must not move. See `emi.ts`.
 *
 * All three drivers diff the same channel set, which lives in `differential.ts`
 * along with the mode axis. `interp` joins that axis by itself the moment the
 * reference backend lands; until then this file says so out loud rather than
 * quietly testing two modes and calling it three.
 */

import { describe, expect, it } from "bun:test"

import {
  compareRenders,
  diffEveryMode,
  interpStatus,
  liveModes,
  oneSourceOrderExplainsBoth,
  renderSource,
  REFERENCE,
  type Mode,
} from "./differential.ts"
import { candidates, mutations, probed, PROBE_ATTRIBUTE, type Candidate } from "./emi.ts"
import { generate, generateMany } from "./generator.ts"
import { fixtureSource, listFixtures, type RenderResult } from "./harness.ts"

// ---------------------------------------------------------------------------
// the mode axis
// ---------------------------------------------------------------------------

describe("L3 — the mode axis", () => {
  it("always has a reference build and a subject build", () => {
    const modes = liveModes()
    expect(modes).toContain(REFERENCE)
    expect(modes).toContain("dom-Ox")
  })

  /**
   * Detected, never declared — and three-valued, which is the part that matters.
   *
   * A mode that is ABSENT is a fact about the milestone and skipping it is
   * correct. A mode that is BROKEN is a bug, and skipping it turns the suite
   * fail-open: the mutation experiment produced a compiler that panicked the
   * SSR backend on 106 fixtures and silently degraded `interp` to DOM codegen,
   * and a two-valued detector reported both as "has not landed" and went green.
   * This is the assertion that stops that.
   */
  it("never mistakes a broken backend for one that has not landed", () => {
    expect(interpStatus.state, interpStatus.refusal).not.toBe("broken")
    if (interpStatus.state === "live") {
      expect(liveModes()).toContain("interp" satisfies Mode)
      return
    }
    expect(interpStatus.refusal.length).toBeGreaterThan(0)
    expect(liveModes()).not.toContain("interp" satisfies Mode)
  })
})

// ---------------------------------------------------------------------------
// the attribute-order property
// ---------------------------------------------------------------------------

/**
 * The one channel that could not stay byte equality across levels, so the
 * relaxation is pinned by its own tests rather than taken on trust. If this
 * property ever stopped rejecting a reversed group, every claim the two
 * generative drivers make about attribute order would go quiet at once.
 */
describe("L3 — attribute order across two levels", () => {
  it("accepts the reordering P3 fold is entitled to produce", () => {
    // `-O0` applies the folded `title` after the clone; `-Ox` bakes it at its
    // source position. One source order — class,data-k,title,style,data-ev —
    // explains both.
    expect(
      oneSourceOrderExplainsBoth(
        ["class", "data-k", "data-ev", "title", "style"],
        ["class", "data-k", "title", "data-ev", "style"],
      ),
    ).toBe(true)
  })

  it("rejects a group emitted backwards, which is what the channel is for", () => {
    expect(oneSourceOrderExplainsBoth(["a", "b", "c"], ["c", "b", "a"])).toBe(false)
    expect(oneSourceOrderExplainsBoth(["a", "b", "c", "d"], ["a", "d", "c", "b"])).toBe(false)
  })

  it("rejects a missing or extra attribute", () => {
    expect(oneSourceOrderExplainsBoth(["a", "b"], ["a", "b", "c"])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// driver 2 — the JSX generator
// ---------------------------------------------------------------------------

const SEEDS = 150
const BASE_SEED = 1

/**
 * A generator that quietly stopped producing control flow, or components, or
 * events would leave every differential below green while testing a fraction of
 * what it claims to. The corpus has `optimality.test.ts` asserting its own
 * coverage for the same reason; this is that assertion for the generated half.
 */
const REQUIRED_FEATURES = [
  "Show",
  "For",
  "Index",
  "Switch/Match",
  "component boundary",
  "capture-free delegated handler",
  "capturing handler",
  "non-delegated handler",
  "constant hole",
  "constant attribute expression",
  "live attribute",
  "direct-read hole",
  "thunked hole",
  "adjacent holes",
  "style object",
  "classList object",
  "reassigned binding",
]

describe("L3 — the JSX generator", () => {
  const programs = generateMany(BASE_SEED, SEEDS)

  it("is deterministic: one seed is one program", () => {
    expect(generate(BASE_SEED + 7).source).toBe(generate(BASE_SEED + 7).source)
    expect(generate(BASE_SEED + 7).source).not.toBe(generate(BASE_SEED + 8).source)
  })

  /**
   * The other half of determinism, which the source comparison above does not
   * reach: one program, rendered twice in one process, produces one result. The
   * docstring claims it — nothing asserted it — and a generated program that
   * carried a `Math.random`, a `Date`, an iteration order or a leaked module
   * global would make every divergence below unattributable.
   */
  it("is deterministic the second way too: one program is one render", async () => {
    const program = generate(BASE_SEED + 3)
    const first = await renderSource(program.source, `${program.name}-determinism-a`)
    const second = await renderSource(program.source, `${program.name}-determinism-b`)
    expect(compareRenders(first, second, `${program.name} rendered twice`).join("\n")).toBe("")
    expect(second.runs).toEqual(first.runs)
  })

  it("covers every shape it claims to express", () => {
    const seen = new Set(programs.flatMap((program) => program.features))
    const missing = REQUIRED_FEATURES.filter((feature) => !seen.has(feature))
    expect(missing, `${SEEDS} seeds produced none of these`).toEqual([])
  })

  for (const program of programs) {
    it(`seed ${program.seed} renders identically in every mode`, async () => {
      const divergences = await diffEveryMode(program.source, program.name)
      expect(
        divergences.join("\n"),
        divergences.length === 0 ? "" : `\n${program.source}`,
      ).toBe("")
    })
  }
})

// ---------------------------------------------------------------------------
// driver 3 — EMI mutation
// ---------------------------------------------------------------------------

/**
 * How much of one fixture is mutated. EMI's value is in the SHAPE of the
 * mutation, not in the count, and every candidate costs a render per mode; the
 * cap keeps the whole driver inside a minute while still reaching a mutation in
 * most fixtures that have an unreached subtree at all.
 */
const CANDIDATES_PER_FIXTURE = 3

interface EmiOutcome {
  subject: string
  /** Candidates found, before liveness was decided. */
  found: number
  /** Of those, the ones no frame ever rendered. */
  unreached: number
  /** Mutations actually compiled and rendered, across every live mode. */
  applied: number
  /** Why the fixture could not be driven at all, if it could not. */
  refused?: string
}

/** The channels EMI holds fixed, which are strictly more than the level differential's. */
function compareUnderMutation(
  baseline: RenderResult,
  mutated: RenderResult,
  label: string,
): string[] {
  const out = compareRenders(baseline, mutated, label)
  // EMI's claim is byte-identical DOM, node identities AND effect counts. A
  // static rewrite of a subtree nothing renders may not create an effect, so
  // unlike the level differential this channel is an equality here.
  if (baseline.trace.created !== mutated.trace.created) {
    out.push(
      `${label}: effects created — baseline ${baseline.trace.created}, mutant ${mutated.trace.created}`,
    )
  }
  if (JSON.stringify(baseline.runs) !== JSON.stringify(mutated.runs)) {
    out.push(
      `${label}: effect runs — baseline ${JSON.stringify(baseline.runs)}, mutant ${JSON.stringify(mutated.runs)}`,
    )
  }
  return out
}

async function driveEmi(
  subject: string,
  source: string,
): Promise<{ outcome: EmiOutcome; divergences: string[] }> {
  const found = candidates(source)
  const outcome: EmiOutcome = { subject, found: found.length, unreached: 0, applied: 0 }
  if (found.length === 0) return { outcome, divergences: [] }

  // Every candidate probed at once, so deciding liveness costs ONE render
  // rather than one per candidate. The probe is an attribute that reaches the
  // DOM, and the fixture is driven through every step and every event, so a
  // subtree that appears in any frame is classified live.
  let live: Set<string>
  const baselines = new Map<Mode, RenderResult>()
  try {
    let marked = source
    // Right to left: an insertion must not move the offsets still to be used.
    for (let i = found.length - 1; i >= 0; i--) marked = probed(marked, found[i], i)
    const render = await renderSource(marked, `emi-probe-${subject}`)
    // `seen`, not the container frames: see `emi.ts` on why the container is the
    // unsound direction for Portal content and for a subtree that lives and dies
    // between two snapshots.
    const seen = render.seen
    live = new Set(
      [...seen.matchAll(new RegExp(`${PROBE_ATTRIBUTE}="(\\d+)"`, "g"))].map((m) => m[1]),
    )
    for (const mode of liveModes()) {
      baselines.set(mode, await renderSource(source, `emi-base-${subject}-${mode}`, mode))
    }
  } catch (error) {
    outcome.refused = error instanceof Error ? error.message : String(error)
    return { outcome, divergences: [] }
  }

  const unreached = found.filter((_, index) => !live.has(String(index)))
  outcome.unreached = unreached.length

  const divergences: string[] = []
  const chosen: Candidate[] = []
  // Spread across the fixture rather than taking the first few, which would
  // only ever reach whichever branch happens to be written first.
  const stride = Math.max(1, Math.floor(unreached.length / CANDIDATES_PER_FIXTURE))
  for (let i = 0; i < unreached.length && chosen.length < CANDIDATES_PER_FIXTURE; i += stride) {
    chosen.push(unreached[i])
  }

  for (const [at, candidate] of chosen.entries()) {
    for (const mutation of mutations(source, candidate)) {
      for (const mode of liveModes()) {
        const label = `${subject} @ ${mode}: ${mutation.operator} on <${candidate.tag}>`
        const tag = `emi-${subject}-${at}-${mutation.operator}-${mode}`
        let mutated: RenderResult
        try {
          mutated = await renderSource(mutation.source, tag, mode)
        } catch (error) {
          divergences.push(`${label}: the mutant did not compile or render — ${error}`)
          continue
        }
        outcome.applied++
        divergences.push(...compareUnderMutation(baselines.get(mode) as RenderResult, mutated, label))
      }
    }
  }
  return { outcome, divergences }
}

function report(outcomes: EmiOutcome[]): string {
  const refused = outcomes.filter((o) => o.refused !== undefined)
  return (
    `${outcomes.filter((o) => o.applied > 0).length}/${outcomes.length} subjects mutated, ` +
    `${outcomes.reduce((n, o) => n + o.unreached, 0)} unreached candidates, ` +
    `${outcomes.reduce((n, o) => n + o.applied, 0)} mutants run, ` +
    `${refused.length} refused: ${refused.map((o) => `${o.subject} (${o.refused})`).join("; ")}`
  )
}

describe("L3 — EMI mutation over the corpus", () => {
  const outcomes: EmiOutcome[] = []

  for (const fixture of listFixtures()) {
    it(`${fixture} is unchanged by rewriting what it never renders`, async () => {
      const { outcome, divergences } = await driveEmi(fixture, fixtureSource(fixture))
      outcomes.push(outcome)
      expect(divergences.join("\n")).toBe("")
    })
  }

  /**
   * The assertion that keeps the driver from going quiet — as an exact SET
   * rather than as a floor, because the floor was the weaker statement of the
   * two and it was being met by material that was not material.
   *
   * The corpus number is LOW, and that is a fact about the corpus rather than a
   * weakness of the driver: `fixtures/README.md` requires a fixture's `steps`
   * and `events` to be non-inert and `oracle.test.ts` fails a fixture whose
   * driver reaches nothing new, so the corpus renders every branch it contains.
   * It is lower than it was, for two reasons that both make the driver stronger:
   *
   *  - the scanner was desynchronised by `</tag>` (`stripLiterals` read the `/`
   *    of a closing tag as a regex opener), which HID real elements and INVENTED
   *    candidates inside string literals. 264 candidates became 372, and four of
   *    the nine "unreached" ones had been HTML inside an `ssrDiffers.markup`
   *    string — a textual rewrite of an SSR expectation that never reached the
   *    JSX path at all, counting toward the old floor.
   *  - liveness now reads `RenderResult.seen` — the whole document plus every
   *    template clone — instead of the container's frames, so `<Portal>` content
   *    and a subtree built and destroyed inside one step stop being classified
   *    unreached. Both were unsound in the direction that manufactures failures.
   *
   * What is left is five fixtures, named. Naming them is what a floor could not
   * do: a scanner that stops finding elements, a probe that stops reaching the
   * DOM, a liveness rule that drifts in either direction — each changes this set
   * and fails here. The anti-vacuity weight lives in the generated half below,
   * which carries dead material by construction.
   *
   * THREE JOINED AT M3, and the milestone is the reason. A JSX-valued `fallback`
   * or an unmatched branch body is a Block now (C6), so an untaken branch is
   * never invoked and its template is never cloned: control-flow-errored-loading
   * renders only its errored branch, dashboard-composite's `Show` fallback never
   * shows, and switch-match-component-bodies' `<Switch fallback>` never matches.
   * The eager ARGUMENT form built all three at the call site whether or not the
   * branch was entered, and `RenderResult.seen` counted the clone as reached —
   * so the material was live for the wrong reason. EMI's material GROWING is a
   * strengthening of the driver, which is why this stays an exact set.
   */
  it("mutates whatever unreached material the corpus has, and refuses none of it", () => {
    const detail = report(outcomes)
    expect(outcomes.length, detail).toBe(listFixtures().length)
    expect(outcomes.reduce((n, o) => n + o.found, 0), detail).toBeGreaterThan(300)
    expect(
      outcomes.filter((o) => o.unreached > 0).map((o) => o.subject).sort(),
      detail,
    ).toEqual([
      "control-flow-await-suspense",
      "control-flow-errored-loading",
      "dashboard-composite",
      "flow-prop-eta-boundary",
      "switch-match-component-bodies",
    ])
    expect(outcomes.reduce((n, o) => n + o.applied, 0), detail).toBeGreaterThan(8)
    // A subject this driver cannot render is a hole in the DRIVER, not a
    // property of the fixture, and it is named rather than tolerated.
    expect(outcomes.filter((o) => o.refused !== undefined).map((o) => o.subject), detail).toEqual([])
  })
})

/**
 * The same driver over generated programs, which is where EMI gets its material:
 * `generator.ts` emits subtrees guarded by a literal `false` and one component
 * that is declared and never called, so every one of the three shapes §6 L3
 * names — an untaken branch, an unselected body, an uninstantiated component —
 * is present by construction rather than by luck.
 */
describe("L3 — EMI mutation over generated programs", () => {
  const programs = generateMany(BASE_SEED + 10_000, 40)
  const outcomes: EmiOutcome[] = []

  for (const program of programs) {
    it(`seed ${program.seed} is unchanged by rewriting what it never renders`, async () => {
      const { outcome, divergences } = await driveEmi(program.name, program.source)
      outcomes.push(outcome)
      expect(divergences.join("\n"), divergences.length === 0 ? "" : `\n${program.source}`).toBe("")
    })
  }

  it("finds dead material in most generated programs", () => {
    const detail = report(outcomes)
    expect(outcomes.filter((o) => o.unreached > 0).length, detail).toBeGreaterThan(
      programs.length / 2,
    )
    expect(outcomes.reduce((n, o) => n + o.applied, 0), detail).toBeGreaterThan(100)
    expect(outcomes.filter((o) => o.refused !== undefined).map((o) => o.subject), detail).toEqual([])
  })
})
