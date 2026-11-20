/**
 * The wire between the page's bridge and whatever drives it from outside: the
 * Vite plugin's endpoint, an agent with `curl`, a test driver.
 */
import type {
  AttributionCostTables,
  AttributionFeedbackTables,
  BridgeBeginOptions,
  BridgePayload,
  DiagnosticsArtifact,
  HoldEvent,
  RerunEvent,
} from "./types.ts";

/** Vite custom events carrying a request into the page and its answer back. */
export const DIAGNOSTICS_REQUEST_EVENT = "barq:diagnostics:request" as const;
export const DIAGNOSTICS_RESPONSE_EVENT = "barq:diagnostics:response" as const;

export const DIAGNOSTICS_ENDPOINT = "/__barq/diagnostics" as const;

export interface DiagnosticsMethods {
  /** Open a capture session. */
  begin: { params: BridgeBeginOptions | undefined; result: true };
  /** Close the session and return what it captured. */
  end: { params: undefined; result: BridgePayload };
  active: { params: undefined; result: boolean };
  /** Re-runs of one scope, by name, in the open session. */
  whyDidRun: { params: { name: string }; result: RerunEvent[] };
  /** The open session's tables so far, without closing it. */
  costs: { params: undefined; result: AttributionCostTables };
  holds: { params: undefined; result: HoldEvent[] };
  feedback: { params: undefined; result: AttributionFeedbackTables };
}

export type DiagnosticsMethod = keyof DiagnosticsMethods;

export const DIAGNOSTICS_METHODS: readonly DiagnosticsMethod[] = [
  "begin",
  "end",
  "active",
  "whyDidRun",
  "costs",
  "holds",
  "feedback",
];

export interface DiagnosticsRequest<M extends DiagnosticsMethod = DiagnosticsMethod> {
  id: number;
  method: M;
  params?: DiagnosticsMethods[M]["params"];
}

export type DiagnosticsResponse<M extends DiagnosticsMethod = DiagnosticsMethod> =
  | { id: number; result: DiagnosticsMethods[M]["result"]; error?: undefined }
  | { id: number; error: string; result?: undefined };

/** What `GET` on the endpoint answers with. */
export interface DiagnosticsEndpointState {
  /** Stored artifacts, oldest first. */
  artifacts: DiagnosticsArtifact[];
  /** Pages connected to the dev server that can answer a method call. */
  clients: number;
  methods: readonly DiagnosticsMethod[];
}
