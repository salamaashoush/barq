import { css } from "@barqjs/css";
import { Field, FieldDescription, FieldLabel, Input } from "@barqjs/ui";

const field = css`
  width: 100%;
  max-width: 20rem;
`;

const mark = css`
  color: var(--destructive);
`;

export default function InputRequired() {
  return (
    <Field class={field}>
      <FieldLabel for="input-required-field">
        Required Field <span class={mark}>*</span>
      </FieldLabel>
      <Input id="input-required-field" placeholder="This field is required" required />
      <FieldDescription>This field must be filled out.</FieldDescription>
    </Field>
  );
}
