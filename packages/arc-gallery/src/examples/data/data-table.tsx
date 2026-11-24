import { createMemo, createSignal } from "@barqjs/core";
import {
  Button,
  Currency,
  DataTable,
  type DataTableColumn,
  DataToolbar,
  FormattedDate,
  Stack,
  Status,
  Text,
  toast,
} from "@barqjs/arc";
import { Archive } from "@barqjs/lucide/icons/archive";
import { Download } from "@barqjs/lucide/icons/download";
import { Send } from "@barqjs/lucide/icons/send";

import { INVOICES, INVOICE_STATUS, type Invoice } from "../../data/operations.ts";

const COLUMNS: DataTableColumn<Invoice>[] = [
  { accessorKey: "number", header: "Invoice", minWidth: 104 },
  { accessorKey: "customer", header: "Customer", minWidth: 140 },
  { accessorKey: "email", header: "Billing email", hideBelow: "lg" },
  { accessorKey: "region", header: "Region", hideBelow: "md" },
  {
    accessorKey: "status",
    header: "Status",
    minWidth: 112,
    cell: (context) => {
      const status = INVOICE_STATUS[context.row.original.status];
      return (
        <Status tone={status.tone} variant="subtle">
          {status.label}
        </Status>
      );
    },
  },
  {
    accessorKey: "issued",
    header: "Issued",
    hideBelow: "sm",
    cell: (context) => <FormattedDate value={context.row.original.issued} timeZone="UTC" />,
  },
  {
    accessorKey: "amount",
    header: "Amount",
    align: "end",
    minWidth: 112,
    cell: (context) => <Currency value={context.row.original.amount} currency="USD" />,
  },
];

const STATUS_OPTIONS = (Object.keys(INVOICE_STATUS) as Invoice["status"][]).map((value) => ({
  value,
  label: INVOICE_STATUS[value].label,
  count: INVOICES.filter((invoice) => invoice.status === value).length,
}));

export default function DataTableExample() {
  const [invoices, setInvoices] = createSignal<readonly Invoice[]>(INVOICES);
  const [query, setQuery] = createSignal("");
  const [statuses, setStatuses] = createSignal<string[]>([]);
  const [visibility, setVisibility] = createSignal<Record<string, boolean>>({ email: false });
  const [page, setPage] = createSignal(0);

  const shown = createMemo(() => {
    const words = query().trim().toLowerCase();
    return invoices().filter(
      (invoice) =>
        (statuses().length === 0 || statuses().includes(invoice.status)) &&
        (words === "" ||
          invoice.customer.toLowerCase().includes(words) ||
          invoice.number.toLowerCase().includes(words)),
    );
  });

  const archive = (rows: readonly Invoice[]) => {
    const gone = new Set(rows.map((row) => row.id));
    setInvoices((all) => all.filter((invoice) => !gone.has(invoice.id)));
    toast.success(`Archived ${rows.length} ${rows.length === 1 ? "invoice" : "invoices"}`);
  };

  return (
    <Stack gap={3}>
      <DataToolbar
        search={{
          label: "Search invoices",
          placeholder: "Search by customer or number",
          value: query(),
          onChange: (value) => {
            setQuery(value);
            setPage(0);
          },
        }}
        filters={[
          {
            id: "status",
            label: "Status",
            options: STATUS_OPTIONS,
            value: statuses(),
            onChange: (value) => {
              setStatuses(value);
              setPage(0);
            },
          },
        ]}
        columns={[
          { id: "email", label: "Billing email" },
          { id: "region", label: "Region" },
          { id: "issued", label: "Issued" },
        ]}
        columnVisibility={visibility()}
        onColumnVisibilityChange={setVisibility}
        actions={
          <Button variant="outline" size="sm" onPress={() => toast("Export started")}>
            <Download aria-hidden="true" />
            Export
          </Button>
        }
      />
      <DataTable
        label="Invoices"
        columns={COLUMNS}
        data={shown()}
        getRowId={(invoice) => invoice.id}
        defaultSorting={[{ id: "issued", desc: true }]}
        columnVisibility={visibility()}
        onColumnVisibilityChange={setVisibility}
        selectionMode="multiple"
        selectionActions={[
          {
            label: "Send reminder",
            icon: <Send aria-hidden="true" />,
            onAction: async (rows) => {
              await new Promise((resolve) => setTimeout(resolve, 600));
              toast.success(
                `Reminded ${rows.length} ${rows.length === 1 ? "customer" : "customers"}`,
              );
            },
          },
          {
            label: "Archive",
            icon: <Archive aria-hidden="true" />,
            tone: "danger",
            confirm: (rows) => ({
              title: `Archive ${rows.length} ${rows.length === 1 ? "invoice" : "invoices"}?`,
              description: "Archived invoices leave this list and stop sending reminders.",
              confirmLabel: "Archive",
            }),
            onAction: archive,
          },
        ]}
        pagination={{ pageSize: 8, pageIndex: page(), onPageIndexChange: setPage }}
        resizable
      />
      <Text size="sm" color="muted">
        {shown().length} of {invoices().length} invoices. Sort by a header, select rows for the bar,
        and narrow the window to watch Region and Issued leave.
      </Text>
    </Stack>
  );
}
