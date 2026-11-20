import type { DiagnosticEvent, DiagnosticsArtifact, HoldEvent, RerunEvent } from "./types.ts";

export const ENGINE_DOCS =
  "https://docs.solidjs.com/reference/solid-js/diagnostics/reactive-write-in-owned-scope";
export const BARQ_DOCS =
  "https://github.com/salamaashoush/barq/blob/main/packages/core/docs/diagnostics/BIND_TARGET_NOT_WRITABLE.md";

export function finding(overrides: Partial<DiagnosticEvent> = {}): DiagnosticEvent {
  return {
    sequence: 1,
    code: "REACTIVE_WRITE_IN_OWNED_SCOPE",
    kind: "write",
    severity: "error",
    message: "Writing to reactive state inside an owned scope is not allowed.",
    ownerPath: ["<App>", "<Counter>"],
    loc: "src/Counter.tsx:12:3",
    docs: ENGINE_DOCS,
    ...overrides,
  };
}

export function rerun(overrides: Partial<RerunEvent> = {}): RerunEvent {
  return {
    run: 1,
    at: 10,
    nodeRuns: 1,
    nodeKind: "memo",
    nodeName: "double",
    nodeId: 2,
    causes: [{ seq: 1, kind: "write", name: "count" }],
    depCount: 1,
    depsAdded: [],
    depsRemoved: [],
    selfMs: 0.5,
    totalMs: 0.5,
    changed: true,
    phase: "plain",
    held: false,
    ...overrides,
  };
}

export function hold(overrides: Partial<HoldEvent> = {}): HoldEvent {
  return {
    at: 20,
    holdMs: 120,
    tailMs: 120,
    interaction: { kind: "interaction", name: "click", target: "button#next" },
    flushes: 1,
    heldWrites: [{ name: "page" }],
    blockers: ["posts"],
    acknowledgements: [],
    paintedDuringHold: 0,
    action: false,
    silent: true,
    long: false,
    ...overrides,
  };
}

export interface ArtifactParts {
  scenario?: string;
  diagnostics?: DiagnosticEvent[];
  reruns?: RerunEvent[];
  holds?: HoldEvent[];
  attribution?: false;
}

export function artifact(parts: ArtifactParts = {}): DiagnosticsArtifact {
  return {
    formatVersion: 1,
    scenario: parts.scenario,
    capturedAt: "2026-01-01T00:00:00.000Z",
    timeOrigin: 1_700_000_000_000,
    durationMs: 5,
    diagnostics: parts.diagnostics ?? [],
    attribution:
      parts.attribution === false
        ? null
        : {
            reruns: parts.reruns ?? [],
            costs: { scopes: [], writes: [] },
            holds: parts.holds ?? [],
            feedback: {
              sources: [],
              interactions: [],
              navigations: [],
              flights: [],
              fallbacks: [],
            },
          },
  };
}

export function messageOf(run: () => void): string {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected the assertion to fail");
}
