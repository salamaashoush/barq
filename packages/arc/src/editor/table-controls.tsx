import { type Accessor, For, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLocale } from "@barqjs/aria/i18n";
import { type MoveMoveEvent, move } from "@barqjs/aria/interactions";
import { announce } from "@barqjs/aria/live";
import {
  type AnchorRect,
  overlayPosition,
  portalContainer,
  usePortalTarget,
} from "@barqjs/aria/overlays";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { useLexicalEditor } from "@barqjs/lexical";
import { GripHorizontal } from "@barqjs/lucide/icons/grip-horizontal";
import { GripVertical } from "@barqjs/lucide/icons/grip-vertical";
import { Table2 } from "@barqjs/lucide/icons/table-2";
import { Button } from "@barqjs/ui/button";
import { tokens } from "@barqjs/ui/theme/tokens";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { Portal } from "@barqjs/web";
import {
  $computeTableMapSkipCellCheck,
  $createTableSelectionFrom,
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $findCellNode,
  $findTableNode,
  $getTableCellNodeRect,
  $insertTableColumnAtSelection,
  $insertTableRowAtNode,
  $insertTableRowAtSelection,
  $isTableCellNode,
  $isTableNode,
  $isTableSelection,
  $mergeCells,
  $moveTableColumn,
  $moveTableRow,
  $setTableColumnIsHeader,
  $setTableRowIsHeader,
  $unmergeCellNode,
  TableCellHeaderStates,
  type TableCellNode,
  type TableNode,
} from "@lexical/table";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  type ElementFormatType,
  KEY_TAB_COMMAND,
  type LexicalEditor,
  type NodeKey,
  SKIP_DOM_SELECTION_TAG,
  mergeRegister,
} from "lexical";

import { type ArcMessages, useArcMessages } from "../components/messages.ts";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  elevation,
  focus,
  interaction,
  place,
  rounded,
  target,
  zIndex,
} from "../style/index.ts";
import { EDITOR_COLOURS, type EditorColour, HIGHLIGHT_COLOURS } from "./text-style.ts";
import { editorSignal, useRegistration } from "./hooks.ts";

/** Over the page at a place measured from the table, on the popovers' layer. */
const pinned = arc({ position: "fixed", zIndex: zIndex.popover });

export const tableControlsStyles = variants({
  slots: {
    root: arc({ zIndex: zIndex.popover }),
    trigger: arc({}),
    // A strip on the column's edge at the end of the line, the full height of the table.
    resizer: arc(pinned, place.afterLayer, interaction.resize, focus.visible, {
      inlineSize: "8px",
      "::after": { insetBlock: "0", insetInlineStart: "3px", inlineSize: "2px" },
      "&:hover::after, &:focus-visible::after, &[data-dragging]::after": {
        backgroundColor: tokens.ring,
      },
    }),
    grip: arc(pinned, bg.page, target.size, interaction.draggable, rounded.sm, elevation.raised, {
      "&[data-dragging]": { backgroundColor: tokens.accent },
    }),
  },
});

type Slots = ReturnType<typeof tableControlsStyles>;

/** The narrowest a column is dragged to, in px. */
const MIN_COLUMN = 48;
/** How far a key press widens or narrows a column, in px. */
const COLUMN_STEP = 8;
/** The most rows Tab in a table's last cell grows it to. */
const MAX_ROWS = 50;

export type TableAction =
  | "rowBefore"
  | "rowAfter"
  | "columnBefore"
  | "columnAfter"
  | "moveRowUp"
  | "moveRowDown"
  | "moveColumnBefore"
  | "moveColumnAfter"
  | "merge"
  | "split"
  | "lineAbove"
  | "lineBelow"
  | "deleteRow"
  | "deleteColumn"
  | "deleteTable";

export type TableLine = "row" | "column";

export type VerticalAlignment = "top" | "middle" | "bottom";

interface TableActionItem {
  id: TableAction;
  label: (messages: ArcMessages) => string;
}

const INSERTS: readonly TableActionItem[] = [
  { id: "rowBefore", label: (m) => m.insertRowBefore },
  { id: "rowAfter", label: (m) => m.insertRowAfter },
  { id: "columnBefore", label: (m) => m.insertColumnBefore },
  { id: "columnAfter", label: (m) => m.insertColumnAfter },
];

const MOVES: readonly TableActionItem[] = [
  { id: "moveRowUp", label: (m) => m.moveRowUp },
  { id: "moveRowDown", label: (m) => m.moveRowDown },
  { id: "moveColumnBefore", label: (m) => m.moveColumnBefore },
  { id: "moveColumnAfter", label: (m) => m.moveColumnAfter },
];

const DELETES: readonly TableActionItem[] = [
  { id: "deleteRow", label: (m) => m.deleteRow },
  { id: "deleteColumn", label: (m) => m.deleteColumn },
  { id: "deleteTable", label: (m) => m.deleteTable },
];

const LINE_ITEMS: Readonly<Record<TableLine, readonly TableAction[]>> = {
  row: ["rowBefore", "rowAfter", "moveRowUp", "moveRowDown"],
  column: ["columnBefore", "columnAfter", "moveColumnBefore", "moveColumnAfter"],
};

/** What a table's selection holds: the table, the cell in hand, every cell chosen. */
interface TableInHand {
  table: TableNode;
  cell: TableCellNode;
  cells: TableCellNode[];
}

/** The table the selection is in, from a caret in a cell or cells chosen across. */
function $tableInHand(): TableInHand | null {
  const selection = $getSelection();
  if ($isTableSelection(selection)) {
    const cells = selection.getNodes().filter($isTableCellNode);
    const cell = $findCellNode(selection.focus.getNode()) ?? cells[0] ?? null;
    const table = cell === null ? null : $findTableNode(cell);
    return cell === null || table === null ? null : { table, cell, cells };
  }
  if (!$isRangeSelection(selection)) return null;
  const cell = $findCellNode(selection.anchor.getNode());
  const table = cell === null ? null : $findTableNode(cell);
  return cell === null || table === null ? null : { table, cell, cells: [cell] };
}

interface CellPlace {
  row: number;
  column: number;
}

function placeOf(cell: TableCellNode): CellPlace {
  const rect = $getTableCellNodeRect(cell);
  return { row: rect?.rowIndex ?? 0, column: rect?.columnIndex ?? 0 };
}

/** The distinct cells along a row or a column of the grid. */
function $cellsOfLine(table: TableNode, line: TableLine, index: number): TableCellNode[] {
  const [map] = $computeTableMapSkipCellCheck(table, null, null);
  const cells = new Set<TableCellNode>();
  if (line === "row") for (const one of map[index] ?? []) cells.add(one.cell);
  else {
    for (const row of map) {
      const spot = row[index];
      if (spot !== undefined) cells.add(spot.cell);
    }
  }
  return [...cells];
}

function size(table: TableNode): CellPlace {
  const [map] = $computeTableMapSkipCellCheck(table, null, null);
  return { row: map.length, column: map[0]?.length ?? 0 };
}

/** Chooses a whole row or column, so what follows applies to all of it. */
export function $selectTableLine(table: TableNode, line: TableLine, index: number): void {
  const cells = $cellsOfLine(table, line, index);
  const first = cells[0];
  const last = cells.at(-1);
  if (first !== undefined && last !== undefined) {
    $setSelection($createTableSelectionFrom(table, first, last));
  }
}

/** Moves a row or column from one place to another, and says where it went. */
export function $moveTableLine(
  table: TableNode,
  line: TableLine,
  from: number,
  to: number,
): boolean {
  const count = line === "row" ? size(table).row : size(table).column;
  if (to < 0 || to >= count || to === from) return false;
  if (line === "row") $moveTableRow(table, from, to);
  else $moveTableColumn(table, from, to);
  return true;
}

/** A new line to type on just above or below a table, which one at the document's edge leaves no way to. */
export function $lineBesideTable(table: TableNode, after: boolean): void {
  const line = $createParagraphNode();
  if (after) table.insertAfter(line);
  else table.insertBefore(line);
  line.select();
}

/** Changes the table the selection is in, as the table's menus do. */
export function runTableAction(editor: LexicalEditor, action: TableAction): void {
  editor.update(() => {
    const hand = $tableInHand();
    if (hand === null) return;
    const { table, cell } = hand;
    const at = placeOf(cell);
    switch (action) {
      case "rowBefore":
      case "rowAfter":
        $insertTableRowAtSelection(action === "rowAfter");
        break;
      case "columnBefore":
      case "columnAfter":
        $insertTableColumnAtSelection(action === "columnAfter");
        break;
      case "moveRowUp":
      case "moveRowDown":
        $moveTableLine(table, "row", at.row, at.row + (action === "moveRowUp" ? -1 : 1));
        break;
      case "moveColumnBefore":
      case "moveColumnAfter":
        $moveTableLine(
          table,
          "column",
          at.column,
          at.column + (action === "moveColumnBefore" ? -1 : 1),
        );
        break;
      case "merge":
        if (hand.cells.length > 1) $mergeCells(hand.cells)?.selectStart();
        break;
      case "split":
        $unmergeCellNode(cell);
        break;
      case "lineAbove":
      case "lineBelow":
        $lineBesideTable(table, action === "lineBelow");
        break;
      case "deleteRow":
        $deleteTableRowAtSelection();
        break;
      case "deleteColumn":
        $deleteTableColumnAtSelection();
        break;
      case "deleteTable": {
        const next = table.getNextSibling() ?? table.getPreviousSibling();
        table.remove();
        next?.selectStart();
        break;
      }
    }
  });
}

/** Makes the first row of the table the selection is in a header row, or plain again. */
export function setHeaderRow(editor: LexicalEditor, header: boolean): void {
  editor.update(() => {
    const hand = $tableInHand();
    if (hand !== null) $setTableRowIsHeader(hand.table, 0, header);
  });
}

/** Makes the first column of the table the selection is in a header column, or plain again. */
export function setHeaderColumn(editor: LexicalEditor, header: boolean): void {
  editor.update(() => {
    const hand = $tableInHand();
    if (hand !== null) $setTableColumnIsHeader(hand.table, 0, header);
  });
}

/** Stripes the rows of the table the selection is in, or takes the stripes off. */
export function setStripedRows(editor: LexicalEditor, striped: boolean): void {
  editor.update(() => {
    $tableInHand()?.table.setRowStriping(striped);
  });
}

/** Colours the chosen cells, or the one in hand, or gives them back the table's own with `null`. */
export function setCellColour(editor: LexicalEditor, colour: string | null): void {
  editor.update(() => {
    for (const cell of $tableInHand()?.cells ?? []) cell.setBackgroundColor(colour);
  });
}

/** Aligns the text of the chosen cells along the line. */
export function setCellAlignment(editor: LexicalEditor, format: ElementFormatType): void {
  editor.update(() => {
    for (const cell of $tableInHand()?.cells ?? []) {
      for (const child of cell.getChildren()) if ($isElementNode(child)) child.setFormat(format);
    }
  });
}

/** Sets where the text of the chosen cells sits, top to bottom. */
export function setCellVerticalAlignment(editor: LexicalEditor, value: VerticalAlignment): void {
  editor.update(() => {
    for (const cell of $tableInHand()?.cells ?? []) {
      cell.setVerticalAlign(value === "top" ? null : value);
    }
  });
}

/**
 * Tab in a table's last cell adds a row and goes on into it, as a word
 * processor does; anywhere else Tab is the table's own, to the next cell.
 */
function $addRowFromLastCell(event: KeyboardEvent): boolean {
  if (event.shiftKey) return false;
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const cell = $findCellNode(selection.anchor.getNode());
  const table = cell === null ? null : $findTableNode(cell);
  if (cell === null || table === null) return false;
  const [map] = $computeTableMapSkipCellCheck(table, null, null);
  if (!(map.at(-1)?.at(-1)?.cell.is(cell) ?? false) || map.length >= MAX_ROWS) return false;
  event.preventDefault();
  const row = $insertTableRowAtNode(cell, true);
  const first = row?.getFirstChild();
  if ($isTableCellNode(first)) first.selectStart();
  return true;
}

/** Tab in a table's last cell grows it by a row, in every editor holding tables. */
export function registerTableKeys(editor: LexicalEditor): () => void {
  return editor.registerCommand(KEY_TAB_COMMAND, $addRowFromLastCell, COMMAND_PRIORITY_CRITICAL);
}

interface CellEdge {
  x: number;
  top: number;
  height: number;
}

interface LineBox {
  /** Where the line's grip goes, in the viewport. */
  x: number;
  y: number;
}

interface CellState {
  key: NodeKey;
  table: NodeKey;
  row: number;
  column: number;
  headerRow: boolean;
  headerColumn: boolean;
  striped: boolean;
  /** More than one cell is chosen, which merge takes into one. */
  several: boolean;
  /** The cell spans more than one place, which split takes apart. */
  spans: boolean;
  colour: string;
  align: ElementFormatType;
  vertical: VerticalAlignment;
  rect: AnchorRect;
  /** The column's edge at the end of the line, and the table's top and height, in the viewport. */
  edge: CellEdge;
  width: number;
  rtl: boolean;
  rows: LineBox[];
  columns: LineBox[];
}

function hasHeader(cell: TableCellNode, state: number): boolean {
  return (cell.getHeaderStyles() & state) !== 0;
}

export interface TableControlsProps extends Customisable<Slots> {}

/**
 * Tables worked on where they stand. A button at the corner of the cell in
 * hand opens what can be done: rows and columns added, moved or deleted,
 * the header row and column switched, cells merged and split, coloured and
 * aligned, the rows striped, a line added above or below. Every row and
 * column has a grip: press it to choose the whole line and open its menu,
 * drag it, or press Alt with the arrows on it, to move the line. Buttons
 * rather than hover zones, so a keyboard and a finger reach all of it as a
 * pointer does; "before" and "after" follow the reading direction. The
 * column's edge beside the caret drags, or moves with the arrows, to resize.
 */
export function TableControls(props: TableControlsProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const locale = useLocale();
  function cls(): Slots {
    return parts(tableControlsStyles(), props.classes);
  }
  const [cell, setCell] = editorSignal<CellState | null>(null);
  const [dragging, setDragging] = editorSignal<string | null>(null);
  const ref = makeRef<HTMLDivElement>();
  const portal = usePortalTarget();
  // A menu of the table's takes focus, and the selection's DOM with it; the
  // table it acts on stays in hand until it closes.
  let held = false;

  function read(): void {
    if (held) return;
    const found = editor.read(() => {
      const hand = editor.isEditable() ? $tableInHand() : null;
      if (hand === null) return null;
      const { table, cell: node } = hand;
      const at = placeOf(node);
      const { row: rows, column: columns } = size(table);
      const firstRow = $cellsOfLine(table, "row", 0);
      const firstColumn = $cellsOfLine(table, "column", 0);
      const block = node.getFirstChild();
      return {
        key: node.getKey(),
        table: table.getKey(),
        row: at.row,
        column: at.column,
        rows,
        columns,
        headerRow: firstRow.every((one) => hasHeader(one, TableCellHeaderStates.ROW)),
        headerColumn: firstColumn.every((one) => hasHeader(one, TableCellHeaderStates.COLUMN)),
        striped: table.getRowStriping(),
        several: hand.cells.length > 1,
        spans: node.getColSpan() > 1 || node.getRowSpan() > 1,
        colour: node.getBackgroundColor() ?? "",
        align: $isElementNode(block) ? block.getFormatType() : "",
        vertical: (node.getVerticalAlign() ?? "top") as VerticalAlignment,
      };
    });
    const element = found === null ? null : editor.getElementByKey(found.key);
    const tableElement = element?.closest("table") ?? null;
    if (found === null || element === null || tableElement === null) {
      setCell(null);
      return;
    }
    const box = element.getBoundingClientRect();
    const frame = tableElement.getBoundingClientRect();
    // The document's own direction, which the editor keeps on the text's frame.
    const rtl = editor.getRootElement()?.parentElement?.getAttribute("dir") === "rtl";
    const rows = [...tableElement.rows].map((one): LineBox => {
      const line = one.getBoundingClientRect();
      return { x: rtl ? frame.right + 2 : frame.left - 22, y: line.top + line.height / 2 - 10 };
    });
    const columns = [...(tableElement.rows[0]?.cells ?? [])].map((one): LineBox => {
      const line = one.getBoundingClientRect();
      return { x: line.left + line.width / 2 - 10, y: frame.top - 22 };
    });
    setCell({
      ...found,
      rect: { top: box.top, left: box.left, width: box.width, height: box.height },
      edge: { x: rtl ? box.left : box.right, top: frame.top, height: frame.height },
      width: box.width,
      rtl,
      rows: rows.slice(0, found.rows),
      columns: columns.slice(0, found.columns),
    });
  }
  useRegistration(() => mergeRegister(editor.registerUpdateListener(read)));

  function hold(open: boolean): void {
    held = open;
    if (!open) read();
  }

  function act(action: TableAction): void {
    held = false;
    runTableAction(editor, action);
    editor.focus();
  }

  const position = overlayPosition({
    targetRef: () => (cell() === null ? null : editor.getElementByKey(cell()!.key)),
    overlayRef: ref,
    placement: () => "top end",
    offset: () => -12,
    isOpen: () => cell() !== null,
    direction: () => locale().direction,
  });

  // The widths the drag started from, every column's, measured if the table
  // has none of its own yet.
  let widths: number[] | null = null;
  const [resizing, setResizing] = editorSignal(false);
  const { moveProps } = move({
    onMoveStart: () => {
      setResizing(true);
      const at = cell();
      if (at === null) return;
      const element = editor.getElementByKey(at.key)?.closest("table");
      const measured = [...(element?.rows[0]?.cells ?? [])].map((one) => one.offsetWidth);
      widths = editor.read(() => {
        const table = $getNodeByKey(at.table);
        const own = $isTableNode(table) ? table.getColWidths() : undefined;
        return [...(own ?? measured)];
      });
    },
    onMove: (event: MoveMoveEvent) => {
      const at = cell();
      if (at === null || widths === null) return;
      const rtl = locale().direction === "rtl";
      const step = event.pointerType === "keyboard" ? COLUMN_STEP : 1;
      const delta = event.deltaX * step * (rtl ? -1 : 1);
      const next = [...widths];
      next[at.column] = Math.max(MIN_COLUMN, (next[at.column] ?? at.width) + delta);
      widths = next;
      // The focus stays on the edge being moved, not the text.
      editor.update(
        () => {
          const table = $getNodeByKey(at.table);
          if ($isTableNode(table)) table.setColWidths(next);
        },
        { tag: SKIP_DOM_SELECTION_TAG },
      );
    },
    onMoveEnd: () => {
      setResizing(false);
      widths = null;
    },
  });

  /** Moves a line to `to` and says where it went. */
  function moveLine(line: TableLine, from: number, to: number): void {
    const at = cell();
    if (at === null) return;
    let moved = false;
    editor.update(() => {
      const table = $getNodeByKey(at.table);
      if (!$isTableNode(table) || !$moveTableLine(table, line, from, to)) return;
      moved = true;
      $selectTableLine(table, line, to);
    });
    if (moved) {
      const total = line === "row" ? at.rows.length : at.columns.length;
      announce(messages().tableMoved(line, to + 1, total), "polite");
    }
  }

  function chooseLine(line: TableLine, index: number): void {
    const at = cell();
    if (at === null) return;
    editor.update(() => {
      const table = $getNodeByKey(at.table);
      if ($isTableNode(table)) $selectTableLine(table, line, index);
    });
  }

  /** Where a dragged grip lands: the line whose middle the pointer passed last. */
  function dropIndex(line: TableLine, x: number, y: number): number {
    const at = cell();
    if (at === null) return 0;
    const boxes = line === "row" ? at.rows : at.columns;
    let index = 0;
    for (const [at2, box] of boxes.entries()) {
      const past = line === "row" ? y > box.y + 10 : cell()!.rtl ? x < box.x + 10 : x > box.x + 10;
      if (past) index = at2;
    }
    return index;
  }

  // Before the grip's own press handling, which keeps the events to itself.
  function gripEvents(line: TableLine, index: () => number) {
    return (element: HTMLElement): (() => void) => {
      let dragged = false;
      function onDown(event: PointerEvent): void {
        if (event.button !== 0) return;
        const startX = event.clientX;
        const startY = event.clientY;
        dragged = false;
        function onMove(next: PointerEvent): void {
          if (!dragged && Math.hypot(next.clientX - startX, next.clientY - startY) < 6) return;
          dragged = true;
          setDragging(`${line}:${String(index())}`);
        }
        function onUp(next: PointerEvent): void {
          element.removeEventListener("pointermove", onMove);
          element.removeEventListener("pointerup", onUp);
          element.removeEventListener("pointercancel", onUp);
          setDragging(null);
          if (dragged) moveLine(line, index(), dropIndex(line, next.clientX, next.clientY));
        }
        element.setPointerCapture?.(event.pointerId);
        element.addEventListener("pointermove", onMove);
        element.addEventListener("pointerup", onUp);
        element.addEventListener("pointercancel", onUp);
      }
      function onClick(event: MouseEvent): void {
        if (!dragged) return;
        dragged = false;
        event.preventDefault();
        event.stopPropagation();
      }
      function onKey(event: KeyboardEvent): void {
        if (!event.altKey) return;
        const rtl = cell()?.rtl === true;
        const back = line === "row" ? "ArrowUp" : rtl ? "ArrowRight" : "ArrowLeft";
        const on = line === "row" ? "ArrowDown" : rtl ? "ArrowLeft" : "ArrowRight";
        if (event.key !== back && event.key !== on) return;
        event.preventDefault();
        event.stopPropagation();
        moveLine(line, index(), index() + (event.key === back ? -1 : 1));
      }
      element.addEventListener("pointerdown", onDown, true);
      element.addEventListener("click", onClick, true);
      element.addEventListener("keydown", onKey, true);
      return () => {
        element.removeEventListener("pointerdown", onDown, true);
        element.removeEventListener("click", onClick, true);
        element.removeEventListener("keydown", onKey, true);
      };
    };
  }

  function lineLabel(line: TableLine, index: number): string {
    return line === "row" ? messages().tableRow(index + 1) : messages().tableColumn(index + 1);
  }

  function grips(line: TableLine, boxes: Accessor<readonly LineBox[]>) {
    return (
      <For each={boxes()} keyed={false}>
        {(box: Accessor<LineBox>, index: number) => (
          <span ref={gripEvents(line, () => index)}>
            <DropdownMenu
              onOpenChange={(open: boolean) => {
                if (open) chooseLine(line, index);
                hold(open);
              }}
            >
              <DropdownMenuTrigger>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  class={cls().grip}
                  aria-label={lineLabel(line, index)}
                  title={messages().dragTableLine}
                  data-slot={`table-${line}-grip`}
                  data-dragging={dragging() === `${line}:${String(index)}` ? "" : undefined}
                  style={{ left: `${String(box().x)}px`, top: `${String(box().y)}px` }}
                >
                  {line === "row" ? (
                    <GripVertical aria-hidden="true" />
                  ) : (
                    <GripHorizontal aria-hidden="true" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent aria-label={lineLabel(line, index)} align="start">
                <For each={LINE_ITEMS[line]}>
                  {(id: TableAction) => (
                    <DropdownMenuItem
                      isDisabled={lineDisabled(line, index, id, boxes().length)}
                      onSelect={() => act(id)}
                    >
                      {[...INSERTS, ...MOVES].find((one) => one.id === id)?.label(messages())}
                    </DropdownMenuItem>
                  )}
                </For>
                <DropdownMenuSeparator />
                <StyleItems />
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => act(line === "row" ? "deleteRow" : "deleteColumn")}
                >
                  {line === "row" ? messages().deleteRow : messages().deleteColumn}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        )}
      </For>
    );
  }

  function lineDisabled(line: TableLine, index: number, id: TableAction, count: number): boolean {
    if (id === (line === "row" ? "moveRowUp" : "moveColumnBefore")) return index === 0;
    if (id === (line === "row" ? "moveRowDown" : "moveColumnAfter")) return index >= count - 1;
    return false;
  }

  function isDisabled(id: TableAction): boolean {
    const at = cell();
    if (at === null) return true;
    switch (id) {
      case "moveRowUp":
        return at.row === 0;
      case "moveRowDown":
        return at.row >= at.rows.length - 1;
      case "moveColumnBefore":
        return at.column === 0;
      case "moveColumnAfter":
        return at.column >= at.columns.length - 1;
      case "merge":
        return !at.several;
      case "split":
        return !at.spans;
      default:
        return false;
    }
  }

  /** Colour, alignment and vertical alignment, for the cells chosen or the one in hand. */
  function StyleItems() {
    const colours: readonly (EditorColour | "default")[] = ["default", ...EDITOR_COLOURS];
    return (
      <>
        <DropdownMenuLabel>{messages().cellColour}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={
            EDITOR_COLOURS.find((name) => HIGHLIGHT_COLOURS[name] === cell()?.colour) ?? "default"
          }
          onValueChange={(value: string) => {
            held = false;
            setCellColour(
              editor,
              value === "default" ? null : HIGHLIGHT_COLOURS[value as EditorColour],
            );
          }}
        >
          <For each={colours}>
            {(name: EditorColour | "default") => (
              <DropdownMenuRadioItem value={name}>
                {name === "default" ? messages().defaultColour : messages().colourName(name)}
              </DropdownMenuRadioItem>
            )}
          </For>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{messages().cellAlignment}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={cell()?.align === "" ? "start" : (cell()?.align ?? "start")}
          onValueChange={(value: string) => {
            held = false;
            setCellAlignment(editor, value as ElementFormatType);
          }}
        >
          <DropdownMenuRadioItem value="start">{messages().alignStart}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="center">{messages().alignCenter}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="end">{messages().alignEnd}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{messages().verticalAlignment}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={cell()?.vertical ?? "top"}
          onValueChange={(value: string) => {
            held = false;
            setCellVerticalAlignment(editor, value as VerticalAlignment);
          }}
        >
          <DropdownMenuRadioItem value="top">{messages().alignTop}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="middle">{messages().alignMiddle}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="bottom">{messages().alignBottom}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </>
    );
  }

  return (
    <Show when={cell()}>
      {(current: () => CellState) => (
        <Portal mount={portalContainer(portal)}>
          <>
            <div
              {...moveProps}
              class={cls().resizer}
              data-slot="table-column-resizer"
              data-dragging={resizing() ? "" : undefined}
              role="separator"
              aria-orientation="vertical"
              aria-label={messages().resizeColumn}
              aria-valuenow={Math.round(current().width)}
              aria-valuemin={MIN_COLUMN}
              tabIndex={0}
              style={{
                left: `${String(current().edge.x - 4)}px`,
                top: `${String(current().edge.top)}px`,
                height: `${String(current().edge.height)}px`,
              }}
            />
            {grips("row", () => current().rows)}
            {grips("column", () => current().columns)}
            <div
              {...position.overlayProps}
              ref={ref.set}
              class={arc(cls().root, props.class, props.className)}
              data-slot="table-controls"
            >
              <DropdownMenu onOpenChange={hold}>
                <DropdownMenuTrigger>
                  <Button
                    variant="outline"
                    size="icon-xs"
                    class={cls().trigger}
                    aria-label={messages().tableActions}
                    data-slot="table-controls-trigger"
                  >
                    <Table2 aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent aria-label={messages().tableActions} align="end">
                  <For each={[INSERTS, MOVES]}>
                    {(group: readonly TableActionItem[]) => (
                      <>
                        <For each={group}>
                          {(action: TableActionItem) => (
                            <DropdownMenuItem
                              isDisabled={isDisabled(action.id)}
                              onSelect={() => act(action.id)}
                            >
                              {action.label(messages())}
                            </DropdownMenuItem>
                          )}
                        </For>
                        <DropdownMenuSeparator />
                      </>
                    )}
                  </For>
                  <DropdownMenuItem isDisabled={isDisabled("merge")} onSelect={() => act("merge")}>
                    {messages().mergeCells}
                  </DropdownMenuItem>
                  <DropdownMenuItem isDisabled={isDisabled("split")} onSelect={() => act("split")}>
                    {messages().splitCell}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={current().headerRow}
                    onCheckedChange={(checked: boolean) => setHeaderRow(editor, checked)}
                  >
                    {messages().headerRow}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={current().headerColumn}
                    onCheckedChange={(checked: boolean) => setHeaderColumn(editor, checked)}
                  >
                    {messages().headerColumn}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={current().striped}
                    onCheckedChange={(checked: boolean) => setStripedRows(editor, checked)}
                  >
                    {messages().stripedRows}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <StyleItems />
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => act("lineAbove")}>
                    {messages().lineAbove}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => act("lineBelow")}>
                    {messages().lineBelow}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <For each={DELETES}>
                    {(action: TableActionItem) => (
                      <DropdownMenuItem variant="destructive" onSelect={() => act(action.id)}>
                        {action.label(messages())}
                      </DropdownMenuItem>
                    )}
                  </For>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        </Portal>
      )}
    </Show>
  );
}
