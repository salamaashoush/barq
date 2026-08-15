/**
 * Both real compilers, driven from one place.
 *
 * A benchmark that hand-writes the shape a compiler "would" emit measures the
 * benchmark author's memory of the compiler, and drifts silently the moment the
 * backend changes. These helpers run the actual `@barqjs/compiler-rs` native
 * binding and the actual `babel-preset-solid`, so both sides of a comparison are
 * whatever those two projects emit today.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { transformAsync } from "@babel/core";
// @ts-expect-error babel-preset-solid ships no types
import solidPreset from "babel-preset-solid";

const require_ = createRequire(import.meta.url);

interface NativeCompiler {
  transform(
    code: string,
    options?: Record<string, unknown>,
  ): { code: string; map?: string; warnings: string[] };
}

function loadNative(): NativeCompiler {
  try {
    return require_("@barqjs/compiler-rs") as NativeCompiler;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      "the benchmarks compile through the native binding, which is a build artifact and is not " +
        "in git. Run `bun run --cwd packages/compiler-rs build` and try again. " +
        `Underlying error: ${message}`,
      { cause: error },
    );
  }
}

const native = loadNative();

export function compileBarq(source: string, filename: string, ssr: boolean): string {
  const result = native.transform(source, { filename, ssr });
  if (result.warnings.length > 0) {
    throw new Error(`barq compiler warned on ${filename}: ${result.warnings.join("; ")}`);
  }
  return result.code;
}

/**
 * The same compile, with the warnings handed back instead of thrown.
 *
 * A benchmark row whose whole subject is a compiler REFUSAL — the pre-M6
 * whole-module SSR→DOM downgrade — cannot use a helper that treats the
 * refusal's diagnostic as a bug in the benchmark.
 */
export function compileBarqWithWarnings(
  source: string,
  filename: string,
  ssr: boolean,
): { code: string; warnings: string[] } {
  const result = native.transform(source, { filename, ssr });
  return { code: result.code, warnings: result.warnings };
}

export async function compileSolid(
  source: string,
  filename: string,
  generate: "dom" | "ssr",
): Promise<string> {
  const out = await transformAsync(source, {
    presets: [[solidPreset, { generate, hydratable: false }]],
    filename,
    babelrc: false,
    configFile: false,
  });
  if (!out?.code) throw new Error(`solid compiler produced nothing for ${filename}`);
  return out.code;
}

const TMP_DIR = join(import.meta.dir, ".tmp");

rmSync(TMP_DIR, { recursive: true, force: true });
mkdirSync(TMP_DIR, { recursive: true });
writeFileSync(join(TMP_DIR, ".gitignore"), "*\n");

let seq = 0;

export async function loadModule<T>(code: string, tag: string): Promise<T> {
  const file = join(TMP_DIR, `${tag}-${seq++}.tsx`);
  writeFileSync(file, code);
  return (await import(file)) as T;
}
