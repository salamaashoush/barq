import type { Demo } from "../../registry.ts";
import ComboboxDemo from "./combobox-demo.tsx";
import comboboxDemo from "./combobox-demo.tsx?raw";
import ComboboxBasic from "./combobox-basic.tsx";
import comboboxBasic from "./combobox-basic.tsx?raw";
import ComboboxMultiple from "./combobox-multiple.tsx";
import comboboxMultiple from "./combobox-multiple.tsx?raw";
import ComboboxClear from "./combobox-clear.tsx";
import comboboxClear from "./combobox-clear.tsx?raw";
import ComboboxGroups from "./combobox-groups.tsx";
import comboboxGroups from "./combobox-groups.tsx?raw";
import ComboboxCustom from "./combobox-custom.tsx";
import comboboxCustom from "./combobox-custom.tsx?raw";
import ComboboxInvalid from "./combobox-invalid.tsx";
import comboboxInvalid from "./combobox-invalid.tsx?raw";
import ComboboxDisabled from "./combobox-disabled.tsx";
import comboboxDisabled from "./combobox-disabled.tsx?raw";
import ComboboxAutoHighlight from "./combobox-auto-highlight.tsx";
import comboboxAutoHighlight from "./combobox-auto-highlight.tsx?raw";
import ComboboxPopup from "./combobox-popup.tsx";
import comboboxPopup from "./combobox-popup.tsx?raw";
import ComboboxInputGroup from "./combobox-input-group.tsx";
import comboboxInputGroup from "./combobox-input-group.tsx?raw";
import ComboboxRtl from "./combobox-rtl.tsx";
import comboboxRtl from "./combobox-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  {
    align: "start",
    code: comboboxDemo,
    component: ComboboxDemo,
  },
  {
    title: "Basic",
    note: "A simple combobox with a list of frameworks.",
    align: "start",
    code: comboboxBasic,
    component: ComboboxBasic,
  },
  {
    title: "Multiple",
    note: "A combobox with multiple selection using `multiple` and `ComboboxChips`.",
    align: "start",
    code: comboboxMultiple,
    component: ComboboxMultiple,
  },
  {
    title: "Clear Button",
    note: "Use the `showClear` prop to show a clear button.",
    align: "start",
    code: comboboxClear,
    component: ComboboxClear,
  },
  {
    title: "Groups",
    note: "Use `ComboboxGroup` and `ComboboxSeparator` to group items.",
    align: "start",
    code: comboboxGroups,
    component: ComboboxGroups,
  },
  {
    title: "Custom Items",
    note: "You can render a custom component inside `ComboboxItem`. Use `itemToStringValue` when your items are objects.",
    align: "start",
    code: comboboxCustom,
    component: ComboboxCustom,
  },
  {
    title: "Invalid",
    note: "Use the `aria-invalid` prop to make the combobox invalid.",
    align: "start",
    code: comboboxInvalid,
    component: ComboboxInvalid,
  },
  {
    title: "Disabled",
    note: "Use the `disabled` prop to disable the combobox.",
    align: "start",
    code: comboboxDisabled,
    component: ComboboxDisabled,
  },
  {
    title: "Auto Highlight",
    note: "Use the `autoHighlight` prop to automatically highlight the first item on filter.",
    align: "start",
    code: comboboxAutoHighlight,
    component: ComboboxAutoHighlight,
  },
  {
    title: "Popup",
    note: "Trigger the combobox from a button with `ComboboxTrigger`, which is the button itself. Move the `ComboboxInput` inside the `ComboboxContent`.",
    align: "start",
    code: comboboxPopup,
    component: ComboboxPopup,
  },
  {
    title: "Input Group",
    note: "You can add an addon to the combobox by using the `InputGroupAddon` component inside the `ComboboxInput`.",
    align: "start",
    code: comboboxInputGroup,
    component: ComboboxInputGroup,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own. The list is portalled, so `ComboboxContent` takes `dir` as well.",
    align: "start",
    rtl: true,
    code: comboboxRtl,
    component: ComboboxRtl,
  },
];
