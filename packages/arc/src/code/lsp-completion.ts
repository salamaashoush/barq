import {
  type Completion,
  type CompletionContext,
  type CompletionInfo,
  type CompletionResult,
  autocompletion,
  insertCompletionText,
  snippet,
} from "@codemirror/autocomplete";
import { type ChangeSpec, EditorState, type Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";

import {
  type Connected,
  ask,
  cancelled,
  capabilityOf,
  clampedOffset,
  connected,
} from "./lsp-context.ts";
import { completionDocs, docsFactory } from "./lsp-docs.tsx";

/** CodeMirror's completion types, by `CompletionItemKind`. */
const KIND_TYPES: Readonly<Record<number, string>> = {
  1: "text",
  2: "method",
  3: "function",
  4: "class",
  5: "property",
  6: "variable",
  7: "class",
  8: "interface",
  9: "namespace",
  10: "property",
  11: "keyword",
  12: "constant",
  13: "enum",
  14: "keyword",
  15: "snippet",
  16: "constant",
  17: "file",
  18: "reference",
  19: "file",
  20: "enum",
  21: "constant",
  22: "class",
  23: "event",
  24: "operator",
  25: "type",
};

interface Span {
  from: number;
  to: number;
}

/**
 * LSP's snippet syntax as CodeMirror's: `$1` becomes `${1}`, and the
 * backslash escapes CodeMirror has no use for are dropped.
 */
export function snippetTemplate(text: string): string {
  return text.replace(
    /\\([$}\\])|\$(\d+)/g,
    (_match, escaped: string | undefined, field) => escaped ?? `\${${String(field)}}`,
  );
}

function insertText(item: lsp.CompletionItem): string {
  return item.textEdit?.newText ?? item.textEditText ?? item.insertText ?? item.label;
}

function rangeOf(context: CompletionContext, list: lsp.CompletionList): Span {
  const fallback = context.matchBefore(/[\w$]*/) ?? { from: context.pos, to: context.pos };
  const defaults = list.itemDefaults?.editRange;
  const first = list.items[0]?.textEdit;
  const range =
    defaults !== undefined
      ? "insert" in defaults
        ? defaults.insert
        : defaults
      : first !== undefined
        ? "range" in first
          ? first.range
          : first.insert
        : undefined;
  if (range === undefined) return { from: fallback.from, to: context.pos };
  const doc = context.state.doc;
  return { from: clampedOffset(doc, range.start), to: clampedOffset(doc, range.end) };
}

function applyOf(
  item: lsp.CompletionItem,
  format: lsp.InsertTextFormat | undefined,
  state: EditorState,
): Completion["apply"] {
  const text = insertText(item);
  const extra: ChangeSpec[] = (item.additionalTextEdits ?? []).map((edit) => ({
    from: clampedOffset(state.doc, edit.range.start),
    to: clampedOffset(state.doc, edit.range.end),
    insert: edit.newText,
  }));
  if (format === 2) {
    const template = snippet(snippetTemplate(text));
    return (view, completion, from, to) => {
      template(view, completion, from, to);
      if (extra.length > 0) view.dispatch({ changes: extra });
    };
  }
  if (extra.length > 0) {
    return (view: EditorView, _completion: Completion, from: number, to: number) => {
      view.dispatch(insertCompletionText(view.state, text, from, to), { changes: extra });
    };
  }
  return text === (item.filterText ?? item.label) ? undefined : text;
}

function infoOf(found: Connected, item: lsp.CompletionItem): Completion["info"] {
  const { plugin, context } = found;
  const resolves = capabilityOf(plugin.client, "completionProvider")?.resolveProvider === true;
  if (!resolves && item.documentation === undefined && item.detail === undefined) return undefined;
  return async (): Promise<CompletionInfo> => {
    let full = item;
    if (resolves && item.documentation === undefined) {
      full = await ask<lsp.CompletionItem>(plugin.client, "completionItem/resolve", item).catch(
        (error: unknown) => {
          context.report(error);
          return item;
        },
      );
    }
    const docs = completionDocs(full, context.languageOf(plugin.uri));
    if (docs.length === 0) return null;
    return (await docsFactory(plugin.view, docs))();
  };
}

function triggerOf(found: Connected, context: CompletionContext): lsp.CompletionContext | null {
  if (context.explicit) return { triggerKind: 1 };
  const before = context.state.sliceDoc(context.pos - 1, context.pos);
  const triggers = capabilityOf(found.plugin.client, "completionProvider")?.triggerCharacters;
  if (triggers?.includes(before) === true) return { triggerKind: 2, triggerCharacter: before };
  return /[\w$]/.test(before) ? { triggerKind: 1 } : null;
}

async function complete(context: CompletionContext): Promise<CompletionResult | null> {
  const view = context.view;
  const found = view === undefined ? null : connected(view);
  if (found === null) return null;
  const client = found.plugin.client;
  if (
    client.serverCapabilities !== null &&
    capabilityOf(client, "completionProvider") === undefined
  ) {
    return null;
  }
  const trigger = triggerOf(found, context);
  if (trigger === null) return null;
  client.sync();
  const controller = new AbortController();
  context.addEventListener("abort", () => controller.abort());
  let answer: lsp.CompletionItem[] | lsp.CompletionList | null;
  try {
    answer = await ask(
      client,
      "textDocument/completion",
      {
        textDocument: { uri: found.plugin.uri },
        position: found.plugin.toPosition(context.pos),
        context: trigger,
      } satisfies lsp.CompletionParams,
      controller.signal,
    );
  } catch (error) {
    if (!cancelled(error) && !controller.signal.aborted) found.context.report(error);
    return null;
  }
  if (answer === null || context.aborted) return null;
  const list: lsp.CompletionList = Array.isArray(answer)
    ? { isIncomplete: false, items: answer }
    : answer;
  if (list.items.length === 0) return null;
  const { from, to } = rangeOf(context, list);
  const format = list.itemDefaults?.insertTextFormat;
  return {
    from,
    to,
    options: list.items.map((item): Completion => {
      const option: Completion = {
        label: item.filterText ?? item.label,
        displayLabel: item.label,
        type: item.kind === undefined ? undefined : KIND_TYPES[item.kind],
        detail: item.labelDetails?.detail ?? item.labelDetails?.description,
        sortText: item.sortText,
        commitCharacters: item.commitCharacters,
        apply: applyOf(item, item.insertTextFormat ?? format, context.state),
        info: infoOf(found, item),
      };
      return option;
    }),
    commitCharacters: list.itemDefaults?.commitCharacters,
    validFor: list.isIncomplete ? undefined : /^[\w$]*$/,
  };
}

/**
 * The server's completion: snippets with their fields to tab through,
 * edits elsewhere an item brings (an import), and each item's docs asked
 * for with `completionItem/resolve` once it is picked.
 */
export function serverCompletion(): Extension {
  return [autocompletion(), EditorState.languageData.of(() => [{ autocomplete: complete }])];
}
