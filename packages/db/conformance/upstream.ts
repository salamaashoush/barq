/**
 * TanStack DB's live-query conformance suite, checked out where the driver
 * imports it from.
 *
 * The suite is the laws every framework adapter answers to, and upstream keeps
 * it in `packages/db/tests` rather than publishing it, so the first-party
 * adapters reach it by relative path inside their monorepo. This adapter lives
 * outside that monorepo, so it takes the same directory at a pinned commit.
 * The commit's `@tanstack/db` is 1.0.0-rc.1.5, the version this package pins:
 * moving one without the other tests the adapter against laws its core does
 * not implement.
 *
 * Two files of the suite name types from TanStack DB's source tree, which the
 * checkout leaves out. They get that tree's two modules as re-exports of the
 * published package, so type-checking the driver reads the types the adapter
 * runs on; neither import survives to run time.
 *
 * Idempotent: a checkout already at the commit is left alone.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const COMMIT = "5448f3850a2e5c46e39957496a2b7948c4450e21";
const REPOSITORY = "https://github.com/TanStack/db.git";

const CHECKOUT: string = join(import.meta.dir, "..", "node_modules", ".cache", "tanstack-db-tests");
const STAMP = join(CHECKOUT, ".commit");

const SOURCE_TYPES: Record<string, string> = {
  "packages/db/src/index.ts": 'export * from "@tanstack/db";\n',
  "packages/db/src/query/ir.ts":
    'import type { IR } from "@tanstack/db";\n\nexport type BasicExpression<T = any> = IR.BasicExpression<T>;\n',
};

function git(...args: string[]): void {
  const run = Bun.spawnSync(["git", ...args], { cwd: CHECKOUT, stdout: "pipe", stderr: "pipe" });
  if (run.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${run.exitCode}):\n${run.stderr.toString()}`);
  }
}

function current(): boolean {
  return existsSync(STAMP) && readFileSync(STAMP, "utf8").trim() === COMMIT;
}

if (!current()) {
  rmSync(CHECKOUT, { recursive: true, force: true });
  mkdirSync(CHECKOUT, { recursive: true });
  git("init", "--quiet");
  git("remote", "add", "origin", REPOSITORY);
  git("sparse-checkout", "set", "--no-cone", "/packages/db/tests/");
  git("fetch", "--quiet", "--depth", "1", "--filter=blob:none", "origin", COMMIT);
  git("checkout", "--quiet", "FETCH_HEAD");
  for (const [file, source] of Object.entries(SOURCE_TYPES)) {
    mkdirSync(dirname(join(CHECKOUT, file)), { recursive: true });
    writeFileSync(join(CHECKOUT, file), source);
  }
  writeFileSync(STAMP, `${COMMIT}\n`);
}
