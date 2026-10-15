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

const fieldSet = css`
  width: 100%;
  max-width: 20rem;
`;

const plain = css`
  font-weight: 400;
`;

export default function FieldRadio() {
  return (
    <FieldSet class={fieldSet}>
      <FieldLegend variant="label">Subscription Plan</FieldLegend>
      <FieldDescription>Yearly and lifetime plans offer significant savings.</FieldDescription>
      <RadioGroup defaultValue="monthly" aria-label="Subscription Plan">
        <Field orientation="horizontal">
          <RadioGroupItem value="monthly" id="field-radio-monthly" />
          <FieldLabel for="field-radio-monthly" class={plain}>
            Monthly ($9.99/month)
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <RadioGroupItem value="yearly" id="field-radio-yearly" />
          <FieldLabel for="field-radio-yearly" class={plain}>
            Yearly ($99.99/year)
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <RadioGroupItem value="lifetime" id="field-radio-lifetime" />
          <FieldLabel for="field-radio-lifetime" class={plain}>
            Lifetime ($299.99)
          </FieldLabel>
        </Field>
      </RadioGroup>
    </FieldSet>
  );
}
