import type { Demo } from "../../registry.ts";
import SheetDemo from "./sheet-demo.tsx";
import sheetDemo from "./sheet-demo.tsx?raw";
import SheetSide from "./sheet-side.tsx";
import sheetSide from "./sheet-side.tsx?raw";
import SheetNoCloseButton from "./sheet-no-close-button.tsx";
import sheetNoCloseButton from "./sheet-no-close-button.tsx?raw";
import SheetRtl from "./sheet-rtl.tsx";
import sheetRtl from "./sheet-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: sheetDemo,
    component: SheetDemo,
  },
  {
    title: "Side",
    note: "Use the `side` prop on `SheetContent` to set the edge of the screen where the sheet appears. The values are `top`, `right`, `bottom`, or `left`.",
    code: sheetSide,
    component: SheetSide,
  },
  {
    title: "No Close Button",
    note: "Use `showCloseButton={false}` on `SheetContent` to hide the close button.",
    code: sheetNoCloseButton,
    component: SheetNoCloseButton,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own. The sheet is portalled, so `SheetContent` takes `dir` as well, and it opens from the left.",
    rtl: true,
    code: sheetRtl,
    component: SheetRtl,
  },
];
