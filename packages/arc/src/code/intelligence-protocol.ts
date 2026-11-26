/** A name the service offers at a position. */
export interface CodeCompletionItem {
  label: string;
  /** CodeMirror's completion type: `function`, `method`, `property`, `variable`, `class`, `keyword`, ... */
  type?: string;
  /** Inserted in place of the label. */
  apply?: string;
  /** Raises an item in the list, from -99 to 99. */
  boost?: number;
}

/** A symbol's signature and its documentation. */
export interface CodeDocs {
  signature: string;
  documentation?: string;
}

/** What a symbol at a position is, and the span of text it covers. */
export interface CodeQuickInfo extends CodeDocs {
  from: number;
  to: number;
}

export type CodeDiagnosticSeverity = "error" | "warning" | "info";

export interface CodeDiagnostic {
  from: number;
  to: number;
  severity: CodeDiagnosticSeverity;
  message: string;
}

/**
 * A language service: what completes, documents and checks a document. Each
 * call carries the whole text, so one service serves every editor on a page.
 */
export interface CodeIntelligence {
  completions(text: string, pos: number): Promise<readonly CodeCompletionItem[]>;
  details?(text: string, pos: number, name: string): Promise<CodeDocs | null>;
  quickInfo?(text: string, pos: number): Promise<CodeQuickInfo | null>;
  diagnostics?(text: string): Promise<readonly CodeDiagnostic[]>;
}

export interface CompletionsCall {
  kind: "completions";
  text: string;
  pos: number;
}

export interface DetailsCall {
  kind: "details";
  text: string;
  pos: number;
  name: string;
}

export interface QuickInfoCall {
  kind: "quickInfo";
  text: string;
  pos: number;
}

export interface DiagnosticsCall {
  kind: "diagnostics";
  text: string;
}

export type IntelligenceCall = CompletionsCall | DetailsCall | QuickInfoCall | DiagnosticsCall;

export interface RequestEnvelope {
  id: number;
  /** Which of the worker's services answers, when it has more than one. */
  scope: string;
}

export type IntelligenceRequest = IntelligenceCall & RequestEnvelope;

export interface IntelligenceResponse {
  id: number;
  result?: unknown;
  error?: string;
}
