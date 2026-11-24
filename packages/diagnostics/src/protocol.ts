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

export interface WhyDidRunParams {
  name: string;
}

export interface DiagnosticsCall<Params, Result> {
  params: Params;
  result: Result;
}

export interface DiagnosticsMethods {
  /** Open a capture session. */
  begin: DiagnosticsCall<BridgeBeginOptions | undefined, true>;
  /** Close the session and return what it captured. */
  end: DiagnosticsCall<undefined, BridgePayload>;
  active: DiagnosticsCall<undefined, boolean>;
  /** Re-runs of one scope, by name, in the open session. */
  whyDidRun: DiagnosticsCall<WhyDidRunParams, RerunEvent[]>;
  /** The open session's tables so far, without closing it. */
  costs: DiagnosticsCall<undefined, AttributionCostTables>;
  holds: DiagnosticsCall<undefined, HoldEvent[]>;
  feedback: DiagnosticsCall<undefined, AttributionFeedbackTables>;
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
