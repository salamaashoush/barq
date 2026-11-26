import type * as lsp from "vscode-languageserver-protocol";

import {
  type LanguageServerDefinition,
  type ServedDocument,
  type ServerContext,
  offsetAt,
  positionAt,
} from "./lsp-server.ts";

interface TextSpan {
  start: number;
  length: number;
}

interface DisplayPart {
  text: string;
}

interface CompletionEntry {
  name: string;
  kind: string;
  sortText: string;
  insertText?: string;
}

interface CompletionInfo {
  entries: readonly CompletionEntry[];
}

interface EntryDetails {
  displayParts: readonly DisplayPart[];
  documentation?: readonly DisplayPart[];
}

interface QuickInfo extends EntryDetails {
  textSpan: TextSpan;
}

interface MessageChain {
  messageText: string;
  next?: readonly MessageChain[];
}

interface Diagnostic {
  start?: number;
  length?: number;
  category: number;
  messageText: string | MessageChain;
}

/** The parts of TypeScript's `LanguageService` this reads. */
export interface TypeScriptLanguageService {
  getCompletionsAtPosition(
    file: string,
    pos: number,
    options: Record<string, unknown> | undefined,
  ): CompletionInfo | undefined;
  getCompletionEntryDetails(
    file: string,
    pos: number,
    name: string,
    format: Record<string, unknown> | undefined,
    source: string | undefined,
    preferences: Record<string, unknown> | undefined,
    data: unknown,
  ): EntryDetails | undefined;
  getQuickInfoAtPosition(file: string, pos: number): QuickInfo | undefined;
  getSyntacticDiagnostics(file: string): readonly Diagnostic[];
  getSemanticDiagnostics(file: string): readonly Diagnostic[];
}

interface SourceText {
  text: string;
}

/** The parts of `@typescript/vfs`'s `VirtualTypeScriptEnvironment` this reads. */
export interface TypeScriptEnvironment {
  languageService: TypeScriptLanguageService;
  getSourceFile(file: string): SourceText | undefined;
  createFile?(file: string, content: string): void;
  updateFile(file: string, content: string): void;
}

export interface TypeScriptServerOptions {
  /** Milliseconds after the last change before a file is checked again. @default 300 */
  checkDelay?: number;
}

/** What a completion item carries to `completionItem/resolve`. */
interface ItemData {
  uri: string;
  offset: number;
}

/** CompletionItemKind, by TypeScript's `ScriptElementKind`. */
const KINDS: Readonly<Record<string, lsp.CompletionItemKind>> = {
  function: 3,
  "local function": 3,
  method: 2,
  property: 10,
  getter: 10,
  setter: 10,
  var: 6,
  "local var": 6,
  let: 6,
  const: 21,
  parameter: 6,
  class: 7,
  interface: 8,
  type: 25,
  enum: 13,
  "enum member": 20,
  module: 9,
  keyword: 14,
  string: 1,
};

/** TypeScript's `DiagnosticCategory` (Warning 0, Error 1, Suggestion 2, Message 3) as LSP's severity. */
const SEVERITY: readonly lsp.DiagnosticSeverity[] = [2, 1, 4, 3];

function joinParts(parts: readonly DisplayPart[] | undefined): string {
  return (parts ?? []).map((part) => part.text).join("");
}

function flatten(message: string | MessageChain, depth = 0): string {
  if (typeof message === "string") return message;
  const lines = [`${"  ".repeat(depth)}${message.messageText}`];
  for (const next of message.next ?? []) lines.push(flatten(next, depth + 1));
  return lines.join("\n");
}

/** The environment's file name for a document: a `file:` URI's path, any other URI as it is. */
export function fileOfUri(uri: string): string {
  return uri.startsWith("file://") ? decodeURIComponent(new URL(uri).pathname) : uri;
}

function docs(details: EntryDetails): lsp.MarkupContent {
  const signature = joinParts(details.displayParts);
  const text = joinParts(details.documentation);
  const fenced = signature === "" ? "" : `\`\`\`typescript\n${signature}\n\`\`\``;
  return { kind: "markdown", value: [fenced, text].filter((one) => one !== "").join("\n\n") };
}

/**
 * TypeScript as a language server, for `serveLanguageServer` in a worker,
 * on an environment `load` makes once, such as `@typescript/vfs`'s
 * `createVirtualTypeScriptEnvironment` with the libraries and the API types
 * the edited code sees. Each open document is a file of the environment at
 * its URI's path: completion with docs resolved per item, hover, and
 * diagnostics published after each pause in typing. Names starting `__` are
 * left out of completion.
 *
 * ```ts
 * // typescript-worker.ts
 * import { serveLanguageServer, typescriptServer } from "@barqjs/arc/code/worker";
 *
 * serveLanguageServer(self, typescriptServer(() => createEnvironment()));
 * ```
 */
export function typescriptServer(
  load: () => TypeScriptEnvironment | Promise<TypeScriptEnvironment>,
  options: TypeScriptServerOptions = {},
): LanguageServerDefinition {
  let environment: Promise<TypeScriptEnvironment> | undefined;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  async function synced(document: ServedDocument): Promise<TypeScriptLanguageService> {
    if (environment === undefined) {
      const started = Promise.resolve().then(load);
      environment = started;
      started.catch(() => {
        if (environment === started) environment = undefined;
      });
    }
    const ready = await environment;
    const file = fileOfUri(document.uri);
    // The environment treats an empty file as a missing one.
    const content = document.text === "" ? " " : document.text;
    const known = ready.getSourceFile(file);
    if (known === undefined && ready.createFile !== undefined) ready.createFile(file, content);
    else if (known?.text !== content) ready.updateFile(file, content);
    return ready.languageService;
  }

  function documentOf(context: ServerContext, uri: string): ServedDocument {
    const document = context.documents.get(uri);
    if (document === undefined) throw new Error(`${uri} is not open.`);
    return document;
  }

  async function check(document: ServedDocument, context: ServerContext): Promise<void> {
    const service = await synced(document);
    const file = fileOfUri(document.uri);
    const diagnostics = [
      ...service.getSyntacticDiagnostics(file),
      ...service.getSemanticDiagnostics(file),
    ].map((one): lsp.Diagnostic => ({
      range: {
        start: positionAt(document.text, one.start ?? 0),
        end: positionAt(document.text, (one.start ?? 0) + (one.length ?? 0)),
      },
      severity: SEVERITY[one.category] ?? 3,
      message: flatten(one.messageText),
      source: "TypeScript",
    }));
    context.notify("textDocument/publishDiagnostics", {
      uri: document.uri,
      version: document.version,
      diagnostics,
    } satisfies lsp.PublishDiagnosticsParams);
  }

  return {
    capabilities: {
      completionProvider: { resolveProvider: true, triggerCharacters: ["."] },
      hoverProvider: true,
    },
    serverInfo: { name: "typescript" },
    changed: (document, context) => {
      clearTimeout(timers.get(document.uri));
      timers.set(
        document.uri,
        setTimeout(() => {
          check(document, context).catch(() => undefined);
        }, options.checkDelay ?? 300),
      );
    },
    closed: (uri) => clearTimeout(timers.get(uri)),
    requests: {
      "textDocument/completion": async (
        params: lsp.CompletionParams,
        context: ServerContext,
      ): Promise<lsp.CompletionList> => {
        const document = documentOf(context, params.textDocument.uri);
        const service = await synced(document);
        const offset = offsetAt(document.text, params.position);
        const found = service.getCompletionsAtPosition(fileOfUri(document.uri), offset, {
          includeCompletionsWithInsertText: true,
          includeCompletionsForModuleExports: false,
        });
        return {
          isIncomplete: false,
          items: (found?.entries ?? [])
            .filter((entry) => !entry.name.startsWith("__"))
            .map((entry): lsp.CompletionItem => ({
              label: entry.name,
              kind: KINDS[entry.kind] ?? 1,
              sortText: entry.sortText,
              ...(entry.insertText === undefined ? {} : { insertText: entry.insertText }),
              data: { uri: document.uri, offset } satisfies ItemData,
            })),
        };
      },
      "completionItem/resolve": async (
        item: lsp.CompletionItem,
        context: ServerContext,
      ): Promise<lsp.CompletionItem> => {
        const data = item.data as ItemData | undefined;
        if (data === undefined) return item;
        const service = await synced(documentOf(context, data.uri));
        const found = service.getCompletionEntryDetails(
          fileOfUri(data.uri),
          data.offset,
          item.label,
          {},
          undefined,
          undefined,
          undefined,
        );
        return found === undefined ? item : { ...item, documentation: docs(found) };
      },
      "textDocument/hover": async (
        params: lsp.HoverParams,
        context: ServerContext,
      ): Promise<lsp.Hover | null> => {
        const document = documentOf(context, params.textDocument.uri);
        const service = await synced(document);
        const found = service.getQuickInfoAtPosition(
          fileOfUri(document.uri),
          offsetAt(document.text, params.position),
        );
        if (found === undefined) return null;
        return {
          contents: docs(found),
          range: {
            start: positionAt(document.text, found.textSpan.start),
            end: positionAt(document.text, found.textSpan.start + found.textSpan.length),
          },
        };
      },
    },
  };
}
