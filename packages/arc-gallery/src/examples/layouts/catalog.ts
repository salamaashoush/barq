import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "layouts",
  title: "Page layouts",
  description:
    "A record's page with its header, tabs, sections and rail, stepping through records from a sheet, an inbox beside the open conversation, a list read beside a viewer, and a conversation's page.",
  examples: [
    {
      id: "record-page",
      title: "Record page",
      description:
        "An invoice's header with its status, facts, alerts and the previous and next invoice, tabs kept in the address, sections with Edit, a rail of details, and a tab panel opened by its toolbar.",
      covers: [
        "PageHeader",
        "RecordPager",
        "ResponsiveTabs",
        "RecordLayout",
        "RecordSection",
        "PanelToolbar",
      ],
    },
    {
      id: "detail-sheet-steps",
      title: "Stepping through records in a sheet",
      description:
        "A row opens its invoice in a sheet that reads on to the previous and next row with the buttons or K and J, saying where it is in the list.",
      covers: ["DetailSheet", "RecordPager"],
    },
    {
      id: "list-detail",
      title: "Inbox beside the open conversation",
      description:
        "Threads beside the open one with a handle between, the open thread in the address; on a narrow screen one pane at a time with Back.",
      covers: ["ListDetailLayout"],
    },
    {
      id: "master-detail",
      title: "A list read beside a viewer",
      description:
        "Screenshots to review: the arrows open each one, the open one marked and kept in view, checkboxes for deciding several at once, and one that cannot be decided.",
      covers: ["MasterDetailList", "RecordPager"],
    },
    {
      id: "conversation-layout",
      title: "Conversation page",
      description:
        "A channel's name, topic and actions over its messages, the composer docked at the foot, and members and details in a panel beside it.",
      covers: ["ConversationLayout", "DockedPanelToggle"],
    },
  ],
};
