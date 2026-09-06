/**
 * Regenerates `tests/` from a @solidjs/signals checkout.
 *
 *   bun run port.ts ~/Workspace/vendor/solid-next/packages/signals
 *
 * Only the black-box files are taken: a test that imports `src/core/*` or
 * `src/store/next/*` is testing Solid's internals, and barq's internals are a
 * different shape, so porting one would measure the shim rather than the model.
 * Everything else is copied verbatim with two specifiers rewritten.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2];
if (!root) throw new Error("usage: bun run port.ts <path-to-@solidjs/signals>");

const testsIn = join(root, "tests");
const outDir = join(import.meta.dir, "tests");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const skipped: string[] = [];
let ported = 0;

for (const file of walk(testsIn).sort()) {
  const rel = relative(testsIn, file);
  const source = readFileSync(file, "utf8");
  const internal = [...source.matchAll(/from "(\.\.?\/[^"]*)"/g)]
    .map((m) => m[1])
    .filter((spec) => !/\/src\/index\.(js|ts)$/.test(spec));
  if (internal.length > 0) {
    skipped.push(`${rel}  ${[...new Set(internal)].join(" ")}`);
    continue;
  }
  const text = source
    .replace(/from "vitest"/g, 'from "../vitest.ts"')
    .replace(/from "\.\.?(?:\/\.\.)*\/src\/index\.(?:js|ts)"/g, 'from "../harness.ts"')
    // chai's `.to` alias, which vitest carries and bun does not.
    .replace(/\)\.to\.to/g, ").to")
    .replace(/expect\(([^;]*?)\)\.to\.(?=[a-z])/g, "expect($1).");
  writeFileSync(join(outDir, rel.replaceAll("/", "__")), text);
  ported++;
}

writeFileSync(
  join(import.meta.dir, "SKIPPED.txt"),
  `# White-box Solid tests, not ported (they import Solid internals)\n${skipped.join("\n")}\n`,
);
console.log(`ported ${ported}, skipped ${skipped.length}`);
