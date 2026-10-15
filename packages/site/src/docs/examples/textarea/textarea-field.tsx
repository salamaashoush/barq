import { css } from "@barqjs/css";
import { Field, FieldDescription, FieldLabel, Textarea } from "@barqjs/ui";

const field = css`
  width: 100%;
  max-width: 20rem;
`;

export default function TextareaField() {
  return (
    <Field class={field}>
      <FieldLabel for="textarea-field-message">Message</FieldLabel>
      <FieldDescription>Enter your message below.</FieldDescription>
      <Textarea id="textarea-field-message" placeholder="Type your message here." />
    </Field>
  );
}
