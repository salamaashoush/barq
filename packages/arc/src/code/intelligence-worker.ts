import type {
  CodeCompletionItem,
  CodeDiagnostic,
  CodeDiagnosticSeverity,
  CodeDocs,
  CodeIntelligence,
  CodeQuickInfo,
  IntelligenceRequest,
  IntelligenceResponse,
} from "./intelligence-protocol.ts";

export type {
  CodeCompletionItem,
  CodeDiagnostic,
  CodeDiagnosticSeverity,
  CodeDocs,
  CodeIntelligence,
  CodeQuickInfo,
  IntelligenceRequest,
  IntelligenceResponse,
} from "./intelligence-protocol.ts";

/** What `serveIntelligence` needs of the worker's global scope. */
export interface IntelligenceScope {
  postMessage(message: IntelligenceResponse, transfer: Transferable[]): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<IntelligenceRequest>) => void,
  ): void;
}

/**
 * Answers `workerIntelligence`'s requests in a worker: `service` is asked
 * for the service of each request's scope, once per scope, and a scope whose
 * service fails to start is asked again on its next request.
 *
 * ```ts
 * // typescript-worker.ts
 * import { serveIntelligence, typescriptIntelligence } from "@barqjs/arc/code/worker";
 *
 * serveIntelligence(self, (scope) => typescriptIntelligence(() => environmentFor(scope)));
 * ```
 */
export function serveIntelligence(
  scope: IntelligenceScope,
  service: (name: string) => CodeIntelligence | Promise<CodeIntelligence>,
): void {
  const services = new Map<string, Promise<CodeIntelligence>>();
  function serviceOf(name: string): Promise<CodeIntelligence> {
    let found = services.get(name);
    if (found === undefined) {
      found = Promise.resolve().then(() => service(name));
      services.set(name, found);
      found.catch(() => services.delete(name));
    }
    return found;
  }
  async function answer(request: IntelligenceRequest): Promise<unknown> {
    const one = await serviceOf(request.scope);
    if (request.kind === "completions") return one.completions(request.text, request.pos);
    if (request.kind === "details") {
      return one.details?.(request.text, request.pos, request.name) ?? null;
    }
    if (request.kind === "quickInfo") return one.quickInfo?.(request.text, request.pos) ?? null;
    return one.diagnostics?.(request.text) ?? [];
  }
  scope.addEventListener("message", (event) => {
    const request = event.data;
    answer(request).then(
      (result) => scope.postMessage({ id: request.id, result }, []),
      (error: unknown) => scope.postMessage({ id: request.id, error: String(error) }, []),
    );
  });
}

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
  updateFile(file: string, content: string): void;
}

export interface TypeScriptIntelligenceOptions {
  /** The file the edited text is, in the environment. @default "/index.ts" */
  file?: string;
}

const KINDS: Readonly<Record<string, string>> = {
  function: "function",
  "local function": "function",
  method: "method",
  property: "property",
  getter: "property",
  setter: "property",
  var: "variable",
  "local var": "variable",
  let: "variable",
  const: "constant",
  parameter: "variable",
  class: "class",
  interface: "interface",
  type: "type",
  enum: "enum",
  "enum member": "enum",
  module: "namespace",
  keyword: "keyword",
  string: "text",
};

/** TypeScript's `DiagnosticCategory`: Warning 0, Error 1, Suggestion 2, Message 3. */
const SEVERITY: readonly CodeDiagnosticSeverity[] = ["warning", "error", "info", "info"];

function joinParts(parts: readonly DisplayPart[] | undefined): string {
  return (parts ?? []).map((part) => part.text).join("");
}

function flatten(message: string | MessageChain, depth = 0): string {
  if (typeof message === "string") return message;
  const lines = [`${"  ".repeat(depth)}${message.messageText}`];
  for (const next of message.next ?? []) lines.push(flatten(next, depth + 1));
  return lines.join("\n");
}

/**
 * TypeScript as a `CodeIntelligence`, on an environment `load` makes once,
 * such as `@typescript/vfs`'s `createVirtualTypeScriptEnvironment` with the
 * libraries and the API types the edited code sees. Names starting `__` are
 * left out of completion, and TypeScript's sort order becomes each item's
 * boost.
 */
export function typescriptIntelligence(
  load: () => TypeScriptEnvironment | Promise<TypeScriptEnvironment>,
  options: TypeScriptIntelligenceOptions = {},
): CodeIntelligence {
  const file = options.file ?? "/index.ts";
  let environment: Promise<TypeScriptEnvironment> | undefined;
  async function synced(text: string): Promise<TypeScriptLanguageService> {
    if (environment === undefined) {
      const started = Promise.resolve().then(load);
      environment = started;
      started.catch(() => {
        if (environment === started) environment = undefined;
      });
    }
    const ready = await environment;
    // The environment treats an empty file as a missing one.
    const content = text === "" ? " " : text;
    if (ready.getSourceFile(file)?.text !== content) ready.updateFile(file, content);
    return ready.languageService;
  }
  return {
    async completions(text, pos): Promise<readonly CodeCompletionItem[]> {
      const service = await synced(text);
      const found = service.getCompletionsAtPosition(file, pos, {
        includeCompletionsWithInsertText: true,
        includeCompletionsForModuleExports: false,
      });
      return (found?.entries ?? [])
        .filter((entry) => !entry.name.startsWith("__"))
        .map((entry) => ({
          label: entry.name,
          type: KINDS[entry.kind] ?? "text",
          apply: entry.insertText,
          boost: Math.max(-99, 50 - (Number.parseInt(entry.sortText, 10) || 0)),
        }));
    },
    async details(text, pos, name): Promise<CodeDocs | null> {
      const service = await synced(text);
      const found = service.getCompletionEntryDetails(
        file,
        pos,
        name,
        {},
        undefined,
        undefined,
        undefined,
      );
      if (found === undefined) return null;
      return {
        signature: joinParts(found.displayParts),
        documentation: joinParts(found.documentation),
      };
    },
    async quickInfo(text, pos): Promise<CodeQuickInfo | null> {
      const service = await synced(text);
      const found = service.getQuickInfoAtPosition(file, pos);
      if (found === undefined) return null;
      return {
        from: found.textSpan.start,
        to: found.textSpan.start + found.textSpan.length,
        signature: joinParts(found.displayParts),
        documentation: joinParts(found.documentation),
      };
    },
    async diagnostics(text): Promise<readonly CodeDiagnostic[]> {
      const service = await synced(text);
      return [
        ...service.getSyntacticDiagnostics(file),
        ...service.getSemanticDiagnostics(file),
      ].map((one) => ({
        from: one.start ?? 0,
        to: (one.start ?? 0) + (one.length ?? 0),
        severity: SEVERITY[one.category] ?? "info",
        message: flatten(one.messageText),
      }));
    },
  };
}
