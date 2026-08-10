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
 * It is a floor, not a target: 76 of 88 documented rules are unobserved at M0,
 * which is what §14's worklist is for. The number is printed by the L1 banner
 * on every run so that "the oracle" is never read as broader than it is.
 */
export const UNPINNED_RULES: readonly string[] = Object.freeze([
  // A
  "A1", "A2", "A3", "A4", "A5",
  // B
  "B1", "B2", "B3", "B4", "B5",
  // C
  "C3.1", "C3.2", "C3.3", "C3.4", "C3.5", "C3.6", "C3.7", "C3.8", "C3.9",
  "C4", "C5", "C5.1", "C5.2", "C7", "C8", "C9",
  // E
  "E1", "E2", "E2.2", "E2.3", "E3", "E4",
  // H
  "H1", "H2", "H3", "H4", "H5", "H6",
  // K
  "K1", "K2", "K3", "K4", "K5", "K6", "K7", "K8",
  // M
  "M1", "M2", "M3", "M4", "M5", "M6",
  // O
  "O1", "O3", "O3.3", "O3.4", "O3.5", "O3.6", "O4", "O4.1", "O4.2", "O4.3", "O4.5", "O6",
  // R
  "R1", "R2", "R3", "R4", "R5", "R6",
  // X
  "X4", "X5", "X6",
])
