import type { Demo } from "../../registry.ts";
import TableActions from "./table-actions.tsx";
import tableActions from "./table-actions.tsx?raw";
import TableDemo from "./table-demo.tsx";
import tableDemo from "./table-demo.tsx?raw";
import TableFooterExample from "./table-footer.tsx";
import tableFooter from "./table-footer.tsx?raw";
import TableRtl from "./table-rtl.tsx";
import tableRtl from "./table-rtl.tsx?raw";
import TableSelected from "./table-selected.tsx";
import tableSelected from "./table-selected.tsx?raw";

export const demos: readonly Demo[] = [
  { align: "start", size: "auto", code: tableDemo, component: TableDemo },
  {
    title: "Footer",
    note: "Use the `TableFooter` component to add a footer to the table.",
    align: "start",
    size: "auto",
    code: tableFooter,
    component: TableFooterExample,
  },
  {
    title: "Actions",
    note: "A table showing actions for each row using a `DropdownMenu` component.",
    align: "start",
    size: "auto",
    code: tableActions,
    component: TableActions,
  },
  {
    title: "Selected row",
    note: "Use the `isSelected` prop on `TableRow` to mark a row as chosen. It tints the row and sets `aria-selected`.",
    align: "start",
    size: "auto",
    code: tableSelected,
    component: TableSelected,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    align: "start",
    size: "auto",
    rtl: true,
    code: tableRtl,
    component: TableRtl,
  },
];
