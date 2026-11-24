/**
 * The console sink for barq's diagnostics.
 *
 * `emitDiagnostic` returns before it builds an event when nothing will hear it.
 * That makes a diagnostic free in production, and silent wherever nothing
 * subscribes. The development entry installs this reporter, so
 * `HYDRATION_MISMATCH`, `BIND_TARGET_NOT_WRITABLE`, `RENDER_SUBTREE_NOT_OWNED`,
 * `BLOCK_EVALUATED_TWICE` and `FUNCTION_AS_ATTRIBUTE` reach the console in the
 * shape the engine prints its own findings in, and both end with where the
 * repair is written down.
 *
 * Nothing in the production graph imports this module, so it costs a
 * production bundle no bytes and no subscription.
 */

import {
  DEV as ENGINE_DEV,
  type DiagnosticCode,
  type DiagnosticSubject,
  setConsoleFooter,
} from "@solidjs/signals";

import { type BarqDiagnosticCode, type DiagnosticEvent, setDiagnosticReporter } from "./signals.ts";

/** barq's own codes, which this module prints; the engine prints the rest. */
const OURS: Record<BarqDiagnosticCode, true> = {
  BIND_TARGET_NOT_WRITABLE: true,
  BLOCK_EVALUATED_TWICE: true,
  DELEGATED_EVENT_DOES_NOT_BUBBLE: true,
  FUNCTION_AS_ATTRIBUTE: true,
  HYDRATION_MISMATCH: true,
  HYDRATION_SEED_DRIFT: true,
  LATE_HEADER_WRITE: true,
  RENDER_SUBTREE_NOT_OWNED: true,
  SERVER_FUNCTION_FAILED: true,
  SSR_RENDER_ERROR_CONTAINED: true,
};

const SKILL = "@barqjs/core/skills/diagnostics/SKILL.md";
const SKILL_URL =
  "https://github.com/salamaashoush/barq/blob/main/packages/core/skills/diagnostics/SKILL.md";
const LOOP_SKILL = "@barqjs/diagnostics/skills/agent-loops/SKILL.md";

interface GlobalWithLocation {
  location?: PartialLocation;
}

interface PartialLocation {
  origin?: string;
}

/**
 * The `at` line's target. In a browser the development server serves the
 * project root at the page's origin, so the position is printed as a URL the
 * console links to the source; anywhere else, and for a path outside the root,
 * it is the path as compiled.
 */
function locationOf(loc: string): string {
  const origin = (globalThis as GlobalWithLocation).location?.origin;
  if (origin === undefined || origin === "null" || loc.startsWith("..") || loc.startsWith("/")) {
    return loc;
  }
  return `${origin}/${loc}`;
}

/**
 * The console text of one finding: the code and message, then the component
 * path and the source position, one per line, each when the event has it.
 */
export function formatDiagnostic(event: DiagnosticEvent): string {
  let text = event.message.startsWith(`[${event.code}]`)
    ? event.message
    : `[${event.code}] ${event.message}`;
  if (event.ownerPath !== undefined && event.ownerPath.length > 0) {
    text += `\n  in ${event.ownerPath.join(" › ")}`;
  }
  if (event.loc !== undefined) text += `\n  at ${locationOf(event.loc)}`;
  return text;
}

/**
 * What the first report of a code ends with: the page for a person, and the
 * repair guide for an agent, as the file installed beside the application and
 * as the same file on the web. A finding about cost also names where the
 * evidence behind it can be captured.
 */
export function diagnosticFooter(event: DiagnosticEvent): string {
  const anchor = `#${event.code.toLowerCase()}`;
  const docs =
    event.docs ??
    (Object.hasOwn(OURS, event.code)
      ? undefined
      : ENGINE_DEV?.guideUrl(event.code as DiagnosticCode));
  let text = "";
  if (docs !== undefined) text += `[${event.code}] what it means and how to fix it: ${docs}\n`;
  text += `[${event.code}] agent repair guide: node_modules/${SKILL}${anchor} (${SKILL_URL}${anchor})`;
  if (event.kind === "perf" || event.kind === "graph" || event.kind === "responsiveness") {
    text +=
      `\n[${event.code}] deeper evidence: captureArtifact() from "@barqjs/diagnostics" records ` +
      `why each scope re-ran and what it cost: node_modules/${LOOP_SKILL}`;
  }
  return text;
}

/**
 * Install the console reporter and answer with the uninstall.
 *
 * One entry per distinct `(code, message, owner path)`: a diagnostic raised
 * from a row or an effect fires once per row and once per run, and a second
 * copy adds nothing to the first.
 */
export function installDevConsole(): () => void {
  const seen = new Set<string>();
  const footed = new Set<string>();
  setDiagnosticReporter((event, subject) => {
    const key = `${event.code}\n${event.message}\n${event.ownerPath?.join(">") ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    let text = formatDiagnostic(event);
    if (!footed.has(event.code)) {
      footed.add(event.code);
      text += `\n${diagnosticFooter(event)}`;
    }
    const element = elementOf(subject);
    const parts = element === undefined ? [text] : [text, element];
    if (event.severity === "error") {
      console.error(...parts);
    } else {
      console.warn(...parts);
    }
  });
  // The engine prints its own findings. The footer is the seam it leaves for
  // the runtime above it to name where the fix is documented, once per code.
  const engine = ENGINE_DEV;
  if (engine !== undefined) {
    setConsoleFooter((event) =>
      Object.hasOwn(OURS, event.code) ? undefined : diagnosticFooter(event),
    );
  }
  return () => {
    setDiagnosticReporter(null);
    if (engine !== undefined) setConsoleFooter(undefined);
  };
}

interface DevElementCarrier {
  _devElement?: unknown;
}

/** The element a compiled binding writes, which a browser console can point at. */
function elementOf(subject: DiagnosticSubject | null | undefined): unknown {
  if (typeof subject !== "object" || subject === null) return undefined;
  return (subject as DevElementCarrier)._devElement;
}
