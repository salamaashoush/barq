import { css } from "@barqjs/css";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSet,
  Input,
} from "@barqjs/ui";

const fieldSet = css`
  width: 100%;
  max-width: 20rem;
`;

export default function FieldValidation() {
  return (
    <FieldSet class={fieldSet}>
      <FieldGroup>
        <Field isInvalid>
          <FieldLabel for="field-validation-card">Card</FieldLabel>
          <Input id="field-validation-card" aria-invalid="true" placeholder="1234 5678 9012 3456" />
          <FieldError errors={[{ message: "That card was declined." }]} />
        </Field>
        <FieldSeparator>or</FieldSeparator>
        <Field isDisabled>
          <FieldLabel for="field-validation-vat">VAT number</FieldLabel>
          <Input id="field-validation-vat" disabled placeholder="Business accounts only" />
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}
