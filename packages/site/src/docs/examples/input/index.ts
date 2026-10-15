import type { Demo } from "../../registry.ts";
import InputBadge from "./input-badge.tsx";
import inputBadge from "./input-badge.tsx?raw";
import InputBasic from "./input-basic.tsx";
import inputBasic from "./input-basic.tsx?raw";
import InputButtonGroup from "./input-button-group.tsx";
import inputButtonGroup from "./input-button-group.tsx?raw";
import InputDemo from "./input-demo.tsx";
import inputDemo from "./input-demo.tsx?raw";
import InputDisabled from "./input-disabled.tsx";
import inputDisabled from "./input-disabled.tsx?raw";
import InputField from "./input-field.tsx";
import inputField from "./input-field.tsx?raw";
import InputFieldgroup from "./input-fieldgroup.tsx";
import inputFieldgroup from "./input-fieldgroup.tsx?raw";
import InputFile from "./input-file.tsx";
import inputFile from "./input-file.tsx?raw";
import InputForm from "./input-form.tsx";
import inputForm from "./input-form.tsx?raw";
import InputGrid from "./input-grid.tsx";
import inputGrid from "./input-grid.tsx?raw";
import InputInline from "./input-inline.tsx";
import inputInline from "./input-inline.tsx?raw";
import InputInputGroup from "./input-input-group.tsx";
import inputInputGroup from "./input-input-group.tsx?raw";
import InputInvalid from "./input-invalid.tsx";
import inputInvalid from "./input-invalid.tsx?raw";
import InputReadOnly from "./input-read-only.tsx";
import inputReadOnly from "./input-read-only.tsx?raw";
import InputRequired from "./input-required.tsx";
import inputRequired from "./input-required.tsx?raw";
import InputRtl from "./input-rtl.tsx";
import inputRtl from "./input-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  { code: inputDemo, component: InputDemo },
  { title: "Basic", code: inputBasic, component: InputBasic },
  {
    title: "Field",
    note: "Use `Field`, `FieldLabel`, and `FieldDescription` to create an input with a label and description.",
    code: inputField,
    component: InputField,
  },
  {
    title: "Field Group",
    note: "Use `FieldGroup` to show multiple `Field` blocks and to build forms.",
    code: inputFieldgroup,
    component: InputFieldgroup,
  },
  {
    title: "Disabled",
    note: "Use the `disabled` prop to disable the input. To dim the label with it, set `isDisabled` on the `Field`.",
    code: inputDisabled,
    component: InputDisabled,
  },
  {
    title: "Invalid",
    note: "Use the `aria-invalid` prop to mark the input as invalid. To colour the label and description with it, set `isInvalid` on the `Field`.",
    code: inputInvalid,
    component: InputInvalid,
  },
  {
    title: "File",
    note: 'Use the `type="file"` prop to create a file input.',
    code: inputFile,
    component: InputFile,
  },
  {
    title: "Inline",
    note: 'Use `Field` with `orientation="horizontal"` to create an inline input. Pair with `Button` to create a search input with a button.',
    code: inputInline,
    component: InputInline,
  },
  {
    title: "Grid",
    note: "Use a grid layout to place multiple inputs side by side.",
    code: inputGrid,
    component: InputGrid,
  },
  {
    title: "Required",
    note: "Use the `required` attribute to indicate required inputs.",
    code: inputRequired,
    component: InputRequired,
  },
  {
    title: "Badge",
    note: "Use `Badge` in the label to highlight a recommended field.",
    code: inputBadge,
    component: InputBadge,
  },
  {
    title: "Input Group",
    note: "To add icons, text, or buttons inside an input, use the `InputGroup` component.",
    code: inputInputGroup,
    component: InputInputGroup,
  },
  {
    title: "Button Group",
    note: "To add buttons to an input, use the `ButtonGroup` component.",
    code: inputButtonGroup,
    component: InputButtonGroup,
  },
  {
    title: "Form",
    note: "A full form example with multiple inputs, a select, and a button.",
    align: "start",
    size: "auto",
    code: inputForm,
    component: InputForm,
  },
  {
    title: "Read only",
    note: "Use the `readOnly` prop for a value that can be selected and copied but not changed.",
    code: inputReadOnly,
    component: InputReadOnly,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: inputRtl,
    component: InputRtl,
  },
];
