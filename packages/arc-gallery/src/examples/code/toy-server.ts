import { defineLanguage, portTransport, registerLanguage, type Transport } from "@barqjs/arc/code";
import {
  type ServedDocument,
  type ServerContext,
  type lsp,
  offsetAt,
  positionAt,
  serveLanguageServer,
} from "@barqjs/arc/code/worker";

/**
 * A toy language and its language server, run in the page over a
 * `MessageChannel` where an app would run a server compiled to WebAssembly
 * in a worker: `fn name(params) { ... }`, `let name = value`, `#` comments.
 */
export const toy = defineLanguage({
  name: "toy",
  keywords: ["fn", "let", "if", "else", "return", "use"],
  constants: ["true", "false", "nil"],
  builtins: ["print"],
  operators: ["==", "!=", "<=", ">=", "=", "+", "-", "*", "/", "<", ">"],
  comments: { line: "#" },
});

registerLanguage("toy", async () => toy);

export const MAIN = "file:///project/main.toy";
export const SHAPES = "file:///project/shapes.toy";

export const SOURCES: Readonly<Record<string, string>> = {
  [MAIN]: [
    "use shapes",
    "",
    "fn total(width, height) {",
    "  let area = rectangle(width, height)",
    "  print(area)   ",
    "  return area",
    "}",
    "",
    "let size = 4",
    "total(size, 3)",
    "circle(2)",
    "# TODO add a triangle",
    "",
  ].join("\n"),
  [SHAPES]: [
    "fn rectangle(width, height) {",
    "  return width * height",
    "}",
    "",
    "fn square(side) {",
    "  return rectangle(side, side)",
    "}",
    "",
  ].join("\n"),
};

const KEYWORDS = ["fn", "let", "if", "else", "return", "use", "print"];
const LEGEND: lsp.SemanticTokensLegend = {
  tokenTypes: ["function", "parameter"],
  tokenModifiers: ["declaration"],
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

function rangeIn(text: string, from: number, to: number): lsp.Range {
  return { start: positionAt(text, from), end: positionAt(text, to) };
}

function wordAt(text: string, offset: number): Word | null {
  let from = offset;
  let to = offset;
  while (from > 0 && /\w/.test(text[from - 1] ?? "")) from--;
  while (to < text.length && /\w/.test(text[to] ?? "")) to++;
  return from === to ? null : { word: text.slice(from, to), from, to };
}

function declared(documents: ReadonlyMap<string, ServedDocument>): Declared[] {
  const found: Declared[] = [];
  for (const document of documents.values()) {
    for (const match of document.text.matchAll(/fn (\w+)\(([^)]*)\)\s*\{/g)) {
      const start = (match.index ?? 0) + 3;
      const name = match[1] ?? "";
      const open = (match.index ?? 0) + match[0].length - 1;
      const close = document.text.indexOf("\n}", open);
      found.push({
        uri: document.uri,
        name,
        params: (match[2] ?? "")
          .split(",")
          .map((one) => one.trim())
          .filter((one) => one !== ""),
        range: rangeIn(document.text, start, start + name.length),
        body: rangeIn(document.text, open, close < 0 ? document.text.length : close + 1),
      });
    }
  }
  return found;
}

function uses(documents: ReadonlyMap<string, ServedDocument>, word: string): lsp.Location[] {
  const found: lsp.Location[] = [];
  for (const document of documents.values()) {
    for (const match of document.text.matchAll(new RegExp(`\\b${word}\\b`, "g"))) {
      const at = match.index ?? 0;
      found.push({ uri: document.uri, range: rangeIn(document.text, at, at + word.length) });
    }
  }
  return found;
}

function calls(text: string): RegExpMatchArray[] {
  return [...text.matchAll(/\b(\w+)\(([^()]*)\)/g)].filter(
    (match) => text.slice(Math.max(0, (match.index ?? 0) - 3), match.index) !== "fn ",
  );
}

function diagnose(document: ServedDocument, context: ServerContext): lsp.Diagnostic[] {
  const functions = declared(context.documents);
  const known = new Set([...functions.map((one) => one.name), ...KEYWORDS]);
  const example = functions.find((one) => one.uri !== document.uri) ?? functions[0];
  const found: lsp.Diagnostic[] = [];
  for (const match of calls(document.text)) {
    const name = match[1] ?? "";
    if (known.has(name)) continue;
    const at = match.index ?? 0;
    found.push({
      range: rangeIn(document.text, at, at + name.length),
      severity: 1,
      code: "unknown-function",
      source: "toy",
      message: `Nothing defines ${name}.`,
      ...(example === undefined
        ? {}
        : {
            relatedInformation: [
              {
                location: { uri: example.uri, range: example.range },
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
  return found;
}

function tokens(document: ServedDocument, context: ServerContext): number[] {
  const functions = new Set(declared(context.documents).map((one) => one.name));
  const marks: number[][] = [];
  for (const match of document.text.matchAll(/\b(fn )?(\w+)\(([^)]*)\)/g)) {
    const name = match[2] ?? "";
    if (!functions.has(name)) continue;
    const at = (match.index ?? 0) + (match[1]?.length ?? 0);
    marks.push([at, name.length, 0, match[1] === undefined ? 0 : 1]);
    if (match[1] === undefined) continue;
    let offset = at + name.length + 1;
    for (const param of (match[3] ?? "").split(",")) {
      const trimmed = param.trim();
      if (trimmed !== "") {
        marks.push([offset + param.length - param.trimStart().length, trimmed.length, 1, 1]);
      }
      offset += param.length + 1;
    }
  }
  const data: number[] = [];
  let line = 0;
  let character = 0;
  for (const [at = 0, length = 0, type = 0, modifiers = 0] of marks.toSorted(
    (a, b) => (a[0] ?? 0) - (b[0] ?? 0),
  )) {
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

function trailingSpace(text: string): lsp.TextEdit[] {
  return text.split("\n").flatMap((line, number) => {
    const trimmed = line.trimEnd();
    if (trimmed.length === line.length) return [];
    return [
      {
        range: {
          start: { line: number, character: trimmed.length },
          end: { line: number, character: line.length },
        },
        newText: "",
      },
    ];
  });
}

function documentOf(context: ServerContext, uri: string): ServedDocument {
  const document = context.documents.get(uri);
  if (document === undefined) throw new Error(`${uri} is not open.`);
  return document;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Starts the toy server and answers with the client's end of the channel. */
export function startToyServer(): Transport {
  const channel = new MessageChannel();
  serveLanguageServer(channel.port2, {
    serverInfo: { name: "toy" },
    capabilities: {
      completionProvider: { resolveProvider: true },
      hoverProvider: true,
      signatureHelpProvider: { triggerCharacters: ["("], retriggerCharacters: [","] },
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: true,
      documentFormattingProvider: true,
      semanticTokensProvider: { legend: LEGEND, full: true },
      codeActionProvider: true,
      codeLensProvider: {},
      inlayHintProvider: true,
      foldingRangeProvider: true,
      documentSymbolProvider: true,
      executeCommandProvider: { commands: ["toy.check"] },
    },
    // A change to one file can fix or break a call in another, so every file is checked again.
    changed: (_document, context) => {
      for (const document of context.documents.values()) {
        context.notify("textDocument/publishDiagnostics", {
          uri: document.uri,
          version: document.version,
          diagnostics: diagnose(document, context),
        });
      }
    },
    requests: {
      "textDocument/completion": (_params: lsp.CompletionParams, context: ServerContext) => [
        ...KEYWORDS.map((word): lsp.CompletionItem => ({ label: word, kind: 14 })),
        ...declared(context.documents).map((one): lsp.CompletionItem => ({
          label: one.name,
          kind: 3,
          labelDetails: { detail: `(${one.params.join(", ")})` },
          insertTextFormat: 2,
          insertText: `${one.name}(${one.params.map((param, index) => `\${${String(index + 1)}:${param}}`).join(", ")})`,
        })),
      ],
      "completionItem/resolve": (item: lsp.CompletionItem): lsp.CompletionItem =>
        item.kind === 3
          ? {
              ...item,
              detail: `fn ${item.label}${item.labelDetails?.detail ?? ""}`,
              documentation: { kind: "markdown", value: `Calls **${item.label}**.` },
            }
          : item,
      "textDocument/hover": (params: lsp.HoverParams, context: ServerContext) => {
        const document = documentOf(context, params.textDocument.uri);
        const word = wordAt(document.text, offsetAt(document.text, params.position));
        const fn = declared(context.documents).find((one) => one.name === word?.word);
        if (word === null || fn === undefined) return null;
        const where = fn.uri.slice(fn.uri.lastIndexOf("/") + 1);
        return {
          contents: {
            kind: "markdown",
            value: `\`\`\`toy\nfn ${fn.name}(${fn.params.join(", ")})\n\`\`\`\n\nA function of ${String(fn.params.length)}, in *${where}*.`,
          },
          range: rangeIn(document.text, word.from, word.to),
        } satisfies lsp.Hover;
      },
      "textDocument/signatureHelp": (params: lsp.SignatureHelpParams, context: ServerContext) => {
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
            },
          ],
          activeParameter: (call[2] ?? "").split(",").length - 1,
        } satisfies lsp.SignatureHelp;
      },
      "textDocument/definition": (params: lsp.DefinitionParams, context: ServerContext) => {
        const document = documentOf(context, params.textDocument.uri);
        const word = wordAt(document.text, offsetAt(document.text, params.position));
        const fn = declared(context.documents).find((one) => one.name === word?.word);
        return fn === undefined ? null : { uri: fn.uri, range: fn.range };
      },
      "textDocument/references": (params: lsp.ReferenceParams, context: ServerContext) => {
        const document = documentOf(context, params.textDocument.uri);
        const word = wordAt(document.text, offsetAt(document.text, params.position));
        return word === null ? [] : uses(context.documents, word.word);
      },
      "textDocument/rename": (params: lsp.RenameParams, context: ServerContext) => {
        const document = documentOf(context, params.textDocument.uri);
        const word = wordAt(document.text, offsetAt(document.text, params.position));
        if (word === null) return null;
        const changes: Record<string, lsp.TextEdit[]> = {};
        for (const place of uses(context.documents, word.word)) {
          changes[place.uri] = [
            ...(changes[place.uri] ?? []),
            { range: place.range, newText: params.newName },
          ];
        }
        return { changes } satisfies lsp.WorkspaceEdit;
      },
      "textDocument/formatting": (params: lsp.DocumentFormattingParams, context: ServerContext) =>
        trailingSpace(documentOf(context, params.textDocument.uri).text),
      "textDocument/semanticTokens/full": (
        params: lsp.SemanticTokensParams,
        context: ServerContext,
      ) => ({ data: tokens(documentOf(context, params.textDocument.uri), context) }),
      "textDocument/codeAction": (params: lsp.CodeActionParams, context: ServerContext) => {
        const document = documentOf(context, params.textDocument.uri);
        const end = positionAt(document.text, document.text.length);
        return params.context.diagnostics
          .filter((one) => one.code === "unknown-function")
          .map((one): lsp.CodeAction => {
            const name = document.text.slice(
              offsetAt(document.text, one.range.start),
              offsetAt(document.text, one.range.end),
            );
            return {
              title: `Define ${name}`,
              kind: "quickfix",
              isPreferred: true,
              diagnostics: [one],
              edit: {
                changes: {
                  [document.uri]: [
                    {
                      range: { start: end, end },
                      newText: `\nfn ${name}(value) {\n  return value\n}\n`,
                    },
                  ],
                },
              },
            };
          });
      },
      "textDocument/codeLens": (params: lsp.CodeLensParams, context: ServerContext) =>
        declared(context.documents)
          .filter((one) => one.uri === params.textDocument.uri)
          .map((one): lsp.CodeLens => {
            const count = uses(context.documents, one.name).length - 1;
            return {
              range: one.range,
              command: {
                title: count === 1 ? "1 use" : `${String(count)} uses`,
                command: "toy.check",
                arguments: [one.name],
              },
            };
          }),
      "textDocument/inlayHint": (params: lsp.InlayHintParams, context: ServerContext) => {
        const document = documentOf(context, params.textDocument.uri);
        const functions = declared(context.documents);
        const hints: lsp.InlayHint[] = [];
        for (const match of calls(document.text)) {
          const fn = functions.find((one) => one.name === match[1]);
          if (fn === undefined) continue;
          let offset = (match.index ?? 0) + (match[1]?.length ?? 0) + 1;
          (match[2] ?? "").split(",").forEach((argument, index) => {
            const param = fn.params[index];
            if (param !== undefined && argument.trim() !== "") {
              hints.push({
                position: positionAt(
                  document.text,
                  offset + argument.length - argument.trimStart().length,
                ),
                label: `${param}:`,
                kind: 2,
                paddingRight: true,
              });
            }
            offset += argument.length + 1;
          });
        }
        return hints;
      },
      "textDocument/foldingRange": (params: lsp.FoldingRangeParams, context: ServerContext) =>
        declared(context.documents)
          .filter((one) => one.uri === params.textDocument.uri)
          .map((one) => ({ startLine: one.body.start.line, endLine: one.body.end.line - 1 })),
      "textDocument/documentSymbol": (params: lsp.DocumentSymbolParams, context: ServerContext) =>
        declared(context.documents)
          .filter((one) => one.uri === params.textDocument.uri)
          .map((one): lsp.DocumentSymbol => ({
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
      ) => {
        const token = `check-${String(Date.now())}`;
        await context.request("window/workDoneProgress/create", { token });
        context.notify("$/progress", {
          token,
          value: { kind: "begin", title: "Checking the project", percentage: 0 },
        });
        for (const percentage of [30, 60, 90]) {
          await wait(400);
          context.notify("$/progress", { token, value: { kind: "report", percentage } });
        }
        context.notify("$/progress", { token, value: { kind: "end" } });
        context.notify("window/showMessage", {
          type: 3,
          message: `Checked every use of ${String(params.arguments?.[0] ?? "the project")}.`,
        });
        return null;
      },
    },
  });
  return portTransport(channel.port1);
}
