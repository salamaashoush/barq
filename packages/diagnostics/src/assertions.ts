import type {
  ArtifactAttribution,
  ChangeOrigin,
  DiagnosticEvent,
  DiagnosticsArtifact,
  FindingCode,
  HoldEvent,
  RerunEvent,
} from "./types.ts";

const SHOWN = 10;

/**
 * A failed assertion over an artifact. The message is written to be acted on
 * without the artifact at hand, and `evidence` holds the offending records.
 */
export class DiagnosticsAssertionError extends Error {
  readonly evidence: readonly unknown[];

  constructor(message: string, evidence: readonly unknown[] = [], detail: readonly string[] = []) {
    const shown = detail.slice(0, SHOWN);
    if (detail.length > SHOWN) shown.push(`  ... and ${detail.length - SHOWN} more`);
    super(shown.length > 0 ? `${message}\n${shown.join("\n")}` : message);
    this.name = "DiagnosticsAssertionError";
    this.evidence = evidence;
  }
}

/**
 * A finding as the lines an agent repairs from: the code, where it happened
 * (owner path, then `file:line:col` when the compile kept locations), what it
 * says and the page that explains the fix.
 */
export function describeDiagnostic(event: DiagnosticEvent): string {
  const lines = [`  ${event.code} (${event.severity})`];
  if (event.ownerPath !== undefined && event.ownerPath.length > 0) {
    lines[0] += ` in ${event.ownerPath.join(" › ")}`;
  }
  if (event.loc !== undefined) lines.push(`    at ${event.loc}`);
  lines.push(`    ${event.message}`);
  if (event.docs !== undefined) lines.push(`    docs: ${event.docs}`);
  return lines.join("\n");
}

function json(records: readonly unknown[]): string[] {
  return records.map((record) => `  ${JSON.stringify(record)}`);
}

export interface NoDiagnosticsOptions {
  /** Codes to tolerate. */
  allow?: FindingCode[];
}

export function expectNoDiagnostics(
  artifact: DiagnosticsArtifact,
  options: NoDiagnosticsOptions = {},
): void {
  const allow = new Set<FindingCode>(options.allow);
  const offending = artifact.diagnostics.filter((event) => !allow.has(event.code));
  if (offending.length > 0) {
    throw new DiagnosticsAssertionError(
      `Expected no diagnostics but captured ${offending.length}:`,
      offending,
      offending.map(describeDiagnostic),
    );
  }
}

export interface DiagnosticOptions {
  /** Require exactly this many. */
  count?: number;
}

export function expectDiagnostic(
  artifact: DiagnosticsArtifact,
  code: FindingCode,
  options: DiagnosticOptions = {},
): void {
  const matches = artifact.diagnostics.filter((event) => event.code === code);
  if (matches.length === 0) {
    const captured = [...new Set(artifact.diagnostics.map((event) => event.code))];
    throw new DiagnosticsAssertionError(
      `Expected diagnostic ${code} but none was captured. Captured codes: [${captured.join(", ")}]`,
    );
  }
  if (options.count !== undefined && matches.length !== options.count) {
    throw new DiagnosticsAssertionError(
      `Expected diagnostic ${code} exactly ${options.count} time(s) but captured ${matches.length}:`,
      matches,
      matches.map(describeDiagnostic),
    );
  }
}

function attributionOf(artifact: DiagnosticsArtifact, caller: string): ArtifactAttribution {
  if (artifact.attribution === null) {
    throw new DiagnosticsAssertionError(
      `${caller} needs attribution data, but the artifact was captured with \`attribution: false\`.`,
    );
  }
  return artifact.attribution;
}

function matcher(pattern: string | RegExp): (name: string) => boolean {
  return typeof pattern === "string" ? (name) => name === pattern : (name) => pattern.test(name);
}

function rerunEvidence(rerun: RerunEvent): Record<string, unknown> {
  return {
    run: rerun.run,
    nodeName: rerun.nodeName,
    nodeKind: rerun.nodeKind,
    changed: rerun.changed,
    selfMs: rerun.selfMs,
    causes: rerun.causes.map((cause) => cause.name),
  };
}

export interface RerunBudgetOptions {
  /** Count only re-runs of scopes whose name matches. */
  scope?: string | RegExp;
}

/** The scenario caused at most `max` re-runs. */
export function expectRerunBudget(
  artifact: DiagnosticsArtifact,
  max: number,
  options: RerunBudgetOptions = {},
): void {
  let { reruns } = attributionOf(artifact, "expectRerunBudget");
  if (options.scope !== undefined) {
    const matches = matcher(options.scope);
    reruns = reruns.filter((rerun) => matches(rerun.nodeName));
  }
  if (reruns.length > max) {
    const evidence = reruns.map(rerunEvidence);
    throw new DiagnosticsAssertionError(
      `Expected at most ${max} re-run(s)${
        options.scope === undefined ? "" : ` for scope ${String(options.scope)}`
      } but attribution recorded ${reruns.length}. Each line names the scope that ran and the ` +
        "writes that caused it:",
      evidence,
      json(evidence),
    );
  }
}

export interface WasteBudgetOptions {
  /** Tolerated wasted wall time in ms (default: unbounded, the count gates). */
  maxWastedMs?: number;
  /** Tolerated count of wasted runs (default 0). */
  maxWastedRuns?: number;
}

/**
 * No plain, non-held run recomputed to an unchanged value. Optimistic and held
 * runs are excluded by the same rule the engine's `wastedMs` uses.
 */
export function expectNoWaste(
  artifact: DiagnosticsArtifact,
  options: WasteBudgetOptions = {},
): void {
  const { reruns } = attributionOf(artifact, "expectNoWaste");
  const wasted = reruns.filter((rerun) => !rerun.changed && rerun.phase === "plain" && !rerun.held);
  const wastedMs = wasted.reduce((total, rerun) => total + rerun.selfMs, 0);
  if (
    wasted.length > (options.maxWastedRuns ?? 0) ||
    wastedMs > (options.maxWastedMs ?? Infinity)
  ) {
    const evidence = wasted.map(rerunEvidence);
    throw new DiagnosticsAssertionError(
      `Expected no wasted re-runs but attribution recorded ${wasted.length} ` +
        `(${wastedMs.toFixed(3)}ms recomputing an unchanged value). Put a memo between the ` +
        "cause and the scope, or narrow what the scope reads:",
      evidence,
      json(evidence),
    );
  }
}

function describeInteraction(origin: ChangeOrigin | undefined): string | undefined {
  if (origin === undefined) return undefined;
  return `${origin.name} on ${origin.target ?? "an element"}`;
}

function holdEvidence(hold: HoldEvent): Record<string, unknown> {
  return {
    holdMs: Math.round(hold.holdMs),
    tailMs: Math.round(hold.tailMs),
    interaction: describeInteraction(hold.interaction),
    heldWrites: hold.heldWrites.map((write) => write.name),
    blockers: hold.blockers,
    acknowledgements: hold.acknowledgements,
    paintedDuringHold: hold.paintedDuringHold,
    action: hold.action,
  };
}

export interface SilentHoldOptions {
  /** A silent hold no longer than this is tolerated (default 0). */
  maxSilentMs?: number;
}

/**
 * Every hold the scenario caused was acknowledged on screen: an
 * `isPending()` or `latest()` reader, an optimistic value, an `affects()`
 * mark, or an effect that painted while it was held.
 */
export function expectNoSilentHolds(
  artifact: DiagnosticsArtifact,
  options: SilentHoldOptions = {},
): void {
  const { holds } = attributionOf(artifact, "expectNoSilentHolds");
  const maxMs = options.maxSilentMs ?? 0;
  const silent = holds.filter(
    (hold) =>
      hold.acknowledgements.length === 0 && hold.paintedDuringHold === 0 && hold.holdMs > maxMs,
  );
  if (silent.length > 0) {
    const worst = Math.max(...silent.map((hold) => hold.holdMs));
    const evidence = silent.map(holdEvidence);
    throw new DiagnosticsAssertionError(
      `Expected no silent holds${maxMs > 0 ? ` over ${maxMs}ms` : ""} but attribution recorded ` +
        `${silent.length} (worst ${worst.toFixed(0)}ms): a held write the screen never ` +
        "acknowledged. Read isPending() on the blocker, latest() on the held write, or write an " +
        "optimistic value. Do not move the write off the async path:",
      evidence,
      json(evidence),
    );
  }
}

export interface HoldBudgetOptions {
  /** Count only holds whose blockers include this source. */
  source?: string | RegExp;
}

/** No hold, acknowledged or not, outlasted `maxMs`. */
export function expectHoldBudget(
  artifact: DiagnosticsArtifact,
  maxMs: number,
  options: HoldBudgetOptions = {},
): void {
  let { holds } = attributionOf(artifact, "expectHoldBudget");
  if (options.source !== undefined) {
    const matches = matcher(options.source);
    holds = holds.filter((hold) => hold.blockers.some(matches));
  }
  const over = holds.filter((hold) => hold.holdMs > maxMs);
  if (over.length > 0) {
    const evidence = over.map(holdEvidence);
    throw new DiagnosticsAssertionError(
      `Expected every hold${
        options.source === undefined ? "" : ` on ${String(options.source)}`
      } to settle within ${maxMs}ms but ${over.length} did not:`,
      evidence,
      json(evidence),
    );
  }
}
