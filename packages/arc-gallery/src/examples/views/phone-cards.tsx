import {
  DataTable,
  type DataTableCard,
  type DataTableColumn,
  type DataTableRowAction,
  Stack,
  Status,
  Text,
  toast,
} from "@barqjs/arc";
import { Play } from "@barqjs/lucide/icons/play";

import { CHECKS, CHECK_STATE, KIND_LABEL, type Check } from "../../data/views.ts";

const COLUMNS: DataTableColumn<Check>[] = [
  { accessorKey: "name", header: "Check", minWidth: 160 },
  {
    accessorKey: "kind",
    header: "Kind",
    cell: (context) => KIND_LABEL[context.row.original.kind],
  },
  {
    accessorKey: "state",
    header: "State",
    cell: (context) => {
      const state = CHECK_STATE[context.row.original.state];
      return <Status tone={state.tone}>{state.label}</Status>;
    },
  },
  { accessorKey: "runs", header: "Runs a day", align: "end" },
  {
    accessorKey: "cost",
    header: "Cost",
    align: "end",
    cell: (context) => `$${context.row.original.cost.toFixed(2)}`,
  },
];

const TOTAL = CHECKS.reduce((sum, check) => sum + check.cost, 0);
const RUNS = CHECKS.reduce((sum, check) => sum + check.runs, 0);

function card(): DataTableCard<Check> {
  return {
    title: (check: Check) => check.name,
    fact: (check: Check) => `${KIND_LABEL[check.kind]} · ${String(check.runs)} runs a day`,
    status: (check: Check) => {
      const state = CHECK_STATE[check.state];
      return <Status tone={state.tone}>{state.label}</Status>;
    },
  };
}

function actions(check: Check): DataTableRowAction[] {
  return [
    {
      label: "Run now",
      icon: <Play aria-hidden="true" />,
      inline: true,
      onAction: () => void toast(`${check.name} queued`),
    },
    { label: "Pause", onAction: () => void toast(`${check.name} paused`) },
    {
      label: "Delete",
      tone: "danger",
      isDisabled: !check.editable,
      onAction: () => void toast(`${check.name} deleted`),
    },
  ];
}

export default function PhoneCardsExample() {
  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Text size="sm" color="muted">
          A table on a wide screen, cards on a phone (try the phone frame).
        </Text>
        <DataTable
          label="Checks"
          columns={COLUMNS}
          data={CHECKS}
          getRowId={(check) => check.id}
          rowHref={(check) => `#${check.id}`}
          card={card()}
          rowActions={actions}
          totals={[
            {
              id: "total",
              label: "Total",
              cells: { runs: String(RUNS), cost: `$${TOTAL.toFixed(2)}` },
            },
          ]}
        />
      </Stack>
      <Stack gap={2}>
        <Text size="sm" color="muted">
          Cards at every width, for a narrow column.
        </Text>
        <div style={{ "max-width": "24rem" }}>
          <DataTable
            label="Checks in a side panel"
            columns={COLUMNS}
            data={CHECKS.slice(0, 3)}
            getRowId={(check) => check.id}
            layout="cards"
            card={card()}
            rowActions={actions}
          />
        </div>
      </Stack>
    </Stack>
  );
}
