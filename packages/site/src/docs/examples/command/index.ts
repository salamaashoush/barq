import type { Demo } from "../../registry.ts";
import CommandDemo from "./command-demo.tsx";
import commandDemo from "./command-demo.tsx?raw";
import CommandBasic from "./command-basic.tsx";
import commandBasic from "./command-basic.tsx?raw";
import CommandShortcuts from "./command-shortcuts.tsx";
import commandShortcuts from "./command-shortcuts.tsx?raw";
import CommandGroups from "./command-groups.tsx";
import commandGroups from "./command-groups.tsx?raw";
import CommandScrollable from "./command-scrollable.tsx";
import commandScrollable from "./command-scrollable.tsx?raw";
import CommandDialog from "./command-dialog.tsx";
import commandDialog from "./command-dialog.tsx?raw";
import CommandRtl from "./command-rtl.tsx";
import commandRtl from "./command-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: commandDemo,
    component: CommandDemo,
  },
  {
    title: "Basic",
    note: "A simple command menu in a dialog. `CommandDialog` is the palette in a dialog, so the parts go straight inside it.",
    code: commandBasic,
    component: CommandBasic,
  },
  {
    title: "Shortcuts",
    note: "Add `CommandShortcut` to show keyboard hints.",
    code: commandShortcuts,
    component: CommandShortcuts,
  },
  {
    title: "Groups",
    note: "A command menu with groups, icons and separators.",
    code: commandGroups,
    component: CommandGroups,
  },
  {
    title: "Scrollable",
    note: "Scrollable command menu with multiple items.",
    code: commandScrollable,
    component: CommandScrollable,
  },
  {
    title: "Dialog",
    note: "Press ⌘J or Ctrl+J to open the palette from anywhere on the page.",
    code: commandDialog,
    component: CommandDialog,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: commandRtl,
    component: CommandRtl,
  },
];
