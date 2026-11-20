import {
  DiagnosticsAssertionError,
  expectHoldBudget,
  expectNoDiagnostics,
  expectNoSilentHolds,
  expectNoWaste,
  expectRerunBudget,
} from "./assertions.ts";
import type { DiagnosticsArtifact, FindingCode } from "./types.ts";

/** The definition of done for one scenario. Only stated bounds are enforced. */
export interface ScenarioBudget {
  /** Diagnostic codes tolerated for this scenario. */
  allow?: FindingCode[];
  maxReruns?: number;
  /** Unchanged recomputes of a plain, non-held run. */
  maxWastedRuns?: number;
  maxWastedMs?: number;
  /** Re-run caps per scope: an exact name, or a pattern written as `"/TodoRow/"`. */
  scopes?: Record<string, number>;
  /** How long a hold nothing on screen acknowledged may last. `0` fails every one. */
  maxSilentHoldMs?: number;
  /** How long any hold may last, acknowledged or not. */
  maxHoldMs?: number;
}

/** A checked-in budget file: scenario name to budget. */
export interface BudgetFile {
  formatVersion: 1;
  scenarios: Record<string, ScenarioBudget>;
}

function scopeMatcher(key: string): string | RegExp {
  return key.length > 2 && key.startsWith("/") && key.endsWith("/")
    ? new RegExp(key.slice(1, -1))
    : key;
}

export function assertBudget(artifact: DiagnosticsArtifact, budget: ScenarioBudget): void {
  expectNoDiagnostics(artifact, { allow: budget.allow });
  if (budget.maxReruns !== undefined) expectRerunBudget(artifact, budget.maxReruns);
  if (budget.maxWastedRuns !== undefined || budget.maxWastedMs !== undefined) {
    expectNoWaste(artifact, {
      maxWastedRuns: budget.maxWastedRuns,
      maxWastedMs: budget.maxWastedMs,
    });
  }
  if (budget.scopes !== undefined) {
    for (const [key, max] of Object.entries(budget.scopes)) {
      expectRerunBudget(artifact, max, { scope: scopeMatcher(key) });
    }
  }
  if (budget.maxSilentHoldMs !== undefined) {
    expectNoSilentHolds(artifact, { maxSilentMs: budget.maxSilentHoldMs });
  }
  if (budget.maxHoldMs !== undefined) expectHoldBudget(artifact, budget.maxHoldMs);
}

/** Enforce the budget the file states for the artifact's scenario. A missing entry fails. */
export function assertBudgetFile(artifact: DiagnosticsArtifact, file: BudgetFile): void {
  const scenario = artifact.scenario;
  if (scenario === undefined || scenario === "") {
    throw new DiagnosticsAssertionError(
      "assertBudgetFile needs the artifact to carry a scenario name: pass `{ scenario }` to " +
        "captureArtifact.",
    );
  }
  const budget = Object.hasOwn(file.scenarios, scenario) ? file.scenarios[scenario] : undefined;
  if (budget === undefined) {
    throw new DiagnosticsAssertionError(
      `No budget defined for scenario "${scenario}". Known scenarios: [${Object.keys(
        file.scenarios,
      ).join(", ")}]`,
    );
  }
  assertBudget(artifact, budget);
}

/** Parse and validate the text of a budget file. Reading the file is the caller's. */
export function parseBudgetFile(json: string): BudgetFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Budget file is not valid JSON: ${(error as Error).message}`, { cause: error });
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { formatVersion?: unknown }).formatVersion !== 1 ||
    typeof (parsed as { scenarios?: unknown }).scenarios !== "object" ||
    (parsed as { scenarios?: unknown }).scenarios === null
  ) {
    throw new Error(
      'Budget file must be an object of shape { "formatVersion": 1, "scenarios": { ... } }.',
    );
  }
  return parsed as BudgetFile;
}
