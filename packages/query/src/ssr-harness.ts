/**
 * A server render in a process of its own, and the page it produced.
 *
 * The suite runs under happy-dom, where `isServer` is false for the life of the
 * process, so a render made here would be a client render that happens to
 * return a string. The server half therefore runs where a server runs: a
 * second `bun` with no DOM, the string backend, and its own copy of every
 * module. What comes back is bytes, which is all a browser is ever sent.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { runInThisContext } from "node:vm";

interface Native {
  transform(code: string, options?: Record<string, unknown>): { code: string };
}

const native = createRequire(import.meta.url)("@barqjs/compiler-rs") as Native;

const PACKAGE = join(import.meta.dir, "..");
// Under the package's own `node_modules`, so a generated module resolves
// `@barqjs/core` and `@barqjs/server` exactly as a source file here does.
const GENERATED = join(PACKAGE, "node_modules", ".cache", "barq-query-ssr");
const SERVER = join(import.meta.dir, "ssr-server.ts");

/** The adapter's entries, for a fixture to import by path. */
export const ENTRY = {
  index: join(import.meta.dir, "index.ts"),
  router: join(import.meta.dir, "router.ts"),
};

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
  const emit = (kind: "dom" | "ssr", options: Record<string, unknown>): string => {
    const file = join(GENERATED, `${id}.${kind}.ts`);
    const { code } = native.transform(source, { filename: `${tag}.tsx`, ...options });
    // The stamp keeps two generated modules from hashing alike in bun's
    // transpile cache, which is keyed by content.
    writeFileSync(file, `export const __module = ${JSON.stringify(`${id}.${kind}`)};\n${code}`);
    return file;
  };
  return {
    dom: emit("dom", { hydratable: true }),
    ssr: emit("ssr", { ssr: true, hydratable: true }),
  };
}

export type Mode = "buffered" | "streamed" | "concurrent" | "handler" | "handler-streamed";

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

export function serve(module: string, mode: Mode, argument = ""): unknown {
  const command = ["bun", "run", ...conditions(), SERVER, module, mode, argument];
  const run = Bun.spawnSync(command, {
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
  return JSON.parse(out.slice(marker + RESULT.length)) as unknown;
}

export const RESULT = "\n__BARQ_QUERY_SSR_RESULT__";

/** The inline scripts of some markup, in document order. */
function scriptsOf(markup: string): string[] {
  return [...markup.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? "");
}

function withoutScripts(markup: string): string {
  return markup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
}

/** Run a page's inline scripts as a parser would, in global scope. */
export function runScripts(markup: string): void {
  for (const source of scriptsOf(markup)) {
    if (source.trim() !== "") runInThisContext(source.replaceAll("window.", "globalThis."));
  }
}

/**
 * Put a streamed page into `container` the way a browser receives it: each
 * chunk appended in arrival order, its scripts run before the next lands.
 */
export function assemble(chunks: readonly string[], container: HTMLElement): void {
  for (const [index, chunk] of chunks.entries()) {
    if (index === 0) container.innerHTML = withoutScripts(chunk);
    else container.insertAdjacentHTML("beforeend", withoutScripts(chunk));
    runScripts(chunk);
  }
}

export function mount(): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  return container;
}

export function unseeded(): void {
  (globalThis as { __BARQ_DATA__?: unknown }).__BARQ_DATA__ = undefined;
}

export function seeds(): string[] {
  return Object.keys(
    (globalThis as { __BARQ_DATA__?: Record<string, unknown> }).__BARQ_DATA__ ?? {},
  );
}
