import type { Demo } from "../../registry.ts";
import RadioGroupChoiceCard from "./radio-group-choice-card.tsx";
import radioGroupChoiceCard from "./radio-group-choice-card.tsx?raw";
import RadioGroupDemo from "./radio-group-demo.tsx";
import radioGroupDemo from "./radio-group-demo.tsx?raw";
import RadioGroupDescription from "./radio-group-description.tsx";
import radioGroupDescription from "./radio-group-description.tsx?raw";
import RadioGroupDisabled from "./radio-group-disabled.tsx";
import radioGroupDisabled from "./radio-group-disabled.tsx?raw";
import RadioGroupFieldset from "./radio-group-fieldset.tsx";
import radioGroupFieldset from "./radio-group-fieldset.tsx?raw";
import RadioGroupInvalid from "./radio-group-invalid.tsx";
import radioGroupInvalid from "./radio-group-invalid.tsx?raw";
import RadioGroupRtl from "./radio-group-rtl.tsx";
import radioGroupRtl from "./radio-group-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  { code: radioGroupDemo, component: RadioGroupDemo },
  {
    title: "Description",
    note: "Radio group items with a description using the `Field` component.",
    code: radioGroupDescription,
    component: RadioGroupDescription,
  },
  {
    title: "Choice Card",
    note: "Use `FieldLabel` to wrap the entire `Field` for a clickable card-style selection.",
    size: "auto",
    code: radioGroupChoiceCard,
    component: RadioGroupChoiceCard,
  },
  {
    title: "Fieldset",
    note: "Use `FieldSet` and `FieldLegend` to group radio items with a label and description.",
    code: radioGroupFieldset,
    component: RadioGroupFieldset,
  },
  {
    title: "Disabled",
    note: "Use the `disabled` prop on `RadioGroupItem` to disable individual items.",
    code: radioGroupDisabled,
    component: RadioGroupDisabled,
  },
  {
    title: "Invalid",
    note: "Use `isInvalid` on `RadioGroup` and on each `Field` to show validation errors.",
    code: radioGroupInvalid,
    component: RadioGroupInvalid,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: radioGroupRtl,
    component: RadioGroupRtl,
  },
];
