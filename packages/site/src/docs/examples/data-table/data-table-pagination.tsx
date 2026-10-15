import { For, Show } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  type Cell,
  type Header,
  type HeaderGroup,
  type Row,
  createColumnHelper,
  createPaginatedRowModel,
  createTable,
  rowPaginationFeature,
  tableFeatures,
} from "@barqjs/table";
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@barqjs/ui";

const features = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

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
  { id: "e7b63d08", amount: 129, status: "pending", email: "noor@example.com" },
  { id: "1a94c5f2", amount: 455, status: "processing", email: "sam@example.com" },
  { id: "b80f2e36", amount: 598, status: "success", email: "kai@example.com" },
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

const footer = css`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: calc(var(--spacing) * 2);
  padding-block: calc(var(--spacing) * 4);
`;

const columnHelper = createColumnHelper<Features, Payment>();

const columns = columnHelper.columns([
  columnHelper.accessor("status", { header: "Status" }),
  columnHelper.accessor("email", { header: "Email" }),
  columnHelper.accessor("amount", { header: "Amount" }),
]);

export default function DataTablePagination() {
  const table = createTable({
    features,
    data,
    columns,
    initialState: { pagination: { pageIndex: 0, pageSize: 5 } },
  });

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
                <TableRow>
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
      <div class={footer}>
        <Button
          variant="outline"
          size="sm"
          onPress={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
