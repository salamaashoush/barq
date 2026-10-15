import { css } from "@barqjs/css";
import { Search } from "@barqjs/lucide/icons/search";
import {
  Field,
  FieldDescription,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@barqjs/ui";

const frame = css`
  max-width: 24rem;
`;

const muted = css`
  color: var(--muted-foreground);
`;

export default function InputGroupInlineStart() {
  return (
    <Field class={frame}>
      <FieldLabel for="inline-start-input">Input</FieldLabel>
      <InputGroup>
        <InputGroupInput id="inline-start-input" placeholder="Search..." />
        <InputGroupAddon align="inline-start">
          <Search class={muted} />
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription>Icon positioned at the start.</FieldDescription>
    </Field>
  );
}
