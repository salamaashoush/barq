import { css } from "@barqjs/css";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, Input } from "@barqjs/ui";

const fieldSet = css`
  width: 100%;
  max-width: 20rem;
`;

export default function FieldInput() {
  return (
    <FieldSet class={fieldSet}>
      <FieldGroup>
        <Field>
          <FieldLabel for="field-input-username">Username</FieldLabel>
          <Input id="field-input-username" type="text" placeholder="salama" />
          <FieldDescription>Choose a unique username for your account.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel for="field-input-password">Password</FieldLabel>
          <FieldDescription>Must be at least 8 characters long.</FieldDescription>
          <Input id="field-input-password" type="password" placeholder="••••••••" />
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}
