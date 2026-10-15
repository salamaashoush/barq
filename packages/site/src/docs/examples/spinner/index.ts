import type { Demo } from "../../registry.ts";
import SpinnerBadge from "./spinner-badge.tsx";
import spinnerBadge from "./spinner-badge.tsx?raw";
import SpinnerButton from "./spinner-button.tsx";
import spinnerButton from "./spinner-button.tsx?raw";
import SpinnerCustom from "./spinner-custom.tsx";
import spinnerCustom from "./spinner-custom.tsx?raw";
import SpinnerDemo from "./spinner-demo.tsx";
import spinnerDemo from "./spinner-demo.tsx?raw";
import SpinnerEmpty from "./spinner-empty.tsx";
import spinnerEmpty from "./spinner-empty.tsx?raw";
import SpinnerInputGroup from "./spinner-input-group.tsx";
import spinnerInputGroup from "./spinner-input-group.tsx?raw";
import SpinnerRtl from "./spinner-rtl.tsx";
import spinnerRtl from "./spinner-rtl.tsx?raw";
import SpinnerSize from "./spinner-size.tsx";
import spinnerSize from "./spinner-size.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: spinnerDemo,
    component: SpinnerDemo,
  },
  {
    title: "Customization",
    note: 'The spinner is one icon with a `spin` animation. To use another, give your own icon `role="status"`, an `aria-label` and the animation.',
    code: spinnerCustom,
    component: SpinnerCustom,
  },
  {
    title: "Size",
    note: "Set the width and the height with a class to change the size of the spinner.",
    code: spinnerSize,
    component: SpinnerSize,
  },
  {
    title: "Button",
    note: "Add a spinner to a button to indicate a loading state.",
    code: spinnerButton,
    component: SpinnerButton,
  },
  {
    title: "Badge",
    note: "You can also use a spinner inside a badge.",
    code: spinnerBadge,
    component: SpinnerBadge,
  },
  {
    title: "Input Group",
    note: "A spinner can sit in an `InputGroupAddon`.",
    code: spinnerInputGroup,
    component: SpinnerInputGroup,
  },
  {
    title: "Empty",
    note: "You can place a spinner inside an empty state.",
    code: spinnerEmpty,
    component: SpinnerEmpty,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: spinnerRtl,
    component: SpinnerRtl,
  },
];
