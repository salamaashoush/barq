import type { Demo } from "../../registry.ts";
import HoverCardDemo from "./hover-card-demo.tsx";
import hoverCardDemo from "./hover-card-demo.tsx?raw";
import HoverCardSides from "./hover-card-sides.tsx";
import hoverCardSides from "./hover-card-sides.tsx?raw";
import HoverCardRtl from "./hover-card-rtl.tsx";
import hoverCardRtl from "./hover-card-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: hoverCardDemo,
    component: HoverCardDemo,
  },
  {
    title: "Sides",
    note: "Use the `side` prop to change the position of the hover card.",
    code: hoverCardSides,
    component: HoverCardSides,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own. The card is portalled, so `HoverCardContent` takes `dir` as well.",
    rtl: true,
    code: hoverCardRtl,
    component: HoverCardRtl,
  },
];
