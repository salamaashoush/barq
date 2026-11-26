import { findReferencesKeymap, renameKeymap } from "@codemirror/lsp-client";
import { Prec, type Extension } from "@codemirror/state";
import { type Command, EditorView, keymap } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";

import { askMapped, connected, mappedOffset } from "./lsp-context.ts";

type Found = lsp.Location | lsp.Location[] | lsp.LocationLink[] | null;

interface Target {
  uri: string;
  range: lsp.Range;
}

function targetOf(found: Found): Target | null {
  const first = Array.isArray(found) ? found[0] : found;
  if (first === undefined || first === null) return null;
  if ("targetUri" in first) return { uri: first.targetUri, range: first.targetSelectionRange };
  return first;
}

function jump(
  view: EditorView,
  method: string,
  capability: keyof lsp.ServerCapabilities,
  pos = view.state.selection.main.head,
): boolean {
  const found = connected(view);
  if (found === null) return false;
  const { plugin, context } = found;
  const offered = plugin.client.serverCapabilities?.[capability];
  if (plugin.client.serverCapabilities !== null && (offered === undefined || offered === false)) {
    return false;
  }
  askMapped<Found>(found, method, {
    textDocument: { uri: plugin.uri },
    position: plugin.toPosition(pos),
  }).then(
    (answer) => {
      const target = targetOf(answer.result);
      if (target === null) return;
      if (target.uri !== plugin.uri) {
        context.navigate(target.uri, target.range);
        return;
      }
      view.dispatch({
        selection: {
          anchor: mappedOffset(answer, target.range.start, 1),
          head: mappedOffset(answer, target.range.end, -1),
        },
        scrollIntoView: true,
        userEvent: "select.definition",
      });
    },
    (error: unknown) => context.report(error),
  );
  return true;
}

/**
 * Goes to where the symbol at the cursor is defined: in this editor, or in
 * another file through the client's `onNavigate`, which is given the range.
 */
export const goToDefinition: Command = (view) =>
  jump(view, "textDocument/definition", "definitionProvider");

export const goToDeclaration: Command = (view) =>
  jump(view, "textDocument/declaration", "declarationProvider");

export const goToTypeDefinition: Command = (view) =>
  jump(view, "textDocument/typeDefinition", "typeDefinitionProvider");

export const goToImplementation: Command = (view) =>
  jump(view, "textDocument/implementation", "implementationProvider");

/**
 * Definition on F12 and on Mod-click, references in a panel on Shift-F12
 * (Escape closes it) and rename across files on F2, with
 * `@codemirror/lsp-client`'s reference panel and rename prompt.
 */
export function serverNavigation(): Extension {
  return [
    Prec.high(keymap.of([{ key: "F12", run: goToDefinition, preventDefault: true }])),
    keymap.of([...findReferencesKeymap, ...renameKeymap]),
    EditorView.domEventHandlers({
      mousedown: (event, view) => {
        const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? event.metaKey : event.ctrlKey;
        if (!mod || event.button !== 0) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) return false;
        event.preventDefault();
        return jump(view, "textDocument/definition", "definitionProvider", pos);
      },
    }),
  ];
}
