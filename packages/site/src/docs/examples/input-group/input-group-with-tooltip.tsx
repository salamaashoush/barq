import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { Info } from "@barqjs/lucide/icons/info";
import { Star } from "@barqjs/lucide/icons/star";
import {
  ButtonGroup,
  ButtonGroupText,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "@barqjs/ui";

const round = css`
  border-radius: 9999px;
`;

const code = css`
  color: var(--muted-foreground);
  font-variant-numeric: tabular-nums;
`;

const codes = css`
  min-width: calc(var(--spacing) * 16);
`;

const scheme = css`
  padding-inline-start: calc(var(--spacing) * 1);
  color: var(--muted-foreground);
`;

export default function InputGroupWithTooltip() {
  const [country, setCountry] = createSignal("+1");

  return (
    <FieldGroup>
      <Field>
        <FieldLabel for="input-group-with-tooltip-tooltip">Tooltip</FieldLabel>
        <InputGroup>
          <InputGroupInput id="input-group-with-tooltip-tooltip" />
          <InputGroupAddon align="inline-end">
            <Tooltip>
              <TooltipTrigger>
                <InputGroupButton class={round} size="icon-xs" aria-label="Info">
                  <Info />
                </InputGroupButton>
              </TooltipTrigger>
              <TooltipContent>This is content in a tooltip.</TooltipContent>
            </Tooltip>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>This is a description of the input group.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel for="input-group-with-tooltip-dropdown">Dropdown</FieldLabel>
        <InputGroup>
          <InputGroupInput id="input-group-with-tooltip-dropdown" />
          <InputGroupAddon>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <InputGroupButton class={code} aria-label="Country code">
                  {country()} <ChevronDown />
                </InputGroupButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" class={codes} sideOffset={10} alignOffset={-8}>
                <DropdownMenuItem onSelect={() => setCountry("+1")}>+1</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setCountry("+44")}>+44</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setCountry("+46")}>+46</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>This is a description of the input group.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel for="input-group-with-tooltip-secure">Popover</FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <Popover>
              <PopoverTrigger>
                <InputGroupButton
                  variant="secondary"
                  size="icon-xs"
                  aria-label="Connection details"
                >
                  <Info />
                </InputGroupButton>
              </PopoverTrigger>
              <PopoverContent align="start">
                <PopoverHeader>
                  <PopoverTitle>Your connection is not secure.</PopoverTitle>
                  <PopoverDescription>
                    You should not enter any sensitive information on this site.
                  </PopoverDescription>
                </PopoverHeader>
              </PopoverContent>
            </Popover>
          </InputGroupAddon>
          <InputGroupAddon class={scheme}>https://</InputGroupAddon>
          <InputGroupInput id="input-group-with-tooltip-secure" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label="Favorite"
              onPress={() => {
                toast("Added to favorites");
              }}
            >
              <Star />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>This is a description of the input group.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel for="input-group-with-tooltip-url">Button Group</FieldLabel>
        <ButtonGroup>
          <ButtonGroupText>https://</ButtonGroupText>
          <InputGroup>
            <InputGroupInput id="input-group-with-tooltip-url" />
            <InputGroupAddon align="inline-end">
              <Info />
            </InputGroupAddon>
          </InputGroup>
          <ButtonGroupText>.com</ButtonGroupText>
        </ButtonGroup>
        <FieldDescription>This is a description of the input group.</FieldDescription>
      </Field>
    </FieldGroup>
  );
}
