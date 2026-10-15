import { css } from "@barqjs/css";
import { Checkbox, Field, FieldGroup, FieldLabel } from "@barqjs/ui";

const group = css`
  width: 14rem;
  margin-inline: auto;
`;

export default function CheckboxInvalid() {
  return (
    <FieldGroup class={group}>
      <Field orientation="horizontal" isInvalid>
        <Checkbox id="checkbox-invalid-terms" name="checkbox-invalid-terms" isInvalid />
        <FieldLabel for="checkbox-invalid-terms">Accept terms and conditions</FieldLabel>
      </Field>
    </FieldGroup>
  );
}
