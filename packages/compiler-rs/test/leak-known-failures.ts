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
 * **The three rows M5 removed.**
 *
 * All three were ONE defect, observed three times in one fixture: `dom.ts` bound
 * a non-delegated handler with a bare `element.addEventListener` and registered
 * no cleanup, so the listener outlived every scope above it. M5 gave the
 * listener channel its own entry point — `listen($s, el, type, handler)` — which
 * registers the removal on the scope that owns the element, so there is nothing
 * a call site can forget. The count B4's falsification procedure asks for is 0
 * across the corpus, and `leaks.test.ts` asserts it together with the probe's
 * own discrimination.
 *
 * Delegated handlers are not here and were never a leak: one `document`
 * listener per event type is module state for the whole process, installed by
 * `delegateEvents` and removed by `clearDelegatedEvents`. B4 is about the
 * listener a POSITION owns.
 *
 * The table is empty and the four assertions in `leaks.test.ts` still run
 * against it — an unregistered leak is still a suite failure, which is the half
 * that matters when a table has no rows.
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
  /**
   * The digest of the leak's `detail` this row was written against
   * (`ratchet.ts`). A leak that goes on occurring while what it reports changes
   * — three listeners instead of four, a different owner named — is a row whose
   * text has stopped describing what happens. It fails here whether the change
   * is a regression or an improvement.
   *
   * `BARQ_RATCHET=print bun test` prints the value to put here.
   */
  readonly observed: string
}

const ROWS: readonly LeakKnownFailure[] = []

export const LEAK_FAILURES: readonly LeakKnownFailure[] = Object.freeze(
  ROWS.map((row) => Object.freeze(row)),
)

/**
 * The probe's REACH, pinned — the half of the ratchet an EMPTY table needs.
 *
 * This file's four assertions all reduce, with no rows, to "nothing leaked".
 * That is worth something only while the probes still see as much as they did.
 * The listener probe has already been in the failure state this pin exists for:
 * it patched `globalThis.EventTarget.prototype`, intercepted nothing, and
 * reported zero listeners for a fixture that registers four — exactly as
 * confidently as a correct runtime would. `leaks.test.ts` asserts each probe is
 * individually live; this asserts the TOTAL has not quietly moved, in either
 * direction, because a corpus that grew without anyone re-reading what the
 * probes now cover is the same problem wearing the other sign.
 *
 * The pin below is the first thing this ratchet did, and it is worth recording:
 * it fired on its first run. The corpus had gained `fixtures/l4/
 * mm-identity-default-move.tsx` — 149 sessions became 150, 454 scope entries
 * became 462, 252 effects became 253 — and every existing assertion in this
 * file stayed green through it, because a probe that covers one more fixture
 * and finds nothing reports exactly what a probe that covers 149 and finds
 * nothing reports.
 *
 * M10 moved it a second time, and for the same kind of reason: the two spread
 * fixtures. 150 sessions became 152, 462 scope entries became 473, 273 effects
 * became 278. The scope entries are the interesting half — eleven of them for
 * two fixtures, because a lowered region enters a scope per row where the
 * adapter's `insert` hole entered one for the hole and then the primitive
 * entered its own. Nothing leaked, which is what the four assertions say and
 * what this pin is here to stop being mistaken for coverage.
 */
export const LEAK_REACH: Readonly<Record<string, number>> = Object.freeze({
  sessions: 152,
  scopesEntered: 473,
  effectsCreated: 278,
  listeners: 30,
})

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
