import { css } from "@barqjs/css";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, Textarea } from "@barqjs/ui";

const fieldSet = css`
  width: 100%;
  max-width: 20rem;
`;

export default function FieldTextarea() {
  return (
    <FieldSet class={fieldSet}>
      <FieldGroup>
        <Field>
          <FieldLabel for="field-textarea-feedback">Feedback</FieldLabel>
          <Textarea
            id="field-textarea-feedback"
            placeholder="Your feedback helps us improve..."
            rows={4}
          />
          <FieldDescription>Share your thoughts about our service.</FieldDescription>
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}
