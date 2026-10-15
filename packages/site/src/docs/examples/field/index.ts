import type { Demo } from "../../registry.ts";
import FieldCheckbox from "./field-checkbox.tsx";
import fieldCheckbox from "./field-checkbox.tsx?raw";
import FieldChoiceCard from "./field-choice-card.tsx";
import fieldChoiceCard from "./field-choice-card.tsx?raw";
import FieldDemo from "./field-demo.tsx";
import fieldDemo from "./field-demo.tsx?raw";
import FieldFieldset from "./field-fieldset.tsx";
import fieldFieldset from "./field-fieldset.tsx?raw";
import FieldGroupExample from "./field-group.tsx";
import fieldGroup from "./field-group.tsx?raw";
import FieldInput from "./field-input.tsx";
import fieldInput from "./field-input.tsx?raw";
import FieldRadio from "./field-radio.tsx";
import fieldRadio from "./field-radio.tsx?raw";
import FieldResponsive from "./field-responsive.tsx";
import fieldResponsive from "./field-responsive.tsx?raw";
import FieldRtl from "./field-rtl.tsx";
import fieldRtl from "./field-rtl.tsx?raw";
import FieldSelect from "./field-select.tsx";
import fieldSelect from "./field-select.tsx?raw";
import FieldSlider from "./field-slider.tsx";
import fieldSlider from "./field-slider.tsx?raw";
import FieldSwitch from "./field-switch.tsx";
import fieldSwitch from "./field-switch.tsx?raw";
import FieldTextarea from "./field-textarea.tsx";
import fieldTextarea from "./field-textarea.tsx?raw";
import FieldValidation from "./field-validation.tsx";
import fieldValidation from "./field-validation.tsx?raw";

export const demos: readonly Demo[] = [
  { align: "start", size: "auto", code: fieldDemo, component: FieldDemo },
  { title: "Input", code: fieldInput, component: FieldInput },
  { title: "Textarea", code: fieldTextarea, component: FieldTextarea },
  { title: "Select", code: fieldSelect, component: FieldSelect },
  { title: "Slider", code: fieldSlider, component: FieldSlider },
  { title: "Fieldset", code: fieldFieldset, component: FieldFieldset },
  { title: "Checkbox", size: "auto", code: fieldCheckbox, component: FieldCheckbox },
  { title: "Radio", code: fieldRadio, component: FieldRadio },
  { title: "Switch", code: fieldSwitch, component: FieldSwitch },
  {
    title: "Choice Card",
    note: "Wrap `Field` components inside `FieldLabel` to create selectable field groups. This works with `RadioGroupItem`, `Checkbox` and `Switch` components.",
    size: "auto",
    code: fieldChoiceCard,
    component: FieldChoiceCard,
  },
  {
    title: "Field Group",
    note: "Stack `Field` components with `FieldGroup`. Add `FieldSeparator` to divide them.",
    size: "auto",
    code: fieldGroup,
    component: FieldGroupExample,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    align: "start",
    size: "auto",
    rtl: true,
    code: fieldRtl,
    component: FieldRtl,
  },
  {
    title: "Responsive Layout",
    note: 'Set `orientation="responsive"` on `Field` to stack the label and the control until the enclosing `FieldGroup` is at least 28rem wide, then lay them side by side. Pair it with `FieldContent` to keep descriptions aligned.',
    size: "auto",
    code: fieldResponsive,
    component: FieldResponsive,
  },
  {
    title: "Validation and Errors",
    note: "Set `isInvalid` on `Field` to colour the whole block and `aria-invalid` on the control itself. `FieldError` takes children or an `errors` list, and renders nothing when there is nothing to say.",
    size: "auto",
    code: fieldValidation,
    component: FieldValidation,
  },
];
