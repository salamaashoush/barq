/**
 * The known-failure registry.
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
 * `semantics.test.ts` makes seven assertions against this table:
 *
 *   1. a registered claim that PASSES is a suite failure, reported as stale;
 *   2. an unregistered claim that FAILS is a suite failure;
 *   3. a registered claim that fails for the WRONG REASON is a suite failure —
 *      the message must name `rule` as a standalone token, and a crash is never
 *      the right reason. This is the assertion that makes M0 mean anything;
 *   4. every `rule` exists in the rule set and is declared in the fixture's
 *      own `rules` export, checked in both directions;
 *   5. a row matching no claim is a suite failure, reported as stale;
 *   6. a row whose `greenAt` is behind `CURRENT_MILESTONE` is a suite failure,
 *      reported as OVERDUE. Assertions 1 and 5 fail a row that stopped failing;
 *      this is the other direction, a row that never started passing, and
 *      without it a marker rots across milestones until someone deregisters the
 *      row on the strength of the marker rather than a measurement.
 *   7. THE RATCHET (`ratchet.ts`, the wire split). A row whose claim still
 *      fails but fails DIFFERENTLY is a suite failure, whether the difference
 *      is a regression or an improvement. Assertions 1 and 6 only see a row
 *      that flipped; this one sees a row that moved. C3.8 below is the live
 *      example: fix two of its four surviving (shape, slot) pairs and every
 *      other assertion here stays green while the row goes on saying "4 of 18"
 *      and proposing a fix for slots that are no longer broken.
 */

export interface KnownFailure {
  /** A `.tsx` under `fixtures/semantics/`, without the extension. */
  readonly fixture: string;
  /** The `id` of one `Claim` in that fixture's `claims` export. */
  readonly claim: string;
  /** The rule from the rule set the failure must name. */
  readonly rule: string;
  /**
   * `VIOLATED` is a bug that shipped. `PLANNED` is a semantic change this
   * design chose on the record in the wire decision. Both fail at M0; only the
   * first is an indictment, and conflating them is what the status rule forbids.
   */
  readonly status: "VIOLATED" | "PLANNED";
  /**
   * The milestone from the shipping gate after which this row must be deleted.
   * Enforced against `milestone.ts`'s `CURRENT_MILESTONE`: moving it is a diff
   * that has to say why in `reason`.
   */
  readonly greenAt: string;
  /** Why it fails, in terms of the defect rather than the symptom. */
  readonly reason: string;
  /**
   * The digest of the failure message this row was written against
   * (`ratchet.ts`). Any change to what the claim reports — a partial fix, a
   * different count, a reworded diagnosis — fails until this is regenerated,
   * because that is the change in which `reason` has to be re-read.
   *
   * `BARQ_RATCHET=print bun test` prints the value to put here.
   */
  readonly observed: string;
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
  // pass re-signatured `scope((d) => { … })` to `(_s$, d) => …` because
  // the callback contained JSX in value position, while `scope` went on
  // invoking it as `fn(dispose)` — so `outer` was `undefined` and the scope the
  // two control claims dispose was never disposed. C2 is what the pass was
  // missing, and `src/scope.rs` now asks the declaration question instead of the
  // containment one. The same defect miscompiled `rows.map((row) => …)` into
  // `.map((_s$, row) => …)` in ordinary JavaScript, outside the corpus.
  //
  // The one row that was left — O5's `the-disposer-disposes-when-an-owner-is-current`
  // — is GONE at M12, and its removal is what a milestone's completion looks
  // like. The row asked for one thing and got it: a bare JSX argument in
  // `render`/`hydrate`'s first position is wrapped into `(_s$) => …` by the
  // `scope` pass, so the two spellings of a mount are one program and there is
  // no compiled eager form left to leak.
  //
  // The runtime still ACCEPTS a built subtree and still warns about it
  // (RENDER_SUBTREE_NOT_OWNED), because a hand-written or un-compiled caller can
  // still produce one. The fixture was re-cut in the same change to keep that
  // observable: `mountInsideAScope` has three modes now — `jsx` for the compiled
  // spelling, `block` for the hand-written Block, and `built` for a subtree
  // constructed through a LOCAL, which the wrap does not reach. Without the
  // third the two controls about relocation and the diagnostic would have gone
  // on passing while silently measuring the Block form.
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // sem-own-given-scope-wins. O4.5 was recorded as pinned by "structural
  // " — the SIGNATURE was the evidence, and a signature is not evidence.
  // `insert` and `setProp` both took a `Scope`, validated it, and then opened
  // their render effect under whatever was ambient. Both now open it under the
  // scope they were handed, and the first three claims of this fixture pin that.
  //
  // Those three drive RUNTIME entry points, and the M2 gate found that the
  // COMPILED path emits none of them for the element-binding channel: it emitted
  // a bare `renderEffect(compute, apply)` taking no scope at all, so the channel
  // the design exists for was still ambient-owned while the registry read
  // "closed for setProp". `bindEffect` takes the scope first now, `block`
  // establishes it as `CURRENT` for the whole body so the argument decides for
  // `useContext`/`onCleanup`/`effect` too, and the fourth claim below —
  // `the-compiled-element-binding-owns-by-the-scope-it-was-given` — drives the
  // EMISSION rather than a helper beside it. It is a control, and it goes red
  // when either half is reverted; measured, not assumed.
  //
  // The last half landed at M12, with O5, exactly as the coupling predicted —
  // and the row's own DIAGNOSIS turned out to be wrong, which is worth keeping.
  // It said `childToNodes` invokes the Block with `getOwner()`. It does, and
  // that is not the path this claim drives: an array holding a function goes
  // `insert` → the live-hole effect → `applyInsert` → `normalizeChildToNodes`,
  // and never reaches `childToNodes` at all. M9 restructured `insert` to make
  // the array one live hole and the row's text went on describing the shape
  // from before it. `normalizeChildToNodes` takes the scope now, `applyInsert`
  // threads it, and `sawScope` is A.
  //
  // The coupling to O5 was real and is discharged: handing the scope down turns
  // `control-the-argument-form-reports-that-it-cannot-dispose` red only while
  // the compiled eager form exists, and it does not any more.
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // sem-props-block-in-cell-slot. The fixture drove one shape of Block —
  // `block()`'s, which carries an entry guard of its own — so it measured the
  // guard rather than the rule. M4b's gate round drove all three across all six
  // slots, 12 pairs. The `pin()`ned shape (branded, deliberately UNGUARDED)
  // survived four of the six and now throws at every one: `flow.ts` grew the
  // value test its four Cell slots never had. The LAUNDERED shape is what is
  // left.
  //
  // CLOSED at M12, and it took all three answers the row had been holding open.
  //
  //   - `provide`'s value is PROBED at install now, not merely stored. That is
  //     the semantic change the row called "nobody's decision yet" and it is the
  //     one that mattered: a provided Cell yielding a Block reached every
  //     consumer, and the first thing to stringify it put a Block's source text
  //     where a value belonged — the same outcome as the `setProp` case that
  //     made this rule worth a row. X2 already says a provided value is a Cell;
  //     what moved is when its FIRST read happens, and `untrack` keeps that read
  //     out of whatever is installing.
  //   - `each`'s source is tested inside `mapArray`, where the read has already
  //     happened — so the test is one property probe on a value in hand rather
  //     than the closure per construction the row costed on the list path.
  //   - the two HANDLER slots are tested on the RETURN, which is what
  //     `applyRefs` already did for `ref`. A handler must not be invoked at the
  //     bind — that would fire it — so the laundered shape is indistinguishable
  //     from a legal 0-arity handler until it has been called. The claim was
  //     re-cut to DISPATCH, because that is the read, and the refusal ROUTES
  //     rather than escaping: an exception thrown in a listener does not leave
  //     `dispatchEvent`, measured. An error boundary observes it, which is what
  //     an application would have.
  //
  // The M2 gate round added the three slots the fixture had no way to see:
  // `ref`, a delegated handler and a direct listener. They are the two positions
  // where `block`'s entry guard is STRUCTURALLY UNREACHABLE, because the value
  // is invoked with the Element or with the Event rather than with `undefined` —
  // so a forwarded Block ran with a DOM node as its scope and everything it
  // built outlived root disposal, silently. All three now refuse a branded Block
  // by testing the VALUE at the read. Nine slots, 18 pairs; the count in this
  // row went 2/12 → 4/18 because the fixture grew eyes, not because anything
  // regressed.
  // -------------------------------------------------------------------------
];

export const KNOWN_FAILURES: readonly KnownFailure[] = Object.freeze(
  ROWS.map((row) => Object.freeze(row)),
);

/** The rows the gate rows says the gate is really about, addressed by fixture. */
export const GATE_FIXTURES: readonly string[] = Object.freeze([
  "sem-ctx-provider-direct-child",
  "sem-ctx-provider-wrapper-component",
  "sem-err-construction-throw",
]);

export function registryKey(fixture: string, claim: string): string {
  return `${fixture} :: ${claim}`;
}

export function registryIndex(): Map<string, KnownFailure> {
  const byKey = new Map<string, KnownFailure>();
  for (const row of KNOWN_FAILURES) byKey.set(registryKey(row.fixture, row.claim), row);
  return byKey;
}

/**
 * Two rows for one claim would make the second silently unreachable, and a row
 * nobody reads is a row nobody reviews. Reported as a test rather than thrown
 * at index time, so the failure names the claim.
 */
export function duplicateRows(): string[] {
  const seen = new Set<string>();
  const twice: string[] = [];
  for (const row of KNOWN_FAILURES) {
    const key = registryKey(row.fixture, row.claim);
    if (seen.has(key)) twice.push(key);
    seen.add(key);
  }
  return twice;
}
