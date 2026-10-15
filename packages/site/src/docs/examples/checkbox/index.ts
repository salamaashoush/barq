import type { Demo } from "../../registry.ts";
import CheckboxBasic from "./checkbox-basic.tsx";
import checkboxBasic from "./checkbox-basic.tsx?raw";
import CheckboxDemo from "./checkbox-demo.tsx";
import checkboxDemo from "./checkbox-demo.tsx?raw";
import CheckboxDescription from "./checkbox-description.tsx";
import checkboxDescription from "./checkbox-description.tsx?raw";
import CheckboxDisabled from "./checkbox-disabled.tsx";
import checkboxDisabled from "./checkbox-disabled.tsx?raw";
import CheckboxGroup from "./checkbox-group.tsx";
import checkboxGroup from "./checkbox-group.tsx?raw";
import CheckboxInvalid from "./checkbox-invalid.tsx";
import checkboxInvalid from "./checkbox-invalid.tsx?raw";
import CheckboxRtl from "./checkbox-rtl.tsx";
import checkboxRtl from "./checkbox-rtl.tsx?raw";
import CheckboxStates from "./checkbox-states.tsx";
import checkboxStates from "./checkbox-states.tsx?raw";
import CheckboxTable from "./checkbox-table.tsx";
import checkboxTable from "./checkbox-table.tsx?raw";

export const demos: readonly Demo[] = [
  { size: "auto", code: checkboxDemo, component: CheckboxDemo },
  {
    title: "Invalid State",
    note: "Set `isInvalid` on the checkbox and on the `Field` around it to show the invalid styles.",
    code: checkboxInvalid,
    component: CheckboxInvalid,
  },
  {
    title: "Basic",
    note: "Pair the checkbox with `Field` and `FieldLabel` for proper layout and labeling.",
    code: checkboxBasic,
    component: CheckboxBasic,
  },
  {
    title: "Description",
    note: "Use `FieldContent` and `FieldDescription` for helper text.",
    code: checkboxDescription,
    component: CheckboxDescription,
  },
  {
    title: "Disabled",
    note: "Use the `disabled` prop to prevent interaction and add `isDisabled` to the `Field` for disabled styles.",
    code: checkboxDisabled,
    component: CheckboxDisabled,
  },
  {
    title: "Group",
    note: "Use multiple fields to create a checkbox list.",
    code: checkboxGroup,
    component: CheckboxGroup,
  },
  {
    title: "Table",
    size: "auto",
    code: checkboxTable,
    component: CheckboxTable,
  },
  {
    title: "States",
    note: 'Indeterminate is a third state, not a styled second one: it is what a parent box shows when some of its children are checked. Pass `checked="indeterminate"` or `isIndeterminate`.',
    code: checkboxStates,
    component: CheckboxStates,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    size: "auto",
    rtl: true,
    code: checkboxRtl,
    component: CheckboxRtl,
  },
];
