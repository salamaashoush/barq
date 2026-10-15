import { Copy } from "@barqjs/lucide/icons/copy";
import { Trash } from "@barqjs/lucide/icons/trash";
import {
  Field,
  FieldGroup,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@barqjs/ui";

export default function InputGroupWithButtons() {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel for="input-group-with-buttons-default">Button</FieldLabel>
        <InputGroup>
          <InputGroupInput id="input-group-with-buttons-default" />
          <InputGroupAddon>
            <InputGroupButton>Default</InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupInput id="input-group-with-buttons-outline" aria-label="Outline" />
          <InputGroupAddon>
            <InputGroupButton variant="outline">Outline</InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupInput id="input-group-with-buttons-secondary" aria-label="Secondary" />
          <InputGroupAddon>
            <InputGroupButton variant="secondary">Secondary</InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupInput id="input-group-with-buttons-end" aria-label="Trailing button" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton variant="secondary">Button</InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupInput id="input-group-with-buttons-copy" aria-label="Copyable" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" aria-label="Copy">
              <Copy />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupInput id="input-group-with-buttons-delete" aria-label="Removable" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton variant="secondary" size="icon-xs" aria-label="Delete">
              <Trash />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
    </FieldGroup>
  );
}
