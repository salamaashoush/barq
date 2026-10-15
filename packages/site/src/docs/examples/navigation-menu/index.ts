import type { Demo } from "../../registry.ts";
import NavigationMenuDemo from "./navigation-menu-demo.tsx";
import navigationMenuDemo from "./navigation-menu-demo.tsx?raw";
import NavigationMenuRtl from "./navigation-menu-rtl.tsx";
import navigationMenuRtl from "./navigation-menu-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    align: "start",
    size: "auto",
    code: navigationMenuDemo,
    component: NavigationMenuDemo,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own. Each panel is portalled into the viewport, so `NavigationMenuContent` takes `dir` as well.",
    align: "start",
    size: "auto",
    rtl: true,
    code: navigationMenuRtl,
    component: NavigationMenuRtl,
  },
];
