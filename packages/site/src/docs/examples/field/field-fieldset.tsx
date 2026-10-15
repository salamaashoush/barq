import { css } from "@barqjs/css";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Input,
} from "@barqjs/ui";

const fieldSet = css`
  width: 100%;
  max-width: 24rem;
`;

const pair = css`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: calc(var(--spacing) * 4);
`;

export default function FieldFieldset() {
  return (
    <FieldSet class={fieldSet}>
      <FieldLegend>Address Information</FieldLegend>
      <FieldDescription>We need your address to deliver your order.</FieldDescription>
      <FieldGroup>
        <Field>
          <FieldLabel for="field-fieldset-street">Street Address</FieldLabel>
          <Input id="field-fieldset-street" type="text" placeholder="123 Main St" />
        </Field>
        <div class={pair}>
          <Field>
            <FieldLabel for="field-fieldset-city">City</FieldLabel>
            <Input id="field-fieldset-city" type="text" placeholder="Springfield" />
          </Field>
          <Field>
            <FieldLabel for="field-fieldset-zip">Postal Code</FieldLabel>
            <Input id="field-fieldset-zip" type="text" placeholder="90502" />
          </Field>
        </div>
      </FieldGroup>
    </FieldSet>
  );
}
