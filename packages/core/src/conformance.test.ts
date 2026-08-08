/**
 * Reactive-framework conformance suite.
 *
 * Runs johnsoncodehk/reactive-framework-test-suite against barq's core
 * reactivity via a thin adapter. The upstream suite is a dev-only git
 * dependency; this file maps barq's primitives onto its ReactiveFramework
 * contract and reports pass/fail/skip per section.
 *
 * `SkipTest` is thrown by cases that probe a capability barq does not
 * advertise (e.g. error-recovering computeds); those are reported as skipped
 * rather than failed.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { type ReactiveFramework, SkipTest, testSuite } from "reactive-framework-test-suite";
import { batch, computed, createScope, effect, flush, signal, untrack } from "./index.ts";

// barq batches flushes on the microtask queue; the suite expects effects to
// have run by assertion time, so writes/effect creation flush synchronously.
const barq: ReactiveFramework = {
  name: "barq",
  signal: (initialValue) => {
    const s = signal(initialValue);
    return {
      read: () => s(),
      write: (v) => {
        s.set(v);
        flush();
      },
    };
  },
  computed: (fn) => {
    const c = computed(fn);
    return { read: () => c() };
  },
  effect: (fn) => {
    const dispose = effect(fn);
    flush();
    return dispose;
  },
  // Each case runs inside its own disposable root for isolation.
  run: (fn) => {
    createScope((dispose) => {
      try {
        fn();
      } finally {
        dispose();
      }
    }, true);
  },
  batch: (fn) => batch(fn),
  untracked: (fn) => untrack(fn),
};

const tally = { pass: 0, fail: 0, skip: 0 };

for (const section of testSuite) {
  describe(`conformance: ${section.section}`, () => {
    for (const [name, caseFn] of Object.entries(section.cases)) {
      test(name, () => {
        try {
          barq.run(() => {
            caseFn(barq);
          });
          tally.pass++;
        } catch (err) {
          if (err instanceof SkipTest) {
            tally.skip++;
            return;
          }
          tally.fail++;
          throw err;
        }
      });
    }
  });
}

afterAll(() => {
  const total = tally.pass + tally.fail + tally.skip;
  // eslint-disable-next-line no-console
  console.log(
    `\n[conformance] barq: ${tally.pass}/${total} pass, ${tally.fail} fail, ${tally.skip} skipped (capability not advertised)`,
  );
  // Keep a tiny assertion so the summary block itself is a visible test step.
  expect(tally.pass + tally.fail + tally.skip).toBe(total);
});
