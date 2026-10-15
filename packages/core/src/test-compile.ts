/**
 * Compile a `.tsx` source with the real compiler and load it against this
 * checkout's runtime, for a test that has to see what an application's JSX
 * actually becomes rather than a hand-written approximation of it.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { transform } from "@barqjs/compiler-rs";

const INDEX = join(import.meta.dir, "index.ts");

export async function compileModule<M = Record<string, unknown>>(
  source: string,
  name = "module",
): Promise<M> {
  const out = transform(source, { filename: `${name}.tsx` });
  const errors = out.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length > 0) throw new Error(errors.map((error) => error.message).join("\n"));
  const body = out.code.replaceAll('from "@barqjs/core"', `from ${JSON.stringify(INDEX)}`);
  if (/^import .* from "[^/]/m.test(body)) {
    throw new Error(`${name} imports a module this loader does not provide:\n${body}`);
  }
  const directory = mkdtempSync(join(tmpdir(), "barq-compiled-"));
  try {
    const file = join(directory, `${name}.ts`);
    writeFileSync(file, body);
    return (await import(file)) as M;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
