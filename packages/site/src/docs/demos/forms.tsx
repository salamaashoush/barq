/**
 * The controls: everything with a value, a keyboard model, or both.
 *
 * The JSX here is the gallery's, split one example per component, because that
 * wall is what the browser has already been driven against — a demo nobody has
 * clicked is a screenshot with extra steps.
 */

import { css } from "@barqjs/css";
import { AtSign } from "@barqjs/lucide/icons/at-sign";
import { Bold } from "@barqjs/lucide/icons/bold";
import { Copy } from "@barqjs/lucide/icons/copy";
import { Italic } from "@barqjs/lucide/icons/italic";
import { Search } from "@barqjs/lucide/icons/search";
import { Underline } from "@barqjs/lucide/icons/underline";
import {
  Checkbox,
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
  Label,
  NativeSelect,
  NativeSelectOption,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectGroup,
  SelectItem,
  Slider,
  Switch,
  Textarea,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
} from "@barqjs/ui";

import { row, stack } from "./shared.ts";

const FRUITS = [
  { id: "apple", name: "Apple" },
  { id: "banana", name: "Banana" },
  { id: "cherry", name: "Cherry" },
];

const PRODUCE = [
  {
    id: "fruit",
    name: "Fruit",
    options: [
      { id: "apple", name: "Apple" },
      { id: "pear", name: "Pear" },
    ],
  },
  { id: "veg", name: "Veg", options: [{ id: "leek", name: "Leek" }] },
];

export function InputDemo() {
  return <Input aria-label="Email" type="email" placeholder="you@example.com" />;
}

export function InputStates() {
  return (
    <div class={stack}>
      <Input aria-label="Default" placeholder="Default" />
      <Input aria-label="Disabled" placeholder="Disabled" disabled />
      <Input aria-label="Invalid" aria-invalid="true" value="not-an-email" />
      <Input aria-label="Read only" value="sk-live-2f9a" readOnly />
    </div>
  );
}

export function InputWithLabel() {
  return (
    <div class={stack}>
      <Label for="email-with-label">Email</Label>
      <Input id="email-with-label" type="email" placeholder="you@example.com" />
    </div>
  );
}

export function TextareaDemo() {
  return <Textarea aria-label="Notes" placeholder="Tell us what happened" />;
}

export function TextareaWithLabel() {
  return (
    <div class={stack}>
      <Label for="notes-with-label">Notes</Label>
      <Textarea id="notes-with-label" placeholder="Tell us what happened" />
      <p style={{ color: "var(--muted-foreground)", "font-size": "0.875rem", margin: "0" }}>
        Nobody but you sees this.
      </p>
    </div>
  );
}

export function CheckboxDemo() {
  return (
    <div class={row}>
      <Checkbox id="terms-demo" />
      <Label for="terms-demo">Accept the terms</Label>
    </div>
  );
}

export function CheckboxStates() {
  return (
    <div class={stack}>
      <div class={row}>
        <Checkbox id="checked-demo" defaultSelected />
        <Label for="checked-demo">Checked</Label>
      </div>
      <div class={row}>
        <Checkbox id="mixed-demo" isIndeterminate />
        <Label for="mixed-demo">Some selected</Label>
      </div>
      <div class={row}>
        <Checkbox id="disabled-demo" isDisabled />
        <Label for="disabled-demo">Disabled</Label>
      </div>
    </div>
  );
}

export function RadioGroupDemo() {
  return (
    <RadioGroup label="Size" defaultValue="m">
      <div class={row}>
        <RadioGroupItem value="s" id="size-s" />
        <Label for="size-s">Small</Label>
      </div>
      <div class={row}>
        <RadioGroupItem value="m" id="size-m" />
        <Label for="size-m">Medium</Label>
      </div>
      <div class={row}>
        <RadioGroupItem value="l" id="size-l" />
        <Label for="size-l">Large</Label>
      </div>
    </RadioGroup>
  );
}

export function SwitchDemo() {
  return (
    <div class={row}>
      <Switch id="wifi-demo" defaultSelected />
      <Label for="wifi-demo">Wi-Fi</Label>
    </div>
  );
}

export function SwitchDisabled() {
  return (
    <div class={stack}>
      <div class={row}>
        <Switch id="bluetooth-demo" />
        <Label for="bluetooth-demo">Bluetooth</Label>
      </div>
      <div class={row}>
        <Switch id="airplane-demo" isDisabled />
        <Label for="airplane-demo">Aeroplane mode</Label>
      </div>
    </div>
  );
}

export function SliderDemo() {
  return <Slider aria-label="Volume" defaultValue={30} />;
}

export function SliderRange() {
  return (
    <div class={stack}>
      <Slider aria-label="Volume" defaultValue={30} />
      <Slider aria-label="Price" defaultValue={[20, 60]} />
    </div>
  );
}

export function SelectDemo() {
  return (
    <Select items={FRUITS} aria-label="Fruit" placeholder="Pick one">
      {(fruit: (typeof FRUITS)[number]) => <SelectItem>{fruit.name}</SelectItem>}
    </Select>
  );
}

export function SelectGrouped() {
  return (
    <Select
      items={PRODUCE}
      aria-label="Produce"
      placeholder="Pick one"
      getChildren={(group: { options?: unknown[] }) =>
        group.options as { id: string; name: string; options?: unknown[] }[] | undefined
      }
    >
      {(value: { id: string; name: string; options?: unknown[] }) =>
        value.options === undefined ? (
          <SelectItem>{value.name}</SelectItem>
        ) : (
          <SelectGroup title={value.name} />
        )
      }
    </Select>
  );
}

export function NativeSelectDemo() {
  return (
    <NativeSelect aria-label="Country">
      <NativeSelectOption>United Kingdom</NativeSelectOption>
      <NativeSelectOption>Egypt</NativeSelectOption>
      <NativeSelectOption>Germany</NativeSelectOption>
    </NativeSelect>
  );
}

export function ComboboxDemo() {
  return (
    <Combobox
      items={FRUITS}
      placeholder="Select a fruit"
      searchPlaceholder="Search fruit"
      aria-label="Fruit"
      label={(entry: (typeof FRUITS)[number]) => entry.name}
    />
  );
}

export function ComboboxMultiple() {
  return (
    <Combobox
      multiple
      items={FRUITS}
      placeholder="Pick a few"
      aria-label="Fruits"
      label={(entry: (typeof FRUITS)[number]) => entry.name}
    />
  );
}

const fieldSet = css`
  width: 100%;
  max-width: 28rem;
  border: 0;
  margin: 0;
  padding: 0;
`;

export function FieldDemo() {
  return (
    <FieldSet class={fieldSet}>
      <FieldLegend>Delivery</FieldLegend>
      <FieldGroup>
        <Field>
          <FieldLabel for="street-demo">Street</FieldLabel>
          <Input id="street-demo" placeholder="12 Rue de Rivoli" />
          <FieldDescription>Where the parcel goes.</FieldDescription>
        </Field>
        {/* The label WRAPS the row, which is upstream's shape and the only one
            that names the control: `FieldTitle` is a div, here and there, so a
            checkbox beside one has no accessible name of its own. */}
        <FieldLabel for="receipts-demo">
          <Field orientation="horizontal">
            <Checkbox id="receipts-demo" />
            <FieldContent>
              <FieldTitle>Send receipts</FieldTitle>
              <FieldDescription>One email per payment.</FieldDescription>
            </FieldContent>
          </Field>
        </FieldLabel>
      </FieldGroup>
    </FieldSet>
  );
}

export function FieldStates() {
  return (
    <FieldSet class={fieldSet}>
      <FieldGroup>
        <Field isInvalid>
          <FieldLabel for="card-demo">Card</FieldLabel>
          <Input id="card-demo" aria-invalid="true" placeholder="4242 4242 4242 4242" />
          <FieldError errors={[{ message: "That card was declined." }]} />
        </Field>
        <FieldSeparator>or</FieldSeparator>
        <Field isDisabled>
          <FieldLabel for="vat-demo">VAT number</FieldLabel>
          <Input id="vat-demo" disabled placeholder="Business accounts only" />
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}

const group = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
`;

export function InputGroupDemo() {
  return (
    <InputGroup style={{ width: "100%", "max-width": "24rem" }}>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput aria-label="Search" placeholder="Search invoices" />
    </InputGroup>
  );
}

export function InputGroupAddons() {
  return (
    <div class={group}>
      <InputGroup>
        <InputGroupAddon>
          <AtSign />
        </InputGroupAddon>
        <InputGroupInput aria-label="Handle" placeholder="you" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>@example.com</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput aria-label="Token" value="sk-live-2f9a" readOnly />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Copy">
            <Copy />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput aria-label="Amount" aria-invalid="true" value="-4" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>EUR</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

export function InputOTPDemo() {
  return (
    <InputOTP maxLength={6}>
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  );
}

export function ToggleDemo() {
  return (
    <div class={row}>
      <Toggle aria-label="Bold">
        <Bold />
      </Toggle>
      <Toggle variant="outline" aria-label="Italic">
        <Italic />
      </Toggle>
    </div>
  );
}

export function ToggleGroupDemo() {
  return (
    <ToggleGroup type="multiple" variant="outline" aria-label="Format">
      <ToggleGroupItem value="bold" aria-label="Bold">
        <Bold />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Italic">
        <Italic />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Underline">
        <Underline />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function ToggleGroupSpaced() {
  return (
    <ToggleGroup spacing={2} aria-label="Align">
      <ToggleGroupItem value="left" aria-label="Left">
        L
      </ToggleGroupItem>
      <ToggleGroupItem value="centre" aria-label="Centre">
        C
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Right">
        R
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
