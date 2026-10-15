import { css } from "@barqjs/css";
import { BadgeCheck } from "@barqjs/lucide/icons/badge-check";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import {
  Button,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@barqjs/ui";

const stack = css`
  display: flex;
  width: 100%;
  max-width: 28rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 6);
`;

export default function ItemDemo() {
  return (
    <div class={stack}>
      <Item variant="outline">
        <ItemContent>
          <ItemTitle>Basic Item</ItemTitle>
          <ItemDescription>A simple item with title and description.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button variant="outline" size="sm">
            Action
          </Button>
        </ItemActions>
      </Item>
      <Item variant="outline" size="sm" href="#">
        <ItemMedia>
          <BadgeCheck size={20} />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Your profile has been verified.</ItemTitle>
        </ItemContent>
        <ItemActions>
          <ChevronRight size={16} />
        </ItemActions>
      </Item>
    </div>
  );
}
