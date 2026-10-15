import type { Demo } from "../../registry.ts";
import PopoverDemo from "./popover-demo.tsx";
import popoverDemo from "./popover-demo.tsx?raw";
import PopoverBasic from "./popover-basic.tsx";
import popoverBasic from "./popover-basic.tsx?raw";
import PopoverAlignments from "./popover-alignments.tsx";
import popoverAlignments from "./popover-alignments.tsx?raw";
import PopoverForm from "./popover-form.tsx";
import popoverForm from "./popover-form.tsx?raw";
import PopoverRtl from "./popover-rtl.tsx";
import popoverRtl from "./popover-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: popoverDemo,
    component: PopoverDemo,
  },
  {
    title: "Basic",
    note: "A simple popover with a header, title, and description.",
    code: popoverBasic,
    component: PopoverBasic,
  },
  {
    title: "Align",
    note: "Use the `align` prop on `PopoverContent` to control the horizontal alignment.",
    code: popoverAlignments,
    component: PopoverAlignments,
  },
  {
    title: "With Form",
    note: "A popover with form fields inside.",
    code: popoverForm,
    component: PopoverForm,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own. The popover is portalled, so `PopoverContent` takes `dir` as well.",
    rtl: true,
    code: popoverRtl,
    component: PopoverRtl,
  },
];
