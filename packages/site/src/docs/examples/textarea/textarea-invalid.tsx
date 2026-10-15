import { css } from "@barqjs/css";
import { Field, FieldDescription, FieldLabel, Textarea } from "@barqjs/ui";

const field = css`
  width: 100%;
  max-width: 20rem;
`;

export default function TextareaInvalid() {
  return (
    <Field isInvalid class={field}>
      <FieldLabel for="textarea-invalid-message">Message</FieldLabel>
      <Textarea
        id="textarea-invalid-message"
        placeholder="Type your message here."
        aria-invalid="true"
      />
      <FieldDescription>Please enter a valid message.</FieldDescription>
    </Field>
  );
}
