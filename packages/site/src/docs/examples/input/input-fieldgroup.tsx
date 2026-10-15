import { css } from "@barqjs/css";
import { Button, Field, FieldDescription, FieldGroup, FieldLabel, Input } from "@barqjs/ui";

const group = css`
  max-width: 20rem;
`;

export default function InputFieldgroup() {
  return (
    <FieldGroup class={group}>
      <Field>
        <FieldLabel for="input-fieldgroup-name">Name</FieldLabel>
        <Input id="input-fieldgroup-name" placeholder="Salama Ashoush" />
      </Field>
      <Field>
        <FieldLabel for="input-fieldgroup-email">Email</FieldLabel>
        <Input id="input-fieldgroup-email" type="email" placeholder="name@example.com" />
        <FieldDescription>We'll send updates to this address.</FieldDescription>
      </Field>
      <Field orientation="horizontal">
        <Button type="reset" variant="outline">
          Reset
        </Button>
        <Button type="submit">Submit</Button>
      </Field>
    </FieldGroup>
  );
}
