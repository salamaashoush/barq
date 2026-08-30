/**
 * The root barrel must not drag the package in with it.
 *
 * `sideEffects: false` plus one module per concern is the claim the package
 * makes; this is the measurement. A bundler is asked for a module that imports
 * one primitive from the root entry, and the output is read back for names
 * that belong to the other twenty.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, test } from "bun:test";

const root = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const built = existsSync(root);
const workspace = mkdtempSync(join(tmpdir(), "barq-treeshake-"));

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

let probes = 0;

async function bundle(source: string): Promise<string> {
  const entry = join(workspace, `probe${probes++}.ts`);
  writeFileSync(entry, source.replaceAll("<root>", root));

  const result = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    minify: false,
    external: ["@barqjs/core"],
  });
  if (!result.success) throw new AggregateError(result.logs, "the probe did not build");
  return await result.outputs[0]!.text();
}

describe.if(built)("tree shaking", () => {
  test("one primitive from the root entry does not pull in the rest", async () => {
    const out = await bundle(`
      import { debounce } from "<root>";
      globalThis.probe = debounce(() => {}, 10);
    `);

    for (const absent of [
      "ReactiveMap",
      "cubicBezier",
      "IntersectionObserver",
      "matchMedia",
      "localStorage",
      "requestAnimationFrame",
    ]) {
      expect(out, `${absent} survived into a bundle that only asked for debounce`).not.toContain(
        absent,
      );
    }
  });

  test("a DOM primitive pulls in what it needs and nothing else", async () => {
    const out = await bundle(`
      import { mediaQuery } from "<root>";
      globalThis.probe = mediaQuery("(min-width: 600px)");
    `);

    expect(out).toContain("matchMedia");
    for (const absent of ["ReactiveMap", "cubicBezier", "IntersectionObserver", "ResizeObserver"]) {
      expect(out, `${absent} survived into a bundle that only asked for mediaQuery`).not.toContain(
        absent,
      );
    }
  });

  test("the whole package is still small enough to import wholesale", async () => {
    const out = await bundle(`
      import * as primitives from "<root>";
      globalThis.probe = primitives;
    `);
    // Not a budget anyone should tune against, just a tripwire: the package
    // doubling in size without anyone noticing is the thing to catch.
    expect(out.length).toBeLessThan(80_000);
  });
});
