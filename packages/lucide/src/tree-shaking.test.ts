/**
 * The barrel must not drag 1,790 icons in with it.
 *
 * `sideEffects: false` plus one module per icon is the claim; this is the
 * measurement. A bundler is asked for a module that imports one icon from the
 * root entry, and the output is read back for the paths of icons nobody asked
 * for.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, test } from "bun:test";

import { barqPlugin } from "./test-setup.ts";

// The SOURCE, because that is what this package publishes: a compiled icon is
// specific to one backend, so a consumer compiles it. This bundles what a
// consumer's bundler would.
const root = fileURLToPath(new URL("./index.ts", import.meta.url));
const workspace = mkdtempSync(join(tmpdir(), "barq-lucide-treeshake-"));

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

let probes = 0;

async function bundle(source: string): Promise<string> {
  const entry = join(workspace, `probe${probes++}.ts`);
  writeFileSync(entry, source.replaceAll("<root>", root));

  const result = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    minify: false,
    plugins: [barqPlugin],
    external: ["@barqjs/core"],
  });
  if (!result.success) throw new AggregateError(result.logs, "the probe did not build");
  return await result.outputs[0]!.text();
}

/** A path from an icon nobody imported. Distinctive enough to find in a bundle. */
const ELSEWHERE = [
  "M2.5 21a.5.5", // aperture
  "m21.73 18-8-14", // triangle-alert
  "M9 3v18", // panel-left
];

describe("tree shaking", () => {
  test("one icon from the barrel brings no others", async () => {
    const out = await bundle(`
      import { Check } from "<root>";
      globalThis.probe = Check;
    `);

    expect(out).toContain("M20 6 9 17l-5-5");
    for (const path of ELSEWHERE) {
      expect(out, `${path} survived into a bundle that only asked for Check`).not.toContain(path);
    }
    expect(out.length).toBeLessThan(4000);
  });

  test("an alias brings its target and nothing else", async () => {
    const out = await bundle(`
      import { MoreHorizontal } from "<root>";
      globalThis.probe = MoreHorizontal;
    `);

    expect(out).toContain('<circle cx="19" cy="12" r="1"/>');
    expect(out).not.toContain("M20 6 9 17l-5-5");
    expect(out.length).toBeLessThan(4000);
  });

  test("the deep path is the same component by a shorter route", async () => {
    const deep = fileURLToPath(new URL("./icons/check.tsx", import.meta.url));
    const out = await bundle(`
      import { Check } from "${deep.replaceAll("\\", "\\\\")}";
      globalThis.probe = Check;
    `);
    expect(out).toContain("M20 6 9 17l-5-5");
  });
});
