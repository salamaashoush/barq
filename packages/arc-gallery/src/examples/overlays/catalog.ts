import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "overlays",
  title: "Overlays",
  description: "Dialogs, sheets, tearsheets, confirmations, banners, coachmarks and tours.",
  examples: [
    {
      id: "dialogs",
      title: "Dialogs and confirmations",
      description:
        "A dialog with a form, an alert dialog, and confirm() awaited from a handler, plain or in the danger tone.",
      covers: ["Dialog", "AlertDialog", "confirm"],
    },
    {
      id: "sheets",
      title: "Sheets, drawers and detail sheets",
      description:
        "Panels from an edge, a drawer from the bottom, and a record's detail beside its list.",
      covers: ["Sheet", "Drawer", "DetailSheet"],
    },
    {
      id: "responsive",
      title: "Responsive overlays and tearsheets",
      description:
        "One overlay that is a dialog or popover on a wide screen and a sheet on a phone, and a tearsheet for a large task.",
      covers: ["ResponsiveOverlay", "Tearsheet"],
    },
    {
      id: "popovers",
      title: "Popovers, hover cards and tooltips",
      description: "Content beside its trigger: on press, on hover and on focus.",
      covers: ["Popover", "HoverCard", "Tooltip"],
    },
    {
      id: "alerts",
      title: "Banners and inline alerts",
      description: "A page-wide banner and an alert in each tone, every one dismissible.",
      covers: ["Banner", "InlineAlert"],
    },
    {
      id: "toasts",
      title: "Toasts",
      description:
        "Short-lived messages in every tone, with an action, and following a promise. ArcProvider renders the stack.",
      covers: ["toast"],
    },
    {
      id: "tour",
      title: "Tours, coachmarks and spotlights",
      description:
        "A guided sequence over the page whose progress survives a reload, a single coachmark, and a spotlight.",
      covers: ["Tour", "useTourProgress", "Coachmark", "Spotlight"],
    },
  ],
};
