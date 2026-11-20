import type { BridgePayload, DiagnosticsArtifact } from "./types.ts";

export const ARTIFACT_FORMAT_VERSION = 1 as const;

export function artifactFromPayload(
  payload: BridgePayload,
  scenario?: string,
): DiagnosticsArtifact {
  return {
    formatVersion: ARTIFACT_FORMAT_VERSION,
    scenario: scenario ?? payload.scenario,
    capturedAt: payload.capturedAt,
    timeOrigin: payload.timeOrigin,
    durationMs: payload.durationMs,
    diagnostics: payload.diagnostics,
    attribution: payload.attribution,
  };
}

export function serializeArtifact(artifact: DiagnosticsArtifact): string {
  return JSON.stringify(artifact, null, 2);
}

/**
 * One self-describing record per line, so a consumer can grep or stream
 * without parsing the whole artifact. The first line is the `meta` header;
 * every line carries a `type`.
 */
export function artifactToJSONL(artifact: DiagnosticsArtifact): string {
  const lines: string[] = [
    JSON.stringify({
      type: "meta",
      formatVersion: artifact.formatVersion,
      scenario: artifact.scenario,
      capturedAt: artifact.capturedAt,
      timeOrigin: artifact.timeOrigin,
      durationMs: artifact.durationMs,
      diagnosticCount: artifact.diagnostics.length,
      rerunCount: artifact.attribution?.reruns.length ?? null,
      holdCount: artifact.attribution?.holds.length ?? null,
    }),
  ];
  for (const event of artifact.diagnostics) {
    lines.push(JSON.stringify({ type: "diagnostic", ...event }));
  }
  if (artifact.attribution !== null) {
    for (const rerun of artifact.attribution.reruns) {
      lines.push(JSON.stringify({ type: "rerun", ...rerun }));
    }
    lines.push(JSON.stringify({ type: "costs", ...artifact.attribution.costs }));
    for (const hold of artifact.attribution.holds) {
      lines.push(JSON.stringify({ type: "hold", ...hold }));
    }
    lines.push(JSON.stringify({ type: "feedback", ...artifact.attribution.feedback }));
  }
  return lines.join("\n") + "\n";
}
