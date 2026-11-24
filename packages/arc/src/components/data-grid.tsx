import { For, Show, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { numberFormatter, useDirection } from "@barqjs/aria/i18n";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { Plus } from "@barqjs/lucide/icons/plus";
import { ref as makeRef } from "@barqjs/primitives/refs";
import { virtual } from "@barqjs/primitives/virtual";
import {
  type Cell,
  type CellSelectionDirection,
  type CellSelectionState,
  type ColumnDef,
  type ExpandedState,
  type Header,
  type Row,
  type RowData,
  cellSelectionFeature,
  columnGroupingFeature,
  createExpandedRowModel,
  createGroupedRowModel,
  createTable,
  rowExpandingFeature,
  tableFeatures,
} from "@barqjs/table";
import { Button } from "@barqjs/ui/button";
import { Checkbox } from "@barqjs/ui/checkbox";
import { icon } from "@barqjs/ui/shared-icon";
import { srOnly } from "@barqjs/ui/sr-only";
import {
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@barqjs/ui/table";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  control,
  edge,
  fg,
  focus,
  gap,
  interaction,
  layout,
  rounded,
  space,
  tone,
  type,
} from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

const features = tableFeatures({
  cellSelectionFeature,
  columnGroupingFeature,
  rowExpandingFeature,
  groupedRowModel: createGroupedRowModel(),
  expandedRowModel: createExpandedRowModel(),
});

type Features = typeof features;

export type DataGridCellType = "text" | "number" | "select" | "date" | "checkbox";

export interface DataGridOption {
  value: string;
  label: string;
}

export type DataGridTotal = "sum" | "mean" | "count" | "min" | "max";

export interface DataGridColumn<T extends RowData> {
  id: string;
  header: string;
  /** The row's field it shows. @default `id` */
  field?: keyof T & string;
  /** Which editor a cell opens, and how a pasted value is read. @default "text" */
  type?: DataGridCellType;
  /** A `select` column's choices. */
  options?: readonly DataGridOption[];
  /** @default true, when the grid has `onCellsChange` */
  editable?: boolean;
  /** Stays in view at the reading start while the grid scrolls sideways. Frozen columns come first. */
  frozen?: boolean;
  /** In pixels. @default 160 */
  width?: number;
  /** Totals the column in the footer and in each group's row. */
  total?: DataGridTotal;
  /** How a value is shown. @default numbers in the locale, the rest as text */
  format?: (value: unknown) => string;
  /** Why a value cannot be taken, or nothing. The editor stays open with the reason. */
  validate?: (value: unknown, row: T) => string | undefined;
}

/** Columns under one header that spans them. */
export interface DataGridColumnGroup<T extends RowData> {
  id: string;
  header: string;
  columns: readonly DataGridColumn<T>[];
}

export interface DataGridChange<T extends RowData> {
  rowId: string;
  columnId: string;
  field: string;
  value: unknown;
  row: T;
}

export const dataGridStyles = variants({
  slots: {
    root: arc(layout.column, gap[2], layout.minZero),
    scroller: arc(layout.relative, edge.all, rounded.md, { overflow: "auto" }),
    table: arc(type.sm, { borderCollapse: "separate", borderSpacing: "0", width: "max-content" }),
    head: arc(layout.sticky, bg.page, edge.bottom, { top: "0" }),
    group: arc({ textAlign: "center" }),
    cell: arc(focus.inset, edge.bottom, interaction.selected, {
      outline: "none",
      "[aria-invalid=true]": { boxShadow: "inset 0 0 0 2px var(--danger)" },
    }),
    numeric: arc(type.numeric, { textAlign: "end" }),
    frozen: arc(layout.sticky, bg.page, { insetInlineStart: "var(--arc-frozen-start, 0px)" }),
    dirty: arc(tone.warning, {
      backgroundImage: `linear-gradient(135deg, var(--arc-tone) 0 ${space.x1_5}, transparent 0)`,
    }),
    groupRow: arc(bg.muted, type.medium),
    groupToggle: arc(control.bare, layout.inlineRow, gap[1]),
    total: arc(type.medium, type.numeric, bg.muted),
    editor: arc(control.bareInput, type.sm, { width: "100%", minWidth: "0" }),
    error: arc(type.caption, fg.danger),
    footer: arc(layout.row, gap[2]),
  },
});

type Slots = ReturnType<typeof dataGridStyles>;

export interface DataGridProps<T extends RowData> extends Customisable<Slots> {
  /** Names the grid. */
  label: string;
  data: readonly T[];
  getRowId: (row: T) => string;
  columns: readonly (DataGridColumn<T> | DataGridColumnGroup<T>)[];
  /**
   * Every edit, paste and clear, as one batch of changes; the data is the
   * caller's to update. Without it the grid is read-only.
   */
  onCellsChange?: (changes: DataGridChange<T>[]) => void;
  /** Adds an Add row button under the grid. */
  onAddRow?: () => void;
  /** Group the rows by this column's value, a row per group with its totals. */
  groupBy?: string;
  /** Cells changed since the last save, each `rowId:columnId`, marked in a corner. */
  dirtyCells?: ReadonlySet<string>;
  /** Draw only the rows on screen, each this many pixels tall, in a box `height` tall. */
  virtualRowHeight?: number;
  /** @default "28rem" when virtual */
  height?: string;
}

function isGroup<T extends RowData>(
  column: DataGridColumn<T> | DataGridColumnGroup<T>,
): column is DataGridColumnGroup<T> {
  return "columns" in column;
}

interface Editing {
  rowId: string;
  columnId: string;
  draft: string;
  error?: string;
}

const STEP: Record<string, CellSelectionDirection> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/** A value typed or pasted as text, read by the column's type. */
function parse(kind: DataGridCellType, written: string): unknown {
  const trimmed = written.trim();
  if (kind === "number") {
    if (trimmed === "") return null;
    const number = Number(trimmed.replace(/[\s,]/g, ""));
    return Number.isNaN(number) ? trimmed : number;
  }
  if (kind === "checkbox") return ["true", "yes", "1", "x", "✓"].includes(trimmed.toLowerCase());
  return trimmed;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return value.toString();
  return JSON.stringify(value) ?? "";
}

function totalOf(total: DataGridTotal, values: readonly unknown[]): number {
  const numbers = values.filter((one): one is number => typeof one === "number");
  if (total === "count") return values.filter((one) => one !== null && one !== "").length;
  if (numbers.length === 0) return 0;
  if (total === "sum") return numbers.reduce((sum, one) => sum + one, 0);
  if (total === "mean") return numbers.reduce((sum, one) => sum + one, 0) / numbers.length;
  if (total === "min") return Math.min(...numbers);
  return Math.max(...numbers);
}

/**
 * A grid to edit like a spreadsheet: typed cells, a range selected with the
 * pointer or Shift and the arrows, ranges copied and pasted as text, rows
 * grouped with their totals, columns grouped under shared headers, frozen
 * columns, a row added at the end, and only the rows on screen drawn.
 *
 * ```tsx
 * <DataGrid
 *   label="Budget"
 *   data={lines()}
 *   getRowId={(line) => line.id}
 *   groupBy="team"
 *   columns={[
 *     { id: "item", header: "Item", frozen: true },
 *     { id: "team", header: "Team", type: "select", options: TEAMS },
 *     { id: "plan", header: "Plan", columns: [
 *       { id: "q1", header: "Q1", type: "number", total: "sum" },
 *       { id: "q2", header: "Q2", type: "number", total: "sum" },
 *     ] },
 *     { id: "approved", header: "Approved", type: "checkbox" },
 *   ]}
 *   onCellsChange={(changes) => apply(changes)}
 *   onAddRow={addLine}
 * />
 * ```
 *
 * On `@barqjs/table`'s cell selection. The arrows move a cell in the reading
 * direction, Shift with them grows the range, Home and End go to a row's
 * ends and Mod with them to the grid's; Enter or F2 edits (and a typed
 * character replaces), Enter saves and goes down, Tab saves and goes on,
 * Escape lets the edit go; Space ticks a checkbox; Delete clears the range;
 * Mod+C copies it and a paste fills from the focused cell.
 */
export function DataGrid<T extends RowData>(props: DataGridProps<T>) {
  const messages = useArcMessages();
  const direction = useDirection();
  const digits = numberFormatter({ maximumFractionDigits: 2 });
  const cls = (): Slots => parts(dataGridStyles(), props.classes);
  const scroller = makeRef<HTMLDivElement>();
  const [selection, setSelection] = createSignal<CellSelectionState>([]);
  const [expanded, setExpanded] = createSignal<ExpandedState>(true);
  const [editing, setEditing] = createSignal<Editing | null>(null);
  const [said, setSaid] = createSignal("");

  const leaves = (): DataGridColumn<T>[] => {
    const all = props.columns.flatMap((column) => (isGroup(column) ? column.columns : [column]));
    return [
      ...all.filter((one) => one.frozen === true),
      ...all.filter((one) => one.frozen !== true),
    ];
  };
  const columnOf = (id: string): DataGridColumn<T> | undefined =>
    leaves().find((one) => one.id === id);
  const fieldOf = (column: DataGridColumn<T>): string => column.field ?? column.id;
  const valueOf = (row: T, column: DataGridColumn<T>): unknown =>
    (row as Record<string, unknown>)[fieldOf(column)];
  const canEdit = (column: DataGridColumn<T> | undefined): boolean =>
    column !== undefined && props.onCellsChange !== undefined && column.editable !== false;
  const show = (column: DataGridColumn<T>, value: unknown): string => {
    if (column.format !== undefined) return column.format(value);
    if (column.type === "select") {
      return column.options?.find((option) => option.value === value)?.label ?? toText(value);
    }
    if (typeof value === "number") return digits().format(value);
    return toText(value);
  };

  const definition = (column: DataGridColumn<T>): ColumnDef<Features, T> =>
    ({
      id: column.id,
      header: column.header,
      accessorFn: (row: T) => valueOf(row, column),
      size: column.width ?? 160,
    }) as ColumnDef<Features, T>;

  const columns = (): ColumnDef<Features, T>[] => {
    const frozenFirst = [
      ...props.columns.filter((one) => !isGroup(one) && one.frozen === true),
      ...props.columns.filter((one) => isGroup(one) || one.frozen !== true),
    ];
    return frozenFirst.map((column) =>
      isGroup(column)
        ? {
            id: column.id,
            header: column.header,
            columns: column.columns.map(definition),
          }
        : definition(column),
    );
  };

  const table = createTable(() => ({
    features,
    columns: columns(),
    data: props.data as T[],
    getRowId: (row: T) => props.getRowId(row),
    enableCellSelection: true,
    autoResetCellSelection: false,
    enableCellRangeSelection: true,
    groupedColumnMode: false,
    state: {
      cellSelection: selection(),
      grouping: props.groupBy === undefined ? [] : [props.groupBy],
      expanded: expanded(),
    },
    onCellSelectionChange: (updater: unknown) => {
      const current = untrack(selection);
      setSelection(
        typeof updater === "function"
          ? (updater as (old: CellSelectionState) => CellSelectionState)(current)
          : (updater as CellSelectionState),
      );
    },
    onExpandedChange: (updater: unknown) => {
      const current = untrack(expanded);
      setExpanded(
        typeof updater === "function"
          ? (updater as (old: ExpandedState) => ExpandedState)(current)
          : (updater as ExpandedState),
      );
    },
  }));

  const rows = (): readonly Row<Features, T>[] => table.getRowModel().rows;
  const dataRows = (): Row<Features, T>[] =>
    rows().filter((row) => !(row as unknown as { getIsGrouped: () => boolean }).getIsGrouped());

  const isVirtual = (): boolean => props.virtualRowHeight !== undefined;
  const span = isServer
    ? undefined
    : virtual(() => (isVirtual() ? scroller() : null), {
        count: () => rows().length,
        size: () => props.virtualRowHeight ?? 36,
      });
  const shown = (): { row: Row<Features, T>; index: number }[] => {
    if (!isVirtual() || span === undefined) {
      return rows().map((row, index) => ({ row, index }));
    }
    return span.items().flatMap((item) => {
      const row = rows()[item.index];
      return row === undefined ? [] : [{ row, index: item.index }];
    });
  };
  const rowById = (): Map<string, Row<Features, T>> => new Map(rows().map((row) => [row.id, row]));
  const rowIndex = (): Map<string, number> => new Map(rows().map((row, at) => [row.id, at]));
  const shownIds = (): string[] => shown().map((entry) => entry.row.id);
  const leafIds = (): string[] => leaves().map((column) => column.id);
  const before = (): number => (isVirtual() ? (span?.items()[0]?.start ?? 0) : 0);
  const after = (): number => {
    if (!isVirtual() || span === undefined) return 0;
    const last = span.items().at(-1);
    return last === undefined ? 0 : Math.max(0, span.total() - last.start - last.size);
  };

  const cellId = (rowId: string, columnId: string): string => `${rowId}:${columnId}`;

  const focusCell = (): void => {
    queueMicrotask(() => {
      const focused = table.getFocusedCell();
      if (focused === undefined) return;
      const root = scroller();
      const wanted = cellId(focused.row.id, focused.column.id);
      const find = () =>
        [...(root?.querySelectorAll<HTMLElement>("[data-cell]") ?? [])].find(
          (element) => element.dataset.cell === wanted,
        );
      const element = find();
      if (element !== undefined) {
        element.focus();
        return;
      }
      const index = rows().findIndex((row) => row.id === focused.row.id);
      if (index >= 0) span?.scrollTo(index);
      requestAnimationFrame(() => find()?.focus());
    });
  };

  const change = (changes: DataGridChange<T>[]): void => {
    if (changes.length > 0) props.onCellsChange?.(changes);
  };

  const changeOf = (row: Row<Features, T>, column: DataGridColumn<T>, value: unknown) => ({
    rowId: row.id,
    columnId: column.id,
    field: fieldOf(column),
    value,
    row: row.original,
  });

  const begin = (cell: Cell<Features, T>, draft?: string): void => {
    const column = columnOf(cell.column.id);
    if (!canEdit(column) || column === undefined || column.type === "checkbox") return;
    setEditing({
      rowId: cell.row.id,
      columnId: cell.column.id,
      draft: draft ?? toText(cell.getValue()),
    });
  };

  const commit = (then?: CellSelectionDirection): boolean => {
    const held = editing();
    if (held === null) return true;
    const column = columnOf(held.columnId);
    const row = rows().find((one) => one.id === held.rowId);
    if (column === undefined || row === undefined) {
      setEditing(null);
      return true;
    }
    const value = parse(column.type ?? "text", held.draft);
    const problem =
      column.type === "number" && typeof value === "string"
        ? messages().notANumber
        : column.validate?.(value, row.original);
    if (problem !== undefined) {
      setEditing({ ...held, error: problem });
      return false;
    }
    setEditing(null);
    if (value !== valueOf(row.original, column)) change([changeOf(row, column, value)]);
    if (then !== undefined) table.moveCellSelection(then);
    focusCell();
    return true;
  };

  const cancel = (): void => {
    setEditing(null);
    focusCell();
  };

  const toggle = (cell: Cell<Features, T>): void => {
    const column = columnOf(cell.column.id);
    if (!canEdit(column) || column === undefined || column.type !== "checkbox") return;
    change([changeOf(cell.row, column, cell.getValue() !== true)]);
  };

  /** The selected cells as rows of leaf cells, the first range only, skipping group rows. */
  const selectedBlock = (): { row: Row<Features, T>; columns: DataGridColumn<T>[] }[] => {
    const range = selection().at(-1);
    if (range === undefined) return [];
    const order = leaves().map((one) => one.id);
    const rowOrder = rows().map((one) => one.id);
    const [c0, c1] = [
      order.indexOf(range.anchorColumnId),
      order.indexOf(range.focusColumnId),
    ].toSorted((a, b) => a - b);
    const [r0, r1] = [
      rowOrder.indexOf(range.anchorRowId),
      rowOrder.indexOf(range.focusRowId),
    ].toSorted((a, b) => a - b);
    const picked = leaves().slice(c0, (c1 ?? 0) + 1);
    return rows()
      .slice(r0, (r1 ?? 0) + 1)
      .filter((row) => !(row as unknown as { getIsGrouped: () => boolean }).getIsGrouped())
      .map((row) => ({ row, columns: picked }));
  };

  const copy = (): void => {
    const text = selectedBlock()
      .map(({ row, columns: picked }) =>
        picked.map((column) => toText(valueOf(row.original, column))).join("\t"),
      )
      .join("\n");
    void navigator.clipboard?.writeText(text);
    const count = selectedBlock().reduce((sum, line) => sum + line.columns.length, 0);
    setSaid(messages().cellsCopied(count));
  };

  const paste = (text: string): void => {
    const focused = table.getFocusedCell();
    if (focused === undefined) return;
    const lines = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
    const order = leaves();
    const startColumn = order.findIndex((one) => one.id === focused.column.id);
    const body = dataRows();
    const startRow = body.findIndex((one) => one.id === focused.row.id);
    if (startColumn < 0 || startRow < 0) return;
    const changes: DataGridChange<T>[] = [];
    lines.forEach((line, down) => {
      const row = body[startRow + down];
      if (row === undefined) return;
      line.split("\t").forEach((piece, across) => {
        const column = order[startColumn + across];
        if (column === undefined || !canEdit(column)) return;
        const value = parse(column.type ?? "text", piece);
        if (column.type === "number" && typeof value === "string") return;
        if (column.validate?.(value, row.original) !== undefined) return;
        changes.push(changeOf(row, column, value));
      });
    });
    change(changes);
    setSaid(messages().cellsPasted(changes.length));
  };

  const clear = (): void => {
    const changes = selectedBlock().flatMap(({ row, columns: picked }) =>
      picked
        .filter((column) => canEdit(column))
        .map((column) =>
          changeOf(
            row,
            column,
            column.type === "checkbox" ? false : column.type === "number" ? null : "",
          ),
        ),
    );
    change(changes);
  };

  const toEdge = (columnEdge: "start" | "end", wholeGrid: boolean): void => {
    const focused = table.getFocusedCell();
    const order = leaves();
    const column = columnEdge === "start" ? order[0] : order.at(-1);
    const row = wholeGrid ? (columnEdge === "start" ? rows()[0] : rows().at(-1)) : focused?.row;
    if (column === undefined || row === undefined) return;
    table.setFocusedCell(row.id, column.id);
    focusCell();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (editing() !== null) return;
    const focused = table.getFocusedCell();
    const mod = event.metaKey || event.ctrlKey;
    const step = STEP[event.key];
    if (step !== undefined) {
      event.preventDefault();
      const flipped =
        direction() === "rtl" && (step === "left" || step === "right")
          ? step === "left"
            ? "right"
            : "left"
          : step;
      if (event.shiftKey) table.extendCellSelection(flipped);
      else table.moveCellSelection(flipped);
      focusCell();
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      toEdge(event.key === "Home" ? "start" : "end", mod);
      return;
    }
    if (event.key === "Tab") {
      const order = leaves();
      const at = order.findIndex((one) => one.id === focused?.column.id);
      const leaving = event.shiftKey ? at <= 0 : at >= order.length - 1;
      if (focused === undefined || leaving) return;
      event.preventDefault();
      table.moveCellSelection(event.shiftKey ? "left" : "right");
      focusCell();
      return;
    }
    if (mod && event.key.toLowerCase() === "c") {
      event.preventDefault();
      copy();
      return;
    }
    if (mod && event.key.toLowerCase() === "a") {
      event.preventDefault();
      table.selectAllCells();
      return;
    }
    if (focused === undefined) return;
    const column = columnOf(focused.column.id);
    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      if (column?.type === "checkbox") toggle(focused);
      else begin(focused);
      return;
    }
    if (event.key === " " && column?.type === "checkbox") {
      event.preventDefault();
      toggle(focused);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      clear();
      return;
    }
    if (event.key.length === 1 && !mod && !event.altKey && column?.type !== "checkbox") {
      event.preventDefault();
      begin(focused, event.key);
    }
  };

  const headerGroups = () => table.getHeaderGroups();
  const totals = (): boolean => leaves().some((one) => one.total !== undefined);
  const frozenStart = (columnId: string): string | undefined => {
    const order = leaves();
    const at = order.findIndex((one) => one.id === columnId);
    const column = order[at];
    if (column?.frozen !== true) return undefined;
    const start = order.slice(0, at).reduce((sum, one) => sum + (one.width ?? 160), 0);
    return `${String(start)}px`;
  };
  const cellClass = (column: DataGridColumn<T> | undefined): string =>
    arc(
      cls().cell,
      column?.type === "number" ? cls().numeric : undefined,
      column?.frozen === true ? cls().frozen : undefined,
    );

  const groupTotal = (row: Row<Features, T>, column: DataGridColumn<T>): string => {
    if (column.total === undefined) return "";
    const leafRows = (row as unknown as { getLeafRows: () => Row<Features, T>[] }).getLeafRows();
    return digits().format(
      totalOf(
        column.total,
        leafRows.map((one) => valueOf(one.original, column)),
      ),
    );
  };
  const grandTotal = (column: DataGridColumn<T>): string =>
    column.total === undefined
      ? ""
      : digits().format(
          totalOf(
            column.total,
            props.data.map((one) => valueOf(one, column)),
          ),
        );

  const Editor = (editorProps: { column: DataGridColumn<T>; held: Editing }) => {
    const column = editorProps.column;
    const keys = (event: KeyboardEvent): void => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      } else if (event.key === "Enter") {
        event.preventDefault();
        commit("down");
      } else if (event.key === "Tab") {
        event.preventDefault();
        commit(event.shiftKey ? "left" : "right");
      }
    };
    const set = (event: Event): void => {
      const held = editing();
      if (held === null) return;
      setEditing({
        ...held,
        draft: (event.currentTarget as HTMLInputElement).value,
        error: undefined,
      });
    };
    const grab = (element: HTMLElement): void => {
      queueMicrotask(() => element.focus());
    };
    const invalid = (): "true" | undefined =>
      editorProps.held.error === undefined ? undefined : "true";
    return (
      <Show
        when={column.type === "select"}
        fallback={
          <input
            ref={grab}
            class={cls().editor}
            data-slot="data-grid-editor"
            aria-label={column.header}
            aria-invalid={invalid()}
            type={column.type === "date" ? "date" : "text"}
            inputmode={column.type === "number" ? "decimal" : undefined}
            value={editorProps.held.draft}
            onInput={set}
            onKeyDown={keys}
            onBlur={() => {
              if (editing() !== null) commit();
            }}
          />
        }
      >
        <select
          ref={grab}
          class={cls().editor}
          data-slot="data-grid-editor"
          aria-label={column.header}
          aria-invalid={invalid()}
          value={editorProps.held.draft}
          onChange={set}
          onKeyDown={keys}
          onBlur={() => {
            if (editing() !== null) commit();
          }}
        >
          <For each={column.options ?? []}>
            {(option: DataGridOption) => <option value={option.value}>{option.label}</option>}
          </For>
        </select>
      </Show>
    );
  };

  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="data-grid">
      <div
        ref={scroller.set}
        class={cls().scroller}
        data-slot="data-grid-scroller"
        style={isVirtual() ? { height: props.height ?? "28rem" } : undefined}
      >
        <table
          role="grid"
          class={cls().table}
          data-slot="data-grid-table"
          aria-label={props.label}
          aria-multiselectable="true"
          aria-rowcount={rows().length + headerGroups().length + (totals() ? 1 : 0)}
          aria-colcount={leaves().length}
          aria-readonly={props.onCellsChange === undefined ? "true" : undefined}
          onKeyDown={onKeyDown}
          onCopy={(event: ClipboardEvent) => {
            if (editing() !== null) return;
            event.preventDefault();
            copy();
          }}
          onPaste={(event: ClipboardEvent) => {
            if (editing() !== null) return;
            event.preventDefault();
            paste(event.clipboardData?.getData("text/plain") ?? "");
          }}
        >
          <TableHeader class={cls().head} data-slot="data-grid-head">
            <For each={headerGroups()}>
              {(group: { id: string; headers: readonly Header<Features, T>[] }) => (
                <TableRow role="row">
                  <For each={group.headers}>
                    {(header: Header<Features, T>) => (
                      <TableHead
                        role="columnheader"
                        colSpan={header.colSpan}
                        aria-colspan={header.colSpan > 1 ? header.colSpan : undefined}
                        class={arc(
                          header.colSpan > 1 ? cls().group : undefined,
                          columnOf(header.column.id)?.frozen === true ? cls().frozen : undefined,
                          columnOf(header.column.id)?.type === "number" ? cls().numeric : undefined,
                        )}
                        data-slot={
                          header.colSpan > 1 ? "data-grid-group-header" : "data-grid-header"
                        }
                        style={{
                          width:
                            header.colSpan > 1
                              ? undefined
                              : `${String(columnOf(header.column.id)?.width ?? 160)}px`,
                          "--arc-frozen-start": frozenStart(header.column.id),
                        }}
                      >
                        {header.isPlaceholder ? null : String(header.column.columnDef.header ?? "")}
                      </TableHead>
                    )}
                  </For>
                </TableRow>
              )}
            </For>
          </TableHeader>
          <TableBody data-slot="data-grid-body">
            <Show when={before() > 0}>
              <tr aria-hidden="true" style={{ height: `${String(before())}px` }} />
            </Show>
            <For each={shownIds()}>
              {(rowId: string) => {
                const row = (): Row<Features, T> => rowById().get(rowId) as Row<Features, T>;
                const index = (): number => rowIndex().get(rowId) ?? 0;
                const grouped = (): boolean =>
                  (row() as unknown as { getIsGrouped: () => boolean }).getIsGrouped();
                const groupValue = (): string =>
                  toText((row() as unknown as { groupingValue?: unknown }).groupingValue);
                const cellOf = (columnId: string): Cell<Features, T> =>
                  row()
                    .getAllCells()
                    .find((one) => one.column.id === columnId) as Cell<Features, T>;
                return (
                  <Show
                    when={grouped()}
                    fallback={
                      <TableRow
                        role="row"
                        data-slot="data-grid-row"
                        aria-rowindex={index() + headerGroups().length + 1}
                        style={
                          isVirtual()
                            ? { height: `${String(props.virtualRowHeight)}px` }
                            : undefined
                        }
                      >
                        <For each={leafIds()}>
                          {(columnId: string) => {
                            const column = columnOf(columnId);
                            const cell = (): Cell<Features, T> => cellOf(columnId);
                            const key = `${rowId}:${columnId}`;
                            const held = (): Editing | null => {
                              const now = editing();
                              return now !== null &&
                                now.rowId === rowId &&
                                now.columnId === columnId
                                ? now
                                : null;
                            };
                            return (
                              <TableCell
                                role="gridcell"
                                class={arc(
                                  cellClass(column),
                                  props.dirtyCells?.has(key) === true ? cls().dirty : undefined,
                                )}
                                data-slot="data-grid-cell"
                                data-cell={cellId(rowId, columnId)}
                                data-dirty={props.dirtyCells?.has(key) === true ? "" : undefined}
                                tabIndex={cell().getTabIndex()}
                                aria-selected={cell().getIsSelected()}
                                data-selected={cell().getIsSelected() ? "" : undefined}
                                aria-readonly={canEdit(column) ? undefined : "true"}
                                aria-invalid={held()?.error === undefined ? undefined : "true"}
                                style={{ "--arc-frozen-start": frozenStart(columnId) }}
                                onPointerDown={(event: PointerEvent) =>
                                  cell().getSelectionStartHandler()(event)
                                }
                                onMouseEnter={(event: MouseEvent) =>
                                  cell().getSelectionExtendHandler()(event)
                                }
                                onClick={(event: MouseEvent) => {
                                  if (event.detail >= 2) begin(cell());
                                }}
                              >
                                <Show
                                  when={held() !== null && column !== undefined}
                                  fallback={
                                    column?.type === "checkbox" ? (
                                      <Checkbox
                                        aria-label={column.header}
                                        checked={cell().getValue() === true}
                                        disabled={!canEdit(column)}
                                        excludeFromTabOrder
                                        onCheckedChange={() => toggle(cell())}
                                      />
                                    ) : column === undefined ? (
                                      ""
                                    ) : (
                                      show(column, cell().getValue())
                                    )
                                  }
                                >
                                  <Editor
                                    column={column as DataGridColumn<T>}
                                    held={held() as Editing}
                                  />
                                  <Show when={held()?.error !== undefined}>
                                    <span class={cls().error} role="alert">
                                      {held()?.error}
                                    </span>
                                  </Show>
                                </Show>
                              </TableCell>
                            );
                          }}
                        </For>
                      </TableRow>
                    }
                  >
                    <TableRow
                      role="row"
                      class={cls().groupRow}
                      data-slot="data-grid-group"
                      aria-rowindex={index() + headerGroups().length + 1}
                      aria-expanded={row().getIsExpanded()}
                    >
                      <For each={leafIds()}>
                        {(columnId: string, at: () => number) => {
                          const column = columnOf(columnId);
                          const cell = (): Cell<Features, T> => cellOf(columnId);
                          return (
                            <TableCell
                              role="gridcell"
                              class={cellClass(column)}
                              data-cell={cellId(rowId, columnId)}
                              tabIndex={cell().getTabIndex()}
                              aria-selected={cell().getIsSelected()}
                              data-selected={cell().getIsSelected() ? "" : undefined}
                              style={{ "--arc-frozen-start": frozenStart(columnId) }}
                              onPointerDown={(event: PointerEvent) =>
                                cell().getSelectionStartHandler()(event)
                              }
                            >
                              <Show
                                when={at() === 0}
                                fallback={column === undefined ? "" : groupTotal(row(), column)}
                              >
                                <button
                                  type="button"
                                  class={cls().groupToggle}
                                  aria-label={messages().groupOf(
                                    groupValue(),
                                    row().subRows.length,
                                  )}
                                  tabIndex={-1}
                                  onClick={() => row().toggleExpanded()}
                                >
                                  <ChevronRight
                                    aria-hidden="true"
                                    class={icon.directional}
                                    style={{ rotate: row().getIsExpanded() ? "90deg" : undefined }}
                                  />
                                  {`${groupValue()} (${String(row().subRows.length)})`}
                                </button>
                              </Show>
                            </TableCell>
                          );
                        }}
                      </For>
                    </TableRow>
                  </Show>
                );
              }}
            </For>
            <Show when={after() > 0}>
              <tr aria-hidden="true" style={{ height: `${String(after())}px` }} />
            </Show>
          </TableBody>
          <Show when={totals()}>
            <TableFooter data-slot="data-grid-totals">
              <TableRow role="row">
                <For each={leaves()}>
                  {(column: DataGridColumn<T>, at: () => number) => (
                    <TableCell
                      role="gridcell"
                      class={arc(cellClass(column), cls().total)}
                      style={{ "--arc-frozen-start": frozenStart(column.id) }}
                    >
                      {at() === 0 && column.total === undefined
                        ? messages().total
                        : grandTotal(column)}
                    </TableCell>
                  )}
                </For>
              </TableRow>
            </TableFooter>
          </Show>
        </table>
      </div>
      <Show when={props.onAddRow !== undefined}>
        <div class={cls().footer} data-slot="data-grid-footer">
          <Button
            variant="outline"
            size="sm"
            onPress={() => {
              props.onAddRow?.();
              queueMicrotask(() => {
                const last = dataRows().at(-1);
                const first = leaves().find((one) => canEdit(one));
                if (last !== undefined && first !== undefined) {
                  table.setFocusedCell(last.id, first.id);
                  focusCell();
                }
              });
            }}
          >
            <Plus aria-hidden="true" />
            {messages().addRow}
          </Button>
        </div>
      </Show>
      <span class={srOnly} role="status" data-slot="data-grid-status">
        {said()}
      </span>
    </div>
  );
}
