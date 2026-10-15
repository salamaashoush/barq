import { css } from "@barqjs/css";
import { Field, FieldContent, FieldDescription, FieldLabel, Switch } from "@barqjs/ui";

const field = css`
  max-width: 24rem;
`;

export default function SwitchDescription() {
  return (
    <Field orientation="horizontal" class={field}>
      <FieldContent>
        <FieldLabel for="switch-description-focus-mode">Share across devices</FieldLabel>
        <FieldDescription>
          Focus is shared across devices, and turns off when you leave the app.
        </FieldDescription>
      </FieldContent>
      <Switch id="switch-description-focus-mode" />
    </Field>
  );
}
