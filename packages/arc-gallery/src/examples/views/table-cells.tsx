import {
  CellWithNote,
  DataTable,
  type DataTableColumn,
  OverflowList,
  Status,
  Link,
} from "@barqjs/arc";

import { CHECKS, CHECK_STATE, type Check } from "../../data/views.ts";

const COLUMNS: DataTableColumn<Check>[] = [
  {
    accessorKey: "name",
    header: "Check",
    minWidth: 180,
    cell: (context) => (
      <CellWithNote note={context.row.original.note}>{context.row.original.name}</CellWithNote>
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
  {
    id: "locations",
    accessorFn: (check) => check.locations.join(", "),
    header: "Runs from",
    minWidth: 200,
    cell: (context) => (
      <OverflowList
        label={`${context.row.original.name} runs from`}
        items={context.row.original.locations}
        render={(place) => <Link href={`#location-${place}`}>{place}</Link>}
        empty="Nowhere"
      />
    ),
  },
  {
    id: "summary",
    accessorFn: (check) => check.locations.length,
    header: "Summary",
    hideBelow: "lg",
    minWidth: 220,
    cell: (context) => (
      <OverflowList
        label={`${context.row.original.name} locations`}
        variant="text"
        items={context.row.original.locations}
      />
    ),
  },
];

export default function TableCellsExample() {
  return (
    <DataTable label="Checks" columns={COLUMNS} data={CHECKS} getRowId={(check) => check.id} />
  );
}
