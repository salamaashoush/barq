import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "views",
  title: "Table and list views",
  description:
    "List pages kept in the address: filters of every kind, saved views, time windows, table states, phone cards, bulk actions and grouped lists.",
  examples: [
    {
      id: "list-page",
      title: "A list page in the address",
      description:
        "A segmented state with counts, a debounced search, a facet with icons and groups, a toggle, a date range, a searchable time zone, a removable chip and saved views, every one in the URL. Below md the filters fold into a sheet.",
      covers: [
        "DataToolbar",
        "SavedViews",
        "SegmentedControl",
        "useSearchParam",
        "oneOf",
        "DataTableCount",
      ],
    },
    {
      id: "segmented-control",
      title: "Segmented control",
      description:
        "One held with counts and tone dots, a window kept in the address, several held at once, a default segment in a field, and disabled.",
      covers: ["SegmentedControl", "MultiSegmentedControl", "SegmentedField"],
    },
    {
      id: "time-range",
      title: "Time range",
      description:
        "Last hour to last 30 days, a custom range of two instants that refuses an end before its start, Live, and presets of your own.",
      covers: ["TimeRangePicker", "resolveTimeRange", "commonTimeRangePresets"],
    },
    {
      id: "table-states",
      title: "Table states",
      description:
        "A failed load with the request id and Try again, a note and a shown-count strip in the footer, compact rows, and the row whose sheet is open marked current while it steps.",
      covers: ["DataTable", "DataTableNote", "DataTableCount", "DetailSheet"],
    },
    {
      id: "phone-cards",
      title: "Cards on a phone, totals and row actions",
      description:
        "A table that is a card list on a phone, a totals row, one action beside each row and the rest in its menu, and cards at every width.",
      covers: ["DataTable", "RowActions"],
    },
    {
      id: "bulk-actions",
      title: "Bulk actions that fit and partly fail",
      description:
        "Actions that apply only to the rows they fit and say how many, and a per-row Mute whose refusals stay selected with the reason and a Retry.",
      covers: ["SelectionBar", "DataTable"],
    },
    {
      id: "table-cells",
      title: "Cells",
      description:
        "A value with a note under it, the first places then +N, and a sentence ending in 3 more, each opening the whole list.",
      covers: ["CellWithNote", "OverflowList"],
    },
    {
      id: "grouped-list",
      title: "Lists grouped by date",
      description: "Work due by day in a time zone with Show older, and the same by month.",
      covers: ["List", "useDateSections"],
    },
    {
      id: "inherited-scope",
      title: "Inherited scope",
      description:
        "A project's own routes with the organization's beside them, read-only, linked to where they are edited, an empty one, and a fallback note.",
      covers: ["InheritedScopeList"],
    },
  ],
};
