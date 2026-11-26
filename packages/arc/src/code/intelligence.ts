import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { type Diagnostic, lintGutter, linter } from "@codemirror/lint";
import { EditorState, type Extension } from "@codemirror/state";
import { type EditorView, hoverTooltip } from "@codemirror/view";

import type {
  CodeCompletionItem,
  CodeDiagnostic,
  CodeDocs,
  CodeIntelligence,
  CodeQuickInfo,
  IntelligenceCall,
  IntelligenceResponse,
} from "./intelligence-protocol.ts";

export interface CodeIntelligenceOptions {
  /** Names the checker in each diagnostic, such as "TypeScript". */
  source?: string;
  /** Milliseconds after the last edit before the document is checked again. @default 500 */
  lintDelay?: number;
  /** Lines with a problem carry a mark in a gutter. @default true */
  lintGutter?: boolean;
}

function docsElement(docs: CodeDocs): HTMLElement {
  const root = document.createElement("div");
  root.className = "cm-code-docs";
  const signature = document.createElement("code");
  signature.className = "cm-code-docs-signature";
  signature.textContent = docs.signature;
  root.append(signature);
  if (docs.documentation !== undefined && docs.documentation !== "") {
    const text = document.createElement("p");
    text.className = "cm-code-docs-text";
    text.textContent = docs.documentation;
    root.append(text);
  }
  return root;
}

function settled<T>(promise: Promise<T> | undefined, fallback: T): Promise<T> {
  if (promise === undefined) return Promise.resolve(fallback);
  return promise.catch(() => fallback);
}

/**
 * A language service in a `CodeEditor`: completion with each item's
 * signature and documentation beside the list, the same for the symbol under
 * the pointer, and its diagnostics as wavy underlines with a gutter mark.
 *
 * ```tsx
 * const service = workerIntelligence(
 *   () => new Worker(new URL("./typescript-worker.ts", import.meta.url), { type: "module" }),
 * );
 *
 * <CodeEditor language="typescript" extensions={codeIntelligence(service, { source: "TypeScript" })} />
 * ```
 *
 * Every answer is an aid: a call that fails or rejects is an empty answer,
 * so the editor keeps working when the service cannot.
 */
export function codeIntelligence(
  service: CodeIntelligence,
  options: CodeIntelligenceOptions = {},
): Extension {
  async function complete(context: CompletionContext): Promise<CompletionResult | null> {
    const word = context.matchBefore(/[\w$]*/);
    if (word === null) return null;
    const before = context.state.sliceDoc(word.from - 1, word.from);
    if (word.from === word.to && !context.explicit && before !== ".") return null;
    const text = context.state.doc.toString();
    const pos = context.pos;
    const items = await settled<readonly CodeCompletionItem[]>(service.completions(text, pos), []);
    if (context.aborted || items.length === 0) return null;
    return {
      from: word.from,
      validFor: /^[\w$]*$/,
      options: items.map((item): Completion => ({
        label: item.label,
        type: item.type,
        apply: item.apply,
        boost: item.boost,
        info:
          service.details === undefined
            ? undefined
            : async () => {
                const docs = await settled(service.details?.(text, pos, item.label), null);
                return docs === null ? null : docsElement(docs);
              },
      })),
    };
  }

  const parts: Extension[] = [EditorState.languageData.of(() => [{ autocomplete: complete }])];
  if (service.quickInfo !== undefined) {
    parts.push(
      hoverTooltip(async (view: EditorView, pos: number) => {
        const info = await settled<CodeQuickInfo | null>(
          service.quickInfo?.(view.state.doc.toString(), pos),
          null,
        );
        if (info === null) return null;
        return {
          pos: info.from,
          end: info.to,
          above: true,
          create: () => ({ dom: docsElement(info) }),
        };
      }),
    );
  }
  if (service.diagnostics !== undefined) {
    parts.push(
      linter(
        async (view): Promise<Diagnostic[]> => {
          const found = await settled<readonly CodeDiagnostic[]>(
            service.diagnostics?.(view.state.doc.toString()),
            [],
          );
          const length = view.state.doc.length;
          return found.map((one) => ({
            from: Math.min(one.from, length),
            to: Math.min(Math.max(one.to, one.from), length),
            severity: one.severity,
            message: one.message,
            source: options.source,
          }));
        },
        { delay: options.lintDelay ?? 500 },
      ),
    );
    if (options.lintGutter !== false) parts.push(lintGutter());
  }
  return parts;
}

interface Waiting {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/** What `workerIntelligence` needs of a worker: a `Worker`, or a `MessagePort`. */
export interface IntelligencePort {
  postMessage(message: unknown, transfer: Transferable[]): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<IntelligenceResponse>) => void,
  ): void;
}

/**
 * A `CodeIntelligence` answered by a worker that runs `serveIntelligence`
 * from `@barqjs/arc/code/worker`. `start` is called on the first request, so
 * a page whose editors never ask loads nothing; one worker then serves every
 * editor, each request carrying its text and `scope`.
 */
export function workerIntelligence(
  start: () => IntelligencePort,
  scope = "default",
): CodeIntelligence {
  let port: IntelligencePort | undefined;
  let next = 0;
  const pending = new Map<number, Waiting>();
  function call<T>(request: IntelligenceCall): Promise<T> {
    if (port === undefined) {
      port = start();
      port.addEventListener("message", (event) => {
        const waiting = pending.get(event.data.id);
        if (waiting === undefined) return;
        pending.delete(event.data.id);
        if (event.data.error === undefined) waiting.resolve(event.data.result);
        else waiting.reject(new Error(event.data.error));
      });
    }
    const id = next++;
    const target = port;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      target.postMessage({ ...request, id, scope }, []);
    });
  }
  return {
    completions: (text, pos) => call({ kind: "completions", text, pos }),
    details: (text, pos, name) => call({ kind: "details", text, pos, name }),
    quickInfo: (text, pos) => call({ kind: "quickInfo", text, pos }),
    diagnostics: (text) => call({ kind: "diagnostics", text }),
  };
}
