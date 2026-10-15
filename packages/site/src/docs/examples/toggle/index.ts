import type { Demo } from "../../registry.ts";
import ToggleDemo from "./toggle-demo.tsx";
import toggleDemo from "./toggle-demo.tsx?raw";
import ToggleDisabled from "./toggle-disabled.tsx";
import toggleDisabled from "./toggle-disabled.tsx?raw";
import ToggleOutline from "./toggle-outline.tsx";
import toggleOutline from "./toggle-outline.tsx?raw";
import ToggleRtl from "./toggle-rtl.tsx";
import toggleRtl from "./toggle-rtl.tsx?raw";
import ToggleSizes from "./toggle-sizes.tsx";
import toggleSizes from "./toggle-sizes.tsx?raw";
import ToggleText from "./toggle-text.tsx";
import toggleText from "./toggle-text.tsx?raw";

export const demos: readonly Demo[] = [
  { code: toggleDemo, component: ToggleDemo },
  {
    title: "Outline",
    note: 'Use `variant="outline"` for an outline style.',
    code: toggleOutline,
    component: ToggleOutline,
  },
  {
    title: "With Text",
    code: toggleText,
    component: ToggleText,
  },
  {
    title: "Size",
    note: "Use the `size` prop to change the size of the toggle.",
    code: toggleSizes,
    component: ToggleSizes,
  },
  {
    title: "Disabled",
    code: toggleDisabled,
    component: ToggleDisabled,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: toggleRtl,
    component: ToggleRtl,
  },
];
