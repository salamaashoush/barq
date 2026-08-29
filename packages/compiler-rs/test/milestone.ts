/**
 * The milestone from `CODESIGN.md` §8 that has shipped.
 *
 * Every known-failure registry carries a `greenAt`, and a marker nobody
 * compares to a clock rots: three rows promised green at M5 and were still
 * `VIOLATED` two milestones later with no assertion able to see it. Bumping
 * this number is what makes the overdue gate in each registry suite fire, so it
 * moves in the commit that closes a milestone and nowhere else.
 *
 * It then sat at 6 through M7, M7b, M7c, M8, M9, M10 and M11 — the gate that
 * exists to catch a rotting marker rotted itself, in exactly the way the
 * paragraph above describes, and read as green the whole time. Bumped to 11 at
 * M11, where it immediately named all three surviving `known-failures.ts` rows:
 * two promised M9 and one M10, and none had been rechecked against a clock
 * since. All three now say M12 and say why they moved.
 *
 * `CODESIGN.md` §8 was written to M6 and stopped, so this number ran past the
 * document that defines what it counts. §8 carries the M7–M11 history and M12's
 * contents now; a marker here is only as good as a reader's ability to look up
 * what the milestone IS.
 */
export const CURRENT_MILESTONE = 11;

/** `M5` → 5. The format is checked separately by each registry's well-formed test. */
export function milestoneNumber(greenAt: string): number {
  return Number(greenAt.slice(1));
}

/**
 * `<` and not `<=`, so a row promising M_n becomes overdue only once M_(n+1) is
 * current — one milestone of grace. Measured at M11 rather than assumed: a row
 * marked M11 does NOT fire here while `CURRENT_MILESTONE` is 11, and one marked
 * M10 does.
 *
 * That is a looser reading than the constant's own doc line ("the milestone
 * that has SHIPPED") implies, and tightening it to `<=` is a change to what the
 * gate promises rather than a bug fix — left alone deliberately, and written
 * down so the next reader does not have to re-derive which of the two it is.
 */
export function overdue(greenAt: string): boolean {
  const n = milestoneNumber(greenAt);
  return Number.isFinite(n) && n < CURRENT_MILESTONE;
}

export const OVERDUE_WHY =
  "The stale-row gate fails a row that STOPPED failing. This is the other direction: a row that " +
  "never started passing. Without it a `greenAt` marker rots silently across milestones, and the " +
  "worst available outcome is a row nobody rechecks being deregistered on the strength of a stale " +
  "marker rather than a measurement. Move `greenAt` and say why in `reason`, or close the row.";
