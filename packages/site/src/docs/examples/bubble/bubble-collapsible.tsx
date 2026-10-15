import { createSignal, Show } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { Bubble, BubbleContent, Button, Collapsible, CollapsibleTrigger } from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 8);
  padding-block: calc(var(--spacing) * 12);
`;

const body = css`
  white-space: pre-line;
`;

const toggle = css`
  gap: var(--spacing);
  padding: 0;
  color: var(--muted-foreground);
`;

const chevron = css`
  [data-state="open"] > & {
    transform: rotate(180deg);
  }
`;

const text = `The accessibility review found two focus states that were visually too subtle in dark mode.

I checked the dialog, menu, and drawer paths because each one renders focusable controls inside a layered surface.

The dialog and drawer are fine. The menu needs the hover and focus tokens split so keyboard focus stays visible when the pointer is not involved.

I also recommend keeping the change in the style file instead of the primitive so the other themes can choose their own focus treatment later.`;

const previewLength = 180;

export default function BubbleCollapsible() {
  const [open, setOpen] = createSignal(false);
  const isLong = text.length > previewLength;
  const preview = `${text.slice(0, previewLength)}...`;

  return (
    <div class={frame}>
      <Bubble variant="muted">
        <BubbleContent>How can I help you today?</BubbleContent>
      </Bubble>

      <Bubble variant="muted" align="end">
        <BubbleContent class={body}>
          <Collapsible open={open()} onOpenChange={setOpen}>
            <div>{() => (open() || !isLong ? text : preview)}</div>
            <Show when={isLong}>
              <CollapsibleTrigger asChild>
                <Button variant="link" class={toggle}>
                  {() => (open() ? "Show less" : "Show more")}
                  <ChevronDown data-icon="inline-end" class={chevron} />
                </Button>
              </CollapsibleTrigger>
            </Show>
          </Collapsible>
        </BubbleContent>
      </Bubble>
    </div>
  );
}
