/**
 * The absolute effect channel: per fixture, how many effects the compiled
 * render creates and how often they run. These are optimality claims, never
 * equivalence claims, and an equality catches both directions: a binding that
 * silently went missing reads as one effect FEWER, and an over-eager one as one
 * more.
 *
 * ## The columns
 *
 *  - `created`  — effects the compiled render constructs across the whole cycle
 *  - `runs`     — total effect invocations across the whole cycle
 *  - `busiest`  — the highest run count any single effect reached
 *  - `frames`   — initial render + scripted steps + dispatched events
 *
 * `busiest` is the column the aggregate hides: one binding re-running on every
 * frame is invisible in `runs` whenever another binding runs fewer times, which
 * is exactly how a mis-fused effect group used to pass.
 *
 * The rows are snapshots, so a number that moves is a snapshot diff read in the
 * change that moves it.
 */

import { describe, expect, it } from "bun:test";

import { listFixtures, renderViaCompiler } from "./harness.ts";

interface EffectCount {
  /** A `.tsx` under `fixtures/`, without the extension. */
  readonly fixture: string;
  /** Effects the compiled render creates across every frame. */
  readonly created: number;
  /** Total effect runs across every frame. */
  readonly runs: number;
  /** The busiest single effect's run count. */
  readonly busiest: number;
  /** Initial render plus every scripted step and dispatched event. */
  readonly frames: number;
}

/** One row, as the snapshot records it. */
function formatEffectRow(row: EffectCount): string {
  return (
    `  { fixture: ${JSON.stringify(row.fixture)}, created: ${row.created}, ` +
    `runs: ${row.runs}, busiest: ${row.busiest}, frames: ${row.frames} },`
  );
}

async function measure(name: string): Promise<EffectCount> {
  const render = await renderViaCompiler(name);
  return {
    fixture: name,
    created: render.trace.created,
    runs: render.trace.totalRuns,
    busiest: render.runs.reduce((n, r) => Math.max(n, r), 0),
    frames: 1 + render.frames.length + render.eventFrames.length,
  };
}

const MEASURED: EffectCount[] = [];
for (const name of listFixtures()) MEASURED.push(await measure(name));

describe("effect counts, graded absolutely", () => {
  /**
   * The floor that says the channel is measuring something. Every row reading
   * zero would match a snapshot taken while the tracer was quiet, and that is
   * the exact shape the channel degrades into if `mock.module` stops
   * intercepting `signals.ts`.
   */
  it("the counts are not all zeroes, so the tracer is actually intercepting", () => {
    const live = MEASURED.filter((row) => row.created > 0);
    expect(
      live.length,
      "no fixture creates an effect — the tracer is not installed",
    ).toBeGreaterThanOrEqual(20);
    expect(MEASURED.reduce((n, row) => n + row.runs, 0)).toBeGreaterThan(live.length);
  });

  it("no fixture creates effects that never run", () => {
    for (const row of MEASURED) {
      if (row.created === 0) {
        expect(row.runs, `${row.fixture} runs effects it never created`).toBe(0);
        continue;
      }
      expect(row.runs, `${row.fixture} created effects that never ran`).toBeGreaterThanOrEqual(
        row.created,
      );
      expect(row.busiest, `${row.fixture} busiest`).toBeGreaterThanOrEqual(1);
      expect(row.busiest, `${row.fixture} busiest exceeds its own total`).toBeLessThanOrEqual(
        row.runs,
      );
    }
  });

  for (const row of MEASURED) {
    it(row.fixture, () => {
      expect(formatEffectRow(row)).toMatchSnapshot();
    });
  }
});
