import PaginationRtl from "./pagination-rtl.tsx";
import paginationRtl from "./pagination-rtl.tsx?raw";
import type { Demo } from "../../registry.ts";
import PaginationDemo from "./pagination-demo.tsx";
import paginationDemo from "./pagination-demo.tsx?raw";
import PaginationIconsOnly from "./pagination-icons-only.tsx";
import paginationIconsOnly from "./pagination-icons-only.tsx?raw";
import PaginationSimple from "./pagination-simple.tsx";
import paginationSimple from "./pagination-simple.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: paginationDemo,
    component: PaginationDemo,
  },
  {
    title: "Simple",
    note: "A simple pagination with only page numbers.",
    code: paginationSimple,
    component: PaginationSimple,
  },
  {
    title: "Icons Only",
    note: "Use just the previous and next buttons without page numbers. This is useful for data tables with a rows per page selector.",
    code: paginationIconsOnly,
    component: PaginationIconsOnly,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own. The previous and next arrows point along the reading direction.",
    rtl: true,
    code: paginationRtl,
    component: PaginationRtl,
  },
];
