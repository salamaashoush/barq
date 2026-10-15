import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@barqjs/ui";

const SIDES = ["left", "top", "bottom", "right"] as const;

const row = css`
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--spacing) * 2);
`;

const label = css`
  width: fit-content;
  text-transform: capitalize;
`;

export default function TooltipSides() {
  return (
    <div class={row}>
      <For each={SIDES}>
        {(side: (typeof SIDES)[number]) => (
          <Tooltip>
            <TooltipTrigger>
              <Button variant="outline" class={label}>
                {side}
              </Button>
            </TooltipTrigger>
            <TooltipContent side={side}>
              <p>Add to library</p>
            </TooltipContent>
          </Tooltip>
        )}
      </For>
    </div>
  );
}
