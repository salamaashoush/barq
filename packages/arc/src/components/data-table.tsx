import { type Child, Show, createMemo, createSignal, provide, untrack } from "@barqjs/core";
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
  TableHeader,
  TableLoadMoreItem,
  useRow,
  useTable,
} from "@barqjs/aria/table";
import type { ColumnSize } from "@barqjs/aria/table-column-layout";
import { Virtualizer, listLayout } from "@barqjs/aria/virtualizer";
import { ArrowDown } from "@barqjs/lucide/icons/arrow-down";
import { ArrowUp } from "@barqjs/lucide/icons/arrow-up";
import { ChevronsUpDown } from "@barqjs/lucide/icons/chevrons-up-down";
import { mediaQuery } from "@barqjs/primitives/media";
import { type RouterState, useRouter } from "@barqjs/router";
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
import { Skeleton } from "@barqjs/ui/skeleton";
import { Spinner } from "@barqjs/ui/spinner";

import { arcLayer as arc } from "../layer.ts";
import { EmptyState } from "./empty-state.tsx";
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

export type Breakpoint = "sm" | "md" | "lg" | "xl" | "2xl";

/** The widths the breakpoints start at, as Tailwind's defaults put them. */
const BREAKPOINTS: Record<Breakpoint, string> = {
  sm: "(min-width: 40rem)",
  md: "(min-width: 48rem)",
  lg: "(min-width: 64rem)",
  xl: "(min-width: 80rem)",
  "2xl": "(min-width: 96rem)",
};

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

export interface DataTableProps<T extends RowData> {
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
  class?: string;
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
  | { id: string; kind: "row"; row: TableRow<DataTableFeatures, RowData> }
  | { id: string; kind: "skeleton" }
  | { id: string; kind: "loader" };

const frame = arc({
  position: "relative",
  minWidth: "0px",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "var(--border)",
  borderRadius: "calc(var(--radius) * 1.4)",
  backgroundColor: "var(--card)",
  overflowX: "auto",
  "@media (min-width: 48rem)": {
    "&:not([data-scrolls])": {
      overflowX: "clip",
    },
  },
  "[data-scrolls]": {
    overflow: "auto",
    overscrollBehavior: "contain",
  },
});

const gridClass = arc({
  display: "flex",
  flexDirection: "column",
  minWidth: "min-content",
  fontSize: "var(--text-sm)",
  lineHeight: "var(--text-sm--line-height)",
  outline: "none",
  "[data-focus-visible]": {
    boxShadow: "inset 0 0 0 2px var(--ring)",
  },
});

const head = arc({
  position: "sticky",
  top: "var(--arc-data-table-sticky-top, 0px)",
  zIndex: "var(--z-sticky, 10)",
  backgroundColor: "var(--sunken, var(--muted))",
  boxShadow: "inset 0 -1px 0 var(--border)",
  '& > [role="row"]': {
    display: "grid",
    gridTemplateColumns: "var(--arc-data-table-columns)",
    alignItems: "center",
    minHeight: "calc(var(--spacing) * 9)",
  },
});

const body = arc({
  position: "relative",
});

const row = arc({
  display: "grid",
  gridTemplateColumns: "var(--arc-data-table-columns)",
  alignItems: "center",
  minHeight: "calc(var(--spacing) * 11)",
  borderBlockEndWidth: "1px",
  borderBlockEndStyle: "solid",
  borderColor: "var(--border)",
  outline: "none",
  transitionProperty: "background-color",
  transitionDuration: "var(--duration-fast, 100ms)",
  "@media (hover: hover)": {
    "[data-hovered]": {
      backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
    },
  },
  "[data-href]": {
    cursor: "pointer",
  },
  "[data-selected]": {
    backgroundColor: "var(--muted)",
  },
  "[data-focus-visible-within]": {
    backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
  },
  "[data-focus-visible]": {
    boxShadow: "inset 0 0 0 2px var(--ring)",
  },
  ":last-child": {
    borderBlockEndWidth: "0px",
  },
});

const columnHeader = arc({
  position: "relative",
  display: "flex",
  minWidth: "0px",
  alignItems: "center",
  gap: "calc(var(--spacing) * 1)",
  height: "100%",
  paddingInline: "calc(var(--spacing) * 3)",
  fontWeight: "var(--font-weight-medium)",
  color: "var(--muted-foreground)",
  whiteSpace: "nowrap",
  outline: "none",
  "[data-allows-sorting]": {
    cursor: "pointer",
    "@media (hover: hover)": {
      ":hover": { color: "var(--foreground)" },
    },
  },
  "[data-sort-direction]": {
    color: "var(--foreground)",
  },
  "[data-focus-visible]": {
    boxShadow: "inset 0 0 0 2px var(--ring)",
  },
  '[data-align="end"]': {
    justifyContent: "flex-end",
    textAlign: "end",
  },
  "& > svg": {
    width: "calc(var(--spacing) * 3.5)",
    height: "calc(var(--spacing) * 3.5)",
    flexShrink: "0",
  },
});

const cell = arc({
  position: "relative",
  display: "flex",
  minWidth: "0px",
  alignItems: "center",
  paddingInline: "calc(var(--spacing) * 3)",
  paddingBlock: "calc(var(--spacing) * 2)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  outline: "none",
  '[data-align="end"]': {
    justifyContent: "flex-end",
    textAlign: "end",
    fontVariantNumeric: "tabular-nums",
  },
  "[data-focus-visible]": {
    boxShadow: "inset 0 0 0 2px var(--ring)",
  },
  '[role="rowheader"]': {
    fontWeight: "var(--font-weight-medium)",
    color: "var(--foreground)",
  },
});

const checkboxCell = arc({
  paddingInlineEnd: "0px",
});

const resizer = arc({
  position: "absolute",
  insetBlock: "0px",
  insetInlineEnd: "0px",
  width: "calc(var(--spacing) * 2)",
  cursor: "col-resize",
  touchAction: "none",
  "::after": {
    content: '""',
    position: "absolute",
    insetBlock: "25%",
    insetInlineEnd: "0px",
    width: "1px",
    backgroundColor: "var(--border)",
  },
  "[data-hovered], [data-resizing], [data-focus-visible]": {
    "::after": {
      insetBlock: "0px",
      width: "2px",
      backgroundColor: "var(--ring)",
    },
  },
});

const skeletonBar = arc({
  height: "calc(var(--spacing) * 3.5)",
  width: "min(100%, 6rem)",
});

const loading = arc({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "calc(var(--spacing) * 2)",
  padding: "calc(var(--spacing) * 3)",
  color: "var(--muted-foreground)",
});

const emptyCell = arc({
  padding: "calc(var(--spacing) * 6)",
});

const foot = arc({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "calc(var(--spacing) * 2)",
  borderBlockStartWidth: "1px",
  borderBlockStartStyle: "solid",
  borderColor: "var(--border)",
  paddingInline: "calc(var(--spacing) * 3)",
  paddingBlock: "calc(var(--spacing) * 2)",
  color: "var(--muted-foreground)",
  fontSize: "var(--text-sm)",
});

const pageText = arc({
  marginInlineEnd: "auto",
  fontVariantNumeric: "tabular-nums",
});

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

function maybeRouter(): RouterState | undefined {
  try {
    return useRouter();
  } catch {
    return undefined;
  }
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
  const labels = (): DataTableLabels => props.labels ?? {};

  const [ownSorting, setOwnSorting] = createSignal<SortingState>(
    untrack(() => props.defaultSorting) ?? [],
  );
  const sorting = (): SortingState => props.sorting ?? ownSorting();
  const setSorting = (next: SortingState): void => {
    if (props.sorting === undefined) setOwnSorting(next);
    props.onSortingChange?.(next);
  };

  const [ownVisibility, setOwnVisibility] = createSignal<ColumnVisibilityState>(
    untrack(() => props.defaultColumnVisibility) ?? {},
  );
  const visibility = (): ColumnVisibilityState => props.columnVisibility ?? ownVisibility();

  const [ownPage, setOwnPage] = createSignal(
    untrack(() => props.pagination?.defaultPageIndex) ?? 0,
  );
  const pageIndex = (): number => props.pagination?.pageIndex ?? ownPage();
  const setPageIndex = (next: number): void => {
    if (props.pagination?.pageIndex === undefined) setOwnPage(next);
    props.pagination?.onPageIndexChange?.(next);
  };

  const [ownSelection, setOwnSelection] = createSignal<ReadonlySet<string>>(
    new Set(untrack(() => props.defaultSelectedKeys) ?? []),
  );
  const selected = (): ReadonlySet<string> => props.selectedKeys ?? ownSelection();
  const setSelected = (next: Set<string>): void => {
    if (props.selectedKeys === undefined) setOwnSelection(next);
    props.onSelectionChange?.(next);
  };

  const table = createTable(() => ({
    features,
    columns: props.columns as ColumnDef<DataTableFeatures, T>[],
    data: (props.data ?? []) as T[],
    getRowId: (item: T) => props.getRowId(item),
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
      const next =
        typeof updater === "function"
          ? (updater as (old: ColumnVisibilityState) => ColumnVisibilityState)(current)
          : (updater as ColumnVisibilityState);
      if (props.columnVisibility === undefined) setOwnVisibility(next);
      props.onColumnVisibilityChange?.(next);
    },
  }));

  const wide: Record<Breakpoint, () => boolean> = {
    sm: mediaQuery(BREAKPOINTS.sm),
    md: mediaQuery(BREAKPOINTS.md),
    lg: mediaQuery(BREAKPOINTS.lg),
    xl: mediaQuery(BREAKPOINTS.xl),
    "2xl": mediaQuery(BREAKPOINTS["2xl"]),
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
    const rows: RowItem[] = table.getRowModel().rows.map((tableRow) => ({
      id: tableRow.id,
      kind: "row" as const,
      row: tableRow as unknown as TableRow<DataTableFeatures, RowData>,
    }));
    if (props.onLoadMore !== undefined && hasMore()) rows.push({ id: LOADER, kind: "loader" });
    return rows;
  });

  const rowsById = createMemo(() => {
    const found = new Map<string, T>();
    for (const item of items()) if (item.kind === "row") found.set(item.id, item.row.original as T);
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
      class={gridClass}
      data-slot="data-table-grid"
    >
      <TableHeader class={head} data-slot="data-table-header">
        {(column: ColumnItem) => (
          <HeaderCell column={column} labels={labels()} resizable={props.resizable === true} />
        )}
      </TableHeader>
      <TableBody
        class={body}
        data-slot="data-table-body"
        renderEmpty={
          <div class={emptyCell}>{props.empty ?? <EmptyState heading="Nothing here yet" />}</div>
        }
      >
        {(item: RowItem) =>
          item.kind === "loader" ? (
            <TableLoadMoreItem
              isLoading={props.isLoadingMore === true}
              onLoadMore={() => props.onLoadMore?.()}
              data-slot="data-table-loader"
            >
              <div class={loading}>
                <Spinner />
                {labels().loadingMore ?? "Loading more"}
              </div>
            </TableLoadMoreItem>
          ) : (
            <Row
              class={row}
              data-slot="data-table-row"
              data-skeleton={item.kind === "skeleton" ? "" : undefined}
            >
              {(column: ColumnItem) => <BodyCell item={item} column={column} labels={labels()} />}
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
    <div class={arc(props.class)} data-slot="data-table">
      <div
        class={frame}
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
          <nav
            class={foot}
            aria-label={labels().pagination ?? "Pages"}
            data-slot="data-table-pagination"
          >
            <span class={pageText}>
              {(
                labels().page ??
                ((page: number, pages: number) => `Page ${String(page)} of ${String(pages)}`)
              )(pageIndex() + 1, pageCount())}
            </span>
            <Button
              variant="outline"
              size="sm"
              isDisabled={pageIndex() <= 0}
              onPress={() => setPageIndex(pageIndex() - 1)}
            >
              {labels().previous ?? "Previous page"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              isDisabled={pageIndex() >= pageCount() - 1}
              onPress={() => setPageIndex(pageIndex() + 1)}
            >
              {labels().next ?? "Next page"}
            </Button>
          </nav>
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
  labels: DataTableLabels;
  resizable: boolean;
}

function HeaderCell(props: HeaderCellProps) {
  const column = props.column;
  if (column.id === SELECT) {
    return (
      <Column class={arc(columnHeader, checkboxCell)} data-slot="data-table-head">
        <SelectAll label={props.labels.selectAll ?? "Select all"} />
      </Column>
    );
  }
  const header = column.header as Header<DataTableFeatures, RowData>;
  const sorted = (): false | "asc" | "desc" => header.column.getIsSorted();
  return (
    <Column
      class={columnHeader}
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
        <ColumnResizer class={resizer} aria-label={props.labels.resize ?? "Resize column"} />
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
  labels: DataTableLabels;
}

function BodyCell(props: BodyCellProps) {
  const item = props.item;
  const column = props.column;
  if (column.id === SELECT) {
    return (
      <Cell class={arc(cell, checkboxCell)} data-slot="data-table-cell">
        <Show when={item.kind === "row"}>
          <RowCheckbox label={props.labels.selectRow ?? "Select"} />
        </Show>
      </Cell>
    );
  }
  if (item.kind !== "row") {
    return (
      <Cell class={cell} data-slot="data-table-cell" data-align={column.options.align ?? "start"}>
        <Skeleton class={skeletonBar} />
      </Cell>
    );
  }
  const found = item.row.getAllCellsByColumnId()[column.id];
  return (
    <Cell class={cell} data-slot="data-table-cell" data-align={column.options.align ?? "start"}>
      {found === undefined ? null : <FlexRender cell={found} />}
    </Cell>
  );
}
