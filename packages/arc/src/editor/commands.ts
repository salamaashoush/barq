import { isMac } from "@barqjs/aria/platform";
import { $createCodeNode, $isCodeNode } from "@lexical/code-core";
import { $createHorizontalRuleNode } from "@lexical/extension";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
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
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isRootOrShadowRoot,
  type ElementFormatType,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  type LexicalCommand,
  type LexicalEditor,
  type LexicalNode,
  OUTDENT_CONTENT_COMMAND,
  type TextFormatType,
  createCommand,
} from "lexical";

import type { ArcMessages } from "../components/messages.ts";

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

/** Puts a link on the selection, or takes it off with `null`. */
export function setLink(editor: LexicalEditor, url: string | null): void {
  editor.dispatchCommand(TOGGLE_LINK_COMMAND, url === null ? null : { url });
}

export function insertTable(editor: LexicalEditor, rows = 3, columns = 3): void {
  editor.dispatchCommand(INSERT_TABLE_COMMAND, {
    rows: String(rows),
    columns: String(columns),
    includeHeaders: { rows: true, columns: false },
  });
}

/**
 * Puts a block where the caret is: in place of the empty paragraph it is in,
 * or after the block it is in, so a block chosen on an empty line leaves no
 * empty line behind.
 */
export function $insertBlock<T extends LexicalNode>(node: T): T {
  const selection = $getSelection();
  if ($isRangeSelection(selection) && selection.isCollapsed()) {
    const top = selection.anchor.getNode().getTopLevelElement();
    if ($isParagraphNode(top) && top.getTextContentSize() === 0 && top.getChildrenSize() === 0) {
      top.replace(node);
      if (node.getNextSibling() === null) node.insertAfter($createParagraphNode());
      node.selectNext();
      return node;
    }
  }
  return $insertNodeToNearestRoot(node);
}

export function insertDivider(editor: LexicalEditor): void {
  editor.update(() => {
    $insertBlock($createHorizontalRuleNode());
  });
}

/** Asks the editor's link popover to open on the selection: Mod+K, the toolbar's Link. */
export const OPEN_LINK_EDITOR_COMMAND: LexicalCommand<void> = createCommand("OPEN_LINK_EDITOR");

/** Asks the editor to open its image dialog: the slash menu's Image. */
export const OPEN_IMAGE_DIALOG_COMMAND: LexicalCommand<void> = createCommand("OPEN_IMAGE_DIALOG");

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
