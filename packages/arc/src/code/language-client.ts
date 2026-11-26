import { createSignal } from "@barqjs/core";
import {
  LSPClient,
  type LSPClientExtension,
  type Transport,
  signatureHelp,
} from "@codemirror/lsp-client";
import type { Extension } from "@codemirror/state";
import { type EditorView, ViewPlugin } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";

import {
  type ClientContext,
  type PublishedDiagnostics,
  clampedOffset,
  clientContext,
  refreshEffect,
} from "./lsp-context.ts";
import { codeActions } from "./lsp-actions.ts";
import { serverCompletion } from "./lsp-completion.ts";
import { pushDiagnostics, serverDiagnostics } from "./lsp-diagnostics.ts";
import { serverFolding } from "./lsp-folding.ts";
import { serverFormatting } from "./lsp-format.ts";
import { inlayHints } from "./lsp-hints.ts";
import { serverHover } from "./lsp-hover.ts";
import { codeLenses } from "./lsp-lenses.ts";
import { serverNavigation } from "./lsp-navigation.ts";
import { type SemanticTokenClasses, semanticTokens } from "./lsp-semantic.ts";
import { errorOf } from "./lsp-server.ts";
import { LanguageWorkspace } from "./lsp-workspace.ts";

export type ClientStatus = "idle" | "connecting" | "ready" | "failed" | "closed";

/** A message the server wants the user to see. */
export interface ServerMessage {
  type: "error" | "warning" | "info" | "log";
  message: string;
}

/** Work the server reports while it runs: an index, a build. */
export interface ProgressTask {
  token: lsp.ProgressToken;
  title: string;
  message?: string;
  /** From 0 to 100, when the server knows how far along it is. */
  percentage?: number;
  cancellable: boolean;
}

/** Which editor features a client turns on; each is on unless set to `false`. */
export interface LanguageFeatures {
  completion?: boolean;
  hover?: boolean;
  signatureHelp?: boolean;
  diagnostics?: boolean;
  semanticTokens?: boolean;
  inlayHints?: boolean;
  codeLens?: boolean;
  codeActions?: boolean;
  folding?: boolean;
  formatting?: boolean;
  /** Definition, references and rename. */
  navigation?: boolean;
}

export type ServerRequestHandler = (params: never) => unknown;

/** Where a client's server is: connected now, once a promise settles, or on first use. */
export type TransportSource =
  | Transport
  | Promise<Transport>
  | (() => Transport | Promise<Transport>);

export interface LanguageClientOptions {
  /**
   * The connection to the server. A function is called when the first
   * file opens, so a page whose editors never open one starts no server.
   */
  transport: TransportSource;
  /** The project's root, as the server sees it: `file:///project/`. */
  rootUri?: string;
  initializationOptions?: unknown;
  /** The language a file opened with `open` is in. @default the editor's language name */
  languageId?: string;
  /** Milliseconds before a request that has had no answer fails. @default 10000 */
  timeout?: number;
  features?: LanguageFeatures;
  /** Token types and modifiers to class names, over arc's; see `semanticTokenClasses`. */
  semanticTokenClasses?: SemanticTokenClasses;
  /**
   * Show another file, at `range` when the server gave one: switch to its
   * tab, open an editor on it. Once an editor opens that file, the client
   * selects the range itself.
   */
  onNavigate?: (uri: string, range: lsp.Range | undefined) => void;
  /** The server changed a file no editor shows, by a rename or a fix: keep the app's copy. */
  onEdit?: (uri: string, text: string) => void;
  /** `window/showMessage`. A dialog at the top of the editor when left out. */
  onMessage?: (message: ServerMessage) => void;
  /**
   * A command from a code lens or a code action. `true` when the app ran
   * it; otherwise the server runs it with `workspace/executeCommand`.
   */
  onCommand?: (command: lsp.Command) => boolean | Promise<boolean>;
  /** Answers `workspace/configuration` for each section the server asks about. */
  configuration?: (section: string | undefined, scopeUri: string | undefined) => unknown;
  /** More requests the server makes of the client, by method. */
  requests?: Readonly<Record<string, ServerRequestHandler>>;
  /** More notifications from the server, by method. */
  notifications?: Readonly<Record<string, (params: never) => void>>;
  /** A request that failed. Features treat a failure as no answer either way. */
  onError?: (error: unknown) => void;
}

/**
 * A connection to a language server, for every editor and file of a
 * project: what `languageClient` returns.
 */
export interface LanguageClient {
  /** The editor extension for one file: give it to `CodeEditor`'s `extensions`. */
  document(uri: string, languageId?: string): Extension;
  /** Opens a file no editor shows, so the server answers across it: a project's other files. */
  open(uri: string, text: string, languageId?: string): void;
  /** New text for a file opened with `open` while no editor shows it. */
  update(uri: string, text: string): void;
  close(uri: string): void;
  status(): ClientStatus;
  /** What the server said it can do, once it has. */
  capabilities(): lsp.ServerCapabilities | null;
  /** Every file's latest diagnostics: what a problems panel lists. */
  diagnostics(): readonly PublishedDiagnostics[];
  /** A file's symbols, asked for on first read and again after each change: what `OutlineView` shows. */
  symbols(uri: string): readonly lsp.DocumentSymbol[] | undefined;
  progress(): readonly ProgressTask[];
  cancelProgress(token: lsp.ProgressToken): void;
  /** Shows a file at a range, as go to definition does. */
  navigate(uri: string, range?: lsp.Range): void;
  applyEdit(edit: lsp.WorkspaceEdit): Promise<boolean>;
  executeCommand(command: lsp.Command): Promise<unknown>;
  request<Result>(method: string, params: object): Promise<Result>;
  notify(method: string, params: unknown): void;
  /** The `@codemirror/lsp-client` client underneath, for anything this does not wrap. */
  readonly client: LSPClient;
  /** Shuts the server down and lets the transport go. */
  dispose(): void;
}

interface Message {
  id?: number | string | null;
  method?: string;
  params?: unknown;
}

type ProgressValue =
  | lsp.WorkDoneProgressBegin
  | lsp.WorkDoneProgressReport
  | lsp.WorkDoneProgressEnd;

interface ProgressNotice {
  token: lsp.ProgressToken;
  value: ProgressValue;
}

type NotificationHandler = (client: LSPClient, params: unknown) => boolean;

const MESSAGE_TYPES: readonly ServerMessage["type"][] = ["error", "warning", "info", "log"];

/**
 * A transport that answers the server's own requests before the client sees
 * them: `@codemirror/lsp-client` answers every one "method not found".
 */
function answering(
  transport: Transport,
  answer: (method: string, params: unknown) => Promise<unknown>,
): Transport {
  const wrapped = new Map<(value: string) => void, (value: string) => void>();
  function reply(id: number | string, body: object): void {
    transport.send(JSON.stringify({ jsonrpc: "2.0", id, ...body }));
  }
  return {
    send: (message) => transport.send(message),
    subscribe: (handler) => {
      function receive(raw: string): void {
        const message = JSON.parse(raw) as Message;
        const { id, method } = message;
        if (method === undefined || id === undefined || id === null) {
          handler(raw);
          return;
        }
        answer(method, message.params).then(
          (result) => reply(id, { result: result ?? null }),
          (error: unknown) => reply(id, { error: errorOf(error) }),
        );
      }
      wrapped.set(handler, receive);
      transport.subscribe(receive);
    },
    unsubscribe: (handler) => {
      const receive = wrapped.get(handler);
      if (receive === undefined) return;
      wrapped.delete(handler);
      transport.unsubscribe(receive);
    },
  };
}

function flatSymbols(found: lsp.SymbolInformation[]): lsp.DocumentSymbol[] {
  return found.map((one) => ({
    name: one.name,
    kind: one.kind,
    range: one.location.range,
    selectionRange: one.location.range,
    ...(one.containerName === undefined ? {} : { detail: one.containerName }),
  }));
}

function viewTracker(views: Set<EditorView>): Extension {
  return ViewPlugin.define((view) => {
    views.add(view);
    return { destroy: () => views.delete(view) };
  });
}

function selectIn(view: EditorView, range: lsp.Range | undefined): void {
  if (range === undefined) {
    view.focus();
    return;
  }
  const doc = view.state.doc;
  view.dispatch({
    selection: { anchor: clampedOffset(doc, range.start), head: clampedOffset(doc, range.end) },
    scrollIntoView: true,
    userEvent: "select.definition",
  });
  view.focus();
}

const CLIENT_CAPABILITIES = {
  textDocument: {
    completion: {
      completionItem: {
        resolveSupport: { properties: ["documentation", "detail", "additionalTextEdits"] },
        labelDetailsSupport: true,
      },
    },
    publishDiagnostics: {
      relatedInformation: true,
      versionSupport: true,
      codeDescriptionSupport: true,
      tagSupport: { valueSet: [1, 2] },
    },
    rangeFormatting: {},
    onTypeFormatting: {},
    semanticTokens: {
      requests: { full: true },
      tokenTypes: [
        "namespace",
        "type",
        "class",
        "enum",
        "interface",
        "struct",
        "typeParameter",
        "parameter",
        "variable",
        "property",
        "enumMember",
        "event",
        "function",
        "method",
        "macro",
        "keyword",
        "modifier",
        "comment",
        "string",
        "number",
        "regexp",
        "operator",
        "decorator",
      ],
      tokenModifiers: [
        "declaration",
        "definition",
        "readonly",
        "static",
        "deprecated",
        "abstract",
        "async",
        "modification",
        "documentation",
        "defaultLibrary",
      ],
      formats: ["relative"],
      augmentsSyntaxTokens: true,
    },
    codeAction: {
      codeActionLiteralSupport: {
        codeActionKind: {
          valueSet: ["", "quickfix", "refactor", "refactor.extract", "refactor.rewrite", "source"],
        },
      },
      isPreferredSupport: true,
      dataSupport: true,
      resolveSupport: { properties: ["edit"] },
    },
    codeLens: {},
    inlayHint: {},
    foldingRange: { lineFoldingOnly: false },
    documentSymbol: { hierarchicalDocumentSymbolSupport: true },
  },
  workspace: {
    applyEdit: true,
    configuration: true,
    executeCommand: {},
    codeLens: { refreshSupport: true },
    inlayHint: { refreshSupport: true },
    semanticTokens: { refreshSupport: true },
  },
  window: { workDoneProgress: true },
};

/**
 * A Language Server Protocol client for a project: any server, in a worker
 * or behind a port or a socket, feeding every editor that shows one of its
 * files. Built on `@codemirror/lsp-client`, which keeps the connection,
 * the documents in step (incremental changes, one URI per file) and the
 * positions mapped while answers travel.
 *
 * ```tsx
 * const server = languageClient({
 *   transport: () => portTransport(new Worker(new URL("./server.ts", import.meta.url), { type: "module" })),
 *   rootUri: "file:///project/",
 *   onNavigate: (uri) => setOpenTab(uri),
 * });
 * server.open("file:///project/lib.toy", libSource, "toy");
 *
 * <CodeEditor language="toy" value={main()} onChange={setMain} extensions={server.document("file:///project/main.toy")} />
 * <OutlineView nodes={symbolNodes(server.symbols("file:///project/main.toy") ?? [])} />
 * ```
 *
 * In each editor: completion with snippets and docs fetched as an item is
 * picked, hover in arc's markdown, signature help, diagnostics with their
 * related places and a quick fix, the server's semantic colours over the
 * grammar's, inlay hints, code lenses, code actions (Mod-.), folding,
 * formatting (Shift-Alt-F, as typed too), go to definition (F12,
 * Mod-click), references (Shift-F12) and rename across files (F2).
 * `diagnostics`, `symbols` and `progress` are reactive, for the panels around.
 */
export function languageClient(options: LanguageClientOptions): LanguageClient {
  const [status, setStatus] = createSignal<ClientStatus>("idle", { ownedWrite: true });
  const [capabilities, setCapabilities] = createSignal<lsp.ServerCapabilities | null>(null, {
    ownedWrite: true,
  });
  const [published, setPublished] = createSignal<ReadonlyMap<string, PublishedDiagnostics>>(
    new Map(),
    { ownedWrite: true },
  );
  const [symbolMap, setSymbolMap] = createSignal<
    ReadonlyMap<string, readonly lsp.DocumentSymbol[]>
  >(new Map(), { ownedWrite: true });
  const [progress, setProgress] = createSignal<readonly ProgressTask[]>([], {
    ownedWrite: true,
  });
  // Writes are staged until a flush, so what the next message builds on is kept here.
  const latest = new Map<string, PublishedDiagnostics>();
  const symbolsKnown = new Map<string, readonly lsp.DocumentSymbol[]>();
  let tasks: readonly ProgressTask[] = [];
  let connecting = false;
  let closed = false;
  const asked = new Set<string>();
  const symbolTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const views = new Set<EditorView>();
  const languageIds = new Map<string, string>();
  const features = options.features ?? {};

  function report(error: unknown): void {
    options.onError?.(error);
  }

  /** A request once the server is up: `@codemirror/lsp-client` refuses one before it has a transport. */
  async function ready<Result>(method: string, params: object): Promise<Result> {
    await client.initializing;
    return client.request<object, Result>(method, params);
  }

  function fetchSymbols(uri: string): void {
    ready<lsp.DocumentSymbol[] | lsp.SymbolInformation[] | null>("textDocument/documentSymbol", {
      textDocument: { uri },
    }).then(
      (found) => {
        const list = found ?? [];
        const symbols =
          list.length > 0 && "location" in (list[0] as object)
            ? flatSymbols(list as lsp.SymbolInformation[])
            : (list as lsp.DocumentSymbol[]);
        symbolsKnown.set(uri, symbols);
        setSymbolMap(new Map(symbolsKnown));
      },
      (error: unknown) => report(error),
    );
  }

  function synced(uri: string): void {
    if (!asked.has(uri)) return;
    clearTimeout(symbolTimers.get(uri));
    symbolTimers.set(
      uri,
      setTimeout(() => fetchSymbols(uri), 300),
    );
  }

  function refresh(feature: string): void {
    for (const view of views) view.dispatch({ effects: refreshEffect.of(feature) });
  }

  function publish(params: lsp.PublishDiagnosticsParams): void {
    const entry: PublishedDiagnostics = {
      uri: params.uri,
      version: params.version ?? null,
      diagnostics: params.diagnostics,
    };
    latest.set(params.uri, entry);
    setPublished(new Map(latest));
    const view = workspace.getFile(params.uri)?.view;
    if (view !== null && view !== undefined) pushDiagnostics(view, entry);
  }

  function updateProgress(params: ProgressNotice): void {
    const value = params.value;
    if (value.kind === "end") {
      tasks = tasks.filter((task) => task.token !== params.token);
      setProgress(tasks);
      return;
    }
    const known = tasks.find((task) => task.token === params.token);
    const task: ProgressTask = {
      token: params.token,
      title: value.kind === "begin" ? value.title : (known?.title ?? ""),
      message: value.message ?? known?.message,
      percentage: value.percentage ?? known?.percentage,
      cancellable: value.cancellable ?? known?.cancellable ?? false,
    };
    tasks =
      known === undefined
        ? [...tasks, task]
        : tasks.map((one) => (one.token === params.token ? task : one));
    setProgress(tasks);
  }

  async function answer(method: string, params: unknown): Promise<unknown> {
    const own = options.requests?.[method];
    if (own !== undefined) return own(params as never);
    switch (method) {
      case "workspace/applyEdit": {
        const { edit } = params as lsp.ApplyWorkspaceEditParams;
        const applied = await applyEdit(edit);
        return applied ? { applied } : { applied, failureReason: "A file it edits is not open." };
      }
      case "workspace/configuration": {
        const { items } = params as lsp.ConfigurationParams;
        return items.map((item) => options.configuration?.(item.section, item.scopeUri) ?? null);
      }
      case "window/workDoneProgress/create":
      case "client/registerCapability":
      case "client/unregisterCapability":
        return null;
      case "workspace/codeLens/refresh":
        refresh("codeLens");
        return null;
      case "workspace/inlayHint/refresh":
        refresh("inlayHint");
        return null;
      case "workspace/semanticTokens/refresh":
        refresh("semanticTokens");
        return null;
      case "workspace/workspaceFolders":
        return options.rootUri === undefined ? null : [{ uri: options.rootUri, name: "root" }];
      default:
        throw { code: -32601, message: `The client does not handle ${method}.` };
    }
  }

  const notificationHandlers: Record<string, NotificationHandler> = {
    "textDocument/publishDiagnostics": (_client, params) => {
      publish(params as lsp.PublishDiagnosticsParams);
      return true;
    },
    "$/progress": (_client, params) => {
      updateProgress(params as ProgressNotice);
      return true;
    },
  };
  const onMessage = options.onMessage;
  if (onMessage !== undefined) {
    notificationHandlers["window/showMessage"] = (_client, params) => {
      const shown = params as lsp.ShowMessageParams;
      onMessage({ type: MESSAGE_TYPES[shown.type - 1] ?? "info", message: shown.message });
      return true;
    };
  }
  for (const [method, handler] of Object.entries(options.notifications ?? {})) {
    notificationHandlers[method] = (_client, params) => {
      handler(params as never);
      return true;
    };
  }
  const extension: LSPClientExtension = {
    clientCapabilities: CLIENT_CAPABILITIES,
    notificationHandlers,
  };

  let workspace!: LanguageWorkspace;
  const client = new LSPClient({
    rootUri: options.rootUri,
    initializationOptions: options.initializationOptions,
    timeout: options.timeout ?? 10_000,
    extensions: [extension],
    workspace: (owner) => {
      workspace = new LanguageWorkspace(owner, {
        navigate: (uri, range) => options.onNavigate?.(uri, range),
        edited: (uri, text) => options.onEdit?.(uri, text),
        synced,
        opened: (uri) => {
          if (asked.has(uri)) fetchSymbols(uri);
        },
      });
      return workspace;
    },
  });

  function connect(): void {
    if (connecting) return;
    connecting = true;
    setStatus("connecting");
    const source = options.transport;
    Promise.resolve(typeof source === "function" ? source() : source).then(
      (transport) => {
        if (closed) return;
        client.connect(answering(transport, answer));
        client.initializing.then(
          () => {
            setCapabilities(client.serverCapabilities);
            setStatus("ready");
          },
          (error: unknown) => {
            setStatus("failed");
            report(error);
          },
        );
      },
      (error: unknown) => {
        setStatus("failed");
        report(error);
      },
    );
  }

  if (typeof options.transport !== "function") connect();

  async function applyEdit(edit: lsp.WorkspaceEdit): Promise<boolean> {
    client.sync();
    const byFile = new Map<string, readonly lsp.TextEdit[]>(Object.entries(edit.changes ?? {}));
    let complete = true;
    for (const change of edit.documentChanges ?? []) {
      if ("textDocument" in change) {
        byFile.set(change.textDocument.uri, [
          ...(byFile.get(change.textDocument.uri) ?? []),
          ...change.edits.map((one) => ({
            range: one.range,
            newText: "newText" in one ? one.newText : one.snippet.value,
          })),
        ]);
      } else {
        complete = false;
      }
    }
    for (const [uri, edits] of byFile) {
      const file = workspace.getFile(uri);
      if (file === null) {
        complete = false;
        continue;
      }
      if (edits.length === 0) continue;
      const doc = file.view?.state.doc ?? file.current;
      workspace.updateFile(uri, {
        changes: edits.map((one) => ({
          from: clampedOffset(doc, one.range.start),
          to: clampedOffset(doc, one.range.end),
          insert: one.newText,
        })),
        userEvent: "input.apply",
      });
    }
    return complete;
  }

  async function executeCommand(command: lsp.Command): Promise<unknown> {
    if ((await options.onCommand?.(command)) === true) return null;
    await client.initializing;
    if (client.serverCapabilities?.executeCommandProvider === undefined) return null;
    return ready<unknown>("workspace/executeCommand", {
      command: command.command,
      ...(command.arguments === undefined ? {} : { arguments: command.arguments }),
    });
  }

  function navigate(uri: string, range?: lsp.Range): void {
    void workspace.show(uri, range).then((view) => {
      if (view !== null) selectIn(view, range);
    });
  }

  function languageOf(uri: string): string {
    return languageIds.get(uri) ?? workspace.getFile(uri)?.languageId ?? options.languageId ?? "";
  }

  const context: ClientContext = {
    client,
    workspace,
    languageOf,
    published: (uri) => latest.get(uri),
    navigate,
    applyEdit,
    executeCommand,
    report,
  };

  function document(uri: string, languageId?: string): Extension {
    if (languageId !== undefined) languageIds.set(uri, languageId);
    connect();
    return [
      clientContext.of(context),
      client.plugin(uri, languageId ?? options.languageId),
      viewTracker(views),
      features.completion === false ? [] : serverCompletion(),
      features.hover === false ? [] : serverHover(),
      features.signatureHelp === false ? [] : signatureHelp(),
      features.diagnostics === false ? [] : serverDiagnostics(),
      features.semanticTokens === false ? [] : semanticTokens(options.semanticTokenClasses),
      features.inlayHints === false ? [] : inlayHints(),
      features.codeLens === false ? [] : codeLenses(),
      features.codeActions === false ? [] : codeActions(),
      features.folding === false ? [] : serverFolding(),
      features.formatting === false ? [] : serverFormatting(),
      features.navigation === false ? [] : serverNavigation(),
    ];
  }

  return {
    document,
    open: (uri, text, languageId) => {
      connect();
      workspace.hold(uri, text, languageId ?? options.languageId ?? "");
    },
    update: (uri, text) => workspace.setText(uri, text),
    close: (uri) => workspace.release(uri),
    status,
    capabilities,
    diagnostics: () => [...published().values()],
    symbols: (uri) => {
      if (!asked.has(uri)) {
        asked.add(uri);
        // A file the server has not been told about yet is asked for once it is.
        if (workspace.getFile(uri) !== null) fetchSymbols(uri);
      }
      return symbolMap().get(uri);
    },
    progress,
    cancelProgress: (token) =>
      client.notification<lsp.WorkDoneProgressCancelParams>("window/workDoneProgress/cancel", {
        token,
      }),
    navigate,
    applyEdit,
    executeCommand,
    request: (method, params) => ready(method, params),
    notify: (method, params) => client.notification(method, params),
    client,
    dispose: () => {
      for (const timer of symbolTimers.values()) clearTimeout(timer);
      if (client.connected) {
        void client.request("shutdown", null).finally(() => {
          client.notification("exit", null);
          client.disconnect();
        });
      }
      closed = true;
      setStatus("closed");
    },
  };
}
