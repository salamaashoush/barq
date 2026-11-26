import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "records",
  title: "Lists, records and activity",
  description:
    "What happened to a record and who changed it, its properties edited in place, lists put in order, and a search across kinds.",
  examples: [
    {
      id: "activity",
      title: "Activity timeline",
      description:
        "An incident's events under a heading per day, each kind described once, filtered by kind, key events starred and comments drawn as cards.",
      covers: ["Timeline", "TimelineKind"],
    },
    {
      id: "change-log",
      title: "Change log",
      description:
        "Who changed what and when, each field struck through to its new value, filtered by person and by a range of days.",
      covers: ["ChangeLog", "FieldChanges", "matchesChangeLogFilter"],
    },
    {
      id: "property-list",
      title: "Property list",
      description:
        "A task's status, priority, assignees, due date and summary, each edited where it is read and saved on its own.",
      covers: ["PropertyList"],
    },
    {
      id: "sortable-list",
      title: "Sortable list",
      description:
        "Rows that drag by their handle, move from the keyboard, or move one place with buttons quiet at the ends.",
      covers: ["List", "reorderItems"],
    },
    {
      id: "checklist-editor",
      title: "Checklist editor",
      description:
        "Subtasks ticked, renamed, removed, added and reordered, counted as they are done.",
      covers: ["ChecklistEditor"],
    },
    {
      id: "member-order",
      title: "Turn order",
      description:
        "An on-call rotation's people in order, moved, removed and added from a search that leaves out those listed.",
      covers: ["OrderedMemberList"],
    },
    {
      id: "step-sequence",
      title: "Step sequence",
      description:
        "A multi-step check's requests as cards that fold, each moved, duplicated or removed, named in place.",
      covers: ["StepSequenceEditor"],
    },
    {
      id: "search-results",
      title: "Search results",
      description:
        "A search across students, classes and messages: All at a glance, one kind in full, and its waiting, failed and empty states.",
      covers: ["SearchResults"],
    },
    {
      id: "outline",
      title: "Outline view",
      description:
        "A program's blocks as nested pills, a course plan as lines with guides, and moves in a row.",
      covers: ["OutlineView"],
    },
  ],
};
