import { css } from "@barqjs/css";
import { Field, FieldDescription, FieldLabel, Input } from "@barqjs/ui";

const field = css`
  width: 100%;
  max-width: 20rem;
`;

export default function InputDemo() {
  return (
    <Field class={field}>
      <FieldLabel for="input-demo-api-key">API Key</FieldLabel>
      <Input id="input-demo-api-key" type="password" placeholder="sk-..." />
      <FieldDescription>Your API key is encrypted and stored securely.</FieldDescription>
    </Field>
  );
}
