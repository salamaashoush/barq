/**
 * The Tier-1 claims this lane re-adjudicates, with the numbers they were
 * recorded at and the Tier-2 procedure that decides them.
 *
 * The standing rule: Tier 1 iterates, Tier 2 adjudicates, and a Tier-1 win is
 * PROVISIONAL until Tier 2 confirms it. Every recorded number was Tier 1. This
 * file is the list of the ones a browser can rule on, so that "which survive"
 * is answered against a table written BEFORE the run rather than assembled from
 * whatever the run happened to show.
 *
 * `says` and `tier1` below stay as the claims were WRITTEN: they are the
 * pre-run record and are not edited to match the outcome.
 *
 * A claim that does not survive is a FINDING, not a failure. Three things can
 * be true of a Tier-1 number and they are kept apart here:
 *
 *   - the MEASUREMENT reproduces and the CONCLUSION drawn from it holds;
 *   - the measurement reproduces and the conclusion does not, because the
 *     quantity it measured is not the quantity that decides anything in a
 *     browser. This is the common case and it is what a stub DOM is for;
 *   - the measurement does not reproduce at all.
 *
 * `verdict` is filled in by the run. Nothing here is a pass/fail gate: a
 * benchmark lane that fails CI on a ratio is a lane that gets its thresholds
 * widened until it reports nothing.
 */

export type Tier = "microbenchmark" | "mount" | "reactivity" | "server"

export interface Claim {
  id: string
  /** Where the claim was recorded. */
  section: string
  /** The claim, in the document's own terms. */
  says: string
  /** What it was measured on, in the document's own terms. */
  tier1: string
  /** What decides it here, and `null` when nothing in this lane can. */
  procedure: string | null
  /**
   * What the procedure CANNOT decide, written down beside it rather than
   * discovered afterwards. A lane that only records what it can measure reads
   * every silence as a null result; this field is where "the instrument is blind
   * here" is said out loud, so a verdict cannot quietly borrow authority from a
   * column that never had any.
   */
  cannot?: string
  kind: Tier
}

export const CLAIMS: readonly Claim[] = Object.freeze([
  {
    id: "C1",
    section: "§0.3 conclusion 4",
    says:
      "the chosen calling convention costs 23.7% of JS overhead against what ships, and 0% " +
      "through a DOM — D is 3.6% FASTER than A on happy-dom",
    tier1: "stub DOM 11.537 vs 9.328 µs at 200 rows; happy-dom 516.21 vs 535.64 µs",
    procedure:
      "shapes: D against A, 200 and 1,000 rows, real Chrome, js and total separately — plus the " +
      "STUB arm, the same shapes over a plain object, which is the only one of the two that " +
      "measures the quantity 23.7% is a percentage of",
    cannot:
      "the browser arms' `js` column is mount INCLUDING the DOM mutation — ~2000 ns a row at 200 " +
      "rows against the stub arm's 70–100 — so a 23.7% difference in the JS half would be ~0.5% " +
      "of it and no number of trials resolves that. The browser arms bound the TOTAL cost and " +
      "nothing else; the ratio is the stub arm's to rule on.",
    kind: "mount",
  },
  {
    id: "C2",
    section: "§0.3 conclusion 1",
    says:
      "return-DOM, append-to-anchor and scope-passing are within noise of each other, so nobody " +
      "may claim a speed win for any of them",
    tier1: "stub DOM 11.627 / 11.711 / 11.537 µs",
    procedure: "shapes: B against C and C against D, with a paired Wilcoxon",
    kind: "mount",
  },
  {
    id: "C3",
    section: "§0.3 conclusion 2",
    says:
      "a Scope per position costs 7.3 ns a row — real but small, worth a NO_SCOPE flag and not a " +
      "design",
    tier1: "stub DOM, (12.989 − 11.537) µs over 200 rows",
    procedure: "shapes: D2 against D, 200 and 1,000 rows, browser and stub arms",
    cannot:
      "7.3 ns a row is 0.35% of the browser `js` half at 200 rows, well under that column's " +
      "minimum detectable effect; only the stub arm reports in the unit the claim is stated in.",
    kind: "mount",
  },
  {
    id: "C4",
    section: "§0.3 conclusion 3",
    says:
      "component inlining is not worth 30–40% of mount: 15% of JS overhead on a stub DOM and 0% " +
      "on happy-dom, so Anvil's headline optimisation goes to the backlog",
    tier1: "stub DOM 9.927 vs 11.711 µs; happy-dom 526.92 vs 530.73 µs",
    procedure: "shapes: E against C, browser and stub arms",
    kind: "mount",
  },
  {
    id: "C5",
    section: "§0.2, and §12's closing line",
    says:
      "a getter is 8.7x more expensive to allocate at the scale a props object is allocated — " +
      "once per component instance, i.e. once per list row. §12: 'The 8.7x number stands unrefuted.'",
    tier1: "stub DOM, 81.283 vs 9.328 µs at 200 rows",
    procedure:
      "shapes: GETTER against VALUE at mount scale, js and total separately, in the browser AND " +
      "on the stub arm — the second is the one that reports in 8.7x's own unit",
    cannot:
      "the browser arms cannot resolve an allocation ratio for the same reason they cannot resolve " +
      "C1's: their `js` column is mostly DOM. They bound what a getter costs a real mount; the " +
      "stub arm is what the 8.7x is a ratio of.",
    kind: "mount",
  },
  {
    id: "C6",
    section: "§0.4",
    says:
      "removing the setProp dispatcher is worth 0–8% per write, not the 10–25% all three designs " +
      "claimed; the branch cascade is well predicted",
    tier1: "happy-dom: id parity, value +8%, class +2%",
    procedure:
      "channels: setProp against the direct DOM call it resolves to, real Chrome, and against a " +
      "comparand doing the SAME work — `input.value = ` plus caret capture and restore, and " +
      "`className = ` plus the ownership check",
    cannot:
      "the bare comparands are not like-for-like: `setProp value` also coerces, reads the live " +
      "value and preserves the caret, and `setProp class` also verifies it still owns the " +
      "attribute. Only the `id` row and the equivalent-work pairs price the dispatcher; the bare " +
      "ratios price the dispatcher plus a feature.",
    kind: "microbenchmark",
  },
  {
    id: "C7",
    section: "§0.1",
    says: "barq's reactivity core beats @solidjs/signals 2.0 — 10 wins / 1 tie, up to 6.25x",
    tier1: "eleven graphs this project wrote, timed in Node with min-of-9",
    procedure:
      "js-reactivity-benchmark (kairo, cellx, sBench) in Chrome — a suite this project did not " +
      "write, against the same comparand — plus the depth sweep, which is not part of that suite " +
      "and exists to say what the cellx ratio is a ratio OF",
    kind: "reactivity",
  },
  {
    id: "C8",
    section: "§0.1",
    says:
      "the SSR 100-row envelope is 2.10x Solid's, drifting to 1.86x — and the bar 'hold ≥2.10x' " +
      "cannot be met or missed because the comparand floats",
    tier1: "Node, renderToString, solid-js@^1.9.3 resolving to 1.9.10",
    procedure: null,
    kind: "server",
  },
  {
    id: "C9",
    section: "§0.1 / §9.1",
    says: "barq's DOM rendering is competitive with Solid's at application scale",
    tier1: "no Tier-1 claim of this shape exists; the DOM head-to-head is component-level",
    procedure: "js-framework-benchmark, nine CPU rows plus run memory, in Chrome",
    kind: "mount",
  },
])
