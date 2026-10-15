import { css } from "@barqjs/css";
import { EyeOff } from "@barqjs/lucide/icons/eye-off";
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

export default function InputGroupInlineEnd() {
  return (
    <Field class={frame}>
      <FieldLabel for="inline-end-input">Input</FieldLabel>
      <InputGroup>
        <InputGroupInput id="inline-end-input" type="password" placeholder="Enter password" />
        <InputGroupAddon align="inline-end">
          <EyeOff />
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription>Icon positioned at the end.</FieldDescription>
    </Field>
  );
}
