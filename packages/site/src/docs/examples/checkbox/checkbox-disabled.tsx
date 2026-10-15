import { css } from "@barqjs/css";
import { Checkbox, Field, FieldGroup, FieldLabel } from "@barqjs/ui";

const group = css`
  width: 14rem;
  margin-inline: auto;
`;

export default function CheckboxDisabled() {
  return (
    <FieldGroup class={group}>
      <Field orientation="horizontal" isDisabled>
        <Checkbox id="checkbox-disabled-toggle" name="checkbox-disabled-toggle" disabled />
        <FieldLabel for="checkbox-disabled-toggle">Enable notifications</FieldLabel>
      </Field>
    </FieldGroup>
  );
}
