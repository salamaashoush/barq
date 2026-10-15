import type { Demo } from "../../registry.ts";
import ScrollAreaDemo from "./scroll-area-demo.tsx";
import scrollAreaDemo from "./scroll-area-demo.tsx?raw";
import ScrollAreaHorizontalDemo from "./scroll-area-horizontal-demo.tsx";
import scrollAreaHorizontalDemo from "./scroll-area-horizontal-demo.tsx?raw";
import ScrollAreaRtl from "./scroll-area-rtl.tsx";
import scrollAreaRtl from "./scroll-area-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  { size: "auto", code: scrollAreaDemo, component: ScrollAreaDemo },
  {
    title: "Horizontal",
    note: 'Use `ScrollBar` with `orientation="horizontal"` for horizontal scrolling. An area with a `ScrollBar` inside draws that bar over the content, and an area without one keeps the native scroller.',
    size: "auto",
    code: scrollAreaHorizontalDemo,
    component: ScrollAreaHorizontalDemo,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    size: "auto",
    rtl: true,
    code: scrollAreaRtl,
    component: ScrollAreaRtl,
  },
];
