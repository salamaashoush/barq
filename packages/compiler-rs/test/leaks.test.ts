/**
 * L4 — the leak oracle. `SEMANTICS.md` O3.7 and B4.
 *
 * `leaks.ts` states the five probes and why each one needs to be taken from
 * outside the runtime. This file is the discipline: every probe runs on every
 * fixture in the corpus, the findings are matched against a registry with the
 * same four assertions the other two registries carry, and each probe is
 * asserted to be LIVE — a probe that cannot fire is a probe that reports zero
 * for the same reason a correct runtime does.
 */

import { describe, expect, it } from "bun:test"

import { channel } from "./graded.ts"
import { fixtureSource, listFixtures } from "./harness.ts"
import {
  duplicateLeakRows,
  LEAK_FAILURES,
  leakIndex,
  leakKey,
  LEAK_REGISTRY_RULES,
} from "./leak-known-failures.ts"
import { findLeaks, formatLeaks, LEAK_RULES, type LeakFinding } from "./leaks.ts"
import { CURRENT_MILESTONE, OVERDUE_WHY, overdue } from "./milestone.ts"
import { documentedRules } from "./semantics.ts"
import { l4Source, listL4Fixtures, openSession, type Session } from "./session.ts"

const CORPUS = listFixtures()
const L4 = listL4Fixtures()

const sessions = new Map<string, Session>()
for (const name of CORPUS) sessions.set(name, await openSession(name, fixtureSource(name)))
for (const name of L4) sessions.set(name, await openSession(name, l4Source(name)))

const findings: LeakFinding[] = []
for (const session of sessions.values()) findings.push(...findLeaks(session))

const REGISTRY = leakIndex()

const byKind = new Map<string, number>()
for (const finding of findings) byKind.set(finding.kind, (byKind.get(finding.kind) ?? 0) + 1)

console.log(
  `L4 leak oracle: ${sessions.size} sessions, ${findings.length} finding(s) — ` +
    `${[...byKind].sort().map(([kind, n]) => `${kind}×${n}`).join(" ") || "none"}\n` +
    `  registry: ${LEAK_FAILURES.length} row(s); ` +
    `scopes entered ${[...sessions.values()].reduce((n, s) => n + s.scopesEntered, 0)}, ` +
    `effects created ${[...sessions.values()].reduce((n, s) => n + s.effectsCreated, 0)}, ` +
    `listeners registered ${[...sessions.values()].reduce((n, s) => n + s.listeners.length, 0)}`,
)

describe("L4 — the leak oracle", () => {
  it("the probes are installed, so a zero is an observation and not a silence", () => {
    // The listener probe once patched `globalThis.EventTarget.prototype` and
    // intercepted nothing, because under the global registrator a DOM node can
    // inherit happy-dom's class while the global is the host's. It reported
    // zero listeners for a fixture that registers four, and it reported it
    // exactly as confidently as a correct runtime would.
    for (const [name, session] of sessions) {
      expect(session.listenerOwners, `${name}: the listener probe patched nothing`).toBeGreaterThan(0)
      expect(session.scopesEntered, `${name}: the ownership trace saw no scope at all`).toBeGreaterThan(0)
    }
    // Not per fixture: a provably-static tree creates zero effects and that is
    // the optimality claim `dangerously-set-inner-html` exists to make. The
    // tracer being wired is a fact about the corpus.
    const effects = [...sessions.values()].reduce((n, s) => n + s.effectsCreated, 0)
    expect(effects, "the effect tracer saw no effect anywhere in the corpus").toBeGreaterThan(50)
  })

  it("at least one fixture registers a listener, so the listener probe has a subject", () => {
    const registered = [...sessions.values()].reduce((n, s) => n + s.listeners.length, 0)
    expect(registered).toBeGreaterThan(0)
  })

  it("the registry has no duplicate rows", () => {
    expect(duplicateLeakRows().join(", ")).toBe("")
  })

  it("every registered row is a fixture", () => {
    const known = new Set([...CORPUS, ...L4])
    for (const row of LEAK_FAILURES) {
      expect(known, `${row.fixture} is registered but is not a fixture`).toContain(row.fixture)
    }
  })

  it("every registered rule exists in SEMANTICS.md and in the channel's reach", () => {
    const documented = documentedRules()
    for (const row of LEAK_FAILURES) {
      expect(documented, `${row.rule} is registered and is not a rule`).toContain(row.rule)
      expect(
        LEAK_REGISTRY_RULES,
        `${row.rule} is registered and this channel cannot report it`,
      ).toContain(row.rule)
    }
  })

  it("every row carries a status, a milestone and a reason worth reading", () => {
    const malformed: string[] = []
    for (const row of LEAK_FAILURES) {
      if (row.status !== "VIOLATED" && row.status !== "PLANNED") {
        malformed.push(`${leakKey(row.fixture, row.leak)}: bad status`)
      }
      if (!/^M\d$/.test(row.greenAt)) {
        malformed.push(`${leakKey(row.fixture, row.leak)}: greenAt is not a milestone`)
      }
      if (row.reason.length < 80) {
        malformed.push(`${leakKey(row.fixture, row.leak)}: reason is too short to be one`)
      }
    }
    expect(malformed.join("\n")).toBe("")
  })

  it("no row is past the milestone it promised", () => {
    const late = LEAK_FAILURES.filter((row) => overdue(row.greenAt)).map(
      (row) =>
        `OVERDUE: ${leakKey(row.fixture, row.leak)} promised green at ${row.greenAt} and still ` +
        `leaks at M${CURRENT_MILESTONE}`,
    )
    expect(late.join("\n"), OVERDUE_WHY).toBe("")
  })

  /** Assertion 2: an unregistered leak is a suite failure. */
  it("no fixture leaks anything the registry does not carry", () => {
    const unregistered = findings.filter(
      (finding) => !REGISTRY.has(leakKey(finding.fixture, finding.id)),
    )
    expect(formatLeaks(unregistered)).toBe("")
  })

  /** Assertion 1: a registered leak that stopped occurring is a suite failure. */
  it("no registered row is stale", () => {
    const observed = new Set(findings.map((f) => leakKey(f.fixture, f.id)))
    const stale = LEAK_FAILURES.filter((row) => !observed.has(leakKey(row.fixture, row.leak))).map(
      (row) =>
        `STALE: ${leakKey(row.fixture, row.leak)} is registered against ${row.greenAt} and no ` +
        "longer leaks — delete the row",
    )
    expect(stale.join("\n")).toBe("")
  })

  /** Assertion 3: a registered leak reported under the wrong rule is a suite failure. */
  it("every registered leak is reported under the rule its row names", () => {
    const wrong: string[] = []
    for (const finding of findings) {
      const row = REGISTRY.get(leakKey(finding.fixture, finding.id))
      if (row === undefined) continue
      if (row.rule === finding.rule) continue
      wrong.push(`${leakKey(finding.fixture, finding.id)}: row says ${row.rule}, probe said ${finding.rule}`)
    }
    expect(wrong.join("\n")).toBe("")
  })

  it("O3.7's four non-listener clauses hold everywhere, with nothing registered", () => {
    // The rule names effects, subscriptions, async continuations and the scopes
    // that own them. A row under O3.7 would mean the redesign's central claim is
    // not yet true.
    const o37 = findings.filter((finding) => finding.rule === "O3.7")
    expect(formatLeaks(o37)).toBe("")
    expect(LEAK_FAILURES.filter((row) => row.rule === "O3.7")).toEqual([])
  })

  it("B4 holds, and the probe that says so still discriminates", () => {
    // M5's element channel closed the three rows that were here: `listen`
    // registers a cleanup on the scope that owns the element, so removal is not
    // something a call site can forget. The count B4's falsification procedure
    // asks for — registered listeners after dispose — is 0.
    expect(formatLeaks(findings.filter((finding) => finding.rule === "B4"))).toBe("")
    expect(LEAK_FAILURES.filter((row) => row.rule === "B4")).toEqual([])

    // Deregistering a rule on the strength of a green probe is the failure this
    // registry exists to prevent, so the probe is shown to still SEE a listener
    // that is not removed. Everything below is one un-cleaned `addEventListener`
    // on a fixture that has real ones.
    const registered = [...sessions.values()].flatMap((session) =>
      session.listeners.filter((record) => !record.delegated),
    )
    expect(registered.length, "the corpus has to register listeners at all").toBeGreaterThan(0)
    expect(registered.filter((record) => record.outstanding)).toEqual([])
  })

  it("delegation is not counted as a leak, and is not counted as nothing either", () => {
    // One `document` listener per event type is module state for the whole
    // process. Folding it in would report a finding for every fixture that uses
    // `onClick`, and none of them would be the bug B4 is about — but a probe
    // that could not SEE the delegated listener would also not be able to see a
    // delegated listener that stopped being removed.
    const delegated = [...sessions.values()].flatMap((s) =>
      s.listeners.filter((record) => record.delegated),
    )
    expect(delegated.length).toBeGreaterThan(0)
    expect(findings.some((f) => f.id.startsWith("listener@document"))).toBe(false)
  })

  it("the channel declares exactly the rules it can report", () => {
    expect([...LEAK_RULES].sort()).toEqual([...channel("leaks").rules].sort())
    for (const rule of LEAK_RULES) expect(documentedRules()).toContain(rule)
  })
})

describe("L4 — the leak probes are not inert", () => {
  /**
   * Each probe is driven from a corrupted SESSION: the field it reads is moved
   * off zero and the finding must appear, with the rule its clause belongs to.
   * A probe that cannot produce a finding reports the same zero a correct
   * runtime does, and the difference is the whole value of the oracle.
   */
  const subject = (): Session => {
    const session = sessions.get("control-flow-show")
    if (session === undefined) throw new Error("control-flow-show is no longer a fixture")
    return session
  }

  it("the scope probe fires on an undisposed scope", () => {
    const found = findLeaks({ ...subject(), scopesNeverDisposed: [7, 9] })
    expect(found.map((f) => f.id)).toContain("scope@2-scopes")
    expect(found.find((f) => f.kind === "scope")?.rule).toBe("O3.7")
  })

  it("the effect probe fires on a run after disposal", () => {
    const found = findLeaks({ ...subject(), effectRunsAfterDispose: 3 })
    expect(found.map((f) => f.id)).toContain("effect@3-runs")
  })

  it("the listener probe fires on an outstanding non-delegated listener", () => {
    const found = findLeaks({
      ...subject(),
      listeners: [{ type: "click", target: "button", outstanding: true, delegated: false }],
    })
    expect(found.map((f) => f.id)).toContain("listener@button.click")
    expect(found.find((f) => f.kind === "listener")?.rule).toBe("B4")
  })

  it("the async probe fires on a continuation that ran after disposal", () => {
    const found = findLeaks({ ...subject(), asyncAfterDispose: 1 })
    expect(found.map((f) => f.id)).toContain("async@1-continuations")
  })

  it("the async probe fires on a continuation still in flight at teardown", () => {
    // The canonical shape — one outstanding timer or fetch when the window
    // closed. It never runs, so the ran-after counter above cannot see it, and
    // for one round the session RECORDED it and `findLeaks` never read the field.
    const found = findLeaks({ ...subject(), asyncStillPending: 1 })
    expect(found.map((f) => f.id)).toContain("async@1-pending")
    expect(found.find((f) => f.kind === "async")?.rule).toBe("O3.7")
  })

  it("the node probe fires on a clone still attached and on a non-empty container", () => {
    const clones = findLeaks({ ...subject(), clonesAttachedAfterDispose: 2 })
    expect(clones.map((f) => f.id)).toContain("node@2-clones")
    const held = findLeaks({ ...subject(), containerAfterDispose: "<p>still here</p>" })
    expect(held.map((f) => f.id)).toContain("node@container")
  })

  it("an unmutated session produces exactly the registered findings and nothing else", () => {
    // The null mutant. Without it every row above could be an artefact of the
    // corruption helper rather than of the probe.
    expect(findLeaks(subject())).toEqual([])
  })
})
