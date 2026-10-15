import CollapsibleFileTree from "./collapsible-file-tree.tsx";
import collapsibleFileTree from "./collapsible-file-tree.tsx?raw";
import CollapsibleSettings from "./collapsible-settings.tsx";
import collapsibleSettings from "./collapsible-settings.tsx?raw";
import CollapsibleRtl from "./collapsible-rtl.tsx";
import collapsibleRtl from "./collapsible-rtl.tsx?raw";
import type { Demo } from "../../registry.ts";
import CollapsibleBasic from "./collapsible-basic.tsx";
import collapsibleBasic from "./collapsible-basic.tsx?raw";
import CollapsibleDemo from "./collapsible-demo.tsx";
import collapsibleDemo from "./collapsible-demo.tsx?raw";

export const demos: readonly Demo[] = [
  {
    align: "start",
    size: "auto",
    code: collapsibleDemo,
    component: CollapsibleDemo,
  },
  {
    title: "Basic",
    note: "`CollapsibleTrigger asChild` hands the trigger to the button written inside it. The root carries `data-state`, so its fill can follow the panel.",
    align: "start",
    size: "auto",
    code: collapsibleBasic,
    component: CollapsibleBasic,
  },
  {
    title: "File Tree",
    note: "Use nested collapsibles to build a file tree.",
    align: "start",
    size: "auto",
    code: collapsibleFileTree,
    component: CollapsibleFileTree,
  },
  {
    title: "Settings",
    note: "Use a trigger button to reveal additional settings.",
    align: "start",
    size: "auto",
    code: collapsibleSettings,
    component: CollapsibleSettings,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    align: "start",
    size: "auto",
    rtl: true,
    code: collapsibleRtl,
    component: CollapsibleRtl,
  },
];
