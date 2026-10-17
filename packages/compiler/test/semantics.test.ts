import { describe, it } from "bun:test";

import { listSemanticFixtures, runSemanticFixture, type FixtureRun } from "./semantics.ts";

/**
 * Every claim in `fixtures/semantics/` runs against the current compiler and
 * must hold. A claim's failure message names the rule it pins, so the suite
 * prints which rule broke rather than a count.
 *
 * The fixtures are run ONCE, here, and every assertion below reads that result.
 * They keep signals and counters at module scope and reset them per claim, so
 * re-running a fixture per assertion would be re-running the runtime, not
 * re-reading the observation.
 */

const RUNS: FixtureRun[] = [];
for (const name of listSemanticFixtures()) {
  RUNS.push(await runSemanticFixture(name));
}

describe("semantic conformance claims", () => {
  for (const run of RUNS) {
    describe(run.fixture, () => {
      for (const outcome of run.outcomes) {
        it(outcome.claim, () => {
          if (outcome.failure) throw new Error(outcome.failure);
        });
      }
    });
  }
});
