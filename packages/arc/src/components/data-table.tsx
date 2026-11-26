import {
  type Child,
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  provide,
  untrack,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import { controllable } from "@barqjs/aria/utils";
import { RouterContext } from "@barqjs/aria/interactions";
import type { Key } from "@barqjs/aria/collections";
import {
  Cell,
  Column,
  ColumnResizer,
  ResizableTableContainer,
  Row,
  type SortDescriptor,
  Table,
  TableBody,
  TableExpandButton,
  TableHeader,
  TableLoadMoreItem,
  useRow,
  useTable,
} from "@barqjs/aria/table";
import type { ColumnSize } from "@barqjs/aria/table-column-layout";
import { Virtualizer, listLayout } from "@barqjs/aria/virtualizer";
import { ArrowDown } from "@barqjs/lucide/icons/arrow-down";
import { ArrowUp } from "@barqjs/lucide/icons/arrow-up";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { ChevronsUpDown } from "@barqjs/lucide/icons/chevrons-up-down";
import { CircleAlert } from "@barqjs/lucide/icons/circle-alert";
import { mediaQuery } from "@barqjs/primitives/media";
import {
  type ColumnDef,
  type Header,
  type Row as TableRow,
  type SortingState,
  type ColumnVisibilityState,
  type RowData,
  FlexRender,
  columnVisibilityFeature,
  createPaginatedRowModel,
  createSortedRowModel,
  createTable,
  rowPaginationFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from "@barqjs/table";
import { Button } from "@barqjs/ui/button";
import { Checkbox } from "@barqjs/ui/checkbox";
import { icon } from "@barqjs/ui/shared-icon";
import { Skeleton } from "@barqjs/ui/skeleton";
import { Spinner } from "@barqjs/ui/spinner";
import { srOnly } from "@barqjs/ui/sr-only";
import { isServer } from "@barqjs/web";

import { type Breakpoint, breakpointQuery, on } from "@barqjs/ui/conditions";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  control,
  edge,
  fg,
  focus,
  gap,
  glyph,
  interaction,
  layout,
  motion,
  place,
  plainList,
  rounded,
  space,
  square,
  surface,
  type,
} from "../style/index.ts";
import { useArcMessages } from "./messages.ts";
import { type DataTableRowAction, RowActions } from "./data-table-parts.tsx";
import { DescriptionList } from "./description-list.tsx";
import { EmptyState } from "./empty-state.tsx";
import { linkRouter, maybeRouter } from "./link.ts";
import { Pager } from "./pager.tsx";
import { SelectionBar, type SelectionAction } from "./selection-bar.tsx";

const features = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns,
});

/** The table-core features a `DataTable` registers: sorting, visibility and pages. */
export type DataTableFeatures = typeof features;

export type { Breakpoint };

/** What arc adds to a TanStack column. */
export interface DataTableColumnOptions {
  /** Hidden on screens narrower than this breakpoint. */
  hideBelow?: Breakpoint;
  /** `end` for numbers, so their digits line up. @default "start" */
  align?: "start" | "end";
  /** This column's cells name their row. @default the first column */
  isRowHeader?: boolean;
  /** Its name in the view options, when the header is not plain text. */
  label?: string;
  /** The column's track, as CSS: `"12rem"`, `"minmax(6rem, 1fr)"`. @default "minmax(8rem, 1fr)" */
  width?: string;
  /** Where a resized column starts. @default an equal share */
  defaultWidth?: ColumnSize;
  minWidth?: number;
  maxWidth?: number;
}

/** A TanStack column definition, with arc's options beside it. */
export type DataTableColumn<T extends RowData> = ColumnDef<DataTableFeatures, T> &
  DataTableColumnOptions;

export interface DataTablePagination {
  /** Rows on a page. */
  pageSize: number;
  /** The page shown, from 0. Leave it out and the table keeps its own. */
  pageIndex?: number;
  defaultPageIndex?: number;
  onPageIndexChange?: (pageIndex: number) => void;
  /** How many pages the server has, for pages fetched one at a time. Rows are then taken as the page. */
  pageCount?: number;
}

export interface DataTableLabels {
  /** @default "Select all" */
  selectAll?: string;
  /** Names a row's checkbox, before the row's own name. @default "Select" */
  selectRow?: string;
  /** @default "Loading more" */
  loadingMore?: string;
  /** @default "Previous page" */
  previous?: string;
  /** @default "Next page" */
  next?: string;
  /** @default "Page 1 of 3" */
  page?: (page: number, pages: number) => string;
  /** @default "Pages" */
  pagination?: string;
  /** @default "Resize column" */
  resize?: string;
}

/** A failed load, said in place of the rows. */
export interface DataTableError {
  /** The server's words, as a sentence. */
  message: string;
  /** The request's id, for a support ticket. */
  requestId?: string;
}

/** How a row reads as a card on a phone. */
export interface DataTableCard<T> {
  title: (row: T) => Child;
  /** At the start: an avatar, an icon. */
  leading?: (row: T) => Child;
  /** A muted line under the title. */
  fact?: (row: T) => Child;
  /** At the end: a `Status`. */
  status?: (row: T) => Child;
}

/** A summing row under the rows: a label, and a value for each column it sums, by column id. */
export interface DataTableTotal {
  id: string;
  label: string;
  cells: Readonly<Record<string, Child>>;
}

export type { DataTableRowAction };

export interface DataTableProps<T extends RowData> extends Customisable<Slots> {
  /** Names the table for a screen reader. */
  label: string;
  columns: readonly DataTableColumn<T>[];
  /** `undefined` while the first load is under way. */
  data: readonly T[] | undefined;
  getRowId: (row: T) => string;
  /** Shows skeleton rows in place of the data. @default `data === undefined` */
  isLoading?: boolean;
  /** How many skeleton rows. @default 5 */
  skeletonRows?: number;
  /** What an empty table shows. @default an `EmptyState` saying there is nothing here */
  empty?: Child;
  /** The load failed: said in place of the rows, with Try again when `onRetry` is given. */
  error?: DataTableError | null;
  /** Its promise holds Try again pending. */
  onRetry?: () => void | Promise<unknown>;
  /** Under the rows, inside the frame: a `DataTableNote` or a `DataTableCount`. */
  footer?: Child;
  /** The row whose detail is open, marked `aria-current` while a sheet steps through the rows. */
  activeKey?: string | null;
  /** Its own density, whatever the page's: `compact` for logs read in bulk. */
  density?: "compact" | "comfortable" | "spacious";
  /** Rows as cards below the `md` step, a phone's width. */
  card?: DataTableCard<T>;
  /** `cards` draws the cards at every width, for a table in a narrow column. @default "responsive" */
  layout?: "responsive" | "cards";
  /** Summing rows under the rows. */
  totals?: readonly DataTableTotal[];
  /** A row's own actions: at most one `inline` beside it, the rest in a menu named after the row. */
  rowActions?: (row: T) => readonly DataTableRowAction[];

  /** The order, as TanStack writes it. Leave it out and the table keeps its own. */
  sorting?: SortingState;
  defaultSorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  /** The rows arrive sorted, from a server that sorted them. */
  manualSorting?: boolean;

  /** @default "none" */
  selectionMode?: "none" | "single" | "multiple";
  selectedKeys?: ReadonlySet<string>;
  defaultSelectedKeys?: Iterable<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  /** What can be done to the selected rows, in a bar shown while there are any. */
  selectionActions?: readonly SelectionAction<T>[];
  /** Says how many are selected, in the bar. @default "3 selected" */
  selectedLabel?: (count: number) => string;

  /** Which columns show, by id. A column left out shows. */
  columnVisibility?: ColumnVisibilityState;
  defaultColumnVisibility?: ColumnVisibilityState;
  onColumnVisibilityChange?: (visibility: ColumnVisibilityState) => void;

  /** Columns get a handle that drags or arrows them wider or narrower. */
  resizable?: boolean;
  /** A resize ended, with every column's width: what to keep for next time. */
  onColumnResize?: (widths: Map<string, ColumnSize>) => void;

  /** Where a row leads. The whole row is the link; buttons in it stay buttons. */
  rowHref?: (row: T) => string;
  /** Called when a row is pressed or Enter is pressed on it. */
  onRowAction?: (row: T) => void;

  /**
   * A row's own rows: the table becomes a tree, each parent opening and
   * closing with the arrows on its `treeColumn` cell or the button there.
   */
  getSubRows?: (row: T) => readonly T[] | undefined;
  /** The column whose cells open their row. @default the first column */
  treeColumn?: string;
  /** The rows open. Leave it out and the table keeps its own. */
  expandedKeys?: Iterable<string>;
  defaultExpandedKeys?: Iterable<string>;
  onExpandedChange?: (keys: Set<string>) => void;

  pagination?: DataTablePagination;
  /** Asked for the next page when the end of the rows comes into reach. */
  onLoadMore?: () => void;
  /** Whether there is more to load. @default `onLoadMore !== undefined` */
  hasMore?: boolean;
  isLoadingMore?: boolean;

  /**
   * Renders only the rows on screen, for a long list. The table scrolls
   * inside `height`, and every row is this tall, in pixels.
   */
  virtualRowHeight?: number;
  /** The scrolling region's height, as CSS. Its header sticks to its top. */
  height?: string;

  labels?: DataTableLabels;
}

const SELECT = "__arc-select";
const ACTIONS = "__arc-actions";
const LOADER = "__arc-loader";
const SKELETON = "__arc-skeleton-";

interface ColumnItem {
  id: string;
  /** The TanStack header, or none for the selection column. */
  header: Header<DataTableFeatures, RowData> | null;
  options: DataTableColumnOptions;
  allowsSorting: boolean;
  isRowHeader: boolean;
  defaultWidth?: ColumnSize | null;
  minWidth?: number | null;
  maxWidth?: number | null;
}

type RowItem =
  | {
      id: string;
      kind: "row";
      row: TableRow<DataTableFeatures, RowData>;
      /** Its own rows, in a tree. */
      children?: RowItem[];
    }
  | { id: string; kind: "skeleton" }
  | { id: string; kind: "loader" };

/** A cell's room, which the header's cells, the body's and the pager share. */
const cellPad = arc(place.padded);

/** Numbers sit at the end, in the column and in its header alike. */
const aligned = arc({ '[data-align="end"]': { justifyContent: "flex-end", textAlign: "end" } });

/** The header's row and a totals row lay their cells on the body's column tracks. */
const onColumns = arc({
  '& > [role="row"]': {
    display: "grid",
    gridTemplateColumns: "var(--arc-data-table-columns)",
    alignItems: "center",
  },
});

/** The row or card whose detail is open beside the table. */
const currentRow = arc({ '[aria-current="true"]': { backgroundColor: "var(--accent)" } });

/** A list's last row leaves the frame's own edge to close it. */
const lastOpen = arc({ ":last-child": { borderBlockEndWidth: "0px" } });

export const dataTableStyles = variants({
  slots: {
    root: arc({}),
    frame: arc(layout.relative, layout.minZero, edge.all, rounded.lg, bg.card, {
      overflowX: "auto",
      [on.md]: { "&:not([data-scrolls])": { overflowX: "clip" } },
      "[data-scrolls]": { overflow: "auto", overscrollBehavior: "contain" },
    }),
    grid: arc(layout.column, type.sm, focus.none, focus.inset, { minWidth: "min-content" }),
    header: arc(surface.sunken, layout.sticky, onColumns, {
      top: "var(--arc-data-table-sticky-top, 0px)",
      boxShadow: "inset 0 -1px 0 var(--border)",
      '& > [role="row"]': { minHeight: space.x9 },
    }),
    body: arc(layout.relative),
    row: arc(
      edge.bottom,
      focus.none,
      focus.inset,
      interaction.hover,
      interaction.focusWithin,
      interaction.selected,
      motion.colours,
      currentRow,
      lastOpen,
      {
        display: "grid",
        gridTemplateColumns: "var(--arc-data-table-columns)",
        alignItems: "center",
        minHeight: space.x11,
        "[data-href]": { cursor: "pointer" },
      },
    ),
    head: arc(
      layout.relative,
      layout.row,
      layout.minZero,
      layout.nowrap,
      gap[1],
      type.medium,
      fg.muted,
      focus.none,
      focus.inset,
      glyph.sm,
      aligned,
      {
        height: "100%",
        paddingInline: space.x3,
        "[data-allows-sorting]": {
          cursor: "pointer",
          [on.hover]: { ":hover": { color: "var(--foreground)" } },
        },
        "[data-sort-direction]": { color: "var(--foreground)" },
      },
    ),
    cell: arc(
      layout.relative,
      layout.row,
      layout.minZero,
      layout.clip,
      focus.none,
      focus.inset,
      cellPad,
      aligned,
      {
        '[data-align="end"]': { fontVariantNumeric: "tabular-nums" },
        '[role="rowheader"]': {
          fontWeight: "var(--font-weight-medium)",
          color: "var(--foreground)",
        },
      },
    ),
    checkbox: arc({ paddingInlineEnd: "0px" }),
    resizer: arc(place.afterLayer, interaction.resize, {
      position: "absolute",
      insetBlock: "0px",
      insetInlineEnd: "0px",
      width: space.x2,
      "::after": {
        insetBlock: "25%",
        insetInlineEnd: "0px",
        width: "1px",
        backgroundColor: "var(--border)",
      },
      "[data-hovered], [data-resizing], [data-focus-visible]": {
        "::after": { insetBlock: "0px", width: "2px", backgroundColor: "var(--ring)" },
      },
    }),
    skeleton: arc({ height: space.x3_5, width: "min(100%, 6rem)" }),
    loader: arc(layout.centre, gap[2], fg.muted, { padding: space.x3 }),
    tree: arc(layout.row, layout.minZero, gap[1], {
      paddingInlineStart: "calc(var(--spacing) * 5 * var(--arc-row-depth, 0))",
    }),
    expand: arc(
      control.bare,
      layout.inlineCentre,
      layout.noShrink,
      rounded.sm,
      fg.muted,
      glyph.sm,
      motion.transform,
      square.x5,
      {
        "[data-expanded] > svg": { rotate: "90deg" },
      },
    ),
    expandSpacer: arc(layout.noShrink, square.x5),
    empty: arc({ padding: space.x6 }),
    error: arc({ padding: space.x6 }),
    requestId: arc(type.mono, type.xs),
    actionsHead: arc(srOnly),
    totals: arc(surface.sunken, type.medium, edge.top, onColumns, {
      '& > [role="row"]': { minHeight: space.x11 },
    }),
    total: arc(layout.row, layout.minZero, cellPad, aligned, type.numeric),
    cards: arc(plainList, edge.all, rounded.lg, bg.card, layout.column),
    card: arc(
      layout.relative,
      layout.row,
      gap[3],
      edge.bottom,
      interaction.hover,
      motion.colours,
      currentRow,
      lastOpen,
      place.padded,
      { minHeight: space.x16 },
    ),
    cardBody: arc(layout.column, layout.grow, layout.minZero, gap[0.5]),
    cardTitle: arc(type.sm, type.medium, {
      "& a::after": { content: '""', position: "absolute", inset: "0" },
    }),
    cardFact: arc(type.meta, fg.muted),
    cardEnd: arc(layout.relative, layout.row, layout.noShrink, gap[1]),
    cardTotal: arc(layout.column, gap[1.5], surface.sunken, edge.top, place.padded),
    pagination: arc(layout.row, layout.end, gap[2], edge.top, fg.muted, type.sm, cellPad),
    page: arc(type.numeric),
  },
  variants: {
    layout: {
      table: {},
      responsive: {
        frame: arc({ [on.belowMd]: { display: "none" } }),
        cards: arc({ [on.md]: { display: "none" } }),
      },
      cards: { frame: arc({ display: "none" }) },
    },
  },
  defaults: { layout: "table" },
});

type Slots = ReturnType<typeof dataTableStyles>;

/** The router a row link navigates through: the app's, when there is one. */
/**
 * A list of records as a grid: sortable, selectable, resizable and paged,
 * driven by `@barqjs/table` and read by `@barqjs/aria`'s table.
 *
 * ```tsx
 * <DataTable
 *   label="Invoices"
 *   data={invoices()}
 *   getRowId={(invoice) => invoice.id}
 *   columns={[
 *     { accessorKey: "number", header: "Number" },
 *     { accessorKey: "customer", header: "Customer", hideBelow: "md" },
 *     { accessorKey: "total", header: "Total", align: "end" },
 *   ]}
 *   selectionMode="multiple"
 *   selectionActions={[{ label: "Archive", onAction: archive }]}
 *   rowHref={(invoice) => `/invoices/${invoice.id}`}
 * />
 * ```
 *
 * The arrows move a cell at a time, Space selects the row, Enter follows it.
 * Sorting, selection, visibility and the page are each the caller's, when
 * passed, or the table's own. Rows come in as they are when `manualSorting`
 * or a `pageCount` says a server has already ordered or paged them.
 */
export function DataTable<T extends RowData>(props: DataTableProps<T>) {
  const messages = useArcMessages();
  function labels(): Required<DataTableLabels> {
    return {
      selectAll: messages().selectAll,
      selectRow: messages().selectRow,
      loadingMore: messages().loadingMore,
      previous: messages().previousPage,
      next: messages().nextPage,
      page: messages().page,
      pagination: messages().pagination,
      resize: messages().resizeColumn,
      ...props.labels,
    };
  }
  function cls(): Slots {
    return parts(
      dataTableStyles({
        layout: props.card === undefined ? "table" : (props.layout ?? "responsive"),
      }),
      props.classes,
    );
  }

  const [sorting, setSorting] = controllable<SortingState>(
    () => props.sorting,
    untrack(() => props.defaultSorting) ?? [],
    (next) => props.onSortingChange?.(next),
  );
  const [visibility, setVisibility] = controllable<ColumnVisibilityState>(
    () => props.columnVisibility,
    untrack(() => props.defaultColumnVisibility) ?? {},
    (next) => props.onColumnVisibilityChange?.(next),
  );
  const [pageIndex, setPageIndex] = controllable<number>(
    () => props.pagination?.pageIndex,
    untrack(() => props.pagination?.defaultPageIndex) ?? 0,
    (next) => props.pagination?.onPageIndexChange?.(next),
  );
  const [selected, setSelected] = controllable<ReadonlySet<string>>(
    () => props.selectedKeys,
    new Set(untrack(() => props.defaultSelectedKeys) ?? []),
    (next) => props.onSelectionChange?.(next as Set<string>),
  );

  const table = createTable(() => ({
    features,
    columns: props.columns as ColumnDef<DataTableFeatures, T>[],
    data: (props.data ?? []) as T[],
    getRowId: (item: T) => props.getRowId(item),
    getSubRows: props.getSubRows === undefined ? undefined : (item: T) => props.getSubRows?.(item),
    manualSorting: props.manualSorting === true,
    manualPagination: props.pagination === undefined || props.pagination.pageCount !== undefined,
    pageCount: props.pagination?.pageCount,
    autoResetPageIndex: false,
    state: {
      sorting: sorting(),
      columnVisibility: visibility(),
      pagination: { pageIndex: pageIndex(), pageSize: props.pagination?.pageSize ?? 0 },
    },
    onSortingChange: (updater: unknown) => {
      const next =
        typeof updater === "function"
          ? (updater as (old: SortingState) => SortingState)(untrack(sorting))
          : (updater as SortingState);
      setSorting(next);
    },
    onColumnVisibilityChange: (updater: unknown) => {
      const current = untrack(visibility);
      setVisibility(
        typeof updater === "function"
          ? (updater as (old: ColumnVisibilityState) => ColumnVisibilityState)(current)
          : (updater as ColumnVisibilityState),
      );
    },
  }));

  const wide: Record<Breakpoint, () => boolean> = {
    sm: mediaQuery(breakpointQuery("sm")),
    md: mediaQuery(breakpointQuery("md")),
    lg: mediaQuery(breakpointQuery("lg")),
    xl: mediaQuery(breakpointQuery("xl")),
    "2xl": mediaQuery(breakpointQuery("2xl")),
  };

  function selectable(): boolean {
    return props.selectionMode === "multiple";
  }

  const columns = createMemo((): ColumnItem[] => {
    const headers = table.getLeafHeaders() as unknown as Header<DataTableFeatures, RowData>[];
    const shown = headers.filter((header) => {
      if (!header.column.getIsVisible()) return false;
      const options = header.column.columnDef as DataTableColumnOptions;
      return options.hideBelow === undefined || wide[options.hideBelow]();
    });
    const named = shown.some(
      (header) => (header.column.columnDef as DataTableColumnOptions).isRowHeader === true,
    );
    const items: ColumnItem[] = shown.map((header, index) => {
      const options = header.column.columnDef as DataTableColumnOptions;
      return {
        id: header.column.id,
        header,
        options,
        allowsSorting: header.column.getCanSort(),
        isRowHeader: named ? options.isRowHeader === true : index === 0,
        defaultWidth: options.defaultWidth ?? null,
        minWidth: options.minWidth ?? null,
        maxWidth: options.maxWidth ?? null,
      };
    });
    if (props.rowActions !== undefined) {
      items.push({
        id: ACTIONS,
        header: null,
        options: { width: "max-content", align: "end" },
        allowsSorting: false,
        isRowHeader: false,
        defaultWidth: 48,
        minWidth: 48,
      });
    }
    if (!selectable()) return items;
    return [
      {
        id: SELECT,
        header: null,
        options: { width: "calc(var(--spacing) * 10)" },
        allowsSorting: false,
        isRowHeader: false,
        defaultWidth: 40,
        minWidth: 40,
        maxWidth: 40,
      },
      ...items,
    ];
  });

  function template(): string {
    return props.resizable === true
      ? columns()
          .map(() => "max-content")
          .join(" ")
      : columns()
          .map((column) => column.options.width ?? "minmax(8rem, 1fr)")
          .join(" ");
  }

  function isLoading(): boolean {
    return props.isLoading ?? props.data === undefined;
  }
  function hasMore(): boolean {
    return props.hasMore ?? props.onLoadMore !== undefined;
  }

  const items = createMemo((): RowItem[] => {
    if (isLoading()) {
      return Array.from({ length: props.skeletonRows ?? 5 }, (_, at) => ({
        id: `${SKELETON}${String(at)}`,
        kind: "skeleton" as const,
      }));
    }
    function rowItem(tableRow: TableRow<DataTableFeatures, RowData>): RowItem {
      return {
        id: tableRow.id,
        kind: "row" as const,
        row: tableRow,
        children:
          props.getSubRows === undefined || tableRow.subRows.length === 0
            ? undefined
            : tableRow.subRows.map((sub) => rowItem(sub)),
      };
    }
    const rows: RowItem[] = table
      .getRowModel()
      .rows.map((tableRow) => rowItem(tableRow as unknown as TableRow<DataTableFeatures, RowData>));
    if (props.onLoadMore !== undefined && hasMore()) rows.push({ id: LOADER, kind: "loader" });
    return rows;
  });

  const rowsById = createMemo(() => {
    const found = new Map<string, T>();
    function add(item: RowItem): void {
      if (item.kind !== "row") return;
      found.set(item.id, item.row.original as T);
      for (const child of item.children ?? []) add(child);
    }
    for (const item of items()) add(item);
    return found;
  });

  function disabled(): string[] {
    return items()
      .filter((item) => item.kind !== "row")
      .map((item) => item.id);
  }

  function sortDescriptor(): SortDescriptor | undefined {
    const first = sorting()[0];
    return first === undefined
      ? undefined
      : { column: first.id, direction: first.desc ? "descending" : "ascending" };
  }

  function onSortChange(descriptor: SortDescriptor): void {
    setSorting([{ id: String(descriptor.column), desc: descriptor.direction === "descending" }]);
  }

  function onSelectionChange(keys: "all" | Set<Key>): void {
    const all = keys === "all" ? [...rowsById().keys()] : [...keys].map(String);
    setSelected(new Set(all.filter((key) => rowsById().has(key))));
  }

  /** The selection, less the rows a filter or a page took off the screen. */
  const shownSelection = createMemo((): ReadonlySet<string> => {
    const kept = new Set<string>();
    for (const key of selected()) if (rowsById().has(key)) kept.add(key);
    return kept;
  });
  // A filter must never hide a row an action would reach, so a selected row
  // that leaves the screen leaves the selection.
  if (!isServer) {
    createEffect(
      () => (isLoading() ? 0 : selected().size - shownSelection().size),
      (hidden) => {
        if (hidden > 0) setSelected(new Set(untrack(shownSelection)));
      },
    );
  }

  function selectedRows(): T[] {
    const found: T[] = [];
    for (const key of shownSelection()) {
      const record = rowsById().get(key);
      if (record !== undefined) found.push(record);
    }
    return found;
  }

  function keepRows(rows: readonly T[]): void {
    setSelected(new Set(rows.map((row) => props.getRowId(row))));
  }

  function pageCount(): number {
    return table.getPageCount();
  }
  function treeColumn(): string | undefined {
    return props.getSubRows === undefined
      ? undefined
      : (props.treeColumn ??
          columns().find((column) => column.id !== SELECT && column.id !== ACTIONS)?.id);
  }
  const router = linkRouter(maybeRouter());

  function gridElement() {
    return (
      <Table
        aria-label={props.label}
        columns={columns()}
        items={items()}
        rowAccessors={{
          getKey: (item: RowItem) => item.id,
          getTextValue: (item: RowItem) =>
            item.kind === "row" ? rowText(item.row, columns()) : "",
          getType: (item: RowItem) => (item.kind === "loader" ? "loader" : "item"),
          getChildren: (item: RowItem) => (item.kind === "row" ? item.children : undefined),
          getProps: (item: RowItem) =>
            item.kind === "row" && props.rowHref !== undefined
              ? { href: props.rowHref(item.row.original as T) }
              : {},
        }}
        selectionMode={props.selectionMode ?? "none"}
        selectedKeys={shownSelection()}
        disabledKeys={disabled()}
        onSelectionChange={onSelectionChange}
        sortDescriptor={sortDescriptor()}
        onSortChange={onSortChange}
        onAction={
          props.onRowAction === undefined
            ? undefined
            : (key: Key) => {
                const record = rowsById().get(String(key));
                if (record !== undefined) props.onRowAction?.(record);
              }
        }
        treeColumn={treeColumn()}
        expandedKeys={props.expandedKeys}
        defaultExpandedKeys={props.defaultExpandedKeys}
        onExpandedChange={(keys: Set<Key>) =>
          props.onExpandedChange?.(new Set([...keys].map(String)))
        }
        class={cls().grid}
        data-slot="data-table-grid"
      >
        <TableHeader class={cls().header} data-slot="data-table-header">
          {(column: ColumnItem) => (
            <HeaderCell
              column={column}
              actionsLabel={messages().actions}
              labels={labels()}
              resizable={props.resizable === true}
              classes={cls()}
            />
          )}
        </TableHeader>
        <TableBody
          class={cls().body}
          data-slot="data-table-body"
          renderEmpty={
            <div class={cls().empty} data-slot="data-table-empty">
              {props.empty ?? <EmptyState heading={messages().nothingHere} />}
            </div>
          }
        >
          {(item: RowItem) =>
            item.kind === "loader" ? (
              <TableLoadMoreItem
                isLoading={props.isLoadingMore === true}
                onLoadMore={() => props.onLoadMore?.()}
                data-slot="data-table-loader"
              >
                <div class={cls().loader}>
                  <Spinner />
                  {labels().loadingMore}
                </div>
              </TableLoadMoreItem>
            ) : (
              <Row
                class={cls().row}
                data-slot="data-table-row"
                data-skeleton={item.kind === "skeleton" ? "" : undefined}
                aria-current={
                  props.activeKey !== undefined &&
                  props.activeKey !== null &&
                  item.id === props.activeKey
                    ? "true"
                    : undefined
                }
              >
                {(column: ColumnItem) => (
                  <BodyCell
                    item={item}
                    column={column}
                    labels={labels()}
                    classes={cls()}
                    isTreeColumn={column.id === treeColumn()}
                    rowActions={
                      props.rowActions === undefined
                        ? undefined
                        : (row: RowData) => props.rowActions?.(row as T) ?? []
                    }
                    rowName={item.kind === "row" ? rowText(item.row, columns()) : ""}
                  />
                )}
              </Row>
            )
          }
        </TableBody>
      </Table>
    );
  }

  function sized() {
    return props.resizable === true ? (
      <ResizableTableContainer
        onResizeEnd={(widths: Map<Key, ColumnSize>) => {
          const kept = new Map<string, ColumnSize>();
          for (const [key, width] of widths) if (key !== SELECT) kept.set(String(key), width);
          props.onColumnResize?.(kept);
        }}
      >
        {gridElement()}
      </ResizableTableContainer>
    ) : (
      gridElement()
    );
  }

  function virtual() {
    return props.virtualRowHeight === undefined ? (
      sized()
    ) : (
      <Virtualizer layout={listLayout({ rowHeight: props.virtualRowHeight })}>
        {sized()}
      </Virtualizer>
    );
  }

  function content() {
    return router === undefined
      ? virtual()
      : provide(
          RouterContext,
          () => router,
          () => virtual(),
        );
  }

  function failed() {
    return (
      <div class={cls().error} data-slot="data-table-error">
        <EmptyState
          icon={<CircleAlert aria-hidden="true" />}
          heading={messages().couldNotLoad(props.label)}
          description={
            <>
              {props.error?.message}
              <Show when={props.error?.requestId !== undefined}>
                {" "}
                <span class={cls().requestId} data-slot="data-table-request-id">
                  {messages().requestId(props.error?.requestId ?? "")}
                </span>
              </Show>
            </>
          }
          actions={
            <Show when={props.onRetry !== undefined}>
              <Button
                variant="outline"
                size="sm"
                isPending={retrying()}
                data-slot="data-table-retry"
                onPress={() => void retry()}
              >
                {messages().tryAgain}
              </Button>
            </Show>
          }
        />
      </div>
    );
  }
  const [retrying, setRetrying] = createSignal(false);
  async function retry(): Promise<void> {
    setRetrying(true);
    try {
      await props.onRetry?.();
    } finally {
      setRetrying(false);
    }
  }

  function totals() {
    return (
      <Show when={(props.totals ?? []).length > 0 && !isLoading()}>
        <div
          class={cls().totals}
          role="table"
          aria-label={messages().totals}
          data-slot="data-table-totals"
        >
          <For each={() => props.totals ?? []}>
            {(total: DataTableTotal) => (
              <div role="row" data-slot="data-table-total-row">
                <For each={columns}>
                  {(column: ColumnItem) => (
                    <div
                      role={column.isRowHeader ? "rowheader" : "cell"}
                      class={cls().total}
                      data-slot="data-table-total"
                      data-align={column.options.align ?? "start"}
                    >
                      {column.isRowHeader ? total.label : total.cells[column.id]}
                    </div>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </Show>
    );
  }

  function cards() {
    const card = props.card as DataTableCard<T>;
    return (
      <ul class={cls().cards} aria-label={props.label} data-slot="data-table-cards">
        <For each={() => (isLoading() ? [] : [...rowsById().entries()])}>
          {(entry: [string, T]) => {
            const [key, row] = entry;
            function title() {
              return props.rowHref === undefined ? (
                card.title(row)
              ) : (
                <a href={props.rowHref(row)} onClick={(event: MouseEvent) => follow(event, row)}>
                  {card.title(row)}
                </a>
              );
            }
            return (
              <li
                class={cls().card}
                data-slot="data-table-card"
                aria-current={props.activeKey === key ? "true" : undefined}
              >
                <Show when={selectable()}>
                  <span class={cls().cardEnd}>
                    <Checkbox
                      aria-label={`${labels().selectRow} ${cardName(row)}`.trim()}
                      isSelected={shownSelection().has(key)}
                      onChange={(ticked: boolean) => {
                        const next = new Set(untrack(shownSelection));
                        if (ticked) next.add(key);
                        else next.delete(key);
                        setSelected(next);
                      }}
                    />
                  </span>
                </Show>
                {card.leading?.(row)}
                <div class={cls().cardBody} data-slot="data-table-card-body">
                  <span class={cls().cardTitle} data-slot="data-table-card-title">
                    {title()}
                  </span>
                  <Show when={card.fact !== undefined}>
                    <span class={cls().cardFact} data-slot="data-table-card-fact">
                      {card.fact?.(row)}
                    </span>
                  </Show>
                </div>
                <Show when={card.status !== undefined || props.rowActions !== undefined}>
                  <span class={cls().cardEnd} data-slot="data-table-card-end">
                    {card.status?.(row)}
                    <Show when={props.rowActions !== undefined}>
                      <RowActions
                        actions={props.rowActions?.(row) ?? []}
                        name={cardName(row)}
                        menuOnly
                        size="icon-lg"
                      />
                    </Show>
                  </span>
                </Show>
              </li>
            );
          }}
        </For>
        <For each={() => (isLoading() ? [] : (props.totals ?? []))}>
          {(total: DataTableTotal) => (
            <li class={cls().cardTotal} data-slot="data-table-card-total">
              <span>{total.label}</span>
              <DescriptionList
                layout="inline"
                divided={false}
                items={columns()
                  .filter((column) => total.cells[column.id] !== undefined)
                  .map((column) => ({
                    id: column.id,
                    term: headerText(column),
                    details: total.cells[column.id],
                  }))}
              />
            </li>
          )}
        </For>
      </ul>
    );
  }
  function cardName(row: T): string {
    const named = columns().find((column) => column.isRowHeader);
    if (named === undefined) return "";
    const value = (
      named.header?.column.accessorFn as ((row: T, index: number) => unknown) | undefined
    )?.(row, 0);
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
  }
  function follow(event: MouseEvent, row: T): void {
    if (router === undefined || event.defaultPrevented || event.button !== 0) return;
    event.preventDefault();
    router.open(event.currentTarget as Element, event, props.rowHref?.(row) ?? "");
  }

  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      data-slot="data-table"
      data-density={props.density}
    >
      <Show
        when={props.error === undefined || props.error === null}
        fallback={
          <div class={cls().frame} data-slot="data-table-frame">
            {failed()}
          </div>
        }
      >
        <div
          class={cls().frame}
          data-slot="data-table-frame"
          data-scrolls={props.height === undefined ? undefined : ""}
          aria-busy={isLoading() ? "true" : undefined}
          style={{
            "--arc-data-table-columns": template(),
            "max-height": props.height,
          }}
        >
          {content()}
          {totals()}
          <Show when={props.pagination !== undefined && !isLoading() && pageCount() > 1}>
            <Pager
              class={cls().pagination}
              classes={{ current: cls().page }}
              variant="compact"
              pageIndex={pageIndex()}
              onPageIndexChange={setPageIndex}
              pageCount={pageCount()}
              labels={{
                pagination: labels().pagination,
                previous: labels().previous,
                next: labels().next,
                page: labels().page,
              }}
            />
          </Show>
          {props.footer}
        </div>
        <Show when={props.card !== undefined}>{cards()}</Show>
      </Show>
      <Show when={props.selectionActions !== undefined && shownSelection().size > 0}>
        <SelectionBar
          count={shownSelection().size}
          rows={selectedRows()}
          actions={props.selectionActions ?? []}
          selectedLabel={props.selectedLabel}
          onClear={() => setSelected(new Set())}
          onKeep={keepRows}
          floating
        />
      </Show>
    </div>
  );
}

/** A column's header as words, for a total's card on a phone. */
function headerText(column: ColumnItem): string {
  const header = column.header?.column.columnDef.header;
  return column.options.label ?? (typeof header === "string" ? header : column.id);
}

/** The row's text, for typeahead: its row header's value. */
function rowText(tableRow: TableRow<DataTableFeatures, RowData>, columns: ColumnItem[]): string {
  const named = columns.find((column) => column.isRowHeader);
  if (named === undefined) return "";
  const value = tableRow.getValue<unknown>(named.id);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

interface HeaderCellProps {
  column: ColumnItem;
  actionsLabel: string;
  labels: Required<DataTableLabels>;
  resizable: boolean;
  classes: Slots;
}

function HeaderCell(props: HeaderCellProps) {
  const column = props.column;
  if (column.id === SELECT) {
    return (
      <Column class={arc(props.classes.head, props.classes.checkbox)} data-slot="data-table-head">
        <SelectAll label={props.labels.selectAll} />
      </Column>
    );
  }
  if (column.id === ACTIONS) {
    return (
      <Column class={props.classes.head} data-slot="data-table-head" data-align="end">
        <span class={props.classes.actionsHead}>{props.actionsLabel}</span>
      </Column>
    );
  }
  const header = column.header as Header<DataTableFeatures, RowData>;
  function sorted(): false | "asc" | "desc" {
    return header.column.getIsSorted();
  }
  return (
    <Column
      class={props.classes.head}
      data-slot="data-table-head"
      data-align={column.options.align ?? "start"}
    >
      <FlexRender header={header} />
      <Show when={column.allowsSorting}>
        {sorted() === "asc" ? (
          <ArrowUp aria-hidden="true" />
        ) : sorted() === "desc" ? (
          <ArrowDown aria-hidden="true" />
        ) : (
          <ChevronsUpDown aria-hidden="true" />
        )}
      </Show>
      <Show when={props.resizable}>
        <ColumnResizer class={props.classes.resizer} aria-label={props.labels.resize} />
      </Show>
    </Column>
  );
}

interface SelectAllProps {
  label: string;
}

function SelectAll(props: SelectAllProps) {
  const grid = useTable();
  function manager() {
    return grid.state.selectionManager();
  }
  function all(): boolean {
    return !manager().isEmpty && manager().isSelectAll;
  }
  function some(): boolean {
    return !manager().isEmpty && !manager().isSelectAll;
  }
  return (
    <Checkbox
      aria-label={props.label}
      isSelected={all()}
      isIndeterminate={some()}
      isDisabled={grid.state.collection().size === 0}
      onChange={() => manager().toggleSelectAll()}
    />
  );
}

interface RowCheckboxProps {
  label: string;
}

function RowCheckbox(props: RowCheckboxProps) {
  const grid = useTable();
  const node = useRow();
  function manager() {
    return grid.state.selectionManager();
  }
  return (
    <Checkbox
      aria-label={`${props.label} ${node.textValue}`.trim()}
      isSelected={manager().isSelected(node.key)}
      isDisabled={!manager().canSelectItem(node.key)}
      onChange={() => manager().toggleSelection(node.key)}
    />
  );
}

interface BodyCellProps {
  item: RowItem;
  column: ColumnItem;
  labels: Required<DataTableLabels>;
  classes: Slots;
  isTreeColumn: boolean;
  rowActions: ((row: RowData) => readonly DataTableRowAction[]) | undefined;
  rowName: string;
}

function BodyCell(props: BodyCellProps) {
  const item = props.item;
  const column = props.column;
  if (column.id === SELECT) {
    return (
      <Cell class={arc(props.classes.cell, props.classes.checkbox)} data-slot="data-table-cell">
        <Show when={item.kind === "row"}>
          <RowCheckbox label={props.labels.selectRow} />
        </Show>
      </Cell>
    );
  }
  if (column.id === ACTIONS) {
    return (
      <Cell class={props.classes.cell} data-slot="data-table-cell" data-align="end">
        <Show when={item.kind === "row"}>
          <RowActions
            actions={item.kind === "row" ? (props.rowActions?.(item.row.original) ?? []) : []}
            name={props.rowName}
          />
        </Show>
      </Cell>
    );
  }
  if (item.kind !== "row") {
    return (
      <Cell
        class={props.classes.cell}
        data-slot="data-table-cell"
        data-align={column.options.align ?? "start"}
      >
        <Skeleton class={props.classes.skeleton} />
      </Cell>
    );
  }
  const found = item.row.getAllCellsByColumnId()[column.id];
  // Built inside the cell rather than before it: a hydrating component claims
  // the server's next node as it is built, which before the cell is the cell.
  function content() {
    return found === undefined ? null : <FlexRender cell={found} />;
  }
  return (
    <Cell
      class={props.classes.cell}
      data-slot="data-table-cell"
      data-align={column.options.align ?? "start"}
    >
      {props.isTreeColumn ? (
        <span
          class={props.classes.tree}
          data-slot="data-table-tree"
          style={{ "--arc-row-depth": String(item.row.depth) }}
        >
          <Show
            when={(item.children?.length ?? 0) > 0}
            fallback={
              <span class={props.classes.expandSpacer} data-slot="data-table-expand-spacer" />
            }
          >
            <TableExpandButton class={props.classes.expand} data-slot="data-table-expand">
              <ChevronRight class={icon.directional} aria-hidden="true" />
            </TableExpandButton>
          </Show>
          {content()}
        </span>
      ) : (
        content()
      )}
    </Cell>
  );
}
