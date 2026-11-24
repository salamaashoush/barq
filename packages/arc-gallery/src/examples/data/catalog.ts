import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "data",
  title: "Data display",
  description:
    "Tables, grids, trees, boards, lists, timelines and the numbers a dashboard leads with.",
  examples: [
    {
      id: "data-table",
      title: "Data table with a toolbar",
      description:
        "Search, a status filter, column visibility, sorting, pages, resizable columns, columns that leave narrow screens, and a selection bar whose Archive asks first.",
      covers: ["DataTable", "DataToolbar", "SelectionBar"],
    },
    {
      id: "data-table-states",
      title: "Loading and empty tables",
      description:
        "Skeleton rows while the first page loads, and an EmptyState once there is nothing.",
      covers: ["DataTable", "EmptyState"],
    },
    {
      id: "data-grid",
      title: "Editable grid",
      description:
        "Text, select, number, date and checkbox cells, a column group, totals, grouping by team, changed cells marked and a row added at the end.",
      covers: ["DataGrid"],
    },
    {
      id: "tree-view",
      title: "Tree view",
      description:
        "Expand, select one or several, drag to reorder or into a folder, and a folder that loads its files.",
      covers: ["TreeView"],
    },
    {
      id: "kanban-board",
      title: "Kanban board",
      description:
        "Cards moved by pointer or keyboard, a column past its limit, a folded column and Add card.",
      covers: ["KanbanBoard", "applyKanbanMove", "ListItem"],
    },
    {
      id: "list",
      title: "List",
      description:
        "Rows opened with Enter, rows selected with a checkbox, one disabled, and an empty list.",
      covers: ["List", "ListItem"],
    },
    {
      id: "timeline",
      title: "Timeline",
      description: "What happened, with actors, tones and icons, in relative or absolute time.",
      covers: ["Timeline"],
    },
    {
      id: "description-list",
      title: "Description list",
      description: "A record's facts with actions beside values, in each layout and two columns.",
      covers: ["DescriptionList"],
    },
    {
      id: "stats",
      title: "Stats",
      description:
        "Numbers with how they moved and their trend, joined in a strip or as separate cards.",
      covers: ["StatGroup", "StatCard"],
    },
    {
      id: "tile",
      title: "Tiles",
      description:
        "A tile that is a link or a button, with media on top or at the start, disabled, and chosen among others.",
      covers: ["Tile"],
    },
    {
      id: "people",
      title: "People and presence",
      description:
        "Overlapped avatars counted past a maximum, initials when a photo fails, and presence in a dot and in words.",
      covers: ["AvatarStack", "PersonAvatar", "PresenceDot", "PresenceStatus"],
    },
    {
      id: "reactions",
      title: "Reactions",
      description: "Reactions toggled and added, and a read-only bar.",
      covers: ["ReactionBar"],
    },
  ],
};
