import { css } from "@barqjs/css";
import { Field, FieldLabel, Switch } from "@barqjs/ui";

const field = css`
  width: fit-content;
`;

export default function SwitchDisabled() {
  return (
    <Field orientation="horizontal" isDisabled class={field}>
      <Switch id="switch-disabled-unchecked" disabled />
      <FieldLabel for="switch-disabled-unchecked">Disabled</FieldLabel>
    </Field>
  );
}
