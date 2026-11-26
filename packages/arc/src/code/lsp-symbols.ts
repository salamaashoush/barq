import type * as lsp from "vscode-languageserver-protocol";

import type { OutlineNode } from "../components/outline-view.tsx";

/**
 * A file's symbols as `OutlineView` nodes, nested as the server nested
 * them, each id its path of indexes.
 *
 * ```tsx
 * <OutlineView aria-label="Outline" nodes={symbolNodes(server.symbols(uri) ?? [])} />
 * ```
 */
export function symbolNodes(symbols: readonly lsp.DocumentSymbol[], path = ""): OutlineNode[] {
  return symbols.map((symbol, index) => {
    const id = path === "" ? String(index) : `${path}.${String(index)}`;
    const children = symbol.children ?? [];
    return {
      id,
      label: symbol.name,
      ...(children.length === 0 ? {} : { children: symbolNodes(children, id) }),
    };
  });
}
