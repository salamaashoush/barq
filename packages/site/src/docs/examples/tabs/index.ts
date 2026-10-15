import type { Demo } from "../../registry.ts";
import TabsDemo from "./tabs-demo.tsx";
import tabsDemo from "./tabs-demo.tsx?raw";
import TabsDisabled from "./tabs-disabled.tsx";
import tabsDisabled from "./tabs-disabled.tsx?raw";
import TabsIcons from "./tabs-icons.tsx";
import tabsIcons from "./tabs-icons.tsx?raw";
import TabsItems from "./tabs-items.tsx";
import tabsItems from "./tabs-items.tsx?raw";
import TabsLine from "./tabs-line.tsx";
import tabsLine from "./tabs-line.tsx?raw";
import TabsRtl from "./tabs-rtl.tsx";
import tabsRtl from "./tabs-rtl.tsx?raw";
import TabsVertical from "./tabs-vertical.tsx";
import tabsVertical from "./tabs-vertical.tsx?raw";

export const demos: readonly Demo[] = [
  { size: "auto", code: tabsDemo, component: TabsDemo },
  {
    title: "Line",
    note: 'Use the `variant="line"` prop on `TabsList` for a line style.',
    code: tabsLine,
    component: TabsLine,
  },
  {
    title: "Vertical",
    note: 'Use `orientation="vertical"` for vertical tabs.',
    code: tabsVertical,
    component: TabsVertical,
  },
  {
    title: "Disabled",
    note: "Use the `disabled` prop on `TabsTrigger` to take a tab out of reach.",
    code: tabsDisabled,
    component: TabsDisabled,
  },
  { title: "Icons", code: tabsIcons, component: TabsIcons },
  {
    title: "From data",
    note: "Pass `items` to `Tabs` and give `TabsList` and `TabsContent` a function of the item. Only the selected panel is in the document.",
    align: "start",
    code: tabsItems,
    component: TabsItems,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    size: "auto",
    rtl: true,
    code: tabsRtl,
    component: TabsRtl,
  },
];
