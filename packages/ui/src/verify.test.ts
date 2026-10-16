/**
 * `bun run verify`, as the package spells it, from outside the test runner.
 *
 * The tool reads the stylesheet the components register, so it needs the DOM
 * and the compiler and nothing else. It is run in a process of its own because
 * that is the only way to see what it is preloaded with: a runner hook in that
 * preload throws there and nowhere else, and the tool then cannot start.
 *
 * The bar is `PORTING.md`'s: every declaration a spec produces is in the
 * stylesheet, or in `ALLOWED` with its reason.
 */

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

// The timeout is the spawned bun's, which translates every spec and scans every
// component: measured at 0.8 s idle and 2.1 s with every core contended, and
// past 5 s on a CI runner whose cores the other packages' suites share.
test("the verify script runs outside the runner and finds nothing missing", () => {
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const [command, ...args] = (manifest.scripts["verify"] ?? "").split(" ");
  expect(command).toBe("bun");

  const run = Bun.spawnSync([process.execPath, ...args], { cwd: root });
  const output = `${run.stdout.toString()}${run.stderr.toString()}`;

  expect(output).not.toContain("outside of the test runner");
  expect(output).toMatch(/\d+ declarations from shadcn's class lists, 0 not in the stylesheet/);
  expect(run.exitCode).toBe(0);
}, 30_000);
