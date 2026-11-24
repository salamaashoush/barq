import { type Child, Show, createMemo, provide, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { controllable } from "@barqjs/aria/utils";
import { RouterContext, type Router } from "@barqjs/aria/interactions";
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
import { mediaQuery } from "@barqjs/primitives/media";
import type { RouterState } from "@barqjs/router";
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
import { Checkbox } from "@barqjs/ui/checkbox";
import { icon } from "@barqjs/ui/shared-icon";
import { Skeleton } from "@barqjs/ui/skeleton";
import { Spinner } from "@barqjs/ui/spinner";

import { type Breakpoint, breakpointQuery, on } from "@barqjs/ui/conditions";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  edge,
  fg,
  focus,
  gap,
  glyph,
  layout,
  motion,
  rounded,
  space,
  interaction,
  square,
  surface,
  type,
} from "../style/index.ts";
import { useArcMessages } from "./messages.ts";
import { EmptyState } from "./empty-state.tsx";
import { maybeRouter } from "./link.ts";
import { bareButton } from "../lib/bare.ts";
import { afterLayer } from "../lib/pseudo.ts";
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
const cellPad = arc({ paddingInline: space.x3, paddingBlock: space.x2 });

/** Numbers sit at the end, in the column and in its header alike. */
const aligned = arc({ '[data-align="end"]': { justifyContent: "flex-end", textAlign: "end" } });

export const dataTableStyles = variants({
  slots: {
    root: arc({}),
    frame: arc(layout.relative, layout.minZero, edge.all, rounded.lg, bg.card, {
      overflowX: "auto",
      [on.md]: { "&:not([data-scrolls])": { overflowX: "clip" } },
      "[data-scrolls]": { overflow: "auto", overscrollBehavior: "contain" },
    }),
    grid: arc(layout.column, type.sm, focus.none, focus.inset, { minWidth: "min-content" }),
    header: arc(surface.sunken, layout.sticky, {
      top: "var(--arc-data-table-sticky-top, 0px)",
      boxShadow: "inset 0 -1px 0 var(--border)",
      '& > [role="row"]': {
        display: "grid",
        gridTemplateColumns: "var(--arc-data-table-columns)",
        alignItems: "center",
        minHeight: space.x9,
      },
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
      {
        display: "grid",
        gridTemplateColumns: "var(--arc-data-table-columns)",
        alignItems: "center",
        minHeight: space.x11,
        "[data-href]": { cursor: "pointer" },
        ":last-child": { borderBlockEndWidth: "0px" },
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
    resizer: arc(afterLayer, {
      position: "absolute",
      insetBlock: "0px",
      insetInlineEnd: "0px",
      width: space.x2,
      cursor: "col-resize",
      touchAction: "none",
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
      bareButton,
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
    pagination: arc(layout.row, layout.end, gap[2], edge.top, fg.muted, type.sm, cellPad),
    page: arc(type.numeric),
  },
});

type Slots = ReturnType<typeof dataTableStyles>;

/** The router a row link navigates through: the app's, when there is one. */
function linkRouter(state: RouterState | undefined): Router | undefined {
  if (state === undefined) return undefined;
  return {
    isNative: false,
    open: (_target, modifiers, href) => {
      if (modifiers.metaKey || modifiers.ctrlKey || modifiers.shiftKey) {
        window.open(href, "_blank", "noopener");
        return;
      }
      void state.navigate(href);
    },
    href: (href) => href,
  };
}

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
  const labels = (): Required<DataTableLabels> => ({
    selectAll: messages().selectAll,
    selectRow: messages().selectRow,
    loadingMore: messages().loadingMore,
    previous: messages().previousPage,
    next: messages().nextPage,
    page: messages().page,
    pagination: messages().pagination,
    resize: messages().resizeColumn,
    ...props.labels,
  });
  const cls = (): Slots => parts(dataTableStyles(), props.classes);

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

  const selectable = (): boolean => props.selectionMode === "multiple";

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

  const template = (): string =>
    props.resizable === true
      ? columns()
          .map(() => "max-content")
          .join(" ")
      : columns()
          .map((column) => column.options.width ?? "minmax(8rem, 1fr)")
          .join(" ");

  const isLoading = (): boolean => props.isLoading ?? props.data === undefined;
  const hasMore = (): boolean => props.hasMore ?? props.onLoadMore !== undefined;

  const items = createMemo((): RowItem[] => {
    if (isLoading()) {
      return Array.from({ length: props.skeletonRows ?? 5 }, (_, at) => ({
        id: `${SKELETON}${String(at)}`,
        kind: "skeleton" as const,
      }));
    }
    const rowItem = (tableRow: TableRow<DataTableFeatures, RowData>): RowItem => ({
      id: tableRow.id,
      kind: "row" as const,
      row: tableRow,
      children:
        props.getSubRows === undefined || tableRow.subRows.length === 0
          ? undefined
          : tableRow.subRows.map((sub) => rowItem(sub)),
    });
    const rows: RowItem[] = table
      .getRowModel()
      .rows.map((tableRow) => rowItem(tableRow as unknown as TableRow<DataTableFeatures, RowData>));
    if (props.onLoadMore !== undefined && hasMore()) rows.push({ id: LOADER, kind: "loader" });
    return rows;
  });

  const rowsById = createMemo(() => {
    const found = new Map<string, T>();
    const add = (item: RowItem): void => {
      if (item.kind !== "row") return;
      found.set(item.id, item.row.original as T);
      for (const child of item.children ?? []) add(child);
    };
    for (const item of items()) add(item);
    return found;
  });

  const disabled = (): string[] =>
    items()
      .filter((item) => item.kind !== "row")
      .map((item) => item.id);

  const sortDescriptor = (): SortDescriptor | undefined => {
    const first = sorting()[0];
    return first === undefined
      ? undefined
      : { column: first.id, direction: first.desc ? "descending" : "ascending" };
  };

  const onSortChange = (descriptor: SortDescriptor): void => {
    setSorting([{ id: String(descriptor.column), desc: descriptor.direction === "descending" }]);
  };

  const onSelectionChange = (keys: "all" | Set<Key>): void => {
    const all = keys === "all" ? [...rowsById().keys()] : [...keys].map(String);
    setSelected(new Set(all.filter((key) => rowsById().has(key))));
  };

  const selectedRows = (): T[] => {
    const found: T[] = [];
    for (const key of selected()) {
      const record = rowsById().get(key);
      if (record !== undefined) found.push(record);
    }
    return found;
  };

  const pageCount = (): number => table.getPageCount();
  const treeColumn = (): string | undefined =>
    props.getSubRows === undefined
      ? undefined
      : (props.treeColumn ?? columns().find((column) => column.id !== SELECT)?.id);
  const router = linkRouter(maybeRouter());

  const gridElement = () => (
    <Table
      aria-label={props.label}
      columns={columns()}
      items={items()}
      rowAccessors={{
        getKey: (item: RowItem) => item.id,
        getTextValue: (item: RowItem) => (item.kind === "row" ? rowText(item.row, columns()) : ""),
        getType: (item: RowItem) => (item.kind === "loader" ? "loader" : "item"),
        getChildren: (item: RowItem) => (item.kind === "row" ? item.children : undefined),
        getProps: (item: RowItem) =>
          item.kind === "row" && props.rowHref !== undefined
            ? { href: props.rowHref(item.row.original as T) }
            : {},
      }}
      selectionMode={props.selectionMode ?? "none"}
      selectedKeys={selected()}
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
            >
              {(column: ColumnItem) => (
                <BodyCell
                  item={item}
                  column={column}
                  labels={labels()}
                  classes={cls()}
                  isTreeColumn={column.id === treeColumn()}
                />
              )}
            </Row>
          )
        }
      </TableBody>
    </Table>
  );

  const sized = () =>
    props.resizable === true ? (
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

  const virtual = () =>
    props.virtualRowHeight === undefined ? (
      sized()
    ) : (
      <Virtualizer layout={listLayout({ rowHeight: props.virtualRowHeight })}>
        {sized()}
      </Virtualizer>
    );

  const content = () =>
    router === undefined
      ? virtual()
      : provide(
          RouterContext,
          () => router,
          () => virtual(),
        );

  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="data-table">
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
      </div>
      <Show when={props.selectionActions !== undefined && selected().size > 0}>
        <SelectionBar
          count={selected().size}
          rows={selectedRows()}
          actions={props.selectionActions ?? []}
          selectedLabel={props.selectedLabel}
          onClear={() => setSelected(new Set())}
          floating
        />
      </Show>
    </div>
  );
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
  const header = column.header as Header<DataTableFeatures, RowData>;
  const sorted = (): false | "asc" | "desc" => header.column.getIsSorted();
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

function SelectAll(props: { label: string }) {
  const grid = useTable();
  const manager = () => grid.state.selectionManager();
  const all = (): boolean => !manager().isEmpty && manager().isSelectAll;
  const some = (): boolean => !manager().isEmpty && !manager().isSelectAll;
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

function RowCheckbox(props: { label: string }) {
  const grid = useTable();
  const node = useRow();
  const manager = () => grid.state.selectionManager();
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
  const content = found === undefined ? null : <FlexRender cell={found} />;
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
          {content}
        </span>
      ) : (
        content
      )}
    </Cell>
  );
}
