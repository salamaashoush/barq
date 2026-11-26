import type { Extension } from "@codemirror/state";
import { type EditorView, type Tooltip, hoverTooltip } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";

import { askMapped, capabilityOf, connected, mappedOffset } from "./lsp-context.ts";
import { docsFactory, hoverDocs } from "./lsp-docs.tsx";

/** The tooltip for `pos`, when the server has something to say there. */
export async function hoverAt(view: EditorView, pos: number): Promise<Tooltip | null> {
  const found = connected(view);
  if (found === null) return null;
  const client = found.plugin.client;
  if (client.serverCapabilities !== null && !capabilityOf(client, "hoverProvider")) return null;
  let answer;
  try {
    answer = await askMapped<lsp.Hover | null>(found, "textDocument/hover", {
      textDocument: { uri: found.plugin.uri },
      position: found.plugin.toPosition(pos),
    });
  } catch (error) {
    found.context.report(error);
    return null;
  }
  const hover = answer.result;
  if (hover === null) return null;
  const docs = hoverDocs(hover.contents);
  if (docs.length === 0) return null;
  const draw = await docsFactory(view, docs);
  const range = hover.range;
  return {
    pos: range === undefined ? pos : mappedOffset(answer, range.start, 1),
    end: range === undefined ? pos : mappedOffset(answer, range.end, -1),
    above: true,
    create: () => {
      const shown = draw();
      shown.dom.classList.add("cm-lsp-hover");
      return { dom: shown.dom, destroy: shown.destroy };
    },
  };
}

/** The server's hover, its markdown drawn by arc, gone once the text changes. */
export function serverHover(): Extension {
  return hoverTooltip(hoverAt, { hideOn: (transaction) => transaction.docChanged });
}
