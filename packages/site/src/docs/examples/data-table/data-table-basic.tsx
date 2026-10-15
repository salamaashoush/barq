import { For, Show } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  type Cell,
  type Header,
  type HeaderGroup,
  type Row,
  createColumnHelper,
  createTable,
  tableFeatures,
} from "@barqjs/table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@barqjs/ui";

const features = tableFeatures({});

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

const frame = css`
  width: 100%;
  overflow: hidden;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
`;

const empty = css`
  height: calc(var(--spacing) * 24);
  text-align: center;
`;

const columnHelper = createColumnHelper<Features, Payment>();

const columns = columnHelper.columns([
  columnHelper.accessor("status", { header: "Status" }),
  columnHelper.accessor("email", { header: "Email" }),
  columnHelper.accessor("amount", { header: "Amount" }),
]);

export default function DataTableBasic() {
  const table = createTable({ features, data, columns });

  return (
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
  );
}
