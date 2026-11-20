import type { DiagnosticEvent } from "@barqjs/core";
import type {
  AttributionCostTables,
  AttributionFeedbackTables,
  AttributionOptions,
  HoldEvent,
  RerunEvent,
} from "@solidjs/signals/attribution";

export type { BarqDiagnosticCode, DiagnosticEvent } from "@barqjs/core";
export type { DiagnosticSeverity } from "@solidjs/signals";
export type {
  Acknowledgement,
  Attribution,
  AttributionCostTables,
  AttributionFeedbackTables,
  AttributionOptions,
  ChangeOrigin,
  ChangeRecord,
  FallbackStats,
  FeedbackInteraction,
  FeedbackSource,
  FlightStats,
  HeldWrite,
  HoldEvent,
  RerunEvent,
  ScopeCost,
  WriteCost,
} from "@solidjs/signals/attribution";

/** Every code a finding can carry: the engine's and barq's own. */
export type FindingCode = DiagnosticEvent["code"];

export interface ArtifactAttribution {
  /** Every re-run as the engine recorded it. `nodeId` names the scope. */
  reruns: RerunEvent[];
  costs: AttributionCostTables;
  /** Every hold that staged a root write: what the user waited on. */
  holds: HoldEvent[];
  feedback: AttributionFeedbackTables;
}

/**
 * What one captured scenario produced. Every `at` inside it is on the
 * capturing process's `performance.now()` clock, so `timeOrigin + at` is an
 * absolute time.
 */
export interface DiagnosticsArtifact {
  formatVersion: 1;
  scenario?: string;
  capturedAt: string;
  timeOrigin: number;
  durationMs: number;
  diagnostics: DiagnosticEvent[];
  /** `null` when the capture ran with attribution off. */
  attribution: ArtifactAttribution | null;
}

export interface BridgeBeginOptions {
  scenario?: string;
  attribution?: boolean | AttributionOptions;
}

/** An artifact as the page hands it over, before it is stamped with a format version. */
export type BridgePayload = Omit<DiagnosticsArtifact, "formatVersion">;
