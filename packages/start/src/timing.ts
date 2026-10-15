/**
 * `Server-Timing` entries for the development server: how long a page's
 * `beforeLoad`, its awaited loaders and its render took, and how long a server
 * function ran. The browser's network panel shows them under Timing.
 *
 * Callers gate on `isDev`, a literal `false` in a production build, so none of
 * this reaches a production response.
 */

/** A clock that starts now and reads off one `Server-Timing` entry per phase. */
export interface ServerTiming {
  /** Close the phase that began at the last call (or at the start) under `name`. */
  phase(name: string, description: string): void;
  /** The header value, or `""` when nothing was measured. */
  header(): string;
}

export function serverTiming(): ServerTiming {
  const entries: string[] = [];
  let from = performance.now();
  return {
    phase(name, description) {
      const now = performance.now();
      entries.push(`${name};dur=${(now - from).toFixed(1)};desc=${JSON.stringify(description)}`);
      from = now;
    },
    header: () => entries.join(", "),
  };
}
