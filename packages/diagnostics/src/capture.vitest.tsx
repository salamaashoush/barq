import { OBSERVE as engineObserve } from "@solidjs/signals";
import { OBSERVE, createMemo, createSignal } from "@barqjs/core";
import { cleanup, render } from "@barqjs/testing/pure";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { captureArtifact } from "@barqjs/diagnostics";
import { messageOf } from "./fixtures.ts";

const attribution = { hotTime: false } as const;

function writeNow(set: (value: number) => unknown): void {
  set(1);
}

function WritesWhileRendering() {
  const [count, setCount] = createSignal(0, { name: "count" });
  writeNow(setCount);
  return <p>{count()}</p>;
}

function Counter() {
  const [count, setCount] = createSignal(0, { name: "count" });
  const double = createMemo(() => count() * 2, { name: "double" });
  const whole = createMemo(() => Number.isInteger(count()), { name: "whole" });
  return (
    <button type="button" onClick={() => setCount((value) => value + 1)}>
      {double()}:{String(whole())}
    </button>
  );
}

beforeAll(() => {
  for (const method of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});
afterAll(() => vi.restoreAllMocks());
afterEach(cleanup);

describe("captureArtifact under vitest", () => {
  test("runs the engine's development build, one copy of it", () => {
    expect(engineObserve).toBeDefined();
    expect(OBSERVE).toBe(engineObserve);
  });

  test("captures the engine's finding from a rendered component", async () => {
    const { artifact } = await captureArtifact(
      () => {
        expect(() => render(() => <WritesWhileRendering />)).toThrow(
          "REACTIVE_WRITE_IN_OWNED_SCOPE",
        );
      },
      { scenario: "write while rendering", attribution },
    );

    expect(artifact).toHaveDiagnostic("REACTIVE_WRITE_IN_OWNED_SCOPE", { count: 1 });
    expect(artifact).toHaveNoDiagnostics({ allow: ["REACTIVE_WRITE_IN_OWNED_SCOPE"] });
    const [event] = artifact.diagnostics;
    expect(event.ownerPath).toEqual(["<WritesWhileRendering>"]);
    expect(event.loc).toMatch(/capture\.vitest\.tsx:\d+:\d+$/);
    expect(messageOf(() => expect(artifact).toHaveNoDiagnostics())).toContain(
      "  REACTIVE_WRITE_IN_OWNED_SCOPE (error) in <WritesWhileRendering>\n" +
        `    at ${event.loc}\n`,
    );
  });

  test("attributes a click's re-runs to the write that caused them", async () => {
    const view = render(() => <Counter />);
    const button = view.getByRole("button");
    expect(button.textContent).toBe("0:true");

    const { artifact } = await captureArtifact(() => button.click(), {
      scenario: "counter click",
      attribution,
    });
    expect(button.textContent).toBe("2:true");

    expect(artifact).toHaveNoDiagnostics();
    expect(artifact).toStayWithinRerunBudget(3);
    expect(artifact).toStayWithinRerunBudget(1, { scope: "double" });
    expect(
      messageOf(() => expect(artifact).toStayWithinRerunBudget(0, { scope: "double" })),
    ).toContain('"nodeName":"double","nodeKind":"memo","changed":true,');

    // `whole` recomputed to the value it already had.
    expect(messageOf(() => expect(artifact).toHaveNoWaste())).toContain('"nodeName":"whole"');
    expect(artifact).toHaveNoWaste({ maxWastedRuns: 1 });
    expect(artifact).toHaveNoSilentHolds();
    expect(artifact).toStayWithinHoldBudget(0);
    expect(artifact).toStayWithinBudget({
      maxReruns: 3,
      maxWastedRuns: 1,
      scopes: { double: 1, "/^wh/": 1 },
    });
    expect(artifact).not.toStayWithinBudget({ maxReruns: 3, maxWastedRuns: 0 });
  });
});
