import { For, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLocale } from "@barqjs/aria/i18n";
import { type MoveMoveEvent, move } from "@barqjs/aria/interactions";
import {
  type AnchorRect,
  overlayPosition,
  portalContainer,
  usePortalTarget,
} from "@barqjs/aria/overlays";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { useLexicalEditor } from "@barqjs/lexical";
import { Table2 } from "@barqjs/lucide/icons/table-2";
import { Button } from "@barqjs/ui/button";
import { tokens } from "@barqjs/ui/theme/tokens";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { Portal } from "@barqjs/web";
import {
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $findCellNode,
  $findTableNode,
  $getTableColumnIndexFromTableCellNode,
  $getTableRowIndexFromTableCellNode,
  $insertTableColumnAtSelection,
  $insertTableRowAtSelection,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  $setTableRowIsHeader,
  TableCellHeaderStates,
} from "@lexical/table";
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
  type NodeKey,
  SKIP_DOM_SELECTION_TAG,
} from "lexical";

import { type ArcMessages, useArcMessages } from "../components/messages.ts";
import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { focus, interaction, place, zIndex } from "../style/index.ts";
import { editorSignal, useRegistration } from "./hooks.ts";

export const tableControlsStyles = variants({
  slots: {
    root: arc({ zIndex: zIndex.popover }),
    trigger: arc({}),
    // A strip on the column's edge at the end of the line, the full height of the table.
    resizer: arc(place.afterLayer, interaction.resize, focus.visible, {
      position: "fixed",
      zIndex: zIndex.popover,
      inlineSize: "8px",
      "::after": { insetBlock: "0", insetInlineStart: "3px", inlineSize: "2px" },
      "&:hover::after, &:focus-visible::after, &[data-dragging]::after": {
        backgroundColor: tokens.ring,
      },
    }),
  },
});

type Slots = ReturnType<typeof tableControlsStyles>;

interface CellEdge {
  x: number;
  top: number;
  height: number;
}

interface CellPlace {
  key: NodeKey;
  header: boolean;
  rect: AnchorRect;
  table: NodeKey;
  column: number;
  /** The column's edge at the end of the line, and the table's top and height, in the viewport. */
  edge: CellEdge;
  width: number;
}

/** The narrowest a column is dragged to, in px. */
const MIN_COLUMN = 48;
/** How far a key press widens or narrows a column, in px. */
const COLUMN_STEP = 8;

type TableAction =
  | "rowBefore"
  | "rowAfter"
  | "columnBefore"
  | "columnAfter"
  | "deleteRow"
  | "deleteColumn"
  | "deleteTable";

interface TableActionItem {
  id: TableAction;
  label: (messages: ArcMessages) => string;
}

const ACTIONS: readonly TableActionItem[] = [
  { id: "rowBefore", label: (m) => m.insertRowBefore },
  { id: "rowAfter", label: (m) => m.insertRowAfter },
  { id: "columnBefore", label: (m) => m.insertColumnBefore },
  { id: "columnAfter", label: (m) => m.insertColumnAfter },
  { id: "deleteRow", label: (m) => m.deleteRow },
  { id: "deleteColumn", label: (m) => m.deleteColumn },
  { id: "deleteTable", label: (m) => m.deleteTable },
];

/** Changes the table the selection is in, as the table actions menu does. */
export function runTableAction(editor: LexicalEditor, action: TableAction): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    const table = $findTableNode(selection.anchor.getNode());
    if (table === null) return;
    switch (action) {
      case "rowBefore":
      case "rowAfter":
        $insertTableRowAtSelection(action === "rowAfter");
        break;
      case "columnBefore":
      case "columnAfter":
        $insertTableColumnAtSelection(action === "columnAfter");
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
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    const table = $findTableNode(selection.anchor.getNode());
    if (table !== null) $setTableRowIsHeader(table, 0, header);
  });
}

export interface TableControlsProps extends Customisable<Slots> {}

/**
 * A button at the corner of the cell the caret is in that opens what can be
 * done to its table: rows and columns added before or after, either
 * deleted, the header row switched, the table removed. A button rather than
 * a hover grip, so a keyboard and a finger reach it as a pointer does;
 * "before" and "after" follow the reading direction.
 */
export function TableControls(props: TableControlsProps) {
  const editor = useLexicalEditor();
  const messages = useArcMessages();
  const locale = useLocale();
  function cls(): Slots {
    return parts(tableControlsStyles(), props.classes);
  }
  const [cell, setCell] = editorSignal<CellPlace | null>(null);
  const ref = makeRef<HTMLDivElement>();
  const target = usePortalTarget();

  function read(): void {
    const found = editor.read(() => {
      const selection = $getSelection();
      if (!editor.isEditable() || !$isRangeSelection(selection)) return null;
      const node = $findCellNode(selection.anchor.getNode());
      if (node === null) return null;
      const table = $findTableNode(node);
      const first = table?.getFirstChild();
      const header =
        $isTableRowNode(first) &&
        first
          .getChildren()
          .every(
            (one) =>
              $isTableCellNode(one) && (one.getHeaderStyles() & TableCellHeaderStates.ROW) !== 0,
          );
      return {
        key: node.getKey(),
        header,
        row: $getTableRowIndexFromTableCellNode(node),
        table: table?.getKey() ?? "",
        column: $getTableColumnIndexFromTableCellNode(node),
      };
    });
    const element = found === null ? null : editor.getElementByKey(found.key);
    if (found === null || element === null) {
      setCell(null);
      return;
    }
    const box = element.getBoundingClientRect();
    const frame = element.closest("table")?.getBoundingClientRect() ?? box;
    const rtl = getComputedStyle(element).direction === "rtl";
    setCell({
      key: found.key,
      header: found.header,
      rect: { top: box.top, left: box.left, width: box.width, height: box.height },
      table: found.table,
      column: found.column,
      edge: { x: rtl ? box.left : box.right, top: frame.top, height: frame.height },
      width: box.width,
    });
  }
  useRegistration(() => editor.registerUpdateListener(read));

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
  const [dragging, setDragging] = editorSignal(false);
  const { moveProps } = move({
    onMoveStart: () => {
      setDragging(true);
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
      setDragging(false);
      widths = null;
    },
  });

  return (
    <Show when={cell()}>
      {(current: () => CellPlace) => (
        <Portal mount={portalContainer(target)}>
          <>
            <div
              {...moveProps}
              class={cls().resizer}
              data-slot="table-column-resizer"
              data-dragging={dragging() ? "" : undefined}
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
            <div
              {...position.overlayProps}
              ref={ref.set}
              class={arc(cls().root, props.class, props.className)}
              data-slot="table-controls"
            >
              <DropdownMenu>
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
                  <For each={ACTIONS}>
                    {(action: (typeof ACTIONS)[number], index: () => number) => (
                      <>
                        <Show when={index() === 4}>
                          <DropdownMenuSeparator />
                        </Show>
                        <DropdownMenuItem
                          variant={action.id.startsWith("delete") ? "destructive" : "default"}
                          onSelect={() => {
                            runTableAction(editor, action.id);
                            editor.focus();
                          }}
                        >
                          {action.label(messages())}
                        </DropdownMenuItem>
                      </>
                    )}
                  </For>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={current().header}
                    onCheckedChange={(checked: boolean) => setHeaderRow(editor, checked)}
                  >
                    {messages().headerRow}
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        </Portal>
      )}
    </Show>
  );
}
