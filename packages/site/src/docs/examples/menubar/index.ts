import type { Demo } from "../../registry.ts";
import MenubarDemo from "./menubar-demo.tsx";
import menubarDemo from "./menubar-demo.tsx?raw";
import MenubarCheckbox from "./menubar-checkbox.tsx";
import menubarCheckbox from "./menubar-checkbox.tsx?raw";
import MenubarRadio from "./menubar-radio.tsx";
import menubarRadio from "./menubar-radio.tsx?raw";
import MenubarSubmenu from "./menubar-submenu.tsx";
import menubarSubmenu from "./menubar-submenu.tsx?raw";
import MenubarIcons from "./menubar-icons.tsx";
import menubarIcons from "./menubar-icons.tsx?raw";
import MenubarRtl from "./menubar-rtl.tsx";
import menubarRtl from "./menubar-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: menubarDemo,
    component: MenubarDemo,
  },
  {
    title: "Checkbox",
    note: "Use `MenubarCheckboxItem` for toggleable options.",
    code: menubarCheckbox,
    component: MenubarCheckbox,
  },
  {
    title: "Radio",
    note: "Use `MenubarRadioGroup` and `MenubarRadioItem` for single-select options.",
    code: menubarRadio,
    component: MenubarRadio,
  },
  {
    title: "Submenu",
    note: "Use `MenubarSub`, `MenubarSubTrigger`, and `MenubarSubContent` for nested menus.",
    code: menubarSubmenu,
    component: MenubarSubmenu,
  },
  {
    title: "With Icons",
    code: menubarIcons,
    component: MenubarIcons,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own. Each menu is portalled, so every content part takes `dir` as well.",
    rtl: true,
    code: menubarRtl,
    component: MenubarRtl,
  },
];
