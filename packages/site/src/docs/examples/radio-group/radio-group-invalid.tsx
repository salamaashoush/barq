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

export default function RadioGroupInvalid() {
  return (
    <FieldSet class={fieldset}>
      <FieldLegend variant="label">Notification Preferences</FieldLegend>
      <FieldDescription>Choose how you want to receive notifications.</FieldDescription>
      <RadioGroup defaultValue="email" isInvalid>
        <Field orientation="horizontal" isInvalid>
          <RadioGroupItem value="email" id="radio-group-invalid-email" />
          <FieldLabel for="radio-group-invalid-email" class={plain}>
            Email only
          </FieldLabel>
        </Field>
        <Field orientation="horizontal" isInvalid>
          <RadioGroupItem value="sms" id="radio-group-invalid-sms" />
          <FieldLabel for="radio-group-invalid-sms" class={plain}>
            SMS only
          </FieldLabel>
        </Field>
        <Field orientation="horizontal" isInvalid>
          <RadioGroupItem value="both" id="radio-group-invalid-both" />
          <FieldLabel for="radio-group-invalid-both" class={plain}>
            Both Email & SMS
          </FieldLabel>
        </Field>
      </RadioGroup>
    </FieldSet>
  );
}
