import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Button, HoverCard, HoverCardContent, HoverCardTrigger } from "@barqjs/ui";

const HOVER_CARD_SIDES = ["left", "top", "bottom", "right"] as const;

const row = css`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: calc(var(--spacing) * 2);
`;

const capital = css`
  text-transform: capitalize;
`;

const stack = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 1);
`;

const title = css`
  font-weight: 500;
`;

export default function HoverCardSides() {
  return (
    <div class={row}>
      <For each={HOVER_CARD_SIDES}>
        {(side: (typeof HOVER_CARD_SIDES)[number]) => (
          <HoverCard openDelay={100} closeDelay={100}>
            <HoverCardTrigger>
              <Button variant="outline" class={capital}>
                {side}
              </Button>
            </HoverCardTrigger>
            <HoverCardContent side={side}>
              <div class={stack}>
                <h4 class={title}>Hover Card</h4>
                <p>This hover card appears on the {side} side of the trigger.</p>
              </div>
            </HoverCardContent>
          </HoverCard>
        )}
      </For>
    </div>
  );
}
