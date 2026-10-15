import { css } from "@barqjs/css";
import { Checkbox, Field, FieldGroup, FieldLabel } from "@barqjs/ui";

const group = css`
  width: 14rem;
  margin-inline: auto;
`;

export default function CheckboxBasic() {
  return (
    <FieldGroup class={group}>
      <Field orientation="horizontal">
        <Checkbox id="checkbox-basic-terms" name="checkbox-basic-terms" />
        <FieldLabel for="checkbox-basic-terms">Accept terms and conditions</FieldLabel>
      </Field>
    </FieldGroup>
  );
}
