import { describe, expect, test } from "bun:test";

import {
  DiagnosticsAssertionError,
  expectDiagnostic,
  expectHoldBudget,
  expectNoDiagnostics,
  expectNoSilentHolds,
  expectNoWaste,
  expectRerunBudget,
} from "./index.ts";
import { BARQ_DOCS, ENGINE_DOCS, artifact, finding, hold, messageOf, rerun } from "./fixtures.ts";

describe("expectNoDiagnostics", () => {
  test("passes on a quiet artifact and on an allowed code", () => {
    expectNoDiagnostics(artifact());
    expectNoDiagnostics(artifact({ diagnostics: [finding()] }), {
      allow: ["REACTIVE_WRITE_IN_OWNED_SCOPE"],
    });
  });

  test("names the code, the owner path, the location and the docs page", () => {
    const captured = artifact({ diagnostics: [finding()] });
    expect(() => expectNoDiagnostics(captured)).toThrow(DiagnosticsAssertionError);
    expect(messageOf(() => expectNoDiagnostics(captured))).toBe(
      [
        "Expected no diagnostics but captured 1:",
        "  REACTIVE_WRITE_IN_OWNED_SCOPE (error) in <App> › <Counter>",
        "    at src/Counter.tsx:12:3",
        "    Writing to reactive state inside an owned scope is not allowed.",
        `    docs: ${ENGINE_DOCS}`,
      ].join("\n"),
    );
  });

  test("leaves out what a finding does not carry", () => {
    const bare = finding({
      code: "BIND_TARGET_NOT_WRITABLE",
      kind: "render",
      message: "`bind:value` was given a function.",
      ownerPath: undefined,
      loc: undefined,
      docs: BARQ_DOCS,
    });
    expect(messageOf(() => expectNoDiagnostics(artifact({ diagnostics: [bare] })))).toBe(
      [
        "Expected no diagnostics but captured 1:",
        "  BIND_TARGET_NOT_WRITABLE (error)",
        "    `bind:value` was given a function.",
        `    docs: ${BARQ_DOCS}`,
      ].join("\n"),
    );
  });

  test("keeps every offending event as evidence and shows the first ten", () => {
    const many = Array.from({ length: 12 }, (_, index) => finding({ sequence: index + 1 }));
    try {
      expectNoDiagnostics(artifact({ diagnostics: many }));
      throw new Error("expected the assertion to fail");
    } catch (error) {
      const failure = error as DiagnosticsAssertionError;
      expect(failure.name).toBe("DiagnosticsAssertionError");
      expect(failure.evidence).toEqual(many);
      expect(failure.message.match(/REACTIVE_WRITE_IN_OWNED_SCOPE/g)).toHaveLength(10);
      expect(failure.message).toEndWith("  ... and 2 more");
    }
  });
});

describe("expectDiagnostic", () => {
  const captured = artifact({
    diagnostics: [finding(), finding({ sequence: 2 }), finding({ code: "NO_OWNER_EFFECT" })],
  });

  test("passes when the code was captured, any number of times or exactly", () => {
    expectDiagnostic(captured, "NO_OWNER_EFFECT");
    expectDiagnostic(captured, "REACTIVE_WRITE_IN_OWNED_SCOPE", { count: 2 });
  });

  test("lists what was captured when the code is missing", () => {
    expect(messageOf(() => expectDiagnostic(captured, "HYDRATION_MISMATCH"))).toBe(
      "Expected diagnostic HYDRATION_MISMATCH but none was captured. " +
        "Captured codes: [REACTIVE_WRITE_IN_OWNED_SCOPE, NO_OWNER_EFFECT]",
    );
  });

  test("describes the matches when the count is off", () => {
    const message = messageOf(() =>
      expectDiagnostic(captured, "REACTIVE_WRITE_IN_OWNED_SCOPE", { count: 1 }),
    );
    expect(message).toStartWith(
      "Expected diagnostic REACTIVE_WRITE_IN_OWNED_SCOPE exactly 1 time(s) but captured 2:",
    );
    expect(message).toContain("    at src/Counter.tsx:12:3");
    expect(message).toContain(`    docs: ${ENGINE_DOCS}`);
  });
});

describe("expectRerunBudget", () => {
  const captured = artifact({
    reruns: [
      rerun(),
      rerun({ run: 2, nodeName: "TodoRow", nodeKind: "effect" }),
      rerun({ run: 3, nodeName: "TodoRow", nodeKind: "effect" }),
    ],
  });

  test("passes within the budget, in total and per scope", () => {
    expectRerunBudget(captured, 3);
    expectRerunBudget(captured, 1, { scope: "double" });
    expectRerunBudget(captured, 2, { scope: /Row$/ });
  });

  test("names each scope that ran and what caused it", () => {
    expect(messageOf(() => expectRerunBudget(captured, 1, { scope: "TodoRow" }))).toBe(
      [
        "Expected at most 1 re-run(s) for scope TodoRow but attribution recorded 2. " +
          "Each line names the scope that ran and the writes that caused it:",
        '  {"run":2,"nodeName":"TodoRow","nodeKind":"effect","changed":true,"selfMs":0.5,"causes":["count"]}',
        '  {"run":3,"nodeName":"TodoRow","nodeKind":"effect","changed":true,"selfMs":0.5,"causes":["count"]}',
      ].join("\n"),
    );
    expect(messageOf(() => expectRerunBudget(captured, 2))).toStartWith(
      "Expected at most 2 re-run(s) but attribution recorded 3.",
    );
  });

  test("says so when the artifact has no attribution", () => {
    expect(messageOf(() => expectRerunBudget(artifact({ attribution: false }), 1))).toBe(
      "expectRerunBudget needs attribution data, but the artifact was captured with `attribution: false`.",
    );
  });
});

describe("expectNoWaste", () => {
  const wasted = rerun({ nodeName: "parity", changed: false, selfMs: 0.25 });

  test("passes when every plain run changed its value", () => {
    expectNoWaste(artifact({ reruns: [rerun()] }));
  });

  test("does not count held or optimistic runs", () => {
    expectNoWaste(
      artifact({
        reruns: [
          rerun({ changed: false, held: true }),
          rerun({ changed: false, phase: "optimistic" }),
        ],
      }),
    );
  });

  test("tolerates what the options allow", () => {
    expectNoWaste(artifact({ reruns: [wasted] }), { maxWastedRuns: 1 });
    expect(() =>
      expectNoWaste(artifact({ reruns: [wasted] }), { maxWastedRuns: 1, maxWastedMs: 0.1 }),
    ).toThrow(DiagnosticsAssertionError);
  });

  test("names the wasted scope, its cost and the repair", () => {
    expect(messageOf(() => expectNoWaste(artifact({ reruns: [rerun(), wasted] })))).toBe(
      [
        "Expected no wasted re-runs but attribution recorded 1 (0.250ms recomputing an unchanged " +
          "value). Put a memo between the cause and the scope, or narrow what the scope reads:",
        '  {"run":1,"nodeName":"parity","nodeKind":"memo","changed":false,"selfMs":0.25,"causes":["count"]}',
      ].join("\n"),
    );
  });
});

describe("expectNoSilentHolds", () => {
  test("passes with no holds, an acknowledged hold or a hold that painted", () => {
    expectNoSilentHolds(artifact());
    expectNoSilentHolds(
      artifact({
        holds: [
          hold({ acknowledgements: [{ kind: "isPending", source: "posts" }], silent: false }),
          hold({ paintedDuringHold: 1, silent: false }),
        ],
      }),
    );
  });

  test("tolerates a silent hold within maxSilentMs", () => {
    expectNoSilentHolds(artifact({ holds: [hold()] }), { maxSilentMs: 120 });
    expect(
      messageOf(() => expectNoSilentHolds(artifact({ holds: [hold()] }), { maxSilentMs: 100 })),
    ).toStartWith("Expected no silent holds over 100ms but attribution recorded 1 (worst 120ms)");
  });

  test("names the interaction, the held write, the blocker and the repair", () => {
    expect(messageOf(() => expectNoSilentHolds(artifact({ holds: [hold()] })))).toBe(
      [
        "Expected no silent holds but attribution recorded 1 (worst 120ms): a held write the " +
          "screen never acknowledged. Read isPending() on the blocker, latest() on the held " +
          "write, or write an optimistic value. Do not move the write off the async path:",
        '  {"holdMs":120,"tailMs":120,"interaction":"click on button#next","heldWrites":["page"],' +
          '"blockers":["posts"],"acknowledgements":[],"paintedDuringHold":0,"action":false}',
      ].join("\n"),
    );
  });
});

describe("expectHoldBudget", () => {
  const captured = artifact({
    holds: [
      hold({ holdMs: 40, tailMs: 40 }),
      hold({ holdMs: 900, tailMs: 900, blockers: ["profile"], interaction: undefined }),
    ],
  });

  test("passes when every hold, or every hold on the source, settled in time", () => {
    expectHoldBudget(captured, 1000);
    expectHoldBudget(captured, 50, { source: "posts" });
    expectHoldBudget(captured, 50, { source: /^post/ });
  });

  test("names the holds that outlasted the budget", () => {
    expect(messageOf(() => expectHoldBudget(captured, 500, { source: "profile" }))).toBe(
      [
        "Expected every hold on profile to settle within 500ms but 1 did not:",
        '  {"holdMs":900,"tailMs":900,"heldWrites":["page"],"blockers":["profile"],' +
          '"acknowledgements":[],"paintedDuringHold":0,"action":false}',
      ].join("\n"),
    );
    expect(messageOf(() => expectHoldBudget(captured, 500))).toStartWith(
      "Expected every hold to settle within 500ms but 1 did not:",
    );
  });
});
