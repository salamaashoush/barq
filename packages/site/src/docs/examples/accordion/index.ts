import type { Demo } from "../../registry.ts";
import AccordionBasic from "./accordion-basic.tsx";
import accordionBasic from "./accordion-basic.tsx?raw";
import AccordionBorders from "./accordion-borders.tsx";
import accordionBorders from "./accordion-borders.tsx?raw";
import AccordionCard from "./accordion-card.tsx";
import accordionCard from "./accordion-card.tsx?raw";
import AccordionDemo from "./accordion-demo.tsx";
import accordionDemo from "./accordion-demo.tsx?raw";
import AccordionDisabled from "./accordion-disabled.tsx";
import accordionDisabled from "./accordion-disabled.tsx?raw";
import AccordionMultiple from "./accordion-multiple.tsx";
import accordionMultiple from "./accordion-multiple.tsx?raw";
import AccordionRtl from "./accordion-rtl.tsx";
import accordionRtl from "./accordion-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  { align: "start", size: "auto", code: accordionDemo, component: AccordionDemo },
  {
    title: "Basic",
    note: "A basic accordion that shows one item at a time. The first item is open by default.",
    align: "start",
    size: "auto",
    code: accordionBasic,
    component: AccordionBasic,
  },
  {
    title: "Multiple",
    note: 'Use `type="multiple"` to allow multiple items to be open at the same time.',
    align: "start",
    size: "auto",
    code: accordionMultiple,
    component: AccordionMultiple,
  },
  {
    title: "Disabled",
    note: "Use the `disabled` prop on `AccordionItem` to disable individual items.",
    align: "start",
    size: "auto",
    code: accordionDisabled,
    component: AccordionDisabled,
  },
  {
    title: "Borders",
    note: "Give the `Accordion` a border and each `AccordionItem` a bottom border, except the last, to draw rules between the items.",
    align: "start",
    size: "auto",
    code: accordionBorders,
    component: AccordionBorders,
  },
  {
    title: "Card",
    note: "Wrap the `Accordion` in a `Card` component.",
    align: "start",
    size: "auto",
    code: accordionCard,
    component: AccordionCard,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    align: "start",
    size: "auto",
    rtl: true,
    code: accordionRtl,
    component: AccordionRtl,
  },
];
