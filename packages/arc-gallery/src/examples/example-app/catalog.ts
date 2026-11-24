import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "example-app",
  title: "Example app",
  description: "Many arc pieces composed into one realistic dashboard.",
  examples: [
    {
      id: "dashboard",
      title: "Acme operations dashboard",
      description:
        "A page header with actions, stats with trends, a chart, recent activity, and an invoice table with a toolbar, a selection bar, a detail sheet on a row, and an empty state when a filter finds nothing.",
      covers: [
        "PageHeader",
        "StatGroup",
        "ComboChart",
        "Timeline",
        "DataToolbar",
        "DataTable",
        "SelectionBar",
        "DetailSheet",
        "DescriptionList",
        "EmptyState",
      ],
    },
  ],
};
