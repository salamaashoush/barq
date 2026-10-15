import { css } from "@barqjs/css";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  RadioGroup,
  RadioGroupItem,
} from "@barqjs/ui";

const group = css`
  width: fit-content;
`;

export default function RadioGroupDescription() {
  return (
    <RadioGroup defaultValue="comfortable" class={group}>
      <Field orientation="horizontal">
        <RadioGroupItem value="default" id="radio-group-description-r1" />
        <FieldContent>
          <FieldLabel for="radio-group-description-r1">Default</FieldLabel>
          <FieldDescription>Standard spacing for most use cases.</FieldDescription>
        </FieldContent>
      </Field>
      <Field orientation="horizontal">
        <RadioGroupItem value="comfortable" id="radio-group-description-r2" />
        <FieldContent>
          <FieldLabel for="radio-group-description-r2">Comfortable</FieldLabel>
          <FieldDescription>More space between elements.</FieldDescription>
        </FieldContent>
      </Field>
      <Field orientation="horizontal">
        <RadioGroupItem value="compact" id="radio-group-description-r3" />
        <FieldContent>
          <FieldLabel for="radio-group-description-r3">Compact</FieldLabel>
          <FieldDescription>Minimal spacing for dense layouts.</FieldDescription>
        </FieldContent>
      </Field>
    </RadioGroup>
  );
}
