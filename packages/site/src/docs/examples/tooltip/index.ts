import type { Demo } from "../../registry.ts";
import TooltipDemo from "./tooltip-demo.tsx";
import tooltipDemo from "./tooltip-demo.tsx?raw";
import TooltipSides from "./tooltip-sides.tsx";
import tooltipSides from "./tooltip-sides.tsx?raw";
import TooltipKeyboard from "./tooltip-keyboard.tsx";
import tooltipKeyboard from "./tooltip-keyboard.tsx?raw";
import TooltipDisabled from "./tooltip-disabled.tsx";
import tooltipDisabled from "./tooltip-disabled.tsx?raw";
import TooltipRtl from "./tooltip-rtl.tsx";
import tooltipRtl from "./tooltip-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: tooltipDemo,
    component: TooltipDemo,
  },
  {
    title: "Side",
    note: "Use the `side` prop to change the position of the tooltip.",
    code: tooltipSides,
    component: TooltipSides,
  },
  {
    title: "With Keyboard Shortcut",
    note: "Put a `Kbd` in the content to show the shortcut.",
    code: tooltipKeyboard,
    component: TooltipKeyboard,
  },
  {
    title: "Disabled Button",
    note: "Show a tooltip on a disabled button by wrapping it with a focusable element, handed the trigger's props through `render`.",
    code: tooltipDisabled,
    component: TooltipDisabled,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: tooltipRtl,
    component: TooltipRtl,
  },
];
