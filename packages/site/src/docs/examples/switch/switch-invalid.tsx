import { css } from "@barqjs/css";
import { Field, FieldContent, FieldDescription, FieldLabel, Switch } from "@barqjs/ui";

const field = css`
  max-width: 24rem;
`;

export default function SwitchInvalid() {
  return (
    <Field orientation="horizontal" isInvalid class={field}>
      <FieldContent>
        <FieldLabel for="switch-invalid-terms">Accept terms and conditions</FieldLabel>
        <FieldDescription>You must accept the terms and conditions to continue.</FieldDescription>
      </FieldContent>
      <Switch id="switch-invalid-terms" isInvalid />
    </Field>
  );
}
