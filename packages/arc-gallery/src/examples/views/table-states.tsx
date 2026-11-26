import { createSignal } from "@barqjs/core";
import {
  Button,
  DataTable,
  type DataTableColumn,
  DataTableCount,
  DataTableNote,
  DescriptionList,
  DetailSheet,
  Stack,
  Status,
  ToggleGroup,
  ToggleGroupItem,
} from "@barqjs/arc";
import { ChevronLeft } from "@barqjs/lucide/icons/chevron-left";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";

import { CHECKS, CHECK_STATE, KIND_LABEL, type Check } from "../../data/views.ts";

type Mode = "loaded" | "error";

export default function TableStatesExample() {
  const [mode, setMode] = createSignal<Mode>("error");
  const [open, setOpen] = createSignal<string | null>(null);
  const [shown, setShown] = createSignal(4);

  function columns(): DataTableColumn<Check>[] {
    return [
      {
        accessorKey: "name",
        header: "Check",
        cell: (context) => (
          <Button variant="link" size="sm" onPress={() => setOpen(context.row.original.id)}>
            {context.row.original.name}
          </Button>
        ),
      },
      {
        accessorKey: "state",
        header: "State",
        cell: (context) => {
          const state = CHECK_STATE[context.row.original.state];
          return <Status tone={state.tone}>{state.label}</Status>;
        },
      },
      { accessorKey: "latency", header: "p95 ms", align: "end" },
    ];
  }

  function at(): number {
    return CHECKS.findIndex((check) => check.id === open());
  }
  function step(by: number): void {
    const next = CHECKS[at() + by];
    if (next !== undefined) setOpen(next.id);
  }

  return (
    <Stack gap={3}>
      <ToggleGroup
        aria-label="Load result"
        variant="outline"
        size="sm"
        value={mode()}
        onChange={(value) => {
          const next = value[0];
          if (next === "loaded" || next === "error") setMode(next);
        }}
      >
        <ToggleGroupItem value="error">Failed</ToggleGroupItem>
        <ToggleGroupItem value="loaded">Loaded</ToggleGroupItem>
      </ToggleGroup>
      <DataTable
        label="Checks"
        columns={columns()}
        data={CHECKS.slice(0, shown())}
        getRowId={(check) => check.id}
        density="compact"
        activeKey={open()}
        error={
          mode() === "error"
            ? { message: "The checks service is restarting.", requestId: "req_8f2c41" }
            : null
        }
        onRetry={() =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              setMode("loaded");
              resolve();
            }, 600);
          })
        }
        footer={
          <>
            <DataTableNote>Online means it reported in within the last two minutes.</DataTableNote>
            <DataTableCount
              shown={shown()}
              total={CHECKS.length}
              hasMore={shown() < CHECKS.length}
              onLoadMore={() => setShown(CHECKS.length)}
            />
          </>
        }
      />
      <DetailSheet
        heading={CHECKS[at()]?.name ?? ""}
        open={open() !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
        footer={
          <>
            <Button variant="outline" isDisabled={at() <= 0} onPress={() => step(-1)}>
              <ChevronLeft aria-hidden="true" />
              Previous
            </Button>
            <Button
              variant="outline"
              isDisabled={at() >= CHECKS.length - 1}
              onPress={() => step(1)}
            >
              Next
              <ChevronRight aria-hidden="true" />
            </Button>
          </>
        }
      >
        <DescriptionList
          items={[
            { term: "Kind", details: KIND_LABEL[CHECKS[at()]?.kind ?? "api"] },
            { term: "Runs a day", details: String(CHECKS[at()]?.runs ?? 0) },
          ]}
        />
      </DetailSheet>
    </Stack>
  );
}
