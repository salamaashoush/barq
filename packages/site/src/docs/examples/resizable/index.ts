import type { Demo } from "../../registry.ts";
import ResizableDemo from "./resizable-demo.tsx";
import resizableDemo from "./resizable-demo.tsx?raw";
import ResizableVertical from "./resizable-vertical.tsx";
import resizableVertical from "./resizable-vertical.tsx?raw";
import ResizableHandle from "./resizable-handle.tsx";
import resizableHandle from "./resizable-handle.tsx?raw";
import ResizableRtl from "./resizable-rtl.tsx";
import resizableRtl from "./resizable-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: resizableDemo,
    component: ResizableDemo,
  },
  {
    title: "Vertical",
    note: 'Use `orientation="vertical"` for vertical resizing.',
    code: resizableVertical,
    component: ResizableVertical,
  },
  {
    title: "Handle",
    note: "Use the `withHandle` prop on `ResizableHandle` to show a visible handle.",
    code: resizableHandle,
    component: ResizableHandle,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own. The arrow keys follow the reading direction.",
    rtl: true,
    code: resizableRtl,
    component: ResizableRtl,
  },
];
