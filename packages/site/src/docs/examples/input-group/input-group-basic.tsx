import { Field, FieldGroup, FieldLabel, Input, InputGroup, InputGroupInput } from "@barqjs/ui";

export default function InputGroupBasic() {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel for="input-group-basic-default">Default (No Input Group)</FieldLabel>
        <Input placeholder="Placeholder" id="input-group-basic-default" />
      </Field>
      <Field>
        <FieldLabel for="input-group-basic-group">Input Group</FieldLabel>
        <InputGroup>
          <InputGroupInput id="input-group-basic-group" placeholder="Placeholder" />
        </InputGroup>
      </Field>
      <Field isDisabled>
        <FieldLabel for="input-group-basic-disabled">Disabled</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id="input-group-basic-disabled"
            placeholder="This field is disabled"
            disabled
          />
        </InputGroup>
      </Field>
      <Field isInvalid>
        <FieldLabel for="input-group-basic-invalid">Invalid</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id="input-group-basic-invalid"
            placeholder="This field is invalid"
            aria-invalid="true"
          />
        </InputGroup>
      </Field>
    </FieldGroup>
  );
}
