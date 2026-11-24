import type { GroupCatalog } from "../../gallery/types.ts";

export const catalog: GroupCatalog = {
  slug: "actions",
  title: "Actions",
  description: "Buttons, split buttons, toolbars and the bars that carry actions over a selection.",
  examples: [
    {
      id: "buttons",
      title: "Buttons",
      description:
        "Every variant and size, with icons, as a link, disabled, and pending while work runs.",
      covers: ["Button", "Spinner"],
    },
    {
      id: "icon-buttons",
      title: "Icon buttons",
      description:
        "An icon with its name in a tooltip and to a screen reader, a shortcut, a pressed state and sizes.",
      covers: ["IconButton"],
    },
    {
      id: "split-button",
      title: "Split buttons and button groups",
      description:
        "A main action beside a menu of related ones, and buttons welded into one control.",
      covers: ["SplitButton", "ButtonGroup", "ButtonGroupText", "ButtonGroupSeparator"],
    },
    {
      id: "toolbar",
      title: "Toolbars",
      description: "One Tab stop with the arrows inside: plain, floating, docked and vertical.",
      covers: ["Toolbar", "ToolbarSeparator"],
    },
    {
      id: "action-bar",
      title: "Action bars",
      description:
        "A record's actions, keeping the important ones in view and moving the rest into More as the row narrows.",
      covers: ["ActionBar"],
    },
    {
      id: "selection-bar",
      title: "Selection bar",
      description:
        "How many rows are chosen and what can be done to them, with a confirmation for the dangerous one.",
      covers: ["SelectionBar", "confirm", "toast"],
    },
    {
      id: "copy-button",
      title: "Copy button",
      description: "A value to the clipboard, confirmed by an icon and to a screen reader.",
      covers: ["CopyButton"],
    },
    {
      id: "toggles",
      title: "Toggles and toggle groups",
      description: "A button held on or off, and groups of them for one choice or several.",
      covers: ["Toggle", "ToggleGroup", "ToggleGroupItem"],
    },
    {
      id: "menus",
      title: "Dropdown and context menus",
      description:
        "Menus of actions, checkboxes, radio choices and submenus, from a button or a right-click.",
      covers: ["DropdownMenu", "ContextMenu"],
    },
  ],
};
