import { css } from "@barqjs/css";
import { Checkbox, Field, FieldGroup, FieldLabel } from "@barqjs/ui";

const group = css`
  width: 14rem;
  margin-inline: auto;
  gap: calc(var(--spacing) * 3);
`;

export default function CheckboxStates() {
  return (
    <FieldGroup class={group}>
      <Field orientation="horizontal">
        <Checkbox id="checkbox-states-checked" name="checkbox-states-checked" defaultChecked />
        <FieldLabel for="checkbox-states-checked">Checked</FieldLabel>
      </Field>
      <Field orientation="horizontal">
        <Checkbox id="checkbox-states-mixed" name="checkbox-states-mixed" checked="indeterminate" />
        <FieldLabel for="checkbox-states-mixed">Some selected</FieldLabel>
      </Field>
      <Field orientation="horizontal" isDisabled>
        <Checkbox id="checkbox-states-disabled" name="checkbox-states-disabled" disabled />
        <FieldLabel for="checkbox-states-disabled">Disabled</FieldLabel>
      </Field>
    </FieldGroup>
  );
}
