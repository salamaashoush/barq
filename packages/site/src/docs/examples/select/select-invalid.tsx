import { css } from "@barqjs/css";
import {
  Field,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@barqjs/ui";

const field = css`
  width: 100%;
  max-width: 12rem;
`;

export default function SelectInvalid() {
  return (
    <Field isInvalid class={field}>
      <FieldLabel for="select-invalid-fruit">Fruit</FieldLabel>
      <Select>
        <SelectTrigger id="select-invalid-fruit" aria-invalid>
          <SelectValue placeholder="Select a fruit" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="apple">Apple</SelectItem>
            <SelectItem value="banana">Banana</SelectItem>
            <SelectItem value="blueberry">Blueberry</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldError>Please select a fruit.</FieldError>
    </Field>
  );
}
