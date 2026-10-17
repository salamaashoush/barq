/**
 * Where a render hears that a `lazy()` module rendered, so the page it writes
 * can carry that module's assets. A server render installs one; in the browser
 * nothing does and a report is dropped.
 */

export interface ModuleSink {
  /** A `lazy()` module that rendered, by the URL the bundler gave it. */
  module?(url: string): void;
}

let SINK: ModuleSink | null = null;

/** Tell the render a `lazy()` module rendered, so its assets reach the page. */
export function reportModule(url: string): void {
  SINK?.module?.(url);
}

/** Install a render's module sink. Returns the previous one. */
export function setModuleSink(sink: ModuleSink | null): ModuleSink | null {
  const previous = SINK;
  SINK = sink;
  return previous;
}
