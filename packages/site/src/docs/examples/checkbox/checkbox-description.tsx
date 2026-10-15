import { css } from "@barqjs/css";
import {
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@barqjs/ui";

const group = css`
  width: 18rem;
  margin-inline: auto;
`;

export default function CheckboxDescription() {
  return (
    <FieldGroup class={group}>
      <Field orientation="horizontal">
        <Checkbox
          id="checkbox-description-terms"
          name="checkbox-description-terms"
          defaultChecked
        />
        <FieldContent>
          <FieldLabel for="checkbox-description-terms">Accept terms and conditions</FieldLabel>
          <FieldDescription>
            By clicking this checkbox, you agree to the terms and conditions.
          </FieldDescription>
        </FieldContent>
      </Field>
    </FieldGroup>
  );
}
