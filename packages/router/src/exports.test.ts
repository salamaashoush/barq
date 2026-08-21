/**
 * Every declared export path exists after a build.
 *
 * This is a repo-wide invariant with a repo-wide history of being false. Each
 * `package.json` names `./dist/x.js` and `./dist/x.d.ts`; tsdown 0.22 emits
 * `.mjs` and `.d.mts` unless told otherwise, and no package told it. Nothing
 * noticed, because every workspace resolution takes the `bun` condition
 * straight to `src/` — so the mismatch was invisible in-repo and fatal once
 * published.
 *
 * `packages/start` was worse: it had no `tsdown.config.ts` at all, so only
 * `src/index.ts` was ever built and the `./server`, `./vite` and `./serve`
 * subpaths it advertises resolved to nothing. That is the exact trap
 * `DESIGN-ROUTER.md` §5 warns about, already sprung, and it surfaced only when
 * this package tried to import `@barqjs/start` and tsc could not find its types.
 *
 * The check lives here because this is the package that tripped over it.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = new URL("../../..", import.meta.url).pathname;
const PACKAGES = ["core", "server", "start", "router", "extra", "testing", "compiler"];

interface Manifest {
  name: string;
  main?: string;
  types?: string;
  exports?: Record<string, Record<string, string>>;
}

function manifest(pkg: string): Manifest {
  return JSON.parse(readFileSync(join(ROOT, "packages", pkg, "package.json"), "utf8")) as Manifest;
}

describe("published entry points", () => {
  test.each(PACKAGES)("%s declares no path its build does not emit", (pkg) => {
    const dir = join(ROOT, "packages", pkg);
    const p = manifest(pkg);
    const missing: string[] = [];

    for (const [subpath, conditions] of Object.entries(p.exports ?? {})) {
      for (const [condition, target] of Object.entries(conditions)) {
        // `bun` points at source on purpose — that is how the workspace
        // resolves — so it is the one condition that is not a build artefact.
        if (condition === "bun") continue;
        if (!existsSync(join(dir, target))) missing.push(`${subpath} [${condition}] -> ${target}`);
      }
    }
    for (const key of ["main", "types"] as const) {
      const target = p[key];
      if (target !== undefined && !existsSync(join(dir, target))) {
        missing.push(`${key} -> ${target}`);
      }
    }

    expect(missing, `${p.name} names paths that do not exist; run its build`).toEqual([]);
  });

  test.each(PACKAGES)("%s has a tsdown config naming every subpath", (pkg) => {
    const dir = join(ROOT, "packages", pkg);
    const config = join(dir, "tsdown.config.ts");
    expect(
      existsSync(config),
      `${pkg} has no tsdown.config.ts, so tsdown builds src/index.ts alone`,
    ).toBe(true);

    const source = readFileSync(config, "utf8");
    const p = manifest(pkg);
    for (const conditions of Object.values(p.exports ?? {})) {
      const bun = conditions.bun;
      if (bun === undefined) continue;
      // `./src/server.ts` in the exports map must appear as an entry.
      const entry = bun.replace(/^\.\//, "");
      expect(
        source,
        `${p.name} exports ${bun} but its tsdown config has no entry for it`,
      ).toContain(entry);
    }
  });
});
