import type { Demo } from "../../registry.ts";
import DropdownMenuAvatar from "./dropdown-menu-avatar.tsx";
import dropdownMenuAvatar from "./dropdown-menu-avatar.tsx?raw";
import DropdownMenuBasic from "./dropdown-menu-basic.tsx";
import dropdownMenuBasic from "./dropdown-menu-basic.tsx?raw";
import DropdownMenuCheckboxesIcons from "./dropdown-menu-checkboxes-icons.tsx";
import dropdownMenuCheckboxesIcons from "./dropdown-menu-checkboxes-icons.tsx?raw";
import DropdownMenuCheckboxes from "./dropdown-menu-checkboxes.tsx";
import dropdownMenuCheckboxes from "./dropdown-menu-checkboxes.tsx?raw";
import DropdownMenuComplex from "./dropdown-menu-complex.tsx";
import dropdownMenuComplex from "./dropdown-menu-complex.tsx?raw";
import DropdownMenuDemo from "./dropdown-menu-demo.tsx";
import dropdownMenuDemo from "./dropdown-menu-demo.tsx?raw";
import DropdownMenuDestructive from "./dropdown-menu-destructive.tsx";
import dropdownMenuDestructive from "./dropdown-menu-destructive.tsx?raw";
import DropdownMenuIcons from "./dropdown-menu-icons.tsx";
import dropdownMenuIcons from "./dropdown-menu-icons.tsx?raw";
import DropdownMenuItems from "./dropdown-menu-items.tsx";
import dropdownMenuItems from "./dropdown-menu-items.tsx?raw";
import DropdownMenuRadioGroup from "./dropdown-menu-radio-group.tsx";
import dropdownMenuRadioGroup from "./dropdown-menu-radio-group.tsx?raw";
import DropdownMenuRadioIcons from "./dropdown-menu-radio-icons.tsx";
import dropdownMenuRadioIcons from "./dropdown-menu-radio-icons.tsx?raw";
import DropdownMenuRtl from "./dropdown-menu-rtl.tsx";
import dropdownMenuRtl from "./dropdown-menu-rtl.tsx?raw";
import DropdownMenuShortcuts from "./dropdown-menu-shortcuts.tsx";
import dropdownMenuShortcuts from "./dropdown-menu-shortcuts.tsx?raw";
import DropdownMenuSubmenu from "./dropdown-menu-submenu.tsx";
import dropdownMenuSubmenu from "./dropdown-menu-submenu.tsx?raw";

export const demos: readonly Demo[] = [
  { code: dropdownMenuDemo, component: DropdownMenuDemo },
  {
    title: "Basic",
    note: "A basic dropdown menu with labels and separators.",
    code: dropdownMenuBasic,
    component: DropdownMenuBasic,
  },
  {
    title: "Submenu",
    note: "Use `DropdownMenuSub` to nest secondary actions.",
    code: dropdownMenuSubmenu,
    component: DropdownMenuSubmenu,
  },
  {
    title: "Shortcuts",
    note: "Add `DropdownMenuShortcut` to show keyboard hints.",
    code: dropdownMenuShortcuts,
    component: DropdownMenuShortcuts,
  },
  {
    title: "Icons",
    note: "Combine icons with labels for quick scanning.",
    code: dropdownMenuIcons,
    component: DropdownMenuIcons,
  },
  {
    title: "Checkboxes",
    note: "Use `DropdownMenuCheckboxItem` for toggles.",
    code: dropdownMenuCheckboxes,
    component: DropdownMenuCheckboxes,
  },
  {
    title: "Checkboxes Icons",
    note: "Add icons to checkbox items.",
    code: dropdownMenuCheckboxesIcons,
    component: DropdownMenuCheckboxesIcons,
  },
  {
    title: "Radio Group",
    note: "Use `DropdownMenuRadioGroup` for exclusive choices.",
    code: dropdownMenuRadioGroup,
    component: DropdownMenuRadioGroup,
  },
  {
    title: "Radio Icons",
    note: "Show radio options with icons.",
    code: dropdownMenuRadioIcons,
    component: DropdownMenuRadioIcons,
  },
  {
    title: "Destructive",
    note: 'Use `variant="destructive"` for irreversible actions.',
    code: dropdownMenuDestructive,
    component: DropdownMenuDestructive,
  },
  {
    title: "Avatar",
    note: "An account switcher dropdown triggered by an avatar.",
    code: dropdownMenuAvatar,
    component: DropdownMenuAvatar,
  },
  {
    title: "Complex",
    note: "A richer example combining groups, icons, and submenus.",
    code: dropdownMenuComplex,
    component: DropdownMenuComplex,
  },
  {
    title: "From data",
    note: "Pass `items` and a render function to `DropdownMenuContent` to build the menu from an array instead of written children.",
    code: dropdownMenuItems,
    component: DropdownMenuItems,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own. The menu is portalled out of that element, so each content part takes `dir` as well.",
    rtl: true,
    code: dropdownMenuRtl,
    component: DropdownMenuRtl,
  },
];
