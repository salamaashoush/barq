import type { Demo } from "../../registry.ts";
import SidebarDemo from "./sidebar-demo.tsx";
import sidebarDemo from "./sidebar-demo.tsx?raw";
import SidebarHeader from "./sidebar-header.tsx";
import sidebarHeader from "./sidebar-header.tsx?raw";
import SidebarFooter from "./sidebar-footer.tsx";
import sidebarFooter from "./sidebar-footer.tsx?raw";
import SidebarGroup from "./sidebar-group.tsx";
import sidebarGroup from "./sidebar-group.tsx?raw";
import SidebarGroupCollapsible from "./sidebar-group-collapsible.tsx";
import sidebarGroupCollapsible from "./sidebar-group-collapsible.tsx?raw";
import SidebarGroupAction from "./sidebar-group-action.tsx";
import sidebarGroupAction from "./sidebar-group-action.tsx?raw";
import SidebarMenu from "./sidebar-menu.tsx";
import sidebarMenu from "./sidebar-menu.tsx?raw";
import SidebarMenuAction from "./sidebar-menu-action.tsx";
import sidebarMenuAction from "./sidebar-menu-action.tsx?raw";
import SidebarMenuSub from "./sidebar-menu-sub.tsx";
import sidebarMenuSub from "./sidebar-menu-sub.tsx?raw";
import SidebarMenuCollapsible from "./sidebar-menu-collapsible.tsx";
import sidebarMenuCollapsible from "./sidebar-menu-collapsible.tsx?raw";
import SidebarMenuBadge from "./sidebar-menu-badge.tsx";
import sidebarMenuBadge from "./sidebar-menu-badge.tsx?raw";
import SidebarControlled from "./sidebar-controlled.tsx";
import sidebarControlled from "./sidebar-controlled.tsx?raw";
import SidebarRtl from "./sidebar-rtl.tsx";
import sidebarRtl from "./sidebar-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    align: "start",
    size: "auto",
    code: sidebarDemo,
    component: SidebarDemo,
  },
  {
    title: "Header",
    note: "Use `SidebarHeader` to add a sticky header to the sidebar. Here it holds a workspace menu.",
    align: "start",
    size: "auto",
    code: sidebarHeader,
    component: SidebarHeader,
  },
  {
    title: "Footer",
    note: "Use `SidebarFooter` to add a sticky footer to the sidebar.",
    align: "start",
    size: "auto",
    code: sidebarFooter,
    component: SidebarFooter,
  },
  {
    title: "Group",
    note: "Use `SidebarGroup` to create a section within the sidebar, with a `SidebarGroupLabel` and a `SidebarGroupContent`.",
    align: "start",
    size: "auto",
    code: sidebarGroup,
    component: SidebarGroup,
  },
  {
    title: "Collapsible Group",
    note: "Wrap a `SidebarGroup` in a `Collapsible`. The trigger wears the group label's slot and classes through `sidebarGroupLabelVariants()`.",
    align: "start",
    size: "auto",
    code: sidebarGroupCollapsible,
    component: SidebarGroupCollapsible,
  },
  {
    title: "Group Action",
    note: "Use `SidebarGroupAction` to add an action button to the group.",
    align: "start",
    size: "auto",
    code: sidebarGroupAction,
    component: SidebarGroupAction,
  },
  {
    title: "Menu",
    note: "`SidebarMenu`, `SidebarMenuItem` and `SidebarMenuButton`. A button given `href` renders the link itself.",
    align: "start",
    size: "auto",
    code: sidebarMenu,
    component: SidebarMenu,
  },
  {
    title: "Menu Action",
    note: "`SidebarMenuAction` is the trigger of a `DropdownMenu` beside the button.",
    align: "start",
    size: "auto",
    code: sidebarMenuAction,
    component: SidebarMenuAction,
  },
  {
    title: "Menu Sub",
    note: "`SidebarMenuSub` nests items under a `SidebarMenuItem`.",
    align: "start",
    size: "auto",
    code: sidebarMenuSub,
    component: SidebarMenuSub,
  },
  {
    title: "Collapsible Menu",
    note: "A `Collapsible` given `render` becomes the `SidebarMenuItem`, which is upstream's `asChild`.",
    align: "start",
    size: "auto",
    code: sidebarMenuCollapsible,
    component: SidebarMenuCollapsible,
  },
  {
    title: "Menu Badge",
    note: "Use `SidebarMenuBadge` to show a count beside a menu item.",
    align: "start",
    size: "auto",
    code: sidebarMenuBadge,
    component: SidebarMenuBadge,
  },
  {
    title: "Controlled Sidebar",
    note: "Use the `open` and `onOpenChange` props on `SidebarProvider` to control the sidebar.",
    align: "start",
    size: "auto",
    code: sidebarControlled,
    component: SidebarControlled,
  },
  {
    title: "RTL",
    note: 'Wrap the tree in `DirectionProvider`, put `dir` on an element you own and use `side="right"`.',
    align: "start",
    size: "auto",
    rtl: true,
    code: sidebarRtl,
    component: SidebarRtl,
  },
];
