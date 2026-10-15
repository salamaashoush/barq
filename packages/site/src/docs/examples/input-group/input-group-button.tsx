import { createSignal, Show } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Check } from "@barqjs/lucide/icons/check";
import { Copy } from "@barqjs/lucide/icons/copy";
import { Info } from "@barqjs/lucide/icons/info";
import { Star } from "@barqjs/lucide/icons/star";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@barqjs/ui";

const frame = css`
  display: grid;
  width: 100%;
  max-width: 24rem;
  gap: calc(var(--spacing) * 6);
`;

const pill = css`
  --radius: 9999px;
`;

const panel = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 1);
  border-radius: var(--radius-xl);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const strong = css`
  font-weight: 500;
`;

const scheme = css`
  padding-inline-start: calc(var(--spacing) * 1.5);
  color: var(--muted-foreground);
`;

const favorite = css`
  fill: oklch(54.6% 0.245 262.881);
  stroke: oklch(54.6% 0.245 262.881);
`;

export default function InputGroupButtonExample() {
  const [isCopied, setIsCopied] = createSignal(false);
  const [isFavorite, setIsFavorite] = createSignal(false);

  const copy = (): void => {
    void navigator.clipboard.writeText("https://example.com/salama").then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  return (
    <div class={frame}>
      <InputGroup>
        <InputGroupInput
          aria-label="Profile link"
          placeholder="https://example.com/salama"
          readOnly
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton aria-label="Copy" title="Copy" size="icon-xs" onPress={copy}>
            <Show when={isCopied()} fallback={<Copy />}>
              <Check />
            </Show>
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup class={pill}>
        <InputGroupAddon>
          <Popover>
            <PopoverTrigger>
              <InputGroupButton variant="secondary" size="icon-xs" aria-label="Connection details">
                <Info />
              </InputGroupButton>
            </PopoverTrigger>
            <PopoverContent align="start" class={panel}>
              <p class={strong}>Your connection is not secure.</p>
              <p>You should not enter any sensitive information on this site.</p>
            </PopoverContent>
          </Popover>
        </InputGroupAddon>
        <InputGroupAddon class={scheme}>https://</InputGroupAddon>
        <InputGroupInput id="input-group-button-secure" aria-label="Address" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label="Favorite"
            aria-pressed={isFavorite()}
            onPress={() => setIsFavorite(!isFavorite())}
          >
            <Star class={isFavorite() ? favorite : undefined} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput aria-label="Search" placeholder="Type to search..." />
        <InputGroupAddon align="inline-end">
          <InputGroupButton variant="secondary">Search</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
