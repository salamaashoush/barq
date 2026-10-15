import type { Demo } from "../../registry.ts";
import SeparatorDemo from "./separator-demo.tsx";
import separatorDemo from "./separator-demo.tsx?raw";
import SeparatorList from "./separator-list.tsx";
import separatorList from "./separator-list.tsx?raw";
import SeparatorMenu from "./separator-menu.tsx";
import separatorMenu from "./separator-menu.tsx?raw";
import SeparatorRtl from "./separator-rtl.tsx";
import separatorRtl from "./separator-rtl.tsx?raw";
import SeparatorVertical from "./separator-vertical.tsx";
import separatorVertical from "./separator-vertical.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: separatorDemo,
    component: SeparatorDemo,
  },
  {
    title: "Vertical",
    note: 'Use `orientation="vertical"` for a vertical separator.',
    code: separatorVertical,
    component: SeparatorVertical,
  },
  {
    title: "Menu",
    note: "Vertical separators between menu items with descriptions.",
    code: separatorMenu,
    component: SeparatorMenu,
  },
  {
    title: "List",
    note: "Horizontal separators between list items.",
    code: separatorList,
    component: SeparatorList,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: separatorRtl,
    component: SeparatorRtl,
  },
];
