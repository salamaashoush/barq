import type { Demo } from "../../registry.ts";
import FieldDemo from "./field-demo.tsx";
import fieldDemo from "./field-demo.tsx?raw";
import LabelDemo from "./label-demo.tsx";
import labelDemo from "./label-demo.tsx?raw";
import LabelRtl from "./label-rtl.tsx";
import labelRtl from "./label-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  { code: labelDemo, component: LabelDemo },
  {
    title: "Label in Field",
    note: "For form fields, use the `Field` component, which includes built-in `FieldLabel`, `FieldDescription`, and `FieldError` components.",
    align: "start",
    size: "auto",
    code: fieldDemo,
    component: FieldDemo,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: labelRtl,
    component: LabelRtl,
  },
];
