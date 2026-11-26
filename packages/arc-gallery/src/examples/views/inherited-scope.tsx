import { DataTable, type DataTableColumn, InheritedScopeList, toast } from "@barqjs/arc";

import { ORG_ROUTES, PROJECT_ROUTES, type Route } from "../../data/views.ts";

const COLUMNS: DataTableColumn<Route>[] = [
  { accessorKey: "name", header: "Route" },
  { accessorKey: "target", header: "Sends to" },
  { accessorKey: "severities", header: "Severities", hideBelow: "md" },
];

export default function InheritedScopeExample() {
  return (
    <InheritedScopeList
      ownHeading="This project's routes"
      own={
        <DataTable
          label="This project's routes"
          columns={COLUMNS}
          data={PROJECT_ROUTES}
          getRowId={(route) => route.id}
          rowActions={(route) => [
            { label: "Edit", inline: true, onAction: () => void toast(`Editing ${route.name}`) },
            {
              label: "Delete",
              tone: "danger",
              onAction: () => void toast(`${route.name} deleted`),
            },
          ]}
        />
      }
      inherited={[
        {
          id: "org",
          owner: "Acme organization",
          href: "#organization-alerts",
          content: (
            <DataTable
              label="Organization routes"
              columns={COLUMNS}
              data={ORG_ROUTES}
              getRowId={(route) => route.id}
            />
          ),
        },
        { id: "team", owner: "Platform team", href: "#team-alerts", content: null, isEmpty: true },
      ]}
      note="Incidents no route covers go to the project's owners."
    />
  );
}
