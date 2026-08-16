/**
 * The node-identity channel, regraded METAMORPHIC — `CODESIGN.md` §6 L4.
 *
 * ## What was wrong with the differential grading
 *
 * Until M9 `compareToOracle` compared the compiled render's surviving-node
 * vector against the `createElement` render's, and it did so under a guard:
 *
 * ```ts
 * if (oracle.channels[i].html !== compiled.channels[i].html) continue
 * ```
 *
 * Two things follow, and both are holes rather than compromises.
 *
 *  1. **The premise is a runtime observation, so the channel switches ITSELF
 *     off.** Exactly on the frames where the two paths disagree — the frames a
 *     reviewer would most want an identity answer for — there is no answer at
 *     all, and the suite is green because the check did not run.
 *  2. **The expectation is whatever the reference incidentally kept.** The
 *     `createElement` oracle is not a specification of node survival; it is one
 *     more implementation, with its own reuse behaviour. A rebuild both paths
 *     perform is certified, not caught.
 *
 * §6 retired that reference at M9, which settles (2) by removing it. This file
 * is what (1) needed either way, and it predates the retirement: an
 * unconditional property is not something a better reference could have given.
 *
 * ## What replaces it
 *
 * A metamorphic property compares ONE implementation against ITSELF under a
 * transform of the input. There is no second implementation, so there is nothing
 * to disagree about and no guard to write; and the expectation comes from the
 * transform rather than from a reference, which is what makes it stronger than
 * "matching whatever `createElement` incidentally kept".
 *
 * Every property below is checked on every frame of every fixture it applies to.
 * **None of them is ever skipped**, and `metamorphic.test.ts` asserts that: the
 * count of checks performed is itself reported, and a property that stopped
 * finding subjects fails as inert rather than passing as satisfied.
 *
 * ## The four properties, and where each one's premise comes from
 *
 * | id  | transform                              | asserts                    | premise |
 * |-----|----------------------------------------|----------------------------|---------|
 * | MM1 | write every signal its own value       | markup AND identity unchanged | none — an equal write is an unchanged input by definition |
 * | MM2 | apply a scripted step a second time    | markup unchanged           | the step does not read the signal it writes — read off the step's own source |
 * | MM3 | apply a scripted step a second time    | identity unchanged         | MM2's premise, and every written value is a primitive literal |
 * | MM4 | the fixture's own steps                | the declared class, in both directions, on the DOM **and** on the ownership trace | a per-step declaration in `fixtures/l4/`, asserted TOTAL |
 *
 * MM1 to MM3 need no annotation because their premise is derived: from the
 * transform itself, or from the step's source text, which is the same on every
 * run and cannot be changed by the defect under test. That is the property today's
 * channel does not have — its premise is the very frames it is comparing, so a
 * defect that changes those frames switches the check off.
 *
 * MM4 needs to know which of a transition's inputs the branch key depends on, and
 * that is a fact about the fixture, not about the run. Glimmer has the same shape:
 * `assertStableRerender()` is written at a point in a test where the author knows
 * the arguments did not change. So `fixtures/l4/` declares it, per step, TOTALLY —
 * every step of every L4 fixture carries exactly one class, and an unclassified
 * step is a failure. That is grading, not exemption: a declaration makes the
 * assertion STRONGER and stranger to satisfy, where an exemption removes one.
 *
 * The classes, and what each asserts in both directions:
 *
 * | class       | DOM                                                    | ownership trace |
 * |-------------|--------------------------------------------------------|-----------------|
 * | `preserves` | every element of the previous frame is in this one, same object, and none is new | disposes nothing |
 * | `permutes`  | the element multisets are EQUAL and the ORDER differs   | disposes nothing |
 * | `rebuilds`  | no element of the previous frame survives               | disposes something |
 * | `grows`     | every previous element survives AND at least one is new | — |
 * | `shrinks`   | every survivor was there before AND at least one is gone | — |
 *
 * A `rebuilds` step that preserved a node is a failure exactly as loudly as a
 * `preserves` step that dropped one. Neither direction is the safe one. And the
 * two columns are INDEPENDENT observations of one window: a runtime that disposed
 * a branch instance and rebuilt a byte-identical subtree satisfies the markup,
 * which is what every other channel in this repository is a function of.
 *
 * ## What is NOT graded here, and why
 *
 * "No node is lost unless a scope was disposed" is the property this file wanted
 * to state corpus-wide, and it is FALSE as stated: a plain dynamic child hole
 * (`_$insert`) replaces nodes with no scope involved at all, so
 * `conditional-children` and `logical-and-child` lose an element in a transition
 * that disposes nothing and are perfectly correct. Making it true needs a probe
 * on the hole's own writes, which the tracer does not have — an `insert` sets up
 * a `bindEffect` once and every later write goes through `insertExpression`
 * inside it. It is stated here rather than weakened into something vacuous, and
 * the join it wanted lives in MM4 where the declaration makes it sound.
 */

import { FRAME_MARKER, type OwnershipEvent, type Session, type SessionFrame } from "./session.ts"

export type StepClass = "preserves" | "permutes" | "rebuilds" | "grows" | "shrinks"

/**
 * What an `fixtures/l4/` fixture exports as `metamorphic`. `steps` is
 * positional and must have exactly one entry per scripted step; `events` the
 * same for dispatched events.
 */
export interface MetamorphicDeclaration {
  /** why this fixture exists, in one line — printed with any violation */
  readonly why: string
  readonly steps: readonly StepClass[]
  readonly events?: readonly StepClass[]
}

export type PropertyId =
  | "MM1-noop-write"
  | "MM2-step-replay"
  | "MM3-replay-identity"
  | "MM4-declared"

export interface MetamorphicViolation {
  fixture: string
  property: PropertyId
  /** the frame the violation was observed at */
  frame: string
  message: string
  before: string
  after: string
}

export interface MetamorphicReport {
  fixture: string
  violations: MetamorphicViolation[]
  /** how many times each property found a subject; a zero is reported, not hidden */
  checks: Record<PropertyId, number>
}

function emptyChecks(): Record<PropertyId, number> {
  return {
    "MM1-noop-write": 0,
    "MM2-step-replay": 0,
    "MM3-replay-identity": 0,
    "MM4-declared": 0,
  }
}

export function mergeChecks(
  into: Record<PropertyId, number>,
  from: Record<PropertyId, number>,
): void {
  for (const key of Object.keys(from) as PropertyId[]) into[key] += from[key]
}

// ---------------------------------------------------------------------------
// identity set algebra
// ---------------------------------------------------------------------------

function setOf(ids: readonly number[]): Set<number> {
  return new Set(ids)
}

function missing(before: readonly number[], after: readonly number[]): number[] {
  const have = setOf(after)
  return before.filter((id) => !have.has(id))
}

function added(before: readonly number[], after: readonly number[]): number[] {
  const had = setOf(before)
  return after.filter((id) => !had.has(id))
}

function sameMultiset(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  const left = [...a].sort((x, y) => x - y)
  const right = [...b].sort((x, y) => x - y)
  return left.every((value, i) => value === right[i])
}

// ---------------------------------------------------------------------------
// MM4's join: which scopes came apart during which transition
// ---------------------------------------------------------------------------

/**
 * The ownership stream cut at the frame markers `session.ts` plants. Segment `i`
 * holds every event between frame `i - 1` and frame `i`, so `disposalsInto(i)`
 * is exactly the scopes that came apart during that transition.
 *
 * The marker's own `enter`/`exit`/`dispose` triple is excluded: a marker is the
 * cut, not an event in the segment it delimits.
 */
export function segments(ownership: readonly OwnershipEvent[]): OwnershipEvent[][] {
  const out: OwnershipEvent[][] = []
  let current: OwnershipEvent[] = []
  const markerIds = new Set<number>()
  for (const event of ownership) {
    if (event.kind === "enter" && event.scopeKind === FRAME_MARKER) {
      markerIds.add(event.scope)
      out.push(current)
      current = []
      continue
    }
    if (markerIds.has(event.scope)) continue
    current.push(event)
  }
  out.push(current)
  return out
}

function disposalsIn(segment: readonly OwnershipEvent[] | undefined): number {
  if (segment === undefined) return 0
  let count = 0
  for (const event of segment) if (event.kind === "dispose") count++
  return count
}

// ---------------------------------------------------------------------------
// the properties
// ---------------------------------------------------------------------------

function frameOf(session: Session, kind: SessionFrame["kind"], index: number): SessionFrame | undefined {
  return session.frames.find((frame) => frame.kind === kind && frame.index === index)
}

/**
 * MM1 — the no-op write. Every signal the fixture exports is written the value
 * it already holds, between the mount frame and the `noop` frame. Nothing
 * downstream may notice: not the markup, not a single node.
 *
 * This is the one property whose subject exists for EVERY fixture, including the
 * ones with no scripted steps at all, which is why it is the floor rather than
 * the interesting case.
 */
function mm1(session: Session, report: MetamorphicReport): void {
  const mount = frameOf(session, "mount", -1)
  const noop = frameOf(session, "noop", -1)
  if (mount === undefined || noop === undefined) return
  report.checks["MM1-noop-write"]++
  if (mount.html !== noop.html) {
    report.violations.push({
      fixture: session.fixture,
      property: "MM1-noop-write",
      frame: noop.label,
      message: "writing every signal the value it already holds changed the markup",
      before: mount.html,
      after: noop.html,
    })
    return
  }
  if (mount.identity.join(",") !== noop.identity.join(",")) {
    report.violations.push({
      fixture: session.fixture,
      property: "MM1-noop-write",
      frame: noop.label,
      message:
        "writing every signal the value it already holds rebuilt nodes: the markup is identical " +
        "and the objects behind it are not, so focus, selection, scroll offset and dirty form " +
        "state were all discarded for nothing",
      before: mount.identity.join(","),
      after: noop.identity.join(","),
    })
  }
}

/**
 * Whether re-applying a step is the same INPUT again, decided from the step's
 * own source text rather than from what the run did.
 *
 * A step that reads the signal it writes — `count.set(count() + 1)`,
 * `rows.set([...rows(), row])`, `rows.set((prev) => …)` — is an increment, and
 * applying it twice is two different inputs. A step that writes a value it did
 * not derive from the current one is idempotent by construction.
 *
 * The premise is therefore a fact about the FIXTURE, checked syntactically and
 * the same on every run, not an observation of the frames the property is about.
 * That distinction is the whole point of the regrade: today's node-identity
 * channel decides whether to check by looking at the very frames it is checking,
 * so a defect that changes those frames turns the check off.
 */
export function replayableStep(source: string): boolean {
  const written = [...source.matchAll(/([A-Za-z_$][\w$]*)\s*\.\s*set\s*\(/g)].map((m) => m[1])
  if (written.length === 0) return false
  // A functional update reads the previous value by definition.
  if (/\.\s*set\s*\(\s*(?:\([^)]*\)|[\w$]+)\s*=>/.test(source)) return false
  for (const name of written) {
    if (new RegExp(`\\b${name}\\s*\\(`).test(source)) return false
  }
  return true
}

const PRIMITIVE = /^\s*(?:true|false|null|undefined|-?\d+(?:\.\d+)?|"[^"\\]*"|'[^'\\]*')\s*$/

/**
 * A replayable step every one of whose writes is a PRIMITIVE LITERAL.
 *
 * `visible.set(false)` written twice writes the same value both times, and a
 * signal is equality-gated, so the second write cannot propagate at all — which
 * makes "every node survives the replay" a statement about the runtime rather
 * than about the fixture's data. `rows.set([{…}])` is replayable in the DOM
 * sense and NOT here: the literal builds a fresh object each time, so a by-item
 * keyed list correctly rebuilds and demanding identity would be demanding that
 * keying strategy not exist.
 */
export function primitiveReplayStep(source: string): boolean {
  if (!replayableStep(source)) return false
  const args = [...source.matchAll(/\.\s*set\s*\(([^()]*)\)/g)].map((m) => m[1])
  if (args.length === 0) return false
  return args.every((arg) => PRIMITIVE.test(arg))
}

/**
 * MM2 — step replay. Each replayable step is applied a second time; the second
 * application is the same input again, so the DOM must be the DOM the first
 * application produced.
 *
 * The identity vector is deliberately NOT asserted here, and the reason is a
 * real one rather than a concession: `control-flow-for-keyed-by-item` keys rows
 * on the ITEM, so a step that reassigns `[{id:1,…},{id:2,…}]` builds structurally
 * equal objects with new identities and the rows are CORRECTLY rebuilt. Markup
 * is invariant under the replay for every keying strategy; node identity is not,
 * and a property that demanded it would be demanding by-item keying not exist.
 * The identity half of the replay lives in `fixtures/l4/`, where every step is
 * replayable AND identity-stable by construction and both are asserted (MM3).
 */
function mm2(session: Session, report: MetamorphicReport): void {
  for (const frame of session.frames) {
    if (frame.kind !== "replay") continue
    const source = session.stepSources[frame.index]
    if (source === undefined || !replayableStep(source)) continue
    const first = frameOf(session, "step", frame.index)
    if (first === undefined) continue
    report.checks["MM2-step-replay"]++
    if (first.html === frame.html) continue
    report.violations.push({
      fixture: session.fixture,
      property: "MM2-step-replay",
      frame: frame.label,
      message: "applying the same scripted step a second time produced different markup",
      before: first.html,
      after: frame.html,
    })
  }
}

/**
 * MM3 — replay identity, corpus-wide.
 *
 * The subset of MM2's subjects where the identity half is decidable without a
 * declaration: a step whose every write is a primitive literal writes the same
 * value on the replay, the signal is equality-gated, and nothing downstream may
 * observe the second write at all. So every node in the frame survives it.
 *
 * This is `assertStableRerender` at its strongest available generality, and it
 * is the property a `branch` that stopped comparing its key against the previous
 * one fails: the markup is identical, so the differential channel and the SSR
 * channel both stay green, and every node in the branch has been thrown away.
 */
function mm3(session: Session, report: MetamorphicReport): void {
  for (const frame of session.frames) {
    if (frame.kind !== "replay") continue
    const source = session.stepSources[frame.index]
    if (source === undefined || !primitiveReplayStep(source)) continue
    const first = frameOf(session, "step", frame.index)
    if (first === undefined) continue
    report.checks["MM3-replay-identity"]++
    if (first.identity.join(",") === frame.identity.join(",")) continue
    report.violations.push({
      fixture: session.fixture,
      property: "MM3-replay-identity",
      frame: frame.label,
      message:
        "writing the same primitive a second time rebuilt nodes. The write is equality-gated, " +
        "so nothing downstream may observe it — and the markup is identical either way, which " +
        "is why no other channel in the repository can see this",
      before: first.identity.join(","),
      after: frame.identity.join(","),
    })
  }
}

/**
 * MM4 — the declared classes, over `fixtures/l4/`.
 *
 * Every step of every L4 fixture carries exactly one class, checked in both
 * directions. `metamorphic.test.ts` asserts the totality separately, so a
 * fixture that gained a step and not a class fails as an unclassified step
 * rather than as a silently unchecked one.
 */
function mm4(
  session: Session,
  declaration: MetamorphicDeclaration,
  report: MetamorphicReport,
): void {
  const cut = segments(session.ownership)
  /**
   * Segment `k` holds the events between marker `k - 1` and marker `k`, and
   * frame `i` plants marker `i` right after its own snapshot — so the transition
   * INTO frame `i` is segment `i`.
   */
  const disposalsInto = (frame: SessionFrame): number =>
    disposalsIn(cut[session.frames.indexOf(frame)])

  const check = (
    previous: SessionFrame,
    frame: SessionFrame,
    expected: StepClass,
  ): void => {
    report.checks["MM4-declared"]++
    const lost = missing(previous.identity, frame.identity)
    const fresh = added(previous.identity, frame.identity)
    const say = (message: string): void => {
      report.violations.push({
        fixture: session.fixture,
        property: "MM4-declared",
        frame: frame.label,
        message: `declared \`${expected}\`: ${message} (${declaration.why})`,
        before: previous.identity.join(","),
        after: frame.identity.join(","),
      })
    }

    // The second, independent observation of the same declaration. Node identity
    // comes off the DOM; disposal comes off the ownership trace; and three of the
    // five classes assert both. A runtime that disposed a branch instance and
    // rebuilt a byte-identical subtree satisfies the markup — which is what every
    // other channel in this repository is a function of — and fails here.
    //
    // `grows` and `shrinks` carry NO disposal claim, and the reason is a fact
    // about §3.4 rather than a concession. `Show` compiles to ONE Block used for
    // every key (`components.ts:116`), so a `<Show when={…}>` with no fallback
    // still activates an instance scope for the falsy arm and builds nothing in
    // it — `mm-nested-branch`'s inner region grows by exactly one element and
    // disposes exactly one scope, and both are correct. Asserting "grows disposes
    // nothing" would be asserting that the empty arm is not an activation.
    const disposals = disposalsInto(frame)
    if ((expected === "preserves" || expected === "permutes") && disposals > 0) {
      say(`${disposals} scope(s) came apart in a transition that must dispose none`)
    }
    if (expected === "rebuilds" && disposals === 0) {
      say("no scope came apart, so nothing that owned the old range was taken down")
    }

    if (expected === "preserves") {
      if (lost.length > 0) say(`${lost.length} element(s) of the previous frame were destroyed`)
      if (fresh.length > 0) say(`${fresh.length} element(s) were built where none should be`)
      return
    }
    if (expected === "permutes") {
      if (!sameMultiset(previous.identity, frame.identity)) {
        say(
          `a keyed move must move nodes and build none: ${lost.length} destroyed, ` +
            `${fresh.length} built`,
        )
        return
      }
      if (previous.identity.join(",") === frame.identity.join(",")) {
        say("the elements did not move at all, so this step is not a keyed move")
      }
      return
    }
    if (expected === "rebuilds") {
      const survived = previous.identity.filter((id) => setOf(frame.identity).has(id))
      if (survived.length > 0) {
        say(
          `${survived.length} element(s) survived a rebuild: a hide/show cycle must hand back ` +
            "fresh nodes, never the same object (K6)",
        )
      }
      if (frame.identity.length === 0 && previous.identity.length === 0) {
        say("neither frame has an element, so nothing was rebuilt and nothing was proved")
      }
      return
    }
    if (expected === "grows") {
      if (lost.length > 0) say(`${lost.length} element(s) were destroyed by a step that only adds`)
      if (fresh.length === 0) say("nothing was added, so this step does not grow")
      return
    }
    if (fresh.length > 0) say(`${fresh.length} element(s) were built by a step that only removes`)
    if (lost.length === 0) say("nothing was removed, so this step does not shrink")
  }

  let previous = frameOf(session, "noop", -1) ?? frameOf(session, "mount", -1)
  if (previous === undefined) return
  for (const frame of session.frames) {
    if (frame.kind === "step") {
      const expected = declaration.steps[frame.index]
      if (expected !== undefined) check(previous, frame, expected)
      previous = frame
      continue
    }
    if (frame.kind === "replay") {
      // The replay of a step is an unchanged input by construction, whatever the
      // step's own class is: this is `assertStableRerender` proper, and it is
      // where the L4 corpus buys the identity half MM2 cannot assert generically.
      report.checks["MM4-declared"]++
      const lost = missing(previous.identity, frame.identity)
      const fresh = added(previous.identity, frame.identity)
      const replayDisposals = disposalsInto(frame)
      if (replayDisposals > 0) {
        report.violations.push({
          fixture: session.fixture,
          property: "MM4-declared",
          frame: frame.label,
          message:
            `re-applying a step disposed ${replayDisposals} scope(s) on an unchanged input ` +
            `(${declaration.why})`,
          before: previous.identity.join(","),
          after: frame.identity.join(","),
        })
      }
      if (lost.length > 0 || fresh.length > 0) {
        report.violations.push({
          fixture: session.fixture,
          property: "MM4-declared",
          frame: frame.label,
          message:
            `re-applying a step preserved no node: ${lost.length} destroyed, ${fresh.length} built. ` +
            `An L4 fixture's steps are written to be idempotent, so this is a rebuild on an ` +
            `unchanged input (${declaration.why})`,
          before: previous.identity.join(","),
          after: frame.identity.join(","),
        })
      }
      previous = frame
      continue
    }
    if (frame.kind === "event") {
      const expected = declaration.events?.[frame.index]
      if (expected !== undefined) check(previous, frame, expected)
      previous = frame
    }
  }
}

export function checkMetamorphic(
  session: Session,
  declaration?: MetamorphicDeclaration,
): MetamorphicReport {
  const report: MetamorphicReport = {
    fixture: session.fixture,
    violations: [],
    checks: emptyChecks(),
  }
  mm1(session, report)
  mm2(session, report)
  mm3(session, report)
  if (declaration !== undefined) mm4(session, declaration, report)
  return report
}

export function formatViolations(violations: readonly MetamorphicViolation[]): string {
  return violations
    .map(
      (v) =>
        `  [${v.property} @ ${v.fixture} :: ${v.frame}] ${v.message}\n` +
        `    before: ${v.before}\n    after : ${v.after}`,
    )
    .join("\n")
}
