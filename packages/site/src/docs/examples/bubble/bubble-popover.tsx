import { css } from "@barqjs/css";
import { Info } from "@barqjs/lucide/icons/info";
import {
  Bubble,
  BubbleContent,
  BubbleReactions,
  Button,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@barqjs/ui";

const frame = css`
  display: flex;
  width: 100%;
  max-width: 24rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
  padding-block: calc(var(--spacing) * 12);
`;

const details = css`
  &[aria-expanded="true"] {
    color: var(--destructive);
  }
`;

const small = css`
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

export default function BubblePopover() {
  return (
    <div class={frame}>
      <Bubble align="end">
        <BubbleContent>Run the build script.</BubbleContent>
      </Bubble>
      <Bubble variant="destructive">
        <BubbleContent>Failed to run the command.</BubbleContent>
        <BubbleReactions>
          <Popover>
            <PopoverTrigger>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Show error details"
                class={details}
              >
                <Info />
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <PopoverHeader>
                <PopoverTitle class={small}>Command failed with exit code 1</PopoverTitle>
                <PopoverDescription class={small}>
                  ENOENT: no such file or directory, open pnpm-lock.yaml
                </PopoverDescription>
              </PopoverHeader>
            </PopoverContent>
          </Popover>
        </BubbleReactions>
      </Bubble>
    </div>
  );
}
