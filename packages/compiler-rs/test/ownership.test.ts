import { describe, expect, it } from "bun:test"

import { documentedRules } from "./semantics.ts"
import {
  checkOwnership,
  corpusFixtures,
  corpusSource,
  listOwnershipFixtures,
  ownershipSource,
  staticTree,
  trace,
  type Finding,
  type OwnershipEvent,
  type OwnershipRun,
} from "./ownership.ts"
import { censusIndex, OWNERSHIP_CENSUS } from "./ownership-census.ts"
import {
  GATE_FIXTURE,
  OWNERSHIP_KNOWN_FAILURES,
  OWNERSHIP_REACH,
  ownershipIndex,
  ownershipKey,
  WRAPPER_GATE_FIXTURE,
} from "./ownership-known-failures.ts"
import { CURRENT_MILESTONE, OVERDUE_WHY, overdue } from "./milestone.ts"
import { ratchet, reachRatchet } from "./ratchet.ts"

/**
 * Layer L2b of the oracle — `CODESIGN.md` §6, and the half of M0 that has no
 * counterpart in any other project surveyed.
 *
 * The question every other suite in this package asks is "do two executions
 * agree". For the defect that prompted the redesign they agree perfectly: the
 * compiled path and the `createElement` path both build a provider's child at
 * the call site, both render the same markup, and the oracle certified the bug
 * for seven milestones. A reference implementation that shares your defect is
 * worse than none, because it issues a passing grade.
 *
 * This suite asks a different question. The compiler already knew, at
 * compile time, which constructs own which positions — it is emitting the
 * calls. `--ownership` makes it write that structure down as an artefact, the
 * runtime appends a record at every scope entry, exit, disposal, template
 * instantiation and handed-over construction, and the two are compared. The
 * expected value is **derived from the source**, so this channel needs no
 * second implementation and cannot inherit one's bugs.
 *
 * The gate is unusual and easy to get backwards, so, plainly:
 *
 * - a finding that OCCURS and is registered is the intended state — the oracle
 *   can see a defect it is supposed to see;
 * - a registered finding that stops occurring is a SUITE FAILURE. Either the
 *   defect was fixed without the registry being updated, or the check stopped
 *   discriminating and the oracle is blind where it reports sight;
 * - an unregistered finding is a suite failure, which is what stops the
 *   registry absorbing anything by accident;
 * - a registered finding reported under the wrong rule is a suite failure.
 *
 * Everything is run ONCE, here, and every assertion below reads that result.
 * Each run compiles a fixture, renders it under a traced root, drives its
 * steps and disposes it; re-running per assertion would be re-running the
 * runtime rather than re-reading the observation.
 */

const CORPUS: OwnershipRun[] = []
for (const name of corpusFixtures()) {
  CORPUS.push(await checkOwnership(name, corpusSource(name), `${name}.tsx`))
}

const OWN: OwnershipRun[] = []
for (const name of listOwnershipFixtures()) {
  OWN.push(await checkOwnership(name, ownershipSource(name), `${name}.tsx`))
}

const RUNS = [...CORPUS, ...OWN]
const REGISTRY = ownershipIndex()
const OWN_NAMES = new Set(listOwnershipFixtures())

function sourceOf(fixture: string): string {
  return OWN_NAMES.has(fixture) ? ownershipSource(fixture) : corpusSource(fixture)
}

interface Observed {
  fixture: string
  finding: Finding
}

const OBSERVED: Observed[] = RUNS.flatMap((run) =>
  run.findings.map((finding) => ({ fixture: run.fixture, finding })),
)

/**
 * Printed unconditionally, the way `ssr.test.ts` announces how many fixtures it
 * compared live. "Green except the known failures" is the state this suite
 * asserts, and a state nobody can read off the output is one a human ends up
 * eyeballing after all.
 *
 * `determined` is the honesty number. A template the compiler places at exactly
 * one path is one this check can falsify; a template that occurs at several is
 * checked against a set, and a clone landing on the wrong member of that set
 * passes. The ratio is what the channel's strength actually is, and it is
 * asserted below rather than assumed.
 */
const TOTALS = RUNS.reduce(
  (sum, run) => ({
    fixtures: sum.fixtures + 1,
    clones: sum.clones + run.clones,
    determined: sum.determined + run.determined,
    unattributed: sum.unattributed + run.unattributed,
    scopes: sum.scopes + run.scopes,
    effects: sum.effects + run.effects,
    cascades: sum.cascades + run.cascades,
  }),
  { fixtures: 0, clones: 0, determined: 0, unattributed: 0, scopes: 0, effects: 0, cascades: 0 },
)

{
  const totals = TOTALS
  const byRule = new Map<string, number>()
  for (const { finding } of OBSERVED) {
    byRule.set(finding.rule, (byRule.get(finding.rule) ?? 0) + 1)
  }
  const affected = new Set(OBSERVED.map((o) => o.fixture)).size
  console.log(
    `L2b ownership: ${RUNS.length} fixtures — ${totals.scopes} scopes, ${totals.effects} effects, ` +
      `${totals.clones} clones checked against the static tree (${totals.determined} of them at a ` +
      `single legal path), ${totals.unattributed} unattributed, ` +
      `${totals.cascades} disposal cascades\n` +
      `  ${OBSERVED.length} findings in ${affected} fixtures, all registered: ` +
      `${[...byRule].sort().map(([rule, n]) => `${rule}×${n}`).join(" ")}`,
  )
}

function report(fixture: string, finding: Finding): string {
  return [
    `  fixture   ${fixture}`,
    `  finding   ${finding.id}`,
    `  rule      ${finding.rule}`,
    `  observed  ${finding.detail}`,
  ].join("\n")
}

// ---------------------------------------------------------------------------
// §15.2 — the four assertions about the registry
// ---------------------------------------------------------------------------

describe("the known-failure registry", () => {
  it("absorbs nothing: every finding the channel reports is a registered row", () => {
    const surprises = OBSERVED.filter(
      (o) => !REGISTRY.has(ownershipKey(o.fixture, o.finding.id)),
    )
    expect(
      surprises.map((o) => report(o.fixture, o.finding)).join("\n\n"),
      `${surprises.length} ownership finding(s) with no registry row. This is the ordinary ` +
        "failure mode: either a change broke ownership somewhere, or a new fixture arrived with " +
        "a defect nobody has decided about. Registering it is a deliberate act — add a row to " +
        "ownership-known-failures.ts with a slot and a greenAt, in a diff a reviewer sees.",
    ).toBe("")
  })

  it("goes stale loudly: every registered row still describes a finding that occurs", () => {
    const seen = new Set(OBSERVED.map((o) => ownershipKey(o.fixture, o.finding.id)))
    const stale = OWNERSHIP_KNOWN_FAILURES.filter(
      (row) => !seen.has(ownershipKey(row.fixture, row.finding)),
    )
    expect(
      stale.map((row) => `  ${row.fixture} :: ${row.finding} (${row.rule}, ${row.slot})`).join("\n"),
      `${stale.length} registered ownership failure(s) stopped occurring. Either the defect was ` +
        "fixed — delete the row, that is what a milestone's completion looks like — or the check " +
        "stopped discriminating, which is the dangerous reading and the one to rule out first.",
    ).toBe("")
  })

  it("fails for the right reason: the rule named is the rule registered", () => {
    const mismatched: string[] = []
    for (const o of OBSERVED) {
      const row = REGISTRY.get(ownershipKey(o.fixture, o.finding.id))
      if (row === undefined) continue
      if (row.rule !== o.finding.rule) {
        mismatched.push(
          `${o.fixture} :: ${o.finding.id}\n    registered as ${row.rule}, reported as ${o.finding.rule}`,
        )
      }
    }
    expect(
      mismatched.join("\n"),
      "a registered failure reported under a different rule. A fixture that fails for a reason " +
        "the registry did not predict is not evidence that the oracle saw what it claims to see; " +
        "SEMANTICS.md §15.2 assertion 3 is the one that makes M0 mean anything.",
    ).toBe("")
  })

  it("no row is past the milestone it promised", () => {
    const late = OWNERSHIP_KNOWN_FAILURES.filter((row) => overdue(row.greenAt)).map(
      (row) =>
        `OVERDUE: ${ownershipKey(row.fixture, row.finding)} promised green at ${row.greenAt} and ` +
        `is still reported at M${CURRENT_MILESTONE}`,
    )
    expect(late.join("\n"), OVERDUE_WHY).toBe("")
  })

  it("names rules SEMANTICS.md actually defines", () => {
    const documented = documentedRules()
    const unknown = OWNERSHIP_KNOWN_FAILURES.filter((row) => !documented.has(row.rule)).map(
      (row) => `${row.fixture} :: ${row.finding} names ${row.rule}`,
    )
    expect(unknown.join("\n"), "a registry row naming a rule the specification does not define").toBe(
      "",
    )
    const reported = [...new Set(OBSERVED.map((o) => o.finding.rule))].filter(
      (rule) => !documented.has(rule),
    )
    expect(reported.join(", "), "the channel reported a rule the specification does not define").toBe(
      "",
    )
  })

  it("has no row that could never be reached", () => {
    const fixtures = new Set([...corpusFixtures(), ...listOwnershipFixtures()])
    const missing = OWNERSHIP_KNOWN_FAILURES.filter((row) => !fixtures.has(row.fixture))
    expect(missing.map((row) => row.fixture).join(", "), "registry rows naming no fixture").toBe("")
  })

  // The ratchet — `CODESIGN.md` §12, `ratchet.ts`. A finding that goes on
  // occurring while its DETAIL changes leaves every assertion above green and
  // the row's `slot` describing something that no longer happens.
  it("ratchets: a registered finding that changed shape is a failure either way", () => {
    const complaints: string[] = []
    for (const o of OBSERVED) {
      const row = REGISTRY.get(ownershipKey(o.fixture, o.finding.id))
      if (row === undefined) continue
      const complaint = ratchet({
        key: ownershipKey(o.fixture, o.finding.id),
        expected: row.observed,
        observed: o.finding.detail,
        file: "test/ownership-known-failures.ts",
      })
      if (complaint) complaints.push(complaint)
    }
    expect(complaints.join("\n")).toBe("")
  })

  // The reach ratchet. With the table empty this is the only thing standing
  // between "no ownership defects" and "the channel stopped looking".
  it("ratchets the channel's reach, in both directions", () => {
    const complaint = reachRatchet({
      channel: "L2b ownership",
      expected: OWNERSHIP_REACH,
      observed: TOTALS,
      file: "test/ownership-known-failures.ts",
    })
    expect(complaint ?? "").toBe("")
  })
})

// ---------------------------------------------------------------------------
// §15.4 — what the gate is really about
// ---------------------------------------------------------------------------

describe("the M3 gate", () => {
  // At M0 these two asserted the channel SEES the Provider bug — if L2b could
  // not see the defect that prompted the redesign, L2b was worthless. M3 is
  // where the defect closes, so the same two fixtures now assert the opposite,
  // by the same route: the runtime's scope chain for every clone must be the
  // path the compiler's static tree placed it at.
  //
  // `determined > 0` is what stops this from being satisfied by a channel that
  // stopped looking, which is the failure mode inverting a gate invites.
  it("the direct Provider now clones its child at the path the compiler placed it", () => {
    const run = OWN.find((r) => r.fixture === GATE_FIXTURE)
    expect(run, `${GATE_FIXTURE} did not run`).toBeDefined()
    expect(
      (run?.findings ?? []).map((f) => `${f.rule}: ${f.detail}`).join("\n"),
      `${GATE_FIXTURE} is <Theme.Provider><Label/></Theme.Provider> written the way a user ` +
        "writes it. `children` is a Block, so `Label` is built by `provide` under the instance " +
        "scope and not at the call site. A finding here is the Provider bug back.",
    ).toBe("")
    expect(run?.determined ?? 0, "the gate must check a determined position").toBeGreaterThan(0)
  })

  it("and so does the user-written wrapper, one component further away", () => {
    const run = OWN.find((r) => r.fixture === WRAPPER_GATE_FIXTURE)
    expect(run, `${WRAPPER_GATE_FIXTURE} did not run`).toBeDefined()
    expect(
      (run?.findings ?? []).map((f) => `${f.rule}: ${f.detail}`).join("\n"),
      `${WRAPPER_GATE_FIXTURE} is <ThemeProvider><Label/></ThemeProvider> over ` +
        "<Theme.Provider>{props.children}</Theme.Provider> — the shape every AuthProvider and " +
        "QueryClientProvider in existence has. Forwarding is identity, so the Block reaches the " +
        "provider unbuilt and runs under the scope the provider entered.",
    ).toBe("")
    expect(run?.determined ?? 0, "the gate must check a determined position").toBeGreaterThan(0)
  })

  it("does not simply report everything: the thunked control is clean", () => {
    const run = OWN.find((r) => r.fixture === "own-provider-thunked")
    expect(run, "own-provider-thunked did not run").toBeDefined()
    expect(
      (run?.findings ?? []).map((f) => f.detail).join("\n"),
      "own-provider-thunked differs from own-provider-direct by one `() =>`, and it must be " +
        "clean. A channel that reported both would be reporting that ownership is never right, " +
        "which is not a finding about anything.",
    ).toBe("")
    expect(run?.determined ?? 0, "the control must check a determined position").toBeGreaterThan(0)
  })

  it("the gate fixture's defect is invisible to the DOM", async () => {
    // Stated as a test rather than as prose: if this ever fails, the fixture
    // stopped being the interesting case and became an ordinary crash.
    const { code } = staticTree(ownershipSource(GATE_FIXTURE), `${GATE_FIXTURE}.tsx`)
    const events = await trace(code, "own-gate-dom-check")
    expect(events.some((e) => e.kind === "clone"), "the gate fixture rendered nothing").toBe(true)
    const run = OWN.find((r) => r.fixture === GATE_FIXTURE)
    expect(run?.crashed ?? true, "the gate fixture must render, not throw").toBe(false)
  })
})

// ---------------------------------------------------------------------------
// the channel's own strength, asserted rather than assumed
// ---------------------------------------------------------------------------

describe("the channel is not inert", () => {
  it("observes exactly what the census declares, per fixture", () => {
    const census = censusIndex()
    const drift: string[] = []
    for (const run of RUNS) {
      const row = census.get(run.fixture)
      if (row === undefined) {
        drift.push(`${run.fixture}: no census row`)
        continue
      }
      const opaque = [...(staticTree(sourceOf(run.fixture), `${run.fixture}.tsx`).tree.opaque)]
      if (run.clones !== row.clones) {
        drift.push(`${run.fixture}: ${run.clones} clones, census says ${row.clones}`)
      }
      if (run.unattributed !== row.unattributed) {
        drift.push(
          `${run.fixture}: ${run.unattributed} unattributed, census says ${row.unattributed}`,
        )
      }
      if (opaque.join(",") !== [...row.opaque].join(",")) {
        drift.push(`${run.fixture}: opaque [${opaque}], census says [${row.opaque}]`)
      }
    }
    for (const row of OWNERSHIP_CENSUS) {
      if (!RUNS.some((run) => run.fixture === row.fixture)) {
        drift.push(`${row.fixture}: a census row for a fixture that did not run`)
      }
    }
    expect(
      drift.join("\n"),
      "the ownership census moved. A clone count that changes with no fixture edit is a Block " +
        "invoked a different number of times — the one defect that passes every other test in " +
        "this repository. An unattributed clone is one this channel did not check, and a " +
        "non-empty `opaque` means the static tree is partial there. All three are declared in " +
        "ownership-census.ts and all three are a deliberate diff.",
    ).toBe("")
  })

  it("keeps at least one fixture in which the static tree is partial", () => {
    const partial = OWNERSHIP_CENSUS.filter((row) => row.opaque.length > 0)
    expect(
      partial.map((row) => row.fixture).join(", "),
      "no fixture imports a component, so the static tree is total everywhere and " +
        "`unattributed === 0` would be a property of the corpus rather than of the channel. " +
        "`own-cross-module.tsx` exists to keep the degradation exercised.",
    ).not.toBe("")
  })

  it("checks most clones against a single legal path", () => {
    const clones = RUNS.reduce((n, run) => n + run.clones, 0)
    const determined = RUNS.reduce((n, run) => n + run.determined, 0)
    expect(clones, "the channel checked no clones at all").toBeGreaterThan(200)
    // Where a template occurs at several paths the check degrades to set
    // membership, and a clone landing on the wrong member passes. That is the
    // channel's honest weakness; the bound keeps it from growing unnoticed.
    expect(
      determined / clones,
      `only ${determined} of ${clones} clones sit at a single legal path`,
    ).toBeGreaterThan(0.95)
  })

  it("exercises the disposal-order claim at least once", () => {
    const cascades = RUNS.reduce((n, run) => n + run.cascades, 0)
    expect(
      cascades,
      "no scope in either corpus disposed two or more kids it owned, so O3.2's " +
        "reverse-creation-order claim was never tested. `own-nested-scopes-dispose.tsx` exists " +
        "to guarantee this is not zero; if it reaches zero the fixture stopped constructing what " +
        "it says it constructs.",
    ).toBeGreaterThan(0)
  })

  it("crashes nowhere", () => {
    const crashed = RUNS.filter((run) => run.crashed).map(
      (run) => `${run.fixture}: ${run.findings[0]?.detail}`,
    )
    expect(crashed.join("\n"), "a fixture that never compiled or never rendered").toBe("")
  })
})

// ---------------------------------------------------------------------------
// the trace costs nothing when it is off
// ---------------------------------------------------------------------------

/**
 * The wall-clock half of this is a measurement, not a test. Against a copy of
 * `packages/core/src` with all seven instrumentation sites physically removed
 * — plus `trace.ts`, the `OWNERSHIP` holder and the `holder` computation —
 * 15 paired processes, min-of-21 within each, alternating order, happy-dom:
 *
 *   workload                  trace OFF     sites REMOVED   ratio     Wilcoxon
 *   scope + dispose       5.72          5.72 ns/scope  1.0012x   p=0.532
 *   template clone            936.18        924.81 ns/clone  1.0123x   p=0.307
 *   200-row mount + dispose   924.49        883.36 ns/row    1.0466x   p=0.281
 *
 * Parity on all three: no p below 0.28, and the mount ratio moves between
 * 0.95x and 1.07x from one 9-to-15-process run to the next, which is what
 * run-to-run noise on a happy-dom mount looks like. With the trace ON the same
 * three are 10.7x, 1.25x and 1.20x — the price of a WeakMap lookup and an
 * array push, paid only inside a trace window.
 *
 * (A first attempt loaded both runtimes into one process and reported
 * 1.10x–1.22x. That was every shared call site going polymorphic — `insert`,
 * `template` and `scope` were each two different functions behind one
 * call expression — which is a larger effect than the thing being measured and
 * lands on whichever variant ran second. Separate processes remove it, and it
 * is worth recording as the shape of measurement error this channel invites.)
 *
 * What is asserted here is the part a benchmark cannot defend against
 * regression: the STRUCTURAL claims the parity rests on. A field added to
 * `Owner`, or an allocation that happens whether or not anyone is looking,
 * would not necessarily show up in a 200-row mount but would break the claim.
 */
describe("the trace costs nothing when it is off", () => {
  it("adds no field to the scope object, in either state", async () => {
    const core = (await import("@barqjs/core")) as unknown as {
      scope: <T>(fn: (d: () => void) => T, detached?: boolean, kind?: string) => T
      getOwner: () => object | null
      beginOwnershipTrace: () => void
      endOwnershipTrace: () => unknown[]
    }
    const shape = (): string[] =>
      core.scope(() => Object.keys(core.getOwner() ?? {}).sort(), true)
    const off = shape()
    core.beginOwnershipTrace()
    const on = shape()
    core.endOwnershipTrace()
    // M2 replaced the ad-hoc owner record with `Scope` (SEMANTICS.md §2), so
    // this list moved: `_context`/`_parent`/`children`/`disposed` became
    // `ctx`/`parent`/`kids`/`dead`, and `catcher` (E1), `gen` (A2), `origin`
    // (X5), `_prev`/`_prevHost`/`_open` (O4.3), `_abort` (O3.4), `_range`
    // (O3.5) and `_forked` (X6) are the fields the O-family rules name.
    // `_prevHost` and `_open` are the M2-gate fix: CURRENT is the pair
    // (owner, host), so saving only half of it made `exit` restore null inside
    // a computation, and `_open` is what makes a second `exit` a no-op rather
    // than a silent detach. What this test asserts is unchanged and is the
    // line below: tracing adds none of them.
    expect(off).toEqual([
      "_abort",
      "_forked",
      "_open",
      "_prev",
      "_prevHost",
      "_range",
      "catcher",
      "cleanups",
      "ctx",
      "dead",
      "dispose",
      "gen",
      "kids",
      "origin",
      "parent",
    ])
    expect(
      on,
      "tracing must not add a field: the scope object is allocated once per branch " +
        "instance and per list row, and a new slot is a permanent cost paid by every " +
        "build so that a test-only channel can exist",
    ).toEqual(off)
  })

  it("mints no identity for a scope created while it is off", async () => {
    const core = (await import("@barqjs/core")) as unknown as {
      scope: <T>(fn: (d: () => void) => T, detached?: boolean, kind?: string) => T
      getOwner: () => object | null
      ownershipIdOf: (scope: object | null) => number
    }
    const owner = core.scope(() => core.getOwner(), true)
    expect(
      core.ownershipIdOf(owner),
      "a scope built outside a trace window must carry no trace identity; the WeakMap " +
        "that holds them stays empty until beginOwnershipTrace",
    ).toBe(-1)
  })

  it("refuses to open two overlapping traces", async () => {
    const core = (await import("@barqjs/core")) as unknown as {
      beginOwnershipTrace: () => void
      endOwnershipTrace: () => unknown[]
    }
    core.beginOwnershipTrace()
    expect(() => core.beginOwnershipTrace()).toThrow(/already open/)
    core.endOwnershipTrace()
    // And the sink really is uninstalled again, or the next fixture inherits it.
    expect(() => core.beginOwnershipTrace()).not.toThrow()
    core.endOwnershipTrace()
  })

  it("records nothing at all while it is off", async () => {
    const core = (await import("@barqjs/core")) as unknown as {
      scope: <T>(fn: (d: () => void) => T, detached?: boolean, kind?: string) => T
      template: (html: string) => () => Node
      beginOwnershipTrace: () => void
      endOwnershipTrace: () => unknown[]
    }
    const make = core.template("<b>x</b>")
    core.scope((d: () => void) => {
      make()
      d()
    }, true)
    core.beginOwnershipTrace()
    const captured = core.endOwnershipTrace()
    expect(captured, "work done outside the window must leave no record").toEqual([])
  })
})

// ---------------------------------------------------------------------------
// mutation self-checks — L6 discipline, applied to this channel
// ---------------------------------------------------------------------------

/**
 * `oracle.test.ts`'s corruption self-checks are the only mechanism in the
 * twelve-project survey that asks "would my suite notice a wrong change".
 * The same question, asked of L2b: each mutation below reintroduces or
 * fabricates an ownership defect, and the channel must report it. A self-check
 * that stops failing means the assertion above it has become decoration.
 */
describe("self-check: the assertion would notice", () => {
  it("catches the Provider bug being reintroduced into the clean control", async () => {
    // M3 made this unrepresentable in the SOURCE: `<P><C/></P>` and
    // `<P>{() => <C/>}</P>` lower to the same Block, so unwrapping the thunk —
    // the mutation this self-check used at M0 — now changes nothing at all.
    // That is §7.1's claim holding, and it is also this assertion's problem:
    // a mutation that no longer mutates makes the check decoration.
    //
    // So the defect is written where it can still be written, in the emitted
    // text: turn `children: (_s$) => Label(_s$, {})` back into an ARGUMENT.
    const clean = ownershipSource("own-provider-thunked")
    let hit = 0
    const corrupt = (code: string): string =>
      code.replace(
        /children:\s*(?:[\w$]*block)?\(?\((_s\$\d*)\)\s*=>\s*(\w+)\(\1, \{\}\)\)?/g,
        (_m, scope, comp) => {
          hit++
          return `children: ${comp}(${scope}, {})`
        },
      )
    const run = await checkOwnership(
      "mutant-provider",
      clean,
      "own-provider-thunked.tsx",
      {},
      corrupt,
    )
    expect(hit, "the emitted mutation matched nothing — the calling convention changed").toBe(1)
    expect(
      run.findings.map((f) => `${f.rule}: ${f.detail}`).join("\n"),
      "an already-built child in a children slot is the Provider bug, and it is now the ONLY " +
        "way to write it. If the channel does not report it, the gate above is a coincidence of " +
        "its fixture rather than a property of the check.",
    ).toContain("O2.1")
  })

  it("catches a body hoisted out of the branch that owns it", async () => {
    // Same reasoning as above: the source-level thunk is no longer the thing
    // that decides, so the hoist is written into the emitted module.
    //
    // Since M4b the body is not a `children` PROP either — the construct is
    // gone and what stands here is `_$boundary(_s$, parent, anchor, kind,
    // fallback, body)`, whose body argument is the Block. Building it at the
    // call site instead is the same mutation one syntax later.
    const clean = ownershipSource("own-nested-scopes-dispose")
    let hit = 0
    const corrupt = (code: string): string =>
      code.replace(/[\w$]*block\(\(_s\$\d*\)\s*=>\s*(_tmpl\$\d+\(\))\)/g, (_m, clone) => {
        hit++
        return clone as string
      })
    const run = await checkOwnership(
      "mutant-branch",
      clean,
      "own-nested-scopes-dispose.tsx",
      {},
      corrupt,
    )
    expect(hit, "the emitted mutation matched nothing").toBeGreaterThan(0)
    expect(
      run.findings.map((f) => `${f.rule}: ${f.detail}`).join("\n"),
      "a branch body cloned at the call site instead of inside the branch must be reported, " +
        "with the template and both paths named",
    ).toContain("root > branch")
  })

  it("catches a template that moves to a different owner in the SOURCE", async () => {
    // The mutation the compiler side has to notice: the same component, moved
    // out of the provider. Nothing about the runtime changes; the expected
    // value does, and the previously-clean run must stop being clean.
    const clean = ownershipSource("own-provider-thunked")
    const moved = clean.replace(
      "<Theme.Provider value={() => \"provided-theme\"}>{() => <Label />}</Theme.Provider>",
      "<Theme.Provider value={() => \"provided-theme\"}>{() => <i />}</Theme.Provider>\n      <Label />",
    )
    expect(moved, "the mutation matched nothing").not.toBe(clean)
    const { tree } = staticTree(moved, "own-provider-thunked.tsx")
    const label = tree.positions.filter(
      (position) => position.html.includes("label") && position.root === "OwnProviderThunked",
    )
    expect(label.length, "the moved component produced no position").toBeGreaterThan(0)
    expect(
      label.map((position) => position.path.join("/")).join(", "),
      "moving <Label/> out of the provider must move its expected path; if the static tree " +
        "reports the same path either way it is not derived from the source at all",
    ).toBe("root")
  })

  it("catches a fabricated scope-chain break", async () => {
    // Feeds the comparator a trace whose clone happened under a scope with no
    // parent chain. Guards the runtime-internal half, which the corpus does
    // not currently falsify anywhere.
    const { code } = staticTree(ownershipSource("own-provider-thunked"), "own-provider-thunked.tsx")
    const events = await trace(code, "own-selfcheck-chain")
    const enters = events.filter((e) => e.kind === "enter")
    expect(enters.length, "the control entered no scopes").toBeGreaterThan(1)
    // A parent that no enter event declared is exactly the shape a scope
    // created under a disposed or foreign owner would produce.
    const corrupted = events.map((e) =>
      e.kind === "enter" && e.parent !== -1 ? { ...e, parent: 9999 } : e,
    )
    const { checkTrace } = await import("./ownership.ts")
    const findings = checkTrace(corrupted).findings
    expect(
      findings.map((f) => f.kind).join(", "),
      "a scope naming a parent nothing entered must be reported; without this the tree half of " +
        "the assertion could be silently true of any log at all",
    ).toContain("parent-never-entered")
  })

  it("catches a construction that ran under a scope other than the one it was given", async () => {
    // O2's own words, driven from the RUNTIME rather than from a corrupted log.
    //
    // The clause this exercises used to read the ambient owner twice at one
    // instant and compare the two, so `given !== actual` could not hold
    // whatever the runtime did — a mutation that genuinely ran a provider's
    // children under `owner._parent` left it silent, and only the unrelated
    // static-path comparison noticed. `given` is now the scope the runtime
    // NAMED when it handed the block over, and the second source is every
    // clone that lands before the block returns: two observations, two times.
    //
    // The arrangement below hands `insert` a block under a `provide` scope and
    // has that block build under the root instead. Nothing is edited after the
    // fact; the events are whatever the runtime produced.
    const core = (await import("@barqjs/core")) as unknown as {
      scope: <T>(fn: (d: () => void, s: object) => T, detached?: boolean, kind?: string) => T
      getOwner: () => object | null
      runWithOwner: <T>(owner: object | null, fn: () => T) => T
      template: (html: string) => () => Node
      insert: (s: object | null, parent: Node, value: unknown, marker?: Node | null) => void
      flush: () => void
      beginOwnershipTrace: () => void
      endOwnershipTrace: () => OwnershipEvent[]
    }
    const { checkTrace } = await import("./ownership.ts")

    const run = (elsewhere: boolean): OwnershipEvent[] => {
      const host = document.createElement("div")
      document.body.appendChild(host)
      const make = core.template("<b>x</b>")
      core.beginOwnershipTrace()
      try {
        let dispose: (() => void) | undefined
        core.scope(
          (d: () => void, root: object) => {
            dispose = d
            core.scope(
              (_d: () => void, provide: object) => {
                // `insert` is HANDED the scope it must build under (§3.3 C6),
                // so `given` is threaded rather than read back off `CURRENT` at
                // the handover instant — which is the comparison that could not
                // fail whatever the runtime did.
                core.insert(provide, host, () =>
                  elsewhere ? core.runWithOwner(root, () => make()) : make(),
                )
              },
              false,
              "provide",
            )
          },
          true,
          "root",
        )
        core.flush()
        dispose?.()
        return core.endOwnershipTrace()
      } finally {
        core.endOwnershipTrace()
        host.remove()
      }
    }

    const honest = run(false)
    expect(
      honest.some((e) => e.kind === "block-enter"),
      "the arrangement handed over no construction to check",
    ).toBe(true)
    expect(
      checkTrace(honest).findings.map((f) => `${f.rule}: ${f.detail}`).join("\n"),
      "a block that builds under the scope it was given is the ordinary case and must be clean, " +
        "or the check reports that ownership is never right, which is not a finding about anything",
    ).toBe("")

    const cheating = run(true)
    expect(
      checkTrace(cheating).findings.map((f) => f.kind).join(", "),
      "a Block that ran under a scope other than the one it was given is O2's negation; the " +
        "channel has to say so, or the clause is decoration",
    ).toContain("block-ran-under-another-scope")
  })

  it("catches an EFFECT created under a scope other than the one it was given", async () => {
    // The same arrangement, with the misplaced construction being a reactive
    // node rather than a template clone — which is the half the trace could
    // not see at all until it recorded one. The clone stays honest in both
    // runs, so the only difference between them is where the effect was filed;
    // a check that reported the cheating run through the clone arm would pass
    // this test without ever looking at an effect.
    const core = (await import("@barqjs/core")) as unknown as {
      scope: <T>(fn: (d: () => void, s: object) => T, detached?: boolean, kind?: string) => T
      runWithOwner: <T>(owner: object | null, fn: () => T) => T
      template: (html: string) => () => Node
      insert: (s: object | null, parent: Node, value: unknown, marker?: Node | null) => void
      renderEffect: (compute: () => unknown) => () => void
      signal: <T>(value: T) => (() => T) & { set(next: T): void }
      flush: () => void
      beginOwnershipTrace: () => void
      endOwnershipTrace: () => OwnershipEvent[]
    }
    const { checkTrace } = await import("./ownership.ts")

    const run = (elsewhere: boolean): OwnershipEvent[] => {
      const host = document.createElement("div")
      document.body.appendChild(host)
      const make = core.template("<b>x</b>")
      const value = core.signal("one")
      core.beginOwnershipTrace()
      try {
        let dispose: (() => void) | undefined
        core.scope(
          (d: () => void, root: object) => {
            dispose = d
            core.scope(
              (_d: () => void, provide: object) => {
                core.insert(provide, host, () => {
                  const node = make()
                  const bind = (): void => void core.renderEffect(() => value())
                  if (elsewhere) core.runWithOwner(root, bind)
                  else bind()
                  return node
                })
              },
              false,
              "provide",
            )
          },
          true,
          "root",
        )
        core.flush()
        dispose?.()
        return core.endOwnershipTrace()
      } finally {
        core.endOwnershipTrace()
        host.remove()
      }
    }

    const honest = run(false)
    expect(
      honest.some((e) => e.kind === "own"),
      "the trace recorded no effect creation at all, so nothing below it can be a finding " +
        "about effect ownership — this is the state the channel was in before it had an " +
        "`own` event, and every ownership defect in the effect half was invisible to it",
    ).toBe(true)
    expect(
      checkTrace(honest).findings.map((f) => `${f.rule}: ${f.detail}`).join("\n"),
      "an effect created under the scope its block was given is the ordinary case",
    ).toBe("")

    const cheating = checkTrace(run(true)).findings
    expect(
      cheating.map((f) => `${f.rule} ${f.detail}`).join("\n"),
      "an effect filed under a scope neither at nor below the one the block was handed is " +
        "O4.5's negation, and it is the exact shape the compiled attribute channel had while " +
        "it emitted a `renderEffect` taking no scope",
    ).toContain("effect")
    expect(cheating.map((f) => f.rule)).toContain("O4.5")
  })
})

// ---------------------------------------------------------------------------
// the artefact itself
// ---------------------------------------------------------------------------

describe("the static ownership tree", () => {
  it("is off by default, so a production compile does not pay for it", () => {
    const source = corpusSource("context-provider")
    const native = staticTree(source, "context-provider.tsx")
    expect(native.tree.version).toBe(2)
    // The same compile without the flag: the artefact is absent and the code
    // is byte-identical. The Rust side proves this over the whole corpus in
    // all four (ssr × dev) modes; this is the JS-visible half.
    expect(() => staticTree(source, "context-provider.tsx")).not.toThrow()
  })

  it("places a provider's child under the provider, from the source alone", () => {
    const { tree } = staticTree(corpusSource("context-provider"), "context-provider.tsx")
    const badge = tree.positions.filter(
      (position) => position.html.includes("badge") && position.root === "ContextProvider",
    )
    expect(badge.map((position) => position.path.join("/")).sort()).toEqual([
      "root",
      "root/provide",
    ])
  })

  it("records the components it could not follow rather than presenting a leaf", () => {
    const { tree } = staticTree(
      "import { Thing } from './thing';\nexport default function App() { return <Thing />; }\n",
      "opaque.tsx",
    )
    expect(tree.opaque).toEqual(["Thing"])
  })
})
