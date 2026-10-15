import { css } from "@barqjs/css";
import { ShieldAlert } from "@barqjs/lucide/icons/shield-alert";
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
  max-width: 32rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 6);
`;

export default function ItemIcon() {
  return (
    <div class={stack}>
      <Item variant="outline">
        <ItemMedia variant="icon">
          <ShieldAlert />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Security Alert</ItemTitle>
          <ItemDescription>New login detected from unknown device.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button size="sm" variant="outline">
            Review
          </Button>
        </ItemActions>
      </Item>
    </div>
  );
}
