import { css } from "@barqjs/css";
import { Button, Input, Label, Popover, PopoverContent, PopoverTrigger } from "@barqjs/ui";

const panel = css`
  width: calc(var(--spacing) * 80);
`;

const stack = css`
  display: grid;
  gap: calc(var(--spacing) * 4);
`;

const heading = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
`;

const title = css`
  line-height: 1;
  font-weight: 500;
`;

const description = css`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

const fields = css`
  display: grid;
  gap: calc(var(--spacing) * 2);
`;

const row = css`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
  gap: calc(var(--spacing) * 4);
`;

const field = css`
  grid-column: span 2 / span 2;
  height: calc(var(--spacing) * 8);
`;

export default function PopoverDemo() {
  return (
    <Popover>
      <PopoverTrigger>
        <Button variant="outline">Open popover</Button>
      </PopoverTrigger>
      <PopoverContent class={panel}>
        <div class={stack}>
          <div class={heading}>
            <h4 class={title}>Dimensions</h4>
            <p class={description}>Set the dimensions for the layer.</p>
          </div>
          <div class={fields}>
            <div class={row}>
              <Label for="popover-demo-width">Width</Label>
              <Input id="popover-demo-width" defaultValue="100%" class={field} />
            </div>
            <div class={row}>
              <Label for="popover-demo-max-width">Max. width</Label>
              <Input id="popover-demo-max-width" defaultValue="300px" class={field} />
            </div>
            <div class={row}>
              <Label for="popover-demo-height">Height</Label>
              <Input id="popover-demo-height" defaultValue="25px" class={field} />
            </div>
            <div class={row}>
              <Label for="popover-demo-max-height">Max. height</Label>
              <Input id="popover-demo-max-height" defaultValue="none" class={field} />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
