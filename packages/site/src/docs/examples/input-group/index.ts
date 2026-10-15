import type { Demo } from "../../registry.ts";
import InputGroupDemo from "./input-group-demo.tsx";
import inputGroupDemo from "./input-group-demo.tsx?raw";
import InputGroupInlineStart from "./input-group-inline-start.tsx";
import inputGroupInlineStart from "./input-group-inline-start.tsx?raw";
import InputGroupInlineEnd from "./input-group-inline-end.tsx";
import inputGroupInlineEnd from "./input-group-inline-end.tsx?raw";
import InputGroupBlockStart from "./input-group-block-start.tsx";
import inputGroupBlockStart from "./input-group-block-start.tsx?raw";
import InputGroupBlockEnd from "./input-group-block-end.tsx";
import inputGroupBlockEnd from "./input-group-block-end.tsx?raw";
import InputGroupIcon from "./input-group-icon.tsx";
import inputGroupIcon from "./input-group-icon.tsx?raw";
import InputGroupText from "./input-group-text.tsx";
import inputGroupText from "./input-group-text.tsx?raw";
import InputGroupButton from "./input-group-button.tsx";
import inputGroupButton from "./input-group-button.tsx?raw";
import InputGroupKbd from "./input-group-kbd.tsx";
import inputGroupKbd from "./input-group-kbd.tsx?raw";
import InputGroupDropdown from "./input-group-dropdown.tsx";
import inputGroupDropdown from "./input-group-dropdown.tsx?raw";
import InputGroupSpinner from "./input-group-spinner.tsx";
import inputGroupSpinner from "./input-group-spinner.tsx?raw";
import InputGroupTextarea from "./input-group-textarea.tsx";
import inputGroupTextarea from "./input-group-textarea.tsx?raw";
import InputGroupCustom from "./input-group-custom.tsx";
import inputGroupCustom from "./input-group-custom.tsx?raw";
import InputGroupBasic from "./input-group-basic.tsx";
import inputGroupBasic from "./input-group-basic.tsx?raw";
import InputGroupWithAddons from "./input-group-with-addons.tsx";
import inputGroupWithAddons from "./input-group-with-addons.tsx?raw";
import InputGroupWithButtons from "./input-group-with-buttons.tsx";
import inputGroupWithButtons from "./input-group-with-buttons.tsx?raw";
import InputGroupWithKbd from "./input-group-with-kbd.tsx";
import inputGroupWithKbd from "./input-group-with-kbd.tsx?raw";
import InputGroupWithTooltip from "./input-group-with-tooltip.tsx";
import inputGroupWithTooltip from "./input-group-with-tooltip.tsx?raw";
import InputGroupLabel from "./input-group-label.tsx";
import inputGroupLabel from "./input-group-label.tsx?raw";
import InputGroupTooltip from "./input-group-tooltip.tsx";
import inputGroupTooltip from "./input-group-tooltip.tsx?raw";
import InputGroupButtonGroup from "./input-group-button-group.tsx";
import inputGroupButtonGroup from "./input-group-button-group.tsx?raw";
import InputGroupInCard from "./input-group-in-card.tsx";
import inputGroupInCard from "./input-group-in-card.tsx?raw";
import InputGroupTextareaExamples from "./input-group-textarea-examples.tsx";
import inputGroupTextareaExamples from "./input-group-textarea-examples.tsx?raw";
import InputGroupRtl from "./input-group-rtl.tsx";
import inputGroupRtl from "./input-group-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    code: inputGroupDemo,
    component: InputGroupDemo,
  },
  {
    title: "inline-start",
    note: 'Use `align="inline-start"` to position the addon at the start of the input. This is the default.',
    code: inputGroupInlineStart,
    component: InputGroupInlineStart,
  },
  {
    title: "inline-end",
    note: 'Use `align="inline-end"` to position the addon at the end of the input.',
    code: inputGroupInlineEnd,
    component: InputGroupInlineEnd,
  },
  {
    title: "block-start",
    note: 'Use `align="block-start"` to position the addon above the input.',
    align: "start",
    size: "auto",
    code: inputGroupBlockStart,
    component: InputGroupBlockStart,
  },
  {
    title: "block-end",
    note: 'Use `align="block-end"` to position the addon below the input.',
    align: "start",
    size: "auto",
    code: inputGroupBlockEnd,
    component: InputGroupBlockEnd,
  },
  {
    title: "Icon",
    code: inputGroupIcon,
    component: InputGroupIcon,
  },
  {
    title: "Text",
    size: "auto",
    code: inputGroupText,
    component: InputGroupText,
  },
  {
    title: "Button",
    code: inputGroupButton,
    component: InputGroupButton,
  },
  {
    title: "Kbd",
    code: inputGroupKbd,
    component: InputGroupKbd,
  },
  {
    title: "Dropdown",
    code: inputGroupDropdown,
    component: InputGroupDropdown,
  },
  {
    title: "Spinner",
    code: inputGroupSpinner,
    component: InputGroupSpinner,
  },
  {
    title: "Textarea",
    size: "auto",
    code: inputGroupTextarea,
    component: InputGroupTextarea,
  },
  {
    title: "Custom Input",
    note: 'Add the `data-slot="input-group-control"` attribute to your custom input for automatic focus state handling. Here is a textarea that grows with its content through `field-sizing`.',
    code: inputGroupCustom,
    component: InputGroupCustom,
  },
  {
    title: "Basic",
    note: "An input group beside a plain input, disabled and invalid.",
    align: "start",
    size: "auto",
    code: inputGroupBasic,
    component: InputGroupBasic,
  },
  {
    title: "With Addons",
    note: "Every addon position, with icons, text and a label.",
    align: "start",
    size: "auto",
    code: inputGroupWithAddons,
    component: InputGroupWithAddons,
  },
  {
    title: "With Buttons",
    note: "`InputGroupButton` in each variant and at each end.",
    align: "start",
    size: "auto",
    code: inputGroupWithButtons,
    component: InputGroupWithButtons,
  },
  {
    title: "With Kbd",
    note: "Keyboard hints, status marks and a disabled group.",
    align: "start",
    size: "auto",
    code: inputGroupWithKbd,
    component: InputGroupWithKbd,
  },
  {
    title: "With Tooltip",
    note: "A tooltip, a dropdown, a popover and a button group around the same control.",
    align: "start",
    size: "auto",
    code: inputGroupWithTooltip,
    component: InputGroupWithTooltip,
  },
  {
    title: "Label",
    note: "A `Label` inside an addon names the control.",
    code: inputGroupLabel,
    component: InputGroupLabel,
  },
  {
    title: "Tooltip",
    note: "An `InputGroupButton` is the tooltip's trigger.",
    code: inputGroupTooltip,
    component: InputGroupTooltip,
  },
  {
    title: "Button Group",
    note: "An input group joins a `ButtonGroup` like any other control.",
    code: inputGroupButtonGroup,
    component: InputGroupButtonGroup,
  },
  {
    title: "In Card",
    align: "start",
    size: "auto",
    code: inputGroupInCard,
    component: InputGroupInCard,
  },
  {
    title: "Textarea Examples",
    note: "`InputGroupTextarea` with headers, footers and actions.",
    align: "start",
    size: "auto",
    code: inputGroupTextareaExamples,
    component: InputGroupTextareaExamples,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own. The addons follow the inline direction.",
    size: "auto",
    rtl: true,
    code: inputGroupRtl,
    component: InputGroupRtl,
  },
];
