/**
 * The development server's side of server diagnostics.
 *
 * The application's server code runs in Vite's module runner, with its own copy
 * of `@barqjs/core` and the engine's development build. What it reports there
 * (an error a stream contained after the shell, a server function that threw,
 * a header written after the response went out, the engine's own findings
 * during a render) is printed in the terminal and reaches no page. This
 * subscribes to that channel and hands each finding to the overlay, with its
 * stack mapped back to source.
 *
 * Imported by the Vite plugin only, so none of it reaches a production server.
 */

import { reportServerDiagnostic } from "@barqjs/compiler/vite";
import type { ViteDevServer } from "vite";

import type { ServerFnThrown } from "./client.ts";

/** The finding as the runtime's channel delivers it, as far as this reads it. */
interface ChannelEvent {
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
  docs?: string;
  ownerPath?: string[];
  data?: Record<string, unknown>;
}

interface RunnerCore {
  DEV: { diagnostics: { subscribe(listener: (event: ChannelEvent) => void): () => void } };
}

export interface ServerDiagnostics {
  /** Subscribe once to the runner's channel; every request awaits it first. */
  readonly ready: () => Promise<void>;
  /** What a failed server function tells its caller in development. */
  readonly revealError: (error: unknown) => ServerFnThrown;
}

export function serverDiagnostics(
  server: ViteDevServer,
  load: (specifier: string) => Promise<unknown>,
): ServerDiagnostics {
  const fix = (error: unknown): void => {
    if (!(error instanceof Error)) return;
    try {
      server.ssrFixStacktrace(error);
    } catch {
      // A stack this cannot map is still worth showing as it is.
    }
  };
  let subscribed: Promise<void> | undefined;
  return {
    ready: () => {
      subscribed ??= load("@barqjs/core").then(
        (core) => {
          (core as RunnerCore).DEV.diagnostics.subscribe((event) => {
            if (event.severity === "info") return;
            const error = event.data?.error;
            fix(error);
            reportServerDiagnostic(server, {
              code: event.code,
              severity: event.severity,
              message: event.message,
              docs: event.docs,
              ownerPath: event.ownerPath,
              error,
            });
          });
        },
        (error: unknown) => {
          // Without the channel the pages still render; the overlay just
          // does not hear the server.
          server.config.logger.warn(
            `[barq-start] The development overlay will not show server errors: \`@barqjs/core\` could not be loaded in the server environment (${String(error)}).`,
          );
        },
      );
      return subscribed;
    },
    revealError: (error) => {
      fix(error);
      if (error instanceof Error) {
        return { name: error.name, message: error.message, stack: error.stack };
      }
      return { name: "Error", message: String(error) };
    },
  };
}
