import { Show, createMemo, createSignal } from "@barqjs/core";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ComboChart,
  Currency,
  DataTable,
  type DataTableColumn,
  DataToolbar,
  DescriptionList,
  DetailSheet,
  EmptyState,
  FormattedDate,
  Grid,
  Heading,
  PageHeader,
  PersonAvatar,
  Stack,
  StatGroup,
  Status,
  Timeline,
  toast,
} from "@barqjs/arc";
import { Download } from "@barqjs/lucide/icons/download";
import { Plus } from "@barqjs/lucide/icons/plus";
import { SearchX } from "@barqjs/lucide/icons/search-x";
import { Send } from "@barqjs/lucide/icons/send";

import {
  ACTIVITY,
  DAYS,
  INVOICES,
  INVOICE_STATUS,
  type Invoice,
  NOW,
} from "../../data/operations.ts";

const STATUS_OPTIONS = (Object.keys(INVOICE_STATUS) as Invoice["status"][]).map((value) => ({
  value,
  label: INVOICE_STATUS[value].label,
}));

const COLUMNS: DataTableColumn<Invoice>[] = [
  { accessorKey: "number", header: "Invoice", minWidth: 104 },
  { accessorKey: "customer", header: "Customer", minWidth: 140 },
  { accessorKey: "region", header: "Region", hideBelow: "lg" },
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
    hideBelow: "md",
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

const total = (status: Invoice["status"]) =>
  INVOICES.filter((invoice) => invoice.status === status).reduce(
    (sum, invoice) => sum + invoice.amount,
    0,
  );

export default function Dashboard() {
  const [query, setQuery] = createSignal("");
  const [statuses, setStatuses] = createSignal<string[]>([]);
  const [open, setOpen] = createSignal<Invoice | null>(null);

  const shown = createMemo(() => {
    const words = query().trim().toLowerCase();
    return INVOICES.filter(
      (invoice) =>
        (statuses().length === 0 || statuses().includes(invoice.status)) &&
        (words === "" || `${invoice.customer} ${invoice.number}`.toLowerCase().includes(words)),
    );
  });

  const clear = () => {
    setQuery("");
    setStatuses([]);
  };

  return (
    <Stack gap={8}>
      <PageHeader
        heading="Operations"
        description="Acme's revenue, traffic and invoices for the last two weeks."
        actions={
          <>
            <Button variant="outline" onPress={() => toast("Your report is being prepared")}>
              <Download aria-hidden="true" />
              Export
            </Button>
            <Button onPress={() => toast("New invoice drafted")}>
              <Plus aria-hidden="true" />
              New invoice
            </Button>
          </>
        }
      />

      <StatGroup
        aria-label="Last 14 days"
        stats={[
          {
            label: "Collected",
            value: <Currency value={total("paid")} currency="USD" compact />,
            delta: {
              value: "+8.2%",
              tone: "success",
              direction: "up",
              label: "on the 14 days before",
            },
            trend: [42, 44, 41, 47, 49, 52, 55],
          },
          {
            label: "Outstanding",
            value: <Currency value={total("open") + total("overdue")} currency="USD" compact />,
            delta: { value: "+3", tone: "warning", direction: "up", label: "overdue invoices" },
            trend: [12, 14, 13, 15, 17, 16, 19],
            trendTone: "warning",
          },
          {
            label: "API requests",
            value: "2.8M",
            trend: DAYS.map((day) => day.requests),
          },
          {
            label: "Error rate",
            value: "1.4%",
            delta: { value: "-0.4 pts", tone: "success", direction: "down", label: "on last week" },
            trend: DAYS.map((day) => day.errors),
            trendTone: "danger",
          },
        ]}
      />

      <Grid columns={{ base: 1, cqLg: 2 }} gap={6}>
        <Card>
          <CardHeader>
            <CardTitle>Traffic and errors</CardTitle>
            <CardDescription>Requests a day against the share that failed.</CardDescription>
          </CardHeader>
          <CardContent>
            <ComboChart
              label="Requests and error rate, last 14 days"
              data={DAYS.map((day) => ({
                day: day.day,
                requests: day.requests,
                errors: day.errors,
              }))}
              x="day"
              xLabel="Day"
              bars={[{ key: "requests", label: "Requests (thousands)" }]}
              lines={[{ key: "errors", label: "Error rate (%)", tone: "danger" }]}
              dualAxis
              height={240}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>What changed across the workspace today.</CardDescription>
          </CardHeader>
          <CardContent>
            <Timeline
              aria-label="Recent activity"
              density="compact"
              now={NOW}
              events={ACTIVITY.slice(0, 4).map((event) => ({
                id: event.id,
                title: event.what,
                time: event.at,
                tone: event.tone,
                actor: <PersonAvatar person={{ name: event.who }} size="sm" />,
              }))}
            />
          </CardContent>
        </Card>
      </Grid>

      <Stack gap={3}>
        <Heading level={2} size="md">
          Invoices
        </Heading>
        <DataToolbar
          search={{
            label: "Search invoices",
            placeholder: "Customer or number",
            value: query(),
            onChange: setQuery,
          }}
          filters={[
            {
              id: "status",
              label: "Status",
              options: STATUS_OPTIONS,
              value: statuses(),
              onChange: setStatuses,
            },
          ]}
        />
        <DataTable
          label="Invoices"
          columns={COLUMNS}
          data={shown()}
          getRowId={(invoice) => invoice.id}
          defaultSorting={[{ id: "issued", desc: true }]}
          selectionMode="multiple"
          selectionActions={[
            {
              label: "Send reminders",
              icon: <Send aria-hidden="true" />,
              onAction: async (rows) => {
                await new Promise((resolve) => setTimeout(resolve, 700));
                toast.success(
                  `Sent ${rows.length} ${rows.length === 1 ? "reminder" : "reminders"}`,
                );
              },
            },
          ]}
          onRowAction={setOpen}
          pagination={{ pageSize: 8 }}
          empty={
            <EmptyState
              icon={<SearchX />}
              heading="No invoices match"
              description="Nothing fits this search and these filters."
              actions={
                <Button variant="outline" onPress={clear}>
                  Clear filters
                </Button>
              }
            />
          }
        />
      </Stack>

      <DetailSheet
        heading={open()?.number ?? "Invoice"}
        description={open()?.customer}
        open={open() !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
        footer={
          <>
            <Button variant="outline" onPress={() => setOpen(null)}>
              Close
            </Button>
            <Button
              onPress={() => {
                toast.success(`Reminder sent for ${open()?.number ?? "the invoice"}`);
                setOpen(null);
              }}
            >
              <Send aria-hidden="true" />
              Send reminder
            </Button>
          </>
        }
      >
        <Show when={open()}>
          {(invoice) => (
            <DescriptionList
              items={[
                {
                  term: "Status",
                  details: (
                    <Status tone={INVOICE_STATUS[invoice().status].tone} variant="subtle">
                      {INVOICE_STATUS[invoice().status].label}
                    </Status>
                  ),
                },
                { term: "Customer", details: invoice().customer },
                { term: "Billing email", details: invoice().email },
                { term: "Region", details: invoice().region },
                {
                  term: "Issued",
                  details: <FormattedDate value={invoice().issued} timeZone="UTC" />,
                },
                { term: "Amount", details: <Currency value={invoice().amount} currency="USD" /> },
              ]}
            />
          )}
        </Show>
      </DetailSheet>
    </Stack>
  );
}
