/**
 * The in-page half: capture control on a global, so a driver outside the page
 * can open and close the same session `captureArtifact` runs in process.
 *
 * This module has to be bundled with the app, because it needs the app's own
 * `@solidjs/signals` instance.
 */
import { DEV, type DiagnosticCapture } from "@barqjs/core";
import { OBSERVE, flush } from "@solidjs/signals";
import { attribution as engine, costs, feedback, why } from "@solidjs/signals/attribution";

import { artifactFromPayload } from "./artifact.ts";
import { PRODUCTION_BUILD_MESSAGE, holdAttribution, readAttribution } from "./capture.ts";
import {
  DIAGNOSTICS_ENDPOINT,
  DIAGNOSTICS_REQUEST_EVENT,
  DIAGNOSTICS_RESPONSE_EVENT,
} from "./protocol.ts";
import type {
  DiagnosticsMethod,
  DiagnosticsMethods,
  DiagnosticsRequest,
  DiagnosticsResponse,
} from "./protocol.ts";
import type {
  AttributionCostTables,
  AttributionFeedbackTables,
  BridgeBeginOptions,
  BridgePayload,
  DiagnosticsArtifact,
  HoldEvent,
  RerunEvent,
} from "./types.ts";

export type { BridgeBeginOptions, BridgePayload } from "./types.ts";

export const BRIDGE_GLOBAL = "__BARQ_DIAGNOSTICS__" as const;

export interface DiagnosticsBridge {
  begin(options?: BridgeBeginOptions): void;
  end(): BridgePayload;
  active(): boolean;
  /** Re-runs of one scope, by name, in the open session. */
  whyDidRun(name: string): RerunEvent[];
  /** The open session's tables so far, without closing it. */
  costs(): AttributionCostTables;
  holds(): HoldEvent[];
  feedback(): AttributionFeedbackTables;
}

/**
 * Put a value through what a page boundary allows: functions, cycles and host
 * objects are dropped, so handing a capture across cannot fail after it
 * succeeded.
 */
function toSerializable<T>(value: T): T {
  // Ancestors of the current value only: a shared reference is not a cycle.
  const ancestors: object[] = [];
  return JSON.parse(
    JSON.stringify(value, function (this: object, _key: string, entry: unknown) {
      if (typeof entry === "function" || typeof entry === "symbol") return undefined;
      if (typeof entry === "bigint") return String(entry);
      if (typeof entry === "object" && entry !== null) {
        while (ancestors.length > 0 && ancestors.at(-1) !== this) ancestors.pop();
        if (ancestors.includes(entry)) return undefined;
        ancestors.push(entry);
      }
      return entry;
    }),
  ) as T;
}

interface Session {
  capture: DiagnosticCapture;
  /** `undefined` when the session was begun with attribution off. */
  release: (() => void) | undefined;
  scenario: string | undefined;
  startedAt: Date;
  start: number;
}

export function installDiagnosticsBridge(
  target: Record<string, unknown> = globalThis,
): DiagnosticsBridge {
  if (OBSERVE === undefined) throw new Error(PRODUCTION_BUILD_MESSAGE);

  let session: Session | null = null;

  function attributed(caller: string): void {
    if (session === null) {
      throw new Error(`Diagnostics bridge ${caller}() needs an open session; call begin() first.`);
    }
    if (session.release === undefined) {
      throw new Error(
        `Diagnostics bridge ${caller}() needs attribution; the open session was begun with it off.`,
      );
    }
  }

  const bridge: DiagnosticsBridge = {
    begin(options = {}) {
      if (session !== null) {
        throw new Error("Diagnostics bridge capture already active; call end() first.");
      }
      session = {
        capture: DEV.diagnostics.capture(),
        release: holdAttribution(options.attribution),
        scenario: options.scenario,
        startedAt: new Date(),
        start: performance.now(),
      };
    },
    end() {
      if (session === null) {
        throw new Error("Diagnostics bridge capture not active; call begin() first.");
      }
      const closing = session;
      session = null;
      let attribution: BridgePayload["attribution"] = null;
      try {
        flush();
      } finally {
        if (closing.release !== undefined) {
          attribution = readAttribution();
          closing.release();
        }
        closing.capture.stop();
      }
      return toSerializable({
        scenario: closing.scenario,
        capturedAt: closing.startedAt.toISOString(),
        timeOrigin: performance.timeOrigin,
        durationMs: performance.now() - closing.start,
        diagnostics: [...closing.capture.events],
        attribution,
      });
    },
    active() {
      return session !== null;
    },
    whyDidRun(name) {
      attributed("whyDidRun");
      return toSerializable(why(name));
    },
    costs() {
      attributed("costs");
      return toSerializable(costs());
    },
    holds() {
      attributed("holds");
      return toSerializable([...engine.history("hold")]);
    },
    feedback() {
      attributed("feedback");
      return toSerializable(feedback());
    },
  };

  target[BRIDGE_GLOBAL] = bridge;
  return bridge;
}

/** Answer one protocol request against a bridge. A throw becomes the response's `error`. */
export function answerDiagnosticsRequest(
  bridge: DiagnosticsBridge,
  request: DiagnosticsRequest,
): DiagnosticsResponse {
  try {
    return { id: request.id, result: dispatch(bridge, request) };
  } catch (error) {
    return { id: request.id, error: error instanceof Error ? error.message : String(error) };
  }
}

interface UncheckedWhyDidRunParams {
  name?: unknown;
}

function dispatch(
  bridge: DiagnosticsBridge,
  request: DiagnosticsRequest,
): DiagnosticsMethods[DiagnosticsMethod]["result"] {
  switch (request.method) {
    case "begin":
      bridge.begin(request.params as BridgeBeginOptions | undefined);
      return true;
    case "end":
      return bridge.end();
    case "active":
      return bridge.active();
    case "whyDidRun": {
      const name = (request.params as UncheckedWhyDidRunParams | undefined)?.name;
      if (typeof name !== "string") throw new Error('whyDidRun needs params { "name": string }.');
      return bridge.whyDidRun(name);
    }
    case "costs":
      return bridge.costs();
    case "holds":
      return bridge.holds();
    case "feedback":
      return bridge.feedback();
    default:
      throw new Error(`Unknown diagnostics method: ${String(request.method)}`);
  }
}

/** The part of `import.meta.hot` the bridge talks through. */
export interface HotChannel {
  on(event: string, listener: (request: DiagnosticsRequest) => void): void;
  send(event: string, response: DiagnosticsResponse): void;
}

/**
 * Answer the dev server's requests from this page:
 * `connectDiagnosticsBridge(installDiagnosticsBridge(), import.meta.hot)`.
 * The Vite plugin's injected module does this for an app with an `index.html`.
 */
export function connectDiagnosticsBridge(bridge: DiagnosticsBridge, hot: HotChannel): void {
  hot.on(DIAGNOSTICS_REQUEST_EVENT, (request) => {
    hot.send(DIAGNOSTICS_RESPONSE_EVENT, answerDiagnosticsRequest(bridge, request));
  });
}

export interface PublishRequestInit {
  method: "POST";
  headers: Record<string, string>;
  body: string;
}

export interface PublishResponse {
  ok: boolean;
  status: number;
}

export interface PublishOptions {
  scenario?: string;
  /** Where to post. Defaults to the dev server's endpoint on the page's origin. */
  endpoint?: string;
  fetch?: (url: string, init: PublishRequestInit) => Promise<PublishResponse>;
}

/**
 * Post a finished capture to the dev server, where `GET` on the endpoint
 * serves it to whoever asks next.
 */
export async function publishArtifact(
  payload: BridgePayload,
  options: PublishOptions = {},
): Promise<DiagnosticsArtifact> {
  const artifact = artifactFromPayload(payload, options.scenario);
  const endpoint = options.endpoint ?? DIAGNOSTICS_ENDPOINT;
  const post = options.fetch ?? ((url, init) => fetch(url, init));
  const response = await post(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(artifact),
  });
  if (!response.ok) {
    throw new Error(`Posting the artifact to ${endpoint} failed with status ${response.status}.`);
  }
  return artifact;
}
