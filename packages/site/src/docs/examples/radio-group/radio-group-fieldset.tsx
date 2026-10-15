import { css } from "@barqjs/css";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  RadioGroup,
  RadioGroupItem,
} from "@barqjs/ui";

const fieldset = css`
  width: 100%;
  max-width: 20rem;
`;

const plain = css`
  font-weight: 400;
`;

export default function RadioGroupFieldset() {
  return (
    <FieldSet class={fieldset}>
      <FieldLegend variant="label">Subscription Plan</FieldLegend>
      <FieldDescription>Yearly and lifetime plans offer significant savings.</FieldDescription>
      <RadioGroup defaultValue="monthly">
        <Field orientation="horizontal">
          <RadioGroupItem value="monthly" id="radio-group-fieldset-monthly" />
          <FieldLabel for="radio-group-fieldset-monthly" class={plain}>
            Monthly ($9.99/month)
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <RadioGroupItem value="yearly" id="radio-group-fieldset-yearly" />
          <FieldLabel for="radio-group-fieldset-yearly" class={plain}>
            Yearly ($99.99/year)
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <RadioGroupItem value="lifetime" id="radio-group-fieldset-lifetime" />
          <FieldLabel for="radio-group-fieldset-lifetime" class={plain}>
            Lifetime ($299.99)
          </FieldLabel>
        </Field>
      </RadioGroup>
    </FieldSet>
  );
}
