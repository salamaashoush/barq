import type { Demo } from "../../registry.ts";
import DrawerDemo from "./drawer-demo.tsx";
import drawerDemo from "./drawer-demo.tsx?raw";
import DrawerScrollableContent from "./drawer-scrollable-content.tsx";
import drawerScrollableContent from "./drawer-scrollable-content.tsx?raw";
import DrawerSides from "./drawer-sides.tsx";
import drawerSides from "./drawer-sides.tsx?raw";
import DrawerDialog from "./drawer-dialog.tsx";
import drawerDialog from "./drawer-dialog.tsx?raw";
import DrawerRtl from "./drawer-rtl.tsx";
import drawerRtl from "./drawer-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: drawerDemo,
    component: DrawerDemo,
  },
  {
    title: "Scrollable Content",
    note: "Keep actions visible while the content scrolls.",
    code: drawerScrollableContent,
    component: DrawerScrollableContent,
  },
  {
    title: "Sides",
    note: "Use the `direction` prop to set the side of the drawer. Available options are `top`, `right`, `bottom`, and `left`.",
    code: drawerSides,
    component: DrawerSides,
  },
  {
    title: "Responsive Dialog",
    note: "You can combine the `Dialog` and `Drawer` components to create a responsive dialog. This renders a `Dialog` on desktop and a `Drawer` on mobile, through `useIsMobile`.",
    code: drawerDialog,
    component: DrawerDialog,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own. The drawer is portalled, so `DrawerContent` takes `dir` as well.",
    rtl: true,
    code: drawerRtl,
    component: DrawerRtl,
  },
];
