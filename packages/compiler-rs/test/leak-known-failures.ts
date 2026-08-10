/**
 * The known-failure registry for the leak oracle — `SEMANTICS.md` §15, applied
 * to O3.7 and B4.
 *
 * **Why a third table.** `known-failures.ts` addresses a `claim` inside a
 * fixture under `fixtures/semantics/` and asserts that a row matching no claim
 * is a suite failure. `ownership-known-failures.ts` addresses a `finding` from
 * the L2b channel. This one addresses a `(fixture, leak)` pair produced by a
 * probe taken OUTSIDE the runtime, over the whole corpus, and merging it into
 * either of the others would mean one of the three sets of assertions could no
 * longer be made. The discipline is identical and is asserted in
 * `leaks.test.ts`:
 *
 *   1. a registered leak that does NOT occur is a suite failure, reported as
 *      stale — the leak was fixed without the registry being updated, or the
 *      probe stopped discriminating;
 *   2. an unregistered leak is a suite failure, which is what stops the registry
 *      absorbing anything by accident;
 *   3. a registered leak whose rule is not the rule the probe named is a suite
 *      failure. A fixture that fails because it does not compile is not evidence
 *      that anything leaked;
 *   4. every `rule` exists in `SEMANTICS.md` and in the leak channel's declared
 *      reach.
 *
 * There is no wildcard, no glob, no per-fixture opt-out and no environment
 * variable that widens this.
 *
 * ---
 *
 * **What the three rows are.**
 *
 * All three are ONE defect, observed three times in one fixture. `dom.ts:386`
 * binds a non-delegated handler with a bare `element.addEventListener` and
 * registers no cleanup, so the listener outlives every scope above it. B4 says
 * a listener registers a cleanup on the owning scope and that removal cannot be
 * forgotten; here there is nothing to forget, because nothing was ever
 * registered.
 *
 * The rule is `VIOLATED` in `SEMANTICS.md` and M4 did not move it — the element
 * channel is M5's. What M4 could do, and what the rows below are, is make the
 * violation OBSERVABLE: before this probe existed, the leak serialized to the
 * empty string in every channel the repository had, and the `createElement`
 * oracle leaked identically, so the differential certified it.
 *
 * Delegated handlers are not here and are not a leak: one `document` listener
 * per event type is module state for the whole process, installed by
 * `delegateEvents` and removed by `clearDelegatedEvents`. B4 is about the
 * listener a POSITION owns.
 *
 * These rows are the M5 worklist, addressed by defect rather than by symptom.
 */

import { LEAK_RULES } from "./leaks.ts"

export interface LeakKnownFailure {
  /** a fixture in `fixtures/`, without the extension */
  readonly fixture: string
  /** the `id` of one `LeakFinding`: `<kind>@<what>` */
  readonly leak: string
  /** the rule from `SEMANTICS.md` the probe must name */
  readonly rule: string
  /**
   * `VIOLATED` is a bug that shipped. `PLANNED` is a semantic change this design
   * chose on the record. Both fail today; only the first is an indictment, and
   * §0.2 forbids conflating them.
   */
  readonly status: "VIOLATED" | "PLANNED"
  /** the milestone from `CODESIGN.md` §8 after which this row must be deleted */
  readonly greenAt: string
  /** the defect, not the symptom */
  readonly reason: string
}

const LISTENER_REASON =
  "`dom.ts` binds a non-delegated handler with a bare `element.addEventListener` and registers " +
  "no cleanup on the owning scope, so the listener survives the disposal of every scope above " +
  "it. B4's falsification procedure is 'registered-listener count after dispose() MUST be 0'; " +
  "this is that count, and it is not 0. The element channel is M5's, so the rule stays VIOLATED " +
  "and the row stays here rather than being deregistered on the strength of a probe existing."

const ROWS: readonly LeakKnownFailure[] = [
  {
    fixture: "non-delegated-event",
    leak: "listener@div.mouseenter",
    rule: "B4",
    status: "VIOLATED",
    greenAt: "M5",
    reason: LISTENER_REASON,
  },
  {
    fixture: "non-delegated-event",
    leak: "listener@div.mouseleave",
    rule: "B4",
    status: "VIOLATED",
    greenAt: "M5",
    reason: LISTENER_REASON,
  },
  {
    fixture: "non-delegated-event",
    leak: "listener@div.focus",
    rule: "B4",
    status: "VIOLATED",
    greenAt: "M5",
    reason: LISTENER_REASON,
  },
]

export const LEAK_FAILURES: readonly LeakKnownFailure[] = Object.freeze(
  ROWS.map((row) => Object.freeze(row)),
)

export function leakKey(fixture: string, leak: string): string {
  return `${fixture} :: ${leak}`
}

export function leakIndex(): Map<string, LeakKnownFailure> {
  const byKey = new Map<string, LeakKnownFailure>()
  for (const row of LEAK_FAILURES) {
    const key = leakKey(row.fixture, row.leak)
    if (byKey.has(key)) throw new Error(`the leak registry has two rows for ${key}`)
    byKey.set(key, row)
  }
  return byKey
}

/** Two rows for one leak would make the second unreachable, and unreviewed. */
export function duplicateLeakRows(): string[] {
  const seen = new Set<string>()
  const twice: string[] = []
  for (const row of LEAK_FAILURES) {
    const key = leakKey(row.fixture, row.leak)
    if (seen.has(key)) twice.push(key)
    seen.add(key)
  }
  return twice
}

/** Rules a row may name: the channel's declared reach and nothing else. */
export const LEAK_REGISTRY_RULES: readonly string[] = LEAK_RULES
