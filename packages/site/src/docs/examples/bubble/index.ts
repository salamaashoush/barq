import type { Demo } from "../../registry.ts";
import BubbleAlignment from "./bubble-alignment.tsx";
import bubbleAlignment from "./bubble-alignment.tsx?raw";
import BubbleCollapsible from "./bubble-collapsible.tsx";
import bubbleCollapsible from "./bubble-collapsible.tsx?raw";
import BubbleDemo from "./bubble-demo.tsx";
import bubbleDemo from "./bubble-demo.tsx?raw";
import BubbleGroupDemo from "./bubble-group-demo.tsx";
import bubbleGroupDemo from "./bubble-group-demo.tsx?raw";
import BubblePopover from "./bubble-popover.tsx";
import bubblePopover from "./bubble-popover.tsx?raw";
import BubbleReactionsDemo from "./bubble-reactions.tsx";
import bubbleReactions from "./bubble-reactions.tsx?raw";
import BubbleTooltip from "./bubble-tooltip.tsx";
import bubbleTooltip from "./bubble-tooltip.tsx?raw";
import BubbleVariants from "./bubble-variants.tsx";
import bubbleVariants from "./bubble-variants.tsx?raw";

export const demos: readonly Demo[] = [
  { size: "auto", code: bubbleDemo, component: BubbleDemo },
  {
    title: "Variants",
    note: "Use `variant` to change the visual treatment of the bubble. A bubble sizes to its content, up to 80% of the container width. The `ghost` variant removes the limit.",
    size: "auto",
    code: bubbleVariants,
    component: BubbleVariants,
  },
  {
    title: "Alignment",
    note: "Use `align` on `Bubble` to align the bubble to the start or end of the conversation.",
    size: "auto",
    code: bubbleAlignment,
    component: BubbleAlignment,
  },
  {
    title: "Bubble Group",
    note: "Use `BubbleGroup` to group consecutive bubbles from the same sender. Set `align` on each `Bubble`, not on the `BubbleGroup`.",
    size: "auto",
    code: bubbleGroupDemo,
    component: BubbleGroupDemo,
  },
  {
    title: "Reactions",
    note: "Use `BubbleReactions` for reactions or quick action buttons. `side` and `align` position the row, and it overlaps the bubble edge, so leave vertical space between rows.",
    size: "auto",
    code: bubbleReactions,
    component: BubbleReactionsDemo,
  },
  {
    title: "Show More / Collapsible",
    note: "Long bubble content can be composed with `Collapsible` for a show more or show less interaction. `CollapsibleTrigger` with `asChild` makes the `Button` inside it the trigger.",
    size: "auto",
    code: bubbleCollapsible,
    component: BubbleCollapsible,
  },
  {
    title: "Tooltip",
    note: "Put a `Tooltip` in `BubbleReactions` to reveal metadata on hover, such as when a message was read.",
    size: "auto",
    code: bubbleTooltip,
    component: BubbleTooltip,
  },
  {
    title: "Popover",
    note: "Pair a bubble with a `Popover` to surface more information on demand, such as the full error message for a failed action.",
    size: "auto",
    code: bubblePopover,
    component: BubblePopover,
  },
];
