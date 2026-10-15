import type { Demo } from "../../registry.ts";
import AspectRatioDemo from "./aspect-ratio-demo.tsx";
import aspectRatioDemo from "./aspect-ratio-demo.tsx?raw";
import AspectRatioPortrait from "./aspect-ratio-portrait.tsx";
import aspectRatioPortrait from "./aspect-ratio-portrait.tsx?raw";
import AspectRatioRtl from "./aspect-ratio-rtl.tsx";
import aspectRatioRtl from "./aspect-ratio-rtl.tsx?raw";
import AspectRatioSquare from "./aspect-ratio-square.tsx";
import aspectRatioSquare from "./aspect-ratio-square.tsx?raw";

export const demos: readonly Demo[] = [
  { code: aspectRatioDemo, component: AspectRatioDemo },
  {
    title: "Square",
    note: "A square aspect ratio component using the `ratio={1 / 1}` prop. This is useful for displaying images in a square format.",
    code: aspectRatioSquare,
    component: AspectRatioSquare,
  },
  {
    title: "Portrait",
    note: "A portrait aspect ratio component using the `ratio={9 / 16}` prop. This is useful for displaying images in a portrait format.",
    size: "auto",
    code: aspectRatioPortrait,
    component: AspectRatioPortrait,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    size: "auto",
    rtl: true,
    code: aspectRatioRtl,
    component: AspectRatioRtl,
  },
];
