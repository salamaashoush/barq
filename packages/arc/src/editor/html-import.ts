import { $insertGeneratedNodes } from "@lexical/clipboard";
import { $generateNodesFromDOM } from "@lexical/html";
import {
  $getRoot,
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isRangeSelection,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";

import { editorExtensions } from "./extension.ts";

/**
 * Nodes read from HTML, each picture, embed or other block standing as a
 * block of its own: HTML holds them in a paragraph, which keeps the words
 * around them.
 */
export function $blocksApart(nodes: readonly LexicalNode[]): LexicalNode[] {
  return nodes.flatMap((node) => {
    if (!$isElementNode(node) || node.isInline()) return [node];
    const blocks = node
      .getChildren()
      .filter((child) => $isDecoratorNode(child) && !child.isInline());
    for (const block of blocks) block.remove();
    return node.getTextContent().trim() !== "" || blocks.length === 0 ? [node, ...blocks] : blocks;
  });
}

/** The page as every extension the editor holds rewrites it before it is read. */
export function prepareHtml(editor: LexicalEditor, page: Document): Document {
  for (const extension of editorExtensions(editor)) extension.html?.(page);
  return page;
}

/** Reads HTML into the editor where its selection is, each extension's rules applied. */
export function $insertHtml(editor: LexicalEditor, page: Document): void {
  if ($getSelection() === null) $getRoot().selectEnd();
  const selection = $getSelection();
  const nodes = $blocksApart($generateNodesFromDOM(editor, prepareHtml(editor, page)));
  if ($isRangeSelection(selection)) $insertGeneratedNodes(editor, nodes, selection);
}
