import { css } from "@barqjs/css";
import {
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
  Label,
} from "@barqjs/ui";

const group = css`
  max-width: 24rem;
`;

export default function CheckboxDemo() {
  return (
    <FieldGroup class={group}>
      <Field orientation="horizontal">
        <Checkbox id="checkbox-demo-terms" name="checkbox-demo-terms" />
        <Label for="checkbox-demo-terms">Accept terms and conditions</Label>
      </Field>
      <Field orientation="horizontal">
        <Checkbox id="checkbox-demo-terms-2" name="checkbox-demo-terms-2" defaultChecked />
        <FieldContent>
          <FieldLabel for="checkbox-demo-terms-2">Accept terms and conditions</FieldLabel>
          <FieldDescription>By clicking this checkbox, you agree to the terms.</FieldDescription>
        </FieldContent>
      </Field>
      <Field orientation="horizontal" isDisabled>
        <Checkbox id="checkbox-demo-toggle" name="checkbox-demo-toggle" disabled />
        <FieldLabel for="checkbox-demo-toggle">Enable notifications</FieldLabel>
      </Field>
      <FieldLabel>
        <Field orientation="horizontal">
          <Checkbox id="checkbox-demo-toggle-2" name="checkbox-demo-toggle-2" />
          <FieldContent>
            <FieldTitle>Enable notifications</FieldTitle>
            <FieldDescription>
              You can enable or disable notifications at any time.
            </FieldDescription>
          </FieldContent>
        </Field>
      </FieldLabel>
    </FieldGroup>
  );
}
