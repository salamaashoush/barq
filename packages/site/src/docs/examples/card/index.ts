import type { Demo } from "../../registry.ts";
import CardBordered from "./card-bordered.tsx";
import cardBordered from "./card-bordered.tsx?raw";
import CardDemo from "./card-demo.tsx";
import cardDemo from "./card-demo.tsx?raw";
import CardEdgeToEdge from "./card-edge-to-edge.tsx";
import cardEdgeToEdge from "./card-edge-to-edge.tsx?raw";
import CardImage from "./card-image.tsx";
import cardImage from "./card-image.tsx?raw";
import CardRtl from "./card-rtl.tsx";
import cardRtl from "./card-rtl.tsx?raw";
import CardSmall from "./card-small.tsx";
import cardSmall from "./card-small.tsx?raw";
import CardSpacing from "./card-spacing.tsx";
import cardSpacing from "./card-spacing.tsx?raw";

export const demos: readonly Demo[] = [
  {
    align: "start",
    size: "auto",
    code: cardDemo,
    component: CardDemo,
  },
  {
    title: "Size",
    note: 'Use the `size="sm"` prop to set the size of the card to small. The small size variant uses smaller spacing.',
    size: "auto",
    code: cardSmall,
    component: CardSmall,
  },
  {
    title: "Spacing",
    note: "In addition to the `size` prop, the `--card-spacing` CSS variable controls the spacing between sections and the inset of the card's parts.",
    align: "start",
    size: "auto",
    code: cardSpacing,
    component: CardSpacing,
  },
  {
    title: "Edge to edge",
    note: "Use a negative inline margin of `--card-spacing` to make content go edge to edge while keeping it aligned with the card inset. Above a footer, a negative bottom margin on `CardContent` removes the section gap.",
    size: "auto",
    code: cardEdgeToEdge,
    component: CardEdgeToEdge,
  },
  {
    title: "Image",
    note: "Add an image before the card header to create a card with an image.",
    size: "auto",
    code: cardImage,
    component: CardImage,
  },
  {
    title: "Bordered",
    note: "`bordered` on `CardHeader` puts a rule under it, with the padding that goes with it.",
    size: "auto",
    code: cardBordered,
    component: CardBordered,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    align: "start",
    size: "auto",
    rtl: true,
    code: cardRtl,
    component: CardRtl,
  },
];
