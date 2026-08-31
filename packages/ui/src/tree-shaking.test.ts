/**
 * What one component costs when it comes from the barrel.
 *
 * Every module registers its own CSS at import time, which is a side effect —
 * so the claim this measures is narrower than "nothing runs": a bundler drops a
 * module when nothing it exports is used, and a component nobody imported has
 * no CSS worth keeping. The theme is exempt in `package.json` for the opposite
 * reason: it is imported for its effect alone.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, test } from "bun:test";

const root = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const built = existsSync(root);
const workspace = mkdtempSync(join(tmpdir(), "barq-ui-treeshake-"));

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

let probes = 0;

async function bundle(source: string): Promise<string> {
  const entry = join(workspace, `probe${probes++}.ts`);
  writeFileSync(entry, source.replaceAll("<root>", root));

  const result = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    minify: false,
    external: [
      "@barqjs/core",
      "@barqjs/css",
      "@barqjs/aria",
      "@barqjs/lucide",
      "@barqjs/primitives",
    ],
  });
  if (!result.success) throw new AggregateError(result.logs, "the probe did not build");
  return await result.outputs[0]!.text();
}

describe.if(built)("tree shaking", () => {
  test("one component from the barrel does not bring the others' CSS", async () => {
    const out = await bundle(`
      import { Badge } from "<root>";
      globalThis.probe = Badge;
    `);

    expect(out).toContain("badge");
    for (const absent of ["dialog-content", "accordion-trigger", "slider-thumb", "tabs-trigger"]) {
      expect(out, `${absent} survived a bundle that only asked for Badge`).not.toContain(absent);
    }
  });

  test("the theme survives, because a component's CSS reads it", async () => {
    const out = await bundle(`
      import { Badge } from "<root>";
      globalThis.probe = Badge;
    `);
    expect(out).toContain("--spacing");
    expect(out).toContain("@layer barq.reset, barq.base, barq.theme, barq.ui;");
  });

  test("the reset is not dragged in by the theme", async () => {
    const out = await bundle(`
      import { Badge } from "<root>";
      globalThis.probe = Badge;
    `);
    expect(out).not.toContain("-webkit-text-size-adjust");
  });
});
