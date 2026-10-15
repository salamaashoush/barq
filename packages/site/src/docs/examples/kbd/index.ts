import type { Demo } from "../../registry.ts";
import KbdButton from "./kbd-button.tsx";
import kbdButton from "./kbd-button.tsx?raw";
import KbdDemo from "./kbd-demo.tsx";
import kbdDemo from "./kbd-demo.tsx?raw";
import KbdGroup from "./kbd-group.tsx";
import kbdGroup from "./kbd-group.tsx?raw";
import KbdInputGroup from "./kbd-input-group.tsx";
import kbdInputGroup from "./kbd-input-group.tsx?raw";
import KbdRtl from "./kbd-rtl.tsx";
import kbdRtl from "./kbd-rtl.tsx?raw";
import KbdTooltip from "./kbd-tooltip.tsx";
import kbdTooltip from "./kbd-tooltip.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: kbdDemo,
    component: KbdDemo,
  },
  {
    title: "Group",
    note: "Use the `KbdGroup` component to group keyboard keys together.",
    code: kbdGroup,
    component: KbdGroup,
  },
  {
    title: "Button",
    note: "Use the `Kbd` component inside a `Button` to show the key that presses it.",
    code: kbdButton,
    component: KbdButton,
  },
  {
    title: "Tooltip",
    note: "Use the `Kbd` component inside a `TooltipContent` to show a tooltip with a keyboard key.",
    code: kbdTooltip,
    component: KbdTooltip,
  },
  {
    title: "Input Group",
    note: "Use the `Kbd` component inside an `InputGroupAddon` to show a keyboard key beside the field.",
    code: kbdInputGroup,
    component: KbdInputGroup,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: kbdRtl,
    component: KbdRtl,
  },
];
