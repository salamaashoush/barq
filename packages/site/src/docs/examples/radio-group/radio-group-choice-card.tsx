import { css } from "@barqjs/css";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
  RadioGroup,
  RadioGroupItem,
} from "@barqjs/ui";

const group = css`
  max-width: 24rem;
`;

export default function RadioGroupChoiceCard() {
  return (
    <RadioGroup defaultValue="plus" class={group}>
      <FieldLabel for="radio-group-choice-card-plus">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Plus</FieldTitle>
            <FieldDescription>For individuals and small teams.</FieldDescription>
          </FieldContent>
          <RadioGroupItem value="plus" id="radio-group-choice-card-plus" />
        </Field>
      </FieldLabel>
      <FieldLabel for="radio-group-choice-card-pro">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Pro</FieldTitle>
            <FieldDescription>For growing businesses.</FieldDescription>
          </FieldContent>
          <RadioGroupItem value="pro" id="radio-group-choice-card-pro" />
        </Field>
      </FieldLabel>
      <FieldLabel for="radio-group-choice-card-enterprise">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Enterprise</FieldTitle>
            <FieldDescription>For large teams and enterprises.</FieldDescription>
          </FieldContent>
          <RadioGroupItem value="enterprise" id="radio-group-choice-card-enterprise" />
        </Field>
      </FieldLabel>
    </RadioGroup>
  );
}
