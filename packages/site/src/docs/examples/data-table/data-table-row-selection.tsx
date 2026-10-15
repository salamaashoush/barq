import { For, Show, createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  type Cell,
  type Header,
  type HeaderGroup,
  type Row,
  type RowSelectionState,
  createColumnHelper,
  createTable,
  rowSelectionFeature,
  tableFeatures,
} from "@barqjs/table";
import {
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barqjs/ui";

const features = tableFeatures({ rowSelectionFeature });

type Features = typeof features;

type Payment = {
  id: string;
  amount: number;
  status: "pending" | "processing" | "success" | "failed";
  email: string;
};

const data: Payment[] = [
  { id: "728ed52f", amount: 100, status: "pending", email: "salama@example.com" },
  { id: "489e1d42", amount: 125, status: "processing", email: "ada@example.com" },
  { id: "9f3c7a10", amount: 316, status: "success", email: "zed@example.com" },
  { id: "c21b8e64", amount: 242, status: "success", email: "lin@example.com" },
  { id: "5d0a4f97", amount: 721, status: "failed", email: "omar@example.com" },
];

const root = css`
  width: 100%;
`;

const frame = css`
  overflow: hidden;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
`;

const empty = css`
  height: calc(var(--spacing) * 24);
  text-align: center;
`;

const selected = css`
  padding-block: calc(var(--spacing) * 4);
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

const columnHelper = createColumnHelper<Features, Payment>();

const columns = columnHelper.columns([
  columnHelper.display({
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllRowsSelected() || (table.getIsSomeRowsSelected() && "indeterminate")}
        onCheckedChange={(value) => table.toggleAllRowsSelected(value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(value)}
        aria-label="Select row"
      />
    ),
  }),
  columnHelper.accessor("status", { header: "Status" }),
  columnHelper.accessor("email", { header: "Email" }),
  columnHelper.accessor("amount", { header: "Amount" }),
]);

export default function DataTableRowSelection() {
  const [rowSelection, setRowSelection] = createSignal<RowSelectionState>({});

  const table = createTable(() => ({
    features,
    data,
    columns,
    getRowId: (payment: Payment) => payment.id,
    onRowSelectionChange: setRowSelection,
    state: { rowSelection: rowSelection() },
  }));

  return (
    <div class={root}>
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
                    No results.
                  </TableCell>
                </TableRow>
              }
            >
              {(row: Row<Features, Payment>) => (
                <TableRow isSelected={row.getIsSelected()}>
                  <For each={row.getAllCells()}>
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
      <div class={selected}>
        {table.getSelectedRowModel().rows.length} of {table.getRowModel().rows.length} row(s)
        selected.
      </div>
    </div>
  );
}
