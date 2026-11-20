import { describe, expect, expectTypeOf, test } from "vitest";

import { artifact, finding, hold, messageOf, rerun } from "./fixtures.ts";
import type { DiagnosticsMatchers } from "./matchers.ts";

const quiet = artifact({ reruns: [rerun()] });
const noisy = artifact({
  diagnostics: [finding()],
  reruns: [rerun(), rerun({ run: 2, changed: false })],
  holds: [hold()],
});

describe("matchers under vitest", () => {
  test("each passes on an artifact within its bound", () => {
    expect(quiet).toHaveNoDiagnostics();
    expect(noisy).toHaveNoDiagnostics({ allow: ["REACTIVE_WRITE_IN_OWNED_SCOPE"] });
    expect(noisy).toHaveDiagnostic("REACTIVE_WRITE_IN_OWNED_SCOPE", { count: 1 });
    expect(quiet).toStayWithinRerunBudget(1, { scope: "double" });
    expect(quiet).toHaveNoWaste();
    expect(noisy).toHaveNoWaste({ maxWastedRuns: 1 });
    expect(quiet).toHaveNoSilentHolds();
    expect(noisy).toHaveNoSilentHolds({ maxSilentMs: 120 });
    expect(quiet).toStayWithinHoldBudget(100);
    expect(noisy).toStayWithinHoldBudget(120);
    expect(quiet).toStayWithinBudget({ maxReruns: 1, maxWastedRuns: 0, maxSilentHoldMs: 0 });
  });

  test("each fails with the assertion's own message", () => {
    expect(messageOf(() => expect(noisy).toHaveNoDiagnostics())).toBe(
      "Expected no diagnostics but captured 1:\n" +
        "  REACTIVE_WRITE_IN_OWNED_SCOPE (error) in <App> › <Counter>\n" +
        "    at src/Counter.tsx:12:3\n" +
        "    Writing to reactive state inside an owned scope is not allowed.\n" +
        "    docs: https://docs.solidjs.com/reference/solid-js/diagnostics/reactive-write-in-owned-scope",
    );
    expect(messageOf(() => expect(quiet).toHaveDiagnostic("HYDRATION_MISMATCH"))).toBe(
      "Expected diagnostic HYDRATION_MISMATCH but none was captured. Captured codes: []",
    );
    expect(
      messageOf(() =>
        expect(noisy).toHaveDiagnostic("REACTIVE_WRITE_IN_OWNED_SCOPE", { count: 2 }),
      ),
    ).toContain(
      "Expected diagnostic REACTIVE_WRITE_IN_OWNED_SCOPE exactly 2 time(s) but captured 1:",
    );
    expect(messageOf(() => expect(noisy).toStayWithinRerunBudget(1, { scope: /dou/ }))).toContain(
      "Expected at most 1 re-run(s) for scope /dou/ but attribution recorded 2.",
    );
    expect(messageOf(() => expect(noisy).toHaveNoWaste())).toContain(
      "Expected no wasted re-runs but attribution recorded 1 (0.500ms recomputing an unchanged value).",
    );
    expect(messageOf(() => expect(noisy).toHaveNoSilentHolds())).toContain(
      "Expected no silent holds but attribution recorded 1 (worst 120ms)",
    );
    expect(messageOf(() => expect(noisy).toStayWithinHoldBudget(100))).toContain(
      "Expected every hold to settle within 100ms but 1 did not:\n" +
        '  {"holdMs":120,"tailMs":120,"interaction":"click on button#next"',
    );
    expect(messageOf(() => expect(noisy).toStayWithinBudget({ maxReruns: 5 }))).toContain(
      "Expected no diagnostics but captured 1:",
    );
    expect(
      messageOf(() =>
        expect(noisy).toStayWithinBudget({
          allow: ["REACTIVE_WRITE_IN_OWNED_SCOPE"],
          maxReruns: 1,
        }),
      ),
    ).toContain("Expected at most 1 re-run(s) but attribution recorded 2.");
  });

  test("each negates, and a negation that fails says what held", () => {
    expect(noisy).not.toHaveNoDiagnostics();
    expect(quiet).not.toHaveDiagnostic("REACTIVE_WRITE_IN_OWNED_SCOPE");
    expect(noisy).not.toStayWithinRerunBudget(1);
    expect(noisy).not.toHaveNoWaste();
    expect(noisy).not.toHaveNoSilentHolds();
    expect(noisy).not.toStayWithinHoldBudget(100);
    expect(noisy).not.toStayWithinBudget({ maxReruns: 1 });

    expect(messageOf(() => expect(quiet).not.toHaveNoDiagnostics())).toBe(
      "Expected diagnostics to be captured, but there were none outside the allow list.",
    );
    expect(
      messageOf(() => expect(noisy).not.toHaveDiagnostic("REACTIVE_WRITE_IN_OWNED_SCOPE")),
    ).toBe("Expected diagnostic REACTIVE_WRITE_IN_OWNED_SCOPE not to be captured, but it was.");
    expect(messageOf(() => expect(quiet).not.toStayWithinRerunBudget(1))).toBe(
      "Expected more than 1 re-run(s), but the budget held.",
    );
    expect(messageOf(() => expect(quiet).not.toHaveNoWaste())).toBe(
      "Expected wasted re-runs, but there were none.",
    );
    expect(messageOf(() => expect(quiet).not.toHaveNoSilentHolds())).toBe(
      "Expected a silent hold, but every hold was acknowledged.",
    );
    expect(messageOf(() => expect(quiet).not.toStayWithinHoldBudget(100))).toBe(
      "Expected a hold longer than 100ms, but every hold settled within it.",
    );
    expect(messageOf(() => expect(quiet).not.toStayWithinBudget({ maxReruns: 1 }))).toBe(
      "Expected the budget to be exceeded, but it held.",
    );
  });

  test("refuses a value that is not an artifact, in either direction", () => {
    const wrong =
      "Expected a diagnostics artifact: pass the `artifact` that captureArtifact returns";
    expect(() => expect({ result: 1, artifact: quiet }).toHaveNoDiagnostics()).toThrow(wrong);
    expect(() => expect(undefined).not.toHaveNoWaste()).toThrow(wrong);
  });

  test("the augmentation types every matcher on vitest's expect", () => {
    expectTypeOf(expect(quiet)).toExtend<DiagnosticsMatchers>();
    expectTypeOf(expect(quiet).not).toExtend<DiagnosticsMatchers>();

    expect(() => {
      // @ts-expect-error a code is one of the engine's or barq's
      expect(quiet).toHaveDiagnostic("NOT_A_DIAGNOSTIC");
    }).toThrow("Expected diagnostic NOT_A_DIAGNOSTIC but none was captured.");
  });
});
