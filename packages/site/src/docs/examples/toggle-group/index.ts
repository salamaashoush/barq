import type { Demo } from "../../registry.ts";
import ToggleGroupDemo from "./toggle-group-demo.tsx";
import toggleGroupDemo from "./toggle-group-demo.tsx?raw";
import ToggleGroupOutline from "./toggle-group-outline.tsx";
import toggleGroupOutline from "./toggle-group-outline.tsx?raw";
import ToggleGroupSizes from "./toggle-group-sizes.tsx";
import toggleGroupSizes from "./toggle-group-sizes.tsx?raw";
import ToggleGroupSpacing from "./toggle-group-spacing.tsx";
import toggleGroupSpacing from "./toggle-group-spacing.tsx?raw";
import ToggleGroupVertical from "./toggle-group-vertical.tsx";
import toggleGroupVertical from "./toggle-group-vertical.tsx?raw";
import ToggleGroupDisabled from "./toggle-group-disabled.tsx";
import toggleGroupDisabled from "./toggle-group-disabled.tsx?raw";
import ToggleGroupFontWeightSelector from "./toggle-group-font-weight-selector.tsx";
import toggleGroupFontWeightSelector from "./toggle-group-font-weight-selector.tsx?raw";
import ToggleGroupRtl from "./toggle-group-rtl.tsx";
import toggleGroupRtl from "./toggle-group-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: toggleGroupDemo,
    component: ToggleGroupDemo,
  },
  {
    title: "Outline",
    note: 'Use `variant="outline"` for an outline style.',
    code: toggleGroupOutline,
    component: ToggleGroupOutline,
  },
  {
    title: "Size",
    note: "Use the `size` prop to change the size of the toggle group.",
    code: toggleGroupSizes,
    component: ToggleGroupSizes,
  },
  {
    title: "Spacing",
    note: "Use `spacing` to add spacing between toggle group items.",
    code: toggleGroupSpacing,
    component: ToggleGroupSpacing,
  },
  {
    title: "Vertical",
    note: 'Use `orientation="vertical"` for vertical toggle groups.',
    code: toggleGroupVertical,
    component: ToggleGroupVertical,
  },
  {
    title: "Disabled",
    code: toggleGroupDisabled,
    component: ToggleGroupDisabled,
  },
  {
    title: "Custom",
    note: "A custom toggle group example.",
    code: toggleGroupFontWeightSelector,
    component: ToggleGroupFontWeightSelector,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own. The arrow keys follow the reading direction.",
    rtl: true,
    code: toggleGroupRtl,
    component: ToggleGroupRtl,
  },
];
