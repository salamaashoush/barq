import type * as lsp from "vscode-languageserver-protocol";

/** What `serveLanguageServer` needs of where it runs: a worker's `self`, a `MessagePort`. */
export interface ServerPort {
  postMessage(message: string): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  start?(): void;
}

/** A document the client opened, at the version it last sent. */
export interface ServedDocument {
  uri: string;
  languageId: string;
  version: number;
  text: string;
}

/** What a handler has of the connection while it answers. */
export interface ServerContext {
  /** Every document the client holds open, by URI. */
  readonly documents: ReadonlyMap<string, ServedDocument>;
  /** Aborts when the client cancels the request being answered. */
  readonly signal: AbortSignal;
  notify: (method: string, params: unknown) => void;
  /** Asks the client: `workspace/applyEdit`, `window/workDoneProgress/create`. */
  request<Result>(method: string, params: unknown): Promise<Result>;
}

export type RequestHandler = (params: never, context: ServerContext) => unknown;
export type NotificationHandler = (params: never, context: ServerContext) => void;

/**
 * A language server's behaviour. The documents' lifecycle and their
 * incremental changes are kept for it; `changed` runs after each, for a
 * server that publishes diagnostics as the text moves.
 */
export interface LanguageServerDefinition {
  /** Merged over the document sync the connection does itself. */
  capabilities: lsp.ServerCapabilities | ((params: lsp.InitializeParams) => lsp.ServerCapabilities);
  serverInfo?: lsp.InitializeResult["serverInfo"];
  /** By method: `textDocument/hover`, `textDocument/completion`, ... */
  requests?: Readonly<Record<string, RequestHandler>>;
  notifications?: Readonly<Record<string, NotificationHandler>>;
  changed?(document: ServedDocument, context: ServerContext): void;
  closed?(uri: string, context: ServerContext): void;
}

/** A JSON-RPC error as it travels. */
export interface WireError {
  code: number;
  message: string;
  data?: unknown;
}

interface Message {
  jsonrpc: "2.0";
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: WireError;
}

interface CancelParams {
  id: number | string;
}

interface Waiting {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/** JSON-RPC's own error codes, and LSP's for a cancelled request. */
const METHOD_NOT_FOUND = -32601;
const INTERNAL_ERROR = -32603;
const REQUEST_CANCELLED = -32800;

/** The offset in `text` of an LSP position, counted in UTF-16 units as JavaScript counts. */
export function offsetAt(text: string, position: lsp.Position): number {
  let offset = 0;
  for (let line = 0; line < position.line; line++) {
    const end = text.indexOf("\n", offset);
    if (end < 0) return text.length;
    offset = end + 1;
  }
  const lineEnd = text.indexOf("\n", offset);
  const length = (lineEnd < 0 ? text.length : lineEnd) - offset;
  return offset + Math.min(Math.max(position.character, 0), length);
}

/** The LSP position of an offset in `text`. */
export function positionAt(text: string, offset: number): lsp.Position {
  const before = text.slice(0, Math.max(0, Math.min(offset, text.length)));
  const lineStart = before.lastIndexOf("\n") + 1;
  let line = 0;
  for (let at = before.indexOf("\n"); at >= 0; at = before.indexOf("\n", at + 1)) line++;
  return { line, character: before.length - lineStart };
}

function applyChange(text: string, change: lsp.TextDocumentContentChangeEvent): string {
  if (!("range" in change)) return change.text;
  const from = offsetAt(text, change.range.start);
  const to = offsetAt(text, change.range.end);
  return text.slice(0, from) + change.text + text.slice(to);
}

export function errorOf(error: unknown): WireError {
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    return error as WireError;
  }
  return { code: INTERNAL_ERROR, message: error instanceof Error ? error.message : String(error) };
}

/**
 * Serves a language server over a port, speaking JSON-RPC 2.0 as the
 * Language Server Protocol frames it, one message per `postMessage`: a
 * server compiled to WebAssembly in a worker, or one written in TypeScript.
 *
 * ```ts
 * // server.ts, run as a module worker
 * import { serveLanguageServer } from "@barqjs/arc/code/worker";
 *
 * serveLanguageServer(self, {
 *   capabilities: { hoverProvider: true },
 *   requests: {
 *     "textDocument/hover": (params: HoverParams, { documents }) => ({ contents: "..." }),
 *   },
 *   changed: (document, { notify }) =>
 *     notify("textDocument/publishDiagnostics", { uri: document.uri, diagnostics: check(document.text) }),
 * });
 * ```
 *
 * Initialization, the documents' open, change and close (incremental
 * changes applied), `$/cancelRequest` (the handler's `signal` aborts),
 * shutdown, and the server's own requests to the client are handled here;
 * a request with no handler is answered "method not found".
 */
export function serveLanguageServer(port: ServerPort, server: LanguageServerDefinition): void {
  const documents = new Map<string, ServedDocument>();
  const running = new Map<number | string, AbortController>();
  const waiting = new Map<number | string, Waiting>();
  let next = 0;

  function send(message: Message): void {
    port.postMessage(JSON.stringify(message));
  }

  function contextFor(signal: AbortSignal): ServerContext {
    return {
      documents,
      signal,
      notify: (method, params) => send({ jsonrpc: "2.0", method, params }),
      request<Result>(method: string, params: unknown): Promise<Result> {
        return new Promise<Result>((resolve, reject) => {
          const id = `server-${String(next++)}`;
          waiting.set(id, { resolve: resolve as (value: unknown) => void, reject });
          send({ jsonrpc: "2.0", id, method, params });
        });
      },
    };
  }
  const idle = contextFor(new AbortController().signal);

  function capabilities(params: lsp.InitializeParams): lsp.ServerCapabilities {
    const own =
      typeof server.capabilities === "function" ? server.capabilities(params) : server.capabilities;
    return {
      textDocumentSync: { openClose: true, change: 2 },
      ...own,
    };
  }

  function lifecycle(method: string, params: unknown): boolean {
    if (method === "textDocument/didOpen") {
      const { textDocument } = params as lsp.DidOpenTextDocumentParams;
      const document: ServedDocument = { ...textDocument };
      documents.set(document.uri, document);
      server.changed?.(document, idle);
      return true;
    }
    if (method === "textDocument/didChange") {
      const { textDocument, contentChanges } = params as lsp.DidChangeTextDocumentParams;
      const document = documents.get(textDocument.uri);
      if (document === undefined) return true;
      for (const change of contentChanges) document.text = applyChange(document.text, change);
      document.version = textDocument.version;
      server.changed?.(document, idle);
      return true;
    }
    if (method === "textDocument/didClose") {
      const { textDocument } = params as lsp.DidCloseTextDocumentParams;
      documents.delete(textDocument.uri);
      server.closed?.(textDocument.uri, idle);
      return true;
    }
    if (method === "$/cancelRequest") {
      running.get((params as CancelParams).id)?.abort();
      return true;
    }
    return method === "initialized" || method === "exit";
  }

  async function answer(id: number | string, method: string, params: unknown): Promise<void> {
    if (method === "initialize") {
      const result: lsp.InitializeResult = {
        capabilities: capabilities(params as lsp.InitializeParams),
        ...(server.serverInfo === undefined ? {} : { serverInfo: server.serverInfo }),
      };
      send({ jsonrpc: "2.0", id, result });
      return;
    }
    if (method === "shutdown") {
      send({ jsonrpc: "2.0", id, result: null });
      return;
    }
    const handler = server.requests?.[method];
    if (handler === undefined) {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: METHOD_NOT_FOUND, message: `No handler for ${method}.` },
      });
      return;
    }
    const controller = new AbortController();
    running.set(id, controller);
    try {
      const result = await handler(params as never, contextFor(controller.signal));
      if (controller.signal.aborted) {
        send({ jsonrpc: "2.0", id, error: { code: REQUEST_CANCELLED, message: "Cancelled." } });
      } else {
        send({ jsonrpc: "2.0", id, result: result ?? null });
      }
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id,
        error: controller.signal.aborted
          ? { code: REQUEST_CANCELLED, message: "Cancelled." }
          : errorOf(error),
      });
    } finally {
      running.delete(id);
    }
  }

  port.addEventListener("message", (event: MessageEvent) => {
    const data: unknown = event.data;
    const message = (typeof data === "string" ? JSON.parse(data) : data) as Message;
    const { id, method } = message;
    if (method === undefined) {
      if (id === undefined || id === null) return;
      const found = waiting.get(id);
      if (found === undefined) return;
      waiting.delete(id);
      if (message.error === undefined) found.resolve(message.result);
      else found.reject(message.error);
      return;
    }
    if (id === undefined || id === null) {
      if (lifecycle(method, message.params)) return;
      server.notifications?.[method]?.(message.params as never, idle);
      return;
    }
    void answer(id, method, message.params);
  });
  port.start?.();
}
