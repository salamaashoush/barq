/**
 * The milestone from `CODESIGN.md` §8 that has shipped.
 *
 * Every known-failure registry carries a `greenAt`, and a marker nobody
 * compares to a clock rots: three rows promised green at M5 and were still
 * `VIOLATED` two milestones later with no assertion able to see it. Bumping
 * this number is what makes the overdue gate in each registry suite fire, so it
 * moves in the commit that closes a milestone and nowhere else.
 */
export const CURRENT_MILESTONE = 6

/** `M5` → 5. The format is checked separately by each registry's well-formed test. */
export function milestoneNumber(greenAt: string): number {
  return Number(greenAt.slice(1))
}

export function overdue(greenAt: string): boolean {
  const n = milestoneNumber(greenAt)
  return Number.isFinite(n) && n < CURRENT_MILESTONE
}

export const OVERDUE_WHY =
  "The stale-row gate fails a row that STOPPED failing. This is the other direction: a row that " +
  "never started passing. Without it a `greenAt` marker rots silently across milestones, and the " +
  "worst available outcome is a row nobody rechecks being deregistered on the strength of a stale " +
  "marker rather than a measurement. Move `greenAt` and say why in `reason`, or close the row."
