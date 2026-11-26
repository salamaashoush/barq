import { createMemo, createSignal } from "@barqjs/core";
import {
  DataTable,
  type DataTableColumn,
  DataTableCount,
  DataToolbar,
  type SavedView,
  SavedViews,
  SegmentedControl,
  Stack,
  Status,
  oneOf,
  toast,
  useSearchParam,
} from "@barqjs/arc";
import { Activity } from "@barqjs/lucide/icons/activity";
import { Globe } from "@barqjs/lucide/icons/globe";
import { Network } from "@barqjs/lucide/icons/network";
import { Server } from "@barqjs/lucide/icons/server";

import {
  CHECKS,
  CHECK_STATE,
  KIND_LABEL,
  SAVED_VIEWS,
  TIME_ZONES,
  type Check,
  type CheckKind,
  type CheckState,
} from "../../data/views.ts";

const STATES = ["all", "failing", "degraded", "passing", "paused"] as const;
type StateFilter = (typeof STATES)[number];

const KIND_ICON = { api: Server, browser: Globe, tcp: Network, dns: Activity } as const;

const COLUMNS: DataTableColumn<Check>[] = [
  { accessorKey: "name", header: "Check" },
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
  { accessorKey: "latency", header: "p95 ms", align: "end", hideBelow: "sm" },
];

function count(state: CheckState): number {
  return CHECKS.filter((check) => check.state === state).length;
}

export default function ListPageExample() {
  const state = useSearchParam<StateFilter>("state", { defaultValue: "all", parse: oneOf(STATES) });
  const kinds = useSearchParam<string[]>("kind", {
    defaultValue: [],
    parse: (raw) => raw.split(","),
    format: (value) => value.join(","),
  });
  const query = useSearchParam("q", { defaultValue: "" });
  const mine = useSearchParam("mine", { defaultValue: "" });
  const [views, setViews] = createSignal<readonly SavedView[]>(SAVED_VIEWS);

  const rows = createMemo(() =>
    CHECKS.filter(
      (check) =>
        (state.value() === "all" || check.state === state.value()) &&
        (kinds.value().length === 0 || kinds.value().includes(check.kind)) &&
        (mine.value() === "" || check.editable) &&
        check.name.toLowerCase().includes(query.value().toLowerCase()),
    ),
  );

  return (
    <Stack gap={3}>
      <SegmentedControl
        aria-label="State"
        param="state"
        items={[
          { value: "all", label: "All", count: CHECKS.length },
          { value: "failing", label: "Failing", count: count("failing"), tone: "danger" },
          { value: "degraded", label: "Degraded", count: count("degraded"), tone: "warning" },
          { value: "passing", label: "Passing", count: count("passing"), tone: "success" },
          { value: "paused", label: "Paused", count: count("paused"), tone: "neutral" },
        ]}
      />
      <DataToolbar
        search={{ label: "Search checks", placeholder: "Search by name", param: "q" }}
        filters={[
          {
            id: "kind",
            label: "Kind",
            param: "kind",
            options: (Object.keys(KIND_LABEL) as CheckKind[]).map((kind) => ({
              value: kind,
              label: KIND_LABEL[kind],
              icon: KIND_ICON[kind],
              count: CHECKS.filter((check) => check.kind === kind).length,
              group: kind === "api" || kind === "browser" ? "Synthetic" : "Network",
            })),
          },
          { kind: "toggle", id: "mine", label: "Yours to change", param: "mine" },
          { kind: "date-range", id: "when", label: "Created", param: "when" },
          {
            id: "zone",
            label: "Time zone",
            param: "zone",
            multiple: false,
            options: TIME_ZONES.map((zone) => ({ value: zone, label: zone })),
          },
        ]}
        chips={[
          { id: "env", label: "env", value: "production", onRemove: () => toast("Removed env") },
        ]}
        actions={
          <SavedViews
            param="view"
            exclude={["window", "range"]}
            views={views()}
            onCreate={(draft, saved) => {
              const view: SavedView = {
                id: `view-${String(views().length + 1)}`,
                name: draft.name,
                state: saved,
                mine: true,
                shared: draft.shared,
                isDefault: draft.isDefault,
              };
              setViews((all) => [...all, view]);
              return view;
            }}
            onUpdate={(view, saved) =>
              setViews((all) =>
                all.map((one) => (one.id === view.id ? { ...one, state: saved } : one)),
              )
            }
            onRename={(view, draft) => {
              const renamed = { ...view, name: draft.name, shared: draft.shared };
              setViews((all) => all.map((one) => (one.id === view.id ? renamed : one)));
              return renamed;
            }}
            onDefaultChange={(view, isDefault) =>
              setViews((all) =>
                all.map((one) => ({ ...one, isDefault: one.id === view.id ? isDefault : false })),
              )
            }
            onDelete={(view) => setViews((all) => all.filter((one) => one.id !== view.id))}
          />
        }
      />
      <DataTable
        label="Checks"
        columns={COLUMNS}
        data={rows()}
        getRowId={(check) => check.id}
        footer={<DataTableCount shown={rows().length} />}
      />
    </Stack>
  );
}
