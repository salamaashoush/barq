import { css } from "@barqjs/css";
import { Field, FieldGroup, FieldLabel, Input } from "@barqjs/ui";

const grid = css`
  display: grid;
  max-width: 24rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
`;

export default function InputGrid() {
  return (
    <FieldGroup class={grid}>
      <Field>
        <FieldLabel for="input-grid-first-name">First Name</FieldLabel>
        <Input id="input-grid-first-name" placeholder="Salama" />
      </Field>
      <Field>
        <FieldLabel for="input-grid-last-name">Last Name</FieldLabel>
        <Input id="input-grid-last-name" placeholder="Ashoush" />
      </Field>
    </FieldGroup>
  );
}
