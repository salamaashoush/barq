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
import {
  createMemo,
  createRoot,
  createTrackedEffect,
  flush,
  getOwner,
  createSignal,
  untrack,
  runWithOwner,
} from "./index.ts";
import { resetErrorHalt } from "./signals.ts";

// A write is published at the next flush and the suite expects an effect to
// have run by the next line, so a write outside `batch` flushes at once. Inside
// one it does not, which is what makes `batch` coalesce.
let batching = 0;

// What a case created, so `run` can take it apart afterwards. A case runs under
// NO owner: it writes wherever it likes, which is what an event handler does and
// what a scope under construction may not. Each node it makes is therefore given
// a root of its own, since a memo or an effect nothing owns is dormant.
let made: (() => void)[] = [];
let effects = 0;

/** Run part of an effect, its body or its cleanup, counted as such. */
function during<T>(part: () => T): T {
  effects++;
  try {
    return part();
  } finally {
    effects--;
  }
}

function owned<T>(make: () => T): T {
  // Made inside another node, it is that node's and goes when the node does.
  if (getOwner() !== null) return createRoot(() => make());
  return createRoot((dispose) => {
    made.push(dispose);
    return make();
  });
}

const barq: ReactiveFramework = {
  name: "barq",
  signal: (initialValue) => {
    // The suite holds plain values only; the engine's types refuse a function.
    const [s, setS] = createSignal(initialValue as Exclude<typeof initialValue, Function>);
    return {
      read: () => s(),
      write: (v) => {
        setS(() => v);
        // A write made from inside an effect is published by the flush that is
        // running the effect.
        if (batching === 0 && effects === 0) flush();
      },
    };
  },
  computed: (fn) => {
    const c = owned(() => createMemo(fn));
    return { read: () => c() };
  },
  effect: (fn) => {
    const dispose = createRoot((disposeRoot) => {
      createTrackedEffect(() => {
        const cleanup = during(fn);
        return typeof cleanup === "function" ? () => during(cleanup) : cleanup;
      });
      return disposeRoot;
    });
    if (getOwner() === null) {
      made.push(dispose);
      if (batching === 0) flush();
    }
    return dispose;
  },
  // An error a case lets escape halts the engine by design, so the halt is
  // lifted before the next one.
  run: (fn) => {
    const outer = made;
    made = [];
    try {
      runWithOwner(null, fn);
    } finally {
      for (const dispose of made) dispose();
      made = outer;
      resetErrorHalt();
    }
  },
  batch: (fn) => {
    batching++;
    try {
      fn();
    } finally {
      batching--;
      if (batching === 0) flush();
    }
  },
  untracked: (fn) => untrack(fn),
};

/**
 * Cases the suite words for a different model than the one barq runs on. Each
 * is expected to fail, so one that starts passing is reported: the engine moved
 * and this list is out of date.
 */
const MODEL: Record<string, string> = {};
function differs(reason: string, ids: number[]): void {
  for (const id of ids) MODEL[`#${id}`] = reason;
}
differs(
  "a derived value is computed where it is declared and again at each flush, whether or not anything reads it",
  [128, 155, 183, 187, 188, 189, 193, 205],
);
differs(
  "a write is published at the next flush, and effects run there: a read on the line after a write still sees the published value",
  [67, 70, 133, 134, 179, 182, 200, 224],
);
differs(
  "a dependency written away and back inside one batch still re-runs its dependents, since nothing compares against a value snapshot",
  [123, 132, 147],
);
differs(
  "a single-function effect's cleanup runs while the effect is still observing, so a read inside it subscribes",
  [40, 178],
);

/**
 * The engine's development build is the same graph with its authoring rules
 * enforced, and the suite breaks two of them on purpose. Detected by what the
 * build does, since a test has no other way to ask which one it was given.
 */
const STRICT = ((): boolean => {
  try {
    createRoot((dispose) => {
      const [, write] = createSignal(0);
      write(1);
      dispose();
    });
    return false;
  } catch {
    resetErrorHalt();
    return true;
  }
})();
if (STRICT) {
  differs(
    "the development build refuses a node created inside an effect that takes no children",
    [43, 45, 48, 163, 164, 170, 209, 210, 214, 222],
  );
  differs("the development build refuses a write made while a derived value is computing", [57]);
  // The same refusal turns these two around: the write they expect to see
  // published late is never made, so what they assert about it holds.
  delete MODEL["#182"];
  delete MODEL["#183"];
}

const tally = { pass: 0, fail: 0, skip: 0, differ: 0 };

for (const section of testSuite) {
  describe(`conformance: ${section.section}`, () => {
    for (const [name, caseFn] of Object.entries(section.cases)) {
      const reason = MODEL[name.slice(0, name.indexOf(" "))];
      if (reason !== undefined) {
        test.failing(`${name} (${reason})`, () => {
          tally.differ++;
          barq.run(() => {
            caseFn(barq);
          });
        });
        continue;
      }
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
  const total = tally.pass + tally.fail + tally.skip + tally.differ;
  // eslint-disable-next-line no-console
  console.log(
    `\n[conformance] barq: ${tally.pass}/${total} pass, ${tally.fail} fail, ${tally.differ} differ by model, ${tally.skip} skipped (capability not advertised)`,
  );
  // Keep a tiny assertion so the summary block itself is a visible test step.
  expect(tally.pass + tally.fail + tally.skip + tally.differ).toBe(total);
});
