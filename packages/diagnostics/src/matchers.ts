import {
  DiagnosticsAssertionError,
  expectDiagnostic,
  expectHoldBudget,
  expectNoDiagnostics,
  expectNoSilentHolds,
  expectNoWaste,
  expectRerunBudget,
} from "./assertions.ts";
import type {
  DiagnosticOptions,
  HoldBudgetOptions,
  NoDiagnosticsOptions,
  RerunBudgetOptions,
  SilentHoldOptions,
  WasteBudgetOptions,
} from "./assertions.ts";
import { assertBudget } from "./budgets.ts";
import type { ScenarioBudget } from "./budgets.ts";
import type { DiagnosticsArtifact, FindingCode } from "./types.ts";

export interface MatcherResult {
  pass: boolean;
  message: () => string;
}

/** What `expect(artifact)` gains. The runner augmentations extend this. */
export interface DiagnosticsMatchers {
  toHaveNoDiagnostics(options?: NoDiagnosticsOptions): void;
  toHaveDiagnostic(code: FindingCode, options?: DiagnosticOptions): void;
  toStayWithinRerunBudget(max: number, options?: RerunBudgetOptions): void;
  toHaveNoWaste(options?: WasteBudgetOptions): void;
  toHaveNoSilentHolds(options?: SilentHoldOptions): void;
  toStayWithinHoldBudget(maxMs: number, options?: HoldBudgetOptions): void;
  toStayWithinBudget(budget: ScenarioBudget): void;
}

export type DiagnosticsMatcherTable = {
  [K in keyof DiagnosticsMatchers]: (
    received: unknown,
    ...args: Parameters<DiagnosticsMatchers[K]>
  ) => MatcherResult;
};

function artifactOf(received: unknown): DiagnosticsArtifact {
  const candidate = received as Partial<DiagnosticsArtifact> | null | undefined;
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !Array.isArray(candidate.diagnostics)
  ) {
    throw new TypeError(
      "Expected a diagnostics artifact: pass the `artifact` that captureArtifact returns, as in " +
        "`const { artifact } = await captureArtifact(...)`.",
    );
  }
  return candidate as DiagnosticsArtifact;
}

function run(check: () => void, negated: string): MatcherResult {
  try {
    check();
    return { pass: true, message: () => negated };
  } catch (error) {
    if (error instanceof DiagnosticsAssertionError) {
      const message = error.message;
      return { pass: false, message: () => message };
    }
    throw error;
  }
}

export const matchers: DiagnosticsMatcherTable = {
  toHaveNoDiagnostics(received, options) {
    return run(
      () => expectNoDiagnostics(artifactOf(received), options),
      "Expected diagnostics to be captured, but there were none outside the allow list.",
    );
  },
  toHaveDiagnostic(received, code, options) {
    return run(
      () => expectDiagnostic(artifactOf(received), code, options),
      `Expected diagnostic ${code} not to be captured, but it was.`,
    );
  },
  toStayWithinRerunBudget(received, max, options) {
    return run(
      () => expectRerunBudget(artifactOf(received), max, options),
      `Expected more than ${max} re-run(s), but the budget held.`,
    );
  },
  toHaveNoWaste(received, options) {
    return run(
      () => expectNoWaste(artifactOf(received), options),
      "Expected wasted re-runs, but there were none.",
    );
  },
  toHaveNoSilentHolds(received, options) {
    return run(
      () => expectNoSilentHolds(artifactOf(received), options),
      "Expected a silent hold, but every hold was acknowledged.",
    );
  },
  toStayWithinHoldBudget(received, maxMs, options) {
    return run(
      () => expectHoldBudget(artifactOf(received), maxMs, options),
      `Expected a hold longer than ${maxMs}ms, but every hold settled within it.`,
    );
  },
  toStayWithinBudget(received, budget) {
    return run(
      () => assertBudget(artifactOf(received), budget),
      "Expected the budget to be exceeded, but it held.",
    );
  },
};

export interface Extendable {
  extend(table: DiagnosticsMatcherTable): unknown;
}

/** Register the matchers on a runner's `expect`: `bun:test`'s or vitest's. */
export function install(expect: Extendable): void {
  expect.extend(matchers);
}
