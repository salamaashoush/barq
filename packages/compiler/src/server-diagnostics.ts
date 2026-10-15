/**
 * What the server reported, carried to the overlay in the browser.
 *
 * A server render and a server function fail where no page is listening: the
 * error is printed in the terminal and the browser sees a fallback or a status.
 * The development server hands each such report here, and the overlay shows it
 * beside the page's own, with the server's stack mapped to source and a click
 * through to the line.
 *
 * A report raised while no page is connected, which is every error in a page's
 * own first render, is kept and sent to the next page that connects. An edit is
 * the attempt at a fix, so a changed file forgets them, and so does the
 * overlay's Clear.
 */

import { readFileSync } from "node:fs";

import { frameAround, type OverlayLocation, type OverlayServerEntry } from "./overlay.ts";

export const SERVER_DIAGNOSTICS_EVENT = "barq:server-diagnostics";
export const SERVER_DIAGNOSTICS_CLEAR = "barq:server-diagnostics:clear";

/** The slice of a Vite dev server this needs. */
export interface ServerDiagnosticsHost {
  hot: { send(payload: { type: "custom"; event: string; data: unknown }): void };
  config: { root: string };
}

/** A finding as the server's runtime raised it, or an error the server caught. */
export interface ServerReport {
  code?: string;
  severity?: "info" | "warn" | "warning" | "error";
  message?: string;
  docs?: string;
  ownerPath?: string[];
  /** Its stack is what the overlay lists; already mapped to source by the caller. */
  error?: unknown;
}

const KEPT = 50;
const kept = new WeakMap<object, OverlayServerEntry[]>();

const FRAME =
  /^\s*at\s+(?:(.*?)\s+\()?(?:file:\/\/)?(\/[^():]+|[A-Za-z]:\\[^():]+):(\d+):(\d+)\)?\s*$/;

/** The frames of a server stack, own code marked apart from a dependency's. */
export function stackFrames(stack: string, root: string): OverlayLocation[] {
  const frames: OverlayLocation[] = [];
  for (const line of stack.split("\n")) {
    const match = FRAME.exec(line);
    if (match === null) continue;
    const file = match[2] ?? "";
    frames.push({
      file,
      line: Number(match[3]),
      column: Number(match[4]),
      name: match[1] || undefined,
      library: file.includes("/node_modules/") || !file.startsWith(root),
    });
    if (frames.length === 12) break;
  }
  return frames;
}

function levelOf(severity: ServerReport["severity"]): OverlayServerEntry["severity"] {
  if (severity === "info") return "note";
  if (severity === "warn" || severity === "warning") return "warning";
  return "error";
}

/** The entry the overlay shows for `report`, with the frame of the first line of project code. */
export function serverEntry(report: ServerReport, root: string): OverlayServerEntry {
  const error = report.error instanceof Error ? report.error : undefined;
  const message =
    report.message ??
    (error !== undefined ? `${error.name}: ${error.message}` : String(report.error));
  const entry: OverlayServerEntry = {
    code: report.code,
    severity: levelOf(report.severity),
    message,
    docs: report.docs,
    ownerPath: report.ownerPath,
  };
  const stack = error?.stack === undefined ? [] : stackFrames(error.stack, root);
  if (stack.length === 0) return entry;
  entry.stack = stack;
  const own = stack.find((frame) => !frame.library) ?? stack[0];
  if (own !== undefined) {
    entry.at = own;
    try {
      entry.frame = frameAround(readFileSync(own.file, "utf8"), own.line);
    } catch {
      // A frame in a file that is gone, or virtual: the location still opens.
    }
  }
  return entry;
}

/** Show `report` in every connected page's overlay, and in the next one to connect. */
export function reportServerDiagnostic(server: ServerDiagnosticsHost, report: ServerReport): void {
  const entry = serverEntry(report, server.config.root);
  const list = kept.get(server) ?? [];
  list.push(entry);
  if (list.length > KEPT) list.splice(0, list.length - KEPT);
  kept.set(server, list);
  server.hot.send({ type: "custom", event: SERVER_DIAGNOSTICS_EVENT, data: entry });
}

/** Send what is kept to a page that has just connected. */
export function replayServerDiagnostics(server: ServerDiagnosticsHost): void {
  for (const entry of kept.get(server) ?? []) {
    server.hot.send({ type: "custom", event: SERVER_DIAGNOSTICS_EVENT, data: entry });
  }
}

export function clearServerDiagnostics(server: ServerDiagnosticsHost): void {
  kept.delete(server);
}
