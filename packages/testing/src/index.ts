/**
 * Everything `./pure.ts` exports, plus the `afterEach(cleanup)` that keeps one
 * test's DOM out of the next one's.
 *
 * React Testing Library's split exactly: the implementation is `pure`, and this
 * module does nothing but wire the hook and re-export. Two escape hatches, both
 * theirs — import `@barqjs/testing/pure`, or
 * set `BARQ_SKIP_AUTO_CLEANUP`.
 *
 * IT USED TO BE A COMMENT TELLING YOU TO DO THIS YOURSELF, which meant a suite
 * that forgot inherited the previous test's `document.body` and failed in a way
 * that reads as a bug in the component under test.
 *
 * The hook is registered only if the runner HAS one. `afterEach` is a global
 * under bun, vitest and jest, and is absent when this module is imported by
 * application code or a script, where throwing would be wrong.
 */

import { cleanup } from "./pure.ts";

declare const afterEach: ((fn: () => void) => void) | undefined;
declare const teardown: ((fn: () => void) => void) | undefined;

const skip = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  ?.BARQ_SKIP_AUTO_CLEANUP;

if (skip === undefined || skip === "") {
  if (typeof afterEach === "function") {
    afterEach(() => {
      cleanup();
    });
  } else if (typeof teardown === "function") {
    // `teardown` is the name the same hook has under some runners.
    teardown(() => {
      cleanup();
    });
  }
}

export * from "./pure.ts";
