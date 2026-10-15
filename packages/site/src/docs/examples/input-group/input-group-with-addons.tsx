import { css } from "@barqjs/css";
import { Copy } from "@barqjs/lucide/icons/copy";
import { EyeOff } from "@barqjs/lucide/icons/eye-off";
import { Info } from "@barqjs/lucide/icons/info";
import { Mic } from "@barqjs/lucide/icons/mic";
import { Radio } from "@barqjs/lucide/icons/radio";
import { Search } from "@barqjs/lucide/icons/search";
import { Star } from "@barqjs/lucide/icons/star";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  toast,
} from "@barqjs/ui";

const tall = css`
  height: auto;
`;

const muted = css`
  color: var(--muted-foreground);
`;

const trailing = css`
  margin-inline-start: auto;
  color: var(--muted-foreground);
`;

const live = css`
  color: oklch(63.7% 0.237 25.331);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;

  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }
`;

export default function InputGroupWithAddons() {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel for="input-group-with-addons-start">Addon (inline-start)</FieldLabel>
        <InputGroup>
          <InputGroupInput id="input-group-with-addons-start" />
          <InputGroupAddon>
            <Search class={muted} />
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel for="input-group-with-addons-end">Addon (inline-end)</FieldLabel>
        <InputGroup>
          <InputGroupInput id="input-group-with-addons-end" />
          <InputGroupAddon align="inline-end">
            <EyeOff />
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel for="input-group-with-addons-both">
          Addon (inline-start and inline-end)
        </FieldLabel>
        <InputGroup>
          <InputGroupInput id="input-group-with-addons-both" />
          <InputGroupAddon>
            <Mic class={muted} />
          </InputGroupAddon>
          <InputGroupAddon align="inline-end">
            <Radio class={live} />
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel for="input-group-with-addons-block-start">Addon (block-start)</FieldLabel>
        <InputGroup class={tall}>
          <InputGroupInput id="input-group-with-addons-block-start" />
          <InputGroupAddon align="block-start">
            <InputGroupText>First Name</InputGroupText>
            <Info class={trailing} />
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel for="input-group-with-addons-block-end">Addon (block-end)</FieldLabel>
        <InputGroup class={tall}>
          <InputGroupInput id="input-group-with-addons-block-end" />
          <InputGroupAddon align="block-end">
            <InputGroupText>20/240 characters</InputGroupText>
            <Info class={trailing} />
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel for="input-group-with-addons-multiple">Multiple Icons</FieldLabel>
        <InputGroup>
          <InputGroupInput id="input-group-with-addons-multiple" />
          <InputGroupAddon align="inline-end">
            <Star />
            <InputGroupButton
              size="icon-xs"
              aria-label="Copy"
              onPress={() => {
                toast("Copied to clipboard");
              }}
            >
              <Copy />
            </InputGroupButton>
          </InputGroupAddon>
          <InputGroupAddon>
            <Radio class={live} />
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel for="input-group-with-addons-description">Description</FieldLabel>
        <InputGroup>
          <InputGroupInput id="input-group-with-addons-description" />
          <InputGroupAddon align="inline-end">
            <Info />
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>This is a description of the input group.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel for="input-group-with-addons-label">Label</FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <FieldLabel for="input-group-with-addons-label">Label</FieldLabel>
          </InputGroupAddon>
          <InputGroupInput id="input-group-with-addons-label" />
        </InputGroup>
        <InputGroup>
          <InputGroupInput id="input-group-with-addons-optional" aria-label="Optional" />
          <InputGroupAddon align="inline-end">
            <InputGroupText>(optional)</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </Field>
    </FieldGroup>
  );
}
