import { describe, expect, test } from "bun:test";

import { artifact, finding, hold, messageOf, rerun } from "./fixtures.ts";
import { install as installAnywhere } from "./matchers.ts";
import type { DiagnosticsMatcherTable } from "./matchers.ts";
import { install, matchers } from "./matchers-bun.ts";
import { matchers as vitestMatchers } from "./matchers-vitest.ts";

install(expect);

const quiet = artifact({ reruns: [rerun()] });
const noisy = artifact({
  diagnostics: [finding()],
  reruns: [rerun(), rerun({ run: 2, changed: false })],
  holds: [hold()],
});

describe("matchers under bun:test", () => {
  test("pass on an artifact within every bound", () => {
    expect(quiet).toHaveNoDiagnostics();
    expect(quiet).toStayWithinRerunBudget(1, { scope: "double" });
    expect(quiet).toHaveNoWaste();
    expect(quiet).toHaveNoSilentHolds();
    expect(quiet).toStayWithinHoldBudget(100);
    expect(quiet).toStayWithinBudget({ maxReruns: 1, maxWastedRuns: 0, maxSilentHoldMs: 0 });
    expect(noisy).toHaveDiagnostic("REACTIVE_WRITE_IN_OWNED_SCOPE", { count: 1 });
    expect(noisy).toHaveNoDiagnostics({ allow: ["REACTIVE_WRITE_IN_OWNED_SCOPE"] });
  });

  test("negate", () => {
    expect(noisy).not.toHaveNoDiagnostics();
    expect(quiet).not.toHaveDiagnostic("REACTIVE_WRITE_IN_OWNED_SCOPE");
    expect(noisy).not.toStayWithinRerunBudget(1);
    expect(noisy).not.toHaveNoWaste();
    expect(noisy).not.toHaveNoSilentHolds();
    expect(noisy).not.toStayWithinHoldBudget(100);
    expect(noisy).not.toStayWithinBudget({ maxReruns: 1 });
  });

  test("fail with the assertion's own message", () => {
    const message = messageOf(() => expect(noisy).toHaveNoDiagnostics());
    expect(message).toContain("Expected no diagnostics but captured 1:");
    expect(message).toContain("  REACTIVE_WRITE_IN_OWNED_SCOPE (error) in <App> › <Counter>");
    expect(message).toContain("    at src/Counter.tsx:12:3");
    expect(messageOf(() => expect(noisy).toStayWithinRerunBudget(1))).toContain(
      "Expected at most 1 re-run(s) but attribution recorded 2.",
    );
    expect(messageOf(() => expect(quiet).not.toHaveNoWaste())).toContain(
      "Expected wasted re-runs, but there were none.",
    );
  });
});

describe("the matcher table", () => {
  test("returns a result and a message either way", () => {
    const passed = matchers.toHaveNoDiagnostics(quiet);
    expect(passed.pass).toBe(true);
    expect(passed.message()).toBe(
      "Expected diagnostics to be captured, but there were none outside the allow list.",
    );
    const failed = matchers.toStayWithinHoldBudget(noisy, 100);
    expect(failed.pass).toBe(false);
    expect(failed.message()).toStartWith(
      "Expected every hold to settle within 100ms but 1 did not:",
    );
  });

  test("refuses a value that is not an artifact, in either direction", () => {
    const wrong =
      "Expected a diagnostics artifact: pass the `artifact` that captureArtifact returns";
    expect(() => matchers.toHaveNoDiagnostics({ result: 1, artifact: quiet })).toThrow(wrong);
    expect(() => expect(undefined).not.toHaveNoWaste()).toThrow(wrong);
  });

  test("install hands the table to any expect with extend, as vitest's has", () => {
    const received: DiagnosticsMatcherTable[] = [];
    installAnywhere({ extend: (table) => received.push(table) });
    expect(received).toEqual([matchers]);
    expect(vitestMatchers).toBe(matchers);
  });
});
