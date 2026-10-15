import { css } from "@barqjs/css";
import { Check } from "@barqjs/lucide/icons/check";
import { Info } from "@barqjs/lucide/icons/info";
import { Search } from "@barqjs/lucide/icons/search";
import { Sparkles } from "@barqjs/lucide/icons/sparkles";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Kbd,
  KbdGroup,
  Spinner,
} from "@barqjs/ui";

const badge = css`
  display: flex;
  width: calc(var(--spacing) * 4);
  height: calc(var(--spacing) * 4);
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background-color: oklch(72.3% 0.219 149.579);

  .dark & {
    background-color: oklch(44.8% 0.119 151.328);
  }
`;

const tick = css`
  width: calc(var(--spacing) * 3);
  height: calc(var(--spacing) * 3);
  color: white;
`;

const available = css`
  color: oklch(52.7% 0.154 150.069);
`;

const columns = css`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: calc(var(--spacing) * 4);
`;

export default function InputGroupWithKbd() {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel for="input-group-with-kbd-start">Input Group with Kbd</FieldLabel>
        <InputGroup>
          <InputGroupInput id="input-group-with-kbd-start" />
          <InputGroupAddon>
            <Kbd>⌘K</Kbd>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupInput id="input-group-with-kbd-end" aria-label="Shortcut at the end" />
          <InputGroupAddon align="inline-end">
            <Kbd>⌘K</Kbd>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupInput
            id="input-group-with-kbd-apps"
            aria-label="Search for apps"
            placeholder="Search for Apps..."
          />
          <InputGroupAddon align="inline-end">Ask AI</InputGroupAddon>
          <InputGroupAddon align="inline-end">
            <Kbd>Tab</Kbd>
          </InputGroupAddon>
        </InputGroup>
        <InputGroup>
          <InputGroupInput
            id="input-group-with-kbd-type"
            aria-label="Search"
            placeholder="Type to search..."
          />
          <InputGroupAddon align="inline-start">
            <Sparkles />
          </InputGroupAddon>
          <InputGroupAddon align="inline-end">
            <KbdGroup>
              <Kbd>Ctrl</Kbd>
              <Kbd>C</Kbd>
            </KbdGroup>
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel for="input-group-with-kbd-username">Username</FieldLabel>
        <InputGroup>
          <InputGroupInput id="input-group-with-kbd-username" defaultValue="salama" />
          <InputGroupAddon align="inline-end">
            <div class={badge}>
              <Check class={tick} />
            </div>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription class={available}>This username is available.</FieldDescription>
      </Field>
      <InputGroup>
        <InputGroupInput
          id="input-group-with-kbd-docs"
          aria-label="Search documentation"
          placeholder="Search documentation..."
        />
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupAddon align="inline-end">12 results</InputGroupAddon>
      </InputGroup>
      <InputGroup isDisabled>
        <InputGroupInput
          id="input-group-with-kbd-disabled"
          aria-label="Search documentation, disabled"
          placeholder="Search documentation..."
          disabled
        />
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupAddon align="inline-end">Disabled</InputGroupAddon>
      </InputGroup>
      <FieldGroup class={columns}>
        <Field>
          <FieldLabel for="input-group-with-kbd-first">First Name</FieldLabel>
          <InputGroup>
            <InputGroupInput id="input-group-with-kbd-first" placeholder="First Name" />
            <InputGroupAddon align="inline-end">
              <Info />
            </InputGroupAddon>
          </InputGroup>
        </Field>
        <Field>
          <FieldLabel for="input-group-with-kbd-last">Last Name</FieldLabel>
          <InputGroup>
            <InputGroupInput id="input-group-with-kbd-last" placeholder="Last Name" />
            <InputGroupAddon align="inline-end">
              <Info />
            </InputGroupAddon>
          </InputGroup>
        </Field>
      </FieldGroup>
      <Field isDisabled>
        <FieldLabel for="input-group-with-kbd-loading">Loading ("data-disabled="true")</FieldLabel>
        <InputGroup>
          <InputGroupInput id="input-group-with-kbd-loading" disabled defaultValue="salama" />
          <InputGroupAddon align="inline-end">
            <Spinner />
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>This is a description of the input group.</FieldDescription>
      </Field>
    </FieldGroup>
  );
}
