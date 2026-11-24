/**
 * `barq check`: every file of a project through the compiler's diagnostics,
 * with no build and no dev server.
 *
 * The findings are the ones the Vite plugin reports, because they come from the
 * same `transform`. What this adds is one answer for a whole project, a JSON
 * form a program can read, and the fixes applied for the findings that carry
 * one.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";

import type { JsCode, RouteIdMismatch } from "@barqjs/compiler";

export type Severity = "error" | "warning" | "note";

export interface Edit {
  /** UTF-16 offsets into the file as it was read. Equal for an insertion. */
  pos: number;
  end: number;
  text: string;
}

export interface Finding {
  /** `BARQ001`, or absent for a syntax error, which is the parser's. */
  code?: string;
  severity: Severity;
  message: string;
  /** Relative to the root, with `/` separators. */
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  /** The page for the code. */
  docs?: string;
  /** The section of the installed repair guide for the code. */
  skill?: string;
  /** Present when `--fix` would repair it. */
  fix?: Edit[];
}

export interface CheckSummary {
  errors: number;
  warnings: number;
  notes: number;
  fixable: number;
  fixed: number;
}

export interface CheckResult {
  version: 1;
  root: string;
  files: number;
  summary: CheckSummary;
  findings: Finding[];
}

export interface CheckOptions {
  /** The project root: paths in the result are relative to it. */
  root: string;
  /** Files and directories to check, relative to the root. Defaults to the root. */
  paths?: readonly string[];
  /** Apply the fixes the findings carry, and report what is left. */
  fix?: boolean;
  /** Per-code level, as `[code, "suppress" | "note" | "warning" | "error"]`. */
  levels?: readonly (readonly [string, string])[];
  /**
   * The directory of file routes, relative to the root. When it exists, every
   * `<Link to>` is checked against the routes in it and a route file whose id
   * disagrees with its filename is reported.
   * @default "src/routes"
   */
  routes?: string;
  /**
   * Route patterns a link may name beside the file routes, such as those of a
   * second router the application builds by hand.
   */
  extraRoutes?: readonly string[];
}

interface BarqSettings {
  check?: unknown;
}

interface ProjectManifest {
  barq?: BarqSettings;
}

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

/**
 * What a project sets for every run, under `barq.check` in its `package.json`.
 * A flag on the command line replaces the field of the same name.
 */
export function projectOptions(root: string): Partial<CheckOptions> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch {
    return {};
  }
  const set = (manifest as ProjectManifest).barq?.check;
  if (typeof set !== "object" || set === null) return {};
  const { paths, routes, extraRoutes, levels } = set as Record<string, unknown>;
  const out: Partial<CheckOptions> = {};
  const listed = strings(paths);
  if (listed !== undefined) out.paths = listed;
  if (typeof routes === "string") out.routes = routes;
  const extra = strings(extraRoutes);
  if (extra !== undefined) out.extraRoutes = extra;
  if (typeof levels === "object" && levels !== null) {
    out.levels = Object.entries(levels).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );
  }
  return out;
}

interface NativeDiagnostic {
  code?: string;
  severity: string;
  message: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  docs?: string;
  fix?: Edit[];
}

interface NativeTransformOptions {
  filename: string;
  root: string;
  dev: boolean;
  diagnostics: boolean;
  sourceNames: boolean;
  checks?: string[][];
  routes?: string[];
  cssImports?: string[][];
  cssExports?: boolean;
}

interface NativeTransformResult {
  diagnostics?: NativeDiagnostic[];
  cssWanted?: string[][];
  cssExports?: string[][];
}

interface NativeRouteTree {
  patterns: string[];
  warnings: string[];
  mismatches: RouteIdMismatch[];
}

interface Native {
  transform(code: string, options: NativeTransformOptions): NativeTransformResult;
  diagnosticCodes(): JsCode[];
  routeTree(root: string, dir: string): NativeRouteTree;
}

let native: Native | undefined;

function compiler(): Native {
  native ??= createRequire(import.meta.url)("@barqjs/compiler") as Native;
  return native;
}

const SKILL = "node_modules/@barqjs/compiler/skills/compiler-diagnostics/SKILL.md";
const JSX = /\.[jt]sx$/;
const SCRIPT = /\.[cm]?[jt]s$/;
const SKIPPED = new Set(["node_modules", "dist", "build", "coverage", ".git", ".vite", ".output"]);
/** A fix can uncover the next one, such as a call inside a call. */
const MAX_PASSES = 5;

const NAMED_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;

/**
 * Whether `code` calls a binding it imports the way a `layer` binding is
 * called, which makes it a module the build compiles though it never names
 * barq. The same guess as `@barqjs/vite`'s, so both compile the same files.
 */
function callsThroughImport(code: string): boolean {
  for (const [, names, from] of code.matchAll(NAMED_IMPORT)) {
    if (from === "@barqjs/css" || names === undefined) continue;
    for (const entry of names.split(",")) {
      const local = entry
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (local === undefined || !/^[A-Za-z_$][\w$]*$/.test(local)) continue;
      const call = new RegExp(
        `(?<![\\w$.])${local.replace(/\$/g, "\\$")}(?:\\.dynamic\\(|(?:\\.(?:create|props))?\\([^()]*\\{)`,
      );
      if (call.test(code)) return true;
    }
  }
  return false;
}

/** A script with no JSX is compiled only when it names barq, as the build does. */
function wanted(path: string, text: () => string): boolean {
  if (path.endsWith(".d.ts")) return false;
  if (JSX.test(path)) return true;
  return SCRIPT.test(path) && (text().includes("@barqjs/") || callsThroughImport(text()));
}

const EXTENSIONS = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  "/index.ts",
  "/index.tsx",
  "/index.js",
];

/** A relative import as the file it names, or `undefined` for a package. */
function resolveImport(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = resolve(dirname(from), specifier);
  for (const extension of EXTENSIONS) {
    const candidate = base + extension;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

function collect(path: string, out: string[]): void {
  if (statSync(path).isDirectory()) {
    for (const entry of readdirSync(path).toSorted()) {
      if (SKIPPED.has(entry) || entry.startsWith(".")) continue;
      collect(join(path, entry), out);
    }
    return;
  }
  if (JSX.test(path) || SCRIPT.test(path)) out.push(path);
}

function severityOf(level: string): Severity {
  return level === "error" ? "error" : level === "note" ? "note" : "warning";
}

interface Project {
  options: CheckOptions;
  /** The route patterns, when the project has file routes. */
  patterns: string[] | undefined;
  /** What each file exports that a style call folds against, once per file. */
  exports: Map<string, string[][]>;
}

/** How many modules deep a folded value is followed, as `@barqjs/vite` does. */
const IMPORT_DEPTH = 6;

/**
 * The transform the build runs for `file`: compiled again with the values it
 * asked for from the files it imports, until a round learns nothing, so a call
 * through an imported `layer` binding or token folds, and declines, as it does
 * in the build.
 */
function transformWithImports(
  file: string,
  source: string,
  options: Parameters<Native["transform"]>[1],
  project: Project,
  depth: number,
  seen: Set<string>,
): ReturnType<Native["transform"]> {
  let out = compiler().transform(source, options);
  if (depth <= 0) return out;
  const cssImports: string[][] = [];
  const asked = new Set<string>();
  for (let round = 0; round < 4; round++) {
    const fresh = (out.cssWanted ?? []).filter(
      ([specifier, name]) => !asked.has(`${specifier}\u0000${name}`),
    );
    if (fresh.length === 0) break;
    let learned = false;
    for (const [specifier = "", name = ""] of fresh) {
      asked.add(`${specifier}\u0000${name}`);
      const dependency = resolveImport(file, specifier);
      if (dependency === undefined) continue;
      for (const row of exportsOf(dependency, project, depth - 1, new Set(seen))) {
        // `*` is a namespace import or an `export *`, answered with every row;
        // a `from` row says where a value's rules are and is not a value.
        if (row[1] === "from" || (name !== "*" && row[0] !== name)) continue;
        cssImports.push([specifier, ...row]);
        learned = true;
      }
    }
    if (!learned) break;
    out = compiler().transform(source, { ...options, cssImports });
  }
  return out;
}

function exportsOf(file: string, project: Project, depth: number, seen: Set<string>): string[][] {
  if (depth <= 0 || seen.has(file)) return [];
  seen.add(file);
  const known = project.exports.get(file);
  if (known !== undefined) return known;
  let rows: string[][] = [];
  try {
    const source = readFileSync(file, "utf8");
    rows =
      transformWithImports(
        file,
        source,
        {
          filename: file,
          root: dirname(file),
          dev: true,
          diagnostics: false,
          sourceNames: false,
          cssExports: true,
        },
        project,
        depth,
        seen,
      ).cssExports ?? [];
  } catch {
    rows = [];
  }
  project.exports.set(file, rows);
  return rows;
}

/** A finding about the project and no one position in a file. */
function about(file: string, severity: Severity, message: string): Finding {
  return { severity, message, file, line: 1, column: 1, endLine: 1, endColumn: 1 };
}

/**
 * The file routes, read the way the build reads them and written nowhere: the
 * patterns a link may name, and what the scan itself found wrong.
 */
interface FileRoutes {
  patterns?: string[];
  findings: Finding[];
}

function routesOf(root: string, dir: string): FileRoutes {
  if (!existsSync(join(root, dir))) return { findings: [] };
  const tree = compiler().routeTree(root, dir);
  return {
    patterns: tree.patterns,
    findings: [
      ...tree.warnings.map((warning) => about(dir, "warning", warning)),
      ...tree.mismatches.map((mismatch) =>
        about(
          mismatch.file,
          "error",
          `\`createFileRoute("${mismatch.declared}")\` names an id that differs from the one this file's name gives, \`${mismatch.expected}\`, and a build refuses it. Write \`createFileRoute("${mismatch.expected}")\`.`,
        ),
      ),
    ],
  };
}

function findingsOf(file: string, root: string, source: string, project: Project): Finding[] {
  const { options } = project;
  const name = relative(root, file).split(sep).join("/");
  let diagnostics: NativeDiagnostic[];
  try {
    diagnostics =
      transformWithImports(
        file,
        source,
        {
          filename: file,
          root,
          dev: true,
          diagnostics: true,
          sourceNames: false,
          checks: options.levels?.map(([code, level]) => [code, level]),
          routes: project.patterns,
        },
        project,
        IMPORT_DEPTH,
        new Set([file]),
      ).diagnostics ?? [];
  } catch (error) {
    // The compiler refuses a file it cannot parse by throwing, and the message
    // already carries the position.
    return [about(name, "error", error instanceof Error ? error.message : String(error))];
  }
  return diagnostics.map((found) => {
    const finding: Finding = {
      severity: severityOf(found.severity),
      message: found.message,
      file: name,
      line: found.line,
      column: found.column,
      endLine: found.endLine,
      endColumn: found.endColumn,
    };
    if (found.code !== undefined) {
      finding.code = found.code;
      finding.skill = `${SKILL}#${found.code.toLowerCase()}`;
    }
    if (found.docs !== undefined) finding.docs = found.docs;
    if (found.fix !== undefined && found.fix.length > 0) finding.fix = found.fix;
    return finding;
  });
}

/**
 * `source` with every fix applied that does not touch another's span, and how
 * many findings that repaired. Last edit first, so an offset stays valid.
 */
export function applyFixes(source: string, findings: readonly Finding[]): [string, number] {
  const chosen: Edit[] = [];
  let repaired = 0;
  for (const finding of findings) {
    const edits = finding.fix;
    if (edits === undefined) continue;
    const clash = edits.some((edit) =>
      chosen.some((taken) => edit.pos < taken.end && taken.pos < edit.end),
    );
    const repeated = edits.every((edit) =>
      chosen.some(
        (taken) => taken.pos === edit.pos && taken.end === edit.end && taken.text === edit.text,
      ),
    );
    if (clash || repeated) continue;
    chosen.push(...edits);
    repaired++;
  }
  let text = source;
  for (const edit of chosen.toSorted((a, b) => b.pos - a.pos)) {
    text = text.slice(0, edit.pos) + edit.text + text.slice(edit.end);
  }
  return [text, repaired];
}

export function check(options: CheckOptions): CheckResult {
  const root = resolve(options.root);
  const files: string[] = [];
  for (const path of options.paths === undefined || options.paths.length === 0
    ? ["."]
    : options.paths) {
    collect(resolve(root, path), files);
  }

  const routes = routesOf(root, options.routes ?? "src/routes");
  const project: Project = {
    options,
    exports: new Map(),
    patterns:
      routes.patterns === undefined
        ? undefined
        : [...routes.patterns, ...(options.extraRoutes ?? [])],
  };
  const findings: Finding[] = [...routes.findings];
  let checked = 0;
  let fixed = 0;
  for (const file of files) {
    let source: string | undefined;
    function text(): string {
      return (source ??= readFileSync(file, "utf8"));
    }
    if (!wanted(file, text)) continue;
    checked++;
    let found = findingsOf(file, root, text(), project);
    if (options.fix === true) {
      let current = text();
      for (let pass = 0; pass < MAX_PASSES; pass++) {
        const [next, repaired] = applyFixes(current, found);
        if (repaired === 0) break;
        current = next;
        fixed += repaired;
        found = findingsOf(file, root, current, project);
      }
      if (current !== text()) writeFileSync(file, current);
    }
    findings.push(...found);
  }

  function count(severity: Severity): number {
    return findings.filter((finding) => finding.severity === severity).length;
  }
  return {
    version: 1,
    root,
    files: checked,
    summary: {
      errors: count("error"),
      warnings: count("warning"),
      notes: count("note"),
      fixable: findings.filter((finding) => finding.fix !== undefined).length,
      fixed,
    },
    findings,
  };
}

export interface CodeEntry {
  code: string;
  level: string;
  summary: string;
  docs: string;
  skill: string;
}

/** Every code the installed compiler can raise, with its default level. */
export function codes(): CodeEntry[] {
  return compiler()
    .diagnosticCodes()
    .map((entry) => ({ ...entry, skill: `${SKILL}#${entry.code.toLowerCase()}` }));
}

export interface Paint {
  error(text: string): string;
  warning(text: string): string;
  note(text: string): string;
  dim(text: string): string;
  bold(text: string): string;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** The result for a person: one finding per block, then the count. */
export function formatText(result: CheckResult, paint: Paint): string {
  const lines: string[] = [];
  for (const finding of result.findings) {
    const at = `${finding.file}:${finding.line}:${finding.column}`;
    const label = paint[finding.severity](finding.severity);
    const code = finding.code === undefined ? "" : ` ${paint.bold(finding.code)}`;
    lines.push(`${at} ${label}${code} ${finding.message}`);
    if (finding.docs !== undefined) lines.push(paint.dim(`  docs: ${finding.docs}`));
    if (finding.fix !== undefined) lines.push(paint.dim("  fix: `barq check --fix` repairs this"));
    lines.push("");
  }
  const { errors, warnings, notes, fixable, fixed } = result.summary;
  const parts = [plural(errors, "error"), plural(warnings, "warning"), plural(notes, "note")];
  let summary = `${parts.join(", ")} in ${plural(result.files, "file")}`;
  if (fixed > 0) summary += `, ${fixed} fixed`;
  if (fixable > 0) summary += `, ${fixable} more fixable with \`--fix\``;
  lines.push(summary);
  if (result.findings.some((finding) => finding.code !== undefined)) {
    lines.push(paint.dim(`repair guide: ${SKILL}`));
  }
  return lines.join("\n");
}
