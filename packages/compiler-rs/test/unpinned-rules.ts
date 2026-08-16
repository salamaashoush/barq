/**
 * The rules `SEMANTICS.md` defines and nothing executable observes.
 *
 * §0.3 calls the pinning "bidirectionally machine-checkable" and it was only
 * half so: the suite asserted that every rule a fixture names exists in the
 * document, and never that every rule in the document is named by anything. The
 * unpinned set was tracked by §14's prose, which is to say by hand.
 *
 * This list is the other direction, checked in. A rule may leave it only by
 * acquiring a channel — an L1 fixture that declares it, or the L2b channel's
 * declared reach — and adding a rule to the document without a fixture, or
 * writing a fixture without striking the rule off, is a diff either way.
 *
 * It is a floor, not a target: 76 of 88 documented rules were unobserved at M0,
 * which is what §14's worklist is for. The number is printed by the L1 banner
 * on every run so that "the oracle" is never read as broader than it is.
 *
 * M4 struck five off: `C7` (single-evaluation conformance, an instrumented Block
 * per built-in consumer), `K2` and `K6` (the metamorphic node-identity grade),
 * `O3.5` (MM4's ownership column: a range is removed by the disposal of the
 * scope that owns it) and `B4` (the leak oracle's listener probe — the rule is
 * still VIOLATED, and it is now violated OBSERVABLY, which is a different
 * statement from being unobserved). Their channels' declared reach is
 * `graded.ts`'s `L4_RULES`.
 *
 * The M4b gate round struck one more: `O4.5`, whose §13 cell read "structural
 * (§14)" — the SIGNATURE was the evidence. `sem-own-given-scope-wins` makes the
 * handed scope and the ambient scope DIFFER, which compiled code never does, and
 * that is the only arrangement under which the rule is observable at all.
 *
 * The M4 fix round struck seven more, all by writing the fixture §13 already
 * named: `C3.6`, `C3.7`, `C3.8`, `C3.9` and `C5.1` through
 * `sem-props-block-in-cell-slot`, `O6` through `sem-react-untrack-keeps-owner`
 * and `R1` through `sem-react-component-body-untracked`. The first five were the
 * pin for the rule two blockers falsified, and it did not exist.
 */
/**
 * M7b struck two more off, and one of them is the reason the milestone exists.
 * K1's default REVERSED to identity keying (`CODESIGN.md` §12 Q3), so the rule
 * stopped promising something no fixture could observe and acquired
 * `sem-key-identity-default`, whose three claims each write to the DOM and then
 * reorder — the first frame is identical under all three keying modes, which is
 * how the `keyed={fn}` miscompile hid from 110 fixtures. K3 came with it: the
 * rule it names is now the state loss `keyed={false}` costs, observed in that
 * same fixture, with `BARQ011` demoted from safety net to hint.
 */
/**
 * The other half of the same honesty, found by M4b's gate round.
 *
 * `semantics.test.ts`'s "a rule whose prose claims HOLDS is pinned by a fixture
 * that exists" used `named.some(...)`, so a rule held as long as ANY of its
 * named pins existed. C6 named five and read `HOLDS` while
 * `sem-own-slot-arguments` — the one §13 identifies as the pin for the
 * slot-parameter half, and the half that turned out to be broken — did not exist
 * anywhere in the repository. The `*(new)*` marker did not catch it either: the
 * marker is machine-checked to mean "does not exist", and it meant exactly that.
 *
 * A pin that does not exist is not coverage, and a rule reading `HOLDS` on a
 * sibling's evidence is the shape §0.3 forbids. So every named pin is now
 * checked, and the ones that are still fiction are LISTED here — the same
 * registry discipline `known-failures.ts` uses. Writing the fixture strikes the
 * row off; a NEW fiction pin fails the suite; a row here whose fixture now
 * exists fails the suite as stale.
 *
 * Every row is `rule: fixture`. C6 left this list at the moment
 * `sem-own-slot-arguments.tsx` was written, which is what the list is for.
 */
export const FICTION_PINS: readonly string[] = Object.freeze([
  "C2: sem-props-direct-call-diagnostic",
  // §13 names all seven of E2's entry-point fixtures; M5 wrote the handler one
  // and the other five are still the milestones that own those entry points.
  "E2: sem-err-effect-throw",
  "E2: sem-err-ref-throw",
  "E2: sem-err-async-throw",
  "E2: sem-err-cleanup-throw",
  "C5: sem-props-forward-identity",
  "C9: sem-props-source-list-order",
  "K5: sem-key-shadowed-flow",
  "M1: sem-mount-order",
  "M2: sem-mount-no-flash",
  "X3: sem-ctx-read-after-install",
])

export const UNPINNED_RULES: readonly string[] = Object.freeze([
  // A — M7 wrote three fixtures and struck A1, A2, A3 and A4 off. A5 stays,
  // but for a different reason since M7b: the rule now EXISTS and holds, pinned
  // by `packages/core/src/actions.test.ts`, which runs all six of its
  // falsification procedures. What is missing is a COMPILER fixture — A5 is
  // entirely runtime behaviour, since there is no transition API to emit — so
  // `sem-async-optimistic-lane` (SEMANTICS.md §14.1) drives the same six
  // through compiled JSX and strikes this row.
  "A5",
  // B
  // B6 and B7 are M7's and are struck: `sem-form-dom-compare` and
  // `sem-form-selection-preserved` pin them, with the real-browser caret
  // channel beside the second.
  "B1", "B2", "B3", "B5",
  // C
  "C3.1", "C3.2", "C3.3", "C3.4", "C3.5",
  "C4", "C5", "C5.2", "C8", "C9",
  // E
  "E1", "E3", "E4",
  // H — EMPTY. M6 struck H5 off by building the channel §14.2 named (the
  // corpus-wide address-set diff), and the hydration pass struck the other
  // five: `test/hydration.test.ts` measures node reuse over the whole corpus
  // and the emission diff `hydratable` on against off, and
  // `test/hydration-mutations.test.ts` corrupts the wire one way at a time and
  // records what each corruption degraded to. `hydration.ts`'s
  // `HYDRATION_CHANNEL_RULES` is that channel's declared reach.
  // K
  "K4", "K5", "K7", "K8",
  // M
  "M1", "M2", "M3", "M4", "M5", "M6",
  // O
  "O1", "O3", "O3.3", "O3.4", "O3.6", "O4", "O4.1", "O4.2", "O4.3",
  // R — R8 joins R5 on the same terms and for the same reason: it is a
  // statement about the COST of propagation, so its channel is a benchmark and
  // a runtime test (`packages/core/src/signals.test.ts` "propagation cost in
  // graph depth", `eleven-cases.ts`'s twelfth case, the `__jrbDepth` sweep) and
  // there is nothing for a compiler fixture to observe — emission is identical
  // either side of the fix. §14.3 records both.
  "R3", "R4", "R5", "R6", "R8",
  // X
  "X4", "X5", "X6",
])
