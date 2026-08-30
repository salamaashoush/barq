/**
 * Every source module has a test file, and every name the barrel exports
 * resolves. Both lists are checked in, so adding a module without a test, or
 * exporting a name that no longer exists, goes red here.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";

describe("the package surface", () => {
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
    // Counting modules cannot see an export that survives a deletion by name
    // only, so the barrel is counted too.
    expect(Object.keys(surface).length).toBeGreaterThan(20);
  });
});

function join(): string {
  return import.meta.dir;
}
