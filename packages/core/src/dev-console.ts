/**
 * The console sink for barq's diagnostics.
 *
 * `emitDiagnostic` returns before it builds an event when nothing will hear it.
 * That makes a diagnostic free in production, and silent wherever nothing
 * subscribes. The development entry installs this reporter, so
 * `HYDRATION_MISMATCH`, `BIND_TARGET_NOT_WRITABLE`, `RENDER_SUBTREE_NOT_OWNED`,
 * `BLOCK_EVALUATED_TWICE` and `FUNCTION_AS_ATTRIBUTE` reach the console, and
 * the engine's own findings carry the address of their repair guide.
 *
 * Nothing in the production graph imports this module, so it costs a
 * production bundle no bytes and no subscription.
 */

import { DEV as ENGINE_DEV, setConsoleFooter } from "@solidjs/signals";

import { type BarqDiagnosticCode, type DiagnosticEvent, setDiagnosticReporter } from "./signals.ts";

/** barq's own codes, which print their page themselves and take no engine footer. */
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

/**
 * The console text of one finding: the code and message, then where it
 * happened and the page that explains it, one per line.
 */
export function formatDiagnostic(event: DiagnosticEvent): string {
  let text = `[barq] ${event.code}: ${event.message}`;
  if (event.ownerPath !== undefined && event.ownerPath.length > 0) {
    text += `\n  in ${event.ownerPath.join(" › ")}`;
  }
  if (event.docs !== undefined) text += `\n  docs: ${event.docs}`;
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
  setDiagnosticReporter((event) => {
    const key = `${event.code}\n${event.message}\n${event.ownerPath?.join(">") ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    const line = formatDiagnostic(event);
    if (event.severity === "error") {
      console.error(line);
    } else {
      console.warn(line);
    }
  });
  // The engine prints its own findings. The footer is the seam it leaves for
  // the runtime above it to name where the fix is documented, once per code.
  const engine = ENGINE_DEV;
  if (engine !== undefined) {
    setConsoleFooter((event) =>
      Object.hasOwn(OURS, event.code) ? undefined : `  docs: ${engine.guideUrl(event.code)}`,
    );
  }
  return () => {
    setDiagnosticReporter(null);
    if (engine !== undefined) setConsoleFooter(undefined);
  };
}
