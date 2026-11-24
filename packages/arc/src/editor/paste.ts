import {
  $getClipboardDataFromSelection,
  $insertDataTransferForPlainText,
  $insertDataTransferForRichText,
  type LexicalClipboardData,
} from "@lexical/clipboard";
import { $isLinkNode, $toggleLink, LinkNode } from "@lexical/link";
import { $convertFromMarkdownString } from "@lexical/markdown";
import {
  $computeTableMapSkipCellCheck,
  $createTableNodeWithDimensions,
  $getTableCellNodeFromLexicalNode,
  $getTableCellNodeRect,
  $getTableNodeFromLexicalNodeOrThrow,
  $insertTableColumnAtNode,
  $insertTableRowAtNode,
  $isTableCellNode,
  type TableCellNode,
  type TableNode,
} from "@lexical/table";
import {
  $createNodeSelection,
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  type BaseSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  COPY_COMMAND,
  CUT_COMMAND,
  ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  PASTE_COMMAND,
  ParagraphNode,
  type RangeSelection,
  TextNode,
  mergeRegister,
} from "lexical";

import { $unwrapInto } from "./containers.tsx";
import { isSafeUrl } from "./core.tsx";
import { defineEditorExtension, editorExtensions, transformersOf } from "./extension.ts";
import { $insertHtml } from "./html-import.ts";

export const MAX_TABLE_ROWS = 50;
export const MAX_TABLE_COLUMNS = 20;

function usable(grid: string[][]): string[][] | null {
  const rows = grid.filter((row) => row.some((cell) => cell.trim() !== ""));
  const columns = Math.max(0, ...rows.map((row) => row.length));
  if (rows.length === 0 || (rows.length === 1 && columns < 2)) return null;
  if (rows.length > MAX_TABLE_ROWS || columns > MAX_TABLE_COLUMNS) return null;
  return rows;
}

/**
 * The cells of what was copied from a spreadsheet or a web page's table, row
 * by row, or `null` for anything else. A spreadsheet copies an HTML table
 * beside its tab-separated text, which keeps a cell's own line breaks; text
 * alone counts when every line splits into the same number of cells, so code
 * indented with tabs does not.
 */
export function clipboardGrid(text: string, html: string): string[][] | null {
  if (html !== "" && /<table\b/i.test(html)) {
    const table = new DOMParser().parseFromString(html, "text/html").querySelector("table");
    if (table === null) return null;
    return usable(
      [...table.rows].map((row) => [...row.cells].map((cell) => (cell.textContent ?? "").trim())),
    );
  }
  if (html.trim() !== "") return null;
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  if (lines.some((line) => !line.includes("\t") || line.startsWith("\t"))) return null;
  const grid = lines.map((line) => line.split("\t"));
  const width = grid[0]?.length ?? 0;
  return grid.every((row) => row.length === width) ? usable(grid) : null;
}

function $write(cell: TableCellNode, text: string): void {
  cell.clear();
  cell.append($createParagraphNode().append(...(text === "" ? [] : [$createTextNode(text)])));
}

/** A new table holding a copied grid, its first row heading the columns. */
export function $tableFromGrid(grid: string[][]): TableNode {
  const columns = Math.max(...grid.map((row) => row.length));
  const table = $createTableNodeWithDimensions(grid.length, columns, {
    rows: true,
    columns: false,
  });
  const [map] = $computeTableMapSkipCellCheck(table, null, null);
  for (const [row, cells] of grid.entries()) {
    for (const [column, text] of cells.entries()) {
      const cell = map[row]?.[column]?.cell;
      if (cell !== undefined) $write(cell, text);
    }
  }
  return table;
}

/**
 * Pastes a copied grid into a table from the cell being edited, across and
 * down as a spreadsheet does, adding the rows and columns it runs past. A
 * merged cell takes the text of the place it starts at.
 */
export function $pasteGrid(from: TableCellNode, grid: string[][]): boolean {
  const table = $getTableNodeFromLexicalNodeOrThrow(from);
  const { rowIndex, columnIndex } = $getTableCellNodeRect(from) ?? { rowIndex: 0, columnIndex: 0 };
  const rows = rowIndex + grid.length;
  const columns = columnIndex + Math.max(...grid.map((row) => row.length));
  if (rows > MAX_TABLE_ROWS || columns > MAX_TABLE_COLUMNS) return false;
  let [map] = $computeTableMapSkipCellCheck(table, null, null);
  while (map.length < rows) {
    const last = map.at(-1)?.[0]?.cell;
    if (last === undefined) return false;
    $insertTableRowAtNode(last, true);
    [map] = $computeTableMapSkipCellCheck(table, null, null);
  }
  while ((map[0]?.length ?? 0) < columns) {
    const last = map[0]?.at(-1)?.cell;
    if (last === undefined) return false;
    $insertTableColumnAtNode(last, true, false);
    [map] = $computeTableMapSkipCellCheck(table, null, null);
  }
  for (const [row, cells] of grid.entries()) {
    for (const [column, text] of cells.entries()) {
      const place = map[rowIndex + row]?.[columnIndex + column];
      if (
        place !== undefined &&
        $isTableCellNode(place.cell) &&
        place.startRow === rowIndex + row &&
        place.startColumn === columnIndex + column
      ) {
        $write(place.cell, text);
      }
    }
  }
  from.selectEnd();
  return true;
}

const MARKDOWN_BLOCK = /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|```|- \[[ x]\]\s|\|.+\|$)/;
const MARKDOWN_INLINE = /\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\)|`[^`\n]+`/;
const STRUCTURED_HTML = /<(p|h[1-6]|ul|ol|li|table|blockquote|pre)\b/i;
/** What spreadsheets mark the HTML they copy with. */
const SPREADSHEET_HTML =
  /google-sheets-html-origin|urn:schemas-microsoft-com:office:excel|Excel\.Sheet|LibreOffice|content="?Numbers/i;

/**
 * Plain text written in markdown, as editors, chat tools and AI assistants
 * copy it. A page copied from a browser carries its own structure as HTML
 * and is left to the HTML paste.
 */
export function isMarkdown(text: string, html: string): boolean {
  if (html !== "" && STRUCTURED_HTML.test(html)) return false;
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  return lines.some((line) => MARKDOWN_BLOCK.test(line)) || MARKDOWN_INLINE.test(text);
}

/** A detached holder markdown is read into before its blocks go where the caret is. */
class MarkdownHolderNode extends ElementNode {
  $config() {
    return this.config("arc-markdown-holder", { extends: ElementNode });
  }

  createDOM(): HTMLElement {
    return document.createElement("div");
  }

  updateDOM(): boolean {
    return false;
  }

  isShadowRoot(): boolean {
    return true;
  }
}

function $insertMarkdown(editor: LexicalEditor, markdown: string, selection: RangeSelection): void {
  const holder = new MarkdownHolderNode();
  // Converting selects the start of the detached holder; the paste goes where the caret was.
  const caret = selection.clone();
  $convertFromMarkdownString(markdown, transformersOf(editorExtensions(editor)), holder);
  const nodes: LexicalNode[] = holder.getChildren();
  for (const node of nodes) node.remove();
  $setSelection(caret);
  caret.insertNodes(nodes);
}

/** A web address standing alone, as a paste over selected words makes into their link. */
function $normalisedUrl(text: string): string | null {
  const url = /^www\./i.test(text) ? `https://${text}` : text;
  return /^https?:\/\//i.test(url) && isSafeUrl(url) ? url : null;
}

const LEXICAL_TYPE = "application/x-lexical-editor";

interface ClipboardMemory {
  copied: LexicalClipboardData | null;
}

/**
 * What this page last copied from an editor. A copy from a menu goes through
 * the browser's clipboard API, which carries only text and HTML, so a paste
 * would lose what HTML cannot hold; while the clipboard holds the same text,
 * the editor's own copy is pasted instead.
 */
const memory: ClipboardMemory = { copied: null };

function $remember(): boolean {
  const selection = $getSelection();
  if (selection !== null) memory.copied = $getClipboardDataFromSelection(selection);
  return false;
}

/** Keeps each copy and cut made in an editor, and pastes the editor's own copy where the clipboard holds only its text. */
function registerCopies(editor: LexicalEditor): () => void {
  return mergeRegister(
    editor.registerCommand(COPY_COMMAND, $remember, COMMAND_PRIORITY_LOW),
    editor.registerCommand(CUT_COMMAND, $remember, COMMAND_PRIORITY_LOW),
    editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const data = "clipboardData" in event ? event.clipboardData : null;
        const own = memory.copied?.[LEXICAL_TYPE];
        const selection = $getSelection();
        if (
          data === null ||
          own === undefined ||
          selection === null ||
          data.types.includes(LEXICAL_TYPE) ||
          data.getData("text/plain") !== memory.copied?.["text/plain"]
        ) {
          return false;
        }
        const transfer = new DataTransfer();
        transfer.setData("text/plain", data.getData("text/plain"));
        transfer.setData(LEXICAL_TYPE, own);
        event.preventDefault();
        $insertDataTransferForRichText(transfer, selection, editor);
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    ),
  );
}

/** What a menu's clipboard actions work on: the words selected, or the whole block. */
export type ClipboardTarget =
  | { kind: "selection"; selection: BaseSelection }
  | { kind: "block"; key: NodeKey; caret: BaseSelection | null };

/**
 * What the writer means to cut or copy where they opened a block's menu: the
 * words they selected in it, else the block itself, pasting at the caret
 * where it is in the block.
 */
export function $clipboardTarget(key: NodeKey): ClipboardTarget {
  const selection = $getSelection();
  const block = $getNodeByKey(key);
  if (
    selection !== null &&
    !selection.isCollapsed() &&
    block !== null &&
    selection.getNodes().some((node) => node.is(block) || block.isParentOf(node))
  ) {
    return { kind: "selection", selection: selection.clone() };
  }
  const inside =
    $isRangeSelection(selection) &&
    block !== null &&
    (block.is(selection.anchor.getNode()) || block.isParentOf(selection.anchor.getNode()));
  return { kind: "block", key, caret: inside ? selection.clone() : null };
}

function $selectionOf(target: ClipboardTarget): BaseSelection | null {
  if (target.kind === "selection") return target.selection;
  const block = $getNodeByKey(target.key);
  if (block === null) return null;
  const selection = $createNodeSelection();
  selection.add(block.getKey());
  return selection;
}

/** Copies what a menu was opened on, in every format the editor pastes. */
export async function copyTarget(editor: LexicalEditor, target: ClipboardTarget): Promise<boolean> {
  const data = editor.read(() => {
    const selection = $selectionOf(target);
    return selection === null ? null : $getClipboardDataFromSelection(selection);
  });
  if (data === null) return false;
  memory.copied = data;
  try {
    const html = data["text/html"];
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([data["text/plain"]], { type: "text/plain" }),
        ...(html === undefined || html === ""
          ? {}
          : { "text/html": new Blob([html], { type: "text/html" }) }),
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Copies what a menu was opened on, then takes it out. */
export async function cutTarget(editor: LexicalEditor, target: ClipboardTarget): Promise<void> {
  if (!(await copyTarget(editor, target))) return;
  editor.update(() => {
    if (target.kind === "block") {
      const block = $getNodeByKey(target.key);
      const next = block?.getNextSibling() ?? block?.getPreviousSibling() ?? null;
      block?.remove();
      next?.selectStart();
      return;
    }
    const selection = target.selection.clone();
    $setSelection(selection);
    if ($isRangeSelection(selection)) selection.removeText();
    else for (const node of selection.getNodes()) node.remove();
  });
}

/** The clipboard as the browser lets a page read it. */
async function readClipboard(plain: boolean): Promise<DataTransfer | null> {
  const transfer = new DataTransfer();
  async function plainText() {
    transfer.setData("text/plain", await navigator.clipboard.readText());
    return transfer;
  }
  try {
    if (plain) return await plainText();
    for (const item of await navigator.clipboard.read()) {
      for (const kind of item.types) {
        const blob = await item.getType(kind);
        if (kind.startsWith("image/"))
          transfer.items.add(new File([blob], "pasted", { type: kind }));
        else transfer.setData(kind, await blob.text());
      }
    }
  } catch {
    // A browser that reads only text, or one the writer has not let read the
    // clipboard yet, may still give its text.
    try {
      return await plainText();
    } catch {
      return null;
    }
  }
  return transfer;
}

/**
 * Pastes the clipboard where a menu was opened: over the words selected, or
 * after the block. It goes through the editor's own paste, so a table,
 * markdown or a picture pastes as from the keyboard; where the browser will
 * not let the page read the clipboard, the caret is left there for the
 * keyboard's paste instead.
 */
export async function pasteAt(
  editor: LexicalEditor,
  target: ClipboardTarget,
  plain: boolean,
): Promise<void> {
  function place(): void {
    if (target.kind === "selection") $setSelection(target.selection.clone());
    else if (target.caret !== null) $setSelection(target.caret.clone());
    else {
      const line = $createParagraphNode();
      $getNodeByKey(target.key)?.insertAfter(line);
      line.select();
    }
  }
  const transfer = await readClipboard(plain);
  if (transfer === null) {
    editor.update(place);
    editor.focus();
    return;
  }
  if (plain) {
    editor.update(() => {
      place();
      const selection = $getSelection();
      if (selection !== null) $insertDataTransferForPlainText(transfer, selection);
    });
  } else {
    editor.update(place, {
      onUpdate: () =>
        editor.dispatchCommand(
          PASTE_COMMAND,
          new ClipboardEvent("paste", { clipboardData: transfer }),
        ),
    });
  }
  editor.focus();
}

/** One colour as `#rrggbb`, or nothing for a transparent one. */
function normaliseColour(value: string): string | null {
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(value);
  if (rgb === null) return /^#[\da-f]{3,8}$/i.test(value) ? value.toLowerCase() : null;
  const alpha =
    rgb[4] === undefined ? 1 : Number.parseFloat(rgb[4]) / (rgb[4].endsWith("%") ? 100 : 1);
  if (alpha === 0) return null;
  return `#${[rgb[1], rgb[2], rgb[3]].map((one) => Number(one).toString(16).padStart(2, "0")).join("")}`;
}

/** The font sizes kept: an em of the text around, or pixels within reason. */
function normaliseSize(value: string): string | null {
  const size = /^([\d.]+)(px|em|rem)$/.exec(value);
  if (size === null) return null;
  const amount = Number(size[1]);
  if (size[2] === "px") return amount >= 8 && amount <= 96 ? value : null;
  return amount >= 0.5 && amount <= 4 ? `${String(amount)}em` : null;
}

/**
 * A pasted style kept to what a document draws: its colour, its highlight,
 * its size and its first font. Everything else a page or a word processor
 * brings (margins, line heights, positions) is dropped.
 */
export function sanitiseStyle(style: string): string {
  const kept: string[] = [];
  for (const declaration of style.split(";")) {
    const at = declaration.indexOf(":");
    if (at < 0) continue;
    const property = declaration.slice(0, at).trim().toLowerCase();
    const raw = declaration.slice(at + 1).trim();
    const value =
      property === "color" || property === "background-color"
        ? normaliseColour(raw)
        : property === "font-size"
          ? normaliseSize(raw)
          : property === "font-family"
            ? (raw.split(",")[0]?.trim() ?? null)
            : null;
    if (value !== null && value !== "") kept.push(`${property}: ${value}`);
  }
  return kept.join("; ");
}

function $sanitiseText(node: TextNode): void {
  const style = node.getStyle();
  const next = sanitiseStyle(style);
  if (next !== style) node.setStyle(next);
}

function $sanitiseParagraph(node: ParagraphNode): void {
  const style = node.getStyle();
  const next = sanitiseStyle(style);
  if (next !== style) node.setStyle(next);
  const textStyle = node.getTextStyle();
  const nextText = sanitiseStyle(textStyle);
  if (nextText !== textStyle) node.setTextStyle(nextText);
}

/**
 * What a paste becomes. Cells copied from a spreadsheet fill the table being
 * edited from the cell in hand, adding the rows and columns they need, or
 * become a table of their own; a web address pasted over selected words
 * links them; markdown becomes headings, lists and the rest; HTML is read
 * through every extension's rules, its pictures and embeds as blocks of
 * their own; a copy made from a block's menu pastes whole. Pasted styles
 * keep only a colour, a highlight, a size and a font, and a link to an
 * address that is not safe is left as its words.
 */
export const pasteExtension = defineEditorExtension({
  name: "arc/paste",
  nodes: [MarkdownHolderNode],
  register: (editor) =>
    mergeRegister(
      registerCopies(editor),
      editor.registerNodeTransform(TextNode, $sanitiseText),
      editor.registerNodeTransform(ParagraphNode, $sanitiseParagraph),
      editor.registerNodeTransform(LinkNode, (node) => {
        if ($isLinkNode(node) && !isSafeUrl(node.getURL())) $unwrapInto(node);
      }),
    ),
  paste: [
    {
      priority: 30,
      $paste: (data, selection) => {
        const text = data.getData("text/plain");
        const html = data.getData("text/html");
        if (text.trim() === "") return false;
        const grid = clipboardGrid(text, html);
        if (grid === null) return false;
        const cell = $getTableCellNodeFromLexicalNode(selection.anchor.getNode());
        if (cell !== null) return $pasteGrid(cell, grid);
        if (html !== "" && !SPREADSHEET_HTML.test(html)) return false;
        const table = $tableFromGrid(grid);
        const top = selection.anchor.getNode().getTopLevelElement();
        if (top !== null && top.getTextContentSize() === 0) top.replace(table);
        else if (top !== null) top.insertAfter(table);
        else selection.insertNodes([table]);
        if (table.getNextSibling() === null) table.insertAfter($createParagraphNode());
        table.selectEnd();
        return true;
      },
    },
    {
      priority: 20,
      $paste: (data, selection) => {
        const single = data.getData("text/plain").trim();
        if (selection.isCollapsed() || /\s/.test(single)) return false;
        const url = $normalisedUrl(single);
        if (url === null) return false;
        $toggleLink(url);
        return true;
      },
    },
    {
      priority: 10,
      $paste: (data, selection, editor) => {
        const text = data.getData("text/plain");
        if (text.trim() === "" || data.types.includes(LEXICAL_TYPE)) return false;
        if (!isMarkdown(text.trim(), data.getData("text/html"))) return false;
        $insertMarkdown(editor, text, selection);
        return true;
      },
    },
    {
      priority: -100,
      $paste: (data, _selection, editor) => {
        const html = data.getData("text/html");
        if (html === "" || data.types.includes(LEXICAL_TYPE)) return false;
        $insertHtml(editor, new DOMParser().parseFromString(html, "text/html"));
        return true;
      },
    },
  ],
});
