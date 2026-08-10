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
}

/** Every row below is the same defect; only the slot differs. */
function eager(
  fixture: string,
  finding: string,
  slot: string,
  rule = "O2",
): OwnershipKnownFailure {
  return { fixture, finding, rule, status: "VIOLATED", greenAt: "M4", slot }
}

const ROWS: readonly OwnershipKnownFailure[] = [
  // ---------------------------------------------------------------------
  // M3 removed 26 rows from this table, which is what a milestone's
  // completion looks like. Every one of them was the same fact: a slot —
  // `fallback={<jsx/>}`, an element child, a nested boundary's whole subtree,
  // a component call inside a `<Match>` — was a syntactic ARGUMENT, so
  // JavaScript built it before the construct that owns it had entered its
  // scope, and the runtime cloned the template one or more levels shallower
  // than the compiler placed it.
  //
  // They went green together because they were never separate defects. A slot
  // is a `Block` now; the construct enters its scope and then calls it, and
  // the clone lands where the static tree says. The two O2.1 rows that were
  // this channel's M0 gate — `own-provider-direct` and `own-provider-wrapper`
  // — went with them, and `ownership.test.ts` now asserts the opposite of
  // what it asserted at M0.
  //
  // What is left is two remaining facts, plus the leak.
  // ---------------------------------------------------------------------

  // ---------------------------------------------------------------------
  // O2 — the DETACHED scope. `Suspense`, `Await` and `Portal` open their
  // instance scope with `createScope(…, detached: true)`, so it has no parent
  // and its chain never reaches the render root. The Block now runs under the
  // scope it was given, which is why these read `branch` rather than `root`
  // and why the other 26 are gone; what is still wrong is one level up, in
  // the scope's own parentage.
  //
  // §4.1 records the inconsistency this comes from — "`Dynamic` and `Portal`
  // use detached scopes where `Show` uses attached" — and M4 removes it by
  // replacing all ten hand-rolled bodies with `branch`/`each`/`portal`, each
  // of which takes the scope it must be a child of.
  // ---------------------------------------------------------------------
  eager("control-flow-await-suspense", "misplaced-clone@_tmpl$2@branch", "<Suspense>'s own instance scope is detached, so its fallback's clone sits under a chain that never reaches the root"),
  eager("control-flow-await-suspense", "misplaced-clone@_tmpl$3@branch/branch", "<Await> inside <Suspense>: both instance scopes are detached, so the loading body is two levels of chain short"),
  eager("control-flow-await-suspense", "misplaced-clone@_tmpl$5@branch/branch", "<Await>'s resolved body, under the same two detached scopes"),
  eager("portal", "misplaced-clone@_tmpl$2@portal", "<Portal> renders into a detached scope by design (§3.4 says its parent must be the LEXICAL one); the children now run under it, but it is not a child of the render root"),

  // ---------------------------------------------------------------------
  // O2 / O2.1 — `Match` is a scope in the static tree and not one at runtime.
  // The compiler places a `<Match>` body at `root > branch > branch`: the
  // `<Switch>`'s instance scope, then the arm's own. The runtime's `Match` is
  // an identity function that returns its props, so `<Switch>` opens ONE
  // scope for whichever arm won and the clone lands one level short — every
  // time, in both fixtures that nest an arm.
  //
  // This is not the argument-evaluation defect the 26 rows above were: the arm
  // body IS a Block and IS built inside the scope it was handed. What differs
  // is how many scopes there are. §3.4 collapses `Switch`/`Match` into a
  // single `branch(s, parent, anchor, key, bodies, flags)` with one instance
  // scope per activation, which is the shape the static tree already
  // describes, so this closes when M4 lowers the construct instead of calling
  // it.
  // ---------------------------------------------------------------------
  eager("control-flow-switch-match", "misplaced-clone@_tmpl$3@root/branch", "<Match when={loading}>'s body — Switch opens one scope, the static tree expects two"),
  eager("control-flow-switch-match", "misplaced-clone@_tmpl$4@root/branch", "<Match when={ready}>'s body — same"),
  eager("switch-match-component-bodies", "misplaced-clone@_tmpl$1@root/branch", "<Match>{<Spinner/>}</Match> — a component call as a Match body, one scope short", "O2.1"),
  eager("switch-match-component-bodies", "misplaced-clone@_tmpl$2@root/branch", "<Match>{<Content/>}</Match> — a component call as a Match body, one scope short", "O2.1"),

  // ---------------------------------------------------------------------
  // O3.7 — the leak oracle. A scope entered inside the trace window and still
  // undisposed when it closes, although the window closes on the render root's
  // own disposal. One occurrence in 120 fixtures, which is what makes the
  // assertion worth having: it is a floor of one, not a tolerance.
  // ---------------------------------------------------------------------
  {
    fixture: "control-flow-await-suspense",
    finding: "scope-never-disposed@branch",
    rule: "O3.7",
    status: "VIOLATED",
    greenAt: "M4",
    slot:
      "the <Await> branch instance created when the promise resolves registers its disposer with " +
      "the effect node that resolved it rather than with the scope above it, so disposing the " +
      "render root never reaches it",
  },

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
