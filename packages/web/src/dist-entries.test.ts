/**
 * The published entries share one renderer and none of them carries a copy
 * of `@barqjs/core`.
 *
 * A bundled copy of core is a second engine: `render` would build under one
 * while the application's signals live in the other, and nothing would ever
 * update. The workspace cannot show it, because `bun` resolution takes every
 * `@barqjs/*` import to `src/`, so this reads `dist` and needs the package
 * built.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

const ENTRIES = ["index", "host", "internal", "interp", "jsx-runtime"] as const;

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const distOf = (entry: string): string => `${DIST}${entry}.js`;

const built = ENTRIES.every((entry) => existsSync(distOf(entry)));

describe.if(built)("the published entries", () => {
  test("import core rather than carry it", () => {
    const carried: string[] = [];
    for (const file of readdirSync(DIST).filter((name) => name.endsWith(".js"))) {
      const code = readFileSync(`${DIST}${file}`, "utf8");
      if (code.includes("@solidjs/signals") || code.includes("packages/core/src")) {
        carried.push(file);
      }
    }
    expect(carried, "these files bundled a copy of the engine").toEqual([]);
  });

  test("a name exported by two entries is the SAME binding in both", async () => {
    const loaded = await Promise.all(
      ENTRIES.map(async (entry) => [entry, await import(distOf(entry))] as const),
    );

    const split: string[] = [];
    for (const [index, [leftName, left]] of loaded.entries()) {
      for (const [rightName, right] of loaded.slice(index + 1)) {
        const exports = left as Record<string, unknown>;
        for (const name of Object.keys(exports)) {
          if (!(name in right)) continue;
          const value = exports[name];
          if (typeof value !== "function" && typeof value !== "symbol") continue;
          if (value !== (right as Record<string, unknown>)[name]) {
            split.push(`${name}: ${leftName} !== ${rightName}`);
          }
        }
      }
    }

    expect(split, "these entries were bundled separately and hold separate state").toEqual([]);
  });
});
