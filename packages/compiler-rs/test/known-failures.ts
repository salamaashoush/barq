/**
 * The known-failure registry — `SEMANTICS.md` §15.
 *
 * "Green except the known failures" has to be a state the suite ASSERTS. A list
 * that can silently absorb a new failure is worthless, so this file is a data
 * table under review and nothing else: there is no wildcard, no glob, no
 * `expectFail` annotation inside a fixture, and no environment variable that
 * widens it. Adding a row is a diff. Removing one is what a milestone's
 * completion looks like.
 *
 * A row addresses a single CLAIM, not a fixture. Every L1 fixture carries
 * control claims that pass today — the explicit-thunk workaround, the half of
 * the disposer that does empty the container — and those are what make the
 * failures beside them attributable. A fixture-grained registry could not tell
 * the two apart, and "this fixture fails" would stop being evidence about
 * anything in particular.
 *
 * `semantics.test.ts` makes five assertions against this table (§15.2):
 *
 *   1. a registered claim that PASSES is a suite failure, reported as stale;
 *   2. an unregistered claim that FAILS is a suite failure;
 *   3. a registered claim that fails for the WRONG REASON is a suite failure —
 *      the message must name `rule` as a standalone token, and a crash is never
 *      the right reason. This is the assertion that makes M0 mean anything;
 *   4. every `rule` exists in `SEMANTICS.md` and is declared in the fixture's
 *      own `rules` export, checked in both directions;
 *   5. a row matching no claim is a suite failure, reported as stale.
 */

export interface KnownFailure {
  /** A `.tsx` under `fixtures/semantics/`, without the extension. */
  readonly fixture: string
  /** The `id` of one `Claim` in that fixture's `claims` export. */
  readonly claim: string
  /** The rule from `SEMANTICS.md` the failure must name. */
  readonly rule: string
  /**
   * `VIOLATED` is a bug that shipped. `PLANNED` is a semantic change this
   * design chose on the record in `CODESIGN.md` §11. Both fail at M0; only the
   * first is an indictment, and conflating them is what §0.2 forbids.
   */
  readonly status: "VIOLATED" | "PLANNED"
  /** The milestone from `CODESIGN.md` §8 after which this row must be deleted. */
  readonly greenAt: string
  /** Why it fails, in terms of the defect rather than the symptom. */
  readonly reason: string
}

const ROWS: readonly KnownFailure[] = [
  // -------------------------------------------------------------------------
  // M3 removed 24 rows from this table, which is what a milestone's completion
  // looks like. They were one defect class with eight rule IDs on it — O2,
  // O2.1, X1, X2, X3, C6, E2.1, O4.4 — and one cause: `children` was a
  // syntactic ARGUMENT, so a child was constructed at its parent's call site,
  // before the parent had made the scope its own value is written into.
  //
  // The fixtures that carried them are unchanged in what they assert:
  // sem-ctx-provider-direct-child, -default-silent, -nested, -wrapper-component,
  // sem-ctx-value-is-live, sem-err-construction-throw, sem-err-fallback-reads-
  // context and sem-testing-wrapper-eager. Every one of them now holds, because
  // `children` is a Block and the only party holding the instance scope is the
  // construct that entered it.
  //
  // What is left below is not that class.
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // sem-own-render-disposer-disposes. `render` opens a root scope, records the
  // container as its range and returns a disposer that disposes the scope (O3)
  // and removes the range, so `the-disposer-stops-effects`,
  // `the-disposer-runs-cleanups` and `the-subtree-holds-nothing-afterwards`
  // came off this table at M2 and stay off.
  //
  // Two more rows came off in M3's fix round. Both were one defect: the `scope`
  // pass re-signatured `createScope((d) => { … })` to `(_s$, d) => …` because
  // the callback contained JSX in value position, while `createScope` went on
  // invoking it as `fn(dispose)` — so `outer` was `undefined` and the scope the
  // two control claims dispose was never disposed. C2 is what the pass was
  // missing, and `src/scope.rs` now asks the declaration question instead of the
  // containment one. The same defect miscompiled `rows.map((row) => …)` into
  // `.map((_s$, row) => …)` in ordinary JavaScript, outside the corpus.
  //
  // The one row here is what M3 did NOT close.
  // -------------------------------------------------------------------------
  {
    fixture: "sem-own-render-disposer-disposes",
    claim: "the-disposer-disposes-when-an-owner-is-current",
    rule: "O5",
    status: "VIOLATED",
    greenAt: "M4",
    reason:
      "`render(<Tree/>, host)` evaluates its first argument BEFORE `render` is entered, so with an " +
      "owner current the subtree's effects are that owner's kids from the instant they exist and the " +
      "root never held them. M3 was expected to close this by making the argument form stop existing, " +
      "and it did not: the compiler's `scope` pass rewrites the DECLARATION of a function containing " +
      "JSX, but `render(<Tree/>, host)` is a CALL, and nothing lowers a JSX argument into the Block " +
      "the callee wants. `render` still accepts both forms and still emits RENDER_SUBTREE_NOT_OWNED " +
      "rather than returning a disposer that quietly disposes nothing. Green when a JSX argument at a " +
      "`render` call site lowers to a Block, which is the same machinery M4's flow pass needs for " +
      "every other primitive that takes one.",
  },

]


export const KNOWN_FAILURES: readonly KnownFailure[] = Object.freeze(
  ROWS.map((row) => Object.freeze(row)),
)

/** The rows §15.4 says the gate is really about, addressed by fixture. */
export const GATE_FIXTURES: readonly string[] = Object.freeze([
  "sem-ctx-provider-direct-child",
  "sem-ctx-provider-wrapper-component",
  "sem-err-construction-throw",
])

export function registryKey(fixture: string, claim: string): string {
  return `${fixture} :: ${claim}`
}

export function registryIndex(): Map<string, KnownFailure> {
  const byKey = new Map<string, KnownFailure>()
  for (const row of KNOWN_FAILURES) byKey.set(registryKey(row.fixture, row.claim), row)
  return byKey
}

/**
 * Two rows for one claim would make the second silently unreachable, and a row
 * nobody reads is a row nobody reviews. Reported as a test rather than thrown
 * at index time, so the failure names the claim.
 */
export function duplicateRows(): string[] {
  const seen = new Set<string>()
  const twice: string[] = []
  for (const row of KNOWN_FAILURES) {
    const key = registryKey(row.fixture, row.claim)
    if (seen.has(key)) twice.push(key)
    seen.add(key)
  }
  return twice
}
