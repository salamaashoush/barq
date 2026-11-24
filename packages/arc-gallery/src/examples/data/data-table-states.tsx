import { createSignal } from "@barqjs/core";
import {
  Button,
  Currency,
  DataTable,
  type DataTableColumn,
  EmptyState,
  Stack,
  ToggleGroup,
  ToggleGroupItem,
} from "@barqjs/arc";
import { FileText } from "@barqjs/lucide/icons/file-text";

import { INVOICES, type Invoice } from "../../data/operations.ts";

const COLUMNS: DataTableColumn<Invoice>[] = [
  { accessorKey: "number", header: "Invoice" },
  { accessorKey: "customer", header: "Customer" },
  {
    accessorKey: "amount",
    header: "Amount",
    align: "end",
    cell: (context) => <Currency value={context.row.original.amount} currency="USD" />,
  },
];

type State = "loaded" | "loading" | "empty";

export default function DataTableStates() {
  const [state, setState] = createSignal<State>("loading");

  function data(): readonly Invoice[] | undefined {
    if (state() === "loading") return undefined;
    return state() === "empty" ? [] : INVOICES.slice(0, 4);
  }

  return (
    <Stack gap={3}>
      <ToggleGroup
        aria-label="Table state"
        variant="outline"
        size="sm"
        value={state()}
        onChange={(value) => {
          const next = value[0];
          if (next === "loaded" || next === "loading" || next === "empty") setState(next);
        }}
      >
        <ToggleGroupItem value="loading">Loading</ToggleGroupItem>
        <ToggleGroupItem value="loaded">Loaded</ToggleGroupItem>
        <ToggleGroupItem value="empty">Empty</ToggleGroupItem>
      </ToggleGroup>
      <DataTable
        label="Recent invoices"
        columns={COLUMNS}
        data={data()}
        getRowId={(invoice) => invoice.id}
        skeletonRows={4}
        empty={
          <EmptyState
            icon={<FileText />}
            heading="No invoices yet"
            description="Invoices appear here once a customer's first billing cycle closes."
            actions={<Button onPress={() => setState("loaded")}>Create invoice</Button>}
          />
        }
      />
    </Stack>
  );
}
