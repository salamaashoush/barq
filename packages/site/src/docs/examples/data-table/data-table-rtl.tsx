import { For, Show, createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ArrowUpDown } from "@barqjs/lucide/icons/arrow-up-down";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import {
  type Cell,
  type Column,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type Header,
  type HeaderGroup,
  type Row,
  type RowSelectionState,
  type SortingState,
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  createTable,
  filterFn_includesString,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
} from "@barqjs/table";
import {
  Button,
  DirectionProvider,
  Checkbox,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  srOnly,
} from "@barqjs/ui";

const features = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});

type Features = typeof features;

type Payment = {
  id: string;
  amount: number;
  status: "pending" | "processing" | "success" | "failed";
  email: string;
};

const data: Payment[] = [
  { id: "m5gr84i9", amount: 316, status: "success", email: "salama@example.com" },
  { id: "3u1reuv4", amount: 242, status: "success", email: "Ada45@example.com" },
  { id: "derv1ws0", amount: 837, status: "processing", email: "Zed44@example.com" },
  { id: "5kma53ae", amount: 874, status: "success", email: "Lin22@example.com" },
  { id: "bhqecj4p", amount: 721, status: "failed", email: "omar@example.com" },
  { id: "p0x7c2na", amount: 129, status: "pending", email: "noor@example.com" },
  { id: "w8tq1d5k", amount: 455, status: "processing", email: "Sam07@example.com" },
  { id: "j4hz9y3b", amount: 598, status: "success", email: "kai@example.com" },
];

const root = css`
  width: 100%;
`;

const toolbar = css`
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  padding-block: calc(var(--spacing) * 4);
`;

const filter = css`
  max-width: 24rem;
`;

const pushed = css`
  margin-inline-start: auto;
`;

const frame = css`
  overflow: hidden;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
`;

const capitalize = css`
  text-transform: capitalize;
`;

const lowercase = css`
  text-transform: lowercase;
`;

const amountHead = css`
  text-align: start;
`;

const amountCell = css`
  text-align: start;
  font-weight: 500;
`;

const actions = css`
  width: calc(var(--spacing) * 40);
`;

const empty = css`
  height: calc(var(--spacing) * 24);
  text-align: center;
`;

const footer = css`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: calc(var(--spacing) * 2);
  padding-block: calc(var(--spacing) * 4);
`;

const selected = css`
  flex: 1;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

const pager = css`
  display: flex;
  gap: calc(var(--spacing) * 2);
`;

const currency = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "USD" });

const statuses: Record<Payment["status"], string> = {
  success: "ناجح",
  processing: "قيد المعالجة",
  failed: "فشل",
  pending: "قيد الانتظار",
};

const columnHelper = createColumnHelper<Features, Payment>();

const columns = columnHelper.columns([
  columnHelper.display({
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(value)}
        aria-label="تحديد الكل"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(value)}
        aria-label="تحديد الصف"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  }),
  columnHelper.accessor("status", {
    header: "الحالة",
    cell: ({ row }) => (
      <div class={capitalize}>{statuses[row.getValue<Payment["status"]>("status")]}</div>
    ),
  }),
  columnHelper.accessor("email", {
    header: ({ column }) => (
      <Button variant="ghost" onPress={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        البريد الإلكتروني
        <ArrowUpDown />
      </Button>
    ),
    cell: ({ row }) => <div class={lowercase}>{row.getValue<string>("email")}</div>,
  }),
  columnHelper.accessor("amount", {
    header: () => <div class={amountHead}>المبلغ</div>,
    cell: ({ row }) => (
      <div class={amountCell}>{currency.format(row.getValue<number>("amount"))}</div>
    ),
  }),
  columnHelper.display({
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const payment = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="ghost" size="icon-xs">
              <span class={srOnly}>فتح القائمة</span>
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class={actions} dir="rtl">
            <DropdownMenuGroup>
              <DropdownMenuLabel>الإجراءات</DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => {
                  void navigator.clipboard.writeText(payment.id);
                }}
              >
                نسخ معرف الدفع
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>عرض العميل</DropdownMenuItem>
              <DropdownMenuItem>عرض تفاصيل الدفع</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  }),
]);

export default function DataTableRtl() {
  const [sorting, setSorting] = createSignal<SortingState>([]);
  const [columnFilters, setColumnFilters] = createSignal<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = createSignal<ColumnVisibilityState>({});
  const [rowSelection, setRowSelection] = createSignal<RowSelectionState>({});

  const table = createTable(() => ({
    features,
    data,
    columns,
    getRowId: (payment: Payment) => payment.id,
    initialState: { pagination: { pageIndex: 0, pageSize: 5 } },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting: sorting(),
      columnFilters: columnFilters(),
      columnVisibility: columnVisibility(),
      rowSelection: rowSelection(),
    },
  }));

  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={root}>
        <div class={toolbar}>
          <Input
            placeholder="تصفية البريد الإلكتروني..."
            aria-label="تصفية البريد الإلكتروني"
            class={filter}
            value={(table.getColumn("email")?.getFilterValue() as string | undefined) ?? ""}
            onInput={(event) =>
              table.getColumn("email")?.setFilterValue((event.target as HTMLInputElement).value)
            }
          />
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="outline" class={pushed}>
                الأعمدة <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" dir="rtl">
              <DropdownMenuGroup>
                <For each={table.getAllColumns().filter((column) => column.getCanHide())}>
                  {(column: Column<Features, Payment>) => (
                    <DropdownMenuCheckboxItem
                      class={capitalize}
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(value)}
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  )}
                </For>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div class={frame}>
          <Table>
            <TableHeader>
              <For each={table.getHeaderGroups()}>
                {(headerGroup: HeaderGroup<Features, Payment>) => (
                  <TableRow>
                    <For each={headerGroup.headers}>
                      {(header: Header<Features, Payment>) => (
                        <TableHead>
                          <Show when={!header.isPlaceholder}>
                            <table.FlexRender header={header} />
                          </Show>
                        </TableHead>
                      )}
                    </For>
                  </TableRow>
                )}
              </For>
            </TableHeader>
            <TableBody>
              <For
                each={table.getRowModel().rows}
                fallback={
                  <TableRow>
                    <TableCell colSpan={columns.length} class={empty}>
                      لا توجد نتائج.
                    </TableCell>
                  </TableRow>
                }
              >
                {(row: Row<Features, Payment>) => (
                  <TableRow isSelected={row.getIsSelected()}>
                    <For each={row.getVisibleCells()}>
                      {(cell: Cell<Features, Payment>) => (
                        <TableCell>
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      )}
                    </For>
                  </TableRow>
                )}
              </For>
            </TableBody>
          </Table>
        </div>
        <div class={footer}>
          <div class={selected}>
            {table.getFilteredSelectedRowModel().rows.length} من{" "}
            {table.getFilteredRowModel().rows.length} صف(وف) محدد.
          </div>
          <div class={pager}>
            <Button
              variant="outline"
              size="sm"
              onPress={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              السابق
            </Button>
            <Button
              variant="outline"
              size="sm"
              onPress={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              التالي
            </Button>
          </div>
        </div>
      </div>
    </DirectionProvider>
  );
}
