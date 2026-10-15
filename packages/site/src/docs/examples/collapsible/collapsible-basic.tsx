import { css } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import {
  Button,
  Card,
  CardContent,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@barqjs/ui";

const card = css`
  margin-inline: auto;
  width: 100%;
  max-width: 24rem;
`;

const panel = css`
  border-radius: calc(var(--radius) - 2px);

  &[data-state="open"] {
    background-color: var(--muted);
  }
`;

const trigger = css`
  width: 100%;

  & svg {
    margin-inline-start: auto;
  }

  &[data-state="open"] svg {
    rotate: 180deg;
  }
`;

const body = css`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: calc(var(--spacing) * 2);
  padding: 0 calc(var(--spacing) * 2.5) calc(var(--spacing) * 2.5);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

export default function CollapsibleBasic() {
  return (
    <Card class={card}>
      <CardContent>
        <Collapsible class={panel}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" class={trigger}>
              Product details
              <ChevronDown />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent class={body}>
            <div>This panel can be expanded or collapsed to reveal additional content.</div>
            <Button size="xs">Learn More</Button>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
