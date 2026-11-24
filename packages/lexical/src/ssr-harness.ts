/**
 * A server render in a process of its own, and the page it produced.
 *
 * The suite runs under happy-dom, where `isServer` is false for the life of the
 * process, so a render made here would be a client render that happens to
 * return a string. The server half therefore runs where a server runs: a
 * second `bun` with no DOM, the string backend, this package's components
 * compiled for it, and its own copy of every module. What comes back is
 * bytes, which is all a browser is ever sent.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

interface TransformOutput {
  code: string;
}

interface Native {
  transform(code: string, options?: Record<string, unknown>): TransformOutput;
}

const native = createRequire(import.meta.url)("@barqjs/compiler") as Native;

const PACKAGE = join(import.meta.dir, "..");
// Under the package's own `node_modules`, so a generated module resolves
// `@barqjs/core` and `@barqjs/server` exactly as a source file here does.
const GENERATED = join(PACKAGE, "node_modules", ".cache", "barq-lexical-ssr");
const SERVER = join(import.meta.dir, "ssr-server.ts");

/** The package's entry, for a fixture to import by path. */
export const ENTRY: string = join(import.meta.dir, "index.ts");

/** The block decorator fixture, for a fixture to import by path. */
export const CARD: string = join(import.meta.dir, "fixtures", "card-node.tsx");

export const RESULT = "\n__BARQ_LEXICAL_SSR_RESULT__";

let serial = 0;

export interface Compiled {
  /** The module compiled for the DOM, hydratable. */
  dom: string;
  /** The same source compiled for the string backend. */
  ssr: string;
}

export function compile(source: string, tag: string): Compiled {
  mkdirSync(GENERATED, { recursive: true });
  const id = `${tag}-${process.pid}-${Date.now().toString(36)}-${serial++}`;
  function emit(kind: "dom" | "ssr", options: Record<string, unknown>): string {
    const file = join(GENERATED, `${id}.${kind}.ts`);
    const { code } = native.transform(source, { filename: `${tag}.tsx`, ...options });
    // The stamp keeps two generated modules from hashing alike in bun's
    // transpile cache, which is keyed by content.
    writeFileSync(file, `export const __module = ${JSON.stringify(`${id}.${kind}`)};\n${code}`);
    return file;
  }
  return {
    dom: emit("dom", { hydratable: true, dev: true }),
    ssr: emit("ssr", { ssr: true, hydratable: true }),
  };
}

/**
 * The flag that selects the engine's development build, when this process was
 * started with it. `bun test --conditions=development` leaves no trace in
 * `argv`, so the build the engine resolved to is what says so, and the server
 * is then run against the same one.
 */
function conditions(): string[] {
  const core = Bun.resolveSync("@barqjs/core", import.meta.dir);
  const engine = Bun.resolveSync("@solidjs/signals", dirname(core));
  return /[\\/]dev[^\\/]*$/.test(engine) ? ["--conditions=development"] : [];
}

export interface ServedPage {
  html: string;
  script: string;
}

export function serve(module: string): ServedPage {
  const run = Bun.spawnSync(["bun", "run", ...conditions(), SERVER, module], {
    cwd: PACKAGE,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (run.exitCode !== 0) {
    throw new Error(`the server render failed (${run.exitCode}):\n${run.stderr.toString()}`);
  }
  const out = run.stdout.toString();
  const marker = out.lastIndexOf(RESULT);
  if (marker === -1) throw new Error(`the server render printed no result:\n${out}`);
  return JSON.parse(out.slice(marker + RESULT.length)) as ServedPage;
}
