import { css } from "@barqjs/css";
import { Button, HoverCard, HoverCardContent, HoverCardTrigger } from "@barqjs/ui";

const card = css`
  display: flex;
  width: calc(var(--spacing) * 64);
  flex-direction: column;
  gap: calc(var(--spacing) * 0.5);
`;

const handle = css`
  font-weight: 600;
`;

const joined = css`
  margin-top: calc(var(--spacing) * 1);
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--muted-foreground);
`;

export default function HoverCardDemo() {
  return (
    <HoverCard openDelay={10} closeDelay={100}>
      <HoverCardTrigger>
        <Button variant="link">Hover Here</Button>
      </HoverCardTrigger>
      <HoverCardContent class={card}>
        <div class={handle}>@acme</div>
        <div>The component library, created and maintained by Acme Inc.</div>
        <div class={joined}>Joined December 2021</div>
      </HoverCardContent>
    </HoverCard>
  );
}
