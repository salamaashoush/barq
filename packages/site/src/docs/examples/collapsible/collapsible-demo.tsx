import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ChevronsUpDown } from "@barqjs/lucide/icons/chevrons-up-down";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 350px;
  max-width: 100%;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
`;

const head = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--spacing) * 4);
  padding-inline: calc(var(--spacing) * 4);
`;

const title = css`
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 600;
`;

const toggle = css`
  width: calc(var(--spacing) * 8);
  height: calc(var(--spacing) * 8);
`;

const row = css`
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) - 2px);
  padding: calc(var(--spacing) * 2) calc(var(--spacing) * 4);
  font-size: 0.875rem;
  line-height: 1.25rem;

  & p {
    margin: 0;
  }
`;

const status = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const rest = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
`;

const strong = css`
  font-weight: 500;
`;

const muted = css`
  color: var(--muted-foreground);
`;

export default function CollapsibleDemo() {
  const [isOpen, setIsOpen] = createSignal(false);

  return (
    <Collapsible open={isOpen()} onOpenChange={setIsOpen} class={frame}>
      <div class={head}>
        <h4 class={title}>Order #4189</h4>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon" class={toggle} aria-label="Toggle details">
            <ChevronsUpDown />
          </Button>
        </CollapsibleTrigger>
      </div>
      <div class={`${row} ${status}`}>
        <span class={muted}>Status</span>
        <span class={strong}>Shipped</span>
      </div>
      <CollapsibleContent class={rest}>
        <div class={row}>
          <p class={strong}>Shipping address</p>
          <p class={muted}>100 Market St, San Francisco</p>
        </div>
        <div class={row}>
          <p class={strong}>Items</p>
          <p class={muted}>2x Studio Headphones</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
