import { css } from "@barqjs/css";
import { Field, FieldLabel, Switch } from "@barqjs/ui";

const field = css`
  width: fit-content;
`;

export default function FieldSwitch() {
  return (
    <Field orientation="horizontal" class={field}>
      <FieldLabel for="field-switch-2fa">Multi-factor authentication</FieldLabel>
      <Switch id="field-switch-2fa" />
    </Field>
  );
}
