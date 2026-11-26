import type { Transport } from "@codemirror/lsp-client";

export type { Transport } from "@codemirror/lsp-client";

/** What `portTransport` needs: a `Worker`, a `MessagePort`, a `BroadcastChannel`. */
export interface MessagePortLike {
  postMessage(message: string): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  start?(): void;
}

type Listener = (value: string) => void;

/**
 * A language server's connection over `postMessage`, one JSON-RPC message
 * per post: a server in a `Worker`, or behind a `MessagePort`.
 *
 * ```ts
 * const transport = portTransport(new Worker(new URL("./server.ts", import.meta.url), { type: "module" }));
 * ```
 *
 * A message the server posts as an object rather than a string is taken
 * as it is. Another carrier, a WebSocket say, fits the same `Transport`
 * shape: `send`, `subscribe` and `unsubscribe`, with strings.
 */
export function portTransport(port: MessagePortLike): Transport {
  const listeners = new Map<Listener, (event: MessageEvent) => void>();
  let started = false;
  return {
    send: (message) => port.postMessage(message),
    subscribe: (handler) => {
      function receive(event: MessageEvent): void {
        const data: unknown = event.data;
        handler(typeof data === "string" ? data : JSON.stringify(data));
      }
      listeners.set(handler, receive);
      port.addEventListener("message", receive);
      if (!started) {
        started = true;
        port.start?.();
      }
    },
    unsubscribe: (handler) => {
      const receive = listeners.get(handler);
      if (receive === undefined) return;
      listeners.delete(handler);
      port.removeEventListener("message", receive);
    },
  };
}
