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
    greenAt: "M5",
    reason:
      "`render(<Tree/>, host)` evaluates its first argument BEFORE `render` is entered, so with an " +
      "owner current the subtree's effects are that owner's kids from the instant they exist and the " +
      "root never held them. M3 was expected to close this by making the argument form stop existing, " +
      "and it did not: the compiler's `scope` pass rewrites the DECLARATION of a function containing " +
      "JSX, but `render(<Tree/>, host)` is a CALL, and nothing lowers a JSX argument into the Block " +
      "the callee wants. `render` still accepts both forms and still emits RENDER_SUBTREE_NOT_OWNED " +
      "rather than returning a disposer that quietly disposes nothing. Green when a JSX argument at a " +
      "`render` call site lowers to a Block. M4b delivered the flow pass — eleven constructs compile " +
      "to `_$branch`/`_$each`/`_$boundary`/`_$portal` and `NO_SCOPE` is emitted non-zero — and it did " +
      "NOT close this row: the pass recognises a construct by the `SymbolId` its TAG resolves to, and " +
      "`render` is neither a flow construct nor a tag. A JSX argument at an arbitrary call site is a " +
      "separate lowering, which is why the milestone marker stays at M5. Closing it is not only a " +
      "compiler change: " +
      "three CONTROL claims in this fixture — `control-the-ambient-owner-disposes-what-it-was-handed`, " +
      "`control-the-argument-form-reports-that-it-cannot-dispose` and " +
      "`control-the-block-form-disposes-when-an-owner-is-current` — are written about the ARGUMENT " +
      "form's behaviour and stop observing anything the moment the argument form stops existing, so " +
      "the fixture has to be re-cut in the same change.",
  },

  // -------------------------------------------------------------------------
  // sem-own-given-scope-wins. O4.5 was recorded in §13 as pinned by "structural
  // (§14)" — the SIGNATURE was the evidence, and a signature is not evidence.
  // `insert` and `setProp` both took a `Scope`, validated it, and then opened
  // their render effect under whatever was ambient. Both now open it under the
  // scope they were handed, and the first three claims of this fixture pin that.
  //
  // The fourth is the half that did not land, and it did not land because it is
  // coupled to the row above.
  // -------------------------------------------------------------------------
  {
    fixture: "sem-own-given-scope-wins",
    claim: "a-children-block-is-invoked-with-the-given-scope",
    rule: "O4.5",
    status: "VIOLATED",
    greenAt: "M5",
    reason:
      "`childToNodes` invokes a children Block with `getOwner()` and not with the `s` the call was " +
      "given, so a Block reached through `insert`'s array path runs under the ambient owner. The " +
      "one-line change is coupled to O5 and was MEASURED, not assumed: handing `s` down turns " +
      "`sem-own-render-disposer-disposes`'s `control-the-argument-form-reports-that-it-cannot-dispose` " +
      "red, because the root then owns a kid and `RENDER_SUBTREE_NOT_OWNED` stops firing. The two " +
      "halves have to land together, in the change that lowers `render`'s JSX argument to a Block " +
      "and re-cuts that fixture — which is the row above, green at M5.",
  },

  // -------------------------------------------------------------------------
  // sem-props-block-in-cell-slot. The fixture drove one shape of Block —
  // `block()`'s, which carries an entry guard of its own — so it measured the
  // guard rather than the rule. M4b's gate round drove all three across all six
  // slots, 12 pairs. The `pin()`ned shape (branded, deliberately UNGUARDED)
  // survived four of the six and now throws at every one: `flow.ts` grew the
  // value test its four Cell slots never had. The LAUNDERED shape is what is
  // left.
  // -------------------------------------------------------------------------
  {
    fixture: "sem-props-block-in-cell-slot",
    claim: "every-shape-of-block-throws-at-every-cell-slot",
    rule: "C3.8",
    status: "VIOLATED",
    greenAt: "M5",
    reason:
      "2 of the 12 (shape, slot) pairs still take a Block without throwing, both of them the " +
      "LAUNDERED shape — a Cell that yields a Block, which carries no brand, so only a test on the " +
      "READ can see it. `each`'s source is handed to `mapArray`/`repeat` BY IDENTITY, so there is " +
      "no read site inside `each` to test at and wrapping it costs a closure per construction on " +
      "the list path; `provide`'s value is stored and read later at `Ctx.use()`, which is the " +
      "context read path and not the provider. Both are one change — a read-side `readSlot` at the " +
      "point each carrier is actually called — and both belong with M5's element and channel work, " +
      "where `mapArray`'s source read is being touched anyway. `setProp`'s laundered case was the " +
      "third and it is CLOSED: it stringified the Block's own source text into the attribute, " +
      "which is the outcome that made this worth a row rather than a note.",
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
