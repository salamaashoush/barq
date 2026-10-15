import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@barqjs/ui";

const group = css`
  width: 100%;
  max-width: 20rem;
`;

export default function SelectAlignItem() {
  const [alignItemWithTrigger, setAlignItemWithTrigger] = createSignal(true);

  return (
    <FieldGroup class={group}>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel for="select-align-item-switch">Align Item</FieldLabel>
          <FieldDescription>Toggle to align the item with the trigger.</FieldDescription>
        </FieldContent>
        <Switch
          id="select-align-item-switch"
          checked={alignItemWithTrigger()}
          onCheckedChange={setAlignItemWithTrigger}
        />
      </Field>
      <Field>
        <Select defaultValue="banana">
          <SelectTrigger aria-label="Fruit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position={alignItemWithTrigger() ? "item-aligned" : "popper"}>
            <SelectGroup>
              <SelectItem value="apple">Apple</SelectItem>
              <SelectItem value="banana">Banana</SelectItem>
              <SelectItem value="blueberry">Blueberry</SelectItem>
              <SelectItem value="grapes">Grapes</SelectItem>
              <SelectItem value="pineapple">Pineapple</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  );
}
