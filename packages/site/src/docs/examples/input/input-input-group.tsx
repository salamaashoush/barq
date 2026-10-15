import { css } from "@barqjs/css";
import { Info } from "@barqjs/lucide/icons/info";
import {
  Field,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@barqjs/ui";

const field = css`
  width: 100%;
  max-width: 20rem;
`;

export default function InputInputGroup() {
  return (
    <Field class={field}>
      <FieldLabel for="input-input-group-url">Website URL</FieldLabel>
      <InputGroup>
        <InputGroupInput id="input-input-group-url" placeholder="example.com" />
        <InputGroupAddon>
          <InputGroupText>https://</InputGroupText>
        </InputGroupAddon>
        <InputGroupAddon align="inline-end">
          <Info />
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}
