import { css } from "@barqjs/css";
import {
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@barqjs/ui";

const panel = css`
  width: calc(var(--spacing) * 64);
`;

const group = css`
  gap: calc(var(--spacing) * 4);
`;

const half = css`
  width: 50%;
`;

export default function PopoverForm() {
  return (
    <Popover>
      <PopoverTrigger>
        <Button variant="outline">Open Popover</Button>
      </PopoverTrigger>
      <PopoverContent class={panel} align="start">
        <PopoverHeader>
          <PopoverTitle>Dimensions</PopoverTitle>
          <PopoverDescription>Set the dimensions for the layer.</PopoverDescription>
        </PopoverHeader>
        <FieldGroup class={group}>
          <Field orientation="horizontal">
            <FieldLabel for="popover-form-width" class={half}>
              Width
            </FieldLabel>
            <Input id="popover-form-width" defaultValue="100%" />
          </Field>
          <Field orientation="horizontal">
            <FieldLabel for="popover-form-height" class={half}>
              Height
            </FieldLabel>
            <Input id="popover-form-height" defaultValue="25px" />
          </Field>
        </FieldGroup>
      </PopoverContent>
    </Popover>
  );
}
