import { css } from "@barqjs/css";
import { ArrowUpRight } from "@barqjs/lucide/icons/arrow-up-right";
import { Button } from "@barqjs/ui";

const sizes = css`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: calc(var(--spacing) * 8);

  @media (min-width: 40rem) {
    flex-direction: row;
  }
`;

const pair = css`
  display: flex;
  align-items: flex-start;
  gap: calc(var(--spacing) * 2);
`;

export default function ButtonSize() {
  return (
    <div class={sizes}>
      <div class={pair}>
        <Button size="xs" variant="outline">
          Extra Small
        </Button>
        <Button size="icon-xs" aria-label="Submit" variant="outline">
          <ArrowUpRight />
        </Button>
      </div>
      <div class={pair}>
        <Button size="sm" variant="outline">
          Small
        </Button>
        <Button size="icon-sm" aria-label="Submit" variant="outline">
          <ArrowUpRight />
        </Button>
      </div>
      <div class={pair}>
        <Button variant="outline">Default</Button>
        <Button size="icon" aria-label="Submit" variant="outline">
          <ArrowUpRight />
        </Button>
      </div>
      <div class={pair}>
        <Button variant="outline" size="lg">
          Large
        </Button>
        <Button size="icon-lg" aria-label="Submit" variant="outline">
          <ArrowUpRight />
        </Button>
      </div>
    </div>
  );
}
