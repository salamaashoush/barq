import { css } from "@barqjs/css";
import { Field, FieldDescription, FieldLabel, Input } from "@barqjs/ui";

const field = css`
  width: 100%;
  max-width: 20rem;
`;

export default function InputInvalid() {
  return (
    <Field isInvalid class={field}>
      <FieldLabel for="input-invalid-field">Invalid Input</FieldLabel>
      <Input id="input-invalid-field" placeholder="Error" aria-invalid="true" />
      <FieldDescription>This field contains validation errors.</FieldDescription>
    </Field>
  );
}
