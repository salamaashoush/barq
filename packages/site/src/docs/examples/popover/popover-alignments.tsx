import { css } from "@barqjs/css";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@barqjs/ui";

const row = css`
  display: flex;
  gap: calc(var(--spacing) * 6);
`;

const narrow = css`
  width: calc(var(--spacing) * 40);
`;

export default function PopoverAlignments() {
  return (
    <div class={row}>
      <Popover>
        <PopoverTrigger>
          <Button variant="outline" size="sm">
            Start
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" class={narrow}>
          Aligned to start
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger>
          <Button variant="outline" size="sm">
            Center
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" class={narrow}>
          Aligned to center
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger>
          <Button variant="outline" size="sm">
            End
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" class={narrow}>
          Aligned to end
        </PopoverContent>
      </Popover>
    </div>
  );
}
