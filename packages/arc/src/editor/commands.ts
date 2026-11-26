import { isMac } from "@barqjs/aria/platform";
import { $createCodeNode, $isCodeNode } from "@lexical/code-core";
import { $createHorizontalRuleNode } from "@lexical/extension";
import { $createLinkNode, $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $isTableSelection, INSERT_TABLE_COMMAND } from "@lexical/table";
import {
  $findMatchingParent,
  $getNearestNodeOfType,
  $insertNodeToNearestRoot,
} from "@lexical/utils";
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isRootOrShadowRoot,
  type ElementFormatType,
  type ElementNode,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  type LexicalCommand,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  $parseSerializedNode,
  OUTDENT_CONTENT_COMMAND,
  type TextFormatType,
  createCommand,
} from "lexical";

import type { ArcMessages } from "../components/messages.ts";
import type { BlockConversion, EditorExtension } from "./extension.ts";

/** What a block of text is: what the toolbar's text style shows and Turn into sets. */
export type TextBlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "number"
  | "check"
  | "quote"
  | "code";

export const TEXT_BLOCK_TYPES: readonly TextBlockType[] = [
  "paragraph",
  "h1",
  "h2",
  "h3",
  "bullet",
  "number",
  "check",
  "quote",
  "code",
];

const TEXT_BLOCK_LABELS: Record<TextBlockType, (messages: ArcMessages) => string> = {
  paragraph: (m) => m.paragraph,
  h1: (m) => m.headingLevel(1),
  h2: (m) => m.headingLevel(2),
  h3: (m) => m.headingLevel(3),
  bullet: (m) => m.bulletList,
  number: (m) => m.numberedList,
  check: (m) => m.checkList,
  quote: (m) => m.quote,
  code: (m) => m.codeBlock,
};

export function textBlockLabel(type: TextBlockType, messages: ArcMessages): string {
  return TEXT_BLOCK_LABELS[type](messages);
}

/** The marks a toolbar toggles. */
export const MARKS = ["bold", "italic", "underline", "strikethrough", "code"] as const;
export type Mark = (typeof MARKS)[number];

/** What the selection is, for every control that follows it. */
export interface SelectionFormat {
  block: TextBlockType | null;
  marks: Readonly<Record<Mark, boolean>>;
  link: string | null;
  align: ElementFormatType;
  /** A range of text is selected, not a caret. */
  ranged: boolean;
  inTable: boolean;
  /** The selection reads right to left. */
  rtl: boolean;
}

export const NO_FORMAT: SelectionFormat = {
  block: null,
  marks: { bold: false, italic: false, underline: false, strikethrough: false, code: false },
  link: null,
  align: "",
  ranged: false,
  inTable: false,
  rtl: false,
};

/** The text style of the block `node` is in: a list's type, a heading's level; `null` for a table or a block of an app's. */
export function $textBlockOf(node: LexicalNode): TextBlockType | null {
  const list = $getNearestNodeOfType(node, ListNode);
  if ($isListNode(list)) return list.getListType();
  const top = $findMatchingParent(node, (one) => {
    const parent = one.getParent();
    return parent !== null && $isRootOrShadowRoot(parent);
  });
  const block = top ?? node;
  if ($isHeadingNode(block)) {
    const tag = block.getTag();
    return tag === "h1" || tag === "h2" || tag === "h3" ? tag : "h3";
  }
  if ($isQuoteNode(block)) return "quote";
  if ($isCodeNode(block)) return "code";
  return $isParagraphNode(block) ? "paragraph" : null;
}

/** The selection's format, read inside an editor state read. */
export function $selectionFormat(): SelectionFormat {
  const selection = $getSelection();
  if ($isTableSelection(selection)) return { ...NO_FORMAT, inTable: true };
  if (!$isRangeSelection(selection)) return NO_FORMAT;
  const anchor = selection.anchor.getNode();
  const element = $isElementNode(anchor) ? anchor : anchor.getParentOrThrow();
  const link = $findMatchingParent(anchor, $isLinkNode);
  const block = $findMatchingParent(anchor, (one) => $isElementNode(one) && !one.isInline());
  const inTable = $findMatchingParent(anchor, (one) => one.getType() === "tablecell") !== null;
  return {
    block: $textBlockOf(anchor),
    marks: {
      bold: selection.hasFormat("bold"),
      italic: selection.hasFormat("italic"),
      underline: selection.hasFormat("underline"),
      strikethrough: selection.hasFormat("strikethrough"),
      code: selection.hasFormat("code"),
    },
    link: $isLinkNode(link) ? link.getURL() : null,
    align: $isElementNode(block) ? block.getFormatType() : "",
    ranged: !selection.isCollapsed(),
    inTable,
    rtl: element.getDirection() === "rtl",
  };
}

/** Turns the blocks the selection covers into `type`, or back into text when they already are. */
export function setTextBlock(
  editor: LexicalEditor,
  type: TextBlockType,
  current?: TextBlockType | null,
): void {
  if (type === "bullet" || type === "number" || type === "check") {
    if (current === type) editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    else {
      editor.dispatchCommand(
        type === "bullet"
          ? INSERT_UNORDERED_LIST_COMMAND
          : type === "number"
            ? INSERT_ORDERED_LIST_COMMAND
            : INSERT_CHECK_LIST_COMMAND,
        undefined,
      );
    }
    return;
  }
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) && !$isNodeSelection(selection)) return;
    const next = current === type && type !== "paragraph" ? "paragraph" : type;
    $setBlocksType(selection, () => {
      if (next === "paragraph") return $createParagraphNode();
      if (next === "quote") return $createQuoteNode();
      if (next === "code") return $createCodeNode();
      return $createHeadingNode(next);
    });
  });
}

function $textBlockNode(type: Exclude<TextBlockType, "bullet" | "number" | "check">): ElementNode {
  if (type === "paragraph") return $createParagraphNode();
  if (type === "quote") return $createQuoteNode();
  if (type === "code") return $createCodeNode();
  return $createHeadingNode(type);
}

/** What a block holds that goes into another block: its inline nodes, a list item's nested list left out. */
function inlineOf(block: ElementNode): LexicalNode[] {
  return block.getChildren().filter((child) => !$isListNode(child));
}

/**
 * Turns one block into a text block of `type`, keeping its words, its
 * alignment and its indent; a list's items each become a block of their
 * own. Returns the block in its place, the first of them for a list.
 */
export function $turnTextBlock(block: ElementNode, type: TextBlockType): ElementNode {
  if (type === "bullet" || type === "number" || type === "check") {
    if ($isListNode(block)) {
      block.setListType(type);
      return block;
    }
    const list = $createListNode(type);
    const item = $createListItemNode(type === "check" ? false : undefined);
    item.append(...inlineOf(block));
    list.append(item);
    block.replace(list);
    return list;
  }
  if ($isListNode(block)) {
    const made: ElementNode[] = [];
    for (const item of block.getChildren()) {
      if (!$isListItemNode(item)) continue;
      const next = $textBlockNode(type).append(...inlineOf(item));
      block.insertBefore(next);
      made.push(next);
    }
    const first = made[0];
    if (first === undefined) return block;
    block.remove();
    return first;
  }
  const next = $textBlockNode(type);
  next.append(...inlineOf(block));
  next.setFormat(block.getFormatType());
  next.setIndent(block.getIndent());
  block.replace(next);
  return next;
}

export function toggleMark(editor: LexicalEditor, mark: Mark): void {
  editor.dispatchCommand(FORMAT_TEXT_COMMAND, mark satisfies TextFormatType);
}

export function setAlignment(editor: LexicalEditor, align: ElementFormatType): void {
  editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, align);
}

export function indent(editor: LexicalEditor, direction: "in" | "out"): void {
  editor.dispatchCommand(
    direction === "in" ? INDENT_CONTENT_COMMAND : OUTDENT_CONTENT_COMMAND,
    undefined,
  );
}

/**
 * Puts a link on the selection, or takes it off with `null`. On a caret
 * outside any link, with no words to put it on, the address goes in as the
 * link's own words.
 */
export function setLink(editor: LexicalEditor, url: string | null): void {
  let inserted = false;
  if (url !== null) {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
      if ($findMatchingParent(selection.anchor.getNode(), $isLinkNode) !== null) return;
      selection.insertNodes([$createLinkNode(url).append($createTextNode(url))]);
      inserted = true;
    });
  }
  if (!inserted) editor.dispatchCommand(TOGGLE_LINK_COMMAND, url === null ? null : { url });
}

export function insertTable(editor: LexicalEditor, rows = 3, columns = 3): void {
  // From a menu the editor may never have had a caret: the table goes at the end then.
  // A cell takes text only, so from inside one the table goes on a line after its own.
  editor.update(() => {
    const selection = $getSelection();
    if (selection === null) $getRoot().selectEnd();
    else if ($isRangeSelection(selection)) $outOfCell(selection.anchor.getNode())?.select();
  });
  editor.dispatchCommand(INSERT_TABLE_COMMAND, {
    rows: String(rows),
    columns: String(columns),
    includeHeaders: { rows: true, columns: false },
  });
}

/**
 * The line after the table `node` is in, made when there is none to take: a
 * cell takes text only, so a block chosen in one goes there. `null` outside
 * a table.
 */
export function $outOfCell(node: LexicalNode): ElementNode | null {
  const table = $findMatchingParent(node, (one) => one.getType() === "table");
  if (table === null) return null;
  const next = table.getNextSibling();
  if ($isParagraphNode(next) && next.getTextContentSize() === 0) return next;
  const line = $createParagraphNode();
  table.insertAfter(line);
  return line;
}

/**
 * Puts a block where the caret is: in place of the empty paragraph it is in,
 * or after the block it is in, so a block chosen on an empty line leaves no
 * empty line behind. In a table's cell, which takes text only, it goes after
 * the table.
 */
export function $insertBlock<T extends LexicalNode>(node: T): T {
  const selection = $getSelection();
  const outside = $isRangeSelection(selection) ? $outOfCell(selection.anchor.getNode()) : null;
  const caret = outside === null ? selection : outside.select();
  if ($isRangeSelection(caret) && caret.isCollapsed()) {
    const top = caret.anchor.getNode().getTopLevelElement();
    if ($isParagraphNode(top) && top.getTextContentSize() === 0 && top.getChildrenSize() === 0) {
      top.replace(node);
      if (node.getNextSibling() === null) node.insertAfter($createParagraphNode());
      node.selectNext();
      return node;
    }
  }
  return $insertNodeToNearestRoot(node);
}

/**
 * A divider before the line the caret is on when that line is empty, the
 * caret kept on it to type on; after the block it is in otherwise, the caret
 * on a new line after the divider.
 */
export function insertDivider(editor: LexicalEditor): void {
  editor.update(() => {
    const selection = $getSelection();
    const outside = $isRangeSelection(selection) ? $outOfCell(selection.anchor.getNode()) : null;
    const caret = outside === null ? selection : outside.select();
    const anchor = $isRangeSelection(caret) ? caret.anchor.getNode() : null;
    const top = anchor === null ? $getRoot().getLastChild() : $rootBlockOrLine(anchor);
    const divider = $createHorizontalRuleNode();
    if (top === null) {
      $getRoot().append(divider, $createParagraphNode());
      divider.selectNext();
      return;
    }
    const line =
      $isParagraphNode(top) && top.getTextContentSize() === 0
        ? top
        : top.insertAfter($createParagraphNode());
    line.insertBefore(divider);
    if ($isElementNode(line)) line.selectStart();
  });
}

/** The block the caret's line is in, inside a container's own lines where it is in one. */
function $rootBlockOrLine(node: LexicalNode): LexicalNode | null {
  return $findMatchingParent(node, (one) => {
    const parent = one.getParent();
    return parent !== null && $isRootOrShadowRoot(parent);
  });
}

/** Asks the editor's link popover to open on the selection: Mod+K, the toolbar's Link. */
export const OPEN_LINK_EDITOR_COMMAND: LexicalCommand<void> = createCommand("OPEN_LINK_EDITOR");

/** Asks the editor to open its image dialog: the slash menu's Image. */
export const OPEN_IMAGE_DIALOG_COMMAND: LexicalCommand<void> = createCommand("OPEN_IMAGE_DIALOG");

/** Asks the editor to open its table size picker: the Insert menu's and the slash menu's Table. */
export const OPEN_TABLE_DIALOG_COMMAND: LexicalCommand<void> = createCommand("OPEN_TABLE_DIALOG");

/** Asks the editor to open its embed dialog: the slash menu's Embed. */
export const OPEN_EMBED_DIALOG_COMMAND: LexicalCommand<void> = createCommand("OPEN_EMBED_DIALOG");

/** A shortcut as the reader's keyboard writes it: `⌘B` on a Mac, `Ctrl+B` elsewhere. */
export function shortcutLabel(keys: string): string {
  const mac = isMac();
  return keys
    .split("+")
    .map((key) =>
      key === "Mod"
        ? mac
          ? "⌘"
          : "Ctrl"
        : key === "Shift"
          ? mac
            ? "⇧"
            : "Shift"
          : key === "Alt"
            ? mac
              ? "⌥"
              : "Alt"
            : key,
    )
    .join(mac ? "" : "+");
}

/** What Turn into offers an editor beside the text styles: every extension's kinds of block. */
export function editorConversions(extensions: readonly EditorExtension[]): BlockConversion[] {
  return extensions.flatMap((extension) => extension.turnInto ?? []);
}

/** What a block is, as Turn into names it: a text style, a conversion's id, or `null` for neither. */
export function $blockKind(
  block: LexicalNode,
  conversions: readonly BlockConversion[],
): string | null {
  return conversions.find((one) => one.$is(block))?.id ?? $textBlockOf(block);
}

/**
 * Turns a block into a text style or one of `conversions` by its id. A block
 * that is one of the conversions, a callout, a toggle, is taken apart first
 * and its first block turned. Returns the block in its place.
 */
export function $turnInto(
  block: LexicalNode,
  id: string,
  conversions: readonly BlockConversion[],
): LexicalNode {
  if (!$isElementNode(block)) return block;
  const own = conversions.find((one) => one.$is(block));
  if (own?.id === id) return block;
  let target: ElementNode = block;
  if (own !== undefined) {
    const held = own.$unwrap(block);
    const first = held.find((one): one is ElementNode => $isElementNode(one) && !one.isInline());
    if (first === undefined) {
      const line = $createParagraphNode();
      if (held[0] === undefined) $getRoot().append(line);
      else held[0].insertBefore(line);
      target = line;
    } else {
      target = first;
    }
  }
  const conversion = conversions.find((one) => one.id === id);
  if (conversion !== undefined) return conversion.$from(target);
  const text = TEXT_BLOCK_TYPES.find((one) => one === id);
  return text === undefined ? target : $turnTextBlock(target, text);
}

interface NodeWithChildren {
  children?: SerializedLexicalNode[];
}

/** A node and everything under it as JSON, children included, for a copy. */
function $deepJSON(node: LexicalNode): SerializedLexicalNode {
  const json = node.exportJSON() as SerializedLexicalNode & NodeWithChildren;
  if ($isElementNode(node)) json.children = node.getChildren().map($deepJSON);
  return json;
}

/** Puts a copy of the block with `key`, everything in it included, after it. */
export function duplicateBlock(editor: LexicalEditor, key: NodeKey): void {
  editor.update(() => {
    const node = $getNodeByKey(key);
    if (node === null) return;
    node.insertAfter($parseSerializedNode($deepJSON(node)));
  });
}

/** Takes the block with `key` out, the caret going to the block after it. */
export function removeBlock(editor: LexicalEditor, key: NodeKey): void {
  editor.update(() => {
    const node = $getNodeByKey(key);
    if (node === null) return;
    const next = node.getNextSibling() ?? node.getPreviousSibling();
    node.remove();
    if ($getRoot().getChildrenSize() === 0) $getRoot().append($createParagraphNode());
    (next ?? $getRoot().getFirstChild())?.selectStart();
  });
}
