/**
 * The known-failure registry for layer L2b — `SEMANTICS.md` §15, applied to the
 * ownership channel.
 *
 * **Why this is a second table and not rows in `known-failures.ts`.** That one
 * addresses a `claim` inside a fixture under `fixtures/semantics/`, and its
 * fifth assertion is that a row matching no claim is a suite failure. L2b has
 * no claims: it runs over the whole 117-fixture corpus and asks one mechanical
 * question per template clone, so its rows address a *finding* — a
 * `(fixture, finding)` pair produced by the comparison. Merging the two tables
 * would mean one of the two sets of assertions could no longer be made. The
 * discipline is identical and is asserted in `ownership.test.ts`:
 *
 *   1. a registered finding that does NOT occur is a suite failure, reported as
 *      stale — the defect was fixed without the registry being updated, or the
 *      check stopped discriminating;
 *   2. an unregistered finding is a suite failure, which is what stops the
 *      registry absorbing anything by accident;
 *   3. a registered finding whose rule is not the rule the channel named is a
 *      suite failure. This is the assertion that makes M0 mean anything: a
 *      fixture that fails because it does not compile is not evidence that the
 *      oracle saw an ownership defect;
 *   4. every `rule` exists in `SEMANTICS.md`.
 *
 * There is no wildcard, no glob, no per-fixture opt-out and no environment
 * variable that widens this. Adding a row is a diff. Removing one is what a
 * milestone's completion looks like.
 *
 * ---
 *
 * **What these 9 rows are, and what the 30 before them were.**
 *
 * At M0 there were 30, and 29 of them were one defect found 29 times: every
 * construct that owns a scope was an ordinary function call, everything it was
 * supposed to own arrived as an ARGUMENT, and JavaScript evaluates arguments
 * before the call — so the body was built before the scope that must own it
 * existed. That is O2, and it is the defect that prompted the redesign. M3's
 * calling convention removed it at the source: a child is a Block, so there is
 * no expression in the emitted language that means "children, already built".
 * Twenty-six rows were deleted because the finding stopped occurring.
 *
 * What is left is two families and one straggler:
 *
 *   - **the detached scope** (`control-flow-await-suspense`, `portal`) — six
 *     O2 findings and two O2.1. `Await` and `Portal` build inside a scope
 *     created with `detached: true`, which by construction has no parent, so
 *     the clone's runtime path is not below the scope the construct was given.
 *     The static tree says where it belongs; the runtime tree cannot express
 *     it. M4's `branch`/`boundary` primitives give both a parented instance
 *     scope and the rows go with them.
 *   - **`Match` is not a scope** (`control-flow-switch-match`,
 *     `switch-match-component-bodies`) — `Match` is an identity function
 *     (C8-adjacent): it returns its own props record and builds nothing, so
 *     the arm's body is owned by the `Switch` instance rather than by an arm
 *     scope the static tree names. M4 is where an arm becomes a `branch`.
 *   - **O3.7 ×1** — a scope that is never disposed, the same family seen from
 *     the other end: nothing owns it, so nothing takes it apart.
 *
 * None of these is visible in the DOM, and that is the point of the channel.
 * `oracle.test.ts` renders both paths and gets byte-identical markup, because
 * `createElement` evaluates the same arguments in the same order and is wrong
 * in the same way. A differential oracle cannot see a defect its reference
 * shares. This one is derived from the source instead.
 */

export interface OwnershipKnownFailure {
  /** a fixture in `fixtures/` or in `fixtures/ownership/` */
  readonly fixture: string
  /**
   * the `id` of one `Finding` — `<kind>@<template>@<the path it was observed
   * at>`. The observed path is part of the identity: one template misplaced at
   * two different wrong paths is two violations, and an id naming only the
   * template would let the second land inside the first's row unseen.
   */
  readonly finding: string
  /** the rule from `SEMANTICS.md` the channel must name */
  readonly rule: string
  /**
   * `VIOLATED` is a bug that shipped. `PLANNED` is a semantic change this
   * design chose on the record. Both fail at M0; only the first is an
   * indictment, and `SEMANTICS.md` §0.2 forbids conflating them.
   */
  readonly status: "VIOLATED" | "PLANNED"
  /** the milestone from `CODESIGN.md` §8 after which this row must be deleted */
  readonly greenAt: string
  /** the slot that was built eagerly, in the source's own words */
  readonly slot: string
  /**
   * The digest of the finding's `detail` this row was written against
   * (`ratchet.ts`). A finding that goes on occurring while its detail changes —
   * a different observed path, a different count — is a row whose text has
   * quietly stopped describing what happens, and it fails here whether the
   * change is a regression or an improvement.
   *
   * `BARQ_RATCHET=print bun test` prints the value to put here.
   */
  readonly observed: string
}

const ROWS: readonly OwnershipKnownFailure[] = [
  // ---------------------------------------------------------------------
  // M4 removed the last 9 rows, and the table is now EMPTY. That is what a
  // milestone's completion looks like, and it is the strongest state this
  // channel has been in: every template clone in the corpus lands at the path
  // the compiler's static ownership tree places it at, with no exceptions
  // bought back.
  //
  // The three families that were left after M3, and what closed each:
  //
  //   - **the detached scope** (`control-flow-await-suspense` ×3, `portal` ×1).
  //     `Suspense`, `Await` and `Portal` opened their instance scope with
  //     `scope(…, detached: true)`, so it had no parent and its chain
  //     never reached the render root. `branch`/`boundary`/`portal` in
  //     `packages/core/src/flow.ts` call `enter(given)` and nothing else, so an
  //     instance is a child of the scope the construct was handed — by
  //     construction, in one place, for all four primitives.
  //
  //   - **`Match` is not a scope** (`control-flow-switch-match` ×2,
  //     `switch-match-component-bodies` ×2). The static tree placed an arm body
  //     one level deeper than the runtime ever put it. §3.4 collapses
  //     `Switch`/`Match` into ONE `branch` with one instance scope per
  //     activation, so the tree stopped claiming the second: `ownership.rs`
  //     gives `Flow::Match` no node of its own. Note the direction — the
  //     COMPILER was wrong here and the runtime was right, which is the reading
  //     the row's own text got backwards.
  //
  //   - **O3.7, the leak** (`control-flow-await-suspense` ×1). A branch
  //     instance created when a promise resolved registered its disposer with
  //     the effect node that resolved it, so disposing the render root never
  //     reached it. `region` in `flow.ts` never registers an instance with the
  //     driving effect: `enter(given)` files it under the scope above, and the
  //     effect's own re-run cleanup cannot take it.
  //
  // One more thing moved with them, and it is a compiler change rather than a
  // runtime one: `Flow::Reveal` is `OwnKind::Provide`. `Reveal` installs a
  // coordinator and owns no range, so what it creates is a provide scope; it
  // was a branch only because everything that was not a list or a portal was.
  // ---------------------------------------------------------------------
]

export const OWNERSHIP_KNOWN_FAILURES: readonly OwnershipKnownFailure[] = Object.freeze(ROWS)

/**
 * The fixture the gate is really about. If it stops failing while the emitted
 * module still passes `children` as an argument, L2b cannot see the bug that
 * prompted this work.
 */
export const GATE_FIXTURE = "own-provider-direct"

/**
 * The same defect one component away, which is the shape it has in every real
 * application. Stated separately from the row that registers it, so that
 * deleting the row cannot quietly delete the gate with it.
 */
export const WRAPPER_GATE_FIXTURE = "own-provider-wrapper"

/**
 * The channel's REACH, pinned — the other half of the ratchet, and the half an
 * EMPTY table needs.
 *
 * With no rows, this file asserts exactly one thing: the channel found nothing.
 * That assertion is worth something only while the channel still looks at as
 * much as it did, and a probe that stopped discriminating reports zero findings
 * in a voice indistinguishable from a correct compiler. It is assertion 1's
 * failure mode — "the check stopped discriminating, which is the dangerous
 * reading" — seen from outside any individual row, and with the table empty
 * there is no row left to see it from.
 *
 * So the census `ownership.test.ts` already prints is pinned here, and it fails
 * in BOTH directions. Fewer clones checked is a blinded oracle. More is
 * coverage nobody has reviewed — a fixture arrived and nobody asked what the
 * channel now claims about it. Regenerating is a diff, in the change that
 * caused it.
 */
export const OWNERSHIP_REACH: Readonly<Record<string, number>> = Object.freeze({
  fixtures: 136,
  scopes: 377,
  effects: 254,
  clones: 295,
  determined: 293,
  unattributed: 1,
  cascades: 1,
})

export function ownershipKey(fixture: string, finding: string): string {
  return `${fixture} :: ${finding}`
}

export function ownershipIndex(): Map<string, OwnershipKnownFailure> {
  const byKey = new Map<string, OwnershipKnownFailure>()
  for (const row of OWNERSHIP_KNOWN_FAILURES) {
    const key = ownershipKey(row.fixture, row.finding)
    if (byKey.has(key)) throw new Error(`the ownership registry has two rows for ${key}`)
    byKey.set(key, row)
  }
  return byKey
}
