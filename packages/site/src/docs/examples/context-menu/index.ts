import type { Demo } from "../../registry.ts";
import ContextMenuDemo from "./context-menu-demo.tsx";
import contextMenuDemo from "./context-menu-demo.tsx?raw";
import ContextMenuBasic from "./context-menu-basic.tsx";
import contextMenuBasic from "./context-menu-basic.tsx?raw";
import ContextMenuSubmenu from "./context-menu-submenu.tsx";
import contextMenuSubmenu from "./context-menu-submenu.tsx?raw";
import ContextMenuShortcuts from "./context-menu-shortcuts.tsx";
import contextMenuShortcuts from "./context-menu-shortcuts.tsx?raw";
import ContextMenuGroups from "./context-menu-groups.tsx";
import contextMenuGroups from "./context-menu-groups.tsx?raw";
import ContextMenuIcons from "./context-menu-icons.tsx";
import contextMenuIcons from "./context-menu-icons.tsx?raw";
import ContextMenuCheckboxes from "./context-menu-checkboxes.tsx";
import contextMenuCheckboxes from "./context-menu-checkboxes.tsx?raw";
import ContextMenuRadio from "./context-menu-radio.tsx";
import contextMenuRadio from "./context-menu-radio.tsx?raw";
import ContextMenuDestructive from "./context-menu-destructive.tsx";
import contextMenuDestructive from "./context-menu-destructive.tsx?raw";
import ContextMenuSides from "./context-menu-sides.tsx";
import contextMenuSides from "./context-menu-sides.tsx?raw";
import ContextMenuRtl from "./context-menu-rtl.tsx";
import contextMenuRtl from "./context-menu-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: contextMenuDemo,
    component: ContextMenuDemo,
  },
  {
    title: "Basic",
    note: "A simple context menu with a few actions.",
    code: contextMenuBasic,
    component: ContextMenuBasic,
  },
  {
    title: "Submenu",
    note: "Use `ContextMenuSub` to nest secondary actions.",
    code: contextMenuSubmenu,
    component: ContextMenuSubmenu,
  },
  {
    title: "Shortcuts",
    note: "Add `ContextMenuShortcut` to show keyboard hints.",
    code: contextMenuShortcuts,
    component: ContextMenuShortcuts,
  },
  {
    title: "Groups",
    note: "Group related actions and separate them with dividers.",
    code: contextMenuGroups,
    component: ContextMenuGroups,
  },
  {
    title: "Icons",
    note: "Combine icons with labels for quick scanning.",
    code: contextMenuIcons,
    component: ContextMenuIcons,
  },
  {
    title: "Checkboxes",
    note: "Use `ContextMenuCheckboxItem` for toggles.",
    code: contextMenuCheckboxes,
    component: ContextMenuCheckboxes,
  },
  {
    title: "Radio",
    note: "Use `ContextMenuRadioItem` for exclusive choices.",
    code: contextMenuRadio,
    component: ContextMenuRadio,
  },
  {
    title: "Destructive",
    note: 'Use `variant="destructive"` to style the menu item as destructive.',
    code: contextMenuDestructive,
    component: ContextMenuDestructive,
  },
  {
    title: "Sides",
    note: "Use the `side` prop on `ContextMenuContent` to choose where the menu opens.",
    code: contextMenuSides,
    component: ContextMenuSides,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own. The menu is portalled out of that element, so each content part takes `dir` as well.",
    rtl: true,
    code: contextMenuRtl,
    component: ContextMenuRtl,
  },
];
