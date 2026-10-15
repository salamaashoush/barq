import type { Demo } from "../../registry.ts";
import TextareaButton from "./textarea-button.tsx";
import textareaButton from "./textarea-button.tsx?raw";
import TextareaDemo from "./textarea-demo.tsx";
import textareaDemo from "./textarea-demo.tsx?raw";
import TextareaDisabled from "./textarea-disabled.tsx";
import textareaDisabled from "./textarea-disabled.tsx?raw";
import TextareaField from "./textarea-field.tsx";
import textareaField from "./textarea-field.tsx?raw";
import TextareaInvalid from "./textarea-invalid.tsx";
import textareaInvalid from "./textarea-invalid.tsx?raw";
import TextareaRtl from "./textarea-rtl.tsx";
import textareaRtl from "./textarea-rtl.tsx?raw";

export const demos: readonly Demo[] = [
  { code: textareaDemo, component: TextareaDemo },
  {
    title: "Field",
    note: "Use `Field`, `FieldLabel`, and `FieldDescription` to create a textarea with a label and description.",
    code: textareaField,
    component: TextareaField,
  },
  {
    title: "Disabled",
    note: "Use the `disabled` prop to disable the textarea. To dim the label with it, set `isDisabled` on the `Field`.",
    code: textareaDisabled,
    component: TextareaDisabled,
  },
  {
    title: "Invalid",
    note: "Use the `aria-invalid` prop to mark the textarea as invalid. To colour the label and description with it, set `isInvalid` on the `Field`.",
    code: textareaInvalid,
    component: TextareaInvalid,
  },
  {
    title: "Button",
    note: "Pair with `Button` to create a textarea with a submit button.",
    code: textareaButton,
    component: TextareaButton,
  },
  {
    title: "RTL",
    note: "Wrap the tree in `DirectionProvider` and put `dir` on an element you own.",
    rtl: true,
    code: textareaRtl,
    component: TextareaRtl,
  },
];
