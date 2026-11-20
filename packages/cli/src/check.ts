/**
 * `barq check`: every file of a project through the compiler's diagnostics,
 * with no build and no dev server.
 *
 * The findings are the ones the Vite plugin reports, because they come from the
 * same `transform`. What this adds is one answer for a whole project, a JSON
 * form a program can read, and the fixes applied for the findings that carry
 * one.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve, sep } from "node:path";

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

export interface CheckResult {
  version: 1;
  root: string;
  files: number;
  summary: { errors: number; warnings: number; notes: number; fixable: number; fixed: number };
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

interface Native {
  transform(
    code: string,
    options: {
      filename: string;
      root: string;
      dev: boolean;
      diagnostics: boolean;
      sourceNames: boolean;
      checks?: string[][];
    },
  ): { diagnostics?: NativeDiagnostic[] };
  diagnosticCodes(): { code: string; level: string; summary: string; docs: string }[];
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

/** A script with no JSX is compiled only when it names barq, as the build does. */
function wanted(path: string, text: () => string): boolean {
  if (path.endsWith(".d.ts")) return false;
  if (JSX.test(path)) return true;
  return SCRIPT.test(path) && text().includes("@barqjs/");
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

function findingsOf(file: string, root: string, source: string, options: CheckOptions): Finding[] {
  const name = relative(root, file).split(sep).join("/");
  let diagnostics: NativeDiagnostic[];
  try {
    diagnostics =
      compiler().transform(source, {
        filename: file,
        root,
        dev: true,
        diagnostics: true,
        sourceNames: false,
        checks: options.levels?.map(([code, level]) => [code, level]),
      }).diagnostics ?? [];
  } catch (error) {
    // The compiler refuses a file it cannot parse by throwing, and the message
    // already carries the position.
    return [
      {
        severity: "error",
        message: error instanceof Error ? error.message : String(error),
        file: name,
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 1,
      },
    ];
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

  const findings: Finding[] = [];
  let checked = 0;
  let fixed = 0;
  for (const file of files) {
    let source: string | undefined;
    const text = (): string => (source ??= readFileSync(file, "utf8"));
    if (!wanted(file, text)) continue;
    checked++;
    let found = findingsOf(file, root, text(), options);
    if (options.fix === true) {
      let current = text();
      for (let pass = 0; pass < MAX_PASSES; pass++) {
        const [next, repaired] = applyFixes(current, found);
        if (repaired === 0) break;
        current = next;
        fixed += repaired;
        found = findingsOf(file, root, current, options);
      }
      if (current !== text()) writeFileSync(file, current);
    }
    findings.push(...found);
  }

  const count = (severity: Severity): number =>
    findings.filter((finding) => finding.severity === severity).length;
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

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

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
