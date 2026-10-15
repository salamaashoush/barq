import { css } from "@barqjs/css";
import { Field, FieldDescription, FieldLabel, Input } from "@barqjs/ui";

const field = css`
  width: 100%;
  max-width: 20rem;
`;

export default function InputDisabled() {
  return (
    <Field isDisabled class={field}>
      <FieldLabel for="input-disabled-email">Email</FieldLabel>
      <Input id="input-disabled-email" type="email" placeholder="Email" disabled />
      <FieldDescription>This field is currently disabled.</FieldDescription>
    </Field>
  );
}
