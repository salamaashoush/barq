import { createSignal } from "@barqjs/core";
import { DataTable, type DataTableColumn, Status, toast } from "@barqjs/arc";
import { BellOff } from "@barqjs/lucide/icons/bell-off";
import { CircleCheck } from "@barqjs/lucide/icons/circle-check";
import { Play } from "@barqjs/lucide/icons/play";

import { CHECKS, CHECK_STATE, type Check } from "../../data/views.ts";

const COLUMNS: DataTableColumn<Check>[] = [
  { accessorKey: "name", header: "Check" },
  {
    accessorKey: "state",
    header: "State",
    cell: (context) => {
      const state = CHECK_STATE[context.row.original.state];
      return <Status tone={state.tone}>{state.label}</Status>;
    },
  },
  {
    accessorKey: "editable",
    header: "Yours to change",
    cell: (context) => (context.row.original.editable ? "Yes" : "No"),
  },
];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default function BulkActionsExample() {
  const [checks, setChecks] = createSignal<readonly Check[]>(CHECKS);
  return (
    <DataTable
      label="Checks"
      columns={COLUMNS}
      data={checks()}
      getRowId={(check) => check.id}
      selectionMode="multiple"
      selectionActions={[
        {
          label: "Resume",
          icon: <Play aria-hidden="true" />,
          appliesTo: (check) => check.state === "paused",
          onAction: (rows) => {
            const resumed = new Set(rows.map((row) => row.id));
            setChecks((all) =>
              all.map((check) => (resumed.has(check.id) ? { ...check, state: "passing" } : check)),
            );
          },
        },
        {
          label: "Acknowledge",
          icon: <CircleCheck aria-hidden="true" />,
          appliesTo: (check) => check.state === "failing" || check.state === "degraded",
          onAction: (rows) => void toast(`${String(rows.length)} acknowledged`),
        },
        {
          label: "Mute",
          icon: <BellOff aria-hidden="true" />,
          concurrency: 2,
          onEach: async (check) => {
            await wait(400);
            if (!check.editable) throw new Error(`You may not mute ${check.name}.`);
          },
          onSettled: (result) => {
            if (result.failed.length === 0) toast.success(`${String(result.done.length)} muted`);
          },
        },
      ]}
    />
  );
}
