import { css } from "@barqjs/css";
import { Field, FieldDescription, FieldLabel, Input } from "@barqjs/ui";

const field = css`
  width: 100%;
  max-width: 20rem;
`;

export default function InputField() {
  return (
    <Field class={field}>
      <FieldLabel for="input-field-username">Username</FieldLabel>
      <Input id="input-field-username" type="text" placeholder="Enter your username" />
      <FieldDescription>Choose a unique username for your account.</FieldDescription>
    </Field>
  );
}
