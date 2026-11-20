import { describe, expect, test } from "bun:test";

import {
  DiagnosticsAssertionError,
  assertBudget,
  assertBudgetFile,
  parseBudgetFile,
} from "./index.ts";
import type { ScenarioBudget } from "./index.ts";
import { artifact, finding, hold, messageOf, rerun } from "./fixtures.ts";

const captured = artifact({
  scenario: "todo-toggle",
  diagnostics: [finding({ code: "NO_OWNER_EFFECT" })],
  reruns: [
    rerun({ nodeName: "TodoRow" }),
    rerun({ run: 2, nodeName: "TodoRow" }),
    rerun({ run: 3, nodeName: "visibleCount", changed: false }),
  ],
  holds: [hold()],
});

describe("assertBudget", () => {
  test("passes when every stated bound holds", () => {
    assertBudget(captured, {
      allow: ["NO_OWNER_EFFECT"],
      maxReruns: 3,
      maxWastedRuns: 1,
      scopes: { TodoRow: 2, "/Count$/": 1 },
      maxSilentHoldMs: 120,
      maxHoldMs: 120,
    });
  });

  test("enforces only what is stated, and always the findings", () => {
    assertBudget(captured, { allow: ["NO_OWNER_EFFECT"] });
    expect(messageOf(() => assertBudget(captured, {}))).toStartWith(
      "Expected no diagnostics but captured 1:\n  NO_OWNER_EFFECT (error)",
    );
  });

  const allowed: ScenarioBudget = { allow: ["NO_OWNER_EFFECT"] };
  const violations: [string, ScenarioBudget, string][] = [
    ["maxReruns", { maxReruns: 2 }, "Expected at most 2 re-run(s) but attribution recorded 3."],
    [
      "maxWastedRuns",
      { maxWastedRuns: 0 },
      "Expected no wasted re-runs but attribution recorded 1",
    ],
    ["maxWastedMs", { maxWastedMs: 0.1 }, "Expected no wasted re-runs but attribution recorded 1"],
    [
      "an exact scope",
      { scopes: { TodoRow: 1 } },
      "Expected at most 1 re-run(s) for scope TodoRow but attribution recorded 2.",
    ],
    [
      "a pattern scope",
      { scopes: { "/^Todo/": 0 } },
      "Expected at most 0 re-run(s) for scope /^Todo/ but attribution recorded 2.",
    ],
    [
      "maxSilentHoldMs",
      { maxSilentHoldMs: 0 },
      "Expected no silent holds but attribution recorded 1",
    ],
    ["maxHoldMs", { maxHoldMs: 100 }, "Expected every hold to settle within 100ms but 1 did not:"],
  ];
  test.each(violations)("fails on %s", (_name, budget, message) => {
    expect(() => assertBudget(captured, { ...allowed, ...budget })).toThrow(
      DiagnosticsAssertionError,
    );
    expect(messageOf(() => assertBudget(captured, { ...allowed, ...budget }))).toStartWith(message);
  });
});

describe("budget files", () => {
  const text = JSON.stringify({
    formatVersion: 1,
    scenarios: { "todo-toggle": { allow: ["NO_OWNER_EFFECT"], maxReruns: 2 }, "todo-add": {} },
  });

  test("parseBudgetFile returns the file", () => {
    expect(parseBudgetFile(text).scenarios["todo-toggle"]).toEqual({
      allow: ["NO_OWNER_EFFECT"],
      maxReruns: 2,
    });
  });

  test("parseBudgetFile rejects text that is not JSON or not a budget file", () => {
    expect(() => parseBudgetFile("{")).toThrow(/^Budget file is not valid JSON: /);
    for (const wrong of [
      "null",
      "[]",
      '{"formatVersion":2,"scenarios":{}}',
      '{"formatVersion":1}',
    ]) {
      expect(() => parseBudgetFile(wrong)).toThrow(
        'Budget file must be an object of shape { "formatVersion": 1, "scenarios": { ... } }.',
      );
    }
  });

  test("assertBudgetFile enforces the budget named by the artifact's scenario", () => {
    const file = parseBudgetFile(text);
    expect(messageOf(() => assertBudgetFile(captured, file))).toStartWith(
      "Expected at most 2 re-run(s) but attribution recorded 3.",
    );
    assertBudgetFile(artifact({ scenario: "todo-add" }), file);
  });

  test("assertBudgetFile fails on an unnamed or unbudgeted scenario", () => {
    const file = parseBudgetFile(text);
    expect(messageOf(() => assertBudgetFile(artifact(), file))).toBe(
      "assertBudgetFile needs the artifact to carry a scenario name: pass `{ scenario }` to captureArtifact.",
    );
    expect(messageOf(() => assertBudgetFile(artifact({ scenario: "toString" }), file))).toBe(
      'No budget defined for scenario "toString". Known scenarios: [todo-toggle, todo-add]',
    );
  });
});
