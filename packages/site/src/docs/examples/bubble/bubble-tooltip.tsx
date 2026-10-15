import { css } from "@barqjs/css";
import { Check } from "@barqjs/lucide/icons/check";
import {
  Bubble,
  BubbleContent,
  BubbleReactions,
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
  padding-block: calc(var(--spacing) * 12);
`;

export default function BubbleTooltip() {
  return (
    <TooltipProvider>
      <div class={frame}>
        <Bubble variant="secondary">
          <BubbleContent>Did you remove the stale route?</BubbleContent>
        </Bubble>
        <Bubble align="end">
          <BubbleContent>Yes, removed it from the registry.</BubbleContent>
          <BubbleReactions>
            <Tooltip>
              <TooltipTrigger>
                <Button variant="ghost" size="icon-xs" aria-label="Read receipt">
                  <Check />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Read on Jan 5, 2026 at 4:32 PM</TooltipContent>
            </Tooltip>
          </BubbleReactions>
        </Bubble>
      </div>
    </TooltipProvider>
  );
}
