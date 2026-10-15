import { css } from "@barqjs/css";
import { Button, Field, Input } from "@barqjs/ui";

const field = css`
  width: 100%;
  max-width: 20rem;
`;

export default function InputInline() {
  return (
    <Field orientation="horizontal" class={field}>
      <Input type="search" placeholder="Search..." />
      <Button>Search</Button>
    </Field>
  );
}
