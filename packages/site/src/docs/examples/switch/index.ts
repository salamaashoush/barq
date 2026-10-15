import type { Demo } from "../../registry.ts";
import SwitchChoiceCard from "./switch-choice-card.tsx";
import switchChoiceCard from "./switch-choice-card.tsx?raw";
import SwitchDemo from "./switch-demo.tsx";
import switchDemo from "./switch-demo.tsx?raw";
import SwitchDescription from "./switch-description.tsx";
import switchDescription from "./switch-description.tsx?raw";
import SwitchDisabled from "./switch-disabled.tsx";
import switchDisabled from "./switch-disabled.tsx?raw";
import SwitchInvalid from "./switch-invalid.tsx";
import switchInvalid from "./switch-invalid.tsx?raw";
import SwitchRtl from "./switch-rtl.tsx";
import switchRtl from "./switch-rtl.tsx?raw";
import SwitchSizes from "./switch-sizes.tsx";
import switchSizes from "./switch-sizes.tsx?raw";

export const demos: readonly Demo[] = [
  { code: switchDemo, component: SwitchDemo },
  {
    title: "Description",
    code: switchDescription,
    component: SwitchDescription,
  },
  {
    title: "Choice Card",
    note: "Card-style selection where `FieldLabel` wraps the entire `Field` for a clickable card pattern.",
    size: "auto",
    code: switchChoiceCard,
    component: SwitchChoiceCard,
  },
  {
    title: "Disabled",
    note: "Add the `disabled` prop to the `Switch` component to disable the switch. Add `isDisabled` to the `Field` component for styling.",
    code: switchDisabled,
    component: SwitchDisabled,
  },
  {
    title: "Invalid",
    note: "Add the `isInvalid` prop to the `Switch` component to indicate an invalid state. Add `isInvalid` to the `Field` component for styling.",
    code: switchInvalid,
    component: SwitchInvalid,
  },
  {
    title: "Size",
    note: "Use the `size` prop to change the size of the switch.",
    code: switchSizes,
    component: SwitchSizes,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: switchRtl,
    component: SwitchRtl,
  },
];
