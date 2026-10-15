import { css } from "@barqjs/css";
import { Field, FieldLabel, RadioGroup, RadioGroupItem } from "@barqjs/ui";

const group = css`
  width: fit-content;
`;

const plain = css`
  font-weight: 400;
`;

export default function RadioGroupDisabled() {
  return (
    <RadioGroup defaultValue="option2" class={group}>
      <Field orientation="horizontal" isDisabled>
        <RadioGroupItem value="option1" id="radio-group-disabled-1" disabled />
        <FieldLabel for="radio-group-disabled-1" class={plain}>
          Disabled
        </FieldLabel>
      </Field>
      <Field orientation="horizontal">
        <RadioGroupItem value="option2" id="radio-group-disabled-2" />
        <FieldLabel for="radio-group-disabled-2" class={plain}>
          Option 2
        </FieldLabel>
      </Field>
      <Field orientation="horizontal">
        <RadioGroupItem value="option3" id="radio-group-disabled-3" />
        <FieldLabel for="radio-group-disabled-3" class={plain}>
          Option 3
        </FieldLabel>
      </Field>
    </RadioGroup>
  );
}
