/**
 * The console sink for barq's diagnostics.
 *
 * `emitDiagnostic` returns before it builds an event when nothing is
 * subscribed. That makes a diagnostic free in production, and silent wherever
 * nothing subscribes. The development entry installs this subscriber, so
 * `HYDRATION_MISMATCH`, `BIND_TARGET_NOT_WRITABLE`, `RENDER_SUBTREE_NOT_OWNED`,
 * `BLOCK_EVALUATED_TWICE` and `FUNCTION_AS_ATTRIBUTE` reach the console.
 *
 * Nothing in the production graph imports this module, so it costs a
 * production bundle no bytes and no subscription.
 */

import { DEV, type DiagnosticEvent } from "./signals.ts";

/**
 * Subscribe the console to the diagnostics channel and answer with the
 * unsubscribe.
 *
 * One line per distinct `(code, message)`: a diagnostic raised from a row or an
 * effect fires once per row and once per run, and a second copy adds nothing
 * to the first.
 */
export function installDevConsole(): () => void {
  const seen = new Set<string>();
  return DEV.diagnostics.subscribe((event: DiagnosticEvent): void => {
    const key = `${event.code}\n${event.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    const line = `[barq] ${event.code}: ${event.message}`;
    if (event.severity === "error") {
      console.error(line);
    } else {
      console.warn(line);
    }
  });
}
