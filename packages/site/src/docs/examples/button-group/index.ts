import type { Demo } from "../../registry.ts";
import ButtonGroupDemo from "./button-group-demo.tsx";
import buttonGroupDemo from "./button-group-demo.tsx?raw";
import ButtonGroupDropdown from "./button-group-dropdown.tsx";
import buttonGroupDropdown from "./button-group-dropdown.tsx?raw";
import ButtonGroupInput from "./button-group-input.tsx";
import buttonGroupInput from "./button-group-input.tsx?raw";
import ButtonGroupInputGroup from "./button-group-input-group.tsx";
import buttonGroupInputGroup from "./button-group-input-group.tsx?raw";
import ButtonGroupNested from "./button-group-nested.tsx";
import buttonGroupNested from "./button-group-nested.tsx?raw";
import ButtonGroupOrientation from "./button-group-orientation.tsx";
import buttonGroupOrientation from "./button-group-orientation.tsx?raw";
import ButtonGroupPopover from "./button-group-popover.tsx";
import buttonGroupPopover from "./button-group-popover.tsx?raw";
import ButtonGroupRtl from "./button-group-rtl.tsx";
import buttonGroupRtl from "./button-group-rtl.tsx?raw";
import ButtonGroupSelect from "./button-group-select.tsx";
import buttonGroupSelect from "./button-group-select.tsx?raw";
import ButtonGroupSeparator from "./button-group-separator.tsx";
import buttonGroupSeparator from "./button-group-separator.tsx?raw";
import ButtonGroupSize from "./button-group-size.tsx";
import buttonGroupSize from "./button-group-size.tsx?raw";
import ButtonGroupSplit from "./button-group-split.tsx";
import buttonGroupSplit from "./button-group-split.tsx?raw";
import ButtonGroupWithText from "./button-group-with-text.tsx";
import buttonGroupWithText from "./button-group-with-text.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: buttonGroupDemo,
    component: ButtonGroupDemo,
  },
  {
    title: "Orientation",
    note: "Set the `orientation` prop to change the button group layout.",
    code: buttonGroupOrientation,
    component: ButtonGroupOrientation,
  },
  {
    title: "Size",
    note: "Control the size of buttons using the `size` prop on individual buttons.",
    code: buttonGroupSize,
    component: ButtonGroupSize,
  },
  {
    title: "Nested",
    note: "Nest `ButtonGroup` components to create button groups with spacing.",
    code: buttonGroupNested,
    component: ButtonGroupNested,
  },
  {
    title: "Separator",
    note: "The `ButtonGroupSeparator` component visually divides buttons within a group. Buttons with variant `outline` have a border and do not need one.",
    code: buttonGroupSeparator,
    component: ButtonGroupSeparator,
  },
  {
    title: "Split",
    note: "Create a split button group by adding two buttons separated by a `ButtonGroupSeparator`.",
    code: buttonGroupSplit,
    component: ButtonGroupSplit,
  },
  {
    title: "Input",
    note: "Wrap an `Input` component with buttons.",
    code: buttonGroupInput,
    component: ButtonGroupInput,
  },
  {
    title: "Input Group",
    note: "Wrap an `InputGroup` component to create complex input layouts.",
    code: buttonGroupInputGroup,
    component: ButtonGroupInputGroup,
  },
  {
    title: "Dropdown Menu",
    note: "Create a split button group with a `DropdownMenu` component.",
    code: buttonGroupDropdown,
    component: ButtonGroupDropdown,
  },
  {
    title: "Select",
    note: "Pair with a `Select` component.",
    code: buttonGroupSelect,
    component: ButtonGroupSelect,
  },
  {
    title: "Popover",
    note: "Use with a `Popover` component.",
    code: buttonGroupPopover,
    component: ButtonGroupPopover,
  },
  {
    title: "With Text",
    note: "`ButtonGroupText` is a prefix that is part of the control rather than a label beside it.",
    code: buttonGroupWithText,
    component: ButtonGroupWithText,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: buttonGroupRtl,
    component: ButtonGroupRtl,
  },
];
