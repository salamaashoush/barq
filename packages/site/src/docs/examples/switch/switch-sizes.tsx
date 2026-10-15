import { css } from "@barqjs/css";
import { Field, FieldGroup, FieldLabel, Switch } from "@barqjs/ui";

const group = css`
  width: 100%;
  max-width: 10rem;
`;

export default function SwitchSizes() {
  return (
    <FieldGroup class={group}>
      <Field orientation="horizontal">
        <Switch id="switch-sizes-sm" size="sm" />
        <FieldLabel for="switch-sizes-sm">Small</FieldLabel>
      </Field>
      <Field orientation="horizontal">
        <Switch id="switch-sizes-default" size="default" />
        <FieldLabel for="switch-sizes-default">Default</FieldLabel>
      </Field>
    </FieldGroup>
  );
}
