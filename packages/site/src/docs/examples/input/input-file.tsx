import { css } from "@barqjs/css";
import { Field, FieldDescription, FieldLabel, Input } from "@barqjs/ui";

const field = css`
  width: 100%;
  max-width: 20rem;
`;

export default function InputFile() {
  return (
    <Field class={field}>
      <FieldLabel for="input-file-picture">Picture</FieldLabel>
      <Input id="input-file-picture" type="file" />
      <FieldDescription>Select a picture to upload.</FieldDescription>
    </Field>
  );
}
