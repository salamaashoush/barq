import { css } from "@barqjs/css";
import { Field, FieldDescription, FieldLabel, Input } from "@barqjs/ui";

const field = css`
  width: 100%;
  max-width: 20rem;
`;

export default function InputReadOnly() {
  return (
    <Field class={field}>
      <FieldLabel for="input-read-only-link">Invite link</FieldLabel>
      <Input id="input-read-only-link" value="https://example.com/invite/salama" readOnly />
      <FieldDescription>Anyone with this link can join the workspace.</FieldDescription>
    </Field>
  );
}
