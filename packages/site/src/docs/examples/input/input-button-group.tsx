import { css } from "@barqjs/css";
import { Button, ButtonGroup, Field, FieldLabel, Input } from "@barqjs/ui";

const field = css`
  width: 100%;
  max-width: 20rem;
`;

export default function InputButtonGroup() {
  return (
    <Field class={field}>
      <FieldLabel for="input-button-group-search">Search</FieldLabel>
      <ButtonGroup>
        <Input id="input-button-group-search" placeholder="Type to search..." />
        <Button variant="outline">Search</Button>
      </ButtonGroup>
    </Field>
  );
}
