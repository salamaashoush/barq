import { createSignal, For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ArrowRight } from "@barqjs/lucide/icons/arrow-right";
import {
  Button,
  ButtonGroup,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@barqjs/ui";

const mono = css`
  font-family: var(--font-mono);
`;

const list = css`
  min-width: calc(var(--spacing) * 24);
`;

const muted = css`
  color: var(--muted-foreground);
`;

interface Currency {
  readonly value: string;
  readonly label: string;
}

const currencies: readonly Currency[] = [
  { value: "$", label: "US Dollar" },
  { value: "€", label: "Euro" },
  { value: "£", label: "British Pound" },
];

export default function ButtonGroupSelect() {
  const [currency, setCurrency] = createSignal("$");

  return (
    <ButtonGroup>
      <ButtonGroup>
        <Select value={currency()} onValueChange={setCurrency}>
          <SelectTrigger class={mono} aria-label="Currency">
            {currency()}
          </SelectTrigger>
          <SelectContent class={list}>
            <SelectGroup>
              <For each={() => currencies}>
                {(entry: Currency) => (
                  <SelectItem value={entry.value}>
                    {entry.value} <span class={muted}>{entry.label}</span>
                  </SelectItem>
                )}
              </For>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Input placeholder="10.00" pattern="[0-9]*" aria-label="Amount" />
      </ButtonGroup>
      <ButtonGroup>
        <Button aria-label="Send" size="icon" variant="outline">
          <ArrowRight />
        </Button>
      </ButtonGroup>
    </ButtonGroup>
  );
}
