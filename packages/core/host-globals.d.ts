// What every host barq runs on provides, a browser, Bun, Node, Deno or a
// worker. `tsconfig.no-dom.json` checks core against these in place of
// `lib.dom`, so core may use these and nothing else a document has.

declare const console: {
  error(...data: unknown[]): void;
  warn(...data: unknown[]): void;
};

declare function queueMicrotask(callback: () => void): void;

declare function setTimeout(handler: () => void, timeout?: number): unknown;

interface AbortSignal {
  readonly aborted: boolean;
  readonly reason: unknown;
}

declare class AbortController {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}
