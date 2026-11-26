/**
 * A language server for a toy language, in this process: what the client's
 * tests talk to over a `MessageChannel`, as a page talks to one in a worker.
 *
 * The language has `fn name(params) { ... }` and `let name = value`; a call
 * to a name no file defines is an error, `TODO` is a warning, and `old` is a
 * deprecated function. Every message either way is kept in `wire`.
 */
import type * as lsp from "vscode-languageserver-protocol";

import { portTransport } from "./lsp-transport.ts";
import {
  type ServedDocument,
  type ServerContext,
  offsetAt,
  positionAt,
  serveLanguageServer,
} from "./lsp-server.ts";
import type { Transport } from "./lsp-transport.ts";

export const MAIN = "file:///project/main.toy";
export const LIB = "file:///project/lib.toy";

export const LIB_SOURCE = "fn double(x) {\n  return x * 2\n}\n";

interface Wired {
  from: "client" | "server";
  message: WireMessage;
}

export interface WireMessage {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

export interface ToyServer {
  transport: Transport;
  /** Every message, in the order it was posted. */
  wire: Wired[];
  documents(): ReadonlyMap<string, ServedDocument>;
  initialize: lsp.InitializeParams | undefined;
  commands: lsp.ExecuteCommandParams[];
  /** What the client answered to the server's own requests, by method. */
  answers: Map<string, unknown>;
  cancelled: string[];
  /** Holds every slow request until called. */
  release(): void;
}

const KEYWORDS = ["fn", "let", "return", "if", "else"];
const LEGEND: lsp.SemanticTokensLegend = {
  tokenTypes: ["function", "parameter", "keyword", "variable"],
  tokenModifiers: ["declaration", "deprecated"],
};

interface Declared {
  uri: string;
  name: string;
  params: string[];
  range: lsp.Range;
  body: lsp.Range;
}

interface Word {
  word: string;
  from: number;
  to: number;
}

interface TodoData {
  uri: string;
  range: lsp.Range;
}

function wordAt(text: string, offset: number): Word | null {
  let from = offset;
  let to = offset;
  while (from > 0 && /\w/.test(text[from - 1] ?? "")) from--;
  while (to < text.length && /\w/.test(text[to] ?? "")) to++;
  return from === to ? null : { word: text.slice(from, to), from, to };
}

function rangeIn(text: string, from: number, to: number): lsp.Range {
  return { start: positionAt(text, from), end: positionAt(text, to) };
}

function closing(text: string, open: number): number {
  let depth = 0;
  for (let at = open; at < text.length; at++) {
    if (text[at] === "{") depth++;
    if (text[at] === "}" && --depth === 0) return at;
  }
  return text.length;
}

function declared(documents: ReadonlyMap<string, ServedDocument>): Declared[] {
  const found: Declared[] = [];
  for (const document of documents.values()) {
    for (const match of document.text.matchAll(/fn (\w+)\(([^)]*)\)\s*\{/g)) {
      const start = (match.index ?? 0) + 3;
      const name = match[1] ?? "";
      const open = (match.index ?? 0) + match[0].length - 1;
      found.push({
        uri: document.uri,
        name,
        params: (match[2] ?? "")
          .split(",")
          .map((one) => one.trim())
          .filter((one) => one !== ""),
        range: rangeIn(document.text, start, start + name.length),
        body: rangeIn(document.text, open, closing(document.text, open)),
      });
    }
  }
  return found;
}

function occurrences(documents: ReadonlyMap<string, ServedDocument>, word: string): lsp.Location[] {
  const found: lsp.Location[] = [];
  for (const document of documents.values()) {
    for (const match of document.text.matchAll(new RegExp(`\\b${word}\\b`, "g"))) {
      const at = match.index ?? 0;
      found.push({ uri: document.uri, range: rangeIn(document.text, at, at + word.length) });
    }
  }
  return found;
}

function diagnose(document: ServedDocument, context: ServerContext): lsp.Diagnostic[] {
  const known = new Set([...declared(context.documents).map((one) => one.name), ...KEYWORDS]);
  const lib = declared(context.documents).find((one) => one.name === "double");
  const found: lsp.Diagnostic[] = [];
  for (const match of document.text.matchAll(/\b(\w+)\(/g)) {
    const name = match[1] ?? "";
    const at = match.index ?? 0;
    if (known.has(name) || document.text.slice(Math.max(0, at - 3), at) === "fn ") continue;
    found.push({
      range: rangeIn(document.text, at, at + name.length),
      severity: 1,
      code: "unknown-fn",
      codeDescription: { href: "https://example.com/toy/unknown-fn" },
      source: "toy",
      message: `Nothing defines ${name}.`,
      ...(lib === undefined
        ? {}
        : {
            relatedInformation: [
              {
                location: { uri: lib.uri, range: lib.range },
                message: "A function is defined like this.",
              },
            ],
          }),
    });
  }
  for (const match of document.text.matchAll(/TODO/g)) {
    const at = match.index ?? 0;
    found.push({
      range: rangeIn(document.text, at, at + 4),
      severity: 2,
      source: "toy",
      message: "Finish this.",
    });
  }
  for (const match of document.text.matchAll(/let (unused)\b/g)) {
    const at = (match.index ?? 0) + 4;
    found.push({
      range: rangeIn(document.text, at, at + 6),
      severity: 4,
      tags: [1],
      message: "Never read.",
    });
  }
  return found;
}

function tokens(document: ServedDocument): number[] {
  const marks: [number, number, number, number][] = [];
  for (const match of document.text.matchAll(/\b(fn )?(\w+)\(([^)]*)\)/g)) {
    const at = (match.index ?? 0) + (match[1]?.length ?? 0);
    const name = match[2] ?? "";
    if (KEYWORDS.includes(name)) continue;
    const modifiers = (match[1] === undefined ? 0 : 1) | (name === "old" ? 2 : 0);
    marks.push([at, name.length, 0, modifiers]);
    if (match[1] !== undefined) {
      let offset = at + name.length + 1;
      for (const param of (match[3] ?? "").split(",")) {
        const start = offset + (param.length - param.trimStart().length);
        const trimmed = param.trim();
        if (trimmed !== "") marks.push([start, trimmed.length, 1, 1]);
        offset += param.length + 1;
      }
    }
  }
  marks.sort((a, b) => a[0] - b[0]);
  const data: number[] = [];
  let line = 0;
  let character = 0;
  for (const [at, length, type, modifiers] of marks) {
    const position = positionAt(document.text, at);
    const lineDelta = position.line - line;
    data.push(
      lineDelta,
      lineDelta === 0 ? position.character - character : position.character,
      length,
      type,
      modifiers,
    );
    line = position.line;
    character = position.character;
  }
  return data;
}

function trailingSpace(text: string, firstLine: number, lastLine: number): lsp.TextEdit[] {
  const edits: lsp.TextEdit[] = [];
  text.split("\n").forEach((line, number) => {
    if (number < firstLine || number > lastLine) return;
    const trimmed = line.replace(/[ \t]+$/, "");
    if (trimmed.length === line.length) return;
    edits.push({
      range: {
        start: { line: number, character: trimmed.length },
        end: { line: number, character: line.length },
      },
      newText: "",
    });
  });
  return edits;
}

function documentOf(context: ServerContext, uri: string): ServedDocument {
  const document = context.documents.get(uri);
  if (document === undefined) throw new Error(`${uri} is not open`);
  return document;
}

/** The toy server on one end of a channel, and a transport to the other. */
export function toyServer(): ToyServer {
  const channel = new MessageChannel();
  const wire: Wired[] = [];
  const commands: lsp.ExecuteCommandParams[] = [];
  const answers = new Map<string, unknown>();
  const cancelled: string[] = [];
  let documents: ReadonlyMap<string, ServedDocument> = new Map();
  let open: () => void = () => {};
  let gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const server: ToyServer = {
    transport: portTransport(channel.port1),
    wire,
    documents: () => documents,
    initialize: undefined,
    commands,
    answers,
    cancelled,
    release: () => {
      open();
      gate = new Promise<void>((resolve) => {
        open = resolve;
      });
    },
  };
  const send = channel.port1.postMessage.bind(channel.port1);
  channel.port1.postMessage = (message: unknown) => {
    wire.push({ from: "client", message: JSON.parse(String(message)) as WireMessage });
    send(message);
  };
  const reply = channel.port2.postMessage.bind(channel.port2);
  channel.port2.postMessage = (message: unknown) => {
    wire.push({ from: "server", message: JSON.parse(String(message)) as WireMessage });
    reply(message);
  };

  async function ask(context: ServerContext, method: string, params: unknown): Promise<unknown> {
    try {
      const answer = await context.request(method, params);
      answers.set(method, answer);
      return answer;
    } catch (error) {
      answers.set(method, error);
      return error;
    }
  }

  serveLanguageServer(channel.port2, {
    serverInfo: { name: "toy" },
    capabilities: (params) => {
      server.initialize = params;
      return {
        completionProvider: { triggerCharacters: ["."], resolveProvider: true },
        hoverProvider: true,
        signatureHelpProvider: { triggerCharacters: ["("], retriggerCharacters: [","] },
        definitionProvider: true,
        referencesProvider: true,
        renameProvider: true,
        documentFormattingProvider: true,
        documentRangeFormattingProvider: true,
        documentOnTypeFormattingProvider: { firstTriggerCharacter: ";" },
        semanticTokensProvider: { legend: LEGEND, full: true },
        codeActionProvider: { resolveProvider: true },
        codeLensProvider: { resolveProvider: true },
        inlayHintProvider: true,
        foldingRangeProvider: true,
        documentSymbolProvider: true,
        executeCommandProvider: { commands: ["toy.fixAll", "toy.build", "toy.run", "toy.ask"] },
      };
    },
    changed: (document, context) => {
      documents = context.documents;
      context.notify("textDocument/publishDiagnostics", {
        uri: document.uri,
        version: document.version,
        diagnostics: diagnose(document, context),
      } satisfies lsp.PublishDiagnosticsParams);
    },
    closed: (_uri, context) => {
      documents = context.documents;
    },
    requests: {
      "textDocument/completion": async (
        params: lsp.CompletionParams,
        context: ServerContext,
      ): Promise<lsp.CompletionList> => {
        const document = documentOf(context, params.textDocument.uri);
        const before = document.text.slice(0, offsetAt(document.text, params.position));
        if (before.endsWith("slow")) {
          await new Promise<void>((resolve) => {
            context.signal.addEventListener("abort", () => {
              cancelled.push("textDocument/completion");
              resolve();
            });
            void gate.then(resolve);
          });
        }
        const functions = declared(context.documents);
        const hasUse = document.text.startsWith("use lib");
        return {
          isIncomplete: false,
          items: [
            ...KEYWORDS.map((word): lsp.CompletionItem => ({ label: word, kind: 14 })),
            ...functions.map((one): lsp.CompletionItem => ({
              label: one.name,
              kind: 3,
              labelDetails: { detail: `(${one.params.join(", ")})` },
              insertTextFormat: 2,
              insertText: `${one.name}(${one.params.map((param, index) => `\${${String(index + 1)}:${param}}`).join(", ")})`,
              data: one.name,
              ...(one.uri !== params.textDocument.uri && !hasUse
                ? {
                    additionalTextEdits: [
                      {
                        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                        newText: "use lib\n",
                      },
                    ],
                  }
                : {}),
            })),
          ],
        };
      },
      "completionItem/resolve": (item: lsp.CompletionItem): lsp.CompletionItem => ({
        ...item,
        detail: `fn ${item.label}${item.labelDetails?.detail ?? ""}`,
        documentation: { kind: "markdown", value: `Calls **${item.label}**.` },
      }),
      "textDocument/hover": (params: lsp.HoverParams, context: ServerContext): lsp.Hover | null => {
        const document = documentOf(context, params.textDocument.uri);
        const word = wordAt(document.text, offsetAt(document.text, params.position));
        const fn = declared(context.documents).find((one) => one.name === word?.word);
        if (word === null || fn === undefined) return null;
        return {
          contents: {
            kind: "markdown",
            value: `\`\`\`toy\nfn ${fn.name}(${fn.params.join(", ")})\n\`\`\`\n\nA *function* of ${String(fn.params.length)}.`,
          },
          range: rangeIn(document.text, word.from, word.to),
        };
      },
      "textDocument/signatureHelp": (
        params: lsp.SignatureHelpParams,
        context: ServerContext,
      ): lsp.SignatureHelp | null => {
        const document = documentOf(context, params.textDocument.uri);
        const before = document.text.slice(0, offsetAt(document.text, params.position));
        const call = /(\w+)\(([^()]*)$/.exec(before);
        const fn = declared(context.documents).find((one) => one.name === call?.[1]);
        if (call === null || fn === undefined) return null;
        return {
          signatures: [
            {
              label: `${fn.name}(${fn.params.join(", ")})`,
              parameters: fn.params.map((param) => ({ label: param })),
              documentation: "Adds them.",
            },
          ],
          activeSignature: 0,
          activeParameter: (call[2] ?? "").split(",").length - 1,
        };
      },
      "textDocument/definition": (
        params: lsp.DefinitionParams,
        context: ServerContext,
      ): lsp.Location | null => {
        const document = documentOf(context, params.textDocument.uri);
        const word = wordAt(document.text, offsetAt(document.text, params.position));
        const fn = declared(context.documents).find((one) => one.name === word?.word);
        return fn === undefined ? null : { uri: fn.uri, range: fn.range };
      },
      "textDocument/references": (
        params: lsp.ReferenceParams,
        context: ServerContext,
      ): lsp.Location[] => {
        const document = documentOf(context, params.textDocument.uri);
        const word = wordAt(document.text, offsetAt(document.text, params.position));
        return word === null ? [] : occurrences(context.documents, word.word);
      },
      "textDocument/rename": (
        params: lsp.RenameParams,
        context: ServerContext,
      ): lsp.WorkspaceEdit | null => {
        const document = documentOf(context, params.textDocument.uri);
        const word = wordAt(document.text, offsetAt(document.text, params.position));
        if (word === null) return null;
        const changes: Record<string, lsp.TextEdit[]> = {};
        for (const place of occurrences(context.documents, word.word)) {
          changes[place.uri] = [
            ...(changes[place.uri] ?? []),
            { range: place.range, newText: params.newName },
          ];
        }
        return { changes };
      },
      "textDocument/formatting": (params: lsp.DocumentFormattingParams, context: ServerContext) =>
        trailingSpace(
          documentOf(context, params.textDocument.uri).text,
          0,
          Number.MAX_SAFE_INTEGER,
        ),
      "textDocument/rangeFormatting": (
        params: lsp.DocumentRangeFormattingParams,
        context: ServerContext,
      ) =>
        trailingSpace(
          documentOf(context, params.textDocument.uri).text,
          params.range.start.line,
          params.range.end.line,
        ),
      "textDocument/onTypeFormatting": (
        params: lsp.DocumentOnTypeFormattingParams,
        context: ServerContext,
      ): lsp.TextEdit[] => {
        const document = documentOf(context, params.textDocument.uri);
        const offset = offsetAt(document.text, params.position);
        const before = /\s+;$/.exec(document.text.slice(0, offset));
        if (before === null) return [];
        return [
          { range: rangeIn(document.text, offset - before[0].length, offset - 1), newText: "" },
        ];
      },
      "textDocument/semanticTokens/full": (
        params: lsp.SemanticTokensParams,
        context: ServerContext,
      ): lsp.SemanticTokens => ({ data: tokens(documentOf(context, params.textDocument.uri)) }),
      "textDocument/codeAction": (
        params: lsp.CodeActionParams,
        context: ServerContext,
      ): (lsp.CodeAction | lsp.Command)[] => {
        const document = documentOf(context, params.textDocument.uri);
        const actions: (lsp.CodeAction | lsp.Command)[] = [];
        for (const diagnostic of params.context.diagnostics) {
          if (diagnostic.code === "unknown-fn") {
            const name = document.text.slice(
              offsetAt(document.text, diagnostic.range.start),
              offsetAt(document.text, diagnostic.range.end),
            );
            actions.push({
              title: `Define ${name}`,
              kind: "quickfix",
              isPreferred: true,
              diagnostics: [diagnostic],
              edit: {
                changes: {
                  [document.uri]: [
                    {
                      range: {
                        start: positionAt(document.text, document.text.length),
                        end: positionAt(document.text, document.text.length),
                      },
                      newText: `\nfn ${name}() {\n}\n`,
                    },
                  ],
                },
              },
            });
          }
          if (typeof diagnostic.message === "string" && diagnostic.message === "Finish this.") {
            actions.push({
              title: "Remove TODO",
              kind: "quickfix",
              data: { uri: document.uri, range: diagnostic.range } satisfies TodoData,
            });
          }
        }
        actions.push({ title: "Run the file", command: "toy.run", arguments: [document.uri] });
        return actions;
      },
      "codeAction/resolve": (action: lsp.CodeAction): lsp.CodeAction => {
        const data = action.data as TodoData;
        return {
          ...action,
          edit: { changes: { [data.uri]: [{ range: data.range, newText: "" }] } },
        };
      },
      "textDocument/codeLens": (
        params: lsp.CodeLensParams,
        context: ServerContext,
      ): lsp.CodeLens[] =>
        declared(context.documents)
          .filter((one) => one.uri === params.textDocument.uri)
          .map((one) => ({ range: one.range, data: one.name })),
      "codeLens/resolve": (lens: lsp.CodeLens, context: ServerContext): lsp.CodeLens => {
        const name = String(lens.data);
        const uses = occurrences(context.documents, name).length - 1;
        return {
          ...lens,
          command: { title: `${String(uses)} uses`, command: "toy.run", arguments: [name] },
        };
      },
      "textDocument/inlayHint": (
        params: lsp.InlayHintParams,
        context: ServerContext,
      ): lsp.InlayHint[] => {
        const document = documentOf(context, params.textDocument.uri);
        const functions = declared(context.documents);
        const hints: lsp.InlayHint[] = [];
        for (const match of document.text.matchAll(/\b(\w+)\(([^)]*)\)/g)) {
          const fn = functions.find((one) => one.name === match[1]);
          if (
            fn === undefined ||
            document.text.slice(Math.max(0, (match.index ?? 0) - 3), match.index) === "fn "
          )
            continue;
          let offset = (match.index ?? 0) + (match[1]?.length ?? 0) + 1;
          (match[2] ?? "").split(",").forEach((argument, index) => {
            const start = offset + (argument.length - argument.trimStart().length);
            const param = fn.params[index];
            if (param !== undefined && argument.trim() !== "") {
              hints.push({
                position: positionAt(document.text, start),
                label: `${param}:`,
                kind: 2,
                paddingRight: true,
              });
            }
            offset += argument.length + 1;
          });
        }
        for (const match of document.text.matchAll(/let (\w+) = \d/g)) {
          const end = (match.index ?? 0) + 4 + (match[1]?.length ?? 0);
          hints.push({
            position: positionAt(document.text, end),
            label: [{ value: ": " }, { value: "num" }],
            kind: 1,
          });
        }
        return hints;
      },
      "textDocument/foldingRange": (
        params: lsp.FoldingRangeParams,
        context: ServerContext,
      ): lsp.FoldingRange[] =>
        declared(context.documents)
          .filter((one) => one.uri === params.textDocument.uri)
          .map((one) => ({ startLine: one.body.start.line, endLine: one.body.end.line - 1 })),
      "textDocument/documentSymbol": (
        params: lsp.DocumentSymbolParams,
        context: ServerContext,
      ): lsp.DocumentSymbol[] =>
        declared(context.documents)
          .filter((one) => one.uri === params.textDocument.uri)
          .map((one) => ({
            name: one.name,
            kind: 12,
            range: one.body,
            selectionRange: one.range,
            children: one.params.map((param) => ({
              name: param,
              kind: 13,
              range: one.range,
              selectionRange: one.range,
            })),
          })),
      "workspace/executeCommand": async (
        params: lsp.ExecuteCommandParams,
        context: ServerContext,
      ): Promise<unknown> => {
        commands.push(params);
        if (params.command === "toy.fixAll") {
          const changes: Record<string, lsp.TextEdit[]> = {};
          for (const document of context.documents.values()) {
            for (const match of document.text.matchAll(/TODO/g)) {
              const at = match.index ?? 0;
              changes[document.uri] = [
                ...(changes[document.uri] ?? []),
                { range: rangeIn(document.text, at, at + 4), newText: "DONE" },
              ];
            }
          }
          return ask(context, "workspace/applyEdit", { label: "Fix all", edit: { changes } });
        }
        if (params.command === "toy.build") {
          await ask(context, "window/workDoneProgress/create", { token: "build" });
          context.notify("$/progress", {
            token: "build",
            value: { kind: "begin", title: "Building", percentage: 0, cancellable: true },
          });
          context.notify("$/progress", {
            token: "build",
            value: { kind: "report", message: "main.toy", percentage: 50 },
          });
          await gate;
          context.notify("$/progress", { token: "build", value: { kind: "end" } });
          context.notify("window/showMessage", { type: 3, message: "Built." });
          return null;
        }
        if (params.command === "toy.ask") {
          await ask(context, "workspace/configuration", {
            items: [{ section: "toy.style" }, { section: "other" }],
          });
          await ask(context, "toy/unknown", {});
          return null;
        }
        return null;
      },
    },
    notifications: {
      "window/workDoneProgress/cancel": (params: lsp.WorkDoneProgressCancelParams) => {
        cancelled.push(`progress:${String(params.token)}`);
      },
    },
  });
  return server;
}
