/**
 * L4 — single-evaluation conformance. `SEMANTICS.md` C7.
 *
 * > For each activation of a position, its Block is invoked **exactly once**.
 * > Not zero times, not twice.
 *
 * The old runtime read `props.children` at four syntactic sites in `Show` and
 * did the same in four other components, so a lazy child was built twice and one
 * copy discarded. Nothing could see it: two subtrees are built, one is dropped,
 * and the DOM that survives is the DOM one invocation would have produced. The
 * only trace was the per-fixture template-clone count, which is why
 * `ownership-census.ts` declares that number rather than deriving it.
 *
 * This file states it directly, and at two grades:
 *
 *  - **absolute, per consumer.** Every built-in consumer is driven with an
 *    INSTRUMENTED Block — one that records its own invocations — and the
 *    recorded sequence is compared against the exact sequence the fixture
 *    declares. Both directions are covered by construction: too few invocations
 *    and too many are both a different array.
 *  - **corpus-wide, as a diagnostic.** `flow.ts` emits `BLOCK_EVALUATED_TWICE`
 *    when a Block is called twice for one activation, and the session subscribes
 *    to diagnostics for the whole window. Zero across the whole corpus, asserted.
 *
 * The rule's own falsification procedure names two cases explicitly, and both
 * are in the declared corpus rather than described: `mm-branch-flip` is the
 * A → B → A that must show A's Block invoked TWICE, and every fixture's replayed
 * steps are the no-op writes that must show no additional invocation (K2).
 */

import { describe, expect, it } from "bun:test"

import { channel } from "./graded.ts"
import { fixtureSource, listFixtures } from "./harness.ts"
import { l4Source, listL4Fixtures, openSession, type Session } from "./session.ts"

interface C7Declaration {
  readonly why: string
  readonly log: readonly string[]
}

/**
 * The consumers `SEMANTICS.md` C7 lists, mapped to the fixture that drives each
 * with an instrumented Block. The map is asserted total below: a consumer with
 * no fixture is a gap in the conformance, and naming it here is what makes the
 * gap fail rather than go unmentioned.
 */
const CONSUMERS: Record<string, string> = {
  "branch (key unchanged)": "mm-branch-key-stable",
  "branch (key unchanged, driving effect re-runs)": "mm-branch-nonkeyed-truthy",
  "branch (key flip, A → B → A)": "mm-branch-flip",
  "branch (Switch/Match arms)": "mm-switch-arm",
  "branch (Dynamic, one Block for every key)": "c7-dynamic",
  "branch (nested)": "mm-nested-branch",
  "each (keyed, by function)": "mm-keyed-move",
  "each (keyed, grow and shrink)": "mm-keyed-grow-shrink",
  "each (identity default, move and replace)": "mm-identity-default-move",
  "each (positional, keyed={false})": "mm-index-row-stable",
  "each (count, Repeat)": "c7-repeat",
  "each (fallback slot)": "c7-each-fallback",
  "boundary (error)": "c7-error-boundary",
  "boundary (error, fallback arm)": "c7-error-boundary-fallback",
  "boundary (loading, with error nested)": "c7-loading-errored",
  "boundary (async, Suspense/Await)": "c7-await-suspense",
  portal: "c7-portal",
  provide: "c7-provider",
  "dyn (Reveal, a construct owning no range)": "c7-reveal",
}

const CORPUS = listFixtures()
const L4 = listL4Fixtures()

const sessions = new Map<string, Session>()
for (const name of CORPUS) sessions.set(name, await openSession(name, fixtureSource(name)))
for (const name of L4) sessions.set(name, await openSession(name, l4Source(name)))

function declarationOf(name: string): C7Declaration | undefined {
  return sessions.get(name)?.exports.c7 as C7Declaration | undefined
}

function logOf(name: string): readonly string[] | undefined {
  return sessions.get(name)?.exports.log as readonly string[] | undefined
}

const twice = [...sessions.values()].flatMap((session) =>
  session.diagnostics
    .filter((event) => event.code === "BLOCK_EVALUATED_TWICE")
    .map((event) => `${session.fixture}: ${event.message}`),
)

const totalInvocations = [...sessions.values()].reduce(
  (n, session) => n + ((session.exports.log as string[] | undefined)?.length ?? 0),
  0,
)

console.log(
  `L4 single evaluation: ${Object.keys(CONSUMERS).length} consumers driven with an instrumented ` +
    `Block, ${totalInvocations} recorded invocation(s); ` +
    `${twice.length} BLOCK_EVALUATED_TWICE across ${sessions.size} sessions`,
)

describe("L4 — C7, single evaluation", () => {
  it("every consumer in the rule has a fixture that drives it", () => {
    const missing = Object.entries(CONSUMERS)
      .filter(([, fixture]) => !L4.includes(fixture))
      .map(([consumer, fixture]) => `${consumer}: fixtures/l4/${fixture}.tsx does not exist`)
    expect(missing.join("\n")).toBe("")
  })

  it("the four primitives and both non-region consumers are all covered", () => {
    // §3.4's four, plus the two C7 names beyond them. A conformance suite that
    // covered `branch` sixteen times and `portal` never would pass every
    // assertion below and prove a quarter of the rule.
    for (const construct of ["branch", "each", "boundary", "portal", "provide", "dyn"]) {
      expect(
        Object.keys(CONSUMERS).some((name) => name.startsWith(construct)),
        `no consumer named ${construct} is driven`,
      ).toBe(true)
    }
  })

  for (const [consumer, fixture] of Object.entries(CONSUMERS)) {
    it(`${consumer} — the Block is invoked exactly once per activation`, () => {
      const declaration = declarationOf(fixture)
      const log = logOf(fixture)
      expect(declaration, `${fixture} declares no \`c7\``).toBeDefined()
      expect(log, `${fixture} exports no \`log\``).toBeDefined()
      if (declaration === undefined || log === undefined) return
      expect(declaration.why.length, `${fixture}: the declaration has no reason`).toBeGreaterThan(20)
      expect(log, `${fixture} (${declaration.why})`).toEqual([...declaration.log])
    })
  }

  it("A → B → A shows A's Block invoked twice — the rule's own example", () => {
    // Not "at least twice": exactly twice, which is what separates two
    // activations from one activation evaluated twice.
    const log = logOf("mm-branch-flip")
    expect(log).toEqual(["open", "open"])
  })

  it("a no-op write shows no additional invocation — the rule's other example", () => {
    // Every session applies every step a SECOND time, and the no-op write pass
    // writes every exported signal its own current value before any step runs.
    // `mm-branch-key-stable` writes the body's signal twice and replays both,
    // so the branch's key expression is evaluated five times and its Block once.
    const log = logOf("mm-branch-key-stable")
    expect(log).toEqual(["body"])
    const session = sessions.get("mm-branch-key-stable")
    expect(session?.frames.filter((f) => f.kind === "replay").length).toBeGreaterThan(0)
  })

  it("no Block is evaluated twice anywhere in the corpus", () => {
    expect(twice.join("\n")).toBe("")
  })

  it("the diagnostics channel every session listens on is armed, not merely quiet", async () => {
    // `flow.ts` gates its C7 counter behind `diagnosticsEnabled()`, which is
    // `diagnosticListeners.size !== 0`. A session that failed to subscribe would
    // close the gate, the counter would never run its WeakMap probe, and the
    // suite would be green for the same reason a conforming runtime is — which
    // is the whole failure mode this assertion exists for.
    //
    // So the exact mechanism a session uses is driven against a diagnostic the
    // runtime is KNOWN to emit: `render()` handed an already-built subtree while
    // an owner is current warns `RENDER_SUBTREE_NOT_OWNED` (the O5 registry row).
    const core = await import("@barqjs/core")
    const host = document.createElement("div")
    document.body.appendChild(host)
    const capture = core.DEV.diagnostics.capture()
    try {
      core.createScope((d: () => void) => {
        core.render(document.createElement("p") as never, host)
        d()
      }, true)
    } finally {
      const seen = capture.stop()
      host.remove()
      expect(seen.map((event) => event.code)).toContain("RENDER_SUBTREE_NOT_OWNED")
    }
  })

  it("no consumer can reach the counter, which is why a mutant is what arms it", () => {
    // Stated rather than left as an unexplained zero. Every call site of `build`
    // in `flow.ts` bumps `activation` first — `activate` does, `each`'s mapper
    // does per row, `each`'s fallback does, `portal`'s microtask does — so no
    // sequence of writes against the shipped primitives can produce two
    // invocations at one activation. That is C7 holding, and it means the
    // counter cannot be armed from inside the corpus. `runtime-mutants.ts`
    // mutates `build` to invoke its Block twice and reports which channel
    // catches it; this assertion is the record that the zero above is expected.
    expect(twice).toEqual([])
    expect(totalInvocations).toBeGreaterThan(20)
  })

  it("the channel takes no exemptions", () => {
    expect(channel("single-evaluation").exemptions).toEqual([])
    expect(channel("single-evaluation").grade).toBe("absolute")
  })
})
