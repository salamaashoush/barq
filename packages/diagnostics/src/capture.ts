import { DEV } from "@barqjs/core";
import { OBSERVE, flush } from "@solidjs/signals";
// Importing the folds is what turns their accounting on.
import { attribution as engine, costs, feedback } from "@solidjs/signals/attribution";

import { ARTIFACT_FORMAT_VERSION } from "./artifact.ts";
import type { ArtifactAttribution, AttributionOptions, DiagnosticsArtifact } from "./types.ts";

export interface CaptureOptions {
  /** Label stamped into the artifact; budget files are keyed by it. */
  scenario?: string;
  /**
   * `true` (the default) enables attribution with console logging off,
   * `false` captures findings only, and an options object is passed to the
   * engine's `enable()`.
   */
  attribution?: boolean | AttributionOptions;
  /**
   * Flush the reactive queue after the scenario returns (default `true`), so
   * work its last writes scheduled is attributed to it.
   */
  autoFlush?: boolean;
}

export interface CaptureResult<T> {
  result: T;
  artifact: DiagnosticsArtifact;
}

export const PRODUCTION_BUILD_MESSAGE: string =
  "@barqjs/diagnostics needs the development build of @solidjs/signals. In its production " +
  "build `OBSERVE` is undefined, so there is no attribution to capture and the engine reports " +
  "no findings. Resolve the `development` export condition: `bun test --conditions=development`, " +
  "or a Vite dev server.";

/**
 * Take a hold on the shared attribution engine. Releasing it leaves any other
 * consumer's hold (a profiler track, an APM adapter) in place.
 */
export function holdAttribution(
  option: boolean | AttributionOptions | undefined,
): (() => void) | undefined {
  if (option === false) return undefined;
  return engine.enable(typeof option === "object" ? { log: false, ...option } : { log: false });
}

/** Read before releasing: the last release resets the tables. */
export function readAttribution(): ArtifactAttribution {
  return {
    reruns: [...engine.history("rerun")],
    costs: costs(),
    holds: [...engine.history("hold")],
    feedback: feedback(),
  };
}

/**
 * Run a scenario with barq's findings channel and the attribution engine open
 * and return what they saw as one serializable artifact.
 */
export async function captureArtifact<T>(
  scenario: () => T | Promise<T>,
  options: CaptureOptions = {},
): Promise<CaptureResult<T>> {
  if (OBSERVE === undefined) throw new Error(PRODUCTION_BUILD_MESSAGE);

  const capture = DEV.diagnostics.capture();
  const release = holdAttribution(options.attribution);
  const startedAt = new Date();
  const start = performance.now();
  let attribution: ArtifactAttribution | null = null;
  let result: T;
  try {
    result = await scenario();
    if (options.autoFlush !== false) flush();
  } finally {
    if (release !== undefined) {
      attribution = readAttribution();
      release();
    }
    capture.stop();
  }

  return {
    result,
    artifact: {
      formatVersion: ARTIFACT_FORMAT_VERSION,
      scenario: options.scenario,
      capturedAt: startedAt.toISOString(),
      timeOrigin: performance.timeOrigin,
      durationMs: performance.now() - start,
      diagnostics: [...capture.events],
      attribution,
    },
  };
}
