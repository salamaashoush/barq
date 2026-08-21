/**
 * THE ACCEPTANCE SURFACE, re-cut.
 *
 * This file used to register a gap: six source modules, one of them tested,
 * and `css.ts` / `query.ts` / `hooks.ts` with no test file at all — which was
 * the direct reason three C1 holes were silent instead of red. It said writing
 * those tests was M8's job.
 *
 * M8 did three things to that list, and this row states which:
 *
 *  - `css.ts` was DELETED. `CODESIGN.md` §4.1 indicts its JSX pragma for
 *    re-implementing element creation a fifth time, and CSS scoping is
 *    ecosystem rather than framework. Its content moved to
 *    `packages/kitchen-sink/src/styles.ts`, where the application that wants
 *    goober depends on goober; the three exports that needed the pragma
 *    (`setupCss`, `styled`, `createGlobalStyle`) went with the indictment.
 *  - `query.ts` and `hooks.ts` were TESTED — `query.test.tsx`, `hooks.test.ts`.
 *  - `router.ts` is GONE, and `@barqjs/router` replaces it. Keeping a second
 *    implementation of matching, history and navigation meant two answers to
 *    every routing question; its behaviour survives as the new package's test
 *    corpus and its matcher as `packages/benchmark/src/legacy-matcher.ts`, the
 *    comparand the measurement that replaced it is against.
 *  - `m8-convention.test.ts` went with it, to `packages/router`. It scored the
 *    nine workarounds as DELETIONS, and every row was a string from the file
 *    that is now gone — so it is pointed at the implementation that replaced it,
 *    where the interesting question is whether any of the nine came back.
 *
 * The row keeps its original property: it goes red the moment a module is added
 * or a test file appears, which forces the next pass to say what it covered.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";

describe("M8 acceptance surface", () => {
  test("every source module is tested, and the list is checked in", () => {
    const src = join();
    const modules = readdirSync(src).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

    expect(modules.filter((f) => f.includes(".test.")).toSorted()).toEqual([
      "hooks.test.ts",
      "query.test.tsx",
      "untested-surface.test.ts",
    ]);

    expect(modules.filter((f) => !f.includes(".test.")).toSorted()).toEqual([
      "hooks.ts",
      "index.ts",
      "query.ts",
      "test-setup.ts",
    ]);
  });

  test("every public export resolves", async () => {
    const surface = (await import("./index.ts")) as Record<string, unknown>;
    const missing = Object.entries(surface)
      .filter(([, value]) => value === undefined)
      .map(([name]) => name);
    expect(missing).toEqual([]);
    // The barrel is the package. A row that only counted modules could not see
    // an export that survived a deletion by name only.
    // 23 after the router left; it was 40-odd with it.
    expect(Object.keys(surface).length).toBeGreaterThan(20);
  });
});

function join(): string {
  return import.meta.dir;
}
