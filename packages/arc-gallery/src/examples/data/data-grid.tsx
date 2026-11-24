import { createSignal } from "@barqjs/core";
import {
  Button,
  DataGrid,
  type DataGridChange,
  type DataGridColumn,
  type DataGridColumnGroup,
  Inline,
  Label,
  Stack,
  Switch,
  Text,
  toast,
} from "@barqjs/arc";

interface Line {
  id: string;
  item: string;
  team: string;
  owner: string;
  q1: number | null;
  q2: number | null;
  renews: string;
  approved: boolean;
}

const TEAMS = [
  { value: "Platform", label: "Platform" },
  { value: "Payments", label: "Payments" },
  { value: "Support", label: "Support" },
];

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function money(value: unknown) {
  return typeof value === "number" ? usd.format(value) : "";
}

function atMost(value: unknown) {
  return typeof value === "number" && value < 0 ? "A budget cannot be negative" : undefined;
}

const COLUMNS: (DataGridColumn<Line> | DataGridColumnGroup<Line>)[] = [
  { id: "item", header: "Line item", frozen: true, width: 200 },
  { id: "team", header: "Team", type: "select", options: TEAMS, width: 130 },
  { id: "owner", header: "Owner", width: 120, total: "count" },
  {
    id: "plan",
    header: "Plan (USD)",
    columns: [
      {
        id: "q1",
        header: "Q1",
        type: "number",
        total: "sum",
        format: money,
        validate: atMost,
        width: 120,
      },
      {
        id: "q2",
        header: "Q2",
        type: "number",
        total: "sum",
        format: money,
        validate: atMost,
        width: 120,
      },
    ],
  },
  { id: "renews", header: "Renews", type: "date", width: 150 },
  { id: "approved", header: "Approved", type: "checkbox", width: 110 },
];

const START: Line[] = [
  {
    id: "l1",
    item: "Cloud compute",
    team: "Platform",
    owner: "Salama",
    q1: 42000,
    q2: 45500,
    renews: "2027-01-01",
    approved: true,
  },
  {
    id: "l2",
    item: "Observability",
    team: "Platform",
    owner: "Omar",
    q1: 9800,
    q2: 9800,
    renews: "2027-03-15",
    approved: true,
  },
  {
    id: "l3",
    item: "Card processing",
    team: "Payments",
    owner: "Lina",
    q1: 18200,
    q2: 21000,
    renews: "2026-12-31",
    approved: false,
  },
  {
    id: "l4",
    item: "Fraud scoring",
    team: "Payments",
    owner: "Maya",
    q1: 6400,
    q2: 7100,
    renews: "2027-06-30",
    approved: true,
  },
  {
    id: "l5",
    item: "Help desk seats",
    team: "Support",
    owner: "Jonas",
    q1: 5200,
    q2: 5200,
    renews: "2027-02-01",
    approved: false,
  },
];

export default function DataGridExample() {
  const [lines, setLines] = createSignal<Line[]>(START);
  const [dirty, setDirty] = createSignal<ReadonlySet<string>>(new Set());
  const [grouped, setGrouped] = createSignal(false);

  function apply(changes: DataGridChange<Line>[]) {
    setLines((rows) =>
      rows.map((row) => {
        const mine = changes.filter((change) => change.rowId === row.id);
        return mine.reduce<Line>(
          (next, change) => ({ ...next, [change.field]: change.value }),
          row,
        );
      }),
    );
    setDirty(
      (marked) =>
        new Set([...marked, ...changes.map((change) => `${change.rowId}:${change.columnId}`)]),
    );
  }

  function addRow() {
    return setLines((rows) => [
      ...rows,
      {
        id: `l${rows.length + 1}`,
        item: "New line",
        team: "Platform",
        owner: "Salama",
        q1: null,
        q2: null,
        renews: "",
        approved: false,
      },
    ]);
  }

  return (
    <Stack gap={3}>
      <Inline justify="between" align="center" gap={3}>
        <Inline gap={2} align="center">
          <Switch id="budget-grouped" isSelected={grouped()} onChange={setGrouped} />
          <Label for="budget-grouped">Group by team</Label>
        </Inline>
        <Inline gap={2} align="center">
          <Text size="sm" color="muted">
            {dirty().size} unsaved {dirty().size === 1 ? "change" : "changes"}
          </Text>
          <Button
            size="sm"
            isDisabled={dirty().size === 0}
            onPress={() => {
              setDirty(new Set<string>());
              toast.success("Budget saved");
            }}
          >
            Save
          </Button>
        </Inline>
      </Inline>
      <DataGrid
        label="Acme budget, first half of 2027"
        data={lines()}
        getRowId={(line) => line.id}
        columns={COLUMNS}
        groupBy={grouped() ? "team" : undefined}
        dirtyCells={dirty()}
        onCellsChange={apply}
        onAddRow={addRow}
      />
      <Text size="sm" color="muted">
        Double-click or press Enter to edit, drag or Shift with the arrows to select a range, Mod+C
        to copy and paste it elsewhere. A negative plan is refused with the reason.
      </Text>
    </Stack>
  );
}
