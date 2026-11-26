import { getIndentUnit, indentUnit } from "@codemirror/language";
import { type EditorState, type Extension, Prec } from "@codemirror/state";
import {
  type Command,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  keymap,
} from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";

import { type Connected, askMapped, connected, editsToChanges } from "./lsp-context.ts";

function formattingOptions(state: EditorState): lsp.FormattingOptions {
  return {
    tabSize: getIndentUnit(state),
    insertSpaces: !state.facet(indentUnit).includes("\t"),
  };
}

function applyEdits(found: Connected, method: string, params: object, userEvent: string): void {
  const { plugin, context } = found;
  askMapped<lsp.TextEdit[] | null>(found, method, params).then(
    (answer) => {
      if (answer.result === null || answer.result.length === 0) return;
      const changes = editsToChanges(answer.start, answer.since, answer.result);
      if (changes !== null) plugin.view.dispatch({ changes, userEvent });
    },
    (error: unknown) => context.report(error),
  );
}

/**
 * Formats the selection when there is one and the server formats ranges,
 * and the whole document otherwise. An answer the user has since typed
 * inside is dropped rather than applied over their change.
 */
export const formatCode: Command = (view) => {
  const found = connected(view);
  if (found === null) return false;
  const { plugin } = found;
  const capabilities = plugin.client.serverCapabilities;
  const selection = view.state.selection.main;
  const options = formattingOptions(view.state);
  if (!selection.empty && capabilities?.documentRangeFormattingProvider) {
    applyEdits(
      found,
      "textDocument/rangeFormatting",
      {
        textDocument: { uri: plugin.uri },
        range: { start: plugin.toPosition(selection.from), end: plugin.toPosition(selection.to) },
        options,
      } satisfies lsp.DocumentRangeFormattingParams,
      "format",
    );
    return true;
  }
  if (capabilities !== null && !capabilities.documentFormattingProvider) return false;
  applyEdits(
    found,
    "textDocument/formatting",
    { textDocument: { uri: plugin.uri }, options } satisfies lsp.DocumentFormattingParams,
    "format",
  );
  return true;
};

/** A character just typed, if it is one the server formats after. */
function typedTrigger(update: ViewUpdate, triggers: readonly string[]): number | null {
  if (!update.transactions.some((transaction) => transaction.isUserEvent("input.type"))) {
    return null;
  }
  let at: number | null = null;
  update.changes.iterChanges((_fromA, _toA, _fromB, toB, inserted) => {
    const text = inserted.toString();
    if (text.length > 0 && triggers.includes(text[text.length - 1] ?? "")) at = toB;
  });
  return at;
}

const onType = ViewPlugin.fromClass(
  class {
    update(update: ViewUpdate): void {
      if (!update.docChanged) return;
      const found = connected(update.view);
      const provider = found?.plugin.client.serverCapabilities?.documentOnTypeFormattingProvider;
      if (found === null || provider === undefined) return;
      const triggers = [provider.firstTriggerCharacter, ...(provider.moreTriggerCharacter ?? [])];
      const at = typedTrigger(update, triggers);
      if (at === null) return;
      const view: EditorView = update.view;
      queueMicrotask(() =>
        applyEdits(
          found,
          "textDocument/onTypeFormatting",
          {
            textDocument: { uri: found.plugin.uri },
            position: found.plugin.toPosition(at),
            ch: view.state.sliceDoc(at - 1, at),
            options: formattingOptions(view.state),
          } satisfies lsp.DocumentOnTypeFormattingParams,
          "format.type",
        ),
      );
    }
  },
);

/** Formatting on Shift-Alt-F (the selection, or the document) and as the server's trigger characters are typed. */
export function serverFormatting(): Extension {
  return [
    Prec.high(keymap.of([{ key: "Shift-Alt-f", run: formatCode, preventDefault: true }])),
    onType,
  ];
}
