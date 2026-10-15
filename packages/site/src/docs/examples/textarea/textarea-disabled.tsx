import { css } from "@barqjs/css";
import { Field, FieldLabel, Textarea } from "@barqjs/ui";

const field = css`
  width: 100%;
  max-width: 20rem;
`;

export default function TextareaDisabled() {
  return (
    <Field isDisabled class={field}>
      <FieldLabel for="textarea-disabled-message">Message</FieldLabel>
      <Textarea id="textarea-disabled-message" placeholder="Type your message here." disabled />
    </Field>
  );
}
