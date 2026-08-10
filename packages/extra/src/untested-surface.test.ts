/**
 * THE ACCEPTANCE SURFACE, registered.
 *
 * `CODESIGN.md` §8 makes the router the acceptance test for the whole redesign,
 * and it is a good one — but it is not the whole package. `packages/extra` ships
 * six source modules and tests ONE of them. `css.ts`, `query.ts` and `hooks.ts`
 * have no test file, which is the direct reason the three C1 holes named in
 * `m8-convention.test.ts` — goober's `Styled`, `QueryClientProvider`,
 * `GlobalStyleComponent` — are silent rather than red.
 *
 * The consequence for the record kept next door: the 87/0 probe proves the
 * router's five migratable declarations are sufficient for the ROUTER's own
 * fixtures. It does not prove this package is one codemod away from working,
 * and it was being read as if it did.
 *
 * Writing real tests for css/query/hooks is M8 work, not M4b work: they would
 * be born red for the same C1 reason and would need registering, which is a
 * decision for the milestone that owns the migration. This file registers the
 * gap instead, and goes red the moment a module is added or a test file
 * appears — which forces the M8 pass to state which of the three it covered.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

describe("M8 acceptance surface", () => {
  test("every source module that exports a component is either tested or registered", () => {
    const src = join(import.meta.dir);
    const modules = readdirSync(src).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    const tested = modules.filter((f) => f.includes(".test."));
    expect(tested.toSorted()).toEqual([
      "m8-convention.test.ts",
      "router.test.tsx",
      "untested-surface.test.ts",
    ]);
    expect(modules.filter((f) => !f.includes(".test.")).toSorted()).toEqual([
      "css.ts",
      "hooks.ts",
      "index.ts",
      "query.ts",
      "router.tsx",
      "test-setup.ts",
    ]);
  });
});
