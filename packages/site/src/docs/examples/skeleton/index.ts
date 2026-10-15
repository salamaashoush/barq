import type { Demo } from "../../registry.ts";
import SkeletonAvatar from "./skeleton-avatar.tsx";
import skeletonAvatar from "./skeleton-avatar.tsx?raw";
import SkeletonCard from "./skeleton-card.tsx";
import skeletonCard from "./skeleton-card.tsx?raw";
import SkeletonDemo from "./skeleton-demo.tsx";
import skeletonDemo from "./skeleton-demo.tsx?raw";
import SkeletonForm from "./skeleton-form.tsx";
import skeletonForm from "./skeleton-form.tsx?raw";
import SkeletonRtl from "./skeleton-rtl.tsx";
import skeletonRtl from "./skeleton-rtl.tsx?raw";
import SkeletonTable from "./skeleton-table.tsx";
import skeletonTable from "./skeleton-table.tsx?raw";
import SkeletonText from "./skeleton-text.tsx";
import skeletonText from "./skeleton-text.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: skeletonDemo,
    component: SkeletonDemo,
  },
  {
    title: "Avatar",
    code: skeletonAvatar,
    component: SkeletonAvatar,
  },
  {
    title: "Card",
    size: "auto",
    code: skeletonCard,
    component: SkeletonCard,
  },
  {
    title: "Text",
    code: skeletonText,
    component: SkeletonText,
  },
  {
    title: "Form",
    size: "auto",
    code: skeletonForm,
    component: SkeletonForm,
  },
  {
    title: "Table",
    code: skeletonTable,
    component: SkeletonTable,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: skeletonRtl,
    component: SkeletonRtl,
  },
];
